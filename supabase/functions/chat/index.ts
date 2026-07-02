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

    const { profileId, message, sessionId } = await req.json();
    if (!message || typeof message !== 'string' || !message.trim()) {
      return json({ error: 'empty_message' }, 400);
    }
    if (!profileId) return json({ error: 'missing_profile' }, 400);

    // profile must belong to this user, and have a computed Kundli
    const { data: profile } = await admin
      .from('profiles').select('*')
      .eq('id', profileId).eq('user_id', user.id).maybeSingle();
    if (!profile) return json({ error: 'profile_not_found' }, 404);
    if (!profile.kundli_chart) return json({ error: 'kundli_missing' }, 400);

    // ── resolve or create the session ──────────────────────────────────────
    let session;
    if (sessionId) {
      const { data: s } = await admin
        .from('chat_sessions').select('*')
        .eq('id', sessionId).eq('user_id', user.id).maybeSingle();
      if (!s) return json({ error: 'session_not_found' }, 404);
      if (s.expires_at && new Date(s.expires_at).getTime() <= Date.now()) {
        await admin.from('chat_sessions').update({ status: 'ended' }).eq('id', s.id);
        return json({ expired: true });
      }
      session = s;
    } else {
      // new free session — enforce one-per-phone entitlement
      const { data: u } = await admin
        .from('users').select('free_minute_used_at').eq('id', user.id).maybeSingle();
      if (u?.free_minute_used_at) {
        return json({ error: 'free_used' }); // Phase 4 paywall picks this up
      }
      const now = Date.now();
      const expiresAt = new Date(now + FREE_SECONDS * 1000).toISOString();
      const { data: created, error: cErr } = await admin
        .from('chat_sessions')
        .insert({ user_id: user.id, profile_id: profileId, kind: 'free_minute', expires_at: expiresAt })
        .select().single();
      if (cErr) return json({ error: 'session_create_failed', detail: cErr.message }, 500);
      session = created;
      // consume the free minute (one per phone)
      await admin.from('users').update({ free_minute_used_at: new Date(now).toISOString() }).eq('id', user.id);
    }

    // store the user's message
    await admin.from('chat_messages').insert({ session_id: session.id, role: 'user', content: message.trim() });

    // load conversation so far (for context)
    const { data: history } = await admin
      .from('chat_messages').select('role, content')
      .eq('session_id', session.id).order('created_at', { ascending: true });

    const reply = await generateReply(profile, history ?? []);

    await admin.from('chat_messages').insert({ session_id: session.id, role: 'assistant', content: reply });

    return json({
      reply,
      session: { id: session.id, expires_at: session.expires_at },
    });
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as Error)?.message ?? e) }, 500);
  }
});

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
    `- Keep replies concise (2–5 short paragraphs max), conversational, and specific to their chart.`,
    `- You may discuss career, relationships, timing, temperament, remedies (gemstones, mantras, charity) in a Vedic frame.`,
    `- Never give medical, legal, or guaranteed financial advice; suggest professionals for those.`,
    `- Write in the user's language if they switch; otherwise clear, simple English with occasional Sanskrit terms.`,
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
      max_tokens: 1024,
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
