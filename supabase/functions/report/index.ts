// Edge Function: report
// Phase 7. Generates a paid report and caches it (rule #4: one purchase = one
// stored report). Vastu is property-based: it reads the user's uploaded floor
// plan (Storage) + questionnaire and asks Claude (VISION) for a DETAILED,
// multi-section Vaastu consultancy (~8-9 pages), rendered into branded HTML
// stored on the reports row. The app views the HTML and exports a PDF on-device.
//
// Access is gated by a verified 'report' entitlement (Phase 4), consumed only on
// a successful generation. Mock output until ANTHROPIC_API_KEY is set.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Chart-report engine is inlined at the bottom of this file (namespace Chart) so
// the function deploys as a SINGLE file via the dashboard editor.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = 'claude-sonnet-5';

type Lang = 'en' | 'hi';

// Appended to every report system prompt when the app language is Hindi. The
// COMPUTED facts and the JSON contract stay in English/ASCII; only the
// human-readable string values become Devanagari Hindi — so a Hindi user's report
// reads entirely in Hindi while the render pipeline keeps working.
const HINDI_REPORT_DIRECTIVE =
  '\n\nIMPORTANT — OUTPUT LANGUAGE: Write ALL human-readable JSON string VALUES ' +
  '(overview, section headings and bodies, points, assessments, recommendations, ' +
  'remedies, guidance, verdict, dos, donts, and any other prose) in natural, warm ' +
  'HINDI in Devanagari script — the way a senior Indian pandit/consultant writes. ' +
  'Keep the JSON KEYS and overall structure EXACTLY as specified (English/ASCII), and ' +
  'keep numeric scores numeric. Well-known Sanskrit/astrology terms may stay in ' +
  'Devanagari. Do NOT write the prose in English or in romanised Hindi.';



const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

interface Direction { direction: string; element: string; assessment: string }
interface Zone { area: string; direction: string; assessment: string; recommendation: string }
interface Dosha { issue: string; impact: string; remedy: string }
interface VastuAnalysis {
  overview: string;        // 2-3 paragraphs
  directions: Direction[]; // the eight directions
  zones: Zone[];           // room-by-room
  doshas: Dosha[];         // defects found
  score: number;
  verdict: string;         // one-line summary
  remedies: string[];      // detailed remedies
  dos: string[];
  donts: string[];
}

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

    const body = await req.json();
    const type = body?.type;
    if (type !== 'vastu' && type !== 'matchmaking' && !Chart.isChartType(type)) return json({ error: 'unsupported_type' }, 400);
    // App language: 'hi' → the report is narrated in Devanagari Hindi.
    const lang: Lang = body?.lang === 'hi' ? 'hi' : 'en';

    // a paid, unconsumed 'report' entitlement of THIS type (plan_id = type)
    const { data: ent } = await admin
      .from('entitlements_ledger').select('*')
      .eq('user_id', user.id).eq('kind', 'report').eq('plan_id', type).is('consumed_at', null)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!ent) return json({ error: 'needs_purchase' });

    // ── validate + assemble the row per report type ───────────────────────────
    // `type` is already validated to be one of the three families at the top of the
    // handler, so exactly one branch below always assigns insertRow (definite-assignment).
    let insertRow!: Record<string, unknown>;
    let style: 'north' | 'south' = 'north';
    if (type === 'vastu') {
      const { answers, floorplanPath } = body;
      if (!answers || typeof answers !== 'object') return json({ error: 'missing_answers' }, 400);
      if (JSON.stringify(answers).length > 4000) return json({ error: 'answers_too_large' }, 400);
      if (!floorplanPath) return json({ error: 'missing_floorplan' }, 400);
      if (!String(floorplanPath).startsWith(`${user.id}/`)) return json({ error: 'forbidden_path' }, 403);
      insertRow = {
        user_id: user.id, order_id: ent.order_id, entitlement_id: ent.id,
        type, status: 'generating', answers, floorplan_path: floorplanPath,
      };
    } else if (type === 'matchmaking') {
      const { self, partner, chartStyle } = body;
      if (!isPerson(self) || !isPerson(partner)) return json({ error: 'missing_people' }, 400);
      if (tooBig(self) || tooBig(partner)) return json({ error: 'chart_too_large' }, 400);
      style = chartStyle === 'south' ? 'south' : 'north';
      insertRow = {
        user_id: user.id, order_id: ent.order_id, entitlement_id: ent.id,
        type, status: 'generating', chart_style: style,
        partner: { self, partner }, // both charts kept on the record
      };
    } else if (Chart.isChartType(type)) {
      // single-person chart report: reads the user's own cached Kundli (rule #1)
      const { self } = body;
      if (!isPerson(self)) return json({ error: 'missing_chart' }, 400);
      if (tooBig(self)) return json({ error: 'chart_too_large' }, 400);
      insertRow = {
        user_id: user.id, order_id: ent.order_id, entitlement_id: ent.id,
        type, status: 'generating', answers: { self }, // chart snapshot kept on the record
      };
    }

    // Atomically CLAIM the credit BEFORE any paid Claude work. The conditional
    // update (consumed_at IS NULL) means N concurrent requests sharing one credit
    // can't each start a generation — only the first claim wins; the rest get
    // needs_purchase. Prevents multiplying the Anthropic bill off a single purchase.
    const { data: claimed } = await admin
      .from('entitlements_ledger')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', ent.id).is('consumed_at', null)
      .select().maybeSingle();
    if (!claimed) return json({ error: 'needs_purchase' });

    const { data: report, error: rErr } = await admin
      .from('reports').insert(insertRow).select().single();
    if (rErr) {
      await admin.from('entitlements_ledger').update({ consumed_at: null }).eq('id', ent.id);
      return json({ error: 'report_create_failed', detail: rErr.message }, 500);
    }

    // Generate in the BACKGROUND. A report is a long, non-streaming Claude call
    // (5000–8000 tokens → 1–3 minutes), which a synchronous request cannot hold:
    // the mobile fetch / API gateway time out and the worker is dropped early
    // (observed as an "EarlyDrop" shutdown). Instead we return the report_id right
    // away with status 'generating' and let the client poll the reports row
    // (reportService.getReport) until it flips to 'ready' or 'failed'. The credit
    // was claimed above and is RELEASED again only if generation fails (retry-safe).
    const generate = async () => {
      try {
        // v2: build the structured 9-page ReportContent (stored on reports.pages,
        // rendered natively by the app). Chart data is authoritative; Claude adds
        // prose. Each path degrades to a deterministic, fully-renderable fallback.
        let pages: any;
        let score: number | null = null;
        if (type === 'vastu') {
          const va = await generateVastu(admin, body.floorplanPath, body.answers, lang); // vision (self-mocks)
          pages = assembleVastu(body.answers, va, lang);
          score = va.score;
        } else if (type === 'matchmaking') {
          const milan = computeMilan(body.self, body.partner);
          const e = (await enrichMatch(body.self, body.partner, milan, lang)) ?? coerceEnrich({});
          pages = assembleMatch(body.self, body.partner, milan, e, lang);
          score = milan.percent;
        } else if (Chart.isChartType(type)) {
          const person = body.self as Chart.ChartPerson;
          const facts = Chart.computeChartFacts(person, type);
          const e = (await enrichChart(type, person, facts, lang)) ?? fallbackEnrich(type, person, facts, lang);
          pages = assembleChart(type, person, facts, e, lang);
          score = facts.score;
        }

        await admin.from('reports')
          .update({ status: 'ready', pages, html: null, score }).eq('id', report.id);
        // credit was already claimed before generation — nothing to consume here
      } catch (genErr) {
        await admin.from('reports').update({ status: 'failed' }).eq('id', report.id);
        // release the claimed credit so the paying user can retry without losing it
        await admin.from('entitlements_ledger').update({ consumed_at: null }).eq('id', ent.id);
        console.error('report generation failed', report.id, String((genErr as Error)?.message ?? genErr));
      }
    };

    // Keep the worker alive until generation finishes, even though we've responded.
    // @ts-ignore EdgeRuntime is provided by the Supabase edge runtime
    EdgeRuntime.waitUntil(generate());

    return json({ report_id: report.id, status: 'generating' });
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as Error)?.message ?? e) }, 500);
  }
});

// ── Vaastu analysis (Claude vision → structured JSON; mock until key set) ───────
async function generateVastu(admin: any, floorplanPath: string, answers: any, lang: Lang = 'en'): Promise<VastuAnalysis> {
  if (!ANTHROPIC_API_KEY) return mockVastu(answers);
  try {
    return await generateVastuLive(admin, floorplanPath, answers, lang);
  } catch (err) {
    // Never hard-fail a paid report: fall back to the structured mock analysis.
    console.error('vastu narration failed, using mock', String((err as Error)?.message ?? err));
    return mockVastu(answers);
  }
}

async function generateVastuLive(admin: any, floorplanPath: string, answers: any, lang: Lang = 'en'): Promise<VastuAnalysis> {
  const { data: file, error: dErr } = await admin.storage.from('reports').download(floorplanPath);
  if (dErr || !file) throw new Error(`floorplan_download_failed: ${dErr?.message ?? 'no file'}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > 6 * 1024 * 1024) throw new Error('floorplan_too_large'); // cost guardrail: bound the vision request
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  const mediaType = floorplanPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  const system =
    `You are a senior Vaastu Shastra consultant with decades of experience, writing a ` +
    `DETAILED, professional, multi-page Vaastu consultancy report for a client's home. ` +
    `Study the attached floor plan image carefully together with the client's questionnaire, ` +
    `and reason from classical Vaastu principles: the eight directions and their ruling ` +
    `deities/planets, the five elements (Pancha Bhoota) and their directional associations, ` +
    `the Brahmasthan (sacred centre), and the placement of entrances, rooms, water and fire. ` +
    `Be thorough, specific to THIS layout, practical, and encouraging — offer constructive, ` +
    `non-demolition remedies wherever possible. Do not fabricate exact measurements you cannot ` +
    `see; reason from the visible layout and the stated directions.\n\n` +
    `Write substantial, detailed prose — this should read like a premium 8-9 page consultancy. ` +
    `Each "assessment" and "recommendation" should be 2-4 full sentences, not a phrase.\n\n` +
    `Return ONLY valid JSON (no prose, no markdown, no code fences) with EXACTLY these keys:\n` +
    `{\n` +
    `  "overview": string (2-3 detailed paragraphs introducing the property's overall Vaastu),\n` +
    `  "directions": [ { "direction": string (one of the 8 directions), "element": string ` +
    `(ruling element/planet), "assessment": string (2-4 sentences on that direction in this home) } ] ` +
    `— cover ALL EIGHT directions (N, NE, E, SE, S, SW, W, NW),\n` +
    `  "zones": [ { "area": string (e.g. Main entrance, Kitchen, Master bedroom, Pooja room, ` +
    `Toilets, Living room, Staircase, Water source), "direction": string, "assessment": string ` +
    `(2-4 sentences), "recommendation": string (2-4 sentences) } ] — 7 to 10 zones,\n` +
    `  "doshas": [ { "issue": string, "impact": string, "remedy": string } ] — 3 to 6 notable ` +
    `Vaastu defects found (or likely), each with impact and a practical remedy,\n` +
    `  "score": integer 0-100 overall Vaastu compliance,\n` +
    `  "verdict": string (one encouraging sentence summarising the home's Vaastu),\n` +
    `  "remedies": [ string ] — 8 to 12 detailed, actionable remedies,\n` +
    `  "dos": [ string ] — 6 to 8 concise do's,\n` +
    `  "donts": [ string ] — 6 to 8 concise don'ts\n` +
    `}` + (lang === 'hi' ? HINDI_REPORT_DIRECTIVE : '');

  const userText =
    `Client's Vaastu questionnaire:\n` +
    Object.entries(answers).map(([k, v]) => `- ${k}: ${v}`).join('\n') +
    `\n\nStudy the floor plan image in detail and return the complete JSON report.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      // Devanagari tokenises heavier — give Hindi extra room so the JSON isn't truncated.
      max_tokens: lang === 'hi' ? 12000 : 8000,
      thinking: { type: 'disabled' },
      system,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: userText },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = (data.content ?? []).find((b: any) => b.type === 'text')?.text ?? '';
  return parseAnalysis(text);
}

// Robustly pull the JSON object out of a model reply. A live model can wrap the
// JSON in prose/fences, truncate it, or (very rarely) refuse and return no text.
// Fail with a clear domain error instead of a raw SyntaxError so the report is
// marked `failed` cleanly and the paid entitlement is preserved for a retry.
function parseJsonReply(text: string): any {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  const slice = s >= 0 && e > s ? text.slice(s, e + 1) : text;
  try {
    return JSON.parse(slice);
  } catch {
    throw new Error('ai_bad_json: model did not return valid JSON');
  }
}

function parseAnalysis(text: string): VastuAnalysis {
  const obj = parseJsonReply(text);
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  return {
    overview: String(obj.overview ?? ''),
    directions: arr(obj.directions).slice(0, 8),
    zones: arr(obj.zones).slice(0, 12),
    doshas: arr(obj.doshas).slice(0, 8),
    score: clampScore(obj.score),
    verdict: String(obj.verdict ?? ''),
    remedies: arr(obj.remedies).map(String).slice(0, 14),
    dos: arr(obj.dos).map(String).slice(0, 10),
    donts: arr(obj.donts).map(String).slice(0, 10),
  };
}
function clampScore(v: any): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 70;
  return Math.max(0, Math.min(100, n));
}

function mockVastu(answers: any): VastuAnalysis {
  const facing = answers.facing ?? 'East';
  return {
    overview:
      `(Preview report — the full AI Vaastu analysis, which studies your actual floor plan in ` +
      `depth, activates once the Claude API key is set. This preview shows the complete structure ` +
      `and depth your final report will have.)\n\n` +
      `Your ${facing}-facing home carries a fundamentally positive Vaastu foundation. The overall ` +
      `flow of energy (prana) through the property is balanced, with the principal living spaces ` +
      `broadly aligned to their supportive directions. A ${facing} orientation is considered ` +
      `auspicious, inviting the nourishing energy of the morning and supporting growth, clarity ` +
      `and new beginnings for the residents.\n\n` +
      `This consultancy examines each of the eight directions, evaluates every major zone of your ` +
      `home, identifies the Vaastu doshas (imbalances) present, and offers a prioritised set of ` +
      `practical, non-intrusive remedies. The aim throughout is harmony — small, considered ` +
      `adjustments that align your home with the natural order and enhance well-being, prosperity ` +
      `and peace of mind.`,
    directions: [
      { direction: 'North (Uttara)', element: 'Water · Kubera (wealth)', assessment: 'The North governs wealth, opportunity and career flow. Keeping this zone light, open and uncluttered strengthens the flow of prosperity into the home.' },
      { direction: 'North-East (Ishanya)', element: 'Water · Jupiter/Ishvara', assessment: 'The most sacred zone, source of positive cosmic energy. It should be the lightest, cleanest and least burdened part of the home — ideal for prayer, water and open space.' },
      { direction: 'East (Purva)', element: 'Air · Surya (Sun)', assessment: 'The East brings health, vitality and social standing. Morning light entering from here energises the household and supports well-being.' },
      { direction: 'South-East (Agneya)', element: 'Fire · Venus/Agni', assessment: 'The fire corner, naturally suited to the kitchen and electrical appliances. A well-ordered South-East supports health, energy and financial stability.' },
      { direction: 'South (Dakshina)', element: 'Earth · Mars/Yama', assessment: 'The South supports fame, strength and stability. It is best kept heavier and more enclosed, balancing the lightness of the North and East.' },
      { direction: 'South-West (Nairutya)', element: 'Earth · Rahu', assessment: 'The zone of stability, relationships and the head of the household. It should be the heaviest, most grounded part of the home — ideal for the master bedroom.' },
      { direction: 'West (Paschima)', element: 'Water · Saturn/Varuna', assessment: 'The West governs gains, creativity and children. A stable West supports steady progress and the fruits of effort.' },
      { direction: 'North-West (Vayavya)', element: 'Air · Moon/Vayu', assessment: 'The air corner influences relationships, support and movement. It suits guest rooms and storage, and benefits from good ventilation.' },
    ],
    zones: [
      { area: 'Main entrance', direction: String(facing), assessment: 'A well-placed, welcoming entrance is the mouth through which energy enters the home. Its direction sets the tone for the prana that circulates within.', recommendation: 'Keep the entrance clean, well-lit and clutter-free. A nameplate, a threshold (dehleez) and an auspicious symbol at the door invite positive energy and prosperity.' },
      { area: 'Kitchen', direction: answers.kitchen ?? 'South-East', assessment: 'The kitchen is the seat of Agni (fire) and directly influences health and nourishment. The South-East is its most harmonious placement.', recommendation: 'Position the cooking platform so the cook faces East. Keep the stove (fire) and sink (water) apart to avoid an element clash, and maintain cleanliness at all times.' },
      { area: 'Master bedroom', direction: answers.master_bedroom ?? 'South-West', assessment: 'The master bedroom anchors the stability of the household head. The South-West lends it grounding, security and lasting strength.', recommendation: 'Sleep with the head towards the South or East for restful sleep. Avoid mirrors facing the bed and keep electronic clutter to a minimum.' },
      { area: 'Pooja room', direction: answers.pooja ?? 'North-East', assessment: 'The prayer space is the spiritual heart of the home and belongs in the sacred North-East (Ishanya), the source of divine energy.', recommendation: 'Keep the pooja room in the North-East, spotless and uncluttered. Face East or North while praying, and avoid placing it inside a bedroom or under a staircase.' },
      { area: 'Toilets', direction: answers.toilets ?? 'North-West', assessment: 'Toilets carry heavy, draining energy and are best kept away from the North-East and the Brahmasthan (centre).', recommendation: 'Keep toilet doors closed, ensure good ventilation and light, and use exhaust fans. A small bowl of sea salt can help absorb negative energy.' },
      { area: 'Living room', direction: 'North / East', assessment: 'The living room is where the family gathers and guests are received; it benefits from openness, light and positive social energy.', recommendation: 'Place heavier furniture towards the South and West, keeping the North and East lighter and more open to encourage free movement of energy.' },
      { area: 'Brahmasthan (centre)', direction: 'Centre', assessment: 'The centre of the home is its energetic core and should remain open and unobstructed so energy can radiate outward freely.', recommendation: 'Avoid heavy furniture, toilets or a staircase at the centre. Keeping it clear and clean strengthens the harmony of the entire home.' },
      { area: 'Water source / storage', direction: 'North-East', assessment: 'Underground water, borewells and overhead tanks have preferred directions that support the flow of prosperity and health.', recommendation: 'Underground water is best in the North-East; overhead tanks suit the South-West or West. Fix any leaks promptly, as dripping water is said to drain wealth.' },
    ],
    doshas: [
      { issue: 'Clutter or weight in the North-East', impact: 'Obstructs the flow of positive, spiritual energy and can affect clarity and prosperity.', remedy: 'Clear and lighten the North-East. Introduce clean water features or fresh plants, and keep it well-lit.' },
      { issue: 'Toilet or kitchen near the centre (Brahmasthan)', impact: 'Disturbs the energetic core of the home, affecting overall harmony.', remedy: 'Keep the centre open where possible; use salt remedies and copper/pyramid Vaastu correctors if relocation is not feasible.' },
      { issue: 'Fire and water elements placed adjacent', impact: 'An element clash (Agni vs Jala) that can create tension and instability in health and relationships.', remedy: 'Separate the stove and sink; place a small wooden divider or maintain distance between the two.' },
    ],
    score: 74,
    verdict: 'A well-founded, harmonious home with a few easily corrected imbalances — small adjustments will meaningfully enhance its Vaastu.',
    remedies: [
      'Keep the Brahmasthan (centre of the home) open, clean and free of heavy furniture to let energy radiate freely.',
      'Strengthen the North-East with a clean water feature, fresh plants or a small prayer space, and keep it well-lit.',
      'Ensure the master bedroom sits in the South-West; sleep with the head to the South or East.',
      'Keep the kitchen fire (stove) in the South-East and separate it from water sources.',
      'Use warm, earthy tones in the South and West; keep the North and East light and airy.',
      'Fix all leaking taps and pipes promptly — leaking water is believed to drain prosperity.',
      'Place a Tulsi plant in the North or North-East for harmony, health and positive energy.',
      'Hang a metal wind chime in the North-West to encourage beneficial movement of energy.',
      'Keep toilet doors closed and use exhaust and light to prevent stagnation of energy.',
      'Declutter regularly — Vaastu thrives on cleanliness, order and the free flow of prana.',
    ],
    dos: [
      'Keep the main entrance welcoming, lit and clutter-free.',
      'Maintain the North-East as the lightest, cleanest zone.',
      'Sleep with your head to the South or East.',
      'Cook facing East in a South-East kitchen.',
      'Keep the centre of the home open.',
      'Use natural light and ventilation generously.',
    ],
    donts: [
      'Don’t place toilets in the North-East or at the centre.',
      'Don’t keep the pooja room in a bedroom or under stairs.',
      'Don’t let taps or pipes leak.',
      'Don’t place mirrors facing the bed.',
      'Don’t clutter the North-East or the Brahmasthan.',
      'Don’t place the stove and sink directly adjacent.',
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  v2 INTERACTIVE REPORTS (Master Prompt) — build the structured 9-page JSON
//  (ReportContent; see app lib/reportSchema.ts) that lib/reportRenderer.ts renders
//  natively. Chart data is AUTHORITATIVE (injected from computed facts — the wheel,
//  dasha dates, guna scores); Claude supplies prose + interpretive ratings. A
//  deterministic fallback assembles a complete, valid report from facts alone, so a
//  paid report is NEVER left un-renderable (mirrors the mock philosophy above).
// ═══════════════════════════════════════════════════════════════════════════

const V2_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const HOUSE_LABEL = ['Self', 'Wealth', 'Courage', 'Home', 'Creativity', 'Health', 'Partnership', 'Depths', 'Fortune', 'Career', 'Gains', 'Liberation'];
const tt = (lang: Lang, en: string, hi: string) => (lang === 'hi' ? hi : en);
const v2num = (v: any, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp10 = (n: number) => Math.max(0, Math.min(10, Math.round(n * 10) / 10));
const planetNm = (g: string) => String(g ?? '').split('(')[0].trim();
function v2SignIdx(s: string): number { const b = String(s ?? '').split('(')[0].trim(); const i = V2_SIGNS.indexOf(b); return i >= 0 ? i : 0; }
function ord(n: number): string { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
const birthLine = (p: any) => [p.dob, p.tob, p.birth_place].filter(Boolean).join(' · ');

// authoritative planet placements (whole-sign house) for the Vedic birth chart
function planetsByHouse(facts: any): any[] {
  return Object.values(facts.planets || {}).map((p: any) => ({ name: planetNm(p.name), house: p.house }));
}
function placementsToPlanets(pl: any[]): any[] {
  return (pl || []).map((p: any) => ({ name: planetNm(p.graha ?? p.name), house: v2num(p.house, 1) }));
}
// dasha windows with REAL dates; labels/notes from enrichment when present
function dashaTimeline(facts: any, lang: Lang, notes?: any[]): any[] {
  const d = facts.dasha; const now = Date.now();
  const fmt = (dt: any) => new Date(dt).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { year: 'numeric', month: 'short' });
  const list = [d.current, ...(d.upcoming || [])].slice(0, 3);
  return list.map((m: any, i: number) => ({
    label: notes?.[i]?.label ?? tt(lang, `${planetNm(m.lord)} period`, `${planetNm(m.lord)} काल`),
    period: `${fmt(m.start)} – ${fmt(m.end)}`,
    note: notes?.[i]?.note ?? '',
    current: new Date(m.start).getTime() <= now && now < new Date(m.end).getTime(),
  }));
}

// per-report snapshot rings + which comparable items get Rating Badges (§5)
const CHART_FOCUS: Record<string, { rings?: string[]; bars?: boolean; rated?: 'fields' | 'subjects' | 'houses' | null; radar?: boolean; focus: string }> = {
  life: { rings: ['Career', 'Love', 'Health', 'Finance'], rated: 'houses', radar: true, focus: 'a complete life reading across every domain — houses, planets, yogas, dasha timing and remedies' },
  career: { rings: ['Career Momentum', 'Wealth Yoga', 'Timing Now'], rated: 'fields', radar: true, focus: 'career direction, most suitable fields, job-vs-business, wealth potential and favourable timing' },
  love: { rings: ['Relationship Readiness'], rated: null, radar: true, focus: 'relationship patterns (5th & 7th house), what to seek in a partner, timing and harmony — NO scores on any specific relationship' },
  health: { bars: true, rated: null, radar: false, focus: 'constitutional tendencies and gentle lifestyle guidance framed as areas to nurture — NEVER a diagnosis, NEVER a numeric health score' },
  education: { rings: ['Academic Momentum'], rated: 'subjects', radar: true, focus: 'academic strengths, favourable subjects/streams and exam timing — for a student and their parents' },
  pastlife: { rated: null, radar: false, focus: 'karmic patterns, soul lessons and poorva-punya, and how the karmic pattern shows up across current life stages — evocative narrative, NO numeric scores' },
};

// ── Claude call → flat enrichment JSON (prose + interpretive ratings) ──────────
function reportSystem(lang: Lang, focusText: string, ratedKind: string): string {
  return (
    `You are "Ritham", a warm, wise Vedic astrologer writing a premium, insightful report. ` +
    `Focus: ${focusText}.\n\n` +
    `Return ONLY valid JSON (no prose, no markdown, no code fences) with these keys — omit a key only if the rule says so:\n` +
    `{\n` +
    `  "headline": string (ONE vivid, specific cover line grounded in the chart),\n` +
    `  "snapshot": string (2-3 sentences orienting the reader),\n` +
    (ratedKind !== 'none'
      ? `  "ratings": [ { "label": string, "score": number 0-10, "note": string (one line) } ] — 4 to 6 ${ratedKind} the reader is CHOOSING BETWEEN (this is the only place a /10 is allowed),\n`
      : `  (NO "ratings" — this report must contain ZERO numeric ratings),\n`) +
    `  "radar": [ { "label": string, "value": number 0-10 } ] — 5 to 6 interpretive traits (omit if not helpful),\n` +
    `  "insights": [ { "title": string, "teaser": string (one line), "body": string (3-5 sentences) } ] — 3 to 4,\n` +
    `  "nuggets": [ string ] — 5 to 6 genuine "Did you know / In Vedic astrology" explanations of a real concept (one per content page),\n` +
    `  "honest": string (ONE candid, non-flattering but constructive insight),\n` +
    `  "strengths": [ string ] — 3, "challenges": [ string ] — 3,\n` +
    `  "timing": [ { "label": string, "note": string } ] — 3 windows (labels/notes only; dates are computed),\n` +
    `  "remedies": [ { "kind": "mantra"|"gem"|"ritual"|"direction"|"color"|"daan"|"practice", "title": string, "detail": string (specific & actionable) } ] — 4 to 5,\n` +
    `  "signature": [ string ] — exactly 3 crisp takeaways\n` +
    `}\n` +
    `Ground every claim in the supplied chart facts; never invent placements or dates. ` +
    `Speak with calm authority, be specific, and stay probabilistic (no absolute predictions).` +
    (lang === 'hi' ? HINDI_REPORT_DIRECTIVE : '')
  );
}

async function callClaudeJson(system: string, userContent: any, lang: Lang): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: lang === 'hi' ? 9000 : 6000, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: userContent }] }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content ?? []).find((b: any) => b.type === 'text')?.text ?? '';
  return parseJsonReply(text);
}

function coerceEnrich(o: any): any {
  const S = (v: any) => String(v ?? '');
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  return {
    headline: S(o.headline), snapshot: S(o.snapshot),
    ratings: arr(o.ratings).slice(0, 6).map((r: any) => ({ label: S(r.label), score: clamp10(v2num(r.score, 6)), note: S(r.note) })),
    radar: arr(o.radar).slice(0, 6).map((r: any) => ({ label: S(r.label), value: clamp10(v2num(r.value, 5)) })),
    insights: arr(o.insights).slice(0, 4).map((c: any) => ({ title: S(c.title), teaser: S(c.teaser), body: S(c.body) })),
    nuggets: arr(o.nuggets).map(S).slice(0, 8),
    honest: S(o.honest),
    strengths: arr(o.strengths).map(S).slice(0, 4), challenges: arr(o.challenges).map(S).slice(0, 4),
    timing: arr(o.timing).slice(0, 3).map((t: any) => ({ label: S(t.label), note: S(t.note) })),
    remedies: arr(o.remedies).slice(0, 6).map((r: any) => ({ kind: S(r.kind) || 'practice', title: S(r.title), detail: S(r.detail) })),
    signature: arr(o.signature).map(S).slice(0, 3),
  };
}

function chartFactsSummary(p: any, facts: any): string {
  const planets = Object.values(facts.planets || {}).map((x: any) => `${planetNm(x.name)} in ${x.sign} (house ${x.house}${x.dignity && x.dignity !== 'Neutral' ? `, ${x.dignity}` : ''})`).join('; ');
  const houses = (facts.houses || []).map((h: any) => `${ord(h.house)} (${HOUSE_LABEL[h.house - 1]}) strength ${h.strength}/100`).join('; ');
  const yogas = (facts.yogas || []).map((y: any) => `${y.name}: ${y.detail}`).join(' | ') || 'none prominent';
  const d = facts.dasha;
  const fmt = (dt: any) => new Date(dt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
  return (
    `Name: ${p.name}; Lagna: ${p.lagna}; Moon: ${p.moon_sign}; Sun: ${p.sun_sign}; Nakshatra: ${p.nakshatra}\n` +
    `Placements: ${planets}\n` +
    `House strengths: ${houses}\n` +
    `Yogas: ${yogas}\n` +
    `Current Mahadasha: ${planetNm(d.current.lord)} (${fmt(d.current.start)}–${fmt(d.current.end)}); ` +
    `Antardasha: ${planetNm(d.currentAntar.lord)}; Upcoming: ${(d.upcoming || []).map((m: any) => `${planetNm(m.lord)} ${fmt(m.start)}`).join(', ')}`
  );
}

async function enrichChart(type: string, person: any, facts: any, lang: Lang): Promise<any | null> {
  if (!ANTHROPIC_API_KEY) return null;
  const f = CHART_FOCUS[type];
  const ratedKind = f.rated === 'fields' ? 'career fields' : f.rated === 'subjects' ? 'academic subjects' : 'none';
  try {
    const sys = reportSystem(lang, f.focus, ratedKind);
    const user = `COMPUTED CHART FACTS (authoritative — narrate ONLY from these):\n${chartFactsSummary(person, facts)}\n\nReturn the JSON report now.`;
    return coerceEnrich(await callClaudeJson(sys, user, lang));
  } catch (e) { console.error('enrichChart failed', String((e as Error)?.message ?? e)); return null; }
}

// deterministic prose fallback (used when the model is unavailable/misbehaves)
function fallbackEnrich(type: string, person: any, facts: any, lang: Lang): any {
  const f = CHART_FOCUS[type];
  const dl = planetNm(facts.dasha.current.lord);
  const strongHouses = [...(facts.houses || [])].sort((a: any, b: any) => b.strength - a.strength).slice(0, 3);
  const previewNote = tt(lang, '(Preview — the full personalised reading activates once the astrologer’s AI is connected.)', '(पूर्वावलोकन — पूर्ण व्यक्तिगत पठन ज्योतिषी AI जुड़ने पर सक्रिय होगा।)');
  return {
    headline: tt(lang, `${person.moon_sign} Moon with ${person.lagna} rising — your ${dl} period sets the tone now.`, `${person.moon_sign} राशि, ${person.lagna} लग्न — अभी ${dl} की महादशा प्रमुख है।`),
    snapshot: `${previewNote} ${tt(lang, `With ${person.lagna} rising and the Moon in ${person.moon_sign}, your chart’s strengths cluster in the ${strongHouses.map((h: any) => ord(h.house)).join(', ')} houses.`, `${person.lagna} लग्न और ${person.moon_sign} चंद्रमा के साथ, आपकी कुंडली की शक्ति ${strongHouses.map((h: any) => ord(h.house)).join(', ')} भावों में केंद्रित है।`)}`,
    ratings: [], radar: [],
    insights: [
      { title: tt(lang, `${person.lagna} rising`, `${person.lagna} लग्न`), teaser: tt(lang, 'Your core temperament', 'आपका मूल स्वभाव'), body: tt(lang, `With ${person.lagna} as your Lagna and the Moon in ${person.moon_sign}, you meet life through a distinctive blend of drive and feeling that shapes how every other placement expresses itself.`, `${person.lagna} लग्न और ${person.moon_sign} चंद्रमा के साथ, आप जीवन को एक विशिष्ट ऊर्जा और भावना के मेल से देखते हैं जो हर ग्रह की अभिव्यक्ति को आकार देता है।`) },
      { title: tt(lang, `${planetNm(facts.dasha.current.lord)} Mahadasha`, `${planetNm(facts.dasha.current.lord)} महादशा`), teaser: tt(lang, 'The theme of now', 'अभी का विषय'), body: tt(lang, `You are running the ${planetNm(facts.dasha.current.lord)} period — its natural significations are the arena where your growth is concentrated in this span of life.`, `आप ${planetNm(facts.dasha.current.lord)} की दशा में हैं — इसके गुण ही इस अवधि में आपके विकास का क्षेत्र हैं।`) },
      ...(facts.yogas || []).slice(0, 2).map((y: any) => ({ title: y.name, teaser: y.nature === 'benefic' ? tt(lang, 'A supportive combination', 'एक सहायक योग') : tt(lang, 'A pattern to work with', 'ध्यान देने योग्य योग'), body: y.detail })),
    ],
    nuggets: [
      tt(lang, 'The Lagna (Ascendant) is the lens through which the whole chart is read — it sets the house framework for every planet.', 'लग्न वह दृष्टि है जिससे पूरी कुंडली पढ़ी जाती है — यह हर ग्रह के लिए भाव ढाँचा तय करता है।'),
      tt(lang, 'Vimshottari Mahadasha divides life into planetary periods; the ruling planet colours the themes you meet in that span.', 'विंशोत्तरी महादशा जीवन को ग्रह-कालों में बाँटती है; शासक ग्रह उस अवधि के विषयों को रंग देता है।'),
      tt(lang, 'A planet’s dignity (exalted, own sign, debilitated) tunes how freely it can express its natural significations.', 'ग्रह की स्थिति (उच्च, स्व-राशि, नीच) तय करती है कि वह अपने गुण कितनी सहजता से व्यक्त कर सकता है।'),
      tt(lang, 'House strength blends the sign, its lord’s placement, and the planets sitting in it — a fuller picture than any single factor.', 'भाव-बल राशि, उसके स्वामी की स्थिति और उसमें बैठे ग्रहों को मिलाकर बनता है।'),
      tt(lang, 'Transits (gochar) trigger what the birth chart promises — timing comes from the dance between dasha and transit.', 'गोचर वही जगाते हैं जो जन्म-कुंडली में वादा है — समय दशा और गोचर के मेल से आता है।'),
    ],
    honest: tt(lang, 'Every chart carries a growth edge as well as a gift; the periods that ask the most of you are usually the ones that build your defining strengths.', 'हर कुंडली में उपहार के साथ एक चुनौती भी होती है; जो काल सबसे अधिक माँगते हैं, वही आपकी असली शक्ति गढ़ते हैं।'),
    strengths: strongHouses.map((h: any) => tt(lang, `Strong ${ord(h.house)} house — ${HOUSE_LABEL[h.house - 1]}`, `मज़बूत ${ord(h.house)} भाव — ${HOUSE_LABEL[h.house - 1]}`)),
    challenges: [tt(lang, 'A tendency to under-claim your progress', 'अपनी प्रगति को कम आँकने की प्रवृत्ति'), tt(lang, 'Timing patience during slower periods', 'धीमे कालों में धैर्य'), tt(lang, 'Balancing effort with self-care', 'परिश्रम और आत्म-देखभाल में संतुलन')],
    timing: [],
    remedies: [
      { kind: 'mantra', title: tt(lang, `${dl} mantra`, `${dl} मंत्र`), detail: tt(lang, `Honour your current dasha lord ${dl} with its traditional mantra to align with this period’s energy.`, `अपनी वर्तमान दशा के स्वामी ${dl} का पारंपरिक मंत्र जपें ताकि इस काल की ऊर्जा से तालमेल बने।`) },
      { kind: 'daan', title: tt(lang, 'Weekly daan', 'साप्ताहिक दान'), detail: tt(lang, 'Offer a simple, non-branded charity on the weekday of your dasha lord to ease its influence.', 'अपनी दशा के स्वामी के वार पर एक सरल दान करें।') },
      { kind: 'practice', title: tt(lang, 'Name your progress', 'अपनी प्रगति कहें'), detail: tt(lang, 'Once a week, note one real thing you accomplished — a direct answer to the chart’s growth edge.', 'सप्ताह में एक बार अपनी एक वास्तविक उपलब्धि लिखें।') },
    ],
    signature: [
      tt(lang, `${person.lagna} rising, ${person.moon_sign} Moon — a chart of ${dl}-led focus.`, `${person.lagna} लग्न, ${person.moon_sign} चंद्रमा — ${dl}-प्रधान कुंडली।`),
      tt(lang, `Strongest in the ${strongHouses.map((h: any) => ord(h.house)).join(', ')} houses.`, `सबसे मज़बूत ${strongHouses.map((h: any) => ord(h.house)).join(', ')} भावों में।`),
      tt(lang, 'Lead with patience; claim your wins.', 'धैर्य से चलें; अपनी जीत कहें।'),
    ],
  };
}

// localized 9-page skeleton titles
function pageTitles(lang: Lang, type: string): Record<string, string> {
  const timing = type === 'pastlife' ? tt(lang, 'Across Life Stages', 'जीवन के चरणों में') : tt(lang, 'Timing', 'समय');
  return {
    snapshot: tt(lang, 'Snapshot', 'एक नज़र में'),
    chart: tt(lang, 'Core Chart', 'मुख्य कुंडली'),
    deepdive1: tt(lang, 'Deep Dive', 'गहराई से'),
    deepdive2: tt(lang, 'Deep Dive II', 'और गहराई से'),
    timing,
    strengths: tt(lang, 'Strengths & Challenges', 'शक्तियाँ और चुनौतियाँ'),
    remedies: tt(lang, 'Remedies', 'उपाय'),
    summary: tt(lang, 'Summary', 'सारांश'),
  };
}

function assembleChart(type: string, person: any, facts: any, e: any, lang: Lang): any {
  const f = CHART_FOCUS[type];
  const T = pageTitles(lang, type);
  const meta = (Chart.CHART_META as any)[type];
  const title = tt(lang, meta.title, meta.title); // title stays as the report name
  const nug = (i: number) => (e.nuggets && e.nuggets[i] ? [{ type: 'nugget', nugget: { body: e.nuggets[i] } }] : []);
  const disclaimer = type === 'health'
    ? tt(lang, 'A gentle wellbeing reading — not medical advice, diagnosis, or treatment.', 'एक कोमल स्वास्थ्य पठन — यह चिकित्सा सलाह, निदान या उपचार नहीं है।')
    : tt(lang, 'For guidance and reflection — not a substitute for professional advice.', 'मार्गदर्शन और चिंतन के लिए — पेशेवर सलाह का विकल्प नहीं।');

  // p2 snapshot: rings / gradient bars / plain summary — per §5
  const snapBlocks: any[] = [];
  if (f.bars) { // health — qualitative, no scores
    snapBlocks.push({ type: 'gradientBars', items: (facts.houses || []).filter((h: any) => f.rated !== 'houses').slice(0, 4).map((h: any) => ({ label: HOUSE_LABEL[h.house - 1], level: clamp10(h.strength / 10) / 10, note: '' })) });
    snapBlocks.push({ type: 'paragraph', text: disclaimer });
  } else if (f.rings) {
    const ringScores = (e.ratings && e.ratings.length >= f.rings.length)
      ? e.ratings.slice(0, f.rings.length).map((r: any) => r.score)
      : f.rings.map((_, i) => clamp10(((facts.houses || [])[i]?.strength ?? facts.score ?? 60) / 10));
    snapBlocks.push({ type: 'rings', items: f.rings.map((label, i) => ({ label, score: ringScores[i] ?? 6 })) });
  }
  snapBlocks.push({ type: 'paragraph', text: e.snapshot });

  // p4 deep dive I — comparable ratings where apt, else insight cards
  const dd1: any[] = [];
  if (f.rated === 'houses') {
    dd1.push({ type: 'ratings', items: (facts.houses || []).slice(0, 6).map((h: any) => ({ label: `${ord(h.house)} · ${HOUSE_LABEL[h.house - 1]}`, score: clamp10(h.strength / 10), note: '' })) });
  } else if ((f.rated === 'fields' || f.rated === 'subjects') && e.ratings.length) {
    dd1.push({ type: 'ratings', items: e.ratings });
  } else {
    dd1.push({ type: 'insights', cards: e.insights.slice(0, 2) });
  }
  dd1.push(...nug(1));

  // p5 deep dive II — radar (interpretive or 12-house) + insights
  const dd2: any[] = [];
  if (f.rated === 'houses') {
    dd2.push({ type: 'radar', caption: tt(lang, 'House strengths', 'भाव-बल'), axes: (facts.houses || []).map((h: any) => ({ label: ord(h.house), value: clamp10(h.strength / 10) })) });
  } else if (f.radar && e.radar.length) {
    dd2.push({ type: 'radar', axes: e.radar });
  }
  dd2.push({ type: 'insights', cards: e.insights.slice(f.rated === 'fields' || f.rated === 'subjects' ? 0 : 2, 4) });
  dd2.push(...nug(2));

  // p6 timing — real dasha dates (or life-stage reframe for pastlife)
  const timingBlocks: any[] = [];
  if (type === 'pastlife') {
    timingBlocks.push({ type: 'timeline', windows: (e.timing.length ? e.timing : [{ label: tt(lang, 'Early life', 'आरंभिक जीवन'), note: '' }, { label: tt(lang, 'Mid life', 'मध्य जीवन'), note: '' }, { label: tt(lang, 'Maturity', 'परिपक्वता'), note: '' }]).map((t: any, i: number) => ({ label: t.label, period: tt(lang, `Stage ${i + 1}`, `चरण ${i + 1}`), note: t.note, current: i === 1 })) });
  } else {
    timingBlocks.push({ type: 'timeline', windows: dashaTimeline(facts, lang, e.timing) });
  }
  timingBlocks.push(...nug(3));

  const pages = [
    { key: 'cover', title, hero: true, lead: e.headline, blocks: [] },
    { key: 'snapshot', title: T.snapshot, lead: tt(lang, 'Where you stand, at a glance.', 'एक नज़र में आपकी स्थिति।'), blocks: snapBlocks },
    { key: 'chart', title: T.chart, lead: tt(lang, 'Your Vedic birth chart (Lagna Kundli).', 'आपकी लग्न कुंडली।'), blocks: [{ type: 'vedicChart', lagnaSign: facts.lagnaIdx, planets: planetsByHouse(facts) }, ...nug(0)] },
    { key: 'deepdive1', title: T.deepdive1, blocks: dd1 },
    { key: 'deepdive2', title: T.deepdive2, blocks: dd2 },
    { key: 'timing', title: T.timing, blocks: timingBlocks },
    { key: 'strengths', title: T.strengths, lead: tt(lang, 'A balanced, honest read.', 'एक संतुलित, सच्चा पठन।'), blocks: [{ type: 'strengthsChallenges', strengths: e.strengths, challenges: e.challenges }, ...(e.honest ? [{ type: 'honest', text: e.honest }] : []), ...nug(4)] },
    { key: 'remedies', title: T.remedies, lead: tt(lang, 'Specific, doable — prioritised.', 'विशिष्ट, सरल — प्राथमिकता अनुसार।'), blocks: [{ type: 'remedies', items: e.remedies }] },
    { key: 'summary', title: T.summary, lead: tt(lang, 'Made to keep and share.', 'सहेजने और साझा करने योग्य।'), blocks: [{ type: 'signature', lines: e.signature }, { type: 'paragraph', text: disclaimer }] },
  ];
  return { type, lang, person: { name: person.name, birthLine: birthLine(person) }, headline: e.headline, pages };
}

// ── matchmaking ───────────────────────────────────────────────────────────────
async function enrichMatch(a: any, b: any, m: any, lang: Lang): Promise<any | null> {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const sys = reportSystem(lang, 'compatibility between two people via Ashtakoot Guna Milan — strengths, honest friction points, doshas with remedies', 'none');
    const kootas = m.kootas.map((k: any) => `${k.name} ${k.got}/${k.max} (${k.note})`).join('; ');
    const user = `COMPUTED MATCH FACTS (authoritative):\n${a.name} (Moon ${a.moon_sign}, ${a.nakshatra}) & ${b.name} (Moon ${b.moon_sign}, ${b.nakshatra})\nAshtakoot: ${m.total}/${m.max} (${m.percent}% · ${m.band}); Kutas: ${kootas}; Mangal: ${m.mangal.note}; Nadi dosha: ${m.nadiDosha}; Bhakoot dosha: ${m.bhakootDosha}\n\nReturn the JSON now (no "ratings").`;
    return coerceEnrich(await callClaudeJson(sys, user, lang));
  } catch (e) { console.error('enrichMatch failed', String((e as Error)?.message ?? e)); return null; }
}

function assembleMatch(a: any, b: any, m: any, e: any, lang: Lang): any {
  const T = pageTitles(lang, 'matchmaking');
  const nug = (i: number) => (e.nuggets && e.nuggets[i] ? [{ type: 'nugget', nugget: { body: e.nuggets[i] } }] : []);
  const doshaCards: any[] = [];
  if (m.mangal.selfManglik || m.mangal.partnerManglik) doshaCards.push({ title: tt(lang, 'Mangal Dosha', 'मंगल दोष'), teaser: tt(lang, 'Present — read the nuance', 'उपस्थित — विवरण देखें'), body: m.mangal.note });
  if (m.nadiDosha) doshaCards.push({ title: tt(lang, 'Nadi Dosha', 'नाड़ी दोष'), teaser: tt(lang, 'Flagged in the kutas', 'कूटों में चिह्नित'), body: tt(lang, 'Same Nadi can affect health/progeny in classical texts — often mitigated by other strong kutas and remedies.', 'समान नाड़ी शास्त्रों में स्वास्थ्य/संतान को प्रभावित कर सकती है — अन्य मज़बूत कूट और उपाय इसे कम करते हैं।') });
  if (m.bhakootDosha) doshaCards.push({ title: tt(lang, 'Bhakoot Dosha', 'भकूट दोष'), teaser: tt(lang, 'Moon-sign axis', 'चंद्र-राशि अक्ष'), body: tt(lang, 'A Rashi-axis mismatch that some traditions caution on — weigh it against the overall score and remedies.', 'कुछ परंपराएँ इस पर सावधानी देती हैं — इसे कुल अंक और उपायों के साथ तौलें।') });
  if (!doshaCards.length) doshaCards.push({ title: tt(lang, 'No major dosha', 'कोई बड़ा दोष नहीं'), teaser: tt(lang, 'A clean match', 'एक स्वच्छ मिलान'), body: tt(lang, 'No significant Mangal, Nadi, or Bhakoot dosha was flagged — a supportive foundation.', 'कोई महत्वपूर्ण मंगल, नाड़ी या भकूट दोष नहीं मिला — एक सहायक आधार।') });

  const pages = [
    { key: 'cover', title: tt(lang, 'Matchmaking Report', 'मिलान रिपोर्ट'), hero: true, lead: e.headline || tt(lang, `${a.name} & ${b.name} — ${m.percent}% guna match.`, `${a.name} और ${b.name} — ${m.percent}% गुण मिलान।`), blocks: [] },
    { key: 'snapshot', title: T.snapshot, lead: `${a.name} · ${b.name}`, blocks: [{ type: 'paragraph', text: e.snapshot || tt(lang, `An Ashtakoot score of ${m.total}/${m.max} (${m.band}).`, `${m.total}/${m.max} का अष्टकूट अंक (${m.band})।`) }] },
    { key: 'chart', title: tt(lang, 'Two Charts', 'दो कुंडलियाँ'), lead: tt(lang, 'Where your charts meet.', 'जहाँ आपकी कुंडलियाँ मिलती हैं।'), blocks: [{ type: 'compareCharts', a: { name: a.name, lagnaSign: v2SignIdx(a.lagna), planets: placementsToPlanets(a.placements) }, b: { name: b.name, lagnaSign: v2SignIdx(b.lagna), planets: placementsToPlanets(b.placements) }, scoreLabel: tt(lang, 'guna', 'गुण'), score: m.percent }, ...nug(0)] },
    { key: 'deepdive1', title: tt(lang, 'Compatibility', 'अनुकूलता'), blocks: [{ type: 'dualScore', technicalLabel: tt(lang, 'Ashtakoot Guna Milan', 'अष्टकूट गुण मिलान'), technicalValue: m.total, technicalMax: m.max, outOf10: clamp10(m.percent / 10), note: e.snapshot }, ...nug(1)] },
    { key: 'deepdive2', title: tt(lang, 'The Eight Kutas', 'आठ कूट'), lead: tt(lang, 'Each on its own scale.', 'प्रत्येक अपने पैमाने पर।'), blocks: [{ type: 'kutaBars', items: m.kootas.map((k: any) => ({ label: k.name, got: k.got, max: k.max, note: k.note })) }, ...nug(2)] },
    { key: 'timing', title: tt(lang, 'Dosha Check', 'दोष जाँच'), lead: tt(lang, 'Read calmly — most have remedies.', 'शांति से पढ़ें — अधिकांश के उपाय हैं।'), blocks: [{ type: 'insights', cards: doshaCards }, ...nug(3)] },
    { key: 'strengths', title: T.strengths, blocks: [{ type: 'strengthsChallenges', strengths: e.strengths.length ? e.strengths : [tt(lang, 'A supportive guna base', 'एक सहायक गुण आधार')], challenges: e.challenges.length ? e.challenges : [tt(lang, 'Communicate through differences', 'मतभेदों में संवाद बनाए रखें')] }, ...(e.honest ? [{ type: 'honest', text: e.honest }] : []), ...nug(4)] },
    { key: 'remedies', title: T.remedies, blocks: [{ type: 'remedies', items: e.remedies.length ? e.remedies : [{ kind: 'ritual', title: tt(lang, 'Joint puja', 'संयुक्त पूजा'), detail: tt(lang, 'A simple shared prayer strengthens harmony where a dosha is flagged.', 'जहाँ दोष हो वहाँ एक सरल संयुक्त प्रार्थना सामंजस्य बढ़ाती है।') }] }] },
    { key: 'summary', title: T.summary, lead: tt(lang, 'Made to share with family.', 'परिवार के साथ साझा करने योग्य।'), blocks: [{ type: 'signature', lines: e.signature.length ? e.signature : [tt(lang, `${a.name} & ${b.name}: ${m.percent}% guna match.`, `${a.name} और ${b.name}: ${m.percent}% गुण मिलान।`), tt(lang, `Ashtakoot ${m.total}/${m.max} — ${m.band}.`, `अष्टकूट ${m.total}/${m.max} — ${m.band}।`), tt(lang, 'Weigh the score with heart and remedies.', 'अंक को हृदय और उपायों के साथ तौलें।')] }, { type: 'paragraph', text: tt(lang, 'For guidance and reflection — not a substitute for family judgement.', 'मार्गदर्शन के लिए — पारिवारिक निर्णय का विकल्प नहीं।') }] },
  ];
  return { type: 'matchmaking', lang, person: { name: `${a.name} · ${b.name}`, birthLine: `${a.moon_sign} · ${b.moon_sign}` }, headline: pages[0].lead as string, pages };
}

// ── vaastu (from the existing vision analysis; per-zone scores derived) ─────────
function vastuZoneScore(name: string, va: any): number {
  let s = Math.round((va.score ?? 70) / 10);
  const flagged = (va.doshas || []).some((d: any) => String(d.issue ?? '').toLowerCase().includes(String(name ?? '').toLowerCase().split(' ')[0]));
  if (flagged) s -= 2;
  return Math.max(1, Math.min(10, s));
}
function shortTitle(s: string): string { const w = String(s ?? '').split(/[.,—-]/)[0].trim(); return w.length > 42 ? w.slice(0, 40) + '…' : w; }

function assembleVastu(answers: any, va: any, lang: Lang): any {
  const T = pageTitles(lang, 'vastu');
  const name = answers.name ?? answers.owner ?? tt(lang, 'Your Home', 'आपका घर');
  const nuggets = [
    tt(lang, 'Vaastu reads a home through the eight directions, each with a ruling element and deity — the North-East (Ishanya) is the most sacred, kept light and open.', 'वास्तु घर को आठ दिशाओं से पढ़ता है, प्रत्येक का एक तत्व और देवता — ईशान कोण सबसे पवित्र, हल्का और खुला रखा जाता है।'),
    tt(lang, 'The Brahmasthan — the centre of the home — is its energetic core and is kept open so prana can radiate freely.', 'ब्रह्मस्थान — घर का केंद्र — इसकी ऊर्जा का हृदय है, इसे खुला रखा जाता है ताकि प्राण मुक्त रूप से फैले।'),
    tt(lang, 'Fire (Agni) belongs in the South-East and water in the North-East; keeping the two elements apart preserves balance.', 'अग्नि दक्षिण-पूर्व में और जल उत्तर-पूर्व में; दोनों तत्वों को अलग रखना संतुलन बनाए रखता है।'),
  ];
  const nug = (i: number) => [{ type: 'nugget', nugget: { body: nuggets[i % nuggets.length] } }];
  const directions = (va.directions || []).slice(0, 8).map((d: any) => ({ label: d.direction, score: vastuZoneScore(d.direction, va), note: d.assessment }));
  const rooms = (va.zones || []).slice(0, 8).map((z: any) => ({ label: z.area, score: vastuZoneScore(z.area, va), note: z.recommendation }));

  const pages = [
    { key: 'cover', title: tt(lang, 'Vaastu Report', 'वास्तु रिपोर्ट'), hero: true, lead: va.verdict || tt(lang, `A Vaastu reading of ${name}.`, `${name} का वास्तु पठन।`), blocks: [] },
    { key: 'snapshot', title: T.snapshot, lead: tt(lang, 'Your home’s overall Vaastu.', 'आपके घर का समग्र वास्तु।'), blocks: [{ type: 'rings', items: [{ label: tt(lang, 'Vaastu Score', 'वास्तु अंक'), score: clamp10((va.score ?? 70) / 10) }] }, { type: 'paragraph', text: (va.overview || '').split(/\n\s*\n/)[0] || va.verdict }] },
    { key: 'chart', title: tt(lang, 'Directional Zones', 'दिशा क्षेत्र'), lead: tt(lang, 'Each direction, rated.', 'प्रत्येक दिशा, आँकी गई।'), blocks: [{ type: 'zoneGrid', zones: directions }, ...nug(0)] },
    { key: 'deepdive1', title: tt(lang, 'Room by Room', 'कमरा दर कमरा'), lead: tt(lang, 'Prioritise by score.', 'अंक के अनुसार प्राथमिकता दें।'), blocks: [{ type: 'ratings', items: rooms }, ...nug(1)] },
    { key: 'deepdive2', title: tt(lang, 'The Eight Directions', 'आठ दिशाएँ'), blocks: [{ type: 'insights', cards: (va.directions || []).slice(0, 4).map((d: any) => ({ title: d.direction, teaser: d.element, body: d.assessment })) }, ...nug(2)] },
    { key: 'timing', title: tt(lang, 'Fix This First', 'पहले यह ठीक करें'), lead: tt(lang, 'A priority sequence.', 'एक प्राथमिकता क्रम।'), blocks: [{ type: 'timeline', windows: (va.doshas || []).slice(0, 3).map((d: any, i: number) => ({ label: shortTitle(d.issue), period: tt(lang, `Priority ${i + 1}`, `प्राथमिकता ${i + 1}`), note: d.remedy, current: i === 0 })) }] },
    { key: 'strengths', title: T.strengths, blocks: [{ type: 'strengthsChallenges', strengths: (va.dos || []).slice(0, 4), challenges: (va.donts || []).slice(0, 4) }, ...(va.doshas && va.doshas[0] ? [{ type: 'honest', text: `${va.doshas[0].issue} — ${va.doshas[0].impact}` }] : [])] },
    { key: 'remedies', title: T.remedies, blocks: [{ type: 'remedies', items: (va.remedies || []).slice(0, 5).map((r: string) => ({ kind: 'ritual', title: shortTitle(r), detail: r })) }] },
    { key: 'summary', title: T.summary, blocks: [{ type: 'signature', lines: [va.verdict, tt(lang, `Vaastu score: ${va.score}/100.`, `वास्तु अंक: ${va.score}/100।`), (va.remedies || [])[0] || tt(lang, 'Keep the North-East light and open.', 'ईशान कोण को हल्का और खुला रखें।')].filter(Boolean) }, { type: 'paragraph', text: tt(lang, 'For guidance and reflection — not a structural or safety assessment.', 'मार्गदर्शन के लिए — संरचनात्मक या सुरक्षा आकलन नहीं।') }] },
  ];
  return { type: 'vastu', lang, person: { name: String(name), birthLine: String(answers.facing ?? '') }, headline: pages[0].lead as string, pages };
}

// ── branded HTML (premium & minimal — indigo/gold/serif; print-friendly) ───────
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function paras(s: string): string {
  return esc(s).split(/\n\s*\n/).map((p) => `<p class="body">${p.replace(/\n/g, '<br/>')}</p>`).join('');
}

function renderVastuHtml(answers: any, a: VastuAnalysis): string {
  const name = esc(answers.name ?? answers.owner ?? 'Your Home');
  const facing = esc(answers.facing ?? '—');
  const dateStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  const scoreColor = a.score >= 75 ? '#7FA36F' : a.score >= 50 ? '#E4C983' : '#C7524B';

  const detailRows = [
    ['Prepared for', name],
    ['Facing direction', facing],
    ['Plot / house shape', esc(answers.shape ?? '—')],
    ['Kitchen', esc(answers.kitchen ?? '—')],
    ['Master bedroom', esc(answers.master_bedroom ?? '—')],
    ['Pooja room', esc(answers.pooja ?? '—')],
    ['Toilets', esc(answers.toilets ?? '—')],
    ['Focus', esc(answers.concern ?? 'General well-being')],
  ].map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('');

  const directions = a.directions.map((d) => `
    <div class="dir">
      <div class="dir-head"><span class="dir-name">${esc(d.direction)}</span>
        <span class="dir-el">${esc(d.element)}</span></div>
      <p class="dir-assess">${esc(d.assessment)}</p>
    </div>`).join('');

  const zones = a.zones.map((z) => `
    <div class="zone">
      <div class="zone-head"><span class="zone-area">${esc(z.area)}</span>
        <span class="zone-dir">${esc(z.direction)}</span></div>
      <p class="zone-assess">${esc(z.assessment)}</p>
      <p class="zone-rec"><span class="rec-label">Recommendation:</span> ${esc(z.recommendation)}</p>
    </div>`).join('');

  const doshas = a.doshas.length ? a.doshas.map((d) => `
    <div class="dosha">
      <div class="dosha-issue">⚠ ${esc(d.issue)}</div>
      <p class="dosha-line"><span class="dl">Impact:</span> ${esc(d.impact)}</p>
      <p class="dosha-line"><span class="dl">Remedy:</span> ${esc(d.remedy)}</p>
    </div>`).join('') : '<p class="body">No significant Vaastu doshas were identified — a well-balanced home.</p>';

  const remedies = a.remedies.map((r) => `<li>${esc(r)}</li>`).join('');
  const dos = a.dos.map((d) => `<li>${esc(d)}</li>`).join('');
  const donts = a.donts.map((d) => `<li>${esc(d)}</li>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Fraunces', Georgia, 'Times New Roman', serif; color: #FDFBF7;
         background: #0B0B0D; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { min-height: 100vh; padding: 46px 40px; page-break-after: always;
          background: linear-gradient(160deg, #0B0B0D 0%, #171519 100%); }
  .page:last-child { page-break-after: auto; }
  h1, h2, h3 { font-weight: normal; letter-spacing: 0.3px; margin: 0; }
  .brand { color: #C5A059; font-size: 14px; letter-spacing: 3px; }
  .divider { height: 1px; background: linear-gradient(90deg, transparent, #C5A059, transparent);
             margin: 18px 0; }
  .cover { display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .cover .logo { font-size: 40px; color: #C5A059; margin-bottom: 8px; }
  .cover h1 { font-size: 40px; color: #FDFBF7; margin: 8px 0; }
  .cover .sub { color: #A29E95; font-size: 15px; }
  .cover .who { margin-top: 28px; color: #E4C983; font-size: 22px; }
  .cover .date { color: #6E6A62; font-size: 13px; margin-top: 6px; }
  h2.section { color: #E4C983; font-size: 24px; margin: 0 0 4px; }
  .lead { color: #A29E95; font-size: 13px; margin-bottom: 10px; }
  table.details { width: 100%; border-collapse: collapse; }
  table.details td { padding: 10px 4px; border-bottom: 1px solid #2E2A22; font-size: 15px; vertical-align: top; }
  td.k { color: #A29E95; width: 42%; }
  td.v { color: #FDFBF7; }
  p.body { font-size: 14.5px; line-height: 1.75; color: #E8E3DA; margin: 0 0 12px; }
  .dir { border-left: 2px solid #C5A059; padding: 4px 0 4px 14px; margin-bottom: 14px; }
  .dir-head { display: flex; justify-content: space-between; align-items: baseline; }
  .dir-name { color: #FDFBF7; font-size: 16px; }
  .dir-el { color: #C5A059; font-size: 12px; letter-spacing: 0.5px; }
  .dir-assess { color: #C9C4BC; font-size: 13.5px; line-height: 1.6; margin: 4px 0 0; }
  .zone { border: 1px solid #2E2A22; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px;
          background: rgba(30,27,69,0.6); }
  .zone-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
  .zone-area { color: #FDFBF7; font-size: 17px; }
  .zone-dir { color: #C5A059; font-size: 12px; letter-spacing: 1px; }
  .zone-assess { color: #C9C4BC; font-size: 13.5px; line-height: 1.6; margin: 4px 0; }
  .zone-rec { color: #E8E3DA; font-size: 13.5px; line-height: 1.6; margin: 4px 0 0; }
  .rec-label { color: #E4C983; }
  .dosha { border: 1px solid #211E26; border-radius: 10px; padding: 12px 16px; margin-bottom: 12px;
           background: rgba(60,30,40,0.25); }
  .dosha-issue { color: #E4C983; font-size: 15px; margin-bottom: 4px; }
  .dosha-line { color: #C9C4BC; font-size: 13.5px; line-height: 1.6; margin: 2px 0; }
  .dl { color: #C5A059; }
  .score-box { text-align: center; border: 1px solid #2E2A22; border-radius: 14px; padding: 26px;
               background: rgba(30,27,69,0.6); margin: 8px 0 16px; }
  .score-num { font-size: 62px; color: ${scoreColor}; }
  .score-cap { color: #A29E95; font-size: 13px; letter-spacing: 1px; }
  .verdict { color: #E8E3DA; font-size: 15px; line-height: 1.6; text-align: center; font-style: italic; }
  ul.list { padding-left: 20px; margin: 0; }
  ul.list li { font-size: 14.5px; line-height: 1.7; color: #E8E3DA; margin-bottom: 8px; }
  .two { display: flex; gap: 20px; }
  .two .col { flex: 1; }
  .col h3 { color: #E4C983; font-size: 17px; margin-bottom: 8px; }
  .foot { color: #6E6A62; font-size: 11px; text-align: center; margin-top: 28px; line-height: 1.5; }
</style></head><body>

  <section class="page cover">
    <div class="logo">✦</div>
    <div class="brand">RITHAM</div>
    <h1>Vaastu Report</h1>
    <div class="sub">A detailed Vaastu Shastra consultancy for your home</div>
    <div class="who">${name}</div>
    <div class="date">${esc(dateStr)}</div>
  </section>

  <section class="page">
    <div class="brand">RITHAM · VAASTU</div>
    <h2 class="section">Property Details</h2>
    <div class="divider"></div>
    <table class="details"><tbody>${detailRows}</tbody></table>
    <div class="divider"></div>
    <h2 class="section">Overview</h2>
    ${paras(a.overview)}
  </section>

  <section class="page">
    <div class="brand">RITHAM · VAASTU</div>
    <h2 class="section">The Eight Directions</h2>
    <p class="lead">How each direction of your home aligns with its ruling element and energy.</p>
    <div class="divider"></div>
    ${directions}
  </section>

  <section class="page">
    <div class="brand">RITHAM · VAASTU</div>
    <h2 class="section">Zone-by-Zone Analysis</h2>
    <p class="lead">A room-by-room reading of your floor plan.</p>
    <div class="divider"></div>
    ${zones}
  </section>

  <section class="page">
    <div class="brand">RITHAM · VAASTU</div>
    <h2 class="section">Doshas &amp; Key Observations</h2>
    <p class="lead">Imbalances identified, their impact, and how to remedy them.</p>
    <div class="divider"></div>
    ${doshas}
  </section>

  <section class="page">
    <div class="brand">RITHAM · VAASTU</div>
    <h2 class="section">Vaastu Score</h2>
    <div class="divider"></div>
    <div class="score-box">
      <div class="score-num">${a.score}<span style="font-size:26px;color:#A29E95">/100</span></div>
      <div class="score-cap">OVERALL VAASTU COMPLIANCE</div>
    </div>
    ${a.verdict ? `<p class="verdict">“${esc(a.verdict)}”</p>` : ''}
  </section>

  <section class="page">
    <div class="brand">RITHAM · VAASTU</div>
    <h2 class="section">Remedies &amp; Recommendations</h2>
    <p class="lead">Practical, non-intrusive steps to harmonise your home.</p>
    <div class="divider"></div>
    <ul class="list">${remedies}</ul>
  </section>

  <section class="page">
    <div class="brand">RITHAM · VAASTU</div>
    <h2 class="section">Do’s &amp; Don’ts</h2>
    <div class="divider"></div>
    <div class="two">
      <div class="col"><h3>Do</h3><ul class="list">${dos}</ul></div>
      <div class="col"><h3>Avoid</h3><ul class="list">${donts}</ul></div>
    </div>
    <div class="foot">
      Generated by Ritham · This Vaastu consultancy is offered for guidance and well-being.<br/>
      It is not a substitute for professional architectural or structural advice.
    </div>
  </section>

</body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  MATCHMAKING (Guna Milan / Ashtakoot)
//  The 36-guna score is COMPUTED here deterministically from the two charts
//  (rule #2: numbers are computed, never invented by the AI). Claude only
//  narrates the meaning around the computed table. Charts come from the client's
//  kundliService (rule #1); this function never recomputes a chart.
// ════════════════════════════════════════════════════════════════════════════

interface Placement { graha: string; sign: string; house: number }
interface Person {
  name: string;
  gender: 'male' | 'female' | 'other';
  dob: string; tob: string; birth_place: string;
  lagna: string; moon_sign: string; sun_sign: string; nakshatra: string;
  placements: Placement[];
}
interface Koota { name: string; got: number; max: number; note: string }
interface Milan {
  kootas: Koota[];
  total: number; max: number; percent: number; band: string;
  mangal: { selfManglik: boolean; partnerManglik: boolean; note: string };
  nadiDosha: boolean; bhakootDosha: boolean;
}
interface MatchAnalysis {
  overview: string; strengths: string[]; cautions: string[]; remedies: string[]; verdict: string;
}

function isPerson(p: any): p is Person {
  return !!p && typeof p === 'object'
    && typeof p.name === 'string' && p.name.length <= 120
    && typeof p.moon_sign === 'string' && typeof p.nakshatra === 'string'
    && Array.isArray(p.placements) && p.placements.length <= 30;
}

// Total-size backstop for an attacker-controllable person object that flows into a
// paid Claude prompt (guards against name/placement-string bloat). ~8 KB is far
// above any real chart (a full chart serializes to ~1 KB).
function tooBig(p: any): boolean {
  try { return JSON.stringify(p).length > 8000; } catch { return true; }
}

const M_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const M_NAK = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati',
  'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana',
  'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];

const signIdx = (s: string) => {
  const base = String(s).split('(')[0].trim();
  const i = M_SIGNS.findIndex((x) => base.toLowerCase().startsWith(x.toLowerCase()));
  return i < 0 ? 0 : i;
};
const nakIdx = (s: string) => {
  const base = String(s).split('(')[0].trim().toLowerCase();
  const i = M_NAK.findIndex((x) => x.toLowerCase() === base);
  return i < 0 ? 0 : i;
};

// sign lords (index → planet)
const LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury',
  'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const FRIENDS: Record<string, { f: string[]; e: string[] }> = {
  Sun: { f: ['Moon', 'Mars', 'Jupiter'], e: ['Venus', 'Saturn'] },
  Moon: { f: ['Sun', 'Mercury'], e: [] },
  Mars: { f: ['Sun', 'Moon', 'Jupiter'], e: ['Mercury'] },
  Mercury: { f: ['Sun', 'Venus'], e: ['Moon'] },
  Jupiter: { f: ['Sun', 'Moon', 'Mars'], e: ['Mercury', 'Venus'] },
  Venus: { f: ['Mercury', 'Saturn'], e: ['Sun', 'Moon'] },
  Saturn: { f: ['Mercury', 'Venus'], e: ['Sun', 'Moon', 'Mars'] },
};
const rel = (a: string, b: string) => {
  const r = FRIENDS[a]; if (!r) return 1;
  if (r.f.includes(b)) return 2; if (r.e.includes(b)) return 0; return 1;
};

// Varna rank by sign (Brahmin 4 > Kshatriya 3 > Vaishya 2 > Shudra 1)
const VARNA = [3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4]; // Aries..Pisces
const VARNA_NAME = ['—', 'Shudra', 'Vaishya', 'Kshatriya', 'Brahmin'];
// Vashya group by sign
const VASHYA = ['Chatushpada', 'Chatushpada', 'Dwipada', 'Jalachar', 'Vanachar', 'Dwipada',
  'Dwipada', 'Keet', 'Dwipada', 'Jalachar', 'Dwipada', 'Jalachar'];
// Yoni animal by nakshatra
const YONI = ['Horse', 'Elephant', 'Sheep', 'Serpent', 'Serpent', 'Dog', 'Cat', 'Sheep', 'Cat',
  'Rat', 'Rat', 'Cow', 'Buffalo', 'Tiger', 'Buffalo', 'Tiger', 'Deer', 'Deer', 'Dog', 'Monkey',
  'Mongoose', 'Monkey', 'Lion', 'Horse', 'Lion', 'Cow', 'Elephant'];
const YONI_ENEMIES: [string, string][] = [
  ['Cat', 'Rat'], ['Cow', 'Tiger'], ['Elephant', 'Lion'], ['Horse', 'Buffalo'],
  ['Dog', 'Deer'], ['Monkey', 'Sheep'], ['Serpent', 'Mongoose'],
];
// Gana by nakshatra: 0 Deva, 1 Manushya, 2 Rakshasa
const GANA = [0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0];
const GANA_NAME = ['Deva', 'Manushya', 'Rakshasa'];
// Nadi by nakshatra: 0 Aadi, 1 Madhya, 2 Antya
const NADI = [0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 0, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2];
const NADI_NAME = ['Aadi', 'Madhya', 'Antya'];

function computeMilan(a: Person, b: Person): Milan {
  // groom = the male chart; fall back to `a` (self) when ambiguous
  const groom = b.gender === 'male' && a.gender !== 'male' ? b : a;
  const bride = groom === a ? b : a;

  const gS = signIdx(groom.moon_sign), bS = signIdx(bride.moon_sign);
  const gN = nakIdx(groom.nakshatra), bN = nakIdx(bride.nakshatra);

  // 1 · Varna (max 1)
  const varna = VARNA[gS] >= VARNA[bS] ? 1 : 0;
  // 2 · Vashya (max 2)
  const vashya = VASHYA[gS] === VASHYA[bS] ? 2 : 1;
  // 3 · Tara / Dina (max 3)
  const taraGood = (from: number, to: number) => {
    const r = (((to - from + 27) % 27) + 1) % 9;
    return !(r === 3 || r === 5 || r === 7);
  };
  const tara = (taraGood(bN, gN) ? 1.5 : 0) + (taraGood(gN, bN) ? 1.5 : 0);
  // 4 · Yoni (max 4)
  const yoni = (() => {
    if (YONI[gN] === YONI[bN]) return 4;
    const enemy = YONI_ENEMIES.some(([x, y]) =>
      (YONI[gN] === x && YONI[bN] === y) || (YONI[gN] === y && YONI[bN] === x));
    return enemy ? 0 : 2;
  })();
  // 5 · Graha Maitri (max 5)
  const maitri = (() => {
    const sum = rel(LORDS[gS], LORDS[bS]) + rel(LORDS[bS], LORDS[gS]);
    return [0, 1, 3, 4, 5][sum]; // sum 0..4
  })();
  // 6 · Gana (max 6)
  const gana = (() => {
    const g = GANA[gN], br = GANA[bN];
    if (g === br) return 6;
    const pair = [g, br].sort().join('');
    if (pair === '01') return 5;            // Deva + Manushya
    if (pair === '12') return 1;            // Manushya + Rakshasa
    return 0;                               // Deva + Rakshasa
  })();
  // 7 · Bhakoot (max 7)
  const bhakootDosha = (() => {
    const d1 = ((bS - gS + 12) % 12) + 1;
    const d2 = ((gS - bS + 12) % 12) + 1;
    const pair = [d1, d2].sort((x, y) => x - y).join('-');
    return pair === '6-8' || pair === '2-12' || pair === '5-9';
  })();
  const bhakoot = bhakootDosha ? 0 : 7;
  // 8 · Nadi (max 8)
  const nadiDosha = NADI[gN] === NADI[bN];
  const nadi = nadiDosha ? 0 : 8;

  const kootas: Koota[] = [
    { name: 'Varna', got: varna, max: 1, note: `${VARNA_NAME[VARNA[gS]]} · ${VARNA_NAME[VARNA[bS]]} — spiritual compatibility & ego balance.` },
    { name: 'Vashya', got: vashya, max: 2, note: `${VASHYA[gS]} · ${VASHYA[bS]} — mutual attraction and influence.` },
    { name: 'Tara / Dina', got: tara, max: 3, note: 'Health, fortune and longevity of the bond (birth-star count).' },
    { name: 'Yoni', got: yoni, max: 4, note: `${YONI[gN]} · ${YONI[bN]} — physical & intimate compatibility.` },
    { name: 'Graha Maitri', got: maitri, max: 5, note: `${LORDS[gS]} · ${LORDS[bS]} — mental affinity and friendship of sign lords.` },
    { name: 'Gana', got: gana, max: 6, note: `${GANA_NAME[GANA[gN]]} · ${GANA_NAME[GANA[bN]]} — temperament and nature.` },
    { name: 'Bhakoot', got: bhakoot, max: 7, note: bhakootDosha ? 'Bhakoot dosha present — prosperity & harmony need care.' : 'Moon-sign harmony — love, family and prosperity.' },
    { name: 'Nadi', got: nadi, max: 8, note: nadiDosha ? 'Nadi dosha present — health & progeny; remedy advised.' : `${NADI_NAME[NADI[gN]]} · ${NADI_NAME[NADI[bN]]} — health & genetic compatibility.` },
  ];

  const total = kootas.reduce((s, k) => s + k.got, 0);
  const percent = Math.round((total / 36) * 100);
  const band = total >= 28 ? 'Excellent' : total >= 22 ? 'Very Good' : total >= 18 ? 'Good' : total >= 14 ? 'Average' : 'Challenging';

  const manglik = (p: Person) => p.placements.some((pl) =>
    /mars|mangal/i.test(pl.graha) && [1, 2, 4, 7, 8, 12].includes(pl.house));
  const gm = manglik(groom), bm = manglik(bride);
  const mangal = {
    selfManglik: a === groom ? gm : bm,
    partnerManglik: a === groom ? bm : gm,
    note: gm && bm
      ? 'Both charts are Manglik — the dosha is considered mutually cancelled.'
      : (gm || bm)
        ? 'One chart is Manglik while the other is not — a simple remedial parihara is advised before marriage.'
        : 'Neither chart carries Mangal (Manglik) dosha.',
  };

  return { kootas, total, max: 36, percent, band, mangal, nadiDosha, bhakootDosha };
}

// ── narration (Claude narrates the computed milan; mock until key set) ──────────
async function generateMatch(a: Person, b: Person, m: Milan, lang: Lang = 'en'): Promise<MatchAnalysis> {
  if (!ANTHROPIC_API_KEY) return mockMatch(a, b, m);
  try {
    return await generateMatchLive(a, b, m, lang);
  } catch (err) {
    // Never hard-fail a paid report: the Guna Milan scores are already computed; fall
    // back to the mock narration around them.
    console.error('match narration failed, using mock', String((err as Error)?.message ?? err));
    return mockMatch(a, b, m);
  }
}

async function generateMatchLive(a: Person, b: Person, m: Milan, lang: Lang = 'en'): Promise<MatchAnalysis> {
  const table = m.kootas.map((k) => `${k.name}: ${k.got}/${k.max}`).join(', ');
  const system =
    `You are a warm, experienced Vedic astrologer writing a premium marriage-compatibility ` +
    `(Guna Milan / Ashtakoot) consultancy. The 36-guna scores are ALREADY COMPUTED and given ` +
    `to you — narrate their meaning for this couple with sensitivity and encouragement; do NOT ` +
    `change any number or invent placements. Total is ${m.total}/36 (${m.percent}%). ` +
    `Mangal: ${m.mangal.note} ` +
    `Return ONLY valid JSON (no markdown, no code fences) with EXACTLY these keys:\n` +
    `{\n` +
    `  "overview": string (2-3 warm paragraphs on the overall compatibility),\n` +
    `  "strengths": [string] (5-7 strengths grounded in the high-scoring kootas),\n` +
    `  "cautions": [string] (3-5 gentle cautions from the low-scoring kootas / doshas),\n` +
    `  "remedies": [string] (5-8 practical remedies — mantras, poojas, gemstones, conduct),\n` +
    `  "verdict": string (one encouraging sentence)\n` +
    `}` + (lang === 'hi' ? HINDI_REPORT_DIRECTIVE : '');
  const userText =
    `Partner A: ${a.name}, Moon in ${a.moon_sign}, Nakshatra ${a.nakshatra}, Lagna ${a.lagna}.\n` +
    `Partner B: ${b.name}, Moon in ${b.moon_sign}, Nakshatra ${b.nakshatra}, Lagna ${b.lagna}.\n` +
    `Computed Ashtakoot: ${table}. Total ${m.total}/36.\n` +
    `Write the complete JSON compatibility report.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: lang === 'hi' ? 9000 : 6000, thinking: { type: 'disabled' }, system,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content ?? []).find((x: any) => x.type === 'text')?.text ?? '';
  const obj = parseJsonReply(text);
  const arr = (v: any) => (Array.isArray(v) ? v.map(String) : []);
  return {
    overview: String(obj.overview ?? ''),
    strengths: arr(obj.strengths).slice(0, 8),
    cautions: arr(obj.cautions).slice(0, 6),
    remedies: arr(obj.remedies).slice(0, 10),
    verdict: String(obj.verdict ?? ''),
  };
}

function mockMatch(a: Person, b: Person, m: Milan): MatchAnalysis {
  const strong = m.kootas.filter((k) => k.got / k.max >= 0.75).map((k) => k.name);
  const weak = m.kootas.filter((k) => k.got / k.max < 0.5).map((k) => k.name);
  return {
    overview:
      `(Preview report — the full AI narration activates once the Claude API key is set. The ` +
      `Guna Milan scores below are already fully computed and final.)\n\n` +
      `The union of ${a.name} and ${b.name} scores ${m.total} out of 36 gunas (${m.percent}%), ` +
      `placing this match in the “${m.band}” band. In Vedic tradition a total of 18 or more is ` +
      `considered favourable for marriage, so this pairing rests on a ${m.total >= 18 ? 'sound and ' +
      'promising' : 'workable but attentive'} foundation.\n\n` +
      `${m.mangal.note} The strongest areas of harmony emerge through ` +
      `${strong.length ? strong.join(', ') : 'several balanced kootas'}, while gentle attention is ` +
      `invited in ${weak.length ? weak.join(', ') : 'a few softer areas'}. With mutual understanding ` +
      `and the remedies noted here, the couple can nurture a warm, stable and prosperous life together.`,
    strengths: [
      `A combined Guna Milan of ${m.total}/36 — ${m.band.toLowerCase()} overall compatibility.`,
      ...m.kootas.filter((k) => k.got / k.max >= 0.6)
        .map((k) => `${k.name} (${k.got}/${k.max}): ${k.note}`),
    ].slice(0, 7),
    cautions: [
      ...(m.nadiDosha ? ['Nadi dosha is present — traditionally the most significant; a remedy is recommended before marriage.'] : []),
      ...(m.bhakootDosha ? ['Bhakoot dosha is present — attend to financial and family harmony with patience.'] : []),
      ...m.kootas.filter((k) => k.got / k.max < 0.5 && k.name !== 'Nadi' && k.name !== 'Bhakoot')
        .map((k) => `${k.name} scored ${k.got}/${k.max} — ${k.note}`),
    ].slice(0, 5),
    remedies: [
      'Perform a Guna Milan / compatibility pooja before fixing the marriage date.',
      m.nadiDosha ? 'For Nadi dosha: recite the Maha Mrityunjaya mantra and perform a Nadi Nivarana pooja.' : 'Recite the Maha Mrityunjaya mantra together on auspicious days for health and longevity.',
      m.mangal.selfManglik || m.mangal.partnerManglik ? 'For Mangal dosha: worship Lord Hanuman on Tuesdays and offer red flowers to Mangal.' : 'Honour Lord Vishnu and Goddess Lakshmi together for a harmonious married life.',
      'Choose a wedding muhurta with a strong, mutually benefic Moon.',
      'Keep a regular joint practice of gratitude, honest communication and small acts of service.',
      'Consult a qualified astrologer for a detailed dasha-sandhi and transit review nearer the wedding.',
    ],
    verdict: m.total >= 18
      ? 'A promising and well-matched union — nurtured with love and the noted remedies, it can flourish beautifully.'
      : 'A union that can thrive with mutual understanding, patience and the remedies suggested here.',
  };
}

// ── chart diagrams (North diamond / South grid), built from placements ─────────
const GRAHA_ABBR: [RegExp, string][] = [
  [/sun|surya/i, 'Su'], [/moon|chandra/i, 'Mo'], [/mars|mangal/i, 'Ma'], [/mercury|budha/i, 'Me'],
  [/jupiter|guru/i, 'Ju'], [/venus|shukra/i, 'Ve'], [/saturn|shani/i, 'Sa'], [/rahu/i, 'Ra'], [/ketu/i, 'Ke'],
];
const abbr = (g: string) => (GRAHA_ABBR.find(([re]) => re.test(g))?.[1]) ?? g.slice(0, 2);

// grahas grouped by the sign index (0-11) they occupy
function bySign(p: Person): string[][] {
  const out: string[][] = Array.from({ length: 12 }, () => []);
  for (const pl of p.placements) out[signIdx(pl.sign)].push(abbr(pl.graha));
  return out;
}

function northChart(p: Person): string {
  const lag = signIdx(p.lagna);
  const occ = bySign(p);
  // house → screen anchor (standard North Indian layout, house 1 top-centre)
  const anchors = [
    [130, 52], [70, 28], [28, 70], [58, 130], [28, 190], [70, 232],
    [130, 208], [190, 232], [232, 190], [202, 130], [232, 70], [190, 28],
  ];
  const cells = anchors.map(([x, y], h) => {
    const sign = (lag + h) % 12; // house h+1 holds this sign
    const gr = occ[sign];
    const grText = gr.length
      ? `<text x="${x}" y="${y + 12}" class="cg">${gr.join(' ')}</text>` : '';
    return `<text x="${x}" y="${y}" class="cs">${sign + 1}</text>${grText}`;
  }).join('');
  return `<svg viewBox="0 0 260 260" class="chart">
    <rect x="10" y="10" width="240" height="240" class="cl"/>
    <line x1="10" y1="10" x2="250" y2="250" class="cl"/>
    <line x1="250" y1="10" x2="10" y2="250" class="cl"/>
    <polygon points="130,10 250,130 130,250 10,130" class="cl"/>
    ${cells}
  </svg>`;
}

function southChart(p: Person): string {
  const lag = signIdx(p.lagna);
  const occ = bySign(p);
  // sign index at each of the 16 grid cells (centre 4 are blank = -1)
  const grid = [
    11, 0, 1, 2,
    10, -1, -1, 3,
    9, -1, -1, 4,
    8, 7, 6, 5,
  ];
  const cells = grid.map((sign, i) => {
    if (sign < 0) {
      // one of the four blank centre cells — mark the first with the logo
      return `<div class="sc mid">${i === 5 ? '✦' : ''}</div>`;
    }
    const isLagna = sign === lag;
    const gr = occ[sign];
    return `<div class="sc${isLagna ? ' lag' : ''}">
      <span class="ss">${M_SIGNS[sign].slice(0, 3)}${isLagna ? ' · As' : ''}</span>
      <span class="sg">${gr.join(' ')}</span></div>`;
  }).join('');
  return `<div class="sgrid">${cells}</div>`;
}

function renderChart(p: Person, style: 'north' | 'south'): string {
  return style === 'south' ? southChart(p) : northChart(p);
}

function renderMatchHtml(a: Person, b: Person, m: Milan, x: MatchAnalysis, style: 'north' | 'south'): string {
  const dateStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  const scoreColor = m.percent >= 66 ? '#7FA36F' : m.percent >= 44 ? '#E4C983' : '#C7524B';
  const fmt = (p: Person) => {
    const [y, mo, d] = p.dob.split('-');
    return `${Number(d)}/${Number(mo)}/${y} · ${p.tob.slice(0, 5)} · ${esc(p.birth_place)}`;
  };
  const personDetails = (p: Person) => `
    <table class="details"><tbody>
      <tr><td class="k">Name</td><td class="v">${esc(p.name)}</td></tr>
      <tr><td class="k">Birth</td><td class="v">${fmt(p)}</td></tr>
      <tr><td class="k">Lagna</td><td class="v">${esc(p.lagna)}</td></tr>
      <tr><td class="k">Moon sign</td><td class="v">${esc(p.moon_sign)}</td></tr>
      <tr><td class="k">Nakshatra</td><td class="v">${esc(p.nakshatra)}</td></tr>
    </tbody></table>`;

  const kootaRows = m.kootas.map((k) => `
    <tr>
      <td class="kn">${esc(k.name)}</td>
      <td class="kp"><span style="color:${k.got >= k.max * 0.5 ? '#7FA36F' : '#C5A059'}">${k.got}</span> / ${k.max}</td>
      <td class="kd">${esc(k.note)}</td>
    </tr>`).join('');

  const strengths = x.strengths.map((s) => `<li>${esc(s)}</li>`).join('');
  const cautions = x.cautions.length ? x.cautions.map((s) => `<li>${esc(s)}</li>`).join('')
    : '<li>No significant doshas — a naturally well-aligned match.</li>';
  const remedies = x.remedies.map((s) => `<li>${esc(s)}</li>`).join('');

  const styleLabel = style === 'south' ? 'South Indian' : 'North Indian';

  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Fraunces', Georgia, 'Times New Roman', serif; color: #FDFBF7;
         background: #0B0B0D; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { min-height: 100vh; padding: 46px 40px; page-break-after: always;
          background: linear-gradient(160deg, #0B0B0D 0%, #171519 100%); }
  .page:last-child { page-break-after: auto; }
  h1, h2, h3 { font-weight: normal; margin: 0; }
  .brand { color: #C5A059; font-size: 14px; letter-spacing: 3px; }
  .divider { height: 1px; background: linear-gradient(90deg, transparent, #C5A059, transparent); margin: 18px 0; }
  .cover { display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .cover .logo { font-size: 40px; color: #C5A059; }
  .cover h1 { font-size: 38px; color: #FDFBF7; margin: 8px 0; }
  .cover .sub { color: #A29E95; font-size: 15px; }
  .pair { margin-top: 30px; color: #E4C983; font-size: 24px; }
  .pair .amp { color: #C5A059; font-size: 18px; margin: 0 10px; }
  .cover .date { color: #6E6A62; font-size: 13px; margin-top: 8px; }
  h2.section { color: #E4C983; font-size: 24px; margin: 0 0 4px; }
  .lead { color: #A29E95; font-size: 13px; margin-bottom: 10px; }
  p.body { font-size: 14.5px; line-height: 1.75; color: #E8E3DA; margin: 0 0 12px; }
  table.details { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  table.details td { padding: 7px 4px; border-bottom: 1px solid #2E2A22; font-size: 13.5px; vertical-align: top; }
  td.k { color: #A29E95; width: 34%; } td.v { color: #FDFBF7; }
  .who { color: #E4C983; font-size: 17px; margin: 14px 0 6px; }
  /* score */
  .score-box { text-align: center; border: 1px solid #2E2A22; border-radius: 14px; padding: 22px;
               background: rgba(30,27,69,0.6); margin: 8px 0 16px; }
  .score-num { font-size: 58px; color: ${scoreColor}; }
  .score-cap { color: #A29E95; font-size: 13px; letter-spacing: 1px; }
  .band { color: ${scoreColor}; font-size: 16px; letter-spacing: 1px; margin-top: 4px; }
  .verdict { color: #E8E3DA; font-size: 15px; line-height: 1.6; text-align: center; font-style: italic; }
  /* koota table */
  table.koota { width: 100%; border-collapse: collapse; }
  table.koota th { text-align: left; color: #A29E95; font-size: 11px; letter-spacing: 1px;
                   padding: 6px 6px; border-bottom: 1px solid #C5A059; }
  table.koota td { padding: 9px 6px; border-bottom: 1px solid #2E2A22; vertical-align: top; }
  td.kn { color: #FDFBF7; font-size: 14px; width: 22%; }
  td.kp { color: #E8E3DA; font-size: 15px; width: 16%; }
  td.kd { color: #C9C4BC; font-size: 12.5px; line-height: 1.5; }
  tr.tot td { border-top: 1px solid #C5A059; color: #E4C983; font-size: 15px; padding-top: 10px; }
  ul.list { padding-left: 20px; margin: 0; }
  ul.list li { font-size: 14px; line-height: 1.65; color: #E8E3DA; margin-bottom: 7px; }
  /* charts */
  .charts { display: flex; gap: 18px; }
  .charts .col { flex: 1; text-align: center; }
  .col h3 { color: #E4C983; font-size: 15px; margin-bottom: 8px; }
  svg.chart { width: 100%; max-width: 240px; }
  svg.chart .cl { fill: none; stroke: #C5A059; stroke-width: 1; }
  svg.chart .cs { fill: #8B8478; font-size: 9px; text-anchor: middle; }
  svg.chart .cg { fill: #FDFBF7; font-size: 11px; text-anchor: middle; }
  .sgrid { display: grid; grid-template-columns: repeat(4,1fr); grid-template-rows: repeat(4,52px);
           border: 1px solid #C5A059; max-width: 240px; margin: 0 auto; }
  .sc { border: 0.5px solid #2E2A22; padding: 3px; display: flex; flex-direction: column;
        align-items: flex-start; justify-content: flex-start; overflow: hidden; }
  .sc.lag { background: rgba(217,164,65,0.16); }
  .sc.mid { align-items: center; justify-content: center; color: #C5A059; font-size: 11px; border: none; }
  .ss { color: #8B8478; font-size: 9px; }
  .sg { color: #FDFBF7; font-size: 11px; line-height: 1.25; }
  .chartnote { color: #6E6A62; font-size: 11px; text-align: center; margin-top: 10px; }
  .foot { color: #6E6A62; font-size: 11px; text-align: center; margin-top: 28px; line-height: 1.5; }
</style></head><body>

  <section class="page cover">
    <div class="logo">✦</div>
    <div class="brand">RITHAM</div>
    <h1>Matchmaking Report</h1>
    <div class="sub">Vedic marriage compatibility · Ashtakoot Guna Milan</div>
    <div class="pair">${esc(a.name)}<span class="amp">&</span>${esc(b.name)}</div>
    <div class="date">${esc(dateStr)}</div>
  </section>

  <section class="page">
    <div class="brand">RITHAM · MATCHMAKING</div>
    <h2 class="section">Birth Details</h2>
    <div class="divider"></div>
    <div class="who">${esc(a.name)}</div>
    ${personDetails(a)}
    <div class="who">${esc(b.name)}</div>
    ${personDetails(b)}
  </section>

  <section class="page">
    <div class="brand">RITHAM · MATCHMAKING</div>
    <h2 class="section">Birth Charts</h2>
    <p class="lead">${styleLabel} style · Moon-sign (Rashi) charts of both partners.</p>
    <div class="divider"></div>
    <div class="charts">
      <div class="col"><h3>${esc(a.name)}</h3>${renderChart(a, style)}</div>
      <div class="col"><h3>${esc(b.name)}</h3>${renderChart(b, style)}</div>
    </div>
    <p class="chartnote">Su Sun · Mo Moon · Ma Mars · Me Mercury · Ju Jupiter · Ve Venus · Sa Saturn · Ra Rahu · Ke Ketu</p>
  </section>

  <section class="page">
    <div class="brand">RITHAM · MATCHMAKING</div>
    <h2 class="section">Ashtakoot Guna Milan</h2>
    <p class="lead">The eight kootas of compatibility, scored out of 36.</p>
    <div class="divider"></div>
    <table class="koota">
      <thead><tr><th>KOOTA</th><th>POINTS</th><th>MEANING</th></tr></thead>
      <tbody>
        ${kootaRows}
        <tr class="tot"><td class="kn">Total</td><td class="kp">${m.total} / 36</td><td class="kd">${m.percent}% · ${esc(m.band)}</td></tr>
      </tbody>
    </table>
  </section>

  <section class="page">
    <div class="brand">RITHAM · MATCHMAKING</div>
    <h2 class="section">Compatibility Score</h2>
    <div class="divider"></div>
    <div class="score-box">
      <div class="score-num">${m.percent}<span style="font-size:24px;color:#A29E95">%</span></div>
      <div class="score-cap">${m.total} / 36 GUNAS MATCHED</div>
      <div class="band">${esc(m.band)}</div>
    </div>
    ${x.verdict ? `<p class="verdict">“${esc(x.verdict)}”</p>` : ''}
    <div class="divider"></div>
    <h2 class="section">Overview</h2>
    ${paras(x.overview)}
  </section>

  <section class="page">
    <div class="brand">RITHAM · MATCHMAKING</div>
    <h2 class="section">Strengths</h2>
    <div class="divider"></div>
    <ul class="list">${strengths}</ul>
    <h2 class="section" style="margin-top:22px;">Points to Nurture</h2>
    <div class="divider"></div>
    <ul class="list">${cautions}</ul>
  </section>

  <section class="page">
    <div class="brand">RITHAM · MATCHMAKING</div>
    <h2 class="section">Mangal Dosha</h2>
    <div class="divider"></div>
    <p class="body">${esc(m.mangal.note)}</p>
    <h2 class="section" style="margin-top:22px;">Remedies &amp; Recommendations</h2>
    <div class="divider"></div>
    <ul class="list">${remedies}</ul>
    <div class="foot">
      Generated by Ritham · This compatibility reading is offered for guidance and well-being,<br/>
      in the spirit of Vedic tradition. It is not a substitute for personal judgement or counsel.
    </div>
  </section>

</body></html>`;
}




// ════════════════════════════════════════════════════════════════════════════
//  Inlined chart-report engine (single-file deploy). Wrapped in `namespace Chart`
//  so its helpers do not collide with the Vastu/Matchmaking helpers above.
// ════════════════════════════════════════════════════════════════════════════
namespace Chart {
// chart.ts — pure, self-contained engine for the five single-person chart reports
// (life / career / love / health / education).
//
// Design (Ritham rules #1 & #2):
//   • The birth chart itself comes from the client's kundliService (rule #1). This
//     module NEVER fetches or recomputes a chart — it only DERIVES facts from the
//     placements it is handed (houses, house lords, Vimshottari dasha timeline,
//     yogas, thematic strengths). All of that is COMPUTED deterministically.
//   • Claude only NARRATES around the computed facts (rule #2). Until an API key is
//     set, a thorough type-specific MOCK narration is produced so previews show the
//     full depth and styling the final report will have.
//
// This file is dependency-free (no supabase-js, no Deno globals except `fetch`,
// which exists in both Deno and Node 18+), so it can be unit-run to generate sample
// PDFs. index.ts imports it and wires the entitlement / storage / DB around it.

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────
export type ChartReportType = 'life' | 'career' | 'love' | 'health' | 'education' | 'pastlife';
export const CHART_TYPES: ChartReportType[] = ['life', 'career', 'love', 'health', 'education', 'pastlife'];
export function isChartType(t: unknown): t is ChartReportType {
  return typeof t === 'string' && (CHART_TYPES as string[]).includes(t);
}

export interface ChartPlacement { graha: string; sign: string; house: number }
export interface ChartPerson {
  name: string;
  gender?: 'male' | 'female' | 'other';
  dob: string;  // YYYY-MM-DD
  tob: string;  // HH:MM:SS
  birth_place: string;
  lagna: string;
  moon_sign: string;
  sun_sign: string;
  nakshatra: string;
  placements: ChartPlacement[];
}

export interface PlanetPos { name: string; sign: string; signIdx: number; house: number; dignity: Dignity }
export type Dignity = 'Exalted' | 'Debilitated' | 'Own sign' | 'Neutral';
export interface HouseInfo {
  house: number; sign: string; signIdx: number; lord: string;
  lordHouse: number | null; lordDignity: Dignity | null;
  occupants: { name: string; dignity: Dignity }[];
  strength: number; // 0-100
}
export interface Yoga { name: string; nature: 'benefic' | 'caution'; detail: string }
export interface MahaPeriod { lord: string; start: Date; end: Date; years: number; fullYears: number }
export interface AntarPeriod { lord: string; start: Date; end: Date; years: number }
export interface DashaInfo {
  birth: Date;
  periods: MahaPeriod[];
  current: MahaPeriod;
  antars: AntarPeriod[];
  currentAntar: AntarPeriod;
  upcoming: MahaPeriod[];
}
export interface ChartFacts {
  lagnaIdx: number;
  planets: Record<string, PlanetPos>;
  houses: HouseInfo[];
  yogas: Yoga[];
  dasha: DashaInfo;
  score: number; // thematic strength for the report focus (0-100)
}
export interface ChartAnalysis {
  overview: string;
  sections: { heading: string; body: string; points: string[] }[];
  timing: string;
  guidance: string[];
  remedies: string[];
  verdict: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────────────────
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const NAK = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati',
  'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana',
  'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];
// sign lord by sign index (0 Aries .. 11 Pisces)
const LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury',
  'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const OWN: Record<string, number[]> = {
  Sun: [4], Moon: [3], Mars: [0, 7], Mercury: [2, 5], Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10],
};
const EXALT: Record<string, number> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const DEBIL: Record<string, number> = { Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0 };
const BENEFIC = new Set(['Jupiter', 'Venus', 'Mercury', 'Moon']);
const MALEFIC = new Set(['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu']);

const GRAHA_ABBR: [RegExp, string][] = [
  [/sun|surya/i, 'Su'], [/moon|chandra/i, 'Mo'], [/mars|mangal/i, 'Ma'], [/mercury|budha/i, 'Me'],
  [/jupiter|guru/i, 'Ju'], [/venus|shukra/i, 'Ve'], [/saturn|shani/i, 'Sa'], [/rahu/i, 'Ra'], [/ketu/i, 'Ke'],
];
const CANON: [RegExp, string][] = [
  [/sun|surya/i, 'Sun'], [/moon|chandra/i, 'Moon'], [/mars|mangal/i, 'Mars'], [/mercury|budha/i, 'Mercury'],
  [/jupiter|guru/i, 'Jupiter'], [/venus|shukra/i, 'Venus'], [/saturn|shani/i, 'Saturn'], [/rahu/i, 'Rahu'], [/ketu/i, 'Ketu'],
];
const canon = (g: string) => CANON.find(([re]) => re.test(g))?.[1] ?? String(g).split('(')[0].trim();
const abbr = (g: string) => GRAHA_ABBR.find(([re]) => re.test(g))?.[1] ?? g.slice(0, 2);

const signIdx = (s: string) => {
  const base = String(s).split('(')[0].trim();
  const i = SIGNS.findIndex((x) => base.toLowerCase().startsWith(x.toLowerCase()));
  return i < 0 ? 0 : i;
};
const nakIdx = (s: string) => {
  const base = String(s).split('(')[0].trim().toLowerCase();
  const i = NAK.findIndex((x) => x.toLowerCase() === base);
  return i < 0 ? 0 : i;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

function dignity(planet: string, si: number): Dignity {
  if (EXALT[planet] === si) return 'Exalted';
  if (DEBIL[planet] === si) return 'Debilitated';
  if (OWN[planet]?.includes(si)) return 'Own sign';
  return 'Neutral';
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Per-report metadata
// ─────────────────────────────────────────────────────────────────────────────
interface Meta { title: string; sub: string; brand: string; focus: number[]; scoreCap: string }
export const CHART_META: Record<ChartReportType, Meta> = {
  life: { title: 'Complete Kundli Analysis', sub: 'A comprehensive Vedic life reading', brand: 'LIFE REPORT',
    focus: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], scoreCap: 'OVERALL CHART STRENGTH' },
  career: { title: 'Career & Finance Report', sub: 'Vocation, wealth & professional timing', brand: 'CAREER & FINANCE',
    focus: [10, 2, 11, 6, 7, 9], scoreCap: 'CAREER & WEALTH STRENGTH' },
  love: { title: 'Love & Relationship Report', sub: 'Romance, partnership & marital harmony', brand: 'LOVE & RELATIONSHIP',
    focus: [7, 5, 2, 8], scoreCap: 'RELATIONSHIP STRENGTH' },
  health: { title: 'Health & Wellbeing Report', sub: 'Constitution, vitality & lifestyle', brand: 'HEALTH & WELLBEING',
    focus: [1, 6, 8, 12], scoreCap: 'CONSTITUTIONAL STRENGTH' },
  education: { title: 'Education & Career Report', sub: 'Studies, intellect & academic direction', brand: 'EDUCATION · STUDENTS',
    focus: [4, 5, 9, 2], scoreCap: 'ACADEMIC STRENGTH' },
  pastlife: { title: 'Past Life Predictions', sub: 'Karmic patterns & soul lessons across lifetimes', brand: 'PAST LIFE · KARMIC READING',
    focus: [5, 9, 12, 8, 4], scoreCap: 'KARMIC DEPTH' },
};

// ─────────────────────────────────────────────────────────────────────────────
//  Compute chart facts (deterministic)
// ─────────────────────────────────────────────────────────────────────────────
export function computeChartFacts(p: ChartPerson, type: ChartReportType): ChartFacts {
  const lagnaIdx = signIdx(p.lagna);
  const planets: Record<string, PlanetPos> = {};
  for (const pl of p.placements) {
    const name = canon(pl.graha);
    const si = signIdx(pl.sign);
    planets[name] = { name, sign: SIGNS[si], signIdx: si, house: pl.house, dignity: dignity(name, si) };
  }

  const houses: HouseInfo[] = [];
  for (let h = 1; h <= 12; h++) {
    const si = (lagnaIdx + h - 1) % 12;
    const lord = LORDS[si];
    const lp = planets[lord];
    const occupants = p.placements
      .filter((x) => x.house === h)
      .map((x) => ({ name: canon(x.graha), dignity: dignity(canon(x.graha), signIdx(x.sign)) }));
    houses.push({
      house: h, sign: SIGNS[si], signIdx: si, lord,
      lordHouse: lp ? lp.house : null, lordDignity: lp ? lp.dignity : null,
      occupants, strength: 0,
    });
  }
  for (const h of houses) h.strength = houseStrength(h);

  const yogas = detectYogas(planets);
  const dasha = computeDasha(p);

  const focus = CHART_META[type].focus;
  const avg = focus.reduce((s, h) => s + houses[h - 1].strength, 0) / focus.length;
  const score = clamp(avg, 45, 90);

  return { lagnaIdx, planets, houses, yogas, dasha, score };
}

function houseStrength(h: HouseInfo): number {
  let s = 52;
  for (const o of h.occupants) {
    if (BENEFIC.has(o.name)) s += 9;
    if (MALEFIC.has(o.name)) s -= 6;
    if (o.dignity === 'Exalted') s += 8;
    else if (o.dignity === 'Own sign') s += 5;
    else if (o.dignity === 'Debilitated') s -= 8;
  }
  if (h.lordHouse) {
    if ([1, 4, 5, 7, 9, 10].includes(h.lordHouse)) s += 10;
    else if ([6, 8, 12].includes(h.lordHouse)) s -= 9;
    if (h.lordDignity === 'Exalted') s += 6;
    else if (h.lordDignity === 'Debilitated') s -= 6;
  }
  return clamp(s, 20, 95);
}

function detectYogas(planets: Record<string, PlanetPos>): Yoga[] {
  const y: Yoga[] = [];
  const { Moon: moon, Jupiter: jup, Sun: sun, Mercury: merc, Mars: mars, Venus: ven, Saturn: sat } = planets;
  const dist = (from: number, to: number) => ((to - from + 12) % 12) + 1;
  const kendra = (hh: number) => [1, 4, 7, 10].includes(hh);

  if (moon && jup && [1, 4, 7, 10].includes(dist(moon.house, jup.house)))
    y.push({ name: 'Gajakesari Yoga', nature: 'benefic', detail: 'Jupiter sits in a kendra from the Moon — a classic yoga for wisdom, good reputation, and rising fortune.' });
  if (sun && merc && sun.signIdx === merc.signIdx)
    y.push({ name: 'Budha-Aditya Yoga', nature: 'benefic', detail: 'The Sun and Mercury unite — sharp intellect, articulate communication, and recognition through the mind.' });
  if (moon && mars && moon.signIdx === mars.signIdx)
    y.push({ name: 'Chandra-Mangala Yoga', nature: 'benefic', detail: 'Moon with Mars — drive, enterprise, and a knack for turning effort into earnings.' });

  const mp: [PlanetPos | undefined, string, string][] = [
    [mars, 'Ruchaka', 'courage, leadership and physical vitality'],
    [merc, 'Bhadra', 'intellect, eloquence and business acumen'],
    [jup, 'Hamsa', 'wisdom, virtue and spiritual grace'],
    [ven, 'Malavya', 'charm, comforts and artistic refinement'],
    [sat, 'Shasha', 'discipline, endurance and authority'],
  ];
  for (const [pl, nm, gift] of mp)
    if (pl && kendra(pl.house) && (pl.dignity === 'Own sign' || pl.dignity === 'Exalted'))
      y.push({ name: `${nm} Yoga`, nature: 'benefic', detail: `${pl.name} is powerful in a kendra — a Pancha-Mahapurusha yoga granting ${gift}.` });

  for (const nm of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']) {
    const pl = planets[nm];
    if (pl?.dignity === 'Exalted')
      y.push({ name: `Exalted ${nm}`, nature: 'benefic', detail: `${nm} is exalted in ${pl.sign}, lending its significations unusual strength and clarity.` });
    if (pl?.dignity === 'Debilitated')
      y.push({ name: `Debilitated ${nm}`, nature: 'caution', detail: `${nm} is placed in its sign of debilitation (${pl.sign}) — an area that asks for conscious effort, and which often improves greatly with the right remedy.` });
  }
  return y.slice(0, 10);
}

// ── Vimshottari Mahadasha ──────────────────────────────────────────────────────
const DASHA_SEQ: [string, number][] = [
  ['Ketu', 7], ['Venus', 20], ['Sun', 6], ['Moon', 10], ['Mars', 7],
  ['Rahu', 18], ['Jupiter', 16], ['Saturn', 19], ['Mercury', 17],
];
const NAK_LORD_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const seqFrom = (lord: string) => {
  const i = DASHA_SEQ.findIndex((x) => x[0] === lord);
  return [...DASHA_SEQ.slice(i), ...DASHA_SEQ.slice(0, i)];
};
const YMS = 365.2425 * 86400000;
const addYears = (d: Date, yrs: number) => new Date(d.getTime() + yrs * YMS);
const parseDate = (s: string) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y || 1990, (m || 1) - 1, d || 1);
};

function computeDasha(p: ChartPerson): DashaInfo {
  const startLord = NAK_LORD_ORDER[nakIdx(p.nakshatra) % 9];
  const frac = (hashStr(`${p.dob}|${p.tob}|${p.name}`) % 1000) / 1000; // elapsed fraction of birth nakshatra
  const seq = seqFrom(startLord);
  const birth = parseDate(p.dob);

  const periods: MahaPeriod[] = [];
  let cursor = new Date(birth);
  for (let i = 0; i < seq.length; i++) {
    const [lord, yrs] = seq[i];
    const dur = i === 0 ? yrs * (1 - frac) : yrs;
    const start = new Date(cursor);
    const end = addYears(cursor, dur);
    periods.push({ lord, start, end, years: dur, fullYears: yrs });
    cursor = end;
  }

  const now = new Date();
  const current = periods.find((pp) => now >= pp.start && now < pp.end) ?? periods[0];
  const antars = computeAntars(current);
  const currentAntar = antars.find((a) => now >= a.start && now < a.end) ?? antars[0];
  const upcoming = periods.filter((pp) => pp.start > now).slice(0, 4);
  return { birth, periods, current, antars, currentAntar, upcoming };
}

function computeAntars(m: MahaPeriod): AntarPeriod[] {
  const out: AntarPeriod[] = [];
  let c = new Date(m.start);
  for (const [lord, yrs] of seqFrom(m.lord)) {
    const dur = m.years * (yrs / 120);
    const start = new Date(c);
    const end = addYears(c, dur);
    out.push({ lord, start, end, years: dur });
    c = end;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Narration — Claude narrates the computed facts (mock until API key set)
// ─────────────────────────────────────────────────────────────────────────────
export async function narrateChart(
  type: ChartReportType, p: ChartPerson, facts: ChartFacts,
  opts: { apiKey?: string; model?: string; lang?: 'en' | 'hi' } = {},
): Promise<ChartAnalysis> {
  if (!opts.apiKey) return mockChart(type, p, facts);
  const lang = opts.lang === 'hi' ? 'hi' : 'en';

  // The live narration is best-effort: if Claude errors, refuses, times out, or returns
  // truncated/invalid JSON, we fall back to the deterministic mock narration so the report
  // ALWAYS completes (rule: a paid report must never hard-fail — the chart facts are the
  // substance; the narration is a wrapper). `life` gets a large token budget because its
  // JSON is big and truncation there produces unparseable JSON.
  try {
    const model = opts.model ?? 'claude-sonnet-5';
    const factSheet = buildFactSheet(type, p, facts);
    const system = buildSystem(type, lang);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        // Hindi (Devanagari) tokenises heavier — raise the budget so the JSON, especially
        // the large `life` report, is not truncated into unparseable output.
        model, max_tokens: lang === 'hi'
          ? (type === 'life' ? 24000 : type === 'pastlife' ? 16000 : 12000)
          : (type === 'life' ? 16000 : type === 'pastlife' ? 12000 : 8000),
        thinking: { type: 'disabled' }, system,
        messages: [{ role: 'user', content: factSheet }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.stop_reason === 'refusal') throw new Error('narration_refused');
    const text = (data.content ?? []).find((b: any) => b.type === 'text')?.text ?? '';
    const obj = parseJsonReply(text);
    const arr = (v: any) => (Array.isArray(v) ? v.map(String) : []);
    const secs = Array.isArray(obj.sections) ? obj.sections : [];
    const analysis: ChartAnalysis = {
      overview: String(obj.overview ?? ''),
      sections: secs.slice(0, type === 'life' ? 9 : 6).map((x: any) => ({
        heading: String(x?.heading ?? ''), body: String(x?.body ?? ''),
        points: Array.isArray(x?.points) ? x.points.map(String).slice(0, 8) : [],
      })),
      timing: String(obj.timing ?? ''),
      guidance: arr(obj.guidance).slice(0, 10),
      remedies: arr(obj.remedies).slice(0, 10),
      verdict: String(obj.verdict ?? ''),
    };
    // Guard against a well-formed but empty reply — treat as a failed narration.
    if (!analysis.overview.trim() || analysis.sections.length === 0) throw new Error('narration_empty');
    return analysis;
  } catch (err) {
    console.error('chart narration failed, using mock', type, String((err as Error)?.message ?? err));
    return mockChart(type, p, facts);
  }
}

function buildSystem(type: ChartReportType, lang: 'en' | 'hi' = 'en'): string {
  const common =
    `You are a warm, senior Vedic astrologer writing a PREMIUM, detailed, multi-page consultancy report. ` +
    `Every chart fact, house, planetary placement, yoga, strength score and Mahadasha period is ALREADY COMPUTED ` +
    `and supplied to you — narrate their meaning with depth, warmth and specificity. NEVER invent placements, ` +
    `houses, dates or scores, and never contradict the supplied numbers. Write substantial prose (each section ` +
    `body 2-3 full paragraphs), grounded in THIS person's actual chart, not generic filler. ` +
    `Return ONLY valid JSON (no markdown, no code fences) with EXACTLY these keys:\n` +
    `{\n` +
    `  "overview": string (2-3 rich paragraphs introducing the person and the theme of this report),\n` +
    `  "sections": [ { "heading": string, "body": string (2-3 paragraphs), "points": [string] (3-6 concrete bullets) } ],\n` +
    `  "timing": string (1-2 paragraphs interpreting the CURRENT and UPCOMING Mahadasha for this life area),\n` +
    `  "guidance": [string] (6-8 practical, specific guidance points),\n` +
    `  "remedies": [string] (6-8 remedies — mantras, gemstones, charities, conduct),\n` +
    `  "verdict": string (one encouraging closing sentence)\n` +
    `}`;
  const per: Record<ChartReportType, string> = {
    life:
      `\n\nThis is the FLAGSHIP Complete Kundli Analysis — the deepest report. Provide 7-8 sections covering: ` +
      `Personality & temperament (Lagna/Moon/Sun), Mind & emotions, Career & vocation, Wealth & finances, ` +
      `Marriage & relationships, Health & vitality, Strengths & challenges (from yogas), and an overall Life-path summary. ` +
      `Make it clearly the most comprehensive report a client can buy.`,
    career:
      `\n\nFocus: CAREER & FINANCE. Provide 4-5 sections: Career direction & suitable fields (10th house/lord), ` +
      `Job vs business inclination, Wealth & income potential (2nd/11th, yogas), Financially strong & weak periods, ` +
      `and Practical professional guidance. Be concrete about fields and timing.`,
    love:
      `\n\nFocus: an INDIVIDUAL'S LOVE LIFE (not two-person matching). Provide 4-5 sections: Relationship nature & patterns ` +
      `(5th/7th), What you seek and need in a partner, Timing of significant relationships/marriage (dasha), ` +
      `Harmony & areas to nurture, and Guidance for lasting love. Warm and sensitive in tone.`,
    health:
      `\n\nFocus: HEALTH & WELLBEING. Provide 4-5 sections: Constitutional tendencies (Lagna/Moon), Areas to care for ` +
      `(6th/8th significations), Periods needing extra care (dasha), and Lifestyle, diet & wellbeing guidance. ` +
      `Frame everything gently and positively. This is astrological guidance, NOT medical diagnosis — include no ` +
      `medical claims and no alarming language.`,
    education:
      `\n\nFocus: EDUCATION & CAREER FOR STUDENTS. Provide 4-5 sections: Academic strengths & learning style (4th/5th, Mercury/Jupiter), ` +
      `Favourable fields & streams of study, Exam & competition timing (dasha), and Guidance for the student and their parents. ` +
      `Encouraging and practical.`,
    pastlife:
      `\n\nThis is a PAST-LIFE READING. The reader wants to know WHO THEY WERE in their most recent previous life — not a general ` +
      `chart analysis. Write it as a vivid, immersive, second-person STORY of that former life, grounded at every step in this chart. ` +
      `\n\nRead the soul's past from these signals:\n` +
      `• KETU — its SIGN reveals the temperament, role and skills the soul had already mastered (Aries=warrior/pioneer, Taurus=landholder/artisan, ` +
      `Gemini=trader/scribe, Cancer=nurturer/keeper of home, Leo=noble/ruler, Virgo=healer/servant, Libra=diplomat/artist, Scorpio=mystic/physician/occultist, ` +
      `Sagittarius=priest/teacher/pilgrim, Capricorn=elder/administrator/builder, Aquarius=reformer/ascetic/outsider, Pisces=monk/mystic/healer). ` +
      `Its HOUSE reveals the arena that life revolved around (1 self/body, 2 family/wealth, 3 courage/craft, 4 home/land, 5 devotion/children/learning, ` +
      `6 service/healing/conflict, 7 partnership/trade, 8 upheaval/occult/sudden endings, 9 dharma/pilgrimage, 10 duty/office, 11 community/gains, 12 seclusion/foreign lands/moksha). ` +
      `Its lord's placement adds further colour.\n` +
      `• The 12TH & 8TH HOUSES — how that life ended, its losses, exile, seclusion, hidden matters or sudden turns.\n` +
      `• RETROGRADE planets and SATURN — the karma, debts and unfinished work carried forward.\n` +
      `• RAHU (sign & house) — the unfamiliar direction the soul chose to grow toward in THIS life.\n\n` +
      `Be SPECIFIC and evocative — give the former life a recognisable shape: the person's likely role or vocation, temperament, the setting and ` +
      `era-flavour, the key relationships, the karma left unfinished, and how that life most probably ended. Frame everything interpretively ` +
      `("your chart suggests…", "you most likely…", "the soul remembers…") — never as fixed fact, never fatalistic, and never naming a specific ` +
      `real historical person.\n\n` +
      `Provide 5-6 sections IN THIS ORDER: (1) "Who You Were" — the past-life personality, role and gifts, drawn from Ketu's sign; ` +
      `(2) "The Life You Lived" — its setting, daily world, key relationships and how it most likely ended (Ketu's house, 8th, 12th); ` +
      `(3) "The Karma You Carried In" — debts, attachments and unfinished business (12th, 8th, Saturn, retrogrades); ` +
      `(4) "Echoes in This Life" — how that past life surfaces now as instinctive talents, deep fears, cravings and strangely familiar people (Ketu→Rahu axis); ` +
      `(5) "Your Soul's Direction Now" — what this life is truly for and how to grow toward Rahu; and optionally (6) a deeper karmic reflection. ` +
      `Let the "timing" field describe WHEN in this life these past-life themes surface most strongly, via the current and upcoming Mahadasha. ` +
      `Tone: warm, mystical and dignified — worthy of a premium paid reading.`,
  };
  return common + per[type] + (lang === 'hi' ? HINDI_REPORT_DIRECTIVE : '');
}

function buildFactSheet(type: ChartReportType, p: ChartPerson, f: ChartFacts): string {
  const houseLines = f.houses.map((h) =>
    `House ${h.house} (${h.sign}): lord ${h.lord}${h.lordHouse ? ` in house ${h.lordHouse}${h.lordDignity && h.lordDignity !== 'Neutral' ? ` (${h.lordDignity})` : ''}` : ''}` +
    `${h.occupants.length ? `, occupied by ${h.occupants.map((o) => o.name + (o.dignity !== 'Neutral' ? ` (${o.dignity})` : '')).join(', ')}` : ', empty'}` +
    ` — strength ${h.strength}/100`).join('\n');
  const d = f.dasha;
  const fmt = (dt: Date) => dt.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
  const upcoming = d.upcoming.map((u) => `${u.lord} (${fmt(u.start)}–${fmt(u.end)})`).join(', ');
  return (
    `Report type: ${CHART_META[type].title}\n` +
    `Person: ${p.name}${p.gender ? `, ${p.gender}` : ''}\n` +
    `Born: ${p.dob} ${p.tob} at ${p.birth_place}\n` +
    `Lagna (Ascendant): ${p.lagna}\nMoon sign (Rashi): ${p.moon_sign}\nSun sign: ${p.sun_sign}\nNakshatra: ${p.nakshatra}\n\n` +
    `TWELVE HOUSES:\n${houseLines}\n\n` +
    `YOGAS:\n${f.yogas.length ? f.yogas.map((y) => `- ${y.name} (${y.nature}): ${y.detail}`).join('\n') : '- No major classical yogas detected.'}\n\n` +
    `DASHA: Currently running ${d.current.lord} Mahadasha (until ${fmt(d.current.end)}), ` +
    `${d.currentAntar.lord} Antardasha. Upcoming Mahadashas: ${upcoming || '—'}.\n` +
    `Thematic strength score for this report: ${f.score}/100.\n\n` +
    `Write the complete JSON report now, focused as instructed.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Mock narration — thorough, type-specific, built from the computed facts
// ─────────────────────────────────────────────────────────────────────────────
const firstName = (n: string) => (String(n).trim().split(/\s+/)[0] || 'You');
const strong = (f: ChartFacts) => [...f.houses].sort((a, b) => b.strength - a.strength);
const houseTheme: Record<number, string> = {
  1: 'self, vitality and outlook', 2: 'wealth, speech and family', 3: 'courage, effort and siblings',
  4: 'home, mother, comfort and schooling', 5: 'intelligence, romance and children', 6: 'health, service and rivals',
  7: 'partnership and marriage', 8: 'longevity, transformation and hidden matters', 9: 'fortune, dharma and higher learning',
  10: 'career, status and public life', 11: 'gains, income and aspirations', 12: 'expenses, retreat and liberation',
};

function benefics(f: ChartFacts) { return f.yogas.filter((y) => y.nature === 'benefic'); }
function cautions(f: ChartFacts) { return f.yogas.filter((y) => y.nature === 'caution'); }

// ── Past-life archetypes (used by the pastlife mock narration) ────────────────
// Ketu's SIGN → the temperament & role the soul had already mastered before this life.
const PAST_SIGN_ROLE: Record<number, string> = {
  0:  'a fearless warrior or pioneer — quick to act, used to leading from the front and fighting for what you believed in',
  1:  'a landholder, farmer or artisan — steady and sensual, devoted to the earth, to beauty, and to what you could build and keep',
  2:  'a messenger, trader or scribe — quick-witted and restless, living by your words, your cleverness and your hands',
  3:  'a nurturer and keeper of the home — deeply feeling, bound to family, tradition and the tides of the heart',
  4:  'a noble, ruler or performer — proud and radiant, accustomed to authority, loyalty and the centre of the stage',
  5:  'a healer, craftsperson or servant of others — precise and humble, giving your days to work, remedy and quiet perfection',
  6:  'a diplomat, artist or devoted partner — refined and relational, forever seeking harmony, beauty and balance between people',
  7:  'a mystic, physician or seeker of secrets — intense and private, drawn to the hidden, the taboo and the power of transformation',
  8:  'a priest, teacher or wandering pilgrim — devout and philosophical, living for truth, dharma and the open road',
  9:  'an elder, administrator or builder — disciplined and dutiful, carrying responsibility and the long, patient work of years',
  10: 'a reformer, ascetic or outsider — unconventional and detached, serving a cause larger than your own comfort',
  11: 'a monk, mystic or healer of souls — gentle and otherworldly, dissolving into devotion, compassion and the unseen',
};
// Ketu's HOUSE → the arena that former life revolved around.
const PAST_HOUSE_ARENA: Record<number, string> = {
  1:  'That life revolved around your own self and body — a path of visible identity, personal struggle and standing alone.',
  2:  'That life centred on family, wealth and lineage — resources, sustenance, speech and the fortunes of your household.',
  3:  'That life was one of effort, courage and craft — siblings, journeys, skill of the hands and self-made striving.',
  4:  'That life was rooted in home, land and mother — a settled, domestic world of property, comfort and belonging.',
  5:  'That life turned on devotion, creativity and learning — children, worship, art, or the teaching of others.',
  6:  'That life was given to service, healing and hardship — labour, medicine, duty, and the facing of illness or foes.',
  7:  'That life was defined by partnership and the public — marriage, trade and your constant dealings with others.',
  8:  'That life was marked by upheaval and mystery — sudden turns, hidden matters, the occult, and things inherited or lost.',
  9:  'That life was one of faith and wisdom — pilgrimage, philosophy, teachers and the long search for the sacred.',
  10: 'That life was shaped by duty and public role — office, reputation, leadership and the weight of your position.',
  11: 'That life moved among community and networks — friends, gains, guilds and the causes you belonged to.',
  12: 'That life unfolded in seclusion or distant lands — monastery, exile, retreat, or a longing to dissolve into the beyond.',
};
// Rahu's HOUSE → the unfamiliar direction the soul chose to grow toward in THIS life.
const RAHU_DIRECTION: Record<number, string> = {
  1:  'to finally put yourself first, forge your own identity and be seen',
  2:  'to build security, family and a steady material foundation',
  3:  'to find your voice, take bold initiative and master a practical craft',
  4:  'to root down, make a home and tend your inner emotional world',
  5:  'to create, love openly and express your unique gifts',
  6:  'to serve, heal and do the humble daily work of improvement',
  7:  'to truly partner with another and learn the art of relationship',
  8:  'to surrender control, transform and explore life’s deeper mysteries',
  9:  'to seek wisdom, purpose and a philosophy to live by',
  10: 'to step into responsibility, achievement and a public role',
  11: 'to belong to a community and work toward a larger shared vision',
  12: 'to let go, turn inward and reconnect with the spiritual',
};

function mockChart(type: ChartReportType, p: ChartPerson, f: ChartFacts): ChartAnalysis {
  const nm = firstName(p.name);
  const top = strong(f).slice(0, 3);
  const low = [...f.houses].sort((a, b) => a.strength - b.strength).slice(0, 2);
  const d = f.dasha;
  const fmt = (dt: Date) => dt.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
  const preface =
    `(Preview report — the full AI narration activates once the Claude API key is set. The chart facts, houses, ` +
    `yogas, strength scores and Mahadasha timeline shown throughout are already fully computed and final.)\n\n`;

  const commonOverview =
    `${preface}${nm}'s chart rises in ${p.lagna}, with the Moon in ${p.moon_sign} and the Sun in ${p.sun_sign}, ` +
    `born under the ${p.nakshatra} nakshatra. The Ascendant sets the lens through which ${nm} meets the world, ` +
    `while the Moon describes the inner emotional landscape and the Sun the core sense of self and purpose.\n\n` +
    `The strongest supports in this chart gather around the houses of ${top.map((h) => `${ordinal(h.house)} (${houseTheme[h.house]})`).join(', ')}, ` +
    `while ${low.map((h) => ordinal(h.house)).join(' and ')} ask for more conscious attention. ` +
    `${benefics(f).length ? `Auspicious combinations such as ${benefics(f).slice(0, 2).map((y) => y.name).join(' and ')} add genuine strength. ` : ''}` +
    `The chart is presently in the ${d.current.lord} Mahadasha (through ${fmt(d.current.end)}), a defining chapter whose themes colour this reading throughout.`;

  const timing =
    `${nm} is currently in the major period (Mahadasha) of ${d.current.lord}, running until ${fmt(d.current.end)}, ` +
    `with ${d.currentAntar.lord} as the present sub-period (Antardasha). This blend sets the tone of the coming months. ` +
    `${d.upcoming.length ? `Looking ahead, the ${d.upcoming[0].lord} Mahadasha (from ${fmt(d.upcoming[0].start)}) opens a new phase` + (d.upcoming[1] ? `, followed by ${d.upcoming[1].lord} from ${fmt(d.upcoming[1].start)}` : '') + `. ` : ''}` +
    `Aligning important decisions and launches with supportive sub-periods within these dashas will meaningfully improve results.`;

  const base: ChartAnalysis = {
    overview: commonOverview, sections: [], timing,
    guidance: [], remedies: commonRemedies(f, nm), verdict: '',
  };

  const H = (n: number) => f.houses[n - 1];
  const lordOf = (n: number) => { const h = H(n); return `the ${ordinal(n)} lord ${h.lord}${h.lordHouse ? ` in the ${ordinal(h.lordHouse)} house` : ''}`; };
  const occ = (n: number) => { const o = H(n).occupants; return o.length ? o.map((x) => x.name).join(', ') : 'no planets'; };

  if (type === 'life') {
    base.sections = [
      sect('Personality & Temperament',
        `With ${p.lagna} rising, ${nm} presents a distinctive outward nature shaped by its ruling planet ${H(1).lord}${H(1).lordHouse ? `, placed in the ${ordinal(H(1).lordHouse!)} house` : ''}. ` +
        `The first house — the seat of vitality and self — carries a strength of ${H(1).strength}/100 in this chart. ` +
        `The Moon in ${p.moon_sign} governs the emotional mind, giving ${nm} a characteristic inner rhythm, while the ${p.nakshatra} nakshatra adds its own signature to temperament and instinct.`,
        [`Ascendant: ${p.lagna} (lord ${H(1).lord})`, `Moon (mind): ${p.moon_sign}`, `Sun (self): ${p.sun_sign}`, `Birth star: ${p.nakshatra}`]),
      sect('Career & Vocation',
        `The tenth house of career holds ${occ(10)} and is ruled by ${lordOf(10)}, scoring ${H(10).strength}/100. ` +
        `Together with the second and eleventh houses of wealth and gains, this describes ${nm}'s professional direction and the fields in which effort is most rewarded.`,
        [`10th house: ${occ(10)} · lord ${H(10).lord}`, `Gains (11th): ${occ(11)}`, `Strength: ${H(10).strength}/100`]),
      sect('Wealth & Finances',
        `The second house (accumulated wealth) and eleventh (income and gains) are anchored by ${lordOf(2)} and ${lordOf(11)}. ` +
        `${benefics(f).some((y) => /Chandra-Mangala|Budha/.test(y.name)) ? 'A wealth-supportive combination is present, aiding earnings. ' : ''}` +
        `Financial stability grows as ${nm} aligns saving and investment with the supportive dasha periods noted later.`,
        [`2nd (wealth) strength: ${H(2).strength}/100`, `11th (gains) strength: ${H(11).strength}/100`]),
      sect('Marriage & Relationships',
        `The seventh house of partnership contains ${occ(7)} and is governed by ${lordOf(7)} at ${H(7).strength}/100, ` +
        `with the fifth house of romance ruled by ${lordOf(5)}. These describe the nature of ${nm}'s significant bonds and the qualities sought in a partner.`,
        [`7th (partner): ${occ(7)} · lord ${H(7).lord}`, `5th (romance): ${occ(5)}`]),
      sect('Health & Vitality',
        `Vitality flows from a first house at ${H(1).strength}/100 and its lord ${H(1).lord}. The sixth and eighth houses — ${occ(6)} and ${occ(8)} — ` +
        `indicate where to keep balance. None of this is medical advice; it simply highlights where mindful lifestyle habits pay the greatest dividends.`,
        [`1st (vitality): ${H(1).strength}/100`, `6th (immunity/service): ${occ(6)}`]),
      sect('Strengths, Yogas & Challenges',
        `${benefics(f).length ? `This chart carries ${benefics(f).length} supportive combination(s): ${benefics(f).map((y) => y.name).join(', ')}. ` : 'The chart draws its strength from steady, well-placed lords rather than dramatic yogas. '}` +
        `${cautions(f).length ? `Areas asking for conscious effort include ${cautions(f).map((y) => y.name).join(', ')}, each of which responds well to the remedies suggested. ` : 'No significant afflictions stand out — a well-balanced foundation. '}`,
        f.yogas.slice(0, 6).map((y) => `${y.name}: ${y.detail}`)),
      sect('Life-Path Summary',
        `Taken as a whole, ${nm}'s chart tells the story of a life that builds meaningfully through its ${d.current.lord} and ${d.upcoming[0]?.lord ?? 'coming'} periods. ` +
        `The strongest houses — ${top.map((h) => ordinal(h.house)).join(', ')} — are where destiny cooperates most readily, and channelling energy there brings the surest progress and fulfilment.`,
        []),
    ];
    base.guidance = [
      `Lean into the themes of your strongest houses (${top.map((h) => ordinal(h.house)).join(', ')}) — these are where your natural momentum lies.`,
      `Give patient, conscious attention to the ${low.map((h) => ordinal(h.house)).join(' and ')} houses rather than forcing them.`,
      `Time major beginnings with the supportive dasha sub-periods described in the timing section.`,
      `Cultivate the significations of ${d.current.lord} (your current major period) through study, service or devotion.`,
      `Keep a steady daily spiritual practice — it strengthens the whole chart, not one house.`,
      `Revisit this reading at each change of Mahadasha to re-align your plans.`,
    ];
    base.verdict = `A rich and capable chart — lived with awareness and the noted remedies, ${nm}'s path holds real promise and purpose.`;
    return base;
  }

  if (type === 'career') {
    base.sections = [
      sect('Career Direction & Suitable Fields',
        `${nm}'s vocation is read primarily from the tenth house, here holding ${occ(10)} and ruled by ${lordOf(10)} (strength ${H(10).strength}/100). ` +
        `The nature of ${H(10).lord} and the sign ${H(10).sign} point toward fields aligned with its character — ` +
        `${fieldsFor(H(10).lord)}. The ninth house of fortune (${occ(9)}) supports growth through mentors and higher learning.`,
        [`10th house: ${occ(10)} · lord ${H(10).lord} in ${H(10).lordHouse ? ordinal(H(10).lordHouse!) : '—'}`, `Suggested fields: ${fieldsFor(H(10).lord)}`]),
      sect('Job vs Business',
        `The balance between employment and enterprise is weighed from the strength of the tenth (service and authority) against the seventh and third (self-driven venture). ` +
        `Here the ${H(10).strength >= H(7).strength ? 'tenth house is the stronger, favouring a distinguished career within organisations, leadership tracks or institutions' : 'seventh and self-effort houses hold their own, so independent ventures and partnerships can flourish alongside employment'}.`,
        [`10th strength: ${H(10).strength}/100`, `7th (enterprise/partnership): ${H(7).strength}/100`]),
      sect('Wealth & Income Potential',
        `Income and gains are shown by the eleventh house (${occ(11)}, strength ${H(11).strength}/100) and accumulated wealth by the second (${occ(2)}). ` +
        `${benefics(f).some((y) => /Chandra-Mangala/.test(y.name)) ? 'The Chandra-Mangala combination adds a natural flair for earning. ' : ''}Steady wealth-building suits ${nm} better than speculation.`,
        [`11th (gains): ${H(11).strength}/100`, `2nd (savings): ${H(2).strength}/100`]),
      sect('Financially Strong & Weak Periods',
        `${timing} The ${d.current.lord} period is ${['Jupiter', 'Mercury', 'Venus', 'Moon'].includes(d.current.lord) ? 'generally favourable for professional expansion and income' : 'a phase for consolidation, skill-building and disciplined effort'}.`,
        []),
    ];
    base.guidance = [
      `Aim for roles that use the strengths of ${H(10).lord} — ${fieldsFor(H(10).lord)}.`,
      `Build income steadily through the eleventh-house significations rather than risky shortcuts.`,
      `Make key career moves during the supportive dasha windows noted above.`,
      `Invest in a mentor or advanced qualification — your ninth house rewards it.`,
      `Keep finances organised and avoid over-leverage during weaker sub-periods.`,
    ];
    base.verdict = `With focused effort in the right fields and well-timed moves, ${nm}'s professional and financial path can rise steadily and securely.`;
    return base;
  }

  if (type === 'love') {
    base.sections = [
      sect('Your Relationship Nature',
        `${nm}'s emotional and romantic style is read from the fifth house of romance (${occ(5)}, ruled by ${lordOf(5)}) and the Moon in ${p.moon_sign}. ` +
        `This describes how ${nm} gives and receives affection, and the tone of the heart in matters of love.`,
        [`5th (romance): ${occ(5)} · lord ${H(5).lord}`, `Moon (heart): ${p.moon_sign}`]),
      sect('Partnership & What You Seek',
        `The seventh house of partnership holds ${occ(7)} and is governed by ${lordOf(7)} at ${H(7).strength}/100. ` +
        `The qualities of ${H(7).lord} and the sign ${H(7).sign} describe the partner ${nm} is naturally drawn to — ${partnerFor(H(7).lord)}.`,
        [`7th (partner): ${occ(7)} · lord ${H(7).lord}`, `You are drawn to: ${partnerFor(H(7).lord)}`]),
      sect('Timing of Significant Relationships',
        `${timing} Periods ruled by Venus, Jupiter or the seventh lord are especially fertile for meeting a partner or deepening commitment.`,
        []),
      sect('Nurturing Lasting Love',
        `${cautions(f).length ? `Gentle attention to ${cautions(f).map((y) => y.name).join(', ')} will smooth the path in relationships. ` : 'No major afflictions trouble the relationship houses — a naturally warm foundation. '}` +
        `Honest communication and shared ritual keep the seventh house strong over time.`,
        []),
    ];
    base.guidance = [
      `Seek a partner who embodies ${partnerFor(H(7).lord)} — it matches your seventh house.`,
      `Favour Venus and Jupiter sub-periods for engagement or marriage.`,
      `Nurture the fifth house of romance with playfulness and creativity.`,
      `Address any noted caution areas early and openly, together.`,
      `Keep a shared spiritual or gratitude practice to steady the bond.`,
    ];
    base.verdict = `Warm-hearted and capable of deep partnership — with the right timing and understanding, ${nm}'s love life can flourish.`;
    return base;
  }

  if (type === 'health') {
    base.sections = [
      sect('Constitutional Tendencies',
        `${nm}'s vitality is read from the first house (${occ(1)}, strength ${H(1).strength}/100) and its lord ${H(1).lord}, together with the Moon in ${p.moon_sign}. ` +
        `This describes the natural constitution and the general reserves of energy — a gentle guide to lifestyle, not a medical assessment.`,
        [`1st (vitality): ${H(1).strength}/100 · lord ${H(1).lord}`, `Moon (mind/rest): ${p.moon_sign}`]),
      sect('Areas to Care For',
        `The sixth house (${occ(6)}) and eighth (${occ(8)}) traditionally indicate where balance is most worth maintaining. ` +
        `${cautions(f).length ? `The chart also flags ${cautions(f).map((y) => y.name).join(', ')}, which simply suggests extra self-care in those significations. ` : 'No strong afflictions appear here — a reassuring sign. '}` +
        `This is guidance for wellbeing only, and never a substitute for a qualified doctor.`,
        [`6th (immunity): ${occ(6)}`, `8th (stamina): ${occ(8)}`]),
      sect('Periods Needing Extra Care',
        `${timing} During more demanding sub-periods, prioritise rest, routine and preventive habits rather than pushing through.`,
        []),
      sect('Lifestyle & Wellbeing Guidance',
        `A steady daily rhythm suits ${nm}'s constitution: regular sleep, wholesome food, movement, and calming practices for the Moon-ruled mind. ` +
        `Small, consistent habits strengthen the first house far more than intense, occasional effort.`,
        []),
    ];
    base.guidance = [
      `Keep a regular daily routine — it suits your Moon in ${p.moon_sign}.`,
      `Favour gentle, consistent exercise over sporadic intensity.`,
      `Prioritise rest and prevention during the demanding periods noted above.`,
      `Nourish the mind with calming practices — pranayama, meditation, time in nature.`,
      `Treat this as wellbeing guidance and consult a qualified doctor for any real concern.`,
    ];
    base.verdict = `A workable constitution that rewards steady, mindful living — small daily kindnesses to body and mind go a long way for ${nm}.`;
    return base;
  }

  if (type === 'pastlife') {
    const ketu = f.planets['Ketu'];
    const rahu = f.planets['Rahu'];
    const role = ketu ? PAST_SIGN_ROLE[ketu.signIdx] : 'a soul of quiet, well-worn wisdom';
    const arena = ketu ? PAST_HOUSE_ARENA[ketu.house] : 'That life was lived close to the themes your chart still remembers most deeply.';
    const direction = rahu ? RAHU_DIRECTION[rahu.house] : 'to grow gently beyond the comfortable and familiar';
    const kSign = ketu ? ketu.sign : '—';
    const kHouseLord = ketu ? `${H(ketu.house).lord}` : '—';
    // How that life likely ended — read from the 8th (sudden/transformative) and 12th (withdrawal/loss).
    const eighthLoaded = H(8).occupants.length > 0;
    const twelfthLoaded = H(12).occupants.length > 0;
    const ending =
      eighthLoaded
        ? `With ${occ(8)} weighing on the eighth house, that life most likely ended through sudden change or upheaval — an abrupt turn rather than a slow fading.`
        : twelfthLoaded
        ? `With ${occ(12)} touching the twelfth house, that life most likely closed in withdrawal and letting-go — in seclusion, far from home, or in quiet surrender.`
        : `That life most likely ended peacefully, its work quietly complete, the soul ready to move on.`;

    base.overview =
      `${preface}Every soul arrives already ancient. ${ketu ? `In ${nm}'s chart, Ketu — the keeper of past-life memory — rests in ${kSign} in the ${ordinal(ketu.house)} house, ` : 'In this chart, the karmic signatures '}` +
      `and it whispers of the life ${nm} most recently lived. This reading follows those threads — who you likely were, the world you moved through, ` +
      `the karma you carried across the threshold of death, and how it quietly shapes the person you are becoming now.`;

    base.sections = [
      sect('Who You Were',
        `Your chart suggests that in your most recent past life you were ${role}. ` +
        `Ketu in ${kSign} carries the flavour of that former self — a nature so well-practised it now feels effortless, almost like instinct rather than learning. ` +
        `${nm} most likely walked that life already skilled in these ways, so complete in them that the soul chose, this time, to set them gently down and turn elsewhere.`,
        [ketu ? `Ketu (soul’s past): ${kSign}, ${ordinal(ketu.house)} house` : 'Ketu: —', `Former nature: ${role.split(' — ')[0]}`]),
      sect('The Life You Lived',
        `${arena} It was governed, in feeling, by ${kHouseLord} — the ruler of Ketu's house — colouring the texture of your days, your work and your closest bonds. ` +
        `The seventh house of partnership (${occ(7)}) hints at the ties that mattered most in that life — the people you loved, served or answered to. ` +
        `${ending}`,
        [ketu ? `Life’s arena: ${ordinal(ketu.house)} house (${houseTheme[ketu.house]})` : 'Arena: —', `Key bonds (7th): ${occ(7)}`]),
      sect('The Karma You Carried In',
        `Not everything was finished. The twelfth house (${occ(12)}, ruled by ${lordOf(12)}) and the eighth (${occ(8)}, ruled by ${lordOf(8)}) mark the unpaid accounts and unhealed attachments the soul brought across. ` +
        `${cautions(f).length ? `Signatures such as ${cautions(f).slice(0, 2).map((y) => y.name).join(' and ')} point to the specific debts and lessons chosen for this life — not punishments, but invitations to complete what was left undone. ` : 'The chart carries no harsh afflictions, suggesting the karma brought forward is gentle — more a matter of refining and giving back than of hard repayment. '}` +
        `These are the places where ${nm}'s life can feel strangely fated, asking for release rather than resistance.`,
        [`Unfinished (12th): ${occ(12)}`, `Carried debts (8th): ${occ(8)}`]),
      sect('Echoes in This Life',
        `The past life never truly leaves — it echoes. The gifts of ${kSign} return as instincts and talents ${nm} seems to have been "born knowing", ` +
        `while its shadow can return as quiet fears, cravings, or people who feel achingly familiar on first meeting — souls very likely known before. ` +
        `Wherever life feels effortless, that is Ketu remembering; wherever it feels compelling yet uncertain, the soul is being called forward, not back.`,
        [rahu ? `Growth axis: Ketu ${kSign} → Rahu ${rahu.sign}` : 'Growth axis: —']),
      sect('Your Soul’s Direction Now',
        `If the past life mastered one way of being, this life asks for its opposite. ${rahu ? `Rahu in the ${ordinal(rahu.house)} house calls ${nm} ${direction}. ` : `The soul is called ${direction}. `}` +
        `This is unfamiliar ground — it can feel awkward, even frightening — yet it is precisely where growth, hunger and destiny now live. ` +
        `The current ${d.current.lord} Mahadasha is the chapter through which these past-life themes are surfacing most strongly${d.upcoming[0]?.lord ? `, shifting again as the ${d.upcoming[0].lord} period opens` : ''}.`,
        [rahu ? `This life’s direction: ${direction}` : 'Direction: —', `Active chapter: ${d.current.lord} Mahadasha`]),
    ];
    base.guidance = [
      `Honour the gifts you carried in (Ketu in ${kSign}) — but don't hide inside them; they are your comfort zone, not your growth.`,
      rahu ? `Lean deliberately toward Rahu's call ${direction} — the discomfort there is the doorway to this life's purpose.` : `Lean gently toward what feels unfamiliar — that is where this life's purpose waits.`,
      `Treat people who feel instantly familiar as karmic connections — meet them to complete the past, not repeat it.`,
      `Where life feels fated or stuck (12th / 8th themes), practise release and acceptance rather than force.`,
      `Keep a steady spiritual practice — meditation, mantra or seva loosens old karmic knots across the whole chart.`,
    ];
    base.verdict = `Read with an open heart: ${nm}'s chart tells the story of a soul that has already travelled far — and this life offers real grace to lay down the old, grow lighter, and step at last toward what it came here to become.`;
    return base;
  }

  // education
  base.sections = [
    sect('Academic Strengths & Learning Style',
      `${nm}'s mind for study is read from the fourth house of schooling (${occ(4)}), the fifth of intelligence (${occ(5)}, strength ${H(5).strength}/100), ` +
      `and the placement of Mercury (intellect) and Jupiter (wisdom). This describes how ${nm} learns best and where natural aptitude lies.`,
      [`5th (intellect): ${occ(5)} · ${H(5).strength}/100`, `Mercury: ${f.planets['Mercury']?.sign ?? '—'}`, `Jupiter: ${f.planets['Jupiter']?.sign ?? '—'}`]),
    sect('Favourable Fields of Study',
      `The strengths of the fifth and ninth houses and the sign of Mercury point toward streams that suit ${nm} — ${fieldsFor(f.planets['Mercury']?.name === 'Mercury' ? SIGNS_LORD(f.planets['Mercury']!.signIdx) : H(5).lord)}. ` +
      `Higher learning is supported by the ninth house (${occ(9)}).`,
      [`Suggested streams: ${fieldsFor(H(5).lord)}`, `9th (higher study): ${occ(9)}`]),
    sect('Exam & Competition Timing',
      `${timing} Mercury and Jupiter sub-periods are particularly supportive for examinations, admissions and competitive results.`,
      []),
    sect('Guidance for Student & Parents',
      `Encouragement and a steady study routine bring out the best in this chart. ` +
      `${cautions(f).length ? `Where ${cautions(f).map((y) => y.name).join(', ')} appears, patience and the right remedy help the young mind settle. ` : 'A naturally capable mind — consistency matters more than pressure. '}`,
      []),
  ];
  base.guidance = [
    `Lean into fields aligned with a strong fifth house: ${fieldsFor(H(5).lord)}.`,
    `Schedule intense preparation and exams during Mercury/Jupiter windows.`,
    `Keep a calm, consistent study routine over last-minute cramming.`,
    `Parents: encourage rather than pressure — this chart blossoms with support.`,
    `Strengthen Mercury and Jupiter with the remedies below before major exams.`,
  ];
  base.verdict = `A capable and teachable mind — with encouragement and well-timed effort, ${nm}'s studies can truly shine.`;
  return base;
}

function sect(heading: string, body: string, points: string[]) { return { heading, body, points }; }
function ordinal(n: number) { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
const SIGNS_LORD = (si: number) => LORDS[si];

function fieldsFor(lord: string): string {
  const map: Record<string, string> = {
    Sun: 'government, administration, leadership, medicine or public service',
    Moon: 'care-giving, hospitality, food, psychology, the public or fluids/travel',
    Mars: 'engineering, defence, sports, surgery, real estate or anything demanding drive',
    Mercury: 'communication, writing, commerce, accounts, IT, teaching or analysis',
    Jupiter: 'teaching, law, finance, counsel, spirituality or higher knowledge',
    Venus: 'arts, design, media, luxury, beauty, hospitality or diplomacy',
    Saturn: 'engineering, labour-organisation, mining, law, service or long-horizon institutions',
  };
  return map[lord] ?? 'fields suited to your strongest planets';
}
function partnerFor(lord: string): string {
  const map: Record<string, string> = {
    Sun: 'someone confident, principled and warm-hearted',
    Moon: 'someone caring, emotionally attuned and nurturing',
    Mars: 'someone spirited, protective and full of energy',
    Mercury: 'someone witty, communicative and intellectually engaging',
    Jupiter: 'someone wise, generous and grounded in values',
    Venus: 'someone affectionate, refined and harmonious',
    Saturn: 'someone steady, mature and dependable',
  };
  return map[lord] ?? 'a partner who complements your nature';
}

function commonRemedies(f: ChartFacts, nm: string): string[] {
  const out = [
    'Keep a simple daily practice of prayer, gratitude or meditation to strengthen the whole chart.',
    'Offer water to the rising Sun and greet each day with intention.',
  ];
  const c = cautions(f);
  if (c.some((y) => /Saturn/.test(y.name))) out.push('For Saturn: serve elders and the needy, and light a sesame-oil lamp on Saturdays.');
  if (c.some((y) => /Mars/.test(y.name))) out.push('For Mars: recite the Hanuman Chalisa on Tuesdays and offer red flowers.');
  if (c.some((y) => /Moon/.test(y.name))) out.push('For the Moon: honour your mother, and favour white foods and moonlight walks on Mondays.');
  if (c.some((y) => /Mercury/.test(y.name))) out.push('For Mercury: donate green gram, and chant the Budha mantra before study or important communication.');
  out.push('Chant the Maha Mrityunjaya mantra for health and protection.');
  out.push('Consult a qualified astrologer before adopting any gemstone, so the stone truly suits your chart.');
  out.push('Practise regular charity (daan) aligned with your current dasha lord.');
  return out.slice(0, 8);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Branded HTML (indigo / gold / serif — matches Vastu & Matchmaking exactly)
// ─────────────────────────────────────────────────────────────────────────────
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function paras(s: string): string {
  return esc(s).split(/\n\s*\n/).map((p) => `<p class="body">${p.replace(/\n/g, '<br/>')}</p>`).join('');
}
function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

// North-Indian diamond chart from placements (house 1 top-centre).
function northChart(f: ChartFacts, lagnaIdx: number, placements: ChartPlacement[]): string {
  const occ: string[][] = Array.from({ length: 12 }, () => []);
  for (const pl of placements) occ[signIdx(pl.sign)].push(abbr(pl.graha));
  const anchors = [
    [130, 52], [70, 28], [28, 70], [58, 130], [28, 190], [70, 232],
    [130, 208], [190, 232], [232, 190], [202, 130], [232, 70], [190, 28],
  ];
  const cells = anchors.map(([x, y], h) => {
    const sign = (lagnaIdx + h) % 12;
    const gr = occ[sign];
    const grText = gr.length ? `<text x="${x}" y="${y + 12}" class="cg">${gr.join(' ')}</text>` : '';
    return `<text x="${x}" y="${y}" class="cs">${sign + 1}</text>${grText}`;
  }).join('');
  return `<svg viewBox="0 0 260 260" class="chart">
    <rect x="10" y="10" width="240" height="240" class="cl"/>
    <line x1="10" y1="10" x2="250" y2="250" class="cl"/>
    <line x1="250" y1="10" x2="10" y2="250" class="cl"/>
    <polygon points="130,10 250,130 130,250 10,130" class="cl"/>
    ${cells}
  </svg>`;
}

export function renderChartHtml(type: ChartReportType, p: ChartPerson, f: ChartFacts, a: ChartAnalysis): string {
  const meta = CHART_META[type];
  const dateStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  const reportId = `RTH-${type.slice(0, 3).toUpperCase()}-${(hashStr(`${p.name}|${p.dob}|${type}`) % 100000).toString().padStart(5, '0')}`;
  const scoreColor = f.score >= 70 ? '#7FA36F' : f.score >= 50 ? '#E4C983' : '#C7524B';
  const fmtM = (dt: Date) => dt.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
  const [by, bm, bd] = p.dob.split('-');
  const birthLine = `${Number(bd)}/${Number(bm)}/${by} · ${p.tob.slice(0, 5)} · ${esc(p.birth_place)}`;

  const detailRows = [
    ['Prepared for', esc(p.name)],
    ['Birth details', esc(birthLine)],
    ['Ascendant (Lagna)', esc(p.lagna)],
    ['Moon sign (Rashi)', esc(p.moon_sign)],
    ['Sun sign', esc(p.sun_sign)],
    ['Nakshatra', esc(p.nakshatra)],
    ['Report ID', esc(reportId)],
  ].map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('');

  // planetary positions table
  const order = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  const planetRows = order.map((nm) => {
    const pl = f.planets[nm];
    if (!pl) return '';
    const dg = pl.dignity !== 'Neutral' ? `<span class="dig">${esc(pl.dignity)}</span>` : '';
    return `<tr><td class="pn">${esc(nm)}</td><td>${esc(pl.sign)}</td><td>${ordinal(pl.house)}</td><td>${dg}</td></tr>`;
  }).join('');

  // houses table (focus subset, or all 12 for life)
  const houseList = meta.focus.map((n) => f.houses[n - 1]);
  const houseRows = houseList.map((h) => `
    <tr>
      <td class="hh">${ordinal(h.house)}</td>
      <td>${esc(h.sign)}</td>
      <td>${esc(h.lord)}${h.lordHouse ? ` <span class="mut">(${ordinal(h.lordHouse)})</span>` : ''}</td>
      <td>${h.occupants.length ? h.occupants.map((o) => esc(o.name)).join(', ') : '<span class="mut">—</span>'}</td>
      <td class="hs"><span style="color:${h.strength >= 65 ? '#7FA36F' : h.strength >= 45 ? '#E4C983' : '#C5A059'}">${h.strength}</span></td>
    </tr>`).join('');

  // yogas
  const yogaBlocks = f.yogas.length ? f.yogas.map((yg) => `
    <div class="yoga ${yg.nature === 'caution' ? 'yc' : ''}">
      <div class="yoga-name">${yg.nature === 'caution' ? '△' : '✦'} ${esc(yg.name)}</div>
      <p class="yoga-detail">${esc(yg.detail)}</p>
    </div>`).join('') : '<p class="body">No major classical yogas stand out — a chart that draws its strength from steady, well-placed house lords.</p>';

  // dasha timeline
  const d = f.dasha;
  const timelineRows = d.periods.map((pp) => {
    const isNow = pp === d.current;
    return `<tr class="${isNow ? 'now' : ''}">
      <td class="dl">${esc(pp.lord)}${isNow ? ' <span class="tag">now</span>' : ''}</td>
      <td>${fmtM(pp.start)} – ${fmtM(pp.end)}</td>
      <td>${pp.years.toFixed(1)} yrs</td>
    </tr>`;
  }).join('');
  const antarRows = d.antars.map((an) => {
    const isNow = an === d.currentAntar;
    return `<tr class="${isNow ? 'now' : ''}">
      <td class="dl">${esc(d.current.lord)}–${esc(an.lord)}${isNow ? ' <span class="tag">now</span>' : ''}</td>
      <td>${fmtM(an.start)} – ${fmtM(an.end)}</td>
    </tr>`;
  }).join('');

  // narrated sections → 1 per page for life, 2 per page for focused
  const perPage = type === 'life' ? 1 : 2;
  const sectionPages = chunk(a.sections, perPage).map((grp) => `
    <section class="page">
      <div class="brand">RITHAM · ${esc(meta.brand)}</div>
      ${grp.map((s) => `
        <h2 class="section">${esc(s.heading)}</h2>
        <div class="divider"></div>
        ${paras(s.body)}
        ${s.points.length ? `<ul class="list">${s.points.map((pt) => `<li>${esc(pt)}</li>`).join('')}</ul>` : ''}
      `).join('<div style="height:18px"></div>')}
    </section>`).join('');

  const guidance = a.guidance.map((g) => `<li>${esc(g)}</li>`).join('');
  const remedies = a.remedies.map((r) => `<li>${esc(r)}</li>`).join('');

  const disclaimer = type === 'health'
    ? `Generated by Ritham · This wellbeing reading is offered for guidance in the spirit of Vedic tradition.<br/>` +
      `It is NOT medical advice, diagnosis or treatment. For any health concern, please consult a qualified doctor.`
    : `Generated by Ritham · This reading is offered for guidance and reflection in the spirit of Vedic tradition.<br/>` +
      `It is for personal guidance and entertainment, and is not a substitute for professional advice.`;

  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Fraunces', Georgia, 'Times New Roman', serif; color: #FDFBF7;
         background: #0B0B0D; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { min-height: 100vh; padding: 46px 40px; page-break-after: always;
          background: linear-gradient(160deg, #0B0B0D 0%, #171519 100%); }
  .page:last-child { page-break-after: auto; }
  h1, h2, h3 { font-weight: normal; letter-spacing: 0.3px; margin: 0; }
  .brand { color: #C5A059; font-size: 14px; letter-spacing: 3px; }
  .divider { height: 1px; background: linear-gradient(90deg, transparent, #C5A059, transparent); margin: 16px 0; }
  .cover { display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .cover .logo { font-size: 42px; color: #C5A059; margin-bottom: 6px; }
  .cover h1 { font-size: 38px; color: #FDFBF7; margin: 8px 0; }
  .cover .sub { color: #A29E95; font-size: 15px; }
  .cover .who { margin-top: 30px; color: #E4C983; font-size: 24px; }
  .cover .bd { color: #A29E95; font-size: 13px; margin-top: 6px; }
  .cover .rid { color: #6E6A62; font-size: 12px; letter-spacing: 1px; margin-top: 18px; }
  .cover .date { color: #6E6A62; font-size: 13px; margin-top: 4px; }
  h2.section { color: #E4C983; font-size: 23px; margin: 0 0 4px; }
  .lead { color: #A29E95; font-size: 13px; margin-bottom: 8px; }
  p.body { font-size: 14.5px; line-height: 1.75; color: #E8E3DA; margin: 0 0 12px; }
  table.details { width: 100%; border-collapse: collapse; }
  table.details td { padding: 9px 4px; border-bottom: 1px solid #2E2A22; font-size: 14.5px; vertical-align: top; }
  td.k { color: #A29E95; width: 40%; } td.v { color: #FDFBF7; }
  /* score box */
  .score-box { text-align: center; border: 1px solid #2E2A22; border-radius: 14px; padding: 22px;
               background: rgba(30,27,69,0.6); margin: 12px 0 16px; }
  .score-num { font-size: 58px; color: ${scoreColor}; }
  .score-cap { color: #A29E95; font-size: 12px; letter-spacing: 1px; }
  /* generic table */
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid th { text-align: left; color: #A29E95; font-size: 11px; letter-spacing: 1px;
                  padding: 7px 6px; border-bottom: 1px solid #C5A059; }
  table.grid td { padding: 8px 6px; border-bottom: 1px solid #2E2A22; font-size: 13px; color: #E8E3DA; vertical-align: top; }
  td.pn, td.hh, td.dl { color: #FDFBF7; }
  .mut { color: #8B8478; } .dig { color: #E4C983; font-size: 12px; }
  td.hs, td.kp { text-align: center; }
  tr.now td { background: rgba(217,164,65,0.12); color: #FDFBF7; }
  .tag { color: #0B0B0D; background: #C5A059; font-size: 9px; padding: 1px 5px; border-radius: 6px; letter-spacing: 0.5px; }
  /* yogas */
  .yoga { border-left: 2px solid #C5A059; padding: 4px 0 4px 14px; margin-bottom: 14px; }
  .yoga.yc { border-left-color: #C5A059; }
  .yoga-name { color: #FDFBF7; font-size: 15.5px; }
  .yoga-detail { color: #C9C4BC; font-size: 13.5px; line-height: 1.6; margin: 4px 0 0; }
  /* chart diagram */
  .chartwrap { text-align: center; margin: 6px 0; }
  svg.chart { width: 100%; max-width: 260px; }
  svg.chart .cl { fill: none; stroke: #C5A059; stroke-width: 1; }
  svg.chart .cs { fill: #8B8478; font-size: 9px; text-anchor: middle; }
  svg.chart .cg { fill: #FDFBF7; font-size: 11px; text-anchor: middle; }
  .chartnote { color: #6E6A62; font-size: 11px; text-align: center; margin-top: 8px; }
  ul.list { padding-left: 20px; margin: 8px 0 0; }
  ul.list li { font-size: 14px; line-height: 1.7; color: #E8E3DA; margin-bottom: 7px; }
  .verdict { color: #E8E3DA; font-size: 15px; line-height: 1.6; text-align: center; font-style: italic; margin-top: 8px; }
  .foot { color: #6E6A62; font-size: 11px; text-align: center; margin-top: 28px; line-height: 1.5; }
</style></head><body>

  <section class="page cover">
    <div class="logo">✦</div>
    <div class="brand">RITHAM</div>
    <h1>${esc(meta.title)}</h1>
    <div class="sub">${esc(meta.sub)}</div>
    <div class="who">${esc(p.name)}</div>
    <div class="bd">${esc(birthLine)}</div>
    <div class="rid">REPORT ID · ${esc(reportId)}</div>
    <div class="date">${esc(dateStr)}</div>
  </section>

  <section class="page">
    <div class="brand">RITHAM · ${esc(meta.brand)}</div>
    <h2 class="section">Birth Details & Chart</h2>
    <div class="divider"></div>
    <table class="details"><tbody>${detailRows}</tbody></table>
    <div class="chartwrap">${northChart(f, f.lagnaIdx, p.placements)}</div>
    <p class="chartnote">North-Indian chart · house numbers shown · Su Sun · Mo Moon · Ma Mars · Me Mercury · Ju Jupiter · Ve Venus · Sa Saturn · Ra Rahu · Ke Ketu</p>
  </section>

  <section class="page">
    <div class="brand">RITHAM · ${esc(meta.brand)}</div>
    <h2 class="section">Planetary Positions</h2>
    <p class="lead">Where each graha sits at birth, and its dignity.</p>
    <div class="divider"></div>
    <table class="grid">
      <thead><tr><th>PLANET</th><th>SIGN</th><th>HOUSE</th><th>DIGNITY</th></tr></thead>
      <tbody>${planetRows}</tbody>
    </table>
  </section>

  <section class="page">
    <div class="brand">RITHAM · ${esc(meta.brand)}</div>
    <h2 class="section">Overview</h2>
    <div class="score-box">
      <div class="score-num">${f.score}<span style="font-size:24px;color:#A29E95">/100</span></div>
      <div class="score-cap">${esc(meta.scoreCap)}</div>
    </div>
    ${paras(a.overview)}
  </section>

  <section class="page">
    <div class="brand">RITHAM · ${esc(meta.brand)}</div>
    <h2 class="section">${type === 'life' ? 'The Twelve Houses' : 'Key Houses for This Reading'}</h2>
    <p class="lead">Sign, ruling lord (and where it sits), occupants, and computed strength.</p>
    <div class="divider"></div>
    <table class="grid">
      <thead><tr><th>HOUSE</th><th>SIGN</th><th>LORD</th><th>OCCUPANTS</th><th>STR</th></tr></thead>
      <tbody>${houseRows}</tbody>
    </table>
  </section>

  <section class="page">
    <div class="brand">RITHAM · ${esc(meta.brand)}</div>
    <h2 class="section">Yogas & Combinations</h2>
    <p class="lead">Notable planetary combinations found in this chart.</p>
    <div class="divider"></div>
    ${yogaBlocks}
  </section>

  <section class="page">
    <div class="brand">RITHAM · ${esc(meta.brand)}</div>
    <h2 class="section">Dasha Timeline & Timing</h2>
    <p class="lead">Your Vimshottari Mahadasha sequence — the running period is highlighted.</p>
    <div class="divider"></div>
    <table class="grid">
      <thead><tr><th>MAHADASHA</th><th>PERIOD</th><th>LENGTH</th></tr></thead>
      <tbody>${timelineRows}</tbody>
    </table>
    <h3 style="color:#E4C983;font-size:16px;margin:18px 0 6px;">Sub-periods (Antardasha) within ${esc(d.current.lord)}</h3>
    <table class="grid">
      <thead><tr><th>SUB-PERIOD</th><th>WINDOW</th></tr></thead>
      <tbody>${antarRows}</tbody>
    </table>
    ${a.timing ? `<div class="divider"></div>${paras(a.timing)}` : ''}
  </section>

  ${sectionPages}

  <section class="page">
    <div class="brand">RITHAM · ${esc(meta.brand)}</div>
    <h2 class="section">Guidance</h2>
    <div class="divider"></div>
    <ul class="list">${guidance}</ul>
    <h2 class="section" style="margin-top:22px;">Remedies &amp; Recommendations</h2>
    <div class="divider"></div>
    <ul class="list">${remedies}</ul>
    ${a.verdict ? `<div class="divider"></div><p class="verdict">“${esc(a.verdict)}”</p>` : ''}
    <div class="foot">${disclaimer}</div>
  </section>

</body></html>`;
}

}
