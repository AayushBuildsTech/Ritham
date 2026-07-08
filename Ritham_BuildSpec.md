# Ritham — Build Spec

> Note: Created to document the technical build of the two free Home features
> (Panchang + Numerology). The authoritative architecture log is `DECISIONS.md`;
> deploy/test status lives in `PROGRESS.md` §20. This file is the focused spec.

## Vedic data engine — VedAstro (single integration point)

All Vedic calculation data (Kundli, Panchang, and the chart facts that ground the chat + reports)
comes from **VedAstro** (`api.vedastro.org`, built on the Swiss Ephemeris / NASA JPL, MIT-licensed,
free `FreeAPIUser` tier). It is the **source of truth, with the self-hosted Lahiri engine as an
automatic fallback** so a call failure never blocks onboarding.

- **The ONE integration point is `supabase/functions/_shared/vedastro.ts`** (wrapped in `namespace
  Veda`). It is the ONLY code in the repo that fetches VedAstro; it holds the `VEDASTRO_API_KEY`
  secret (server-side only). It is inlined into the `kundli` + `panchang` functions by
  `scripts/inline-functions.mjs` (dashboard deploy ships one file per function). **chat, horoscope
  and the client NEVER call VedAstro** — they read the stored chart. Swapping providers later touches
  only this one file (rule #1).
- **Client surface** — `lib/kundliService.ts` exposes `getRichKundli` / `getDailyPanchang` /
  `getMuhuratWindows` / `getNumerology` / `getGunaMatch` and only ever `invoke`s Edge Functions.
- **Rich Kundli (`chart_facts`)** — built from 2 VedAstro calls (`AllPlanetData` + `AllHouseData`) and
  stored in `profiles.kundli_chart` (JSONB, `engine_version: 3`, `source: 'vedastro'`); the dense
  render lives in `kundli_summary` (the `summary_text` injected into chat). `chart_facts` carries: all
  9 grahas (sign + degree, whole-sign house, nakshatra+pada, retrograde, combust, dignity, vargottama,
  Shadbala, D9/D10 signs, sidereal longitude), the 12 house lords, natal yogas + doshas (Manglik with a
  cancellation note, Kaal Sarp, Nadi), the full **Vimshottari mahadasha timeline with dates** (computed
  deterministically from VedAstro's exact Moon longitude), and the divisional D9/D10 maps. Any field
  VedAstro doesn't return is marked `"not available"` — never a blank chart.
- **Time-dependent facts** (current Maha/Antar dasha, gochar transits, Sade Sati) are derived FRESH at
  chat/horoscope time by `kundliSummary.currentDynamics` — never cached (so they never go stale).
- **Caching / cost (rule #4, spec §8):** VedAstro is called **once per profile** (rich Kundli) and
  **once per city per day** (Panchang, cached in `panchang_cache`). Numerology stays a **local**
  computation (Pythagorean math + the static `constants/numerology.ts` library) exposed through
  `kundliService.getNumerology` — it isn't astronomy, so it doesn't need VedAstro (deliberate
  deviation, kept free + offline). Muhurat's multi-day scan stays on the local engine (calling VedAstro
  45× per lookup is infeasible on the free tier); the single "Today's Panchang" card uses VedAstro.
  A `vedastro_usage` counter table logs daily call volume.
- **Rich Kundli screen** — `app/profile.tsx` `KundliView` renders the full depth from `chart_facts`
  (overview, planetary table with dignity/retro/combust, house lords, current + upcoming dasha,
  D9/D10, yogas & doshas) and offers a "Refresh with VedAstro" action for any chart still on the local
  fallback. See `PROGRESS.md` §35.

## Chat — Hindi or English (language-mirroring)

The chat function (`chat/index.ts`, deployed as `bright-processor`) drives all language behavior — the
app UI stays English. The **system prompt** instructs the astrologer to mirror the user's language,
script, and register on every reply and to keep Jyotisha terms untranslated. User messages pass through
unchanged so the model detects language naturally.

**Language style (in the system prompt) — default Hindi, English only on demand:**
- **Default = Hindi.** Any input that is NOT clearly English (Hindi, romanised Hindi, or a Hindi-English
  mix) → reply in **predominantly Hindi, romanised (Latin) script — NOT Devanagari**, Hindi-first sentence
  flow. English used **only when genuinely necessary** (loanwords Hindi speakers say in English — "job",
  "career", "problem", "time" — or terms with no Hindi equivalent); never peppered with unnecessary
  English. The prompt carries an explicit **RIGHT vs WRONG example pair** to pin the tone.
- **English input → fully clean English**, and the astrologer keeps conversing in English while the user
  stays in English (switches back to Hindi the moment the user does).
- Devanagari input → **Devanagari** reply.
- Warm, respectful, traditional jyotishi register throughout. The word "Hinglish" is never used
  anywhere user-facing.

- **Greeting**: a server-side `GREETING` constant (single source of truth, referenced in the system
  prompt), in the warm Hindi-leaning voice. The client fetches it via a lightweight `{ greetingOnly: true }`
  call (`fetchGreeting()` in `lib/chatService.ts`) and renders it as the astrologer's first bubble; no
  session/entitlement/AI cost.
- **Placeholder** + **starter chips**: in `app/(tabs)/chat.tsx` (chips shown only on an empty chat).
- No new screens, banners, toggles, or language selector. Redeploy `bright-processor` to activate.

## Chat History (read-only)

Lets users revisit past conversations. **No new bottom tab** — a **history icon in the Chat tab header**
(`app/(tabs)/chat.tsx`) opens it.

- **Data**: reuses the existing `chat_sessions` + `chat_messages` tables (migration `005`), which are
  already RLS **select-own** so the client reads history directly. **Delete** needs one small migration
  — `015_chat_history_delete.sql` adds a **delete-own** policy on `chat_sessions`; messages go with it via
  the existing `chat_messages.session_id → chat_sessions(id) ON DELETE CASCADE` (FK cascades run at the
  engine level, not gated by RLS). No Edge Function.
- **Service** (`lib/chatService.ts`): `listChatHistory()` returns sessions newest-first, each with the
  first user message as a preview and the profile name (two plain client queries — sessions, then the
  first user message per session; empty sessions are hidden). `getSessionMessages(sessionId)` returns one
  session's full transcript oldest-first. `deleteChatSessions(ids[])` deletes selected sessions (cascade
  removes their messages).
- **Screens**: `app/chat-history.tsx` (list: preview + date/time + profile name when there are multiple
  family members; **Select** header action → multi-select mode with checkboxes, "Select all"/long-press,
  and a **Delete (N)** action bar with an `Alert` confirm) → `app/chat-conversation.tsx` (read-only
  transcript, bubble styling matching the live chat; a "Start a new chat" action, but no continue/edit —
  history is immutable).
- **Analytics** (`lib/analytics.ts`): `chat_history_opened`, `chat_history_session_opened`,
  `chat_history_deleted`.
- Client-only (JS) — reload Metro, no rebuild. The **only** backend step is running migration `015`
  (delete won't persist until then — RLS silently blocks the delete otherwise).

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

---

## Premium Reports — build spec (7 types)

Seven paid reports share ONE pipeline and ONE visual style (indigo/gold/serif, branded cover +
disclaimer). Prices (paise, single source of truth `config/pricing.ts`, mirrored in
`create-order`): life 39900 · career 14900 · love 12900 · health 9900 · education 9900 ·
vastu 14900 · matchmaking 19900.

### Types & flow
- **Chart reports** (`life`, `career`, `love`, `health`, `education`) — single-person, driven by the
  user's own cached Kundli. One intake screen `app/report-chart.tsx` (`?type=`), no extra input.
- **Vastu** — property-based (floor plan + Claude vision), `app/report-vastu.tsx`.
- **Matchmaking** — two-person Ashtakoot, `app/report-matchmaking.tsx`.

### Chart-report engine — inlined in `report/index.ts` as `namespace Chart` (single-file deploy)
Deterministically COMPUTES from the placements it is handed (never fetches a chart — rule #1):
- **Houses** (1–12): sign, ruling lord + where the lord sits, occupants, and a 0–100 strength score.
- **Yogas**: Gajakesari, Budha-Aditya, Chandra-Mangala, the five Pancha-Mahapurusha (Ruchaka/Bhadra/
  Hamsa/Malavya/Shasha), plus exalted/debilitated flags.
- **Vimshottari dasha**: nakshatra → starting Mahadasha; deterministic balance; full Maha timeline +
  the running Maha's Antardashas; current & upcoming periods dated.
- **Thematic score**: weighted average of the report's focus houses (`CHART_META[type].focus`).
Claude then NARRATES a unified JSON shape (`overview`, `sections[]`, `timing`, `guidance[]`,
`remedies[]`, `verdict`) — depth scales by type (flagship `life` = 7–8 sections, all 12 houses;
focused = 4–5 sections, focus houses only). Mock narration (thorough, fact-driven) until
`ANTHROPIC_API_KEY` is set. `renderChartHtml` emits the branded multi-page HTML.
`index.ts` wraps the engine in `namespace Chart` and wires entitlement/Storage/DB around it (Vastu &
Matchmaking paths unchanged). **Deploy note:** the `report` function is a SINGLE file — a `./chart.ts`
import failed to bundle in the dashboard editor, so the engine was inlined (verified with esbuild).

### DB
Migration `012_chart_reports.sql` widens `reports.type` CHECK to include the 5 new types. `kind`
stays `report`; `plan_id` is the report type (free text) — no change to payment_orders /
entitlements_ledger.

### Analytics
`report_started {type}` (intake mount), `report_purchased {type}` (after verified pay),
`report_downloaded {type}` (PDF export in `report-view.tsx`), plus existing `report_generated`.

### Deploy (see PROGRESS.md §23)
Run migration `012`; redeploy `report` (single file — engine inlined) and redeploy `create-order`
(new prices). No app rebuild (chart reports add no native modules), no new secrets.
