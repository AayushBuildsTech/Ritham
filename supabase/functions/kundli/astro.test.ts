// Validation harness — run with: node --experimental-strip-types astro.test.ts
// Checks the engine against hard astronomical anchors that have known answers.
import { computeLongitudes, signOf, signIndexOf, nakshatraOf, SIGNS, rev } from './astro.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

// ── 1. Sidereal Sun sign ingresses (the Sankranti dates, well-known & fixed) ─────
// Sun enters Capricorn ~Jan 14 (Makar Sankranti), Aries ~Apr 14 (Mesha Sankranti),
// Cancer ~Jul 16 (Karka). Scan noon UTC each day and find the ingress day.
function ingressDay(year: number, targetSignIdx: number): string {
  let prev = -1;
  for (let m = 0; m < 12; m++) {
    for (let day = 1; day <= 31; day++) {
      const dt = new Date(Date.UTC(year, m, day, 6, 30, 0)); // ~noon IST
      if (dt.getUTCMonth() !== m) continue;
      const idx = signIndexOf(computeLongitudes(dt, 28.6, 77.2).sidereal.Sun);
      if (idx === targetSignIdx && prev !== targetSignIdx && prev !== -1) {
        return dt.toISOString().slice(0, 10);
      }
      prev = idx;
    }
  }
  return '(none)';
}

const cap = ingressDay(2024, 9); // Capricorn = index 9
const ari = ingressDay(2024, 0); // Aries = index 0
const car = ingressDay(2024, 3); // Cancer = index 3
console.log(`\nSun sidereal ingresses 2024: Capricorn=${cap}  Aries=${ari}  Cancer=${car}`);
ok(cap.startsWith('2024-01-1'), `Makar Sankranti (Sun→Capricorn) ~Jan 14/15, got ${cap}`);
ok(ari.startsWith('2024-04-1'), `Mesha Sankranti (Sun→Aries) ~Apr 14, got ${ari}`);
ok(car.startsWith('2024-07-1'), `Karka Sankranti (Sun→Cancer) ~Jul 16, got ${car}`);

// ── 2. Ascendant must cycle through ALL 12 signs over 24h, ~once each ────────────
{
  const base = Date.UTC(2000, 0, 1, 0, 0, 0);
  const seen = new Set<number>();
  let signChanges = 0;
  let prevIdx = -1;
  for (let min = 0; min < 24 * 60; min += 4) {
    const dt = new Date(base + min * 60000);
    const idx = signIndexOf(computeLongitudes(dt, 28.6, 77.2).ascSidereal);
    seen.add(idx);
    if (idx !== prevIdx && prevIdx !== -1) signChanges++;
    prevIdx = idx;
  }
  ok(seen.size === 12, `Ascendant visits all 12 signs in a day (visited ${seen.size})`);
  ok(signChanges === 12, `Ascendant changes sign exactly 12 times/day (got ${signChanges})`);
}

// ── 3. Moon moves ~13.2°/day (sidereal), Sun ~1°/day — sanity on rates ──────────
{
  const d0 = new Date(Date.UTC(2020, 5, 15, 0, 0, 0));
  const d1 = new Date(Date.UTC(2020, 5, 16, 0, 0, 0));
  const a = computeLongitudes(d0, 19.07, 72.87).sidereal;
  const b = computeLongitudes(d1, 19.07, 72.87).sidereal;
  const moonRate = rev(b.Moon - a.Moon);
  const sunRate = rev(b.Sun - a.Sun);
  ok(moonRate > 11.5 && moonRate < 15, `Moon daily motion ~13.2° (got ${moonRate.toFixed(2)}°)`);
  ok(sunRate > 0.9 && sunRate < 1.05, `Sun daily motion ~1° (got ${sunRate.toFixed(3)}°)`);
}

// ── 4. Rahu and Ketu are always exactly 180° apart and retrograde slowly ─────────
{
  const c = computeLongitudes(new Date(Date.UTC(2015, 2, 21, 6, 0, 0)), 28.6, 77.2).sidereal;
  ok(Math.abs(rev(c.Ketu - c.Rahu) - 180) < 0.001, `Rahu/Ketu exactly 180° apart`);
}

// ── 5. Ayanamsa is in the expected modern range (~24°) ──────────────────────────
{
  const c = computeLongitudes(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)), 28.6, 77.2);
  ok(c.ayanamsa > 24.0 && c.ayanamsa < 24.25, `Lahiri ayanamsa 2020 ~24.1° (got ${c.ayanamsa.toFixed(4)}°)`);
}

// ── Sample chart for eyeballing against a trusted site (e.g. Prokerala/AstroSage) ─
{
  // 1990-08-15, 14:30 IST (= 09:00 UTC), New Delhi (28.6139N, 77.2090E)
  const dt = new Date(Date.UTC(1990, 7, 15, 9, 0, 0));
  const { sidereal, ayanamsa } = computeLongitudes(dt, 28.6139, 77.209);
  console.log(`\nSample chart — 1990-08-15 14:30 IST, New Delhi (ayanamsa ${ayanamsa.toFixed(3)}°):`);
  for (const k of ['Ascendant', 'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']) {
    const lon = sidereal[k];
    const deg = (rev(lon) % 30).toFixed(2);
    console.log(`  ${k.padEnd(10)} ${signOf(lon).padEnd(24)} ${deg}°${k === 'Moon' ? '  nak: ' + nakshatraOf(lon) : ''}`);
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
