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

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = 'claude-sonnet-5';

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
    if (type !== 'vastu' && type !== 'matchmaking') return json({ error: 'unsupported_type' }, 400);

    // a paid, unconsumed 'report' entitlement of THIS type (plan_id = type)
    const { data: ent } = await admin
      .from('entitlements_ledger').select('*')
      .eq('user_id', user.id).eq('kind', 'report').eq('plan_id', type).is('consumed_at', null)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!ent) return json({ error: 'needs_purchase' });

    // ── validate + assemble the row per report type ───────────────────────────
    let insertRow: Record<string, unknown>;
    let style: 'north' | 'south' = 'north';
    if (type === 'vastu') {
      const { answers, floorplanPath } = body;
      if (!answers || typeof answers !== 'object') return json({ error: 'missing_answers' }, 400);
      if (!floorplanPath) return json({ error: 'missing_floorplan' }, 400);
      if (!String(floorplanPath).startsWith(`${user.id}/`)) return json({ error: 'forbidden_path' }, 403);
      insertRow = {
        user_id: user.id, order_id: ent.order_id, entitlement_id: ent.id,
        type, status: 'generating', answers, floorplan_path: floorplanPath,
      };
    } else {
      const { self, partner, chartStyle } = body;
      if (!isPerson(self) || !isPerson(partner)) return json({ error: 'missing_people' }, 400);
      style = chartStyle === 'south' ? 'south' : 'north';
      insertRow = {
        user_id: user.id, order_id: ent.order_id, entitlement_id: ent.id,
        type, status: 'generating', chart_style: style,
        partner: { self, partner }, // both charts kept on the record
      };
    }

    const { data: report, error: rErr } = await admin
      .from('reports').insert(insertRow).select().single();
    if (rErr) return json({ error: 'report_create_failed', detail: rErr.message }, 500);

    try {
      let html: string;
      let score: number;
      if (type === 'vastu') {
        const analysis = await generateVastu(admin, body.floorplanPath, body.answers);
        html = renderVastuHtml(body.answers, analysis);
        score = analysis.score;
      } else {
        const milan = computeMilan(body.self, body.partner);
        const analysis = await generateMatch(body.self, body.partner, milan);
        html = renderMatchHtml(body.self, body.partner, milan, analysis, style);
        score = milan.percent;
      }

      await admin.from('reports')
        .update({ status: 'ready', html, score }).eq('id', report.id);
      await admin.from('entitlements_ledger')
        .update({ consumed_at: new Date().toISOString() }).eq('id', ent.id);

      return json({ report_id: report.id, status: 'ready', score });
    } catch (genErr) {
      await admin.from('reports').update({ status: 'failed' }).eq('id', report.id);
      return json({ error: 'generation_failed', detail: String((genErr as Error)?.message ?? genErr) }, 500);
    }
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as Error)?.message ?? e) }, 500);
  }
});

// ── Vaastu analysis (Claude vision → structured JSON; mock until key set) ───────
async function generateVastu(admin: any, floorplanPath: string, answers: any): Promise<VastuAnalysis> {
  if (!ANTHROPIC_API_KEY) return mockVastu(answers);

  const { data: file, error: dErr } = await admin.storage.from('reports').download(floorplanPath);
  if (dErr || !file) throw new Error(`floorplan_download_failed: ${dErr?.message ?? 'no file'}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
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
    `}`;

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
      max_tokens: 8000,
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

function parseAnalysis(text: string): VastuAnalysis {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  const slice = s >= 0 && e > s ? text.slice(s, e + 1) : text;
  const obj = JSON.parse(slice);
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
  const scoreColor = a.score >= 75 ? '#52a87c' : a.score >= 50 ? '#e6c063' : '#e05252';

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
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: #f0ece8;
         background: #14122b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { min-height: 100vh; padding: 46px 40px; page-break-after: always;
          background: linear-gradient(160deg, #14122b 0%, #1e1b45 100%); }
  .page:last-child { page-break-after: auto; }
  h1, h2, h3 { font-weight: normal; letter-spacing: 0.3px; margin: 0; }
  .brand { color: #d9a441; font-size: 14px; letter-spacing: 3px; }
  .divider { height: 1px; background: linear-gradient(90deg, transparent, #d9a441, transparent);
             margin: 18px 0; }
  .cover { display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .cover .logo { font-size: 40px; color: #d9a441; margin-bottom: 8px; }
  .cover h1 { font-size: 40px; color: #f0ece8; margin: 8px 0; }
  .cover .sub { color: #9b96b0; font-size: 15px; }
  .cover .who { margin-top: 28px; color: #e6c063; font-size: 22px; }
  .cover .date { color: #6b6585; font-size: 13px; margin-top: 6px; }
  h2.section { color: #e6c063; font-size: 24px; margin: 0 0 4px; }
  .lead { color: #9b96b0; font-size: 13px; margin-bottom: 10px; }
  table.details { width: 100%; border-collapse: collapse; }
  table.details td { padding: 10px 4px; border-bottom: 1px solid #2d2960; font-size: 15px; vertical-align: top; }
  td.k { color: #9b96b0; width: 42%; }
  td.v { color: #f0ece8; }
  p.body { font-size: 14.5px; line-height: 1.75; color: #ded9e6; margin: 0 0 12px; }
  .dir { border-left: 2px solid #d9a441; padding: 4px 0 4px 14px; margin-bottom: 14px; }
  .dir-head { display: flex; justify-content: space-between; align-items: baseline; }
  .dir-name { color: #f0ece8; font-size: 16px; }
  .dir-el { color: #d9a441; font-size: 12px; letter-spacing: 0.5px; }
  .dir-assess { color: #cfc9dd; font-size: 13.5px; line-height: 1.6; margin: 4px 0 0; }
  .zone { border: 1px solid #2d2960; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px;
          background: rgba(30,27,69,0.6); }
  .zone-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
  .zone-area { color: #f0ece8; font-size: 17px; }
  .zone-dir { color: #d9a441; font-size: 12px; letter-spacing: 1px; }
  .zone-assess { color: #cfc9dd; font-size: 13.5px; line-height: 1.6; margin: 4px 0; }
  .zone-rec { color: #ded9e6; font-size: 13.5px; line-height: 1.6; margin: 4px 0 0; }
  .rec-label { color: #e6c063; }
  .dosha { border: 1px solid #3a2f4a; border-radius: 10px; padding: 12px 16px; margin-bottom: 12px;
           background: rgba(60,30,40,0.25); }
  .dosha-issue { color: #e6c063; font-size: 15px; margin-bottom: 4px; }
  .dosha-line { color: #cfc9dd; font-size: 13.5px; line-height: 1.6; margin: 2px 0; }
  .dl { color: #d9a441; }
  .score-box { text-align: center; border: 1px solid #2d2960; border-radius: 14px; padding: 26px;
               background: rgba(30,27,69,0.6); margin: 8px 0 16px; }
  .score-num { font-size: 62px; color: ${scoreColor}; }
  .score-cap { color: #9b96b0; font-size: 13px; letter-spacing: 1px; }
  .verdict { color: #ded9e6; font-size: 15px; line-height: 1.6; text-align: center; font-style: italic; }
  ul.list { padding-left: 20px; margin: 0; }
  ul.list li { font-size: 14.5px; line-height: 1.7; color: #ded9e6; margin-bottom: 8px; }
  .two { display: flex; gap: 20px; }
  .two .col { flex: 1; }
  .col h3 { color: #e6c063; font-size: 17px; margin-bottom: 8px; }
  .foot { color: #6b6585; font-size: 11px; text-align: center; margin-top: 28px; line-height: 1.5; }
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
      <div class="score-num">${a.score}<span style="font-size:26px;color:#9b96b0">/100</span></div>
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
    && typeof p.name === 'string'
    && typeof p.moon_sign === 'string' && typeof p.nakshatra === 'string'
    && Array.isArray(p.placements);
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
async function generateMatch(a: Person, b: Person, m: Milan): Promise<MatchAnalysis> {
  if (!ANTHROPIC_API_KEY) return mockMatch(a, b, m);

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
    `}`;
  const userText =
    `Partner A: ${a.name}, Moon in ${a.moon_sign}, Nakshatra ${a.nakshatra}, Lagna ${a.lagna}.\n` +
    `Partner B: ${b.name}, Moon in ${b.moon_sign}, Nakshatra ${b.nakshatra}, Lagna ${b.lagna}.\n` +
    `Computed Ashtakoot: ${table}. Total ${m.total}/36.\n` +
    `Write the complete JSON compatibility report.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 6000, thinking: { type: 'disabled' }, system,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content ?? []).find((x: any) => x.type === 'text')?.text ?? '';
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  const obj = JSON.parse(s >= 0 && e > s ? text.slice(s, e + 1) : text);
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
  const scoreColor = m.percent >= 66 ? '#52a87c' : m.percent >= 44 ? '#e6c063' : '#e05252';
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
      <td class="kp"><span style="color:${k.got >= k.max * 0.5 ? '#52a87c' : '#e6a05a'}">${k.got}</span> / ${k.max}</td>
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
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: #f0ece8;
         background: #14122b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { min-height: 100vh; padding: 46px 40px; page-break-after: always;
          background: linear-gradient(160deg, #14122b 0%, #1e1b45 100%); }
  .page:last-child { page-break-after: auto; }
  h1, h2, h3 { font-weight: normal; margin: 0; }
  .brand { color: #d9a441; font-size: 14px; letter-spacing: 3px; }
  .divider { height: 1px; background: linear-gradient(90deg, transparent, #d9a441, transparent); margin: 18px 0; }
  .cover { display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .cover .logo { font-size: 40px; color: #d9a441; }
  .cover h1 { font-size: 38px; color: #f0ece8; margin: 8px 0; }
  .cover .sub { color: #9b96b0; font-size: 15px; }
  .pair { margin-top: 30px; color: #e6c063; font-size: 24px; }
  .pair .amp { color: #d9a441; font-size: 18px; margin: 0 10px; }
  .cover .date { color: #6b6585; font-size: 13px; margin-top: 8px; }
  h2.section { color: #e6c063; font-size: 24px; margin: 0 0 4px; }
  .lead { color: #9b96b0; font-size: 13px; margin-bottom: 10px; }
  p.body { font-size: 14.5px; line-height: 1.75; color: #ded9e6; margin: 0 0 12px; }
  table.details { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  table.details td { padding: 7px 4px; border-bottom: 1px solid #2d2960; font-size: 13.5px; vertical-align: top; }
  td.k { color: #9b96b0; width: 34%; } td.v { color: #f0ece8; }
  .who { color: #e6c063; font-size: 17px; margin: 14px 0 6px; }
  /* score */
  .score-box { text-align: center; border: 1px solid #2d2960; border-radius: 14px; padding: 22px;
               background: rgba(30,27,69,0.6); margin: 8px 0 16px; }
  .score-num { font-size: 58px; color: ${scoreColor}; }
  .score-cap { color: #9b96b0; font-size: 13px; letter-spacing: 1px; }
  .band { color: ${scoreColor}; font-size: 16px; letter-spacing: 1px; margin-top: 4px; }
  .verdict { color: #ded9e6; font-size: 15px; line-height: 1.6; text-align: center; font-style: italic; }
  /* koota table */
  table.koota { width: 100%; border-collapse: collapse; }
  table.koota th { text-align: left; color: #9b96b0; font-size: 11px; letter-spacing: 1px;
                   padding: 6px 6px; border-bottom: 1px solid #d9a441; }
  table.koota td { padding: 9px 6px; border-bottom: 1px solid #2d2960; vertical-align: top; }
  td.kn { color: #f0ece8; font-size: 14px; width: 22%; }
  td.kp { color: #ded9e6; font-size: 15px; width: 16%; }
  td.kd { color: #cfc9dd; font-size: 12.5px; line-height: 1.5; }
  tr.tot td { border-top: 1px solid #d9a441; color: #e6c063; font-size: 15px; padding-top: 10px; }
  ul.list { padding-left: 20px; margin: 0; }
  ul.list li { font-size: 14px; line-height: 1.65; color: #ded9e6; margin-bottom: 7px; }
  /* charts */
  .charts { display: flex; gap: 18px; }
  .charts .col { flex: 1; text-align: center; }
  .col h3 { color: #e6c063; font-size: 15px; margin-bottom: 8px; }
  svg.chart { width: 100%; max-width: 240px; }
  svg.chart .cl { fill: none; stroke: #d9a441; stroke-width: 1; }
  svg.chart .cs { fill: #8f8aa8; font-size: 9px; text-anchor: middle; }
  svg.chart .cg { fill: #f0ece8; font-size: 11px; text-anchor: middle; }
  .sgrid { display: grid; grid-template-columns: repeat(4,1fr); grid-template-rows: repeat(4,52px);
           border: 1px solid #d9a441; max-width: 240px; margin: 0 auto; }
  .sc { border: 0.5px solid #2d2960; padding: 3px; display: flex; flex-direction: column;
        align-items: flex-start; justify-content: flex-start; overflow: hidden; }
  .sc.lag { background: rgba(217,164,65,0.16); }
  .sc.mid { align-items: center; justify-content: center; color: #d9a441; font-size: 11px; border: none; }
  .ss { color: #8f8aa8; font-size: 9px; }
  .sg { color: #f0ece8; font-size: 11px; line-height: 1.25; }
  .chartnote { color: #6b6585; font-size: 11px; text-align: center; margin-top: 10px; }
  .foot { color: #6b6585; font-size: 11px; text-align: center; margin-top: 28px; line-height: 1.5; }
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
      <div class="score-num">${m.percent}<span style="font-size:24px;color:#9b96b0">%</span></div>
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
