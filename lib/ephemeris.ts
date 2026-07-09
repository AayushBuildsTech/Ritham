// ephemeris — client-side sidereal planet longitudes (Lahiri), ported verbatim from
// the app's server engine supabase/functions/_shared/astro.ts. Pure, dependency-free
// math (Schlyter elements + Lahiri ayanamsa) that runs unchanged in Hermes/RN. Used by
// transitsService for the Retrograde + Sade Sati trackers — NO network, NO AI, NO
// VedAstro call. Location-independent (we only need planetary SIGN positions), so no
// Ascendant/houses here.

const DEG = Math.PI / 180;
const sind = (x: number) => Math.sin(x * DEG);
const cosd = (x: number) => Math.cos(x * DEG);
const asind = (x: number) => Math.asin(x) / DEG;
const atan2d = (y: number, x: number) => Math.atan2(y, x) / DEG;

export const rev = (x: number): number => ((x % 360) + 360) % 360;
const julianDay = (d: Date): number => d.getTime() / 86400000 + 2440587.5;
const deltaTseconds = (year: number): number => { const t = year - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; };

function eccentricAnomaly(Mdeg: number, e: number): number {
  const M = rev(Mdeg);
  let E = M + (180 / Math.PI) * e * sind(M) * (1 + e * cosd(M));
  for (let i = 0; i < 12; i++) {
    const dE = (E - (180 / Math.PI) * e * sind(E) - M) / (1 - e * cosd(E));
    E -= dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}

interface Elements { N: number; i: number; w: number; a: number; e: number; M: number }
function heliocentric(el: Elements) {
  const E = eccentricAnomaly(el.M, el.e);
  const xv = el.a * (cosd(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * sind(E);
  const v = atan2d(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);
  const vw = v + el.w;
  const xh = r * (cosd(el.N) * cosd(vw) - sind(el.N) * sind(vw) * cosd(el.i));
  const yh = r * (sind(el.N) * cosd(vw) + cosd(el.N) * sind(vw) * cosd(el.i));
  const lon = rev(atan2d(yh, xh));
  const lat = atan2d(r * sind(vw) * sind(el.i), Math.sqrt(xh * xh + yh * yh));
  return { lon, lat, r };
}
const lahiriAyanamsa = (jd: number): number => 23.853009 + ((jd - 2451545.0) / 365.25) * 0.0139721;

export type Body = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn' | 'Rahu' | 'Ketu';

/** Sidereal ecliptic longitudes (degrees) for all bodies at a UTC instant. */
export function siderealLongitudes(dateUTC: Date): Record<Body, number> {
  const jdUT = julianDay(dateUTC);
  const year = dateUTC.getUTCFullYear() + (dateUTC.getUTCMonth() + 0.5) / 12;
  const jdTT = jdUT + deltaTseconds(year) / 86400;
  const d = jdTT - 2451543.5;

  const wSun = 282.9404 + 4.70935e-5 * d;
  const eSun = 0.016709 - 1.151e-9 * d;
  const MSun = rev(356.047 + 0.9856002585 * d);
  const ESun = eccentricAnomaly(MSun, eSun);
  const xvS = cosd(ESun) - eSun, yvS = Math.sqrt(1 - eSun * eSun) * sind(ESun);
  const vS = atan2d(yvS, xvS), rS = Math.sqrt(xvS * xvS + yvS * yvS);
  const sunLon = rev(vS + wSun);
  const Ls = rev(wSun + MSun);
  const xs = rS * cosd(sunLon), ys = rS * sind(sunLon);

  const Nm = 125.1228 - 0.0529538083 * d, wm = 318.0634 + 0.1643573223 * d;
  const Mm = rev(115.3654 + 13.0649929509 * d);
  const moon = heliocentric({ N: Nm, i: 5.1454, w: wm, a: 60.2666, e: 0.0549, M: Mm });
  const Lm = rev(Nm + wm + Mm), Dm = rev(Lm - Ls), Fm = rev(Lm - Nm);
  const moonLonPert =
    -1.274 * sind(Mm - 2 * Dm) + 0.658 * sind(2 * Dm) - 0.186 * sind(MSun) -
    0.059 * sind(2 * Mm - 2 * Dm) - 0.057 * sind(Mm - 2 * Dm + MSun) +
    0.053 * sind(Mm + 2 * Dm) + 0.046 * sind(2 * Dm - MSun) +
    0.041 * sind(Mm - MSun) - 0.035 * sind(Dm) - 0.031 * sind(Mm + MSun) -
    0.015 * sind(2 * Fm - 2 * Dm) + 0.011 * sind(Mm - 4 * Dm);
  const moonLon = rev(moon.lon + moonLonPert);

  const merc = heliocentric({ N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.0e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.20563 + 5.59e-10 * d, M: rev(168.6562 + 4.0923344368 * d) });
  const venus = heliocentric({ N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d, a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: rev(48.0052 + 1.6021302244 * d) });
  const mars = heliocentric({ N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: rev(18.6021 + 0.5240207766 * d) });
  const Mj = rev(19.895 + 0.0830853001 * d), Msa = rev(316.967 + 0.0334442282 * d);
  const jup = heliocentric({ N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: Mj });
  jup.lon = rev(jup.lon - 0.332 * sind(2 * Mj - 5 * Msa - 67.6) - 0.056 * sind(2 * Mj - 2 * Msa + 21) + 0.042 * sind(3 * Mj - 5 * Msa + 21) - 0.036 * sind(Mj - 2 * Msa) + 0.022 * cosd(Mj - Msa) + 0.023 * sind(2 * Mj - 3 * Msa + 52) - 0.016 * sind(Mj - 5 * Msa - 69));
  const sat = heliocentric({ N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: Msa });
  sat.lon = rev(sat.lon + 0.812 * sind(2 * Mj - 5 * Msa - 67.6) - 0.229 * cosd(2 * Mj - 4 * Msa - 2) + 0.119 * sind(Mj - 2 * Msa - 3) + 0.046 * sind(2 * Mj - 6 * Msa - 69) + 0.014 * sind(Mj - 3 * Msa + 32));

  const geoLon = (p: { lon: number; lat: number; r: number }): number => {
    const xh = p.r * cosd(p.lat) * cosd(p.lon), yh = p.r * cosd(p.lat) * sind(p.lon);
    return rev(atan2d(yh + ys, xh + xs));
  };

  const tropical: Record<Body, number> = {
    Sun: sunLon, Moon: moonLon, Mars: geoLon(mars), Mercury: geoLon(merc),
    Jupiter: geoLon(jup), Venus: geoLon(venus), Saturn: geoLon(sat),
    Rahu: rev(Nm), Ketu: rev(Nm + 180),
  };
  const ayan = lahiriAyanamsa(jdUT);
  const out = {} as Record<Body, number>;
  (Object.keys(tropical) as Body[]).forEach((k) => { out[k] = rev(tropical[k] - ayan); });
  return out;
}

export const SIGNS = [
  'Aries (Mesha)', 'Taurus (Vrishabha)', 'Gemini (Mithuna)', 'Cancer (Karka)',
  'Leo (Simha)', 'Virgo (Kanya)', 'Libra (Tula)', 'Scorpio (Vrishchika)',
  'Sagittarius (Dhanu)', 'Capricorn (Makara)', 'Aquarius (Kumbha)', 'Pisces (Meena)',
];
export const signIndex = (lonSidereal: number): number => Math.floor(rev(lonSidereal) / 30);
