// Edge Function: horoscope
// Phase 5. Returns a daily/weekly/monthly horoscope for the user's Moon sign
// (Rashi). The ONLY place the horoscope text is generated (AI narrates general
// Vedic guidance for the sign — rule #2: never computes chart data/scores).
//
// Margin protection (rule #4): a horoscope is cached ONCE per (sign, period,
// period_key) in public.horoscopes and SHARED across all users with that sign.
// On a cache hit we return instantly; on a miss we generate via Claude, store it,
// and return. Setting ANTHROPIC_API_KEY swaps the mock for real Claude (same
// pattern as the chat function) — no code change needed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = 'claude-sonnet-5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Period = 'daily' | 'weekly' | 'monthly';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { profileId, period } = await req.json();
    if (period !== 'daily' && period !== 'weekly' && period !== 'monthly') {
      return json({ error: 'bad_period' }, 400);
    }
    if (!profileId) return json({ error: 'missing_profile' }, 400);

    // resolve the user's Moon sign from their (own) profile
    const { data: profile } = await admin
      .from('profiles').select('kundli_chart, user_id')
      .eq('id', profileId).eq('user_id', user.id).maybeSingle();
    if (!profile) return json({ error: 'profile_not_found' }, 404);
    const sign: string | undefined = profile.kundli_chart?.moon_sign;
    if (!sign) return json({ error: 'kundli_missing' }, 400);

    const periodKey = periodKeyFor(period as Period);

    // cache hit? (shared across all users with this sign — rule #4)
    const { data: cached } = await admin
      .from('horoscopes').select('body')
      .eq('sign', sign).eq('period', period).eq('period_key', periodKey).maybeSingle();
    if (cached) {
      return json({ sign, period, period_key: periodKey, body: cached.body, cached: true });
    }

    // miss → generate, then store (ignore unique-violation from a concurrent writer)
    const body = await generateHoroscope(sign, period as Period, periodKey);
    const { error: insErr } = await admin
      .from('horoscopes').insert({ sign, period, period_key: periodKey, body });
    if (insErr && (insErr as any).code === '23505') {
      const { data: raced } = await admin
        .from('horoscopes').select('body')
        .eq('sign', sign).eq('period', period).eq('period_key', periodKey).maybeSingle();
      return json({ sign, period, period_key: periodKey, body: raced?.body ?? body, cached: true });
    }

    return json({ sign, period, period_key: periodKey, body, cached: false });
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as Error)?.message ?? e) }, 500);
  }
});

// ── IST-based period bucket keys (all users are in India) ──────────────────────
function istYMD(): { y: number; m: number; d: number; iso: string } {
  // 'en-CA' formats as YYYY-MM-DD
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, iso };
}

function periodKeyFor(period: Period): string {
  const { y, m, d, iso } = istYMD();
  if (period === 'daily') return iso;                 // YYYY-MM-DD
  if (period === 'monthly') return iso.slice(0, 7);   // YYYY-MM
  const { year, week } = isoWeek(y, m, d);            // weekly → ISO week
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function isoWeek(y: number, m: number, d: number): { year: number; week: number } {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7;          // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);    // Thursday of this ISO week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
  );
  return { year: date.getUTCFullYear(), week };
}

// ── generation (mock until ANTHROPIC_API_KEY is set) ───────────────────────────
function buildPrompt(sign: string, period: Period): { system: string; user: string } {
  const span = period === 'daily' ? 'today' : period === 'weekly' ? 'this week' : 'this month';
  const system = [
    `You are Ritham, a warm and wise Vedic astrologer (jyotishi) writing a ${period} horoscope`,
    `for readers whose Moon sign (Rashi) is ${sign}.`,
    `Write general Vedic guidance for this Rashi for ${span} — do NOT invent specific chart`,
    `placements, dates, scores, or precise predictions (you have only the sign).`,
    `Cover, briefly: overall mood/energy, relationships, career or money, and one simple`,
    `remedy or focus (a mantra, colour, charity, or intention).`,
    `Tone: calm, encouraging, grounded — never fear-mongering, never kitschy.`,
    `Length: 2–3 short paragraphs. Address the reader as "you". Plain, warm English with the`,
    `occasional Sanskrit term.`,
  ].join(' ');
  const user = `Write the ${period} horoscope for ${sign} (${span}).`;
  return { system, user };
}

async function generateHoroscope(sign: string, period: Period, periodKey: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    const span = period === 'daily' ? 'Today' : period === 'weekly' ? 'This week' : 'This month';
    const signName = sign.split(' (')[0];
    return (
      `🌙 (Preview horoscope — real AI activates once the Claude API key is set.)\n\n` +
      `${span}, ${signName}, the Moon favours a steady, mindful pace. Tend to your relationships ` +
      `with patience and speak gently — a small act of kindness returns to you. In work and money, ` +
      `focus on what you can finish rather than starting something new; consistency is your ally now.\n\n` +
      `A simple focus for ${span.toLowerCase()}: pause for a few slow breaths before reacting, and ` +
      `offer a little charity or a quiet mantra. The stars encourage calm confidence over haste.`
    );
  }

  const { system, user } = buildPrompt(sign, period);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      thinking: { type: 'disabled' },
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const textBlock = (data.content ?? []).find((b: any) => b.type === 'text');
  return textBlock?.text ?? 'The stars are quiet just now — please check back shortly.';
}
