// Validation harness — run with: node --experimental-strip-types astro.test.ts
// Checks the shared engine against hard astronomical anchors with known answers.
import {
  computeLongitudes, sunTimesUTC, signOf, signIndexOf, nakshatraOf, rev,
} from './astro.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};
// India has no DST → fixed +5:30; a UTC instant's IST clock time:
const istHours = (dt: Date) =>
  ((dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600) + 5.5) % 24;
const hhmm = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

// ── 1. Sidereal Sun sign ingresses (the Sankranti dates) ─────────────────────────
function ingressDay(year: number, targetSignIdx: number): string {
  let prev = -1;
  for (let m = 0; m < 12; m++) {
    for (let day = 1; day <= 31; day++) {
      const dt = new Date(Date.UTC(year, m, day, 6, 30, 0));
      if (dt.getUTCMonth() !== m) continue;
      const idx = signIndexOf(computeLongitudes(dt, 28.6, 77.2).sidereal.Sun);
      if (idx === targetSignIdx && prev !== targetSignIdx && prev !== -1) return dt.toISOString().slice(0, 10);
      prev = idx;
    }
  }
  return '(none)';
}
const cap = ingressDay(2024, 9), ari = ingressDay(2024, 0), car = ingressDay(2024, 3);
console.log(`\nSun sidereal ingresses 2024: Capricorn=${cap}  Aries=${ari}  Cancer=${car}`);
ok(cap.startsWith('2024-01-1'), `Makar Sankranti (Sun→Capricorn) ~Jan 14/15, got ${cap}`);
ok(ari.startsWith('2024-04-1'), `Mesha Sankranti (Sun→Aries) ~Apr 14, got ${ari}`);
ok(car.startsWith('2024-07-1'), `Karka Sankranti (Sun→Cancer) ~Jul 16, got ${car}`);

// ── 2. Ascendant cycles all 12 signs / day ───────────────────────────────────────
{
  const base = Date.UTC(2000, 0, 1, 0, 0, 0);
  const seen = new Set<number>();
  let changes = 0, prev = -1;
  for (let min = 0; min < 24 * 60; min += 4) {
    const idx = signIndexOf(computeLongitudes(new Date(base + min * 60000), 28.6, 77.2).ascSidereal);
    seen.add(idx);
    if (idx !== prev && prev !== -1) changes++;
    prev = idx;
  }
  ok(seen.size === 12, `Ascendant visits all 12 signs (${seen.size})`);
  ok(changes === 12, `Ascendant changes sign 12×/day (${changes})`);
}

// ── 3. Rahu/Ketu opposition + ayanamsa range ─────────────────────────────────────
{
  const c = computeLongitudes(new Date(Date.UTC(2015, 2, 21, 6, 0, 0)), 28.6, 77.2);
  ok(Math.abs(rev(c.sidereal.Ketu - c.sidereal.Rahu) - 180) < 0.001, `Rahu/Ketu 180° apart`);
  const c2 = computeLongitudes(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)), 28.6, 77.2);
  ok(c2.ayanamsa > 24.0 && c2.ayanamsa < 24.25, `Lahiri ayanamsa 2020 ~24.1° (${c2.ayanamsa.toFixed(4)})`);
}

// ── 4. Sunrise / sunset — New Delhi solstices (known to ±2 min) ───────────────────
{
  const near = (got: number, want: number, tolMin = 5) => Math.abs(got - want) * 60 <= tolMin;
  const jun = sunTimesUTC(2024, 6, 21, 28.6139, 77.209);
  const dec = sunTimesUTC(2024, 12, 21, 28.6139, 77.209);
  const jr = istHours(jun.riseUTC!), js = istHours(jun.setUTC!);
  const dr = istHours(dec.riseUTC!), ds = istHours(dec.setUTC!);
  console.log(`\nDelhi sunrise/sunset IST — Jun21: ${hhmm(jr)}/${hhmm(js)}  Dec21: ${hhmm(dr)}/${hhmm(ds)}`);
  ok(near(jr, 5 + 23 / 60), `Delhi summer-solstice sunrise ~05:23 (got ${hhmm(jr)})`);
  ok(near(js, 19 + 21 / 60), `Delhi summer-solstice sunset ~19:21 (got ${hhmm(js)})`);
  ok(near(dr, 7 + 10 / 60), `Delhi winter-solstice sunrise ~07:10 (got ${hhmm(dr)})`);
  ok(near(ds, 17 + 29 / 60), `Delhi winter-solstice sunset ~17:29 (got ${hhmm(ds)})`);
}

// ── 5. Today's panchang limbs are structurally valid (ranges) ─────────────────────
{
  const now = new Date();
  const c = computeLongitudes(now, 28.6, 77.2);
  const elong = rev(c.tropical.Moon - c.tropical.Sun);
  const tithi = Math.floor(elong / 12), nak = Math.floor(rev(c.sidereal.Moon) / (360 / 27));
  ok(tithi >= 0 && tithi < 30, `tithi index in 0..29 (${tithi})`);
  ok(nak >= 0 && nak < 27, `nakshatra index in 0..26 (${nak})`);
  console.log(`\nNow: Moon ${signOf(c.sidereal.Moon)} / ${nakshatraOf(c.sidereal.Moon)}, tithi#${tithi + 1}`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
