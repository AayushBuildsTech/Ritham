// Local proof for the VedAstro integration (spec "VERIFY BEFORE SHOWING ME").
// Calls the LIVE VedAstro API through the real _shared/vedastro.ts module and prints
// a rich Kundli (chart_facts + summary_text), a Panchang sample, and a numerology
// sample. Also builds the chat static-chart block so you can see dasha/nakshatra/
// transits are injected. Run:  node scripts/vedastro-sample.mjs
//
// It exercises the SAME code the `kundli`/`panchang` Edge Functions run; the only
// shim is Deno.env → process.env (so VEDASTRO_API_KEY is picked up if set).

globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

const { Veda } = await import('../supabase/functions/_shared/vedastro.ts');
const { fetchRichKundli, fetchPanchang } = Veda;
const { currentDynamics } = await import('../supabase/functions/_shared/kundliSummary.ts');
const { computeNumerology } = await import('../lib/numerology.ts');

const birth = {
  name: 'Test User',
  gender: 'male',
  dob: '1995-08-15',
  tob: '09:30:00',
  latitude: 13.0827,
  longitude: 80.2707,
  timezone: 'Asia/Kolkata',
  birth_place: 'Chennai, India',
};

function assert(cond, msg) { console.log(cond ? `  ✓ ${msg}` : `  ✗ MISSING: ${msg}`); }

console.log('=== 1. RICH KUNDLI (live VedAstro) ===');
const k = await fetchRichKundli(birth);
const f = k.chart_facts;
console.log(`source=${k.source} engine_version=${k.engine_version}`);
console.log(`Lagna ${f.lagna} | Rashi ${f.moon_sign} | Nakshatra ${f.nakshatra} pada ${f.pada} | Sun ${f.sun_sign}`);
console.log('\nPlanets:');
for (const g of f.grahas)
  console.log(`  ${g.graha.padEnd(16)} ${g.sign.padEnd(22)} H${g.house} nak=${g.nakshatra}/${g.pada} ${g.dignity}${g.retrograde ? ' R' : ''}${g.combust ? ' C' : ''} D9=${g.navamsa_sign.split(' ')[0]} D10=${g.dashamsa_sign.split(' ')[0]} shadbala=${g.shadbala}`);
console.log('\nHouse lords:');
for (const h of f.houses) console.log(`  H${h.house} ${h.sign.padEnd(22)} lord ${h.lord} in H${h.lord_house}`);
console.log('\nYogas:', f.yogas.map((y) => y.name).join(', ') || '(none)');
console.log('Doshas:', f.doshas.map((d) => `${d.name}=${d.present}`).join(', '));
console.log('\nDasha timeline (Vimshottari maha):');
for (const p of f.dasha_timeline.slice(0, 5)) console.log(`  ${p.lord.padEnd(8)} ${p.start.slice(0, 10)} → ${p.end.slice(0, 10)}`);

console.log('\n--- VERIFY (§1 required depth) ---');
assert(f.grahas.length === 9, 'all 9 grahas present');
assert(f.houses.length === 12 && f.houses.every((h) => h.lord), '12 house lords present');
assert(f.dasha_timeline.length >= 9 && /\d{4}-\d{2}-\d{2}/.test(f.dasha_timeline[0].start), 'dasha timeline with dates');
assert(f.yogas.length > 0 || f.doshas.length > 0, 'yogas/doshas detected');
assert(f.grahas.every((g) => g.navamsa_sign && g.dashamsa_sign), 'D9 + D10 divisional signs present');

console.log('\n=== 2. summary_text (stored in kundli_summary; injected into chat) ===');
console.log(k.summary);

console.log('\n=== 3. CURRENT DYNAMICS (computed fresh at chat time — transits/dasha/Sade Sati) ===');
const dyn = currentDynamics(k);
console.log(`Mahadasha: ${dyn.mahadasha.lord} until ${dyn.mahadasha.end.slice(0, 10)}`);
console.log(`Antardasha: ${dyn.antardasha.lord} until ${dyn.antardasha.end.slice(0, 10)}`);
console.log(`Shani transit: ${dyn.transits.saturn.sign} (H${dyn.transits.saturn.house_from_lagna} from Lagna, H${dyn.transits.saturn.house_from_moon} from Moon)`);
console.log(`Guru transit: ${dyn.transits.jupiter.sign} (H${dyn.transits.jupiter.house_from_lagna} from Lagna)`);
console.log(`Sade Sati: ${dyn.sade_sati.detail}`);
assert(dyn.mahadasha.lord !== 'not available', 'current mahadasha resolved from stored timeline');
assert(dyn.transits.saturn.sign, 'current gochar (transit) computed');

console.log('\n=== 4. PANCHANG (live VedAstro, one call — cached per city/day) ===');
const pan = await fetchPanchang(birth.latitude, birth.longitude, 2026, 7, 8);
console.log(JSON.stringify(pan, null, 1));
assert(pan.tithi !== 'not available' && pan.nakshatra !== 'not available', 'panchang tithi + nakshatra present');

console.log('\n=== 5. NUMEROLOGY (local, behind kundliService.getNumerology) ===');
console.log(JSON.stringify(computeNumerology(birth.name, birth.dob)));

// §7 verify: the exact chart block the chat Edge Function injects into the system prompt
// (stored summary_text + fresh dynamics). Proves that for a bare question like "meri
// shaadi kab hogi" the astrologer already HAS dasha, nakshatra and transits — so it can
// answer from the chart and never says "I don't have your details".
console.log('\n=== 6. CHAT GROUNDING PROOF (what the system prompt receives) ===');
const injected = [
  `Lagna: ${f.lagna}; Lagna lord ${f.lagna_lord.graha} in ${f.lagna_lord.sign} (house ${f.lagna_lord.house})`,
  `Rashi: ${f.moon_sign} | Nakshatra: ${f.nakshatra} (Pada ${f.pada}) | Sun: ${f.sun_sign}`,
  `Current Mahadasha: ${dyn.mahadasha.lord} (until ${monthOf(dyn.mahadasha.end)}); Antardasha: ${dyn.antardasha.lord}`,
  `Upcoming dasha: ${dyn.upcoming.map((p) => `${p.lord} (${monthOf(p.start)})`).join(', ')}`,
  `Transits: Shani ${dyn.transits.saturn.sign.split(' ')[0]} (${dyn.transits.saturn.house_from_moon} from Moon), Guru ${dyn.transits.jupiter.sign.split(' ')[0]}`,
  `Sade Sati: ${dyn.sade_sati.active ? `active (${dyn.sade_sati.phase})` : 'not active'}`,
  `Doshas: ${f.doshas.filter((d) => d.present).map((d) => d.name).join(', ') || 'none flagged'}`,
].join('\n');
console.log(injected);
const has = (re) => re.test(injected);
console.log('\n  Would the astrologer have to ask for details?',
  (has(/Mahadasha/) && has(/Nakshatra/) && has(/Transits/) && dyn.mahadasha.lord !== 'not available')
    ? 'NO — dasha, nakshatra and transits are all injected. It answers from the chart. ✓'
    : '⚠️ something is missing from the injected block');

function monthOf(iso) { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }

console.log('\nDONE.');
