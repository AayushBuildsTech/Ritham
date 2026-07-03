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

    const { type, answers, floorplanPath } = await req.json();
    if (type !== 'vastu') return json({ error: 'unsupported_type' }, 400); // matchmaking later
    if (!answers || typeof answers !== 'object') return json({ error: 'missing_answers' }, 400);
    if (!floorplanPath) return json({ error: 'missing_floorplan' }, 400);

    const { data: ent } = await admin
      .from('entitlements_ledger').select('*')
      .eq('user_id', user.id).eq('kind', 'report').eq('plan_id', type).is('consumed_at', null)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!ent) return json({ error: 'needs_purchase' });

    if (!String(floorplanPath).startsWith(`${user.id}/`)) return json({ error: 'forbidden_path' }, 403);

    const { data: report, error: rErr } = await admin
      .from('reports')
      .insert({
        user_id: user.id, order_id: ent.order_id, entitlement_id: ent.id,
        type, status: 'generating', answers, floorplan_path: floorplanPath,
      })
      .select().single();
    if (rErr) return json({ error: 'report_create_failed', detail: rErr.message }, 500);

    try {
      const analysis = await generateVastu(admin, floorplanPath, answers);
      const html = renderVastuHtml(answers, analysis);

      await admin.from('reports')
        .update({ status: 'ready', html, score: analysis.score }).eq('id', report.id);
      await admin.from('entitlements_ledger')
        .update({ consumed_at: new Date().toISOString() }).eq('id', ent.id);

      return json({ report_id: report.id, status: 'ready', score: analysis.score });
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
