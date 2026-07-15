// Report renderer (Master Prompt §0, §3, §4). Takes the pure JSON content
// (lib/reportSchema.ts) + the report's Royal Jewel accent and composes ONE
// self-contained interactive HTML document rendered inside a WebView. The renderer
// owns all animation / SVG / interactivity; the LLM never emits HTML.
//
// Design: the DOM is server-rendered here in TS (type-safe, minimal escaping),
// with a small inline <script> for scroll-reveal, count-ups, expand toggles, and
// the radar/orbit draw-on. Vertical scroll-snap gives the 9 full-screen pages.

import type {
  ReportContent, ReportPage, Block, RatingItem, Nugget, InsightCard,
  TimelineWindow, Remedy, RadarAxis, GradientBar, ChartPlanet,
} from './reportSchema';
import type { ReportAccent } from '../constants/reportAccents';
import { chrome } from '../constants/reportChrome';
import type { Lang } from './i18n';

const esc = (s: string): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Ctx { lang: Lang; acc: ReportAccent }

// ── components ───────────────────────────────────────────────────────────────

// Velocity Score Ring (§3.2) — SVG gauge, comet-trail fill, number counts up.
function scoreRing(item: RatingItem): string {
  const R = 34, C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(10, item.score)) / 10);
  return `<div class="ring">
    <svg viewBox="0 0 80 80" class="ring-svg">
      <circle cx="40" cy="40" r="${R}" class="ring-bg"/>
      <circle cx="40" cy="40" r="${R}" class="ring-fg" data-off="${off.toFixed(1)}"
        style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${C.toFixed(1)}"/>
    </svg>
    <div class="ring-num"><span data-count="${item.score}" data-dec="1">0</span></div>
    <div class="ring-lbl">${esc(item.label)}</div>
  </div>`;
}

// Rating Badge (§3.10) — comparable sub-item, count-up X/10 in the report accent.
function ratingRow(item: RatingItem, ctx: Ctx): string {
  // No inline width — the bar fills 0 → --w (set in JS from the score) on reveal,
  // in step with the badge count-up.
  return `<div class="rate reveal">
    <div class="rate-main">
      <div class="rate-lbl">${esc(item.label)}</div>
      ${item.note ? `<div class="rate-note">${esc(item.note)}</div>` : ''}
      <div class="rate-bar"><i></i></div>
    </div>
    <div class="rate-badge"><span data-count="${item.score}">0</span><small>${chrome(ctx.lang, 'rating.outOf')}</small></div>
  </div>`;
}

// Qualitative gradient bar (§5.4 Health) — soft fill, never a number.
function gradientBar(b: GradientBar): string {
  const pct = Math.max(0, Math.min(1, b.level)) * 100;
  return `<div class="gbar reveal">
    <div class="gbar-lbl">${esc(b.label)}</div>
    <div class="gbar-track"><i style="width:${pct}%"></i></div>
    ${b.note ? `<div class="gbar-note">${esc(b.note)}</div>` : ''}
  </div>`;
}

// Knowledge Nugget (§3.9)
function nugget(n: Nugget, ctx: Ctx): string {
  const title = n.title || chrome(ctx.lang, 'nugget.title');
  return `<div class="nugget reveal">
    <div class="nugget-cap">✦ ${esc(title)}</div>
    <div class="nugget-body">${esc(n.body)}</div>
  </div>`;
}

// Insight Card (§3.5) — full content shown directly (no tap-to-reveal).
function insightCards(cards: InsightCard[], ctx: Ctx): string {
  return `<div class="cards">${cards.map((c) => `<div class="card reveal">
    <div class="card-title">${esc(c.title)}</div>
    ${c.teaser ? `<div class="card-teaser">${esc(c.teaser)}</div>` : ''}
    <p class="card-body">${esc(c.body)}</p>${c.nugget ? nugget(c.nugget, ctx) : ''}
  </div>`).join('')}</div>`;
}

// Timeline Rail (§3.3) — horizontal, "you are here" marker on the current window.
function timeline(windows: TimelineWindow[], ctx: Ctx): string {
  return `<div class="rail reveal"><div class="rail-track">${windows.map((w) => `<div class="rail-node ${w.current ? 'now' : ''}">
    ${w.current ? `<div class="rail-you">▲ ${esc(chromeYouAreHere(ctx.lang))}</div>` : ''}
    <div class="rail-dot"></div>
    <div class="rail-period">${esc(w.period)}</div>
    <div class="rail-label">${esc(w.label)}</div>
    <div class="rail-note">${esc(w.note)}</div>
  </div>`).join('')}</div></div>`;
}
function chromeYouAreHere(lang: Lang): string { return lang === 'hi' ? 'अभी यहाँ' : 'you are here'; }

// Remedy Chip (§3.6) — gold-family styling regardless of report accent. Detail shown
// directly (no tap-to-reveal).
function remedies(items: Remedy[], ctx: Ctx): string {
  const icon: Record<string, string> = { mantra: '☸', gem: '◈', ritual: '✦', direction: '➤', color: '●', daan: '❀', practice: '✓' };
  return `<div class="remedies">${items.map((r) => `<div class="remedy reveal">
    <div class="remedy-head"><span class="remedy-ico">${icon[r.kind] || '✦'}</span><span class="remedy-title">${esc(r.title)}</span></div>
    <div class="remedy-detail">${esc(r.detail)}</div>
  </div>`).join('')}</div>`;
}

// Wrap a label into at most two balanced lines (so long axis names don't run off
// the chart). Single long words are kept whole and rely on the padded viewBox.
function wrapLabel(label: string, maxLen = 12): string[] {
  const s = String(label ?? '').trim();
  const words = s.split(/\s+/);
  if (s.length <= maxLen || words.length < 2) return [s];
  let best = 0, bestDiff = Infinity, acc = 0;
  for (let i = 0; i < words.length - 1; i++) {
    acc += words[i].length + 1;
    const diff = Math.abs(acc - (s.length - acc));
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return [words.slice(0, best + 1).join(' '), words.slice(best + 1).join(' ')];
}

// Radar / Spider Chart (§3.7) — draw-on via CSS scale. Labels are anchored by their
// position (end/middle/start) and wrapped, and the viewBox is padded + overflow is
// visible, so a long axis name (e.g. "Diplomatic Service") never gets clipped.
function radar(axes: RadarAxis[], caption: string | undefined): string {
  const n = axes.length, cx = 110, cy = 110, rMax = 84;
  const pt = (i: number, r: number) => {
    const a = (-Math.PI / 2) + (i * 2 * Math.PI / n);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const grid = [0.25, 0.5, 0.75, 1].map((g) =>
    `<polygon class="rd-grid" points="${axes.map((_, i) => pt(i, rMax * g).map((v) => v.toFixed(1)).join(',')).join(' ')}"/>`).join('');
  const spokes = axes.map((_, i) => { const [x, y] = pt(i, rMax); return `<line class="rd-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
  const poly = axes.map((ax, i) => pt(i, rMax * Math.max(0, Math.min(10, ax.value)) / 10).map((v) => v.toFixed(1)).join(',')).join(' ');
  const labels = axes.map((ax, i) => {
    const [x, y] = pt(i, rMax + 14);
    const anchor = x < cx - 2 ? 'end' : x > cx + 2 ? 'start' : 'middle';
    const lines = wrapLabel(ax.label);
    const y0 = lines.length > 1 ? y - 5 : y;
    const tspans = lines.map((ln, li) => `<tspan x="${x.toFixed(1)}" dy="${li === 0 ? 0 : 11}">${esc(ln)}</tspan>`).join('');
    return `<text class="rd-lbl" x="${x.toFixed(1)}" y="${y0.toFixed(1)}" text-anchor="${anchor}">${tspans}</text>`;
  }).join('');
  return `<div class="radar reveal">
    <svg viewBox="-38 -22 296 264">${grid}${spokes}<polygon class="rd-fill" points="${poly}"/>${labels}</svg>
    ${caption ? `<div class="radar-cap">${esc(caption)}</div>` : ''}
  </div>`;
}

// Planet abbreviations for the chart cells — English or Devanagari per language.
const PABBR_EN: Record<string, string> = { Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me', Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke' };
const PABBR_HI: Record<string, string> = { Sun: 'सू', Moon: 'चं', Mars: 'मं', Mercury: 'बु', Jupiter: 'गु', Venus: 'शु', Saturn: 'श', Rahu: 'रा', Ketu: 'के' };
const pAbbr = (name: string, lang: Lang): string => (lang === 'hi' ? PABBR_HI : PABBR_EN)[name] ?? name.slice(0, 2);

// North-Indian house centres (fixed diamond layout, viewBox 300×300). Sign numbers
// rotate with the Lagna; planets sit in their whole-sign house.
const NORTH_CENTERS: Record<number, [number, number]> = {
  1: [150, 74], 2: [76, 40], 3: [40, 76], 4: [76, 150], 5: [40, 224], 6: [76, 260],
  7: [150, 226], 8: [224, 260], 9: [260, 224], 10: [224, 150], 11: [260, 76], 12: [224, 40],
};

// The actual Vedic birth chart (लग्न कुंडली) — traditional North-Indian diamond.
function vedicSvg(lagnaSign: number, planets: ChartPlanet[], lang: Lang): string {
  const byHouse: Record<number, string[]> = {};
  for (const p of planets) (byHouse[p.house] ||= []).push(pAbbr(p.name, lang));
  const frame =
    `<rect x="2" y="2" width="296" height="296" class="vk-line"/>` +
    `<line x1="2" y1="2" x2="298" y2="298" class="vk-line"/>` +
    `<line x1="298" y1="2" x2="2" y2="298" class="vk-line"/>` +
    `<polygon points="150,2 298,150 150,298 2,150" class="vk-line"/>`;
  const cells = Object.entries(NORTH_CENTERS).map(([h, [x, y]]) => {
    const sign = ((lagnaSign + (Number(h) - 1)) % 12) + 1;   // 1..12 = Aries..Pisces
    const pl = byHouse[Number(h)] || [];
    // stack planets over up to two lines so a busy house stays legible
    const rows = pl.length <= 3 ? [pl.join(' ')] : [pl.slice(0, Math.ceil(pl.length / 2)).join(' '), pl.slice(Math.ceil(pl.length / 2)).join(' ')];
    const plText = rows.map((r, ri) => `<text x="${x}" y="${y + 9 + ri * 13}" class="vk-pl">${esc(r)}</text>`).join('');
    return `<text x="${x}" y="${y - 7}" class="vk-sign">${sign}</text>${plText}`;
  }).join('');
  return `<svg viewBox="0 0 300 300">${frame}${cells}</svg>`;
}

// Full birth-chart block (§3.1, now Vedic). Static — the placements are shown, not
// hidden behind a tap.
function vedicChart(lagnaSign: number, planets: ChartPlanet[], ctx: Ctx): string {
  return `<div class="vedic reveal">${vedicSvg(lagnaSign, planets, ctx.lang)}<div class="vedic-cap">${ctx.lang === 'hi' ? 'लग्न कुंडली · उत्तर भारतीय' : 'Lagna Kundli · North-Indian'}</div></div>`;
}

function strengthsChallenges(strengths: string[], challenges: string[], ctx: Ctx): string {
  const li = (arr: string[], cls: string, sym: string) => arr.map((s) => `<li class="${cls}"><span>${sym}</span>${esc(s)}</li>`).join('');
  const sT = ctx.lang === 'hi' ? 'शक्तियाँ' : 'Strengths';
  const cT = ctx.lang === 'hi' ? 'चुनौतियाँ' : 'Challenges';
  return `<div class="sc reveal">
    <div class="sc-col sc-str"><h4>${sT}</h4><ul>${li(strengths, 'ok', '✦')}</ul></div>
    <div class="sc-col sc-cha"><h4>${cT}</h4><ul>${li(challenges, 'ch', '△')}</ul></div>
  </div>`;
}

function honest(text: string, ctx: Ctx): string {
  return `<div class="honest reveal"><div class="honest-cap">${esc(chrome(ctx.lang, 'honest.title'))}</div><p>${esc(text)}</p></div>`;
}

// Shareable Signature Card (§3.12)
function signature(lines: string[], content: ReportContent, ctx: Ctx): string {
  return `<div class="sig reveal">
    <div class="sig-brand">RITHAM</div>
    <div class="sig-title">${esc(content.pages[0].title)}</div>
    <div class="sig-name">${esc(content.person.name)}</div>
    <ul class="sig-lines">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="sig-foot">${esc(content.person.birthLine)}</div>
  </div>`;
}

// Compare Panel (§3.4 / §5.7) — two Vedic charts flanking a gold convergence score.
function compareCharts(a: { name: string; lagnaSign: number; planets: ChartPlanet[] }, b: { name: string; lagnaSign: number; planets: ChartPlanet[] }, scoreLabel: string, score: number, ctx: Ctx): string {
  return `<div class="cmp reveal">
    <div class="cmp-side"><div class="mv wa">${vedicSvg(a.lagnaSign, a.planets, ctx.lang)}</div><div class="cmp-name">${esc(a.name)}</div></div>
    <div class="cmp-center"><div class="cmp-score"><span data-count="${score}">0</span></div><div class="cmp-score-lbl">${esc(scoreLabel)}</div></div>
    <div class="cmp-side"><div class="mv wb">${vedicSvg(b.lagnaSign, b.planets, ctx.lang)}</div><div class="cmp-name">${esc(b.name)}</div></div>
  </div>`;
}

// Dual compatibility (§5.7 p4) — technical 36-guna score AND a normalized /10 badge,
// shown together so nothing technical is lost.
function dualScore(technicalLabel: string, technicalValue: number, technicalMax: number, outOf10: number, note: string | undefined, ctx: Ctx): string {
  const glance = ctx.lang === 'hi' ? 'एक नज़र में' : 'At a glance';
  return `<div class="dual reveal">
    <div class="dual-tech"><div class="dual-val"><span data-count="${technicalValue}">0</span><small>/${technicalMax}</small></div><div class="dual-lbl">${esc(technicalLabel)}</div></div>
    <div class="dual-badge"><div class="dual-cap">${glance}</div><div class="dual-num"><span data-count="${outOf10}" data-dec="1">0</span><small>/10</small></div></div>
    ${note ? `<div class="dual-note">${esc(note)}</div>` : ''}
  </div>`;
}

// Per-kuta bars (§5.7 p5) — each on its NATIVE max scale, never forced to /10.
function kutaBars(items: { label: string; got: number; max: number; note?: string }[]): string {
  return `<div class="kutas">${items.map((k) => {
    const pct = k.max > 0 ? Math.round((k.got / k.max) * 100) : 0;
    return `<div class="kuta reveal">
      <div class="kuta-top"><span class="kuta-lbl">${esc(k.label)}</span><span class="kuta-val">${k.got}/${k.max}</span></div>
      <div class="kuta-bar"><i style="--w:${pct}%"></i></div>
      ${k.note ? `<div class="kuta-note">${esc(k.note)}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// Vaastu Zone Grid (§3.8 / §5.6) — room/direction ratings, comparable so X/10 is apt.
function zoneGrid(zones: { label: string; score: number; note: string }[]): string {
  return `<div class="zgrid">${zones.map((z) => `<div class="zcard reveal">
    <div class="zcard-badge"><span data-count="${z.score}">0</span></div>
    <div class="zcard-main"><div class="zcard-lbl">${esc(z.label)}</div><div class="zcard-note">${esc(z.note)}</div></div>
  </div>`).join('')}</div>`;
}

// Per-report hero animation (§5) — each report is identifiable from page 1 alone.
function heroAnim(type: string): string {
  switch (type) {
    case 'career': // ascending comet / flight path
      return `<div class="hero-anim h-career"><div class="hc-grid"></div><div class="hc-comet"></div></div>`;
    case 'love': // two particles drifting toward each other
      return `<div class="hero-anim h-love"><div class="hl-orb hl-a"></div><div class="hl-orb hl-b"></div></div>`;
    case 'health': // slow breathing pulse
      return `<div class="hero-anim h-health"><div class="hh-blob"></div><div class="hh-blob hh-2"></div></div>`;
    case 'education': // constellation, connect-the-dots
      return `<div class="hero-anim h-edu"><svg viewBox="0 0 180 180"><polyline class="he-line" points="30,120 70,60 110,100 150,40"/><circle class="he-star" cx="30" cy="120" r="4"/><circle class="he-star" cx="70" cy="60" r="4"/><circle class="he-star" cx="110" cy="100" r="4"/><circle class="he-star" cx="150" cy="40" r="4"/></svg></div>`;
    case 'vastu': // rotating compass rose
      return `<div class="hero-anim h-vastu"><div class="hv-rose"><span></span><span></span><span></span><span></span></div><div class="hv-n">N</div></div>`;
    case 'pastlife': // inward spiral — the only reverse motion
      return `<div class="hero-anim h-past"><div class="hp-spiral"></div><div class="hp-spiral hp-2"></div><div class="hp-core"></div></div>`;
    case 'matchmaking': // two charts converging into gold
      return `<div class="hero-anim h-match"><div class="hm-ring hm-a"></div><div class="hm-ring hm-b"></div><div class="hm-core"></div></div>`;
    default: // life (flagship) — full zodiac wheel drifting in orbit
      return `<div class="hero-anim"><span></span><span></span><span></span><div class="hero-core"></div></div>`;
  }
}

// ── block dispatch ───────────────────────────────────────────────────────────

function renderBlock(b: Block, content: ReportContent, ctx: Ctx): string {
  switch (b.type) {
    case 'paragraph': return `<p class="para reveal">${esc(b.text)}</p>`;
    case 'rings': return `<div class="rings reveal">${b.items.map(scoreRing).join('')}</div>`;
    case 'ratings': return `<div class="rates">${b.items.map((it) => ratingRow(it, ctx)).join('')}</div>`;
    case 'gradientBars': return `<div class="gbars">${b.items.map(gradientBar).join('')}</div>`;
    case 'radar': return radar(b.axes, b.caption);
    case 'insights': return insightCards(b.cards, ctx);
    case 'timeline': return timeline(b.windows, ctx);
    case 'remedies': return remedies(b.items, ctx);
    case 'nugget': return nugget(b.nugget, ctx);
    case 'honest': return honest(b.text, ctx);
    case 'strengthsChallenges': return strengthsChallenges(b.strengths, b.challenges, ctx);
    case 'vedicChart': return vedicChart(b.lagnaSign, b.planets, ctx);
    case 'zoneGrid': return zoneGrid(b.zones);
    case 'compareCharts': return compareCharts(b.a, b.b, b.scoreLabel, b.score, ctx);
    case 'dualScore': return dualScore(b.technicalLabel, b.technicalValue, b.technicalMax, b.outOf10, b.note, ctx);
    case 'kutaBars': return kutaBars(b.items);
    case 'signature': return signature(b.lines, content, ctx);
    default: return '';
  }
}

function renderPage(p: ReportPage, i: number, content: ReportContent, ctx: Ctx): string {
  if (p.hero) {
    return `<section class="page hero acc" data-i="${i}">
      ${heroAnim(content.type)}
      <div class="hero-copy reveal">
        <div class="hero-kicker">${esc(content.person.birthLine)}</div>
        <h1 class="hero-title">${esc(p.title)}</h1>
        <div class="hero-name">${esc(content.person.name)}</div>
        <p class="hero-head">${esc(content.headline)}</p>
      </div>
      <div class="hero-scroll">↓</div>
    </section>`;
  }
  return `<section class="page" data-i="${i}">
    <div class="page-inner">
      <div class="page-eyebrow reveal">${esc(p.title)}</div>
      ${p.lead ? `<p class="page-lead reveal">${esc(p.lead)}</p>` : ''}
      ${p.blocks.map((b) => renderBlock(b, content, ctx)).join('')}
    </div>
  </section>`;
}

// ── document ─────────────────────────────────────────────────────────────────

export function buildReportHtml(content: ReportContent, acc: ReportAccent, opts?: { print?: boolean }): string {
  const lang = content.lang;
  const print = !!opts?.print;
  const ctx: Ctx = { lang, acc };
  const hi = lang === 'hi';
  const fontHref =
    'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600;700'
    + (hi ? '&family=Noto+Sans+Devanagari:wght@400;600;700' : '') + '&display=swap';
  const bodyFont = hi ? "'Inter','Noto Sans Devanagari',sans-serif" : "'Inter',sans-serif";
  const dispFont = hi ? "'Fraunces','Noto Sans Devanagari',serif" : "'Fraunces',serif";

  // Print/PDF mode: the on-screen doc reveals content on scroll (opacity:0 → .in),
  // which leaves every page after the first blank in a non-scrolling PDF render.
  // Force all content visible & static, paginate per page, and drop scroll-only chrome.
  const printCss = print ? `
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body.print{scroll-snap-type:none}
body.print .page{min-height:auto;page-break-after:always;break-after:page;justify-content:flex-start;padding:34px 30px}
body.print .page:last-child{page-break-after:auto;break-after:auto}
body.print .hero{min-height:auto;padding:70px 30px}
body.print .reveal{opacity:1!important;transform:none!important;transition:none!important}
body.print .rd-fill{transform:scale(1)!important;opacity:1!important;transition:none!important}
body.print .rate-bar i,body.print .gbar-track i,body.print .kuta-bar i{transition:none!important}
body.print .dots,body.print .hero-scroll{display:none!important}
` : '';

  let pages = content.pages.map((p, i) => renderPage(p, i, content, ctx)).join('');
  // In print/PDF mode, bake each count-up's FINAL value into the span text server-side.
  // expo-print snapshots the page without reliably waiting for the JS count-up, so a
  // `<span data-count="8">0</span>` would otherwise print as 0. This makes every score /
  // rating / badge correct even if no JS runs.
  if (print) {
    pages = pages.replace(/(<span data-count="(-?[\d.]+)"( data-dec="1")?>)0(<\/span>)/g,
      (_m, open, num, dec, close) => `${open}${dec ? Number(num).toFixed(1) : String(Math.round(Number(num)))}${close}`);
  }

  return `<!DOCTYPE html><html lang="${lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontHref}" rel="stylesheet">
<style>
:root{
  --acc:${acc.color};--acc2:${acc.gradient[1]};--acc1:${acc.gradient[0]};--accFaint:${acc.faint};--accSoft:${acc.soft};
  --canvas:#0D0D1A;--surface:#17172B;--raised:#20203A;--sunken:#090912;
  --text:#F5F5FA;--muted:#A0A0B8;--dim:#6B6B82;--gold:#FF007F;--goldFaint:rgba(255,0,127,.14);
  --violet:#7B2CBF;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;padding:0;background:var(--canvas);color:var(--text);font-family:${bodyFont};
  scroll-snap-type:y proximity;overflow-x:hidden;scroll-behavior:smooth}
.page{min-height:100vh;scroll-snap-align:start;padding:clamp(20px,7vw,40px);display:flex;flex-direction:column;justify-content:center;position:relative}
.page-inner{width:100%;max-width:560px;margin:0 auto}
.page-eyebrow{font-family:${bodyFont};font-weight:600;letter-spacing:2.5px;text-transform:uppercase;font-size:12px;color:var(--acc);margin-bottom:14px}
.page-lead{font-size:16px;color:var(--muted);line-height:1.5;margin:0 0 22px}
.para{font-size:15.5px;line-height:1.62;color:var(--text);margin:16px 0}
h1,h4{font-family:${dispFont}}

/* reveal on scroll */
.reveal{opacity:0;transform:translateY(18px);transition:opacity .6s cubic-bezier(.22,1,.36,1),transform .6s cubic-bezier(.22,1,.36,1)}
.page.in .reveal{opacity:1;transform:none}
.page.in .reveal:nth-child(2){transition-delay:.06s}.page.in .reveal:nth-child(3){transition-delay:.12s}
.page.in .reveal:nth-child(4){transition-delay:.18s}.page.in .reveal:nth-child(5){transition-delay:.24s}
.page.in .reveal:nth-child(6){transition-delay:.30s}

/* cover / hero */
.hero{background:linear-gradient(135deg,var(--violet),var(--gold));align-items:center;text-align:center}
.hero.acc{background:linear-gradient(135deg,var(--acc1),var(--acc2))}
.hero-anim{position:relative;width:180px;height:180px;margin-bottom:8px}
.hero-anim span{position:absolute;inset:0;border:1.5px solid rgba(255,255,255,.35);border-radius:50%;animation:spin 14s linear infinite}
.hero-anim span:nth-child(2){inset:22px;border-color:rgba(255,255,255,.22);animation-duration:9s;animation-direction:reverse}
.hero-anim span:nth-child(3){inset:44px;border-color:rgba(255,255,255,.5);animation-duration:20s}
.hero-core{position:absolute;inset:70px;border-radius:50%;background:radial-gradient(circle,#fff,rgba(255,255,255,.25));box-shadow:0 0 40px rgba(255,255,255,.6);animation:pulse 3.2s ease-in-out infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.12);opacity:1}}
.hero-kicker{color:rgba(255,255,255,.85);font-size:12px;letter-spacing:1.5px;margin-bottom:10px}
.hero-title{font-size:clamp(30px,9vw,44px);color:#fff;margin:0;line-height:1.05}
.hero-name{color:rgba(255,255,255,.92);font-size:17px;margin-top:8px;font-weight:600}
.hero-head{color:rgba(255,255,255,.9);font-size:15px;line-height:1.5;margin:18px auto 0;max-width:420px}
.hero-scroll{position:absolute;bottom:24px;left:0;right:0;color:rgba(255,255,255,.7);font-size:22px;animation:bob 1.8s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}

/* score rings */
.rings{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin:8px 0 20px}
.ring{width:104px;text-align:center}
.ring-svg{width:80px;height:80px;transform:rotate(-90deg)}
.ring-bg{fill:none;stroke:rgba(255,255,255,.08);stroke-width:6}
.ring-fg{fill:none;stroke:var(--acc);stroke-width:6;stroke-linecap:round;transition:stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1);filter:drop-shadow(0 0 5px var(--accSoft))}
.ring{position:relative}
.ring-num{position:absolute;top:22px;left:0;width:80px;text-align:center;font-family:${dispFont};font-weight:700;font-size:22px;color:var(--text)}
.ring-lbl{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.3}

/* rating badges */
.rates{display:flex;flex-direction:column;gap:12px;margin:8px 0}
.rate{display:flex;align-items:center;gap:14px;background:var(--surface);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:14px 16px}
.rate-main{flex:1;min-width:0}
.rate-lbl{font-weight:600;font-size:15px}
.rate-note{font-size:12.5px;color:var(--muted);margin-top:3px;line-height:1.4}
.rate-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.08);margin-top:9px;overflow:hidden}
.rate-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--acc1),var(--acc2));border-radius:3px;transition:width 1s cubic-bezier(.22,1,.36,1)}
.page.in .rate-bar i{width:var(--w)}
.rate-badge{flex:none;width:52px;height:52px;border-radius:14px;background:var(--accFaint);border:1px solid var(--accSoft);display:flex;flex-direction:column;align-items:center;justify-content:center}
.rate-badge span{font-family:${dispFont};font-weight:700;font-size:22px;color:var(--acc);line-height:1}
.rate-badge small{font-size:9px;color:var(--muted)}

/* gradient bars (health) */
.gbars{display:flex;flex-direction:column;gap:16px;margin:8px 0}
.gbar-lbl{font-weight:600;font-size:15px;margin-bottom:8px}
.gbar-track{height:10px;border-radius:6px;background:rgba(255,255,255,.06);overflow:hidden}
.gbar-track i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--acc1),var(--acc2));border-radius:6px;transition:width 1.1s cubic-bezier(.22,1,.36,1)}
.page.in .gbar-track i{width:var(--w)}
.gbar-note{font-size:12.5px;color:var(--muted);margin-top:7px;line-height:1.4}

/* nugget */
.nugget{background:linear-gradient(135deg,var(--accFaint),rgba(255,255,255,.02));border:1px solid var(--accSoft);border-radius:16px;padding:16px 18px;margin:18px 0}
.nugget-cap{font-weight:700;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--acc);margin-bottom:7px}
.nugget-body{font-size:14px;line-height:1.55;color:var(--text)}

/* insight cards (static — content shown directly, no tap) */
.cards{display:flex;flex-direction:column;gap:12px;margin:8px 0}
.card{background:var(--surface);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:16px 18px}
.card-title{font-weight:600;font-size:15.5px;color:var(--text)}
.card-teaser{font-size:13px;color:var(--acc);margin-top:3px}
.card-body{font-size:14.5px;line-height:1.62;color:var(--text);margin:10px 0 0}

/* timeline rail */
.rail{margin:14px -10px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.rail-track{display:flex;gap:14px;padding:26px 12px 8px;min-width:min-content}
.rail-node{flex:none;width:200px;position:relative;padding-top:10px;border-top:2px solid rgba(255,255,255,.1)}
.rail-node.now{border-top-color:var(--acc)}
.rail-dot{position:absolute;top:-7px;left:0;width:12px;height:12px;border-radius:50%;background:var(--sunken);border:2px solid rgba(255,255,255,.25)}
.rail-node.now .rail-dot{background:var(--acc);border-color:var(--acc);box-shadow:0 0 10px var(--accSoft)}
.rail-you{position:absolute;top:-26px;left:-4px;color:var(--acc);font-size:11px;font-weight:700;white-space:nowrap}
.rail-period{font-size:12px;color:var(--acc);font-weight:600}
.rail-label{font-weight:600;font-size:15px;margin-top:3px}
.rail-note{font-size:13px;color:var(--muted);margin-top:5px;line-height:1.45}

/* remedies — gold family regardless of accent */
.remedies{display:flex;flex-direction:column;gap:10px;margin:8px 0}
.remedy{background:var(--goldFaint);border:1px solid rgba(255,0,127,.32);border-radius:14px;padding:13px 16px}
.remedy-head{display:flex;align-items:center;gap:10px}
.remedy-ico{color:var(--gold);font-size:16px}
.remedy-title{font-weight:600;font-size:15px;flex:1;color:#FF57A8}
.remedy-detail{font-size:14px;line-height:1.55;color:var(--text);margin-top:9px}

/* radar */
.radar{text-align:center;margin:14px 0}
.radar svg{width:100%;max-width:300px;overflow:visible}
.rd-grid{fill:none;stroke:rgba(255,255,255,.08)}
.rd-spoke{stroke:rgba(255,255,255,.08)}
.rd-fill{fill:var(--accFaint);stroke:var(--acc);stroke-width:2;transform-origin:110px 110px;transform:scale(0);opacity:0;transition:transform .9s cubic-bezier(.22,1,.36,1),opacity .9s}
.page.in .rd-fill{transform:scale(1);opacity:1}
.rd-lbl{fill:var(--muted);font-size:9.5px;dominant-baseline:middle}
.radar-cap{font-size:13px;color:var(--muted);margin-top:6px}

/* vedic chart (North-Indian लग्न कुंडली) */
.vedic{text-align:center;margin:12px 0}
.vedic svg{width:100%;max-width:300px;background:var(--surface);border-radius:10px}
.vk-line{fill:none;stroke:var(--accSoft);stroke-width:1.4}
.vk-sign{fill:var(--dim);font-size:10px;text-anchor:middle;font-weight:700}
.vk-pl{fill:var(--acc);font-size:12px;text-anchor:middle;font-weight:700}
.vedic-cap{font-size:12px;color:var(--muted);margin-top:8px;letter-spacing:.5px}

/* strengths & challenges */
.sc{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0}
.sc-col{background:var(--surface);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:14px}
.sc-col h4{margin:0 0 10px;font-size:14px}
.sc-str h4{color:var(--success,#2DD4A7)}.sc-cha h4{color:#FFB020}
.sc ul{list-style:none;margin:0;padding:0}
.sc li{font-size:13px;line-height:1.4;margin-bottom:10px;display:flex;gap:7px;color:var(--text)}
.sc li span{flex:none}.sc li.ok span{color:var(--success,#2DD4A7)}.sc li.ch span{color:#FFB020}

/* honest */
.honest{border-left:3px solid var(--acc);background:var(--surface);border-radius:0 14px 14px 0;padding:14px 16px;margin:16px 0}
.honest-cap{font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--acc);margin-bottom:6px}
.honest p{margin:0;font-size:14.5px;line-height:1.6}

/* signature card */
.sig{background:linear-gradient(150deg,var(--raised),var(--sunken));border:1px solid var(--accSoft);border-radius:22px;padding:24px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.5)}
.sig-brand{font-family:${dispFont};font-weight:700;letter-spacing:3px;color:var(--acc);font-size:14px}
.sig-title{font-family:${dispFont};font-size:24px;margin-top:12px}
.sig-name{color:var(--muted);font-size:14px;margin-top:2px}
.sig-lines{list-style:none;padding:0;margin:18px 0 0;text-align:left}
.sig-lines li{font-size:14px;line-height:1.5;padding:9px 0 9px 22px;position:relative;border-top:1px solid rgba(255,255,255,.06)}
.sig-lines li:before{content:'✦';position:absolute;left:0;color:var(--acc)}
.sig-foot{margin-top:16px;font-size:11px;color:var(--dim);letter-spacing:1px}

/* hero variants (§5 — report identifiable from page 1) */
.h-career{overflow:hidden;border-radius:20px}
.hc-grid{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent,transparent 22px,rgba(255,255,255,.09) 23px);transform:perspective(200px) rotateX(58deg);transform-origin:bottom;opacity:.7}
.hc-comet{position:absolute;left:18px;bottom:18px;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 16px #fff,-22px 22px 26px 2px rgba(255,255,255,.4);animation:comet 2.6s ease-in infinite}
@keyframes comet{0%{left:14px;bottom:14px;opacity:0}20%{opacity:1}100%{left:150px;bottom:150px;opacity:0}}
.hl-orb{position:absolute;top:50%;width:26px;height:26px;margin-top:-13px;border-radius:50%;background:radial-gradient(circle,#fff,rgba(255,255,255,.35));box-shadow:0 0 22px rgba(255,255,255,.7)}
.hl-a{left:18px;animation:driftA 3.4s ease-in-out infinite}.hl-b{right:18px;animation:driftB 3.4s ease-in-out infinite}
@keyframes driftA{0%,100%{left:18px}50%{left:66px}}@keyframes driftB{0%,100%{right:18px}50%{right:66px}}
.hh-blob{position:absolute;inset:42px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.85),rgba(255,255,255,.1));animation:breathe 4.2s ease-in-out infinite}
.hh-2{inset:22px;background:none;border:1.5px solid rgba(255,255,255,.3);animation-delay:.35s}
@keyframes breathe{0%,100%{transform:scale(.85);opacity:.7}50%{transform:scale(1.08);opacity:1}}
.h-edu svg{width:180px;height:180px}
.he-line{fill:none;stroke:rgba(255,255,255,.7);stroke-width:2;stroke-dasharray:260;stroke-dashoffset:260;animation:draw 3s ease-in-out infinite}
.he-star{fill:#fff;filter:drop-shadow(0 0 6px #fff);animation:tw 2s ease-in-out infinite}
@keyframes draw{0%{stroke-dashoffset:260}55%,100%{stroke-dashoffset:0}}@keyframes tw{0%,100%{opacity:.5}50%{opacity:1}}
.hv-rose{position:absolute;inset:34px;animation:spin 12s linear infinite}
.hv-rose span{position:absolute;top:50%;left:50%;width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:56px solid rgba(255,255,255,.4);transform-origin:bottom center;margin:-56px 0 0 -10px}
.hv-rose span:nth-child(1){border-bottom-color:rgba(255,255,255,.9)}
.hv-rose span:nth-child(2){transform:rotate(90deg)}.hv-rose span:nth-child(3){transform:rotate(180deg)}.hv-rose span:nth-child(4){transform:rotate(270deg)}
.hv-n{position:absolute;top:6px;left:0;right:0;text-align:center;color:#fff;font-weight:700;font-size:13px}
.hp-spiral{position:absolute;inset:20px;border:2px solid rgba(255,255,255,.4);border-top-color:transparent;border-radius:50%;animation:spinR 6s linear infinite}
.hp-2{inset:48px;border-width:1.5px;animation-duration:4s}
.hp-core{position:absolute;inset:74px;border-radius:50%;background:radial-gradient(circle,#fff,rgba(255,255,255,.2));animation:pulse 3s ease-in-out infinite}
@keyframes spinR{to{transform:rotate(-360deg)}}
.hm-ring{position:absolute;top:50%;width:90px;height:90px;margin-top:-45px;border-radius:50%;border:2px solid #fff}
.hm-a{left:14px;border-color:rgba(255,120,160,.95);animation:convA 3.6s ease-in-out infinite}
.hm-b{right:14px;border-color:rgba(150,160,255,.95);animation:convB 3.6s ease-in-out infinite}
.hm-core{position:absolute;inset:72px;border-radius:50%;background:radial-gradient(circle,#FFD36A,rgba(255,211,106,.15));box-shadow:0 0 26px rgba(255,211,106,.7);animation:pulse 3.6s ease-in-out infinite}
@keyframes convA{0%,100%{transform:translateX(0)}50%{transform:translateX(28px)}}@keyframes convB{0%,100%{transform:translateX(0)}50%{transform:translateX(-28px)}}

/* compare panel (matchmaking) */
.cmp{display:flex;align-items:center;justify-content:center;gap:4px;margin:16px 0}
.cmp-side{text-align:center;flex:1;min-width:0}
.mv{width:100%;max-width:130px;margin:0 auto}
.mv svg{width:100%;background:var(--sunken);border-radius:8px}
.mv .vk-sign{font-size:9px}.mv .vk-pl{font-size:11px}
.wa .vk-pl{fill:#E5004C}.wb .vk-pl{fill:#6C5CE7}
.wa .vk-line{stroke:rgba(229,0,76,.4)}.wb .vk-line{stroke:rgba(108,92,231,.4)}
.cmp-name{font-size:12px;color:var(--muted);margin-top:6px;font-weight:600}
.cmp-center{flex:none;text-align:center;padding:0 2px}
.cmp-score{width:68px;height:68px;border-radius:50%;background:radial-gradient(circle,rgba(255,211,106,.25),transparent);border:2px solid #FFD36A;display:flex;align-items:center;justify-content:center;box-shadow:0 0 20px rgba(255,211,106,.4)}
.cmp-score span{font-family:${dispFont};font-weight:700;font-size:24px;color:#FFD36A}
.cmp-score-lbl{font-size:11px;color:var(--muted);margin-top:6px}

/* dual score (matchmaking) */
.dual{background:var(--surface);border:1px solid rgba(255,255,255,.07);border-radius:18px;padding:18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:10px 0}
.dual-tech{flex:1;min-width:120px}
.dual-val{font-family:${dispFont};font-weight:700;font-size:34px;color:var(--text)}.dual-val small{font-size:16px;color:var(--muted)}
.dual-lbl{font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-top:2px}
.dual-badge{flex:none;text-align:center;background:var(--accFaint);border:1px solid var(--accSoft);border-radius:14px;padding:10px 16px}
.dual-cap{font-size:10px;color:var(--muted)}
.dual-num{font-family:${dispFont};font-weight:700;font-size:24px;color:var(--acc)}.dual-num small{font-size:12px;color:var(--muted)}
.dual-note{flex-basis:100%;font-size:13px;color:var(--muted);line-height:1.5}

/* kuta bars (matchmaking) */
.kutas{display:flex;flex-direction:column;gap:12px;margin:8px 0}
.kuta-top{display:flex;justify-content:space-between;align-items:baseline}
.kuta-lbl{font-weight:600;font-size:14px}.kuta-val{font-size:13px;color:var(--acc);font-weight:600}
.kuta-bar{height:7px;border-radius:4px;background:rgba(255,255,255,.07);margin-top:7px;overflow:hidden}
.kuta-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--acc1),var(--acc2));border-radius:4px;transition:width 1s cubic-bezier(.22,1,.36,1)}
.page.in .kuta-bar i{width:var(--w)}
.kuta-note{font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.4}

/* zone grid (vaastu) */
.zgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0}
.zcard{background:var(--surface);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:12px;display:flex;gap:10px}
.zcard-badge{flex:none;width:38px;height:38px;border-radius:10px;background:var(--accFaint);border:1px solid var(--accSoft);display:flex;align-items:center;justify-content:center;font-family:${dispFont};font-weight:700;color:var(--acc);font-size:17px}
.zcard-lbl{font-weight:600;font-size:13.5px}.zcard-note{font-size:11.5px;color:var(--muted);line-height:1.35;margin-top:3px}

/* page dots */
.dots{position:fixed;right:12px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:9px;z-index:20}
.dots i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.22);transition:all .3s}
.dots i.on{background:var(--acc);transform:scale(1.5)}
${printCss}
</style></head>
<body class="${print ? 'print' : ''}">
${pages}
<div class="dots">${content.pages.map((_, i) => `<i data-dot="${i}"></i>`).join('')}</div>
<script>
(function(){
  var pages=[].slice.call(document.querySelectorAll('.page'));
  var dots=[].slice.call(document.querySelectorAll('.dots i'));
  // set rating bar widths from data
  [].forEach.call(document.querySelectorAll('.rate'),function(r){
    var b=r.querySelector('.rate-badge span'); if(!b)return;
    var bar=r.querySelector('.rate-bar i'); if(bar)bar.style.setProperty('--w',(Math.max(0,Math.min(10,+b.dataset.count))*10)+'%');
  });
  [].forEach.call(document.querySelectorAll('.gbar-track i'),function(i){ i.style.setProperty('--w', i.style.width); i.style.width=''; });
  function countUp(el){
    var to=+el.dataset.count, dec=el.dataset.dec==='1', t0=performance.now(), dur=1000;
    function f(t){var k=Math.min(1,(t-t0)/dur);var v=to*(1-Math.pow(1-k,3));el.textContent=dec?v.toFixed(1):Math.round(v);if(k<1)requestAnimationFrame(f);}
    requestAnimationFrame(f);
  }
  function animate(pg){
    [].forEach.call(pg.querySelectorAll('[data-count]'),countUp);
    [].forEach.call(pg.querySelectorAll('.ring-fg'),function(r){r.style.strokeDashoffset=r.dataset.off;});
  }
  function reveal(p){ if(p&&!p.classList.contains('in')){p.classList.add('in');animate(p);} }
  // Reveal on scroll: any page whose top has risen into view (or been scrolled past)
  // is shown. This survives scroll-snap MOMENTUM that skips middle pages — the old
  // IntersectionObserver(threshold .4) never fired for a page that snap-scrolling
  // jumped over, leaving it blank. Once revealed a page stays revealed.
  function activeDot(){
    var mid=window.innerHeight/2, best=1e9, bi=0;
    pages.forEach(function(p,idx){var r=p.getBoundingClientRect();var d=Math.abs((r.top+r.bottom)/2-mid);if(d<best){best=d;bi=idx;}});
    dots.forEach(function(d,di){d.classList.toggle('on',di===bi);});
  }
  function onScroll(){
    var vh=window.innerHeight;
    pages.forEach(function(p){var r=p.getBoundingClientRect();if(r.top<vh*0.85&&r.bottom>0)reveal(p);});
    activeDot();
  }
  // A low-threshold observer gives the nice entrance animation on gentle scrolling;
  // the scroll handler is the fallback that guarantees nothing stays hidden.
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)reveal(e.target);});},{threshold:0.01});
  pages.forEach(function(p){io.observe(p);});
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll,{passive:true});
  reveal(pages[0]); onScroll();
})();
${print ? `
(function(){
  // PDF render: reveal EVERY page and jump counters/rings/bars to their final values
  // now (no scroll, no IntersectionObserver, no animation) so nothing prints blank.
  [].forEach.call(document.querySelectorAll('.page'),function(p){p.classList.add('in');});
  [].forEach.call(document.querySelectorAll('[data-count]'),function(el){var to=+el.dataset.count,dec=el.dataset.dec==='1';el.textContent=dec?to.toFixed(1):String(Math.round(to));});
  [].forEach.call(document.querySelectorAll('.ring-fg'),function(r){r.style.strokeDashoffset=r.dataset.off;});
})();` : ''}
</script>
</body></html>`;
}
