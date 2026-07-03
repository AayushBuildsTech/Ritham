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

### First-purchase-only packs (Bindu ₹5)
Enforced in `create-order`: reject if the user already has a `paid` order for that
plan. Client also labels it "First purchase only".
