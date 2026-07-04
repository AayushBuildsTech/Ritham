# Ritham — Build Spec

> Note: Created to document the technical build of the two free Home features
> (Panchang + Numerology). The authoritative architecture log is `DECISIONS.md`;
> deploy/test status lives in `PROGRESS.md` §20. This file is the focused spec.

## §9 Brand (reference)
Deep indigo background (`#14122b`→`#1e1b45`), gold accents (`#d9a441`/`#e6c063`),
off-white text (`#f0ece8`); premium, calm, celestial — never kitschy. Both new features
match this (`constants/theme.ts`).

---

## Free Home features — Panchang + Numerology

**Guarantee: no AI/LLM call is made for either feature.** Panchang is pure astronomy;
Numerology is pure arithmetic + a static text table. No Claude/OpenAI request, no
astrology-provider request.

### Data model (migration `010_panchang_numerology.sql`)
- `public.panchang_cache(id, place_key, place_label, date_key, data jsonb, created_at)`,
  `unique(place_key, date_key)`. RLS: authenticated read; service-role write only.
  - `place_key` = `"{lat.toFixed(1)},{lng.toFixed(1)}"` (~11 km grid → one row per city).
  - `date_key` = IST day `YYYY-MM-DD`.
  - `data` = the full computed almanac.
- `public.profiles.numerology jsonb` — cached `{ life_path:{number,is_master},
  expression:{number,is_master}, computed_at }`.

### Panchang — `supabase/functions/panchang/index.ts` (computed + cached)
1. Auth the caller; read their own profile's `latitude/longitude/birth_place`.
2. Compute `place_key` + IST `date_key`; **cache lookup** in `panchang_cache`.
3. Hit → return cached `data`. Miss → **compute in pure code**, insert (23505 race →
   re-read), return.
- Computation (all self-contained, no libraries with network):
  - Sun longitude (Meeus low-precision), Moon longitude (truncated ELP, ~27 terms),
    Lahiri ayanamsa (linear), evaluated at local **sunrise**.
  - **Tithi** = ⌊elongation/12°⌋ (30/month; Shukla/Krishna, Purnima/Amavasya).
  - **Nakshatra** = ⌊sidereal-Moon / 13°20'⌋ (+ pada); **Yoga** = ⌊(sid Sun+Moon)/13°20'⌋;
    **Karana** = 6° half-tithis (movable 7-cycle + fixed).
  - **Sunrise/Sunset** = Almanac-for-Computers algorithm (IST).
  - **Rahu Kaal / Yamaganda / Gulika** = standard weekday part-tables over the 8-part day;
    **Abhijit Muhurta** around solar noon.
- Client wrapper: `lib/panchangService.ts` (`getPanchang(profileId)`, slug `panchang`).

### Numerology — client-only (no Edge Function)
- `lib/numerology.ts` — `computeNumerology(name, dob)`:
  - **Life Path** from DOB (component method: reduce day/month/year, sum, reduce).
  - **Expression** from full name (Pythagorean A=1…I=9, J=1…, S=1…Z=8).
  - Master numbers **11/22/33 preserved** (`reduceKeepingMaster`).
- `constants/numerology.ts` — fixed `NUMEROLOGY_MEANINGS` for 1–9, 11, 22, 33
  (title, keyword, Life-Path text, Expression text). Static, never AI.
- `lib/numerologyService.ts` — `getNumerology(profile)`: return cached `profiles.numerology`
  or compute once + persist (best-effort write).

### UI
- `app/(tabs)/index.tsx` — two `miniCard`s below the horoscope ("More for you"): Panchang
  (tithi · nakshatra summary) and Numerology (Life Path · Expression), each → a detail route.
- `app/panchang.tsx` — five limbs + Sun times + auspicious/inauspicious groups + soft hook.
- `app/numerology.tsx` — Life Path & Expression cards (number badge, title, keyword,
  pre-written meaning) + soft hook.

### Analytics (`lib/analytics.ts`)
Added event names: `panchang_viewed`, `numerology_viewed`, `home_hook_clicked`
(fire-and-forget `track()`; `events.name` is free text so no analytics migration).

### Deploy (see PROGRESS.md §20)
Run migration `010`; deploy the `panchang` function (update `PANCHANG_FUNCTION` if the slug
differs). No rebuild, no new secrets. Numerology needs only the migration's jsonb column.

---

## Shubh Muhurat Finder (computed + cached, no AI)

**Guarantee: no AI/LLM call.** Pure rule-matching over the computed Panchang.

### Rules — `config/muhuratRules.ts` (single source of truth)
`MUHURAT_ACTIVITIES` — 7 activities, each `{ id, label (English), hindi, emoji, funnel:{target,
text}, rule:{ good_nakshatras[], good_weekdays[] } }`. Rikta tithis (4/9/14) + Amavasya avoided
globally. Funnel targets: `vastu` | `matchmaking` | `chat`.

### Data model — migration `011_muhurat.sql`
`public.muhurat_cache(id, activity, place_key, range_key, data jsonb, created_at)`,
`unique(activity, place_key, range_key)`. RLS: authenticated read; service-role write only.
- `place_key` = lat/lng to 1 decimal (city grid, same as panchang_cache).
- `range_key` = `START_END` IST ISO dates (default today…+45, capped +90) — rolls over daily.

### Engine — `supabase/functions/muhurat/index.ts`
1. Auth caller; read own profile lat/lng/birth_place.
2. Resolve range; **cache lookup** by (activity, place_key, range_key) → hit returns.
3. Miss → for each day in range: **compute that day's Panchang in pure code** (mirror of the
   `panchang` astronomy — julian day, Sun/Moon longitude, ayanamsa, sunrise/sunset, Abhijit);
   derive weekday + nakshatra + tithi + yoga; **keep the day** if nakshatra ∈ good_nakshatras,
   weekday ∈ good_weekdays, and tithi not Rikta/Amavasya. Cap 20 results.
4. Store `{ activity, place, start, end, count, results[], method:'computed' }` (23505 race
   re-reads). The **rule data is mirrored server-side** (dashboard deploy can't import the config —
   same as pricing); keep in sync.
- Client wrapper: `lib/muhuratService.ts` (`getMuhurats(profileId, activity, {startDate,endDate})`,
  slug `muhurat`).

### UI
- `app/(tabs)/index.tsx` — "Shubh Muhurat Finder" secondary card below the horoscope.
- `app/muhurat.tsx` — activity picker (Hindi + English) → results list (date, weekday, Abhijit
  window, nakshatra/tithi/yoga) → activity-aware funnel button → Vastu/Matchmaking/Chat. Includes
  the priest/astrologer disclaimer.

### Analytics (`lib/analytics.ts`)
Added: `muhurat_opened`, `muhurat_activity_selected`, `muhurat_results_viewed`,
`muhurat_funnel_clicked` (free-text `events.name`, no analytics migration).

### v1 simplification
Returns favourable DATES + the Abhijit Muhurta window (from sunrise/sunset), not full
choghadiya/per-activity time slots; day qualifies on its sunrise-time Panchang. Noted in DECISIONS.md.

### Deploy (see PROGRESS.md §21)
Run migration `011`; deploy the `muhurat` function (update `MUHURAT_FUNCTION` if the slug differs).
No rebuild, no new secrets.

---

## Live Darshan (deep-link directory, no AI, no hosting)

**Guarantee: nothing is embedded/hosted and no AI call is made.** v1 links OUT to official
YouTube streams only.

### Data — `config/temples.ts` (single source of truth)
`TEMPLES: Temple[]` — `{ id, name, location, deity, icon (emoji), timings, streamUrl, source:
'youtube'|'website', mode: 'link'|'embed', verified }`. A CRITICAL-RULE header comment enforces
OFFICIAL sources only. URLs use the `/live` suffix (opens the current live stream, else the
channel; no expiring video ids). All 8 URLs verified against official sources (2026-07-04),
`verified: true`; Mahakaleshwar has no official YouTube channel → official MP-Gov site
(`source:'website'`). `mode` is `'link'` for all — the reserved seam for a future per-temple
`'embed'` (v2, after written permission).

### UI — no backend at all
- `app/darshan.tsx` — renders the temple cards; "Watch Live Darshan ↗" calls
  `Linking.openURL(youtubeUrl)` (external YouTube app/browser), with an error Alert fallback.
  A visible legal disclaimer sits at the bottom (temples own the streams; Ritham doesn't host or
  endorse). Unverified entries show an "official channel" sub-line.
- `app/(tabs)/index.tsx` — "Live Darshan" (🛕) secondary card below the horoscope → `/darshan`.
- No migration, no Edge Function, no secrets, no rebuild — pure JS/config.

### Analytics (`lib/analytics.ts`)
Added: `darshan_opened`, `darshan_temple_clicked` (free-text `events.name`, no migration).

### Legal / safety posture
Deep-link only; no host/embed/download/re-stream. Free & unmonetised (no ads around darshan
links). Every non-Tirupati `youtubeUrl` must be human-verified and flipped to `verified: true`
before launch.
