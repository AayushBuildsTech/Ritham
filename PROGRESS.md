# Ritham — Build Progress & Handoff Document

> **For Claude:** Read this entire file before doing anything. It is the single source of truth for what has been built, what decisions were made, and what to do next.

---

## 1. What Is Ritham

An AI-powered Vedic astrology Android app (React Native + Expo). Users create a profile with birth details → get a Kundli (birth chart) → chat with an AI astrologer anchored to their chart → buy time-based or question-based chat packs → read daily/weekly/monthly horoscopes → buy PDF reports (Vastu, Matchmaking) → browse an affiliate store.

**Target market:** Indian Android users. Payments via Razorpay (UPI/cards/wallets).

---

## 2. Tech Stack (Locked)

| Layer | Choice |
|---|---|
| Mobile | React Native + Expo (managed), TypeScript |
| Routing | expo-router v4 (file-based) |
| Backend / DB / Auth | Supabase (Postgres, Auth, Storage, Edge Functions) |
| Payments | Razorpay (server-side order create + verify) |
| AI | Anthropic Claude API — **called only from Edge Functions, never client** |
| Kundli | Third-party API (Prokerala / VedicAstroAPI) behind `kundliService` module |
| Push notifications | **DROPPED for v1** — add after revenue |
| Analytics | Events table in Supabase |

---

## 3. Project Location

```
C:\Users\user\Desktop\Ritham\ritham\
```

This is the Expo project root. All commands must be run from this folder.

---

## 4. Current SDK Versions

```json
"expo": "~57.0.0",          // actual installed: 57.0.1
"react-native": "0.86.0",
"react": "19.2.3",
"expo-router": "~57.0.2",
"typescript": "~6.0.3"
```

**Why SDK 57:** We no longer use Expo Go (it crashed with the `PlatformConstants`
TurboModule error on the physical device). Instead we build a real dev client via
`npx expo run:android`, which removes the Expo-Go SDK ceiling — so the project was
consolidated onto the latest stable SDK (57), which `AGENTS.md` also targets.

**History:** The project was previously a broken mix — `expo@54` core with SDK-52
companion packages (RN 0.76, expo-router 4). That caused a Kotlin/KSP Gradle
failure. Fixed by `npx expo install expo@^57` then `npx expo install --fix`, then a
clean `npm install --legacy-peer-deps` (React 19 peer strictness).

---

## 5. File Structure Built

```
ritham/
├── app/
│   ├── _layout.tsx              ← Root layout: AuthProvider + AuthGate (global redirect guard)
│   ├── index.tsx                ← Entry: checks auth → redirects to (auth) or (tabs)
│   ├── profile.tsx              ← Phase 2: Kundli birth-details form + chart view (create/edit)
│   ├── (auth)/
│   │   ├── _layout.tsx          ← Stack navigator for auth screens
│   │   ├── index.tsx            ← Phone number entry screen
│   │   └── verify-otp.tsx       ← 6-digit OTP verification screen
│   └── (tabs)/
│       ├── _layout.tsx          ← Bottom tab bar (4 tabs)
│       ├── index.tsx            ← Home; redirects profile-less users to /profile (onboarding)
│       ├── chat.tsx             ← Phase 3: AI chat, free 1-min countdown
│       ├── store.tsx            ← Store placeholder
│       └── reports.tsx          ← Reports placeholder
├── components/
│   ├── LoadingScreen.tsx        ← Shown while checking auth session
│   └── SelectModal.tsx          ← Reusable picker (local + async remote search)
├── config/
│   └── pricing.ts               ← Single source of truth for ALL prices (paise)
├── constants/
│   ├── theme.ts                 ← Colors (indigo/gold), fonts, spacing
│   └── cities.ts                ← Bundled Indian cities (offline birth-place defaults)
├── context/
│   └── AuthContext.tsx          ← Session state, 5s timeout fallback, signOut
├── lib/
│   ├── supabase.ts              ← Supabase client (AsyncStorage, NOT SecureStore)
│   ├── kundliService.ts         ← ONLY entry point for Kundli data; mock + DB cache; 1 swap point
│   ├── geocoding.ts             ← Open-Meteo place search (lat/lon + timezone)
│   └── chatService.ts           ← Wraps the chat Edge Function (CHAT_FUNCTION slug)
├── supabase/
│   ├── functions/
│   │   └── chat/index.ts        ← Phase 3 Edge Function: calls Claude (deployed as `bright-processor`)
│   └── migrations/
│       ├── 001_phase1_users.sql       ← users table + RLS + referral code trigger
│       ├── 002_auth_user_sync.sql     ← auto-sync auth.users → public.users on OTP verify
│       ├── 003_fix_referral_code_schema.sql ← fix signup 500 (gen_random_uuid)
│       ├── 004_phase2_profiles.sql    ← profiles (birth details + cached Kundli) + RLS
│       └── 005_phase3_chat.sql        ← chat_sessions + chat_messages + free-minute tracking
├── .env.local                   ← REAL Supabase keys (user has filled this in)
├── .env.example                 ← Template (safe to commit)
├── .gitignore
├── app.json                     ← scheme: "ritham", plugins: ["expo-router"]
├── babel.config.js              ← Just babel-preset-expo (no reanimated plugin)
├── DECISIONS.md                 ← Architecture decisions log
├── package.json
└── tsconfig.json
```

---

## 6. Supabase Setup Status

- [x] Project created on supabase.com
- [x] Phone auth enabled (test OTP `919986692684=123456`, valid until Jul 30 2026)
- [x] Migrations 001–005 all run (users, auth sync, referral fix, profiles, chat)
- [x] `.env.local` filled with real SUPABASE_URL and SUPABASE_ANON_KEY
- [x] Edge Function deployed (slug `bright-processor`; source `supabase/functions/chat`)
- [ ] `ANTHROPIC_API_KEY` secret — NOT set yet (chat returns mock until added)
- [ ] SMS provider (Twilio) — not needed until production launch (test numbers bypass it)

---

## 7. Packages Removed (Important — Do Not Re-add Without Care)

| Package | Why Removed |
|---|---|
| `react-native-gesture-handler` | Caused `PlatformConstants` TurboModule crash in Expo Go SDK 54 |
| `react-native-reanimated` | v4 requires `react-native-worklets` (missing); v3 babel plugin conflicted with babel-preset-expo in SDK 54 |
| `expo-secure-store` | Removed from plugins — was force-initializing a native module causing the crash. Also switched Supabase storage from SecureStore to AsyncStorage |

---

## 8. Testing Environment — RESOLVED ✅

Phase 1 now builds and runs on the physical device via `npx expo run:android`
(no Expo Go). The full local toolchain is set up and env vars are persisted:

| Item | Value |
|---|---|
| Android SDK | `C:\Users\user\AppData\Local\Android\Sdk` (API 36 platform, build-tools, platform-tools, NDK 27.1.12297006) |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | set to the SDK path (User env, persisted) |
| `ANDROID_SDK_HOME` | `C:\Android` (holds the adb auth key `.android\adbkey`) |
| `JAVA_HOME` | `C:\Program Files\Android\Android Studio\jbr` (bundled JDK 21) |
| adb | SDK `platform-tools\adb.exe` v37.0.0 |
| Device | OPPO/OnePlus **CPH2943**, serial `3K364W007HJ00000`, USB debugging ON |

**Gotchas that were fixed (don't reintroduce):**
- A stray `C:\Android\adb.exe` was on the **System** PATH and fought the SDK adb
  ("adb server is out of date" / device flapping to "unauthorized"). Those loose
  binaries were renamed to `*.bak`. Only the SDK adb should ever be used.
- Build must run with `JAVA_HOME` set to the Studio JBR, and `ANDROID_HOME` set.

### To run the app
```
cd C:\Users\user\Desktop\Ritham\ritham
npx expo run:android      # first build ~15-40 min (NDK + native compile); later builds ~1-3 min
```
First build downloads NDK 27 (~1 GB) and compiles native code (New Architecture is
default in SDK 57). Keep the phone unlocked/plugged in; accept any install prompt.

---

## 9. Build Phases — Status

| Phase | Description | Status |
|---|---|---|
| 1 | Skeleton + Auth (Expo scaffold, 4-tab nav, Supabase OTP) | **DONE — verified on device** (OTP login → Home tab works) |
| 2 | Profile + Kundli (birth form, kundliService, chart storage) | **DONE — verified on device** (form + live geocoding + mock chart) |
| 3 | Chat — hero feature (free 1-min, countdown, AI via Edge Function) | **DONE — verified on device** (mock reply; add API key for real AI) |
| 4 | Payments + entitlements (Razorpay, ledger, paywall) | Not started |
| 5 | Home horoscopes (cached, daily/weekly/monthly) | Not started |
| 6 | Notifications | **DROPPED for v1** |
| 7 | Reports — premium branded PDF (Vastu + Matchmaking) — see §15 spec | Not started |
| 8 | Store (Amazon affiliate) | Not started |
| 9 | ~~Refer & Earn~~ | **REMOVED from plan** |
| 10 | Polish + compliance (privacy policy, disclaimer, analytics) | Not started |

> Note: Refer & Earn is dropped. The `referral_code` column + `generate_referral_code`
> trigger in migration 001 are now vestigial (harmless; leave as-is, optional cleanup later).

---

## 10. Non-Negotiable Rules (Remind Claude Every Phase)

1. All Kundli API calls go through `kundliService.getKundli(profile)` only — never direct
2. AI only narrates facts; never computes scores or chart placements
3. Payment always verified server-side in Edge Functions before granting entitlement
4. Cache horoscopes and Kundli summaries aggressively to protect margins
5. Free 1-min chat = one per verified phone number (not per profile)
6. All money stored in **paise (integer)** — display as ₹ in UI
7. Every paid entitlement has a ledger entry in `entitlements_ledger` table

---

## 11. Pricing (from `config/pricing.ts`)

**Session packs:**
- Jyoti · 1 min · ₹15
- Kiran · 5 min · ₹39
- Tara · 10 min · ₹69
- Nakshatra · 15 min · ₹99
- Antariksh · 30 min · ₹179

**Question packs:**
- Bindu · 1 question · ₹5 (first purchase only)
- Panch · 5 questions · ₹19
- Darshan · 15 questions · ₹49 ← default / most popular
- Gyan · 40 questions · ₹119
- Brahmanda · 100 questions · ₹279

**Reports:**
- Vastu · ₹149
- Matchmaking · ₹199

---

## 12. Brand

- Background: deep indigo `#14122b` to `#1e1b45`
- Accent: gold `#d9a441` / `#e6c063`
- Text: off-white `#f0ece8`
- Feel: premium, calm, contemplative — never kitschy

---

## 13. Key Commands

```bash
# Run dev server (Expo Go)
cd C:\Users\user\Desktop\Ritham\ritham
npx expo start --clear

# Run on Android device/emulator (use this instead of Expo Go)
cd C:\Users\user\Desktop\Ritham\ritham
npx expo run:android

# Type check
cd C:\Users\user\Desktop\Ritham\ritham
npx tsc --noEmit
```

---

## 14. What Claude Should Do Next Session

**Phases 1, 2, 3 + guided onboarding are DONE and verified on the device.** All code
is committed and pushed to GitHub (AayushBuildsTech/Ritham, branch `main`).

Two open follow-ups:

1. **Flip on real AI — DECISION: defer to near launch (~Phase 10).** The chat stays on
   the mock reply through development. When ready: add `ANTHROPIC_API_KEY` in Supabase
   → Edge Functions → `bright-processor` → Secrets (no code/deploy change — it swaps to
   real Claude Sonnet 5 automatically). At that point do a quality pass: send several
   real chats and tune the system prompt in `supabase/functions/chat/index.ts`. Do NOT
   prompt the user to add the key before then.
2. **Start Phase 4 — Payments + entitlements** (the money layer):
   - Razorpay: server-side order create + verify in an Edge Function (never trust the
     client — rule #3).
   - `entitlements_ledger` table: one row per paid grant (rule #7).
   - Turn the chat's "packs coming soon" banner into the real **paywall** using the
     session/question packs in `config/pricing.ts`.
   - Grant time-based / question-based entitlements after verified payment; consume
     them in the chat flow.
   - Decisions needed up front: Razorpay test keys, which packs to surface first.

**(Optional polish, not blocking):** `app/(auth)/index.tsx` + `verify-otp.tsx` still
dump the raw Supabase error as JSON — replace with friendly messages.

Per `AGENTS.md`, read the SDK 57 docs (https://docs.expo.dev/versions/v57.0.0/)
before writing native/Expo code.

### Guided onboarding (new users)
Flow: **OTP → (auto) Kundli form → (auto) Home.** Chat is NOT part of onboarding —
it's a normal tab; the free 1-min is always available there.
- `app/(tabs)/index.tsx` (Home) redirects a signed-in user with NO profile to
  `/profile` (with a loading guard, no flash).
- `app/profile.tsx` — on FIRST profile creation (`wasNew`), `router.replace('/(tabs)')`
  (Home). Editing an existing profile still shows the chart view.
- `app/(tabs)/chat.tsx` — normal tab behaviour; free minute available; when it ends
  it shows a banner and stays put (no auto-navigation).

### Phase 3 — Chat (working, mock AI)
- Edge Function is deployed on Supabase but the dashboard "Via Editor" flow
  auto-named it **`bright-processor`** (NOT `chat`). `lib/chatService.ts` calls that
  slug via the `CHAT_FUNCTION` constant — keep them in sync. Source lives at
  `supabase/functions/chat/index.ts`.
- Model chosen: **Claude Sonnet 5** (`claude-sonnet-5`), thinking disabled for snappy
  cheap chat replies. AI is called ONLY from the Edge Function.
- **Currently returns a MOCK reply** because `ANTHROPIC_API_KEY` isn't set. To go
  live: Supabase → Edge Functions → (bright-processor) Secrets → add
  `ANTHROPIC_API_KEY=sk-ant-...`. No redeploy/code change needed — the function
  swaps to real Claude automatically.
- Free 1-minute session = one per phone, enforced server-side via
  `users.free_minute_used_at`. To re-test the free flow, reset it:
  `update public.users set free_minute_used_at = null where phone = '<digits>';`
- Deploy note: local `npx supabase login`/`link` failed on Windows (device_code bug
  + path error). Dashboard "Via Editor" deploy was used instead — that's the
  reliable path here.

### Auth navigation (Phase 1, fixed)
- Redirect logic was only in `app/index.tsx`, which mounts only at `/`. After OTP
  verify the user was deep in `(auth)/verify-otp`, so the session updated but
  nothing redirected → stuck on verify screen. Fixed by adding a global **AuthGate**
  guard in `app/_layout.tsx` that watches `session` + `useSegments()` and
  `router.replace()`s to `/(tabs)` (signed in) or `/(auth)` (signed out). This also
  protects the tabs when signed out. Confirmed: OTP → Home, and session persists.

### Supabase auth notes (Phase 1, working)
- Phone provider ON; **test OTP** configured: `919986692684=123456` (country code,
  no `+`). Test OTPs valid until **July 30, 2026**. Twilio is entered but real SMS
  is NOT relied upon for testing — matched test numbers bypass Twilio.
- Migration `003_fix_referral_code_schema.sql` fixed a 500 "Database error saving
  new user": the referral trigger used pgcrypto `gen_random_bytes` (in the
  `extensions` schema, off the trigger search_path) → switched to core
  `gen_random_uuid`. All three migrations (001, 002, 003) are applied.

---

## 15. Phase 7 — Report PDF Design Spec (decided)

Two paid PDF reports: **Vastu (₹149)** and **Matchmaking (₹199)**. Design decisions
made with the user — build to these when Phase 7 starts.

**Visual style — "Premium & minimal" (on-brand, §12):**
- Deep indigo pages (`#14122b`→`#1e1b45`), gold accents (`#d9a441`/`#e6c063`),
  off-white text (`#f0ece8`).
- Elegant **serif** headings, generous whitespace, subtle gold line dividers.
- Understated and expensive-feeling. NOT ornate/mandala-heavy, NOT infographic-style.

**Length:** Medium — **~6–9 pages**.

**Required structure (every report):**
1. **Branded cover page** — ✦ Ritham logo, report title, person's name + birth details.
2. **Details page (up front)** — the person's full birth details + Kundli summary
   (Lagna, Moon sign, Sun sign, Nakshatra, key planetary placements). *(user-requested)*
3. **Birth chart diagram** — a rendered visual Kundli (North vs South Indian style: ASK
   the user when building).
4. **Main analysis** — report body (Vastu: directional / room-by-room; Matchmaking:
   compatibility / guna milan, doshas).
5. **Summary + score/verdict** — at-a-glance box (Vastu health score / compatibility %).
6. **Remedies & recommendations** — gemstones, mantras, directions, do's & don'ts.

**Generation approach (recommended):** HTML/CSS → PDF **server-side** (Edge Function) for
full control of the brand aesthetic. Report text narrated by Claude from Kundli facts
(rule #2: AI narrates, never computes). Cache each generated PDF in **Supabase Storage** —
one purchase = one stored PDF (protect margins, rule #4). Delivery: in-app viewer +
download/share. Gate behind verified payment (Phase 4 entitlements).
