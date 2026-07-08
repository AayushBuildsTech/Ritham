// Edge Function: chat
// The ONLY place that calls the Claude API (non-negotiable rule: AI is never
// called from the client). Flow:
//   1. Authenticate the user from the JWT.
//   2. Load their profile + cached Kundli (must belong to them).
//   3. Start or continue a chat session, enforcing the free-1-minute entitlement
//      (one per verified phone number) and the 60s countdown.
//   4. Build a system prompt anchoring the astrologer to the chart facts.
//   5. Call Claude Sonnet 5 (AI narrates facts, never computes them — rule #2).
//   6. Persist both messages and return the reply + session timing.
//
// If ANTHROPIC_API_KEY is not set, a deterministic MOCK reply is returned so the
// whole flow works before billing is wired up. Setting the secret is the only
// change needed to go live — see PROGRESS.md.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = 'claude-sonnet-5';
const FREE_SECONDS = 60;
const MAX_MESSAGE_CHARS = 2000; // cost/abuse guardrail on a single chat message
const CHAT_HISTORY_MAX = 20;    // only send the tail of the conversation to Claude

// The astrologer's opening greeting — the first message of every new chat. Kept
// server-side (single source of truth) and referenced in the system prompt below.
// Leads in a warm, predominantly-Hindi jyotishi voice (romanised) and mentions the
// language freedom exactly once, subtly. The client fetches this to display; app UI
// stays English.
const GREETING =
  'Namaste 🙏 Main aapka jyotishi hoon. Aapki kundli dekh kar main aapke ' +
  'sawaalon ka jawab dunga. Aap mujhse Hindi ya English — jaise aapko theek lage — ' +
  'baat kar sakte hain. Bataiye, aaj kya jaanna chahte hain?';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // user-scoped client (to resolve auth.uid from the JWT)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    // service client for privileged reads/writes (bypasses RLS)
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    // Lightweight: the client fetches the astrologer's opening greeting to show as
    // the first message on a new chat (no session, entitlement, or Claude call).
    if (body?.greetingOnly) return json({ greeting: GREETING });
    const { profileId, message, sessionId, useKind } = body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return json({ error: 'empty_message' }, 400);
    }
    if (message.length > MAX_MESSAGE_CHARS) return json({ error: 'message_too_long' }, 400);
    if (!profileId) return json({ error: 'missing_profile' }, 400);

    // profile must belong to this user, and have a computed Kundli
    const { data: profile } = await admin
      .from('profiles').select('*')
      .eq('id', profileId).eq('user_id', user.id).maybeSingle();
    if (!profile) return json({ error: 'profile_not_found' }, 404);
    if (!profile.kundli_chart) return json({ error: 'kundli_missing' }, 400);

    // ── resolve or create the session ──────────────────────────────────────
    // Session kinds:
    //   free_minute / paid_time  → time-based (60s / pack duration); no per-msg cost
    //   paid_questions           → each user message consumes one question
    let session;
    if (sessionId) {
      const { data: s } = await admin
        .from('chat_sessions').select('*')
        .eq('id', sessionId).eq('user_id', user.id).maybeSingle();
      if (!s) return json({ error: 'session_not_found' }, 404);
      if (s.status === 'ended') return json({ expired: true });
      if (s.expires_at && new Date(s.expires_at).getTime() <= Date.now()) {
        await admin.from('chat_sessions').update({ status: 'ended' }).eq('id', s.id);
        return json({ expired: true });
      }
      session = s;
    } else {
      // Atomically CLAIM the free minute (rule #5: one per verified phone). The
      // conditional update (free_minute_used_at IS NULL) means two concurrent
      // first-requests can't both be granted a free session.
      const { data: claimedFree } = await admin
        .from('users')
        .update({ free_minute_used_at: new Date().toISOString() })
        .eq('id', user.id).is('free_minute_used_at', null)
        .select('id').maybeSingle();

      if (claimedFree) {
        // free 1-minute session
        const expiresAt = new Date(Date.now() + FREE_SECONDS * 1000).toISOString();
        const { data: created, error: cErr } = await admin
          .from('chat_sessions')
          .insert({ user_id: user.id, profile_id: profileId, kind: 'free_minute', expires_at: expiresAt })
          .select().single();
        if (cErr) {
          // roll the claim back so a transient error doesn't burn the user's free minute
          await admin.from('users').update({ free_minute_used_at: null }).eq('id', user.id);
          return json({ error: 'session_create_failed', detail: cErr.message }, 500);
        }
        session = created;
      } else {
        // free minute already used → paid path backed by an entitlement (Phase 4)
        session = await startPaidSession(admin, user.id, profileId, useKind);
        if (!session) return json({ error: 'needs_purchase' }); // client opens the paywall
      }
    }

    // paid question sessions charge one question per user message — check first
    let questionEnt: any = null;
    if (session.kind === 'paid_questions') {
      questionEnt = await pickActiveQuestionEntitlement(admin, user.id);
      if (!questionEnt) return json({ error: 'out_of_questions', session: sessionInfo(session) });
    }

    // store the user's message
    await admin.from('chat_messages').insert({ session_id: session.id, role: 'user', content: message.trim() });

    // load conversation so far (for context)
    const { data: history } = await admin
      .from('chat_messages').select('role, content')
      .eq('session_id', session.id).order('created_at', { ascending: true });

    // Cost guardrail: only send the tail of the conversation to Claude, and ensure
    // it begins on a user turn (the API rejects a leading assistant message).
    let recent = (history ?? []).slice(-CHAT_HISTORY_MAX);
    while (recent.length && recent[0].role !== 'user') recent = recent.slice(1);

    const reply = await generateReply(profile, recent);

    await admin.from('chat_messages').insert({ session_id: session.id, role: 'assistant', content: reply });

    // consume one question AFTER a successful reply
    if (questionEnt) {
      const remaining = questionEnt.questions_remaining - 1;
      await admin.from('entitlements_ledger')
        .update({ questions_remaining: remaining, consumed_at: remaining <= 0 ? new Date().toISOString() : null })
        .eq('id', questionEnt.id);
    }

    const balance = await computeBalance(admin, user.id);
    return json({ reply, session: sessionInfo(session), balance });
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as Error)?.message ?? e) }, 500);
  }
});

// ── entitlement helpers (Phase 4) ──────────────────────────────────────────────

// Start a paid session once the free minute is gone. Prefers the kind the client
// asked for (useKind); otherwise time packs first, then question packs. A time
// pack is consumed WHOLE into a countdown session; a question pack backs a
// message-metered session and is decremented per reply.
async function startPaidSession(admin: any, userId: string, profileId: string, useKind?: string) {
  const wantTime = useKind === 'time';
  const wantQuestions = useKind === 'questions';

  // try a time pack (unless the client explicitly asked for questions)
  if (!wantQuestions) {
    const { data: t } = await admin
      .from('entitlements_ledger').select('*')
      .eq('user_id', userId).eq('kind', 'time').is('consumed_at', null)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (t) {
      const expiresAt = new Date(Date.now() + t.seconds_total * 1000).toISOString();
      const { data: created } = await admin
        .from('chat_sessions')
        .insert({ user_id: userId, profile_id: profileId, kind: 'paid_time', expires_at: expiresAt })
        .select().single();
      await admin.from('entitlements_ledger')
        .update({ consumed_at: new Date().toISOString() }).eq('id', t.id);
      return created;
    }
    if (wantTime) return null; // asked for time, none left
  }

  // fall back to a question pack
  const q = await pickActiveQuestionEntitlement(admin, userId);
  if (q) {
    const { data: created } = await admin
      .from('chat_sessions')
      .insert({ user_id: userId, profile_id: profileId, kind: 'paid_questions' })
      .select().single();
    return created;
  }
  return null;
}

async function pickActiveQuestionEntitlement(admin: any, userId: string) {
  const { data } = await admin
    .from('entitlements_ledger').select('*')
    .eq('user_id', userId).eq('kind', 'questions').is('consumed_at', null)
    .gt('questions_remaining', 0)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data ?? null;
}

async function computeBalance(admin: any, userId: string) {
  const { data } = await admin
    .from('entitlements_ledger')
    .select('kind, questions_remaining, seconds_total, consumed_at')
    .eq('user_id', userId);
  let questions = 0, seconds = 0;
  for (const r of data ?? []) {
    if (r.consumed_at) continue;
    if (r.kind === 'questions') questions += r.questions_remaining;
    if (r.kind === 'time') seconds += r.seconds_total;
  }
  return { questions, seconds };
}

function sessionInfo(s: any) {
  return { id: s.id, kind: s.kind, expires_at: s.expires_at ?? null };
}

// ── system prompt: anchor the astrologer to the chart facts ────────────────────
function buildSystemPrompt(profile: any): string {
  const k = profile.kundli_chart;
  const placements = (k.placements ?? [])
    .map((p: any) => `${p.graha} in ${p.sign} (house ${p.house})`)
    .join('; ');
  return [
    `You are Ritham, a warm, wise Vedic astrologer (jyotishi) speaking with ${profile.name}.`,
    `Speak with calm, respectful, encouraging warmth — never kitschy, never fear-mongering.`,
    ``,
    `${profile.name}'s birth chart (use ONLY these facts; never invent placements or scores):`,
    `- Ascendant (Lagna): ${k.lagna}`,
    `- Moon sign (Rashi): ${k.moon_sign}`,
    `- Sun sign: ${k.sun_sign}`,
    `- Nakshatra: ${k.nakshatra}`,
    `- Planetary positions: ${placements}`,
    ``,
    `Rules:`,
    `- Narrate and interpret these placements; do NOT compute new astrological data or claim precise predictions.`,
    `- This is a live one-on-one chat, NOT a written report. Reply the way a warm jyotishi would actually speak in conversation — short and to the point.`,
    `- Default to 2–4 sentences. Answer the actual question first, in plain language. Only write more if the user explicitly asks you to explain in detail, and even then keep it to one short paragraph.`,
    `- No preamble, no restating their question, no disclaimers, no sign-offs. Do NOT use headings, bullet points, or numbered lists — write in natural flowing sentences.`,
    `- Be specific to their chart, but weave the one or two most relevant placements into the answer rather than listing all of them.`,
    `- You may discuss career, relationships, timing, temperament, remedies (gemstones, mantras, charity) in a Vedic frame.`,
    `- Never give medical, legal, or guaranteed financial advice; suggest professionals for those.`,
    ``,
    `Language — DEFAULT IS HINDI; reply in English ONLY when the user writes in English:`,
    `- You have already greeted the user with: "${GREETING}" — do NOT repeat it or re-introduce yourself; answer their question directly and warmly.`,
    `- DEFAULT to Hindi. Unless the user's latest message is clearly written in English, reply in NATURAL, PREDOMINANTLY HINDI written in romanised (Latin) script — NOT Devanagari. This is the default for Hindi, romanised Hindi, AND any Hindi-and-English mix — all of these get a Hindi reply. Speak the way a warm Indian jyotishi actually talks: Hindi sentence structure and flow, Hindi-first. Reach for an English word ONLY when it is one Hindi speakers naturally say in English anyway (e.g. "job", "career", "problem", "time", "market", "business") or a term with no natural Hindi equivalent. Do NOT pepper the reply with unnecessary English words, connectors, or whole English phrases.`,
    `  RIGHT tone (default Hindi, romanised — write like this): "Namaste 🙏 Aapki kundli dekh kar bata raha hoon — is samay aap par Shani ki dasha chal rahi hai. Thoda dhairya rakhiye, aane wale mahine behtar rahenge. Aap chahein to koi vishesh sawaal pooch sakte hain."`,
    `  WRONG (too much English — NEVER write like this): "Aapki kundli mein currently Shani ki dasha chal rahi hai jo aapki life ke is phase ko affect kar rahi hai."`,
    `- ENGLISH ONLY WHEN THEY DO: if the user writes their message in English, reply FULLY in clean, natural English and keep conversing in English for as long as they keep writing in English — no forced Hindi words. The moment they switch back to Hindi or a Hindi-English mix, switch straight back to Hindi.`,
    `- If the user writes in Devanagari Hindi, reply in Devanagari Hindi.`,
    `- Never comment on the user's language choice or announce a switch — just answer in the right language. Match how formal or casual they are.`,
    `- In EVERY language, keep authentic Jyotisha terms in their original form — kundli, rashi, graha, dasha, nakshatra, lagna, gochar, Shani, Mangal, Guru, Rahu, Ketu, and similar. Never translate these into English equivalents.`,
    `- Maintain a warm, respectful, traditional tone throughout — like a wise family astrologer who knows this person's chart.`,
  ].join('\n');
}

async function generateReply(profile: any, history: { role: string; content: string }[]): Promise<string> {
  // MOCK fallback until the API key is set (swap point → real Claude below).
  if (!ANTHROPIC_API_KEY) {
    const last = history.filter((m) => m.role === 'user').slice(-1)[0]?.content ?? '';
    const k = profile.kundli_chart;
    return (
      `🌙 (Preview reply — real AI activates once the Claude API key is set.)\n\n` +
      `${profile.name}, with your Moon in ${k.moon_sign} and ${k.lagna} rising, your question — ` +
      `"${last}" — touches on themes your chart speaks to. Once live, Ritham will give you a full ` +
      `personalised reading anchored to your Nakshatra (${k.nakshatra}) and planetary placements.`
    );
  }

  const messages = history.map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      // Short replies keep the chat feeling conversational AND cut latency —
      // generation time scales with output length. 512 leaves headroom for
      // Hindi/Devanagari (more tokens per character) without allowing essays.
      max_tokens: 512,
      // Disable thinking for snappy, low-cost chat replies (Sonnet 5 runs adaptive
      // thinking by default when omitted). Astrology replies are short.
      thinking: { type: 'disabled' },
      system: buildSystemPrompt(profile),
      messages,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API ${res.status}: ${detail}`);
  }

  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    return `I'm not able to answer that one. Please ask me about your chart, timing, or life themes.`;
  }
  const textBlock = (data.content ?? []).find((b: any) => b.type === 'text');
  return textBlock?.text ?? `Let me reflect on that — could you rephrase your question?`;
}
