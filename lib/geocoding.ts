// Live place search via the Open-Meteo Geocoding API — free, no API key, open,
// and (crucially) it returns the IANA timezone alongside lat/lon, which the
// Kundli math needs. https://open-meteo.com/en/docs/geocoding-api
//
// Falls back gracefully: callers should keep a bundled city list for the
// no-network / empty-query case.

export interface GeoPlace {
  name: string;
  region: string; // "State, Country" for display
  lat: number;
  lon: number;
  tz: string; // IANA timezone, e.g. "Asia/Kolkata"
}

interface OMResult {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  country?: string;
  admin1?: string; // state / province
  admin2?: string; // district
}

/**
 * Search places by name. Returns [] for very short queries. Throws on network
 * failure so the UI can show a message and fall back to bundled cities.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url =
    'https://geocoding-api.open-meteo.com/v1/search' +
    `?name=${encodeURIComponent(q)}&count=15&language=en&format=json`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);

  const json = (await res.json()) as { results?: OMResult[] };
  const results = json.results ?? [];

  return results.map((r) => ({
    name: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
    tz: r.timezone ?? 'Asia/Kolkata',
  }));
}
