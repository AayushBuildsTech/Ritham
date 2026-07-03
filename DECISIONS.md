# Architecture Decisions

## Phase 1

### Routing: expo-router (file-based)
Chosen over `@react-navigation/bottom-tabs` standalone because expo-router provides
typed routes, deep-link support out of the box, and cleaner auth-gating via layouts.
The `(auth)` and `(tabs)` groups handle the guard logic in `app/_layout.tsx`.

### Auth: Supabase Phone OTP
Supabase sends SMS OTP via its configured SMS provider (Twilio/AWS SNS — set in Supabase dashboard).
The client calls `signInWithOtp({ phone })` then `verifyOtp({ phone, token, type:'sms' })`.
Session is stored in expo-secure-store (encrypted), never plain AsyncStorage.

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
