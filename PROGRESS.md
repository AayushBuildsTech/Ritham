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
│   │   ├── chat/index.ts        ← Phase 3 fn: Claude + entitlement consumption (deployed as `bright-processor`)
│   │   ├── create-order/index.ts   ← Phase 4: creates a Razorpay order (server-side amount)
│   │   ├── verify-payment/index.ts ← Phase 4: HMAC verify → grants entitlement (idempotent)
│   │   ├── horoscope/index.ts       ← Phase 5: cached per-sign daily/weekly/monthly horoscope
│   │   └── report/index.ts          ← Phase 7: Vastu report via Claude vision on floor plan
│   └── migrations/
│       ├── 001_phase1_users.sql       ← users table + RLS + referral code trigger
│       ├── 002_auth_user_sync.sql     ← auto-sync auth.users → public.users on OTP verify
│       ├── 003_fix_referral_code_schema.sql ← fix signup 500 (gen_random_uuid)
│       ├── 004_phase2_profiles.sql    ← profiles (birth details + cached Kundli) + RLS
│       ├── 005_phase3_chat.sql        ← chat_sessions + chat_messages + free-minute tracking
│       ├── 006_phase4_payments.sql    ← payment_orders + entitlements_ledger + RLS
│       ├── 007_phase5_horoscopes.sql  ← shared per-sign horoscope cache + RLS
│       └── 008_phase7_reports.sql     ← reports table + 'report' kind + Storage bucket + RLS
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
- [x] **Phase 4:** migration `006_phase4_payments.sql` run (payment_orders + entitlements_ledger)
- [x] **Phase 4:** Edge Functions `create-order` + `verify-payment` deployed; `chat` redeployed
- [x] **Phase 4:** `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` (test keys) secrets set
- [x] **Phase 4:** app rebuilt with native Razorpay module; **payment verified on device** (test card + netbanking → entitlement granted → chat consumes)
- [x] **Phase 5:** migration `007_phase5_horoscopes.sql` run (shared horoscope cache)
- [x] **Phase 5:** Edge Function `horoscope` deployed (slug `horoscope`); **verified rendering on device**
- [x] **Phase 7:** migration `008_phase7_reports.sql` run (reports table + 'report' kind + Storage bucket)
- [x] **Phase 7:** Edge Function `report` deployed (slug `report`); `create-order` redeployed (handles kind 'report')
- [x] **Phase 7:** app rebuilt (image-picker / print / sharing / webview); **Vastu verified on device**
- [x] **Phase 7:** Matchmaking added — `report` fn redeployed with the Ashtakoot engine; **verified on device** (JS-only client, no rebuild)
- [x] **Phase 7b — Chart-based reports (5 new) — REVERTED.** Back to 2 reports (Vastu + Matchmaking). removed `app/report-chart.tsx`, `ChartReportType`, `generateChartReport`, `computeChartFacts`, `generateChartNarration`, `renderChartReportHtml`. Reports tab simplified to 2 cards. No migration needed.
- [ ] **Phase 10:** run migration `009_phase10_analytics.sql` (events table). Until run, `track()` no-ops silently — app works, no events recorded. No other deploy; rest is JS-only.
- [ ] **Free Home features:** run migration `010_panchang_numerology.sql` (panchang_cache + profiles.numerology) AND deploy the `panchang` Edge Function. No new secrets. Numerology needs no deploy (client-only). See §20.
- [ ] **Shubh Muhurat Finder:** run migration `011_muhurat.sql` (muhurat_cache) AND deploy the `muhurat` Edge Function. No new secrets. See §21.

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
| 4 | Payments + entitlements (Razorpay, ledger, paywall) | **DONE — verified on device** (card + netbanking payment → verify → entitlement granted → chat consumes; see §16) |
| 5 | Home horoscopes (cached, daily/weekly/monthly) | **DONE — verified on device** (migration + `horoscope` fn live; Moon-sign horoscope renders, mock text until API key; see §17) |
| 6 | Notifications | **DROPPED for v1** |
| 7 | Reports — premium branded PDF (Vastu + Matchmaking) — see §15 spec | **DONE — verified on device** (Vastu: floor-plan + Claude vision; Matchmaking: Ashtakoot Guna Milan + both charts. Both use fill→pay→generate; see §18) |
| 8 | Store (Amazon affiliate) | **"Coming soon" for v1** — Amazon Associates needs a LIVE app before approving affiliate links, so the Store tab ships as a polished coming-soon previewing the planned product lines (**Rudraksha, gemstone bracelets, evil-eye/nazar charms**). Wire real products in post-approval. |
| 9 | ~~Refer & Earn~~ | **REMOVED from plan** |
| 10 | Polish + compliance (privacy policy, disclaimer, analytics) | **CODE DONE** — friendly auth errors, in-app Privacy/Terms/Disclaimer + Settings/About, disclaimer surfacing, analytics events. Needs migration `009` run; see §19 |

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
- Bindu · 1 question · ₹9
- Panch · 5 questions · ₹35
- Darshan · 15 questions · ₹79 ← default / most popular
- Gyan · 40 questions · ₹169
- Brahmanda · 100 questions · ₹349

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

---

## 16. Phase 4 — Payments + entitlements (CODE DONE, deploy + test pending)

The full money layer is coded. It mirrors the Phase 3 pattern: all charging and all
entitlement grants happen server-side in Edge Functions; the client only opens the
Razorpay sheet and reports the signed result back for verification.

**Decisions locked (with the user):**
- **Native Razorpay SDK** (`react-native-razorpay`), not WebView — best UPI UX.
- **Both pack kinds** sold from day one via a **Questions | Time toggle** in the paywall.
- **Test keys ready** — server returns `key_id` to the client; `key_secret` stays a secret.

**What was built:**
- Migration `006_phase4_payments.sql` — `payment_orders` (order audit) + `entitlements_ledger`
  (one row per verified grant, rule #7) + RLS (clients read own; writes via service role).
- Edge Function `create-order` — recomputes the amount from server-side pricing (rule #3),
  enforces first-purchase-only (Bindu), creates the Razorpay order, records it `created`.
- Edge Function `verify-payment` — HMAC-SHA256 signature check; on match flips the order to
  `paid` and inserts the ledger grant. Idempotent via `unique(order_id)`.
- `chat/index.ts` — once the free minute is used, starts a **paid_time** session (whole
  time pack → countdown) or a **paid_questions** session (one question charged per reply).
  Returns `needs_purchase` / `out_of_questions` for the client to open the paywall.
- Client: `lib/paymentService.ts` (`purchasePack`, `getBalance`), `components/Paywall.tsx`
  (toggle + pack grid + Razorpay flow), wired into `app/(tabs)/chat.tsx` (balance pills,
  paywall on exhaustion). `types/react-native-razorpay.d.ts` supplies the missing types.
- `npx tsc --noEmit` passes.

### To go live (operational — must be done in the Supabase & Razorpay dashboards)
1. **Migration:** run `supabase/migrations/006_phase4_payments.sql` in the SQL editor.
2. **Deploy functions** (dashboard "Via Editor", the reliable path here):
   - Deploy `create-order` and `verify-payment`. **Note the slugs Supabase assigns** — if
     they aren't literally `create-order`/`verify-payment`, update `CREATE_ORDER_FN` /
     `VERIFY_PAYMENT_FN` in `lib/paymentService.ts` (same gotcha as `bright-processor`).
   - **Redeploy `chat`** (`bright-processor`) — it now consumes entitlements.
3. **Secrets** (Edge Functions → Secrets): add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
   (test keys). They're read by both payment functions.
4. **Rebuild the app:** `npx expo run:android` — the native Razorpay module needs a fresh
   native build (it won't work over a JS-only reload).

### On-device test checklist
- Use the free minute → let it expire → paywall appears.
- Buy **Darshan (15 Q)** with Razorpay **test UPI `success@razorpay`** → returns, "❓ 15 left",
  chat works, count drops per reply. Run it to 0 → `out_of_questions` → paywall → top up.
  ⚠️ Do NOT use test card `4111 1111 1111 1111` → Razorpay rejects it as an "international card"
  (international payments are off by default). Use **UPI `success@razorpay`** (or domestic card
  `5267 3181 8797 5449`, OTP `1111`). This is a Razorpay account setting, not a code bug.
- Buy **Kiran (5 min)** → countdown pill starts; on expiry → paywall.
- Cancel the Razorpay sheet → no charge, no grant, message text restored.
- Verify in DB: `payment_orders.status='paid'` and a matching `entitlements_ledger` row.
- Reset the free minute to re-test: `update public.users set free_minute_used_at = null where phone='<digits>';`

### Pricing note (updated this session)
Question packs are now **Bindu ₹9 · Panch ₹35 · Darshan ₹79 · Gyan ₹169 · Brahmanda ₹349**
(paise: 900/3500/7900/16900/34900). **Bindu is a normal pack now** — the first-purchase-only
restriction was removed (the guard code remains in `create-order` but is inert). Time/report
prices unchanged. Source of truth is `config/pricing.ts`; the server copy in `create-order`
must mirror it. **Any price change requires redeploying `create-order`** (the server computes
the charged amount) — the client alone only changes the displayed number.

### Dev-run gotcha that cost time (avoid next session)
The device showed the red "Unable to load script" screen for a long while. Root cause was NOT
the build — it was a **stale `debug_http_host` = `192.168.0.101:8081`** saved in the app's
SharedPreferences (`/data/data/com.ritham.app/shared_prefs/com.ritham.app_preferences.xml`),
an IP that doesn't exist. The PC's real LAN IP is **192.168.0.12**. Fixed by setting the host to
**`localhost:8081`** (loads over USB via `adb reverse tcp:8081 tcp:8081`).
- To edit that pref: force-stop the app first (it rewrites the file on exit), then
  `cat prefs.xml | adb shell "run-as com.ritham.app sh -c 'cat > shared_prefs/com.ritham.app_preferences.xml'"`.
- Windows Firewall blocks inbound 8081 for the LAN route and needs an **admin** rule to open
  (`New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8081`).
  USB/localhost avoids all of it — prefer it.
- **Wireless ADB** (run cable-free): plug in USB, then `adb tcpip 5555` → `adb connect <phone-ip>:5555`
  → `adb -s <phone-ip>:5555 reverse tcp:8081 tcp:8081`, then unplug. ⚠️ The phone's Wi-Fi IP is
  **DHCP and changes** (seen: .10 → .4 on SSID `ACT_Aayush`) — get the current one with
  `adb shell ip -o -4 addr show wlan0`. If the link goes `offline` (phone slept / IP changed),
  replug briefly and redo the tcpip→connect→reverse sequence with the new IP.

### Not yet done (follow-ups for Phase 4 polish)
- No "restore/refresh balance" pull-to-refresh; balance loads on chat mount + after buys.
- Razorpay **webhook** (server-to-server `payment.captured`) not added — verify-on-return is
  enough for v1, but a webhook would catch app-killed-mid-payment cases. Add before launch.
- The Store/Reports tabs still don't surface packs; paywall lives only in chat for now.

---

## 17. Phase 5 — Home horoscopes (CODE DONE, deploy + test pending)

Free daily/weekly/monthly horoscopes on the Home tab, anchored to the user's Moon sign
(Rashi). Follows the chat pattern: text is generated only in an Edge Function, and
cached hard to protect margins.

**What was built:**
- Migration `007_phase5_horoscopes.sql` — `horoscopes` cache table, unique on
  `(sign, period, period_key)`, RLS (any signed-in user reads; only service role writes).
- Edge Function `horoscope` — resolves the user's `moon_sign`, computes the IST period
  bucket, returns the cached row or generates via Claude (mock until `ANTHROPIC_API_KEY`),
  then stores it. **Shared per sign** — 12 signs × 3 periods max per bucket, not per user.
- `lib/horoscopeService.ts` (`getHoroscope(profileId, period)`).
- `app/(tabs)/index.tsx` — Home rebuilt: greeting + "🌙 Moon in <sign>", Daily/Weekly/
  Monthly toggle, per-period cache, loading/retry states, `need_kundli` fallback.
- `npx tsc --noEmit` passes.

**Design decisions:** see DECISIONS.md → Phase 5. Horoscopes are FREE and sign-level
(not personalised to the full chart — that stays the paid chat/report layer).

### To go live
1. **Migration:** run `007_phase5_horoscopes.sql` in the SQL editor.
2. **Deploy** the `horoscope` Edge Function (dashboard "Via Editor"). **Note the slug** —
   if it isn't literally `horoscope`, update `HOROSCOPE_FUNCTION` in `lib/horoscopeService.ts`
   (same `bright-processor` gotcha). **No app rebuild** — the client change is JS-only and
   loads on reload.
3. No new secrets. It reuses `ANTHROPIC_API_KEY` (still unset → mock horoscope, which is
   fine for dev, same policy as chat: add the real key near launch).

### On-device test
- Open Home → header shows "🌙 Moon in <your sign>" → a horoscope renders (mock preview text).
- Switch Daily / Weekly / Monthly → each loads once and caches; switching back is instant.
- DB check: `select sign, period, period_key from public.horoscopes order by created_at desc;`
  — one row per sign+period+bucket; a second user with the same sign should NOT add a row
  (cache hit). Bucket keys are IST (`YYYY-MM-DD`, `YYYY-Www`, `YYYY-MM`).

### Not yet done (Phase 5 follow-ups)
- No pull-to-refresh; horoscopes load on mount and cache in component state for the session.
- No scheduled pre-warm — first reader of a sign/period each bucket pays the generation
  latency. Fine for launch; a cron pre-warm could be added later.

---

## 18. Phase 7 — Reports (Vastu + Matchmaking — DONE, verified on device)

Both paid reports are live. **Vastu is property-based**: the user uploads a floor plan +
answers a questionnaire, and Claude **vision** reads the plan to produce a room-by-room
Vaastu consultancy (no birth chart). **Matchmaking is chart-based**: it compares the user's
own chart with a partner's via a **deterministic Ashtakoot Guna Milan** (36 gunas), renders
both birth charts (North/South, user-selectable), and Claude narrates the computed result.

### Order flow (updated with the user): fill → pay → generate
Both reports now collect the full questionnaire FIRST, then charge, then generate — NOT
buy-first. Payment moved out of the Reports tab into the end of each intake screen
(`app/report-vastu.tsx`, `app/report-matchmaking.tsx`): the "Continue · ₹149/₹199" button
checks `reportCredits(type)` and only opens Razorpay if there's no unused credit (so an
abandoned-then-retried purchase never double-charges). `purchasePack` awaits server-side
verification, so the entitlement exists before generation runs (no race). Cancelling the
sheet leaves the form intact. The Reports-tab buttons are now pure navigation.

### Matchmaking specifics
- **Guna Milan is COMPUTED** in the `report` Edge Function (rule #2: numbers computed, AI
  only narrates). All 8 kootas (Varna/Vashya/Tara/Yoni/Graha Maitri/Gana/Bhakoot/Nadi) sum
  to /36; Nadi/Bhakoot/Mangal doshas detected. Score stored as a compatibility %.
- **Partner chart** has no profile row, so `kundliService.computeKundli(birth)` computes it
  WITHOUT persisting (still the single entry point, rule #1). The user's own chart comes
  from their cached profile Kundli. If the user has no profile yet, the intake prompts them
  to create one first.
- Charts rendered as branded HTML: North Indian = SVG diamond; South Indian = fixed 4×4
  sign grid. Reuses the same money layer (kind 'report', plan 'matchmaking' @ ₹199) and the
  WebView viewer / `expo-print` PDF export — **no new native modules, no rebuild** for the
  Matchmaking add; only a `report` Edge Function redeploy.

--- (original Vastu build notes below) ---

**Vastu is property-based** (decided
with the user): the user uploads a floor plan + answers a questionnaire, and Claude's
**vision** reads the plan to produce a room-by-room Vaastu consultancy. No birth chart.

**What was built:**
- Migration `008_phase7_reports.sql` — `reports` table (working data + cached HTML) + RLS;
  widens `kind` CHECK on payment_orders + entitlements_ledger to allow `report`; creates a
  **private `reports` Storage bucket** (user-scoped by first folder) + storage policies.
- Edge Function `report` — checks a paid `report` entitlement, downloads the floor plan from
  Storage, sends image + questionnaire to Claude (vision) → structured JSON → branded HTML
  stored on the row; consumes the entitlement only on success. Mock report until
  `ANTHROPIC_API_KEY` is set.
- `create-order` — now accepts `kind: 'report'` (prices vastu 14900 / matchmaking 19900).
  `verify-payment` unchanged (already grants a generic ledger row; migration allows the kind).
- Client: `lib/reportService.ts` (upload floor plan to Storage via `base64-arraybuffer`,
  generate, list, credits), Reports tab rebuilt (buy → intake), `app/report-vastu.tsx`
  (questionnaire + `expo-image-picker` floor-plan upload), `app/report-view.tsx`
  (`react-native-webview` viewer + `expo-print`/`expo-sharing` PDF export).
- New deps (native → needs rebuild): `expo-image-picker`, `expo-print`, `expo-sharing`,
  `expo-file-system`, `react-native-webview`; plus `base64-arraybuffer` (JS). `expo-image-picker`
  added to `app.json` plugins (photo permission). `npx tsc --noEmit` passes.

**Design decisions:** see DECISIONS.md → Phase 7.

### To go live
1. **Migration:** run `008_phase7_reports.sql` in the SQL editor (also creates the Storage bucket).
2. **Deploy** the new `report` Edge Function AND **redeploy `create-order`** (it now handles the
   `report` kind). Note the `report` slug — if renamed, update `REPORT_FUNCTION` in
   `lib/reportService.ts`. `verify-payment` does not need redeploying.
3. **Rebuild the app** (`npx expo run:android`) — native modules were added.
4. No new secrets (reuses `ANTHROPIC_API_KEY` → mock report text until the key is set).

### On-device test (Vastu)
- Reports tab → **Get Vaastu Report ₹149** → pay (test netbanking → Success, or domestic card
  `5267 3181 8797 5449`; NOT `4111…` → "international").
- After payment → intake screen → upload a floor plan photo + pick directions → **Generate**.
- Lands on the report viewer (branded indigo/gold WebView) → **Download** exports/shares a PDF.
- DB check: `select type, status, score from public.reports order by created_at desc;` (status
  `ready`); the `report` entitlement row should now have `consumed_at` set.

### Not yet done (Phase 7 follow-ups)
- Guna Milan runs on the **mock** Kundli (deterministic, not a real ephemeris). It's correct
  in structure and fully computed; real astronomical charts arrive at the single
  `kundliService.fetchKundliFromProvider` swap point (rule #1) — Matchmaking then upgrades
  automatically. Same policy as the rest of the app's mock charts.
- Report narration is still **mock** until `ANTHROPIC_API_KEY` is set (scores/charts are real).
- No report regeneration/edit; one purchase = one generated report. Failed generations leave a
  `failed` row and the entitlement stays unconsumed (user can retry from a fresh intake — a
  "retry" entry point from the Reports tab is a nice-to-have).

---

## 19. Phase 10 — Polish + compliance (CODE DONE; one migration pending)

The pre-launch polish/compliance pass. All client-side except one analytics migration.

**What was built:**
- **Friendly auth errors** — `lib/authErrors.ts` maps raw Supabase messages (wrong/expired
  OTP, 429 rate-limit, no-network, 5xx) to calm human copy; wired into `(auth)/index.tsx`
  (send OTP) and `(auth)/verify-otp.tsx` (verify + resend). No more raw JSON on screen.
- **In-app legal + Settings/About:**
  - `constants/legal.ts` — full Privacy Policy, Terms of Service, and Astrology Disclaimer
    copy (India/Play-Store-appropriate; good-faith template, NOT legal advice). Contact is
    `rithamastro@gmail.com` (single `CONTACT_EMAIL` const, referenced across all docs +
    Settings). `LEGAL_UPDATED` = "July 2026".
  - `app/legal/[doc].tsx` — one branded viewer for all three docs (`/legal/[doc]` with
    `doc` = privacy|terms|disclaimer). **Readable signed-out**: `AuthGate` in `app/_layout.tsx`
    now treats `segments[0] === 'legal'` as a public route, so the sign-in screen's links work.
  - `app/settings.tsx` — Settings/About: mobile number, Kundli link, the 3 legal docs,
    contact email, app version (via `expo-constants`, currently v1.0.0), and **Sign Out**
    (confirm dialog). Opened from a new ⚙ button in the Home header.
  - Sign-in screen's "Terms / Privacy" line is now tappable (was plain text). Sign-out moved
    off Home (was a dev stub) into Settings.
- **Disclaimer surfacing** — "for guidance, not professional advice" on the Home footer and
  the chat intro card (reports already carry footers).
- **Analytics** — migration `009_phase10_analytics.sql` (`events` table + insert-own RLS; no
  client SELECT — analysis via service role). `lib/analytics.ts` `track(name, props?)` is
  fire-and-forget, resolves the uid from the cached session, and swallows all errors (never
  blocks UX). Instrumented events: `login`, `profile_created`, `chat_message`, `purchase`
  (choke-pointed in `paymentService.purchasePack`), `report_generated` (vastu + matchmaking).

**To go live:** run `009_phase10_analytics.sql` in the SQL Editor. Everything else is JS-only
(no Edge Function change; `expo-constants` was already installed → no rebuild). Reload the app.

**Dev note:** dynamic route links use the typed form
`router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })` — a plain
`/legal/privacy` string fails expo-router's typed-routes check.

### Account deletion (DONE — code; deploy pending) ← added this session
In-app "Delete Account" path (Play Store / data-safety requirement — not just "email us").
- Edge Function `supabase/functions/delete-account/index.ts` — authenticates the caller
  from their JWT (only ever deletes that user) and, via the service role: (1) removes their
  `reports/<uid>/` Storage objects, (2) deletes the `public.users` row — which **cascades**
  profiles / chat_sessions / chat_messages / payment_orders / entitlements_ledger / reports
  (all FK `on delete cascade`; `events.user_id` is `on delete set null` → past analytics
  survive but are anonymised), (3) deletes the `auth.users` identity (no FK between the two,
  so it must be deleted explicitly). No new secrets, no new migration.
- Client `lib/accountService.ts` (`deleteAccount()`, slug `delete-account`).
- `app/settings.tsx` — DANGER ZONE → "Delete Account" with a **two-step** confirm, busy
  spinner, then `signOut()` (AuthGate returns to sign-in). Sign-out disabled mid-delete.
- Privacy Policy §5 (`constants/legal.ts`) now points users to Settings → Delete Account.
- `npx tsc --noEmit` passes.
  **To go live:** deploy the `delete-account` Edge Function (dashboard "Via Editor"). Note the
  assigned slug — if not literally `delete-account`, update `DELETE_ACCOUNT_FN` in
  `lib/accountService.ts` (same `bright-processor` gotcha). No rebuild (JS-only client change),
  no migration, no new secrets.
  **On-device test:** Settings → Delete Account → confirm twice → returns to sign-in. DB check:
  the user's rows are gone from `public.users`/`profiles`/`chat_*`/`payment_orders`/
  `entitlements_ledger`/`reports`; `events` rows for that uid now have `user_id = null`; the
  `reports` Storage folder is empty; the phone can sign up fresh (new `auth.users` row).

### Not yet done (Phase 10 follow-ups)
- Legal copy is a template — have it reviewed and also **host it at a public URL** for the
  Play Store data-safety/listing fields.
- `track()` fires one row per event with no batching/offline queue — fine at launch volume.

---

## 20. Free Home features — Panchang + Numerology (CODE DONE; deploy pending)

Two NEW free features under the Home horoscope. **Both cost ₹0 at runtime — COMPUTED with
code/formulas and cached, NEVER generated by AI. No Claude/OpenAI call was added for either.**
See DECISIONS.md → "Free Home features" for the rationale.

**Feature 1 — Panchang** (daily Hindu almanac; generic, not personalised):
- Content: tithi, vaara, nakshatra, yoga, karana, sunrise, sunset, Rahu Kaal, and the day's
  auspicious (Abhijit) / inauspicious (Rahu Kaal, Yamaganda, Gulika) windows.
- **Computed in pure TypeScript** in the `panchang` Edge Function (Sun/Moon longitudes →
  five limbs; sunrise/sunset; muhurta part-tables). There is NO provider call (the mock
  kundliService has no Panchang endpoint) and NO AI.
- Cached in `panchang_cache` keyed by `(place_key, date_key)` — `place_key` = lat/lng rounded
  to 1 decimal (~11 km city grid), `date_key` = IST day. **Same cached row for the whole city
  per day.** Cache hit → instant; miss → compute + store (race-safe). City = profile birth-place.

**Feature 2 — Numerology** (from name + DOB; computed, not AI):
- Life Path (from DOB) + Expression/Destiny (from full name, Pythagorean map), master numbers
  11/22/33 preserved — all in `lib/numerology.ts` (pure math).
- Meanings are a **fixed pre-written static library** (`constants/numerology.ts`, entries for
  1–9/11/22/33) — never AI. **Fully client-side, no Edge Function.**
- Computed once per profile and cached on `profiles.numerology` (jsonb); text looked up from
  the static library at render.

**Home layout:** horoscope stays the hero; two compact tappable cards ("Today's Panchang",
"Your Numerology") sit under a "More for you" label below it → detail screens
`app/panchang.tsx` / `app/numerology.tsx`. Each detail screen ends with a gentle optional
hook into Chat.

**New files:** `supabase/migrations/010_panchang_numerology.sql`,
`supabase/functions/panchang/index.ts`, `lib/panchangService.ts`, `lib/numerology.ts`,
`lib/numerologyService.ts`, `constants/numerology.ts`, `app/panchang.tsx`, `app/numerology.tsx`.
**Changed:** `app/(tabs)/index.tsx` (cards), `lib/analytics.ts` (+`panchang_viewed`,
`numerology_viewed`, `home_hook_clicked`). `npx tsc --noEmit` passes.

### To go live
1. **Migration:** run `010_panchang_numerology.sql` in the SQL editor (creates `panchang_cache`,
   adds `profiles.numerology`).
2. **Deploy** the `panchang` Edge Function (dashboard "Via Editor"). Note the slug — if not
   literally `panchang`, update `PANCHANG_FUNCTION` in `lib/panchangService.ts` (same
   `bright-processor` gotcha). **No app rebuild** (JS-only client), **no new secrets**.
3. Numerology needs nothing deployed — it's pure client code + the migration's jsonb column.

### On-device test
- Home → below the horoscope, two cards appear. Panchang card shows tithi · nakshatra once
  loaded; Numerology shows "Life Path N · Expression M" instantly.
- Tap **Panchang** → full almanac + timings; tap **Ask the astrologer** → Chat tab.
- Tap **Numerology** → Life Path + Expression cards with pre-written meanings; hook → Chat.
- DB check: `select place_key, date_key from public.panchang_cache;` — one row per city/day;
  a second user in the same city adds NO row (cache hit). `select numerology from public.profiles;`
  is populated after first view. `select name, props from public.events where name like 'panchang%'
  or name like 'numerology%' or name = 'home_hook_clicked';`

### Not yet done (follow-ups)
- No cron pre-warm for Panchang (first viewer per city/day pays the ~ms compute; trivially cheap).
- Panchang uses profile birth-place as the city (no separate current-location capture in v1).
- Astronomy is low-precision (good to a few arc-minutes) — fine for a free daily almanac; a real
  ephemeris/provider could sharpen it later at the same cache boundary.

---

## 21. Free Home tool — Shubh Muhurat Finder (CODE DONE; deploy pending)

Finds upcoming auspicious dates/windows for a chosen activity. **COMPUTED from Panchang + a
fixed rule set and cached — NO Claude/OpenAI call was added.** See DECISIONS.md → "Shubh Muhurat
Finder".

**How it works:** the user picks one of 7 activities (Griha Pravesh, Marriage, Vehicle, Business,
Naming, Property, Travel). The `muhurat` Edge Function iterates each day in the range (default
today…+45), **computes that day's Panchang in pure code** (same astronomy as `panchang`), keeps a
day when its nakshatra + weekday are favourable for the activity and the tithi isn't Rikta/Amavasya,
and returns the matching dates with the day's Panchang factors + the Abhijit Muhurta window. Rules
live in `config/muhuratRules.ts` (single source of truth) and are mirrored inside the function.

**Home placement:** a "Shubh Muhurat Finder" card with the other secondary cards below the
horoscope hero → `app/muhurat.tsx` (activity picker → results). Results end with a gentle,
activity-aware funnel: Griha Pravesh/Property → Vastu report; Marriage → Matchmaking report;
others → Chat. Plus a "confirm with a priest/astrologer" disclaimer.

**New files:** `config/muhuratRules.ts`, `supabase/migrations/011_muhurat.sql`,
`supabase/functions/muhurat/index.ts`, `lib/muhuratService.ts`, `app/muhurat.tsx`.
**Changed:** `app/(tabs)/index.tsx` (card), `lib/analytics.ts` (+`muhurat_opened`,
`muhurat_activity_selected`, `muhurat_results_viewed`, `muhurat_funnel_clicked`). `tsc` passes.

### To go live
1. **Migration:** run `011_muhurat.sql` (creates `muhurat_cache`).
2. **Deploy** the `muhurat` Edge Function (dashboard "Via Editor"). If the slug isn't literally
   `muhurat`, update `MUHURAT_FUNCTION` in `lib/muhuratService.ts`. **No rebuild, no new secrets.**

### On-device test
- Home → **Shubh Muhurat Finder** → pick e.g. **Griha Pravesh** → a list of upcoming favourable
  dates with weekday, Abhijit window, and the nakshatra/tithi/yoga factors.
- Marriage → funnel shows the Matchmaking report link; Griha Pravesh/Property → Vastu; others → Chat.
- DB: `select activity, place_key, range_key, count(*) from public.muhurat_cache group by 1,2,3;`
  — one row per activity/city/range; a repeat lookup is a cache hit.
  `select name, props from public.events where name like 'muhurat%';`

### Not yet done (follow-ups)
- v1 returns favourable DATES + the Abhijit window, not full choghadiya/per-activity time slots.
- Custom date-range/city picker not surfaced in the UI yet (service accepts them; default is
  today…+45 near the profile's city).
- Rules are a reasonable traditional baseline — a jyotishi could refine the nakshatra/weekday sets.

---

## 22. Free Home tool — Live Darshan (CODE DONE; JS-only, no deploy)

A curated directory of live temple darshan streams. **v1 links OUT to each temple's OFFICIAL
YouTube live page — nothing is embedded, hosted, downloaded or re-streamed, so it costs us ₹0
(YouTube bears streaming) and carries no content-licensing risk. No AI/LLM.**

- `config/temples.ts` — single source of truth; 8 temples (Tirupati, Vaishno Devi, Shirdi,
  Kashi Vishwanath, Mahakaleshwar, Somnath, Siddhivinayak, Golden Temple). Each: name, location,
  deity, icon, timings, official `streamUrl` (`/live`), `source:'youtube'|'website'`,
  `mode:'link'|'embed'`, `verified`.
- `app/darshan.tsx` — temple cards; "Watch Live Darshan ↗" → `Linking.openURL` to the official
  source (external YouTube app/browser). Visible legal disclaimer at the bottom.
- Home: a "Live Darshan" (🛕) secondary card below the horoscope hero → `/darshan`.
- `lib/analytics.ts` — +`darshan_opened`, +`darshan_temple_clicked {temple}`.
- No migration, no Edge Function, no secrets, **no rebuild** — pure JS/config. `tsc` passes.

### Channel URLs — VERIFIED against official sources (2026-07-04)
All 8 `streamUrl`s were verified against each temple board's own channel/site and marked
`verified: true` (initial guessed handles were corrected: SMVDSB `@Official.SMVDSB`, Shirdi
`@saibabasansthantrust`, Kashi `@ShreeKashiVishwanathMandir`, Somnath
`@SomnathTempleOfficialChannel`, Siddhivinayak channel `UCNH47…`, Tirupati SVBC channel
`UCTboTRX74…`, Golden Temple `@SGPCSriAmritsar`). **Mahakaleshwar has no official YouTube
channel** → links to its official MP-Gov live-darshan page (`source:'website'`). Re-check
periodically (handles/streams can change); never point at fan re-uploads/aggregators (CRITICAL
RULE in `config/temples.ts`).

### On-device test
- Home → **Live Darshan** → list of temples with timings → **Watch Live Darshan** opens the
  temple's YouTube channel in the YouTube app/browser.
- `select name, props from public.events where name like 'darshan%';` after tapping.

### Upgrade path (v2 — do NOT build yet)
Each temple has `mode` reserved. After a temple grants WRITTEN permission, flip its `mode` to
`'embed'` to render the official YouTube IFrame player in-app for that temple only.
