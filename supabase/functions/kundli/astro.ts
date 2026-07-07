// astro.ts — self-contained Vedic (sidereal) astronomy engine.
//
// Open-source, dependency-free. Computes real geocentric ecliptic longitudes for
// the Sun, Moon, the five visible planets, and the lunar nodes (Rahu/Ketu) using
// the classical Schlyter orbital-element method with the main perturbation terms,
// then converts to the SIDEREAL zodiac using the Lahiri (Chitrapaksha) ayanamsa —
// the Indian government standard for Vedic astrology. The Ascendant (Lagna) is
// derived from local sidereal time + geographic latitude, and houses are whole-sign
// (the standard Vedic scheme).
//
// Accuracy is comfortably at the arc-minute level over 1900–2100 — far tighter than
// the 30° (sign) and 13°20' (nakshatra) bins we place bodies into. Runs unchanged in
// Deno (the edge function) and Node (the test harness).

const DEG = Math.PI / 180;
const sind = (x: number) => Math.sin(x * DEG);
const cosd = (x: number) => Math.cos(x * DEG);
const tand = (x: number) => Math.tan(x * DEG);
const asind = (x: number) => Math.asin(x) / DEG;
const atan2d = (y: number, x: number) => Math.atan2(y, x) / DEG;

/** Normalise an angle to [0, 360). */
export function rev(x: number): number {
  return ((x % 360) + 360) % 360;
}

/** Julian Day (UT) from a JS Date (which is a UTC instant). */
export function julianDay(dateUTC: Date): number {
  return dateUTC.getTime() / 86400000 + 2440587.5;
}

/** ΔT (TT − UT) in seconds — Espenak & Meeus polynomial, good for the modern era. */
function deltaTseconds(year: number): number {
  const t = year - 2000;
  return 62.92 + 0.32217 * t + 0.005589 * t * t;
}

// ── Kepler solver ──────────────────────────────────────────────────────────────
function eccentricAnomaly(Mdeg: number, e: number): number {
  const M = rev(Mdeg);
  let E = M + (180 / Math.PI) * e * sind(M) * (1 + e * cosd(M));
  // Newton–Raphson; converges in a few steps even for the Moon's e.
  for (let i = 0; i < 12; i++) {
    const dE = (E - (180 / Math.PI) * e * sind(E) - M) / (1 - e * cosd(E));
    E -= dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}

interface Elements {
  N: number; // longitude of ascending node
  i: number; // inclination
  w: number; // argument of perihelion
  a: number; // semi-major axis
  e: number; // eccentricity
  M: number; // mean anomaly
}

/** Heliocentric ecliptic rectangular coordinates + longitude/latitude/radius. */
function heliocentric(el: Elements) {
  const E = eccentricAnomaly(el.M, el.e);
  const xv = el.a * (cosd(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * sind(E);
  const v = atan2d(yv, xv); // true anomaly
  const r = Math.sqrt(xv * xv + yv * yv);
  const vw = v + el.w;
  const xh = r * (cosd(el.N) * cosd(vw) - sind(el.N) * sind(vw) * cosd(el.i));
  const yh = r * (sind(el.N) * cosd(vw) + cosd(el.N) * sind(vw) * cosd(el.i));
  const zh = r * (sind(vw) * sind(el.i));
  let lon = rev(atan2d(yh, xh));
  const lat = atan2d(zh, Math.sqrt(xh * xh + yh * yh));
  return { lon, lat, r };
}

// ── Ayanamsa (Lahiri / Chitrapaksha) ───────────────────────────────────────────
// Anchored to the Swiss Ephemeris Lahiri value at J2000 with the observed
// precession rate; matches Lahiri to arc-second level across the modern era.
export function lahiriAyanamsa(jd: number): number {
  return 23.853009 + ((jd - 2451545.0) / 365.25) * 0.0139721;
}

// ── Mean obliquity of the ecliptic (Meeus) ─────────────────────────────────────
function obliquity(T: number): number {
  return 23.439291 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
}

// ── Greenwich Mean Sidereal Time in degrees (Meeus), from JD(UT) ────────────────
function gmst(jdUT: number): number {
  const D = jdUT - 2451545.0;
  const T = D / 36525;
  return rev(
    280.46061837 + 360.98564736629 * D + 0.000387933 * T * T - (T * T * T) / 38710000,
  );
}

export interface ChartLongitudes {
  ayanamsa: number;
  // TROPICAL longitudes (degrees)
  tropical: Record<string, number>;
  // SIDEREAL longitudes (degrees) after subtracting the ayanamsa
  sidereal: Record<string, number>;
  ascSidereal: number;
}

/**
 * Compute sidereal ecliptic longitudes for all bodies + the Ascendant.
 * @param dateUTC the birth instant as a UTC Date
 * @param latDeg  geographic latitude, north positive
 * @param lonEast geographic longitude, EAST positive
 */
export function computeLongitudes(dateUTC: Date, latDeg: number, lonEast: number): ChartLongitudes {
  const jdUT = julianDay(dateUTC);
  const year = dateUTC.getUTCFullYear() + (dateUTC.getUTCMonth() + 0.5) / 12;
  // Planetary/lunar mean elements are reckoned in Terrestrial Time.
  const jdTT = jdUT + deltaTseconds(year) / 86400;
  const d = jdTT - 2451543.5; // Schlyter day number (epoch 2000 Jan 0.0)
  const T = (jdUT - 2451545.0) / 36525;
  const ecl = obliquity(T);

  // ── Sun (special-cased; defines Earth's heliocentric position) ────────────────
  const wSun = 282.9404 + 4.70935e-5 * d;
  const eSun = 0.016709 - 1.151e-9 * d;
  const MSun = rev(356.047 + 0.9856002585 * d);
  const ESun = eccentricAnomaly(MSun, eSun);
  const xvS = cosd(ESun) - eSun;
  const yvS = Math.sqrt(1 - eSun * eSun) * sind(ESun);
  const vS = atan2d(yvS, xvS);
  const rS = Math.sqrt(xvS * xvS + yvS * yvS);
  const sunLon = rev(vS + wSun);
  const Ls = rev(wSun + MSun); // Sun's mean longitude
  const xs = rS * cosd(sunLon); // Sun's geocentric rectangular (ecliptic)
  const ys = rS * sind(sunLon);

  // ── Moon (with the main periodic perturbations) ───────────────────────────────
  const Nm = 125.1228 - 0.0529538083 * d;
  const im = 5.1454;
  const wm = 318.0634 + 0.1643573223 * d;
  const am = 60.2666;
  const em = 0.0549;
  const Mm = rev(115.3654 + 13.0649929509 * d);
  const moon = heliocentric({ N: Nm, i: im, w: wm, a: am, e: em, M: Mm });
  const Lm = rev(Nm + wm + Mm); // Moon's mean longitude
  const Dm = rev(Lm - Ls); // mean elongation
  const Fm = rev(Lm - Nm); // argument of latitude
  const moonLonPert =
    -1.274 * sind(Mm - 2 * Dm) +
    0.658 * sind(2 * Dm) -
    0.186 * sind(MSun) -
    0.059 * sind(2 * Mm - 2 * Dm) -
    0.057 * sind(Mm - 2 * Dm + MSun) +
    0.053 * sind(Mm + 2 * Dm) +
    0.046 * sind(2 * Dm - MSun) +
    0.041 * sind(Mm - MSun) -
    0.035 * sind(Dm) -
    0.031 * sind(Mm + MSun) -
    0.015 * sind(2 * Fm - 2 * Dm) +
    0.011 * sind(Mm - 4 * Dm);
  const moonLon = rev(moon.lon + moonLonPert);

  // ── Planets ──────────────────────────────────────────────────────────────────
  const merc = heliocentric({
    N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.0e-8 * d, w: 29.1241 + 1.01444e-5 * d,
    a: 0.387098, e: 0.20563 + 5.59e-10 * d, M: rev(168.6562 + 4.0923344368 * d),
  });
  const venus = heliocentric({
    N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d,
    a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: rev(48.0052 + 1.6021302244 * d),
  });
  const mars = heliocentric({
    N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d,
    a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: rev(18.6021 + 0.5240207766 * d),
  });

  // Jupiter & Saturn need their mutual perturbation terms for arc-minute accuracy.
  const Mj = rev(19.895 + 0.0830853001 * d);
  const Msa = rev(316.967 + 0.0334442282 * d);
  const jup = heliocentric({
    N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d,
    a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: Mj,
  });
  jup.lon = rev(
    jup.lon -
      0.332 * sind(2 * Mj - 5 * Msa - 67.6) -
      0.056 * sind(2 * Mj - 2 * Msa + 21) +
      0.042 * sind(3 * Mj - 5 * Msa + 21) -
      0.036 * sind(Mj - 2 * Msa) +
      0.022 * cosd(Mj - Msa) +
      0.023 * sind(2 * Mj - 3 * Msa + 52) -
      0.016 * sind(Mj - 5 * Msa - 69),
  );
  const sat = heliocentric({
    N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d,
    a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: Msa,
  });
  sat.lon = rev(
    sat.lon +
      0.812 * sind(2 * Mj - 5 * Msa - 67.6) -
      0.229 * cosd(2 * Mj - 4 * Msa - 2) +
      0.119 * sind(Mj - 2 * Msa - 3) +
      0.046 * sind(2 * Mj - 6 * Msa - 69) +
      0.014 * sind(Mj - 3 * Msa + 32),
  );

  // Heliocentric → geocentric ecliptic longitude for a planet.
  const geoLon = (p: { lon: number; lat: number; r: number }): number => {
    const xh = p.r * cosd(p.lat) * cosd(p.lon);
    const yh = p.r * cosd(p.lat) * sind(p.lon);
    return rev(atan2d(yh + ys, xh + xs));
  };

  // Rahu = Moon's mean ascending node; Ketu is opposite. (Vedic uses the mean node.)
  const rahu = rev(Nm);
  const ketu = rev(Nm + 180);

  const tropical: Record<string, number> = {
    Sun: sunLon,
    Moon: moonLon,
    Mars: geoLon(mars),
    Mercury: geoLon(merc),
    Jupiter: geoLon(jup),
    Venus: geoLon(venus),
    Saturn: geoLon(sat),
    Rahu: rahu,
    Ketu: ketu,
  };

  // ── Ascendant (Lagna) ─────────────────────────────────────────────────────────
  const ramc = rev(gmst(jdUT) + lonEast); // local sidereal time as an angle
  let asc = rev(
    atan2d(cosd(ramc), -(sind(ramc) * cosd(ecl) + tand(latDeg) * sind(ecl))),
  );
  // Guard: keep the RISING point (eastern horizon), not the descendant.
  if (rev(asc - ramc) > 180) asc = rev(asc + 180);
  tropical.Ascendant = asc;

  const ayan = lahiriAyanamsa(jdUT);
  const sidereal: Record<string, number> = {};
  for (const k of Object.keys(tropical)) sidereal[k] = rev(tropical[k] - ayan);

  return { ayanamsa: ayan, tropical, sidereal, ascSidereal: sidereal.Ascendant };
}

// ── Zodiac / nakshatra helpers ──────────────────────────────────────────────────
export const SIGNS = [
  'Aries (Mesha)', 'Taurus (Vrishabha)', 'Gemini (Mithuna)', 'Cancer (Karka)',
  'Leo (Simha)', 'Virgo (Kanya)', 'Libra (Tula)', 'Scorpio (Vrishchika)',
  'Sagittarius (Dhanu)', 'Capricorn (Makara)', 'Aquarius (Kumbha)', 'Pisces (Meena)',
];

export const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
];

export const signIndexOf = (lonSidereal: number): number => Math.floor(rev(lonSidereal) / 30);
export const signOf = (lonSidereal: number): string => SIGNS[signIndexOf(lonSidereal)];
export const nakshatraOf = (moonSidereal: number): string =>
  NAKSHATRAS[Math.floor(rev(moonSidereal) / (360 / 27))];
