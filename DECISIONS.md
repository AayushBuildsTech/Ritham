# Architecture Decisions

## Phase 1

### Routing: expo-router (file-based)
Chosen over `@react-navigation/bottom-tabs` standalone because expo-router provides
typed routes, deep-link support out of the box, and cleaner auth-gating via layouts.
The `(auth)` and `(tabs)` groups handle the guard logic in `app/_layout.tsx`.

### Auth: Google Sign-In (SUPERSEDED phone OTP, 2026-07-10)
Login is **Google Sign-In**: native `@react-native-google-signin/google-signin` → `supabase.auth.signInWithIdToken({ provider:'google' })`. No phone/SMS/DLT, ₹0 per login.
Free 1-min chat is gated per-account **and** per-device (`device_free_trials`) for abuse resistance.
Session persists in AsyncStorage (auto-refresh) — see `lib/supabase.ts`.

~~Original decision (dead): Supabase Phone OTP via Twilio/AWS SNS; `signInWithOtp`/`verifyOtp`.~~
Dropped because Indian SMS OTP requires DLT / provider website-KYC (Fast2SMS returned status_code 996) — too slow and costly for a free-signup flow.

### Navigation guard
`RootGuard` inside `app/_layout.tsx` watches `session` from AuthContext and redirects
unauthenticated users to `/(auth)` and authenticated users away from `/(auth)`.
This is the single source of auth truth — no per-screen checks needed.

### Phase 6 (Notifications) — deferred
Push notifications (Expo/FCM + cron jobs) dropped from v1. The infrastructure
(FCM credentials, scheduled Edge Functions, deep links) adds complexity before
revenue justifies it. Re-evaluate when first paying cohort is stable.

### Pricing: `config/pricing.ts` (client-readable constants)
Prices are also validated server-side in Edge Functions (Phase 4).
The client copy is read-only reference for display; the server is authoritative for charging.

## Phase 4 — Payments + entitlements

### Razorpay: native SDK (`react-native-razorpay`), not WebView
Chosen for the best UPI UX in the Indian market — the native sheet does UPI-intent
app-switching to GPay/PhonePe far more reliably than a WebView checkout. Cost: one
native rebuild (`npx expo run:android`) after adding the dep. No Expo config plugin
exists; RN autolinking picks it up on prebuild.

### Two Edge Functions, amount recomputed server-side (rule #3)
`create-order` and `verify-payment`. The client sends only `{ kind, planId }`; the
server looks up the price from its OWN copy of the pricing table and creates the
Razorpay order — the client-sent amount is never trusted. `verify-payment`
recomputes the HMAC-SHA256 signature (`order_id|payment_id` keyed by the secret)
and only grants on a match. Server-side pricing is duplicated inside each function
(the dashboard "Via Editor" deploy can't bundle a shared `_shared/` import); keep it
in sync with `config/pricing.ts`.

### Entitlement model: ledger with per-kind columns (rule #7)
`entitlements_ledger` has one row per verified grant. Question packs carry
`questions_total`/`questions_remaining` (decremented one per AI reply); time packs
carry `seconds_total` (consumed WHOLE into a `paid_time` chat_session with an
`expires_at` countdown). A unique index on `order_id` makes the grant idempotent so a
retried verify can't double-grant. Balance = sum over rows where `consumed_at is null`.

### Consumption lives in the chat Edge Function
When the free minute is gone, `chat` starts a paid session from an entitlement
(prefers the `useKind` the client asks for; else time packs first, then questions).
Question sessions charge one question AFTER a successful reply; time sessions rely on
`expires_at`. Client shows a `needs_purchase` / `out_of_questions` → Paywall.

### First-purchase-only pack support (currently unused)
`create-order` can reject a repeat purchase of a pack flagged `first_purchase_only`
(rejects if the user already has a `paid` order for that plan). Bindu used this at ₹5
but was **changed to a normal pack** (₹9); no pack sets the flag now. The guard code
stays for future intro-pack use. Question pack prices: 9 / 35 / 79 / 169 / 349.

## Phase 5 — Home horoscopes

### Cached per Rashi (Moon sign), shared across users (rule #4)
A horoscope is generated ONCE per `(sign, period, period_key)` and shared by every
user with that Moon sign — at most 12 signs × 3 periods per bucket, not one per user.
This is the margin-protecting choice: horoscopes are a FREE retention feature, so the
generation cost must stay bounded. Trade-off: horoscopes are sign-level, not
personalised to the full chart (that stays the paid chat/report layer).

### Anchored to Moon sign (Rashi), not Sun sign
Vedic (Jyotish) horoscopes are read by Moon sign, so `kundli_chart.moon_sign` is the
key. The AI narrates general guidance for the sign — it is NOT given specific chart
placements, and must not invent them (rule #2).

### IST period buckets
`period_key` is computed in Asia/Kolkata (all users are in India): daily `YYYY-MM-DD`,
weekly ISO `YYYY-Www`, monthly `YYYY-MM`. A unique index on `(sign, period, period_key)`
is the cache/upsert key; a concurrent miss falls back to re-reading the raced row.

### Free, generated in an Edge Function (same pattern as chat)
`horoscope` fn holds the Claude key and returns cached-or-generated text. Mock reply
until `ANTHROPIC_API_KEY` is set — no code change to go live.

## Phase 7 — Paid reports (Vastu first)

### Vastu is property-based, not chart-based
Decided with the user: the Vastu report is a real Vaastu consultancy of the *home*,
not the birth chart. The user uploads a **floor plan image** + answers a short
questionnaire (facing, room directions, focus). No Kundli/birth chart is shown.
(Matchmaking — later — is the chart-based one and needs a partner's birth details +
Guna Milan; chart diagram style is user-selectable North/South there.)

### Claude VISION reads the floor plan
The `report` Edge Function downloads the floor plan from Storage, base64-encodes it,
and sends it as an image block to Claude alongside the questionnaire. Claude returns
structured JSON (overview, zones[], score, remedies[]) which we render into the
branded HTML — AI narrates/interprets, never fabricates measurements (rule #2).

### PDF: server generates + caches branded HTML; app exports the PDF on-device
Supabase Edge Functions run Deno and can't run headless Chromium, so true server-side
HTML→PDF isn't practical. Instead the function stores the branded **HTML** on the
`reports` row (rule #4: one purchase = one cached report), the app views it in a
`react-native-webview`, and **`expo-print`** turns that HTML into a real PDF on the
device for download/share (`expo-sharing`). Same premium look, works within the stack.

### Reports reuse the Phase 4 money layer (kind 'report')
`create-order`/`verify-payment` gained a `report` kind (prices in `create-order`:
vastu 14900, matchmaking 19900). A purchase grants a `report` entitlement row
(rule #7); the `report` function consumes it only on a successful generation. Migration
008 widens the `kind` CHECK on payment_orders + entitlements_ledger and adds the
`reports` table + a private `reports` Storage bucket (user-scoped by first folder).

### Matchmaking: Guna Milan is COMPUTED server-side, AI only narrates (rule #2)
The Ashtakoot (8-koota, /36) score is computed deterministically inside the `report`
Edge Function from the two charts' Moon signs + Nakshatras — Varna, Vashya, Tara, Yoni,
Graha Maitri, Gana, Bhakoot, Nadi — plus Mangal/Nadi/Bhakoot dosha detection. Claude is
handed the finished numbers and only narrates their meaning; it never changes a score.
The stored `score` is the compatibility %. The partner (who has no profile row) is charted
via `kundliService.computeKundli`, a non-persisting variant of the single chart entry point
(rule #1) — so real ephemeris later upgrades both people at one swap point. Charts render as
branded HTML (North = SVG diamond, South = 4×4 sign grid), user-selectable per §15.

### Report order flow: fill the questionnaire FIRST, then pay (both reports)
Changed with the user from buy-first to **fill → pay → generate**. Payment lives at the end
of each intake screen, not on the Reports tab. Before charging, the screen checks
`reportCredits(type)` and skips payment if an unused credit already exists (an abandoned
purchase is reused, never double-charged). `purchasePack` awaits verification, so the
entitlement is present before generation (no race); cancelling Razorpay keeps the filled
form. Rationale: users commit to the effort before paying, and we never take money for a
report they haven't finished specifying.

## Phase 10 — Polish + compliance

### Legal docs live in-app as data, one dynamic viewer, public route
Privacy/Terms/Disclaimer copy is data in `constants/legal.ts` rendered by a single
`app/legal/[doc].tsx` viewer (not three screens), so wording changes never touch layout.
The route is whitelisted in `AuthGate` (`segments[0] === 'legal'`) so it's readable while
signed out — required because the sign-in screen links to Terms/Privacy before a session
exists. Copy is a good-faith template (not legal advice) and should also be hosted at a
public URL for the Play Store listing. Single `CONTACT_EMAIL` const drives every reference.

### Analytics: append-only events table, insert-own RLS, fire-and-forget client
`public.events(user_id, name, props jsonb, created_at)` with an insert-own RLS policy and
**no client SELECT** — clients only write; analysis runs with the service role. `track()`
is fire-and-forget (never awaited by callers), resolves the uid from the cached session (no
extra network hop), and swallows every error so analytics can never break a user flow.
Purchases are tracked at one choke point (`paymentService.purchasePack`) rather than per
call-site. If the migration isn't run, inserts fail and are silently ignored — the app is
unaffected.

### Auth errors are always humanised
Raw Supabase auth strings are never shown; `friendlyAuthError()` maps them (wrong/expired
code, 429 rate-limit, network, 5xx) to calm copy. Leaking provider text reads like a bug and
exposes internals.

## Free Home features — Panchang + Numerology (computed, never AI)

### Both features cost ₹0 at runtime — COMPUTED + cached, zero LLM calls
Panchang and Numerology are free retention features on Home. Neither makes any
Claude/OpenAI call, ever. Panchang is pure astronomy; Numerology is pure arithmetic +
a static text library. This keeps a growing free surface from adding any marginal cost
(rule #4 taken to its limit — the cost isn't just bounded, it's zero).

### Panchang: computed in pure code (no provider), cached per city per day
The almanac is COMPUTED directly — no external provider. As of 2026-07-07 the `panchang`
Edge Function uses the **shared Vedic engine** (`_shared/astro.ts`) — the SAME Sun/Moon model
and Lahiri ayanamsa the Kundli uses (Schlyter method with perturbation terms; sunrise/sunset
derived from the same Sun model), so a user's Panchang nakshatra agrees with their chart. It
reads the five limbs at local sunrise — tithi
(12° elongation), nakshatra (sidereal Moon, Lahiri ayanamsa), yoga (sidereal Sun+Moon),
karana (6° half-tithis), vaara (weekday) — plus sunrise/sunset (Almanac-for-Computers
algorithm) and the muhurta windows (Rahu Kaal / Yamaganda / Gulika from the standard weekday
part-tables; Abhijit around solar noon). It is GENERIC, not personalised: identical for
everyone in the same city on the same day. Cached in `panchang_cache` keyed by
`(place_key, date_key)` where `place_key` = lat/lng rounded to 1 decimal (~11 km → a whole
city collapses to one row) and `date_key` = the IST day. Cache hit → instant; miss → compute
+ store (23505 race falls back to re-reading), same shape as the horoscope cache. A daily
cron could pre-warm cities later; none exists, so on-demand generation covers it. City is
taken from the user's profile birth-place lat/lng (we don't collect a separate current
location in v1).

### Numerology: fully client-side pure math + a fixed text library
No Edge Function at all. `lib/numerology.ts` computes the Life Path (from DOB, component
method) and Expression/Destiny (from the full name via the Pythagorean letter map), preserving
master numbers 11/22/33. The MEANINGS are a hand-written static table in `constants/numerology.ts`
(one entry per 1–9, 11, 22, 33; Life-Path and Expression framings) — never AI-generated.
`numerologyService.getNumerology` computes once and persists the numbers to `profiles.numerology`
(jsonb), so it isn't recomputed each view; the text is looked up from the static library at
render (so copy can be edited without a re-store). Doing this on-device means literally zero
server/AI cost.

### Home layout: horoscope stays the hero; Panchang + Numerology are secondary cards
Below the daily/weekly/monthly horoscope sit two compact, tappable cards ("Today's Panchang",
"Your Numerology") under a quiet "More for you" label — present but not competing with the hero,
Home not overcrowded. Each card opens a full detail screen (`app/panchang.tsx`, `app/numerology.tsx`).

### Soft funnel hooks into Chat (gentle, not pushy)
Each detail screen ends with one optional nudge into the paid Chat ("Curious what today holds
for you specifically? Ask the astrologer" / "See how your birth chart shapes this — start a
chat"). Clicks fire `home_hook_clicked {source}`. Views fire `panchang_viewed` /
`numerology_viewed`. These reuse the existing fire-and-forget `track()` (no new analytics infra;
`events.name` is free text, so no migration for the event names).

## Free Home tool — Shubh Muhurat Finder (computed, never AI)

### Rule-matching over the Panchang engine — zero AI, zero provider
The Muhurat Finder is pure rule-matching, not AI. `config/muhuratRules.ts` is the single source
of truth: each of 7 activities (Griha Pravesh, Marriage, Vehicle, Business, Naming, Property,
Travel) carries a fixed set of favourable nakshatras + weekdays. The `muhurat` Edge Function
iterates each day in the range, COMPUTES that day's Panchang with the shared Vedic engine
(`_shared/astro.ts`, the same one the Kundli and Panchang use — no provider), and
keeps a day when its nakshatra + weekday are favourable and the tithi isn't Rikta (4/9/14) or
Amavasya. No Claude/OpenAI call anywhere.

### Rules duplicated server-side (same constraint as pricing)
The canonical rules live in `config/muhuratRules.ts` for the client (activity list, labels,
funnel targets). The Edge Function can't import that file through the dashboard "Via Editor"
deploy, so it holds a MIRROR of the rule data — the same pattern as the pricing tables in
`create-order`/`verify-payment`. Keep the two in sync; a rule change means redeploying `muhurat`.

### v1 time-window simplification (noted per the brief)
Exact per-activity time windows (choghadiya-level) are deferred. v1 returns favourable DATES
plus the universally-auspicious **Abhijit Muhurta** window for each (computed from that day's
sunrise/sunset). A day qualifies on its sunrise-time nakshatra/weekday/tithi; intra-day
nakshatra changes are not sub-divided. Good enough for a free finder; a real ephemeris/provider
can sharpen it later at the same boundary (rule #1's single swap point).

### Cached per (activity, city, date-range) for the day
`muhurat_cache` unique on `(activity, place_key, range_key)` — `place_key` = lat/lng rounded to
1 decimal (same city grid as `panchang_cache`), `range_key` = `START_END` IST ISO dates. Default
range is today…+45 (capped at +90). Because `range_key` starts at today, the cache naturally
rolls over each day. Cache hit → instant; miss → compute + store (23505 race re-reads).

### Placement + soft funnel to the matching paid product
A "Shubh Muhurat Finder" card sits with the other secondary Home cards, below the horoscope hero
→ `app/muhurat.tsx` (activity picker → results). Each result set ends with ONE gentle,
activity-aware nudge: Griha Pravesh/Property → Vastu report; Marriage → Matchmaking report;
others → Chat. Events: `muhurat_opened`, `muhurat_activity_selected {activity}`,
`muhurat_results_viewed {activity}`, `muhurat_funnel_clicked {target}`. A disclaimer reminds
users to confirm important muhurats with a priest/astrologer.

## Free Home tool — Live Darshan (deep-link directory, v1)

### Deep-link OUT, never embed/host (deliberate legal-safety choice)
v1 is a curated directory that links OUT to each temple's OFFICIAL YouTube live page
(`Linking.openURL` → external YouTube app/browser). Ritham does not host, embed, download or
re-stream any content — YouTube bears all streaming cost and the temple owns the stream. This
sidesteps both bandwidth cost and content-licensing risk. No AI/LLM anywhere.

### Static config, official channels only
`config/temples.ts` is the single source of truth (8 well-known temples: name, location, deity,
icon, timings, official `streamUrl`, `source`, `mode`, `verified`). A prominent CRITICAL-RULE
comment enforces official-only sources (shrine board / trust / devasthanam) — never fan
re-uploads, aggregators, or mirrors. URLs use the channel `/live` suffix so we never hardcode an
expiring video id; the button opens the current live stream if running, else the channel. All 8
URLs were verified against each temple board's own channel/site (2026-07-04) and marked
`verified: true`. Most are official YouTube channels; **Mahakaleshwar has no official YouTube
channel**, so it links to its official MP-Government live-darshan page (`source: 'website'`) — the
`source` field lets the UI say "official YouTube channel" vs "official temple website" accurately.

### Staged upgrade path baked into the data model
Each temple carries `mode: 'link' | 'embed'`, all `'link'` in v1. A future v2 can flip a single
temple to `'embed'` (official YouTube IFrame player in-app) ONLY after that temple grants written
permission. Embedding is not built yet — the field just reserves the seam.

### Free, unmonetised, no implied endorsement
No Ritham ads around/over the darshan links; the disclaimer explicitly states the streams are the
temples' official channels, that Ritham does not own/host the content, and that Ritham is not
affiliated with or endorsed by any temple. Events: `darshan_opened`, `darshan_temple_clicked {temple}`.

## Retrograde (Vakri) + Sade Sati Trackers — client-side deterministic compute (2026-07-09)
Two new FREE Home tools. Both are ZERO runtime cost and use NO AI/LLM and NO VedAstro call.

- **Compute location:** transit data (which planets are vakri today; Saturn's sign timeline)
  is global + deterministic, so it is computed **client-side** from a ported copy of the
  server astronomy engine (`lib/ephemeris.ts`, same Schlyter+Lahiri math as
  `_shared/astro.ts`) in `lib/transitsService.ts`, and **day-cached in AsyncStorage**
  (`transits_v1_<date>`). Routed through `kundliService` (`getRetrograde`, `getSadeSati`).
- **Why not the spec's `retrograde_cache` table + cron:** client compute is even cheaper
  (no table, no cron, no edge fn, no deploy) and equally correct/global. **v2 option:** if we
  ever want it server-side (e.g. to precompute for web), lift `transitsService` into a
  `transits` edge function beside `panchang` and cache one global row/day — the compute code
  is provider-free and moves as-is.
- **Retrograde personalization (shipped, not deferred):** the detail screen cross-references
  the retro planet's current sign against the user's **stored** Lagna to show the house
  ("Mercury is retrograde in your 7th house") — no extra call, reads cached chart.
- **Sade Sati:** derived per-user from stored natal Moon sign vs the shared Saturn run
  timeline (3 phases: rising/peak/setting). Nodes (Rahu/Ketu) are excluded from the retro
  tracker (always vakri). Copy is static (`config/retrogradeMeanings.ts`,
  `config/sadeSatiPhases.ts`) — deliberately calm/non-alarmist for Sade Sati; no products.
