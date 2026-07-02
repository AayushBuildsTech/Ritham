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
