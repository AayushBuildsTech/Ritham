# Ritham — Build Progress & Handoff Document

> **For Claude:** Read this entire file before doing anything. It is the single source of truth for what has been built, what decisions were made, and what to do next.

---

## 0. Latest Session (2026-07-13, evening) — NEW "Past Life Predictions" report + fixed report purchases (all types)

Added a new premium report **Past Life Predictions** (`type: 'pastlife'`, ₹149) in a new **"Karmic &
Spiritual"** section on the Reports tab. It reuses the existing single-person chart pipeline (same as
career/love/health): `/report-chart` intake → `/report-view` viewer → `computeChartFacts` →
`narrateChart` (Claude) → `renderChartHtml`. **All server changes deployed via CLI** to project
`eaxdqizerkuqkujxacru`; **verified on device** (card renders, Razorpay opens, report generates & renders).

**🔴 Root cause found — report PURCHASES were broken for EVERY report type (not just pastlife):**
Migration `020_voice_calls.sql` rebuilt `entitlements_ledger_kind_check` as `('questions','time','call')`
— accidentally **dropping `'report'`** that `008` had added. Flow reached: order created → Razorpay paid →
then `verify-payment`'s entitlement INSERT (`kind='report'`) hit a **check-constraint violation** →
`grant_failed` (500) → the app showed **"Payment not completed."** Diagnosed from device logs
(`[PAYDBG]` markers: order created ✓ → checkout success ✓ → verify-payment failed). Fixed in **`022`**
(re-adds `'report'` + `'call'`, and **reconciles** any already-paid-but-ungranted report orders so the
user isn't charged twice). **Lesson: when a later migration re-CREATEs a CHECK constraint, it must
re-list ALL previously-allowed values — dropping one silently breaks that path.**

**What was needed to make `pastlife` work end-to-end (each was a real, separate blocker):**
1. `config/pricing.ts` — price (₹14900), added to `CHART_REPORT_TYPES`, new `'karmic'` `ReportGroup`,
   `REPORT_META` card, `REPORT_GROUPS` header.
2. `lib/reportService.ts` — added `pastlife` to its own hardcoded `ChartReportType` union (TS caught this).
3. `app/report-chart.tsx` — `SCOPE.pastlife` bullets + a "reflective, not literal" disclaimer.
4. `lib/i18n.ts` — **`reports.group.karmic` + `report.pastlife.title`** in EN & HI. The Reports tab renders
   titles/group headers via `t()`, so without these it showed raw keys (`report.pastlife.title`). Card
   *description* comes from `REPORT_META.desc` directly (no i18n key).
5. `supabase/functions/report/index.ts` — `pastlife` in `ChartReportType`/`CHART_TYPES`, `CHART_META`
   (focus houses `[5,9,12,8,4]`), `buildSystem.per`, and a `mockChart` branch (else it fell through to the
   `education` mock).
6. `supabase/functions/create-order/index.ts` — added `pastlife` to its **server-side price mirror**
   (intentionally duplicated; without it checkout returns `unknown_plan`).
7. Migration **`021`** — widened `reports_type_check` to include `'pastlife'` (else the report-row INSERT fails).

**Made the reading actually about the PAST LIFE (user feedback: first output read like generic chart notes):**
- Rewrote `buildSystem.per.pastlife` into an immersive, second-person **story of who you were** —
  reads **Ketu sign** (former role: warrior/healer/monk/ruler/trader…), **Ketu house** (the arena that
  life revolved around), **8th/12th** (how it ended), **Saturn/retrogrades** (karma carried), **Rahu**
  (this life's growth direction). Sections: *Who You Were · The Life You Lived · The Karma You Carried
  In · Echoes in This Life · Your Soul's Direction Now.*
- Rewrote the `mockChart` pastlife branch to tell the same specific story deterministically, using new
  archetype maps `PAST_SIGN_ROLE` / `PAST_HOUSE_ARENA` / `RAHU_DIRECTION`.
- **Raised `pastlife` max_tokens 8000 → 12000** (`narrateChart`). The first real paid generation had
  fallen back to the mock because the richer JSON truncated at 8k → unparseable → mock. A throwaway
  `claude-diag` fn confirmed the deployed key + `claude-sonnet-5` work (HTTP 200); it was truncation, not
  a key/model problem. (Diag fn deleted after use.)
- Migration **`023`** — one-time **goodwill credit**: grants a complimentary unconsumed `pastlife` credit
  to anyone who already paid for one (data-driven, idempotent), so the user regenerates the improved
  version free.

**Deploys this session:** `create-order`, `report` (edge fns, CLI); migrations `021`, `022`, `023`
(`supabase db push --linked`). **Still user-side:** unlock phone → Reports → Karmic & Spiritual → Past
Life Predictions → Create report → Continue (uses the free credit, no charge) to get the new reading.

**Device automation gotchas (adb over Wi-Fi, `192.168.1.14:5555`):** dev client couldn't reach Metro at
the guessed LAN IP → used `adb reverse tcp:8081 tcp:8081` + relaunch at `localhost:8081`. Screen kept
sleeping/locking (black screencaps, `mCurrentFocus=NotificationShade` = lockscreen) — can't unlock
without the PIN, so final regeneration is left to the user.

---

## Prior Session (2026-07-13, later) — VOICE CALL made natural in Hindi + reliability fixes

Overhauled the AI **voice call** so it sounds like a real Hindi jyotishi and stops misbehaving.
All fixes are server-side (`voice-token` + `voice-llm`), **deployed via CLI** to project
`eaxdqizerkuqkujxacru` — no app rebuild needed (client `call.tsx` change ships in the JS bundle).
**Verified working on device end-to-end.**

**Root causes found (from the actual Vapi/LLM logs, not guesses):**
1. **"Foreign robot that doesn't know Hindi"** = the brain replied in **romanized** Hindi, and
   ElevenLabs pronounces from the SCRIPT → Latin letters got an English accent. Fix: voice mode now
   replies in **Devanagari** (see `modeDirective('voice')` in `_shared/brain.ts`), which the ElevenLabs
   multilingual voice speaks as natural Hindi. Spoken greeting (`FIRST_MESSAGE`) is Devanagari too.
2. **Stops mid-sentence** = replies were **2 paragraphs / 32 s**, so Vapi aborted them
   (`LLM request aborted before completion`). Fix: a **hard 2–3 sentence rule** + **`VOICE_MAX_TOKENS`
   4096 → 512** so a reply physically can't balloon into an essay.
3. **Random gibberish** = ElevenLabs **babbles on the em-dash `—`** (Claude's text was clean; the TTS
   mangled the punctuation). Fix: voice directive bans dashes/hyphens/quotes/brackets/ellipses/symbols —
   **plain punctuation only** (danda, comma, `?`); join compound words (`बातचीत`, not `बात-चीत`).
4. **🔴 "Call could not start" (Vapi 400)** = `stopSpeakingPlan.voiceSeconds` was set to **1.0**, but
   **Vapi caps it at 0.5** → the whole `POST /call/web` was rejected. Fix: `voiceSeconds: 0.5`.
   **Gotcha for future edits: every override value must be in Vapi's allowed range or the call 400s.**
   (`backgroundDenoisingEnabled` was also removed — the current Vapi API doesn't accept it.)

**Other call improvements this session (all in `voice-token` assistantOverrides / brain):**
- **Voice** changed to ElevenLabs `dVTC43Yewy5fAIcmsISI` (was `zMndFmtlJvAIQjxXWZTU`; supersedes §"Prior
  2026-07-11" note). Pinned **studio-quality settings** so the live call matches the ElevenLabs preview
  (it sounded "exhausted"/breathy on Vapi defaults): `stability 0.6`, `similarityBoost 0.85`, `style 0`,
  `useSpeakerBoost true`, `optimizeStreamingLatency 0`.
- **Transcriber** pinned to **Deepgram `nova-2` `hi`** (env-tunable via `VOICE_STT_MODEL` /
  `VOICE_STT_LANGUAGE`) so the caller's Hindi is understood. Verified it captures Hinglish fine
  ("job करूं या business") — STT was never the problem.
- **Faster turn-taking**: `startSpeakingPlan.transcriptionEndpointingPlan`
  (`onNoPunctuationSeconds 1.0`, `onPunctuation 0.3`, `onNumber 0.4`) + `waitSeconds 0.4` — she no
  longer "keeps listening" ~1.5 s after the caller stops (Deepgram rarely punctuates Hindi).
- **Graceful close**: `voice-llm` computes remaining time from `call_sessions.started_at` +
  `allowance_seconds`; when ≤ **15 s** left it folds a wrap-up directive into the system prompt so the
  reply becomes a warm goodbye instead of getting cut by the hard `maxDurationSeconds` cap.
- **Intro-first UI** (`app/(tabs)/call.tsx`): shows "ज्योतिषी नमस्ते कह रही हैं…" until her first
  `speaking` event (was "Listening…", which looked like it was waiting for the user).

**Free 60 s call verified.** It's fully independent of the free CHAT minute: chat uses
`device_free_trials` + `users.free_minute_used_at`; call uses `device_free_call_trials` +
`users.free_call_used_at`. So onboarding / using the free chat minute never consumes the free call;
a fresh user+device gets their 60 s, with correct rollback on a failed start (the `release` path).

**Deploy state:** `voice-token` + `voice-llm` deployed via CLI (`npx supabase functions deploy <fn>
--project-ref eaxdqizerkuqkujxacru`). `voice-llm` is regenerated by `scripts/inline-functions.mjs`
after editing `_shared/brain.ts` (it inlines brain). Client `call.tsx` ships in the JS bundle.
**Tuning knobs if needed:** replies too short → raise `VOICE_MAX_TOKENS`; too flat/monotone → lower
`voice.stability`; heavy Hinglish → set `VOICE_STT_LANGUAGE=multi` (+ `VOICE_STT_MODEL=nova-3`) secret.

**Follow-up on-device debugging (same session) — verified working end-to-end.** Ran the dev build on
device (wireless ADB) reading live `[call]` client logs from Metro to diagnose from real traces, not
guesses. Fixes, in order found:
1. **🔴 "Call could not start" = Vapi 400.** `stopSpeakingPlan.voiceSeconds` was `1.0`; **Vapi caps it
   at 0.5** → the whole `POST /call/web` was rejected. Set `0.5`. Also removed `backgroundDenoisingEnabled`
   (current Vapi API rejects the field). GOTCHA: any out-of-range override value 400s the entire call.
2. **Stops mid-sentence = truncation, NOT echo.** The trace showed NO user transcript at the cut — she was
   giving 6–7 sentence / ~20s answers that hit the token cap and truncated mid-word. `VOICE_MAX_TOKENS`
   512 was too tight for token-heavy Devanagari (cut a normal reply); raised to **1024**, and — the real
   fix — appended a hard **`VOICE_BREVITY_TAIL`** as the LAST line of the system prompt (highest recency)
   forcing 1–2 sentence answers, because the verbose chat-brain body was overriding the earlier rule.
3. **No reply after the user speaks = Supabase cold start.** First call after each redeploy timed out
   (function boots slowly); second (warm) call answered in ~2s. Fix: **`voice-token` fires a fire-and-forget
   `{"warmup":true}` POST to `voice-llm`** the moment a call is authorized, so the isolate is warm before
   the first question (~10s later, after the greeting). `voice-llm` returns early on `warmup`.
4. **Reply generated but never spoken (silence) = the token STREAM dying mid-reply.** Switched `voice-llm`
   off token-by-token streaming: it now fetches the whole short reply in ONE shot and emits it as a single
   SSE chunk via `streamText`, with a **guaranteed spoken FALLBACK** ("एक पल, ज़रा दोबारा बताइए…") so a
   Claude/network hiccup can never leave the caller in dead silence. (`bridgeStream`/`openaiCompletion` are
   now unused but left in place.)

Note: some test flakiness was the **wireless-ADB Wi-Fi** dropping the WebRTC call (`recv transport changed
to disconnected`, `Meeting ended due to ejection`) — environmental, not the app. The temporary `[call]`
transcript/speech diagnostic logging added to `lib/callService.ts` during this was **removed** before commit.

---

## Prior Session (2026-07-13, earlier) — BILINGUAL (English / हिन्दी) — app-wide language switch

Added a full **English / Hindi** language system. A language chooser now appears **before Google
login** on first launch, and it's changeable anytime in **Settings**. Pick English → app as usual.
Pick हिन्दी → the whole UI renders in Hindi (Devanagari), horoscopes generate in Hindi, and paid
reports are narrated in Hindi. Chat is intentionally **unchanged** — it already auto-detects the
user's script and mirrors it (English → English, Hinglish → Hinglish, Devanagari → Devanagari).

**Client `npx tsc --noEmit` = 0 errors.** Nothing deployed yet — see "Deploy needed" below.

**Architecture (mirrors ThemeContext — client is the source of truth, works pre-login):**
- `context/LanguageContext.tsx` — `LanguageProvider` + `useLanguage()` + `useT()`. Persists `lang`
  ('en'|'hi') and a `chosen` flag to AsyncStorage (keys `ritham.lang`, `ritham.langChosen`). No DB
  column — the language rides in the request body to the functions that need it.
- `lib/i18n.ts` — the bilingual string table (`translate(lang, key, vars)`), missing-key/hi falls
  back to English then to the key. `{var}` interpolation.
- `app/language.tsx` — pre-login chooser (bilingual copy, radio cards). On continue → `setLang` →
  `router.replace('/(auth)')`.
- `app/_layout.tsx` — `LanguageProvider` wraps the tree (inside `ThemeProvider`); `RootLayoutInner`
  also gates the splash on `langReady`. **AuthGate** now: if `!chosen` → force `/language` before
  anything (even sign-in); else the usual auth routing. NOTE: `app/language.tsx` is a new route, so
  two spots cast to satisfy the (stale) generated router types until Expo regenerates them on next run.

**UI translated (via `useT()` / inline `isHindi ?`): ALL screens.** Tab bar, **Home**, **Chat**,
**Call**, **Reports** tab, **Store**, **Settings** (+ language toggle), **Sign-in**, **Language**
chooser, **Paywall** (shared), **Horoscope**, **Panchang**, **Muhurat**, **Numerology**,
**Retrograde**, **Sade Sati**, **Profile / Kundli form + Kundli view**, **Family**,
**Onboarding-family**, **Darshan**, **Chat history**, **Chat conversation**, **Report view**. Every
string falls back to English if a key is missing, so nothing can break. `npx tsc --noEmit` = 0 errors.

**Astrological CONTENT now translated too (2026-07-13, later):** `lib/astroHindi.ts` maps the
computed/VedAstro tokens (rashi, graha, nakshatra, dignity, condition flags, weekday, house ordinals)
to Devanagari at render time — the stored chart stays English + shared, we translate on display. The
**entire Kundli view** now renders in Hindi (KeyCards, lagna-lord line, planetary-positions +
house-lords + D9/D10 tables, Vimshottari dasha, chart legend, varga tab labels, share text, and the
"chart at a glance" life-area cards via `buildLifeAreasHi`). Config prose got Hindi variants:
`sadeSatiPhases.ts` (`*_HI`), `retrogradeMeanings.ts` (`*_HI`), `constants/numerology.ts`
(`NUMEROLOGY_MEANINGS_HI` / `meaningForHi`), `config/temples.ts` (`TEMPLE_HI`), plus Panchang
nakshatra/weekday and Muhurat nakshatra.

**Only remaining English (documented boundary):** the **yoga/dosha NAME + DETAIL prose** on the Kundli
view — that text is authored per-chart by VedAstro/the engine and stored English in `kundli_chart`, so
it can't be map-translated (same category as chat/report AI text). Yoga *names* are mostly Sanskrit
proper nouns anyway. Panchang **tithi/yoga/karana** values stay as their Sanskrit transliterations
(they are the Sanskrit terms). Everything else the user reads is Devanagari. `tsc` = 0 errors.

**Backend — Hindi generation (the client passes `lang`):**
- `supabase/functions/horoscope/index.ts` — reads `lang` from the body; **folds language into the
  cache `period_key`** (`…:hi` suffix) so Hindi & English cache as separate rows with NO migration
  (English keeps the bare key → old rows still hit). Hindi prompt directive + Hindi mock + higher
  `max_tokens` (1100) for Devanagari. `lib/horoscopeService.getHoroscope(profileId, period, lang)`.
- `supabase/functions/report/index.ts` — reads `lang`; a shared `HINDI_REPORT_DIRECTIVE` is appended
  to all three AI generators (`generateVastuLive`, `generateMatchLive`, `narrateChart`/`buildSystem`)
  so every human-readable JSON string value is Devanagari while the JSON contract + computed facts
  stay English. Raised `max_tokens` for Hindi. `lib/reportService` generate* now take `lang`; the 3
  report intake screens pass the active `lang`. (Fixed HTML chrome labels — cover boilerplate,
  disclaimers — are still English; the AI-authored prose/headings are Hindi. A follow-up can translate
  the render scaffolding.)
- Chat: **no change** (requirement) — Devanagari-in → Devanagari-out already works (`chat/index.ts`
  language rule).

**⚠️ Deploy needed (nothing shipped this session):** redeploy the **`horoscope`** and **`report`**
Edge Functions via CLI (`npx supabase functions deploy horoscope --project-ref eaxdqizerkuqkujxacru`
and same for `report`). Both are single-file (engines inlined) so no `_shared` regen. The client
changes ship in the JS bundle (no native rebuild — no new native modules). New analytics events
`language_selected` / `language_changed` added to `lib/analytics.ts`.

---

## Prior Session (2026-07-11) — AI VOICE CALLING shipped & working end-to-end on device

Added a **"Call" tab**: users tap and have a real spoken one-on-one with the same AI Jyotishi
as chat — same brain, same Kundli, in native Hindi. Verified live on device: connects, greets,
answers with the real chart, meters minutes, ends cleanly.

**Architecture (pay-as-you-go, ₹0 fixed/month).** In-app WebRTC via **Vapi** (orchestrator, no
monthly base) → Deepgram STT → **our Claude brain** (BYO custom-LLM) → **ElevenLabs Indian voice**.
- `supabase/functions/_shared/brain.ts` — the astrologer prompt extracted **verbatim from chat**
  (single source), with a new `modeDirective('voice')`: spoken, conversational, precise (answer
  first + one line on dasha/yoga), 2–3 sentences, feminine forms. Inlined into `voice-llm` via
  `scripts/inline-functions.mjs` (chat keeps its own identical copy — a later cleanup can point
  chat at brain.ts too).
- `supabase/functions/voice-llm/` — OpenAI-compatible **streaming** `/chat/completions` Vapi calls
  each turn. Reuses `buildSystemPrompt` + Kundli, streams `claude-sonnet-5`, `max_tokens 4096`.
  **Deployed with `--no-verify-jwt`** (Vapi has no Supabase JWT; auth is our signed token).
- `supabase/functions/voice-token/` — app calls it (JWT-gated) to authorize a call: checks paid
  `call` seconds or the free 60s, creates a `call_sessions` row, mints an **HMAC-signed token**,
  returns the Vapi start config (assistantOverrides: token-scoped model URL, `maxDurationSeconds`,
  Indian voice, anti-barge-in `stopSpeakingPlan`, female first-message). Has a `release` refund path.
- `supabase/functions/voice-webhook/` (`--no-verify-jwt`) — meters actual seconds on the terminal
  `end-of-call-report` and decrements the ledger.
- Migration `020_voice_calls.sql` — `call_sessions`, `call_messages`, `'call'` entitlement kind
  (+ `seconds_used`), `users.free_call_used_at`, `device_free_call_trials`, RLS.
- Billing reuses Razorpay: `CALL_PACKS` in `config/pricing.ts` + `create-order`/`verify-payment`;
  `getBalance` gains `callSeconds`.
- Client: `app/(tabs)/call.tsx` (pre-call / live / ended, pricing up front), `components/CallOrb.tsx`
  (reanimated "living orb"), `lib/callService.ts` (Vapi SDK wrapper, refund-on-failure), Paywall
  `variant="call"`, 5th tab in `app/(tabs)/_layout.tsx`, mic perms in `app.json`.

**Native build (Expo dev build, `expo run:android`).** `@vapi-ai/react-native` pulls Daily/WebRTC.
Fixes captured as **patch-package** patches (`patches/`) + a config plugin (`plugins/withDailyWebrtcFix.js`)
so they survive reinstall:
- New-Arch TurboModule parse error in `@daily-co/react-native-webrtc` `WebRTCModule` → made the one
  sync+void `@ReactMethod` (`transceiverSetCodecPreferences`) async; stubbed `UVCCamera2Enumerator.isSupported→false`.
- `@daily-co/react-native-webrtc` pulls `AndroidUSBCamera:libausbc` whose siblings (libuvc/libnative/…)
  fail to build on JitPack → JitPack repo added (`expo-build-properties`) + exclude the broken
  siblings (config plugin); UVC is audio-call-irrelevant.
- `@daily-co/react-native-daily-js` did `{...NativeModules.X}` (spread) which drops methods under the
  New Architecture → patched to reference `setKeepDeviceAwake`/`setShowOngoingMeetingNotification` explicitly.
- `react-native-get-random-values` imported first in `app/_layout.tsx` (crypto polyfill).

**Vapi-contract gotchas fixed (important for future edits):**
1. Model override needs the **full** object: `{provider:'custom-llm', model:'ritham', url}` — url-only → 400.
2. Vapi appends `/chat/completions` to the model url → **pass the token as a PATH segment**
   (`/voice-llm/<token>`), not `?t=` (query gets corrupted). `voice-llm` reads the token from the path.
3. `voice-webhook` must act **only** on `end-of-call-report` — acting on mid-call `status-update`
   events was marking the session ended, causing the next LLM turn to 409 `call_ended` → ejection.

**Secrets set (CLI):** `VOICE_TOKEN_SECRET`, `VOICE_LLM_URL`, `VAPI_PUBLIC_KEY`, `VAPI_ASSISTANT_ID`
(+ existing `ANTHROPIC_API_KEY`). **Vapi assistant:** Custom LLM → voice-llm, Deepgram, ElevenLabs,
Server URL → voice-webhook. **Voice:** ElevenLabs Indian **female** voice `zMndFmtlJvAIQjxXWZTU`
(`eleven_multilingual_v2`); persona/greeting/Hindi made feminine.

**TODO / cleanup (next session):** remove the temporary `[call]` (callService) and `[voice-llm]`
console.logs; set `VAPI_WEBHOOK_SECRET` + its Vapi Server-URL secret (skipped for speed — webhook is
currently open); finalise pack names/prices; the migration/entitlement path is deployed but the
`020` migration + a paid-call purchase flow still want a full end-to-end Razorpay test.

`npx tsc --noEmit` = 0 errors. All voice functions deployed via CLI.

---

## Prior Session (2026-07-09) — Chat fixes, trackers, UI polish, report resilience, pre-launch + security/legal audit

**1. Chat now truly reads the dasha (deploy bug fixed).** Users saw the astrologer say "consult a trusted jyotishi" for their dasha. Root cause was NOT missing data — the VedAstro rich chart (incl. full dasha) was stored fine (verified live: `engine_version 3`, 12 dasha periods, current Mahadasha Rahu). The real issues: (a) a **prompt loophole** — Rule #1 forbade *asking for data* but not *deflecting to a human astrologer*; (b) the earlier manual deploy went to the **orphaned `bright-processor`** function, not `chat` (the app calls slug `chat`). Fixes in `supabase/functions/chat/index.ts`, redeployed via CLI to `chat`:
- Hardened Rule #1: explicitly bans "consult/see another jyotishi/pandit/astrologer" deflections; reasserts "YOU ARE THIS PERSON'S JYOTISHI, the dasha is in front of you."
- Injected the **full Vimshottari mahadasha life-sequence** (every period + dates), not just current + next two.
- Added a temporary owner-only `debugPrompt` branch (returns the exact built system prompt; **remove before public release**).
- **Simple-language rule (tier-2/3 friendly):** in Hindi/mixed-Hindi replies, never use hard English/jargon (combust, retrograde, debilitated, exalted, conjunction, transit…); convert to plain Hindi (e.g. combust → "Surya ke kareeb hone se kamzor", retrograde → "vakri"). Those English terms are allowed only when the user writes in English.
- Deleted the orphaned `bright-processor` function.

**2. Two FREE Home trackers — Retrograde (Vakri) + Sade Sati.** Zero AI, zero VedAstro/provider calls. Computed **client-side** from a ported ephemeris (`lib/ephemeris.ts`, same Schlyter+Lahiri math as `_shared/astro.ts`) via `lib/transitsService.ts`, **day-cached in AsyncStorage**, routed through `kundliService` (`getRetrograde`, `getSadeSati`). Static copy in `config/retrogradeMeanings.ts` + `config/sadeSatiPhases.ts`. Retrograde shows current/upcoming + personalized house (from stored Lagna). Sade Sati shows a calm 3-phase visual timeline (`components/SadeSatiTimeline.tsx`, gold marker, non-alarmist tone). Screens `app/retrograde.tsx`, `app/sadesati.tsx`; two `FeatureRow`s on Home. Analytics: `retrograde_tracker_viewed`, `sadesati_tracker_viewed`, `retrograde_chat_hook_clicked`, `sadesati_chat_hook_clicked`. **Chose client compute over the spec's `retrograde_cache` table + cron** — cheaper, no infra/deploy; server-side path noted in DECISIONS.md as v2.

**3. UI polish (client-only, no deploy).**
- Hid all provider/engine details ("Computed by VedAstro · Swiss Ephemeris", "Refresh with VedAstro", and the "(VedAstro / Lahiri, Swiss Ephemeris)" parenthetical in the Chart Summary — stripped at render so cached charts are covered).
- Home header: replaced the moon icon beside Settings with a labeled **"My Kundli"** button; fixed the name truncating ("Aa…") by dropping it 40→32px with `adjustsFontSizeToFit`.
- Kundli view: renamed the refresh button to **"Generate detailed Kundli"**.

**4. Reports fixed — "We couldn't finish this report" (report fn hardened, redeployed).** After the go-live, `ANTHROPIC_API_KEY` **is set** (since 2026-07-07 — confirmed via `supabase secrets list`), so `report` now makes **real Claude calls**, not mock. Chat (same call shape) works; reports failed because `report` parses Claude's reply as **strict JSON**, and a reply that is truncated at `max_tokens` (the `life` report asks for a huge JSON on only 8000 tokens), refused, or any non-200 made `parseJsonReply` throw → the whole report was marked `failed` (the report-view "We couldn't finish this report" screen). Root fix in `supabase/functions/report/index.ts` (self-contained single file; CLI-redeployed to `report`):
- **Reports never hard-fail.** All three generators (`narrateChart`, `generateVastu`, `generateMatch`) now wrap the live Claude call in try/catch and **fall back to the deterministic, type-specific mock narration** on ANY failure — non-200, `stop_reason:"refusal"`, truncated/invalid JSON, empty reply, or timeout. The computed chart facts (houses, dashas, yogas, Guna Milan) are the substance; the narration is a wrapper, so a report always completes. Verified all 4 failure modes × 5 chart types produce a full report with no throws.
- **Raised token budgets** to stop legit truncation: `life` 8000→16000, focused reports 5000→8000, so the real narration usually succeeds outright.
- Each fallback logs its cause (`... using mock ... Claude API <status>`) to the function logs, so if reports come back as "Preview report…" mock text the real reason (e.g. a 401 from a bad key) is visible in **Supabase → Edge Functions → `report` → Logs**.
- Also fixed 3 latent TypeScript errors in the same file (definite-assignment on `insertRow`; two `number|null` `ordinal()` args) so a type-checked dashboard deploy can't be blocked.

**5. Pre-launch connectivity audit — everything is wired, plus one security cleanup.** Full sweep as we head to final stage:
- **Edge functions:** all 9 slugs the client calls (`chat`, `horoscope`, `kundli`, `muhurat`, `panchang`, `report`, `create-order`, `verify-payment`, `delete-account`) are DEPLOYED and match the client's slug constants — **no orphans** (the old `bright-processor` is gone). `report` is live at v14 (the resilience fix), `chat` at v7 (this session).
- **Type safety:** client `npx tsc --noEmit` = **0 errors** (so every screen↔service import is type-valid); all 9 edge functions type-check clean (only the expected `Deno`/esm.sh globals). `muhurat` is the one function still importing `_shared/astro.ts` — fine, it's CLI-deployed (bundler resolves it; not a dashboard paste).
- **Navigation:** every `router.push/replace` pathname, `Link href`, and `REPORT_META.route` resolves to a real screen under `app/` — no dead links.
- **Flows reviewed & sound:** Home (8 free features route with `profileId` + load via services), Chat (free-minute → paywall on `needs_purchase`/`out_of_questions`/`expired`, all returned as 200 so they survive Supabase's `invoke` wrapper; countdown; balance pills), Store (intentional "Coming Soon" placeholder), Reports (fill→pay→generate→poll), Payments (create-order prices mirror `config/pricing.ts`; verify-payment HMAC + idempotent grant; report/chat consume correctly).
- **Security cleanup:** removed the temporary `debugPrompt` branch from `chat/index.ts` (it returned the EXACT internal system prompt to any authenticated caller — prompt-IP leak + injection aid; flagged "remove before public release"). No client caller existed. `chat` redeployed.

`npx tsc --noEmit` passes (0 errors). `chat` (twice — dasha fix + debugPrompt removal) and `report` were redeployed via CLI this session; everything else is JS-only client change. **Verdict: all features connected and working; no broken wiring found.**

**6. Security + legal/compliance audit — one real data leak fixed, plus hardening & DPDP updates.** Full sweep for launch:
- **Data isolation (verified good):** client bundle carries ONLY the anon key (no service_role/secrets — grep-confirmed). All 12 tables have RLS enabled; `profiles`/`users`/`chat_*`/`payment_orders`/`entitlements_ledger`/`reports` are owner-scoped (users can only see their own rows). All 9 Edge Functions are JWT-gated at the gateway (`verify_jwt:true`) and use the authenticated `user.id` — **none trust a client-supplied `user_id`**; service-role key is server-only. Payments recompute the amount server-side + HMAC-verify + idempotent grant. Floor-plan uploads are user-scoped in Storage (path check + RLS). `delete-account` deletes only the caller (cascades all app data, anonymises analytics) — satisfies in-app right-to-erasure.
- **🔴 Real fix — cross-user horoscope leak:** migration 007 shipped `horoscopes` as a SHARED cache with `for select to authenticated using (true)`; migration 016 then made horoscopes **per-profile & transit-aware** (body can reference that person's dasha) but left the open read policy. Any logged-in user could `select` the whole table and read others' personalised readings + their `profile_id`s. The `horoscope` fn uses the service role (bypasses RLS) and the app never reads the table directly, so **migration `017` replaces the open policy with an owner-scoped one** (`profile_id in (select id from profiles where user_id = auth.uid())`) — closes the leak, breaks nothing.
- **Hardening:** `017` also drops the unused client `insert`/`update` policies on `reports` (server writes via service role; a client could otherwise fabricate its own report rows — self-only, but unnecessary surface). `panchang_cache`/`muhurat_cache` intentionally stay open-read (genuinely shared, no PII).
- **Legal / DPDP Act 2023 + IT Rules 2021 (`constants/legal.ts`):** added a **"Your rights"** section (access / correction / erasure / withdraw consent), a **"Grievance redressal"** section (Grievance Officer contact + 24h ack / 15-day resolution) — ⚠️ replace `GRIEVANCE_OFFICER` placeholder with a real name before public launch — and a **cross-border processing** consent note (AI processes data outside India). Consent is already captured at sign-in ("By continuing you agree to Terms/Privacy" links); disclaimers already surfaced on Home, Chat, and in report PDFs. Legal docs render data-driven from `LEGAL`, so new sections appear automatically.

**To apply:** run migration **`017_security_hardening.sql`** in the SQL Editor (no app rebuild, no fn redeploy). The `legal.ts` change ships in the JS bundle. `npx tsc --noEmit` passes (0 errors). **Verdict: no data breach/leak vector remains after 017; data is owner-isolated, encrypted at rest (Supabase) + TLS in transit; legal is India-appropriate pending the Grievance Officer name + a professional review.**

---

## 0.1 Session (2026-07-07) — GO-LIVE: real Kundli, live AI, everything deployed

This session took the app from "mock charts + mock AI, deploy-pending" to a fully live backend. **All 9 Edge Functions are deployed via the Supabase CLI, all migrations are applied + tracked, and every secret is set — the app now runs on real astronomy and real Claude.**

**1. Real Kundli engine (the big fix).** The old `kundliService` returned a **fake chart** — it seeded a PRNG from a hash of the birth details and randomly picked signs/nakshatra/houses (`source: 'mock'`). Replaced with a real Vedic sidereal engine:
- **`supabase/functions/kundli/astro.ts`** — dependency-free astronomy (Schlyter/Meeus): real geocentric longitudes for Sun, Moon, 5 planets + Rahu/Ketu (with Moon + Jupiter/Saturn perturbation terms), **Lahiri ayanamsa** (Indian govt standard), **whole-sign houses**. Runs identically in Node and Deno. Open-source, free, no API key, no per-chart cost.
- **`supabase/functions/kundli/index.ts`** — the Edge Function: local birth time → UTC via IANA timezone (DST-aware), computes the chart, returns the same shape the app already used. Auth-gated.
- **`supabase/functions/kundli/astro.test.ts`** — validation harness (dev-only, NOT bundled). Run: `node --experimental-strip-types astro.test.ts`. **All checks pass**: Sankranti ingress dates exact (Makar Jan 15 / Mesha Apr 14 / Karka Jul 16 for 2024), ascendant cycles all 12 signs/day, Rahu-Ketu 180° apart, ayanamsa 24.13° (2020). Deployed function verified end-to-end.
- **`lib/kundliService.ts`** — mock deleted; `fetchKundliFromProvider` now calls the `kundli` function. `source: 'lahiri'`. **`getKundli` self-heals**: any legacy `source:'mock'` chart is transparently recomputed with the real engine on next view.
- **Panchang & Muhurat unified on the SAME engine (later 2026-07-07):** `astro.ts` moved to **`supabase/functions/_shared/astro.ts`** (shared across functions). `panchang` and `muhurat` now derive Sun/Moon + an accurate sunrise/sunset from it (validated to ±1 min at Delhi solstices) instead of their old lower-precision math + a slightly different ayanamsa — so a user's Panchang/Muhurat nakshatra now agrees with their Kundli. All three functions redeployed. (The `mock*` fallbacks in `report`/`horoscope` are inert — only used if `ANTHROPIC_API_KEY` is unset, which it isn't.)

**2. Chat quality (the user's complaints).** In `supabase/functions/chat/index.ts`:
- Replies were essay-length ("2–5 paragraphs" prompt) → now **2–4 sentences, no headings/lists/preamble**; `max_tokens` 1024 → 512. Shorter output also cuts latency (thinking already disabled).
- Hindi replies used too much English → now **majority-Hindi** when the user writes Hindi (Devanagari or Hinglish), English only for genuine loan-terms.
- **Chat slug standardized: `bright-processor` → `chat`.** `CHAT_FUNCTION` in `lib/chatService.ts` is now `'chat'`; deployed from the `chat` folder. The old `bright-processor` function is **orphaned — delete it in the dashboard.**

**3. Deploy + infra (all via CLI now).** Auth is a **Personal Access Token** (`npx supabase login --token sbp_…`); the browser flow fails in this non-TTY env. Deploy per function: `npx supabase functions deploy <name> --project-ref eaxdqizerkuqkujxacru` (Docker not needed — deploys via API). **All 9 deployed:** kundli · chat · horoscope · create-order · verify-payment · report · panchang · muhurat · delete-account.
- **Secrets confirmed set:** `ANTHROPIC_API_KEY` (AI is LIVE — chat/horoscope/report return real Claude, no more mock), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
- **Migrations:** the CLI history table didn't exist (schema was built via dashboard). Verified via the Management API that **all 14 migrations' objects genuinely exist** (columns, constraints, functions, triggers), then `npx supabase migration repair --status applied 001..014` synced the history (metadata only, no DDL). Local = remote for all 14. Project is now properly CLI-managed.

**Family-profile Kundli navigation fix + header toggle (later 2026-07-07):** Settings → "Your Kundli" ignored the active person — it always opened the account owner's (oldest) chart via `router.push('/profile')` with no id, so after selecting/adding a family member it showed the wrong Kundli. Now it opens the **active** profile (`/profile?id=activeId`) and labels the row with that person's name (`<Name>'s Kundli` for family, "Your Kundli" for self). Also added a **moon "view Kundli" button beside the settings gear** in the Home header (`headerBtns`) that opens the active person's chart. Client-only — `app/settings.tsx` + `app/(tabs)/index.tsx`; no deploy, `npx tsc --noEmit` passes.

**4. Security TODO (do these now):** the CLI access token (`sbp_…`) and the DB password were pasted in-session — **rotate the access token** (dashboard → Account → Access Tokens) and **reset the DB password** (Settings → Database). App is unaffected (uses anon key).

**Verify before calling it final:** open a profile → cross-check its new chart against Prokerala/AstroSage (should match); send a Hindi chat message (should come back short + Hindi-dominant).

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
| Kundli | **Self-hosted Vedic sidereal engine** (Lahiri ayanamsa, whole-sign houses) in the `kundli` Edge Function — real astronomy, no API/key/cost. See §0. Client entry point still `kundliService` (rule #1). |
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
- [x] Edge Function deployed — **slug is now `chat`** (2026-07-07; old `bright-processor` orphaned, delete it); source `supabase/functions/chat`
- [x] `ANTHROPIC_API_KEY` secret **SET** (2026-07-07) — chat/horoscope/report return real Claude output
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
- [x] **Phase 10:** migration `009_phase10_analytics.sql` (events table) — APPLIED + synced 2026-07-07. `events` table live.
- [x] **Free Home features:** migration `010_panchang_numerology.sql` APPLIED + `panchang` Edge Function DEPLOYED (2026-07-07). See §20.
- [x] **Shubh Muhurat Finder:** migration `011_muhurat.sql` APPLIED + `muhurat` Edge Function DEPLOYED (2026-07-07). See §21.
- [x] **Migrations 012 (chart_reports type widen), 013 (profiles.relation), 014 (user-sync FK fix):** all APPLIED + synced 2026-07-07. `report`/`create-order` deployed. (Chart reports feature itself was reverted — §9 — but the harmless `reports.type` widening is applied.)

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
- ~~Astronomy is low-precision~~ **RESOLVED 2026-07-07:** Panchang/Muhurat now use the shared
  `supabase/functions/_shared/astro.ts` engine (same as the Kundli — Lahiri sidereal, arc-minute
  Sun/Moon, validated sunrise/sunset). No provider, still zero runtime cost.

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

---

## 23. Five new premium chart reports (CODE DONE; UI verified on device; backend deploy pending)

> **UI verified on device (2026-07-05):** app rebundled over wireless ADB; the regrouped Reports tab
> (Comprehensive/Focused/Home, flagship badged) and the shared `report-chart` intake render correctly.
> End-to-end purchase+generation is blocked only on the three deploy steps below (migration 012 +
> `report` + `create-order`) — until `create-order` is redeployed, "Continue" returns `unknown_plan`
> for the new plan ids.


Added five single-person, chart-based PDF reports alongside the existing Vastu + Matchmaking. They
reuse the SAME money layer, viewer, PDF export and brand styling. **All astrology is COMPUTED
deterministically (rule #2); Claude only narrates; the chart comes from `kundliService` (rule #1).**

**New reports & fixed prices** (paise in `config/pricing.ts` + `create-order`):
- **Complete Kundli Analysis (Life Report) — ₹399** (flagship; all 12 houses, planets, yogas, full
  Mahadasha timeline, life-area outlook, remedies, life-path summary — the deepest report).
- **Career & Finance — ₹149** · **Love & Relationship — ₹129** · **Health & Wellbeing — ₹99**
  (explicit "not medical advice") · **Education & Career (Students) — ₹99**.
Existing **Vastu ₹149** and **Matchmaking ₹199** unchanged.

**What was built:**
- Chart-report engine — houses + lords + strengths, yoga detection (Gajakesari, Budha-Aditya,
  Chandra-Mangala, 5× Pancha-Mahapurusha, exalt/debil), Vimshottari dasha timeline (Maha + Antar,
  current/upcoming), thematic scores, per-type Claude narration + thorough mock fallback, and the
  branded multi-page HTML renderer. It is **inlined into `report/index.ts` as `namespace Chart`**
  (single-file deploy — the dashboard editor's `./chart.ts` import failed to bundle, so it was merged
  into one file; verified it bundles with esbuild). A standalone pure copy lives in the scratchpad for
  regenerating samples.
- `supabase/functions/report/index.ts` — carries the engine; dispatch now accepts the 5 chart types,
  gates on a paid `report` entitlement (plan_id = type), computes → narrates → renders → stores,
  consumes the entitlement on success. **Vastu/Matchmaking code untouched.**
- `config/pricing.ts` — 5 new `REPORT_PRICES`, `CHART_REPORT_TYPES`/`isChartReport`, regrouped
  `REPORT_META` (`flagship` | `personal` | `home`) + `REPORT_GROUPS`. `create-order` prices mirrored.
- `migrations/012_chart_reports.sql` — widens `reports.type` CHECK to the 5 new types (kind stays
  `report`, plan_id free text). *(This file already existed from the reverted 7b attempt and is exactly
  what's needed — it was NOT run before; run it now.)*
- Client: `lib/reportService.ts` (`ChartReportType`, `generateChartReport`), `app/report-chart.tsx`
  (one shared intake for all 5 — shows scope + a single "Continue · ₹price"; fill-first/pay-at-end),
  regrouped Reports tab (flagship badged), analytics `report_started`/`report_purchased`/
  `report_downloaded` wired across all report intakes + the viewer.
- `npx tsc --noEmit` passes. Sample HTML+PDF for all 5 generated from test-chart data (see below).

### To go live
1. **Migration:** run `012_chart_reports.sql` in the SQL editor.
2. **Deploy** the `report` function — **single file** `index.ts` (the chart engine is inlined as
   `namespace Chart`; nothing else to upload). Keep the slug `report` (else update `REPORT_FUNCTION`
   in `lib/reportService.ts`). **Redeploy `create-order`** (new report prices). `verify-payment` unchanged.
3. **No app rebuild** (no new native modules — reuses expo-print/webview) and **no new secrets**
   (reuses `ANTHROPIC_API_KEY` → mock narration until set; scores/houses/dasha/yogas are real regardless).

### On-device test
- Reports tab → **Complete Kundli Analysis ₹399** → intake shows the scope → Continue → pay
  (netbanking Success, or domestic card `5267 3181 8797 5449`; NOT `4111…`) → report opens (branded
  indigo/gold WebView) → **Download** exports the PDF. Repeat for a ₹99–149 focused report.
- DB check: `select type, status, score from public.reports order by created_at desc;` (status `ready`);
  the `report` entitlement row has `consumed_at` set. `select name, props from public.events where
  name like 'report_%';` shows started/purchased/generated/downloaded.

### Sample outputs (generated offline from the mock path, this session)
`C:\Users\user\Desktop\Ritham\report-samples\sample-{life,career,love,health,education}.{html,pdf}`
— test chart "Ananya Sharma" (Leo lagna; Budha-Aditya + Gajakesari + exalted Jupiter + Shasha yogas).
The life report is clearly the deepest (all 12 houses, 7 narrated sections). These are exactly what
the in-app WebView renders and what `expo-print` exports.

### Not yet done (follow-ups)
- Narration is mock until `ANTHROPIC_API_KEY` is set (same policy as chat/horoscope/other reports).
- Dasha balance uses a deterministic fraction of the birth nakshatra (the mock chart has no exact
  Moon longitude); it sharpens automatically when a real ephemeris arrives at the `kundliService`
  swap point (rule #1), same as every other mock-chart feature.
- Chart diagram is North-Indian only in these reports (Matchmaking still offers North/South).

---

## 24. Luxury UI overhaul — "Behrouz" black + gold (CODE DONE; JS-only, no rebuild)

A full visual redesign to make the app look like an elite editorial/luxury brand (away from the
old indigo-purple "vibecoded" look). **Logic untouched — pure presentation.** Decisions locked with
the user: **near-black + matte-gold palette (Behrouz)**, **Cormorant Garamond display + Inter body**,
**safe motion** (RN built-in `Animated`, no reanimated/gesture-handler — those stay removed per §7).

**Design system — `constants/theme.ts` (single source):**
- Palette: `canvas #0B0B0D`, `surface #151417`, gold `#C5A059` / `goldLight #E4C983`, ivory text
  `#FDFBF7`, muted `#A29E95`, **gold hairline borders** (`rgba(197,160,89,.16)`). Old keys (`bg`,
  `bgCard`, `gold`, `text`…) are **repointed** to the new palette, so every screen recolored at once.
- Added tokens: `Type` (serif roles + gold `eyebrow`), `Radius`, `Depth` (soft warm shadows, not hard
  Android elevation), `Motion` (cubic-bezier `0.22,1,0.36,1` + stagger), `Scrim` (translucent panels).

**New shared components:** `components/Icon.tsx` (semantic thin-line icon registry over
`@expo/vector-icons` MaterialCommunityIcons/Feather — real `om`/`temple-hindu`/moon glyphs; **all 63
emojis removed**), `AnimatedSplash.tsx` (animated start screen: wordmark + gold rule reveal, replaces
blank splash), `Reveal.tsx` (staggered fade/slide entrance), `ScreenHeader.tsx` (shared back+serif
title header, edge-to-edge safe-area).

**Converted:** every screen + component — root layout (font loading gate + splash handoff), custom
glass-ready tab bar (thin icons + sharp gold indicator, no fat pill), Home, chat, auth ×2, store,
reports, profile, settings, panchang, numerology, muhurat, darshan, all 4 report screens, legal,
Paywall, SelectModal (elevated bottom sheet w/ gold handle). `app.json`: near-black splash/bg +
translucent system bars (edge-to-edge).

**New deps (all JS-only — NO native rebuild):** `@expo/vector-icons`, `@expo-google-fonts/cormorant-garamond`,
`@expo-google-fonts/inter` (`expo-font` already present). `npx tsc --noEmit` passes; app is emoji-free.

### To see it
Just **reload Metro** — the entire overhaul is JS/asset only and loads over a normal refresh (icon +
Google fonts load at runtime; no dev-client rebuild needed).

### Wave 2 — DONE (rebuilt on device 2026-07-06)
- **`expo-blur` glass tab bar** shipped: `app/(tabs)/_layout.tsx` tab bar is now **absolutely positioned**
  at the bottom with a real `BlurView` (`intensity={48} tint="dark" experimentalBlurMethod="dimezisBlurView"`)
  + a light `rgba(9,9,11,0.34)` scrim for contrast + gold top hairline. Because it overlays, content scrolls
  UNDER the glass. `TAB_BAR_HEIGHT` (58) is exported from `_layout.tsx`; the 4 tab screens add
  `TAB_BAR_HEIGHT + insets.bottom` bottom padding (chat pushes its input row above the bar) so nothing hides.
- Native edge-to-edge system-bar translucency (`app.json`) now applies (rebuilt).
- Required a native rebuild (`npx expo run:android`); `expo-blur` installed via `npx expo install`.

### ⚠️ Install gotcha (OnePlus/OPPO ColorOS) — cost time, avoid next rebuild
`npx expo run:android` **built fine but the install failed**: `INSTALL_FAILED_VERIFICATION_FAILURE:
Install not allowed`. ColorOS Play-Protect/package-verifier blocks adb installs (worse over **wireless** adb).
Fix that worked — disable the verifier then install the built APK manually:
```
adb -s <dev> shell settings put global verifier_verify_adb_installs 0
adb -s <dev> shell settings put global package_verifier_enable 0
adb -s <dev> install -r -d android/app/build/outputs/apk/debug/app-debug.apk
```
Then restart Metro (`npx expo start`), `adb reverse tcp:8081 tcp:8081`, and launch
(`adb shell monkey -p com.ritham.app -c android.intent.category.LAUNCHER 1`). Over-USB install may also avoid it.
(Build note: `react-native-reanimated` + `react-native-gesture-handler` now compile as transitive native deps
on SDK 57 and build/run fine — the old Expo-Go SDK-54 crash from §7 did not recur.)

### Not yet done (styling follow-ups)
- Optional: bespoke SVG zodiac line-art (would add `react-native-svg`) — deferred; icon set is enough for v1.

---

## 25. Wave 3 — "Royal Jewel" vibrancy + fixes (DONE, rebuilt on device 2026-07-06)

On-device review of Wave 1/2 flagged: bland 2-tone palette, keyboard hiding inputs app-wide, chat send
button unreachable/inert, reports still indigo/purple, and +91 friction. All fixed. User chose **Royal
Jewel** palette + **Fraunces** display font.

**Design tokens (`constants/theme.ts`):** display font **Cormorant → Fraunces** (`Fonts.display*`);
warmed surfaces; added **`Accents`** (gold/saffron/amethyst/emerald/ruby/sapphire — each `color`/`faint`/
`soft`), **`Gradients`**, and `accentCardGradient(accent)`. Old keys unchanged so everything cascades.

**Vibrancy:** new `components/GradientCard.tsx` (expo-linear-gradient). Per-domain jewel accents on Home
feature cards (panchang=saffron, numerology=amethyst, muhurat=emerald, darshan=ruby), detail screens,
reports (per-type accent chips + flagship gold gradient), store chips, chat (sapphire). Splash got a
gradient + gold glow. Home horoscope hero is a GradientCard.

**Keyboard fix (the big one):** added **`react-native-keyboard-controller`** + `KeyboardProvider` in
`app/_layout.tsx`. Every input screen now uses its `KeyboardAwareScrollView` (auth×2, profile, matchmaking,
vastu) or `KeyboardAvoidingView` (chat). The **glass tab bar hides when the keyboard is open**
(`useKeyboardState`). Chat send button now has a real `canSend` state (gold when there's text, muted +
disabled otherwise).

**Phone (`app/(auth)/index.tsx`):** fixed **`+91` prefix** chip; user types 10 digits; validates
`^[6-9]\d{9}$`, submits `+91`+digits.

**Reports HTML (`supabase/functions/report/index.ts`):** all 3 renderers retheme d to the new palette +
Fraunces `@import` (old indigo palette globally remapped). ⚠️ **PENDING: redeploy the `report` Edge
Function via the dashboard** for the new look to appear in generated PDFs (CLI deploy fails here).

### ⚠️ Native-deps gotchas (cost real time — read before next rebuild)
- **`react-native-keyboard-controller` REQUIRES `react-native-reanimated`** (peer dep). Reanimated had been
  removed (§7), and a `--legacy-peer-deps` install silently pruned it → Metro `Unable to resolve
  react-native-reanimated`. Fix: `npx expo install react-native-reanimated react-native-worklets`, add
  **`react-native-worklets/plugin`** as the LAST babel plugin (`babel.config.js`), rebuild. Reanimated v4
  on the SDK 57 dev client / New Arch runs fine — the old §7 crash was Expo-Go-specific and did NOT recur.
- **Stale CMake graph after re-adding worklets:** build failed with `ninja: error: libworklets.so … missing
  and no known rule to make it` (expo-modules-core linking a stale worklets `.so` path). `gradlew clean`
  also failed (`externalNativeBuildCleanDebug`). Fix that worked: delete `.cxx` + native `build` dirs for
  `android/app` and node_modules `react-native-worklets` / `react-native-reanimated` / `expo-modules-core`,
  then `npx expo run:android`. Clean build succeeded (~6 min).
- New JS deps: `@expo-google-fonts/fraunces`, `expo-linear-gradient`, `react-native-keyboard-controller`,
  `react-native-reanimated`, `react-native-worklets`. `npx tsc --noEmit` passes.

### Chat keyboard note (resolved)
The Wave-2 "tab bar between input and keyboard" oddity is fixed — the tab bar now hides while the keyboard
is open, and the chat input row's bottom padding collapses (kbVisible) so the composer sits on the keyboard.

---

## 26. Light / Dark mode (DONE, JS-only, default = LIGHT)

Runtime theming added. **Default is LIGHT**; choice persists to AsyncStorage (`ritham.themeMode`).

- `constants/theme.ts` now exports **`darkColors` + `lightColors`** (same keys) + `ThemeColors` type.
  Added `goldContrast` (always-dark text ON gold buttons — legible on both ivory & near-black),
  themed scrims (`scrimTabBar/Sheet/Backdrop`) and gradients (`gHero/gSplash`), `blurTint`, `statusBar`.
  `Colors` remains as a back-compat alias to `darkColors`. `accentCardGradient(c, accent)` now takes the
  active palette. Jewel `Accents`, `Fonts`, `Spacing`, `Radius`, `Depth` stay theme-independent.
- `context/ThemeContext.tsx` — `ThemeProvider` (wraps the app in `app/_layout.tsx`, first paint gated on
  `ready`), `useTheme()` → `{ mode, colors, isDark, toggle, setMode }`, and `useColors()` → active palette.
- **Every screen refactored to per-render styles:** `const th = useColors(); const styles = makeStyles(th);`
  and `const makeStyles = (th: ThemeColors) => StyleSheet.create({ … th.x … })`. (Static `StyleSheet` +
  imported `Colors` can't switch at runtime — this was the required change across ~27 files.) On-gold text
  uses `th.goldContrast`. Bulk conversion done via a scripted transform; Icon/GradientCard (default-param
  colors) + the layouts converted by hand.
- **Toggle:** sun/moon `IconButton` in the Home header (beside profile/settings) AND
  Settings → **Appearance → Theme**. Tab bar `BlurView` tint + `StatusBar` follow the theme.
- JS-only (no rebuild): reuses `@react-native-async-storage/async-storage`. `npx tsc --noEmit` passes.
- Light palette is a first pass (warm ivory `#F4EFE4` + deep gold `#A07C2A` + jewel accents) — tune
  contrast per feedback. Report PDFs are NOT themed by app mode (they stay the dark branded template).

---

## 27. Light-theme contrast pass (DONE, JS-only, verified on device 2026-07-06)

User feedback on the light theme (§26 first pass): body/caption text was too pale to read (e.g. the
Reports card copy "…all 12 houses, planets, yogas…"), and gold CTA buttons blended into their own dark
label (muddy olive-gold fill under near-black text). Fixed centrally so it cascades to every screen.

**Root cause / the two roles of gold:** in light mode a single gold can't be BOTH a readable dark
accent-text tone on cream AND a bright button fill that makes dark text pop — opposite contrast
directions. The palette already defined `goldSurface` for fills but **no screen used it** (0 refs), so
CTAs were filling with `th.gold` (`#A07C2A`) instead.

**Changes — `constants/theme.ts` `lightColors` only** (dark palette untouched):
| token | before | after | why |
|---|---|---|---|
| `textMuted` | `#6B6456` | `#574F3F` | descriptions/subtitles now clearly legible |
| `textDim` | `#9A9284` | `#797060` | captions/dates/disclaimers readable (was ~2.4:1) |
| `goldLight` | `#856419` | `#6B5011` | richer, readable card titles/prices/links (35 refs) |
| `goldSurface` | `#D8A93A` | `#E4B23E` | brighter clean gold button fill; `goldContrast` text pops |
| `gold` | `#A07C2A` | `#8C6A22` | crisper eyebrows / active-tab / hairlines (now text-only) |

**Convention established (apply to all new screens):** **filled buttons / badges / active chips use
`th.goldSurface` as the fill, NOT `th.gold`.** `th.gold` & `th.goldLight` are accent-TEXT / eyebrow /
hairline tones only; on-gold text stays `th.goldContrast`. This is safe in dark mode because
`darkColors.goldSurface === darkColors.gold` (`#C5A059`), so moving fills only changes light mode.

**Screens edited** (18 CTA/badge/toggle/chip fills `th.gold`→`th.goldSurface`, plus one `goldLight`
badge in Paywall): auth ×2, chat (primary btn + user bubble + send btn), Home, reports (primary +
flagship badge), panchang, numerology, muhurat, darshan, profile, report-chart ×2, report-matchmaking
×2, report-vastu (btn + active chip), Paywall (toggle + badge). Decorative gold left as-is (hairline
rules, tab indicator, splash/loading dots, SelectModal handle — no text on them). `npx tsc --noEmit`
passes. **JS-only — reload Metro, no rebuild.** Verified on device: Home + Reports render dark,
readable copy and punchy gold buttons.

### Dev-run refresh — wireless ADB (2026-07-06, current network)
Phone Wi-Fi IP is now **`192.168.1.14`** (SSID changed since §16's `.10/.4`; still DHCP — get current
with `adb -s <dev> shell ip -o -4 addr show wlan0`). Standard cable-free loop:
```
adb connect 192.168.1.14:5555
adb -s 192.168.1.14:5555 reverse tcp:8081 tcp:8081     # re-run after any reconnect
cd C:\Users\user\Desktop\Ritham\ritham && npx expo start --dev-client
adb -s 192.168.1.14:5555 shell monkey -p com.ritham.app -c android.intent.category.LAUNCHER 1
```
⚠️ **The `adb reverse` tunnel is per-connection and drops when the phone sleeps or USB is unplugged** →
app then shows the red "Unable to load script". Fix: `adb connect …` again, redo `reverse`, then
force-stop + relaunch the app (`am force-stop com.ritham.app` → monkey). Reload deep link:
`adb -s 192.168.1.14:5555 shell am start -a android.intent.action.VIEW -d "ritham://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" com.ritham.app`.

---

## 28. NEXT: Real Claude API integration (planned — not started)

Everything AI-facing currently returns a **deterministic MOCK** because `ANTHROPIC_API_KEY` is unset
(intentional dev policy, §14). The flip to real Claude is the next task. Affected Edge Functions, all of
which read the same `ANTHROPIC_API_KEY` secret and swap to live output automatically once it's present:
- `chat` (deployed as slug **`bright-processor`**) — Claude **Sonnet 5**, thinking off.
- `horoscope`, `report` (chat-reports + Vastu vision + Matchmaking narration) — mock narration only;
  all scores/houses/dasha/yogas/guna-milan are already REAL (computed, rule #2).
- `panchang` / `muhurat` are **pure-compute, no AI** — unaffected.

Scope for the integration session: (1) add `ANTHROPIC_API_KEY` in Supabase → Edge Functions → Secrets;
(2) confirm each function's model id + request shape against the current Anthropic API (check the
`claude-api` skill / docs before editing — do NOT trust memory for model ids/params); (3) quality pass —
run real chats/horoscopes/reports and tune each system prompt; (4) watch cost/caching (rule #4 caches
already protect horoscope/report/panchang/muhurat; chat is per-message). Nothing here needs an app
rebuild — Edge-Function-only.

**API prompt review (done, deferred flip):** all 5 Claude call sites were reviewed against the current
API and are already compliant — `claude-sonnet-5`, `thinking:{type:'disabled'}` (valid on Sonnet 5), no
sampling params, correct `x-api-key`/`anthropic-version`. System prompts already enforce rule #2. **Decision:
stay on Sonnet 5** (margins already ~65–95% gross; cost levers = prompt caching for chat + Haiku for
horoscopes, both optional/later).

**JSON hardening — DONE (2026-07-07).** The 3 report JSON parsers (`parseAnalysis`, matchmaking narration,
`Chart.narrateChart`) previously called `JSON.parse` with no try/catch — a live model returning
malformed/truncated/refused JSON would throw a raw `SyntaxError`. Added a shared top-level helper
`parseJsonReply(text)` in `report/index.ts` (extracts the `{…}` slice, try/catches, throws a clean
`ai_bad_json` domain error); all 3 sites now route through it. Top-level function is visible inside
`namespace Chart`, so `narrateChart` uses it too. Failure path already safe: on a generation throw the
report is marked `status:'failed'` and 500 is returned **before** the entitlement is consumed (consume is
last, after html is built) — so a bad-JSON failure preserves the user's paid credit for a retry, doesn't
lose money. Verified: `esbuild` single-file bundle of `report/index.ts` passes (exit 0, 98.9 kb). Only
`JSON.parse` left in the file is inside `parseJsonReply` itself. **Needs a `report` redeploy for this to
take effect** (single-file `index.ts`); chat (`bright-processor`) + horoscope unchanged (no redeploy).

**Async report generation — DONE (2026-07-07), fixes live-report timeout.** First real end-to-end chart
report (key set, all of §23 deployed) failed with the client showing "couldn't generate your report" and
the Edge log showing a **`reason:"EarlyDrop"` shutdown with only 41 ms CPU** — i.e. the worker was killed
while *waiting*, not a key/JSON error (those return a normal 500 in <1 s). Root cause: reports are long,
non-streaming Claude calls (5000–8000 tokens → 1–3 min) but `report/index.ts` generated **synchronously**
and `reportService` `await`ed the whole `functions.invoke`; the mobile fetch / Supabase gateway time out
long before Claude finishes → EarlyDrop. Chat/horoscope are unaffected (700–1024 tokens). **Fix = async +
poll:** `report/index.ts` now inserts the row (`generating`), runs generation inside
`EdgeRuntime.waitUntil(...)`, and returns `{report_id, status:'generating'}` immediately; the background
task updates the row to `ready`/`failed` and consumes the entitlement only on success (credit preserved on
failure). Client `app/report-view.tsx` now **polls** `getReport(id)` every 3 s (cap ~4 min) and shows a
"Preparing your report…" state (+ a `failed` state). No `max_tokens` change needed — the server was idle
waiting (41 ms CPU), so the background task has ample wall-clock. `tsc` + `esbuild` (report, 99 kb) pass.
**Needs a `report` REDEPLOY** (ships with the JSON hardening) + Metro reload (report-view is JS-only). The
earlier failed attempt left a stuck `generating` row and an **unconsumed credit** — retry is free.

**To flip real AI on (Edge-Function-only, no app rebuild):**
1. Get an Anthropic API key (console.anthropic.com).
2. Supabase → Edge Functions → **Secrets** → add `ANTHROPIC_API_KEY=sk-ant-…` (project-wide secret; all
   functions read it). chat + horoscope go live immediately with NO redeploy (they read the secret at
   runtime). This is the only step needed to swap the mock for real Claude on those two.
3. Redeploy `report` (single-file `index.ts`) so the JSON hardening ships alongside the live key. (Note:
   the chart-reports version of `report` + migration `012` + `create-order` redeploy from §23 are still
   deploy-pending — bundle those together.)
4. Quality pass: run real chats/horoscopes/one report of each type, tune each system prompt in place
   (Edge-Function-only), watch cost/caching.

---

## 29. Family members — multi-profile (CODE DONE; one migration; JS-only, no rebuild)

Let one account hold **self + family** (spouse, children, parents…). The backend was already
per-profile — every Edge Function takes a `profileId`, and `profiles` always allowed many rows per user
(migration 004 comment: "self + family later"). So this is almost entirely a **client** feature: an
"active person" concept + a Family screen, pointing the screens that hardcoded `.limit(1)` at the
active person instead. **Decisions (user):** switching a member changes the WHOLE app; manage from the
Home header + Profile/Settings.

**What was built:**
- Migration `013_family_members.sql` — adds `profiles.relation` (`self`/`spouse`/`son`/`daughter`/
  `father`/`mother`/`brother`/`sister`/`friend`/`other`, default `'self'`) + check constraint + index.
  RLS from 004 (own-rows) already covers every member. Existing single-profile users are `'self'` by default.
- `context/ProfileContext.tsx` — `ProfileProvider` (wrapped in `app/_layout.tsx` inside `AuthProvider`) +
  `useActiveProfile()` → `{ members, activeId, active, loading, setActive, refresh }`. Active person
  persists to AsyncStorage `ritham.activeProfileId`; defaults to self. **Resilient:** if the `relation`
  column isn't there yet it falls back to inferring relation from row order, so the app never bricks
  pre-migration. Exports `RELATION_LABEL` + `FAMILY_RELATIONS`.
- `app/family.tsx` — Family screen: list members (name · relation · Moon sign), tap to switch active,
  chevron → view/edit their Kundli, trash → delete (non-self only, confirm). "Add a family member" →
  relation picker → the birth-details form. Design-system native (ScreenHeader/Reveal/Icon/SelectModal).
- `app/profile.tsx` — now param-aware: `?new=1&relation=…` (add member), `?id=…` (edit specific),
  none (self onboarding, unchanged). Shows a RELATION picker for family; writes `relation` only for
  family rows (self uses the DB default → onboarding still works pre-migration). Add → `router.back()`
  to Family; onboarding → Home; edit → view. Calls `refresh()` after save.
- Wired the active person into: **Home** (`app/(tabs)/index.tsx` — name is a person switcher with a
  "Manage family" entry; a `family` header icon → `/family`; Home passes the active id to horoscope/
  panchang/numerology/muhurat, so all of them follow automatically), **Chat** (anchors to the active
  member; switching starts a fresh conversation), **report-chart** + **report-matchmaking** (subject/
  self side = active person). **Settings** → Account → "Family members".
- `components/Icon.tsx` +`plus`/`family`; `lib/analytics.ts` +`family_member_added`/`_removed`/
  `active_profile_switched`; `lib/kundliService.ts` `ProfileRow.relation?`. `npx tsc --noEmit` passes.

**Entitlements are per-account (shared across the whole family — one wallet); the free 1-min chat stays
one-per-phone (rule #5). No entitlement changes.**

### To go live
1. **Migration:** run `013_family_members.sql` in the SQL editor. **Required before adding members**
   (the add-member insert writes `relation`). Existing self-only users keep working either way.
2. **No Edge Function redeploy** (they already accept `profileId`), **no new secrets**, **no native
   rebuild** — JS-only client. Just reload Metro.

### On-device test
- Home header: the name now has a ⌄; tap → switcher (initially just "You" + "Manage family"). The
  people icon → Family screen.
- Family → Add a family member → pick relation → birth form → Generate Kundli → back to Family.
- Switch to them on Home → horoscope/panchang/numerology recompute for them; Chat anchors to them;
  a report's subject = them. Delete a non-self member; self can't be deleted; deleting the active
  member falls back to self.

### Not yet done (follow-ups)
- Panchang/Muhurat use the active person's birth city (fine); no separate current-location.
- No per-member unread/notification state (push is dropped for v1 anyway).
- Matchmaking's "self" side is the active person; the partner is still entered fresh each time.

---

## 30. Family — onboarding surfacing, header cleanup, user-sync fix (DONE)

Follow-ups on §29, all verified on device.

**Onboarding surfacing (so family isn't hidden):** new signup flow is now
**OTP → create your Kundli → "Add your family?" step → Home.** `app/profile.tsx` first-run
(`wasNew`) now `router.replace('/onboarding-family')` instead of `/(tabs)`. New screen
`app/onboarding-family.tsx` — welcoming "YOU'RE ALL SET / Add your family?" with the value pitch
(shared wallet), an "Add a family member" gold button (→ relation picker → the birth form, returns
here so several can be added; added members list with a ✓), and "Skip for now / Continue to Ritham"
→ Home. Shows once (tied to first self-creation); editing self later never re-triggers it.
⚠️ New route files need a full app reload for expo-router to register (Fast Refresh 404s until reload).

**Home header redesign (was cluttered — 3 icons + big name + wrapping moon row):** now **one**
settings icon on the right; the name stays the person switcher (⌄); the Moon sign is a compact
single-line **gold pill** (`moonChip`, `numberOfLines={1}`). Theme toggle removed from the header
(still in Settings → Appearance); family reachable via the name switcher's "Manage family" + Settings.
Only `app/(tabs)/index.tsx` (dropped the `useTheme`/`isDark`/`toggle` usage). Plan file:
`~/.claude/plans/the-header-of-home-frolicking-yeti.md`.

**User-sync FK fix (migration `014_fix_user_sync.sql`):** creating a Kundli failed with
`profiles_user_id_fkey` violation — the signed-in auth user had **no `public.users` row** (the 002
sync trigger didn't populate it, same class as the old 003 "signup 500" referral-trigger bug). 014
re-asserts a search-path-safe `generate_referral_code`, re-asserts the `on_auth_user_created`
auth→users sync trigger (002), and **backfills** a `public.users` row for every auth user missing one.
Re-runnable.

### To go live
- **Run migration `014_fix_user_sync.sql`** in the SQL editor — clears the FK error immediately
  (part c backfills the missing row) and makes future signups self-heal.
- Onboarding + header are **JS-only** — reload Metro, no rebuild, no Edge Function change.
- `npx tsc --noEmit` passes.

---

## 31. Real-AI integration session + GO-LIVE runbook (2026-07-07)

Worked toward flipping on real Claude (§28). Outcome this session: **all code is ready; the only
remaining work is dashboard deploys + Anthropic credits**, consolidated into a new single runbook file
**`GO-LIVE.md`** at the project root (the authoritative go-live checklist — read it first).

**Done this session (code, all typechecks + bundles clean):**
- Reviewed all 5 Claude call sites against the current API — already compliant (`claude-sonnet-5`,
  `thinking:{type:'disabled'}` valid on Sonnet 5, no sampling params, correct headers; chat handles
  `refusal`). Kept Sonnet 5 (documented business decision). See §28.
- **Report JSON hardening** — shared `parseJsonReply()` in `report/index.ts`; all 3 parse sites route
  through it (clean `ai_bad_json` instead of raw `SyntaxError`). See §28.
- **Async report generation (real bug fixed).** First live report failed with `EarlyDrop` + 41 ms CPU —
  a long non-streaming Claude call (5000–8000 tok, 1–3 min) can't be held synchronously; the mobile
  fetch/gateway drops it. Fix: `report/index.ts` now generates in `EdgeRuntime.waitUntil(...)` and
  returns `{report_id, status:'generating'}` immediately; `app/report-view.tsx` polls `getReport` every
  3 s (cap ~4 min) with `generating`/`failed` states. Entitlement consumed only on success → failed run
  preserves the paid credit. See §28.
- Confirmed the whole go-live surface: 8 functions, client slugs all mapped
  (`chat`→`bright-processor`, others 1:1), `create-order` prices in sync with `config/pricing.ts`, and
  migrations 009/010/011/013/014 all safe to re-run.

**Live-flip status (the actual "flip"):** `ANTHROPIC_API_KEY` **is set**, key is **valid** (auth passed),
but the Anthropic **account has $0 credits** → every AI call returns `400 "credit balance is too low"`.
So real AI is one billing top-up away (console.anthropic.com → Billing). Chat/horoscope go live the
instant credits land (no redeploy); `report` needs its re-deploy (async + hardening) — both in `GO-LIVE.md`.

**Still deploy-pending (see `GO-LIVE.md` for the exact list):** migrations `009`/`010`/`011`
(+`013`/`014` if not already run); (re)deploy `report`, and first-time deploy `panchang` / `muhurat` /
`delete-account` (watch for dashboard slug auto-rename). No new secrets, no native rebuild.

### Security guardrails pass (2026-07-07)
Hardened the AI-cost surface (real Anthropic money once credits land). Audit found payments + RLS already
solid — `verify-payment` does HMAC + timing-safe compare + server-side amount + idempotent grant;
`entitlements_ledger`/`payment_orders` are RLS **select-only** for clients (only service-role functions
write them, so entitlements can't be forged); reports/storage/profiles all scoped to `auth.uid()`.
**Fixed (code, in `chat` + `report` — both need redeploy to activate):**
- **Report credit multiplication** — credit was consumed on *success*, so N concurrent requests (or
  retries) off one purchase could each fire a ~$0.10 Claude report call. Now the credit is **claimed
  atomically before** generation (conditional `update … where consumed_at is null`); losers get
  `needs_purchase`; the claim is released on failure (retry-safe).
- **Unbounded AI inputs** — added caps: chat message ≤ 2000 chars (+ client `maxLength`), only last
  `CHAT_HISTORY_MAX=20` turns sent to Claude (trimmed to start on a user turn); Vaastu answers ≤ 4 KB,
  floor-plan ≤ 6 MB; `isPerson` now caps name ≤ 120 + `placements` ≤ 30, plus an 8 KB person backstop.
- **Free-minute race** — now an atomic conditional claim on `users.free_minute_used_at` (rollback on
  session-create error) so concurrent first-requests can't double-grant (rule #5).
`tsc` + `esbuild` (chat, report) pass. **Operational items for pre-launch (dashboard, NOT code) — in
`GO-LIVE.md` → Security guardrails:** remove the **test OTP `123456`** (Auth → Phone), set the `reports`
bucket to **image MIME + ~6 MB size limit**, Razorpay live mode, and optionally a per-user rate limit on
chat/report.

---

## 32. Chat — Hindi/English discoverability (2026-07-07, JS + chat fn)

Made language flexibility discoverable **without any UI clutter** — no banners, popups, screens, or
language selector; app UI stays English. Audience skews Hindi-mixed-with-English, so we lead in that
natural style and mention the English option subtly. **Never uses the word "Hinglish."** Three touches:
- **Opening greeting** — server-side `GREETING` const in `chat/index.ts` (single source of truth,
  referenced in the system prompt). Client fetches it via a lightweight `{ greetingOnly: true }` call
  (`fetchGreeting()` in `lib/chatService.ts` → returns just the string; **no session/entitlement/AI
  cost**) and renders it as the astrologer's first bubble on a new chat. Not hardcoded in the UI.
- **Placeholder** — `app/(tabs)/chat.tsx`: `'Apna sawaal poochein... (Hindi ya English)'`.
- **Starter chips** — 4 tappable chips on an empty chat (3 Hindi-style + 1 plain-English: "Will I get a
  job this year?"); tap fills the input; they vanish once chatting starts. Brand-styled (indigo/gold).
  Trimmed one redundant sentence from the free-minute intro card so the empty state stays clean.

**Real mechanism = system prompt:** the astrologer MIRRORS the user's language/script/register every
reply (natural Hindi-English mix / pure English / Devanagari Hindi), matches formality + English-mixing,
and keeps Jyotisha terms authentic (kundli, rashi, graha, dasha, Shani, Mangal…). User messages pass
through unchanged so the model detects language naturally. `tsc` + `esbuild` (chat) pass; "Hinglish"
appears nowhere in the repo. **Activate: redeploy `bright-processor`** (greeting + language are
server-side); placeholder/chips are JS-only. PRD + BuildSpec updated with a brief Chat-language section.

---

## 33. Chat — Hindi-leaning voice + Chat History (2026-07-08, chat fn + JS)

Two updates to chat this session.

**1. Language style — default Hindi; English only when the user writes English (system-prompt only).**
The astrologer was mixing in too much English ("aapki life ke is phase ko affect kar rahi hai"). Rewrote
the **Language section of `buildSystemPrompt`** in `supabase/functions/chat/index.ts` so:
- **DEFAULT = Hindi.** Any input not clearly English (Hindi, romanised Hindi, OR a Hindi-English mix) →
  reply in **predominantly Hindi, romanised (Latin) script — NOT Devanagari**, Hindi-first sentence flow;
  English only for genuine loanwords ("job", "career", "problem", "time") or terms with no Hindi
  equivalent — never peppered with filler English. Explicit **RIGHT vs WRONG example pair** pins the tone.
  *(Refined 2026-07-08: default made explicitly Hindi rather than a per-message mirror — a Hindi-English
  mix now defaults to Hindi, not English.)*
- **English input → fully clean English**, and it keeps conversing in English while the user stays in
  English (switches back to Hindi the moment they do); Devanagari input → **Devanagari**. Warm traditional
  jyotishi register throughout.
- Also warmed the server-side **`GREETING`** (dropped the English "comfortable" → "jaise aapko theek
  lage"; kept the single subtle language clause). Behaviour is entirely server-side; the function still
  passes user messages through unchanged (model self-detects language). "Hinglish" is not used anywhere
  user-facing. **Activate: redeploy `bright-processor`.**

**2. Chat History (read-only).** Users can revisit past conversations. **No new bottom tab** — a
**history icon in the Chat tab header** opens it.
- **Data**: reuses `chat_sessions` + `chat_messages` (migration 005); their RLS is already **select-own**,
  so the client reads history directly — **no Edge Function, no migration, no new secret**.
- `lib/chatService.ts`: `listChatHistory()` (sessions newest-first + first-question preview + profile
  name; two plain queries; empty sessions hidden) and `getSessionMessages(id)` (full transcript,
  oldest-first).
- Screens: `app/chat-history.tsx` (list — preview, date/time, profile name shown when >1 family member)
  → `app/chat-conversation.tsx` (read-only transcript, live-chat bubble styling, "Start a new chat"
  action; no continue/edit — history is immutable). `components/Icon.tsx` +`history`;
  `lib/analytics.ts` +`chat_history_opened`/`chat_history_session_opened`.
- **JS-only** (reload Metro, no rebuild). New route files need one full reload for expo-router to
  register (Fast Refresh 404s until then). `npx tsc --noEmit` + `esbuild` (chat) pass.

**2b. Chat History — delete (2026-07-08, JS + 1 migration).** Users can remove past conversations.
- **Select** action in the history header → multi-select mode: checkboxes on each card, tap-to-toggle,
  long-press a card to start selecting, "Select all"/"Clear all", and a **Delete (N)** action bar
  (`th.error` on `Accents.ruby.faint`) with an `Alert` confirm. On success the rows are dropped from the
  list and select mode exits.
- `lib/chatService.ts` +`deleteChatSessions(ids[])` (deletes `chat_sessions`; messages cascade).
  `lib/analytics.ts` +`chat_history_deleted`.
- **Migration `015_chat_history_delete.sql`** adds a **delete-own** RLS policy on `chat_sessions` (005
  only granted select-own). Messages are removed by the existing `chat_messages` FK `ON DELETE CASCADE`
  (cascade runs at the engine level, not gated by RLS). ⚠️ **Delete won't persist until 015 is run** —
  without the policy RLS silently deletes 0 rows (no error), so the UI would drop them but they'd return
  on reload. `npx tsc --noEmit` passes.

**2c. Back-navigation fix (2026-07-08, JS).** Root `app/_layout.tsx` rendered **`<Slot />`**, which has no
push/pop history — so `router.back()` from ANY top-level detail screen (chat-history, family, panchang,
settings, reports intake…) fell through to Home instead of the real previous screen (most visible as
chat → history → back landing on Home). Replaced with **`<Stack screenOptions={{ headerShown: false }} />`**:
real navigation history, so back returns to the actual previous screen AND the `(tabs)` navigator keeps its
active tab when popped back to. Header stays hidden because every screen draws its own (ScreenHeader / tab
+ auth chrome), so it's visually identical — just correct history + swipe-back. `npx tsc --noEmit` passes.

**Deploy:** redeploy `bright-processor` (language + greeting); **run migration `015`** (chat-history
delete); everything else is a Metro reload. PRD + BuildSpec updated (Hindi-leaning voice + Chat History
incl. delete).

## 34. Chat engine v2 — rich Kundli summary + full spec system prompt (2026-07-08, kundli + chat fns + JS)

Rebuilt the chat engine to the **"AI Astrologer Chat Engine MASTER BUILD SPEC"** (handed in-conversation).
The chat worked before but ran on a *thin* chart (lagna/rashi/nakshatra/9 placements only). This raises it
to the spec's **§2 "#1 accuracy lever"** — a rich, deterministic chart — and wires the spec's full **§1**
persona around it. **Backend only; §6 client features (starter chips, typing indicator, follow-up
suggestions, session summary) are a deliberate 2nd pass, NOT done.**

**1. Rich chart engine — `supabase/functions/_shared/kundliSummary.ts` (NEW, canonical source).**
- `computeRichKundli(birth)` → **static natal chart**, cached once at profile creation: Lagna + **its
  lord & placement**, Nakshatra + **pada**, Sun sign, all 9 placements **with dignity**, the **12 house
  lords and where each sits**, natal **yogas/doshas** (Gaja Kesari, Budha-Aditya, Chandra-Mangala, 5×
  Pancha-Mahapurusha, exalt/debil, **Manglik**), and the **full Vimshottari mahadasha timeline with dates**
  — the balance computed from the **real Moon-longitude fraction** (not the report engine's hash approx).
  Also stores sidereal longitudes + birth instant. Marker `engine_version: 2`.
- `currentDynamics(chart, now)` → **time-dependent** reading derived FRESH each session (never cached, so
  gochar never goes stale): running **Mahadasha + Antardasha**, next upcoming periods, current **gochar
  transits** (Shani/Guru/Rahu-Ketu by house from Lagna & Moon), and **Sade Sati** status (+ Kantaka/Ashtama
  Shani note). Degrades gracefully to "not available" on a thin chart — no crash.

**2. `kundli` Edge Function** → now a thin wrapper over `computeRichKundli`, so **new profiles cache the
full rich chart**. `kundli_chart` is JSONB → **no migration**. Back-compat: all legacy fields kept.

**3. `chat` Edge Function** — the spec's full **§1 system prompt** (persona + injected rich chart +
placeholders for dasha/transits/yogas/Sade Sati), the **QUESTION vs TIMED mode directive** by
`session.kind` (max_tokens **1024 vs 512**), **prompt-caching** the stable system block (`cache_control:
ephemeral` — ~90% input-cost saving across a session's turns), **server-side self-heal** of thin/mock
charts via `computeRichKundli` (persisted back), and the **pre-send assertion** (blocks only if
lagna/moon missing — the root-cause fix for the old "I don't have your info" bug). Mock reply enriched to
reference dasha/Sade Sati until the live key is set.

**4. `lib/kundliService.ts`** — `Kundli` type gains optional rich fields; **`getKundli` heals** any chart
lacking `engine_version:2` + `dasha_timeline` (not just legacy `mock`), so profile view / reports get the
rich chart on next load.

**⚠️ DEPLOY GOTCHA (single-file dashboard) + FIX.** kundli/chat are deployed by **pasting one `index.ts`**
into the Supabase dashboard, which does **not** upload a brand-new `_shared/*.ts` to the remote bundler →
`Module not found "_shared/kundliSummary.ts"` on deploy (same wall as report's old `./chart.ts`; existing
`_shared/astro.ts` only works because it was uploaded long ago). **Fix: `kundli/index.ts` + `chat/index.ts`
are now SELF-CONTAINED single files** — the astro + kundliSummary engine is **inlined** (no `_shared`
imports). `_shared/astro.ts` + `_shared/kundliSummary.ts` stay **canonical** (used by panchang/muhurat +
Node tests). **`scripts/inline-functions.mjs` (NEW)** regenerates the two files from the `_shared`
originals — **idempotent** (strips the old inlined block, re-appends; verified stable at kundli **733** /
chat **1110** lines). Workflow: edit the `_shared` originals → `node scripts/inline-functions.mjs` → paste.

**Verification.** Ran the engine via `node --experimental-strip-types` on a real DOB: astrologically
coherent (Scorpio Lagna → Mars in 11th; own-sign Saturn → **Shasha Yoga**; Revati/Pisces Moon → Vimshottari
Venus-ending-2026 → Sun now; **Sade Sati correctly active/peak** since Saturn really transits Pisces in
2026). Thin-chart fallback confirmed no-crash. Inlined engine block re-run from the generated file — same
output. `npx tsc --noEmit` passes (Deno fns excluded from app tsc, as before).

**Deploy:** paste the current `supabase/functions/kundli/index.ts` and `supabase/functions/chat/index.ts`
into their dashboard functions (chat slug = `bright-processor`). **No migration, no app rebuild, no new
secrets.** Real Claude replies stay mock until `ANTHROPIC_API_KEY` (§28 runbook) — the spec's §7 test
script runs live once the key is set.

## 35. VedAstro — single Vedic data engine (CODE DONE; deploy pending — 2026-07-08)

Adopted **VedAstro** (`api.vedastro.org`, Swiss Ephemeris / NASA JPL, MIT-licensed, free `FreeAPIUser`
tier @ 5 req/min) as the source of truth for the Kundli + Panchang + the chat/report grounding data,
**with the existing self-hosted Lahiri engine as an automatic fallback** so onboarding never fails. This
replaces the shallow local chart (9 signs + a hash-influenced dasha) with real depth: divisional charts,
combustion/retrograde/Shadbala, D9/D10, full Vimshottari dates, richer yogas/doshas. See
`Ritham_BuildSpec.md` → "Vedic data engine" and `Ritham_ChatEngine_Master.md`.

**Architecture (single integration point — rule #1 / spec §0):**
- **NEW `supabase/functions/_shared/vedastro.ts`** — the ONLY code that fetches VedAstro (wrapped in
  `namespace Veda` so it never collides when co-inlined). Holds `VEDASTRO_API_KEY` (server-side).
  `Veda.fetchRichKundli` (2 calls: `AllPlanetData` + `AllHouseData`, with retry/backoff) → a full
  `chart_facts`; `Veda.fetchPanchang` (1 call: `PanchangaTable`); `Veda.bumpVedastroUsage`. The
  Vimshottari timeline is computed from VedAstro's exact Moon longitude; transits/Sade Sati stay in
  `currentDynamics` (fresh each session). **Client + chat + horoscope NEVER call VedAstro** (grep-proven).
- **`kundli/index.ts`** — VedAstro primary → local `computeRichKundli` fallback; returns
  `engine_version: 3`, `source: 'vedastro'`, `chart_facts` on `profiles.kundli_chart`. **Now a real
  function to deploy** (was pure-compute).
- **`chat/index.ts`** — injects the full `chart_facts` (doshas, retrograde/combust, D9) alongside the
  existing structured block. **Bug fixed:** the old self-heal recomputed if `engine_version !== 2`, which
  would DOWNGRADE a VedAstro v3 chart to the local engine — now it only heals *thin* charts and never
  downgrades. Pre-send assertion tightened to require lagna + rashi + a non-empty dasha timeline.
- **`panchang/index.ts`** — VedAstro almanac (5 limbs + sunrise/sunset) with the muhurta windows
  computed locally from those sun-times; **local pure-compute fallback**. Same `(place_key, date_key)`
  cache. Now self-contained (astro + Veda inlined).
- **`horoscope/index.ts`** — **now per-profile & transit-aware** (§2): injects the profile's running
  dasha + current gochar. Cache key is `(profile_id, period, period_key)`.
- **`lib/kundliService.ts`** — `chart_facts` types + `source:'vedastro'` + `engine_version 2|3`;
  self-heal accepts v2/v3 (no VedAstro spam), thin/mock → recompute (prefers VedAstro). §0 umbrella
  surface: `getRichKundli`/`refreshKundli`/`getDailyPanchang`/`getMuhuratWindows`/`getNumerology`/
  `getGunaMatch`. **Numerology stays local** (Pythagorean math + static text) behind the umbrella —
  not astronomy, kept free/offline (deliberate deviation). **Muhurat unchanged** (local 45-day scan —
  VedAstro per-day is infeasible on the free tier).
- **`app/profile.tsx` `KundliView`** — rebuilt into the rich Kundli screen (§6): overview + lagna lord,
  planetary table with degree/dignity/retro/combust/vargottama, house lords, current + upcoming dasha
  (client-computed from the stored timeline), D9/D10, yogas & doshas, provider line, and a "Refresh with
  VedAstro" action for charts still on the local fallback.
- **`scripts/inline-functions.mjs`** — generalised to compose per-function engine sets: kundli =
  astro+kundliSummary+vedastro, panchang = astro+vedastro, chat/horoscope = astro+kundliSummary
  (VedAstro-free). **`migration 016_vedastro_rich_kundli.sql`** — `vedastro_usage` counter +
  `bump_vedastro_usage()` + per-profile `horoscopes.profile_id`. **`scripts/vedastro-sample.mjs`** —
  live proof (run with `npx tsx`).

**Verified locally (I can't deploy/set the secret/run the device from here):** the sample script hit the
LIVE API for a real DOB and produced a full `chart_facts` (9 grahas w/ dignity+retro+combust+D9/D10,
12 house lords, dated Vimshottari timeline, yogas/doshas), a dense `summary_text`, current
dasha+transits+active Sade Sati, a cached-Panchang sample, a numerology sample, and a **chat-grounding
proof** (for "meri shaadi kab hogi" the prompt already carries dasha/nakshatra/transits → the AI never
lacks details). All 4 inlined engines transpile with no duplicate declarations; `npx tsc --noEmit`
passes; grep proves `api.vedastro.org` appears only in `_shared/vedastro.ts` + the inlined kundli/panchang.

**To go live:** see `GO-LIVE.md` §E — run migration `016`, set secret `VEDASTRO_API_KEY=FreeAPIUser`,
(re)deploy `kundli` (new) / `panchang` / `horoscope` / `bright-processor`, reload Metro. No app rebuild.
Existing profiles self-heal to the VedAstro chart on next Kundli/chat view (or via the Refresh button).

### Not yet done (follow-ups)
- Live end-to-end (deployed + Anthropic credits) chat/report proof is pending the dashboard deploy + a
  credit top-up (Anthropic is at $0 — §31). VedAstro itself needs no credits (free tier).
- The Kundli screen shows current dasha (client-computed) but not live gochar transits (those need the
  server ephemeris; they're surfaced in chat + horoscope). Fine for v1.
- `getGunaMatch` computes the partner chart via VedAstro; the Ashtakoot scoring still runs in `report`
  (rule #2). Wiring the report's Matchmaking self-side to VedAstro charts happens automatically now that
  `kundliService` is VedAstro-backed.
- MatchChecker / extra divisional endpoints (D2/D3/D7/…) are available on VedAstro but not wired (D9/D10
  cover v1); add later if a report needs them.

## 36. Daily reminder notifications — local, free (DONE, rebuilt on device 2026-07-09)

Brought push back for v1 (was "dropped — add after revenue") as **Option A: 100% local notifications** —
no server, no Expo/APNs push token, **zero cost**. Two daily nudges (7 AM + 6 PM) that pull the user back
into the app. Native rebuild required (new native module + config plugin), **verified running on device**.

**Design — "personalised, not vague":** each reminder is anchored to the day's actual Vedic ruling planet
(*vaar*) and its life-domain — Mon/Moon (emotion), Tue/Mars (drive), Wed/Mercury (intellect), Thu/Jupiter
(fortune), Fri/Venus (love), Sat/Saturn (discipline), Sun/Sun (vitality) — then filled with the active
profile's **first name + Moon sign (Rashi)**. Reads as computed, not generic mysticism; stays honest since
vaar rulership is real tradition (no faked live-transit claim). First rev used a flat pool of interchangeable
poetic lines (user flagged as "vague/random") → replaced with the planet-themed engine.

**Implementation:**
- **NEW `lib/notificationsService.ts`** — the whole feature. `WEEKDAY[0..6]` themes, 3 morning + 3 evening
  variants each (= **42 morning + 42 evening**); variant rotates by ISO week so the same weekday reads
  differently week to week. `needs:'sign'` lines auto-skip for users without a Kundli (sign === null).
  Moon sign "Cancer (Karka)" is shortened to "Cancer" mid-sentence. **Rolling 14-day window** of
  individually DATE-triggered notifications (not one static DAILY trigger — that would repeat the same text
  forever); `syncDailyReminders()` cancels + rebuilds the window on every app open, so copy never goes stale
  as long as the user opens the app within 2 weeks. Android channel `daily-guidance` (HIGH), gold light.
  Permission requested lazily on first schedule.
- **`app/(tabs)/_layout.tsx`** — `syncDailyReminders({name, moonSign})` in an effect keyed on the active
  profile; guarded on `active?.name` so permission is never requested before onboarding completes.
- **`app/settings.tsx`** — NOTIFICATIONS section with a "Daily guidance" On/Off row (default On, persisted
  to AsyncStorage `ritham.remindersEnabled` via `setRemindersEnabled`). (The `__DEV__` "preview a reminder
  now" button used during bring-up was removed before commit.)
- **`app.json`** — added `["expo-notifications", { "color": "#C5A059" }]`; also added the previously-missing
  `image`/`imageWidth` to the `expo-splash-screen` plugin (a clean `prebuild --clean` failed resource
  linking on `drawable/splashscreen_logo` without it — `android/` is gitignored/CNG so nothing committed
  was lost).

**Rebuild notes (2026-07-09):** `npx expo install expo-notifications` (SDK 57 → `expo-notifications@57.0.3`,
needs `npm_config_legacy_peer_deps=true`), then `prebuild --clean` + `run:android`. Dev launch same as §25 —
`adb reverse tcp:8081 tcp:8081` then relaunch the dev client at `localhost:8081`. `npx tsc --noEmit` passes.

### Not yet done (follow-ups)
- **Option B (deferred, still free):** freshly personalised / chart-accurate daily hook per user via Supabase
  `pg_cron` + Edge Function + Expo Push API + Claude. Post-revenue upgrade; the local engine covers launch.
- Onboarding opt-in for reminders (currently opt-out via Settings; permission is requested on first tab
  mount after a profile exists).
- Times are fixed at 7 AM / 6 PM local; no user-configurable schedule yet.

## 37. Brand assets — new logo + notification icon (DONE, rebuilt on device 2026-07-09)

Swapped in the final Ritham brand mark (gold circular mandala emblem — dotted rings, an
8-pointed north-star, and a Devanagari monogram, on near-black). Source lockup at
`Detailings/Ritham.png` (1254², emblem + "Ritham" wordmark + tagline).

- **Regenerated all icon assets** from the emblem (cropped out of the lockup, wordmark
  excluded — launcher icons should be the symbol). Script kept at
  scratchpad `gen-icons.mjs` (pngjs crop/compose + `@expo/image-utils` resize; sharp not
  installed → jimp fallback). Emblem composited on the source's true background `#080809`
  (NOT `#0B0B0D`) so there is no seam at the crop edge. Sizes: `assets/icon.png` (1024, emblem
  84%), `android-icon-foreground.png` (1024, emblem 64% — inside the adaptive 66% safe circle),
  `android-icon-background.png` (solid `#080809`), `splash-icon.png` (1024, 80%),
  `favicon.png` (48).
- **Notification icon** — the intricate emblem is illegible at 24dp, so `notification-icon.png`
  is a clean geometric **4-point sparkle star** (derived from the logo's central motif,
  supersampled AA, ~12% fill), white-on-transparent so Android tints it with
  `notification_icon_color = #C5A059`. Generated by scratchpad `gen-notif-star.mjs`.
- **`app.json`** — `expo-notifications` plugin now has `"icon": "./assets/notification-icon.png"`
  (+ `color`); `adaptiveIcon.backgroundColor` and `expo-splash-screen.backgroundColor` set to
  `#080809` to match the assets. (This also carries the earlier splash `image`/`imageWidth` fix.)
- Auth-screen "Ritham" wordmark + `AnimatedSplash` are text/vector — unchanged.

**Rebuild (native — icons are prebuild-generated resources):** `prebuild --clean` + `run:android`,
verified on device (launcher mipmaps `ic_launcher*.webp`, `drawable-*/notification_icon.png`,
splash all regenerated; app renders). **Recurring dev-run gotcha:** `npx expo run:android` exits
after install and can leave Metro WEDGED (accepts connections, `/status` hangs, never serves a full
bundle) → app stuck on a black screen. Fix: kill the PID on 8081, `npx expo start` fresh, relaunch
the dev client at `localhost:8081`.

## 38. Brand assets v2 — new LIGHT logo (DONE, rebuilt on device 2026-07-09) — supersedes §37

Replaced the §37 dark emblem with the new brand mark: a gold Devanagari monogram inside a gold
orbital ring of 8 planets, on a **light cream background**. Source `Detailings/Ritham logo.png`
(1254², cream `#FCF5E7`, emblem centered (622,612) ⌀900, central monogram (624,653) ~487px). Because
the mark is designed light and the app's default theme is LIGHT, icons now render on cream, not dark.

- **Regenerated all icon assets** (scratchpad `gen-icons2.mjs`; gold detected as `R-B > 45`). Full
  emblem composited on `#FCF5E7` (seamless): `icon.png` (1024, 88%), `android-icon-foreground.png`
  (1024, **61%** — pulled inside the adaptive safe circle so the ring/planets don't clip),
  `android-icon-background.png` (solid cream), `splash-icon.png` (1024, 84%), `favicon.png` (48).
- **Notification icon** — the full orbital emblem is illegible at 24dp, so `notification-icon.png` is
  the bold central **monogram** silhouette (tight crop inside the ring so no planet slivers leak; alpha
  from goldness `R-B`), white-on-transparent, tinted via `notification_icon_color = #C5A059`.
- **`app.json`** — `adaptiveIcon.backgroundColor` and `expo-splash-screen.backgroundColor` moved
  `#080809` → `#FCF5E7` to match the light assets. `expo-notifications` icon config unchanged.
- Auth-screen "Ritham" wordmark + `AnimatedSplash` are text/vector — unchanged.

Rebuild = `prebuild --clean` + `run:android` (native, icons are prebuild-generated). Same wedged-Metro
gotcha as §37 applies on dev launch.

## 39. Splash startup — trimmed animation (DONE, JS-only, 2026-07-09)

User reported the startup splash felt long. Cold start is three stacked phases: (1) native splash
(logo on cream) — held until fonts+theme load, AND in DEV also held while Metro bundles ~2000 modules
(`Android Bundled 10–44s` — a **dev-only** artifact, gone in a release build since Hermes bytecode
loads from disk; `hermesEnabled=true` already), (2) `AnimatedSplash` wordmark animation, (3) `AuthGate`
loading until `supabase.auth.getSession()` (cached/fast, 5s timeout fallback).

Only phase 2 is tunable and real in production, so **`components/AnimatedSplash.tsx` was trimmed
~3.07s → ~1.3s**: wordmark reveal 0.9→0.5s; the gold line + tagline now animate together (0.34s) instead
of sequentially (was 0.56+0.5s); hold 0.65→0.16s; fade 0.46→0.3s. All visual beats kept. No rebuild
(JS-only; fast-refresh + app relaunch). **Takeaway for judging startup: build a RELEASE APK — the long
"logo" wait in dev is Metro bundling, not the app.** Untouched: native splash + AuthGate (fine for v1).

## 40. "Stellar Velocity" rebrand — magenta/violet UI + Home redesign + rotating-ring splash (2026-07-10)

Full visual pivot away from the §38 Behrouz black+gold/cream luxury look to a punchy, high-CTR
**Cyber Magenta + Neon Violet** identity (Swiggy-style gradient rebrand). Reference target: a violet→
magenta gradient header with an overlapping white "reading" card + feature cards. Default theme flipped
to **DARK** (`context/ThemeContext.tsx` initial state `light`→`dark`). All JS/UI changes are live on
device via fast-refresh — **no native rebuild needed** for them.

- **Palette (`constants/theme.ts`) — one-file recolor.** Kept the legacy token keys but repointed them:
  `gold`=`#FF007F` (Cyber Magenta), `goldLight`=`#FF3D9A`, secondary Electric Amethyst `#7B2CBF`,
  off-white `#F8F9FA` canvas + white cards, near-black `#0D0D1A` text; `goldContrast`=`#FFFFFF` (white
  on magenta fills). New token **`gHeader`** = `['#7B2CBF','#FF007F']` (also `gSplash`). `Accents`
  retuned to a neon family, each gaining a `.grad` two-stop for icon chips. Every screen that reads
  `useColors()` recolored automatically; only Home had hardcoded colors and was rewritten.
- **Home (`app/(tabs)/index.tsx`) rebuilt to the reference.** Violet→magenta `LinearGradient` header
  (brand tile + "Ritham", glass Kundli pill + settings, "TODAY'S COSMIC INSIGHT" eyebrow, date,
  tappable "Hello, {name}" switcher, rounded bottom) → white **AI-Predicted Reading card overlapping**
  the header (marginTop −48) with the moon sign + a 2×2 stat grid (LUCK/LOVE/FOCUS/CAREER, deterministic
  `seededPct(sign+date+metric)` bars — decorative, never AI) + "Read full horoscope" → magenta/violet
  gradient chat promo → free features as a **2-col card grid** (`FeatureCard`: gradient icon chip +
  title + sub), replacing the old black/yellow rectangle rows. Home forces light status-bar via
  `useFocusEffect`+`setStatusBarStyle` (dark header). `AnimatedSplash` splash text switched to white.
- **New logo → assets.** Source `Detailings/ritham logo final.png` (1254², neon magenta/violet
  Devanagari monogram inside a ring of 8 planets, near-white bg). Processed with PowerShell/.NET
  System.Drawing (scratchpad `process_logo.ps1`/`make_icons.ps1`): background color-keyed to transparent,
  then **radially split at r=320** (glyph ≤ r306, ring ≥ r335 — clean gap) into `logo-center.png`
  (static glyph+bindu) + `logo-ring.png` (orbiting planets), plus `logo-transparent.png`. Regenerated
  `icon.png` (opaque), `splash-icon.png`/`favicon.png`/`notification-icon.png` (transparent),
  `android-icon-foreground.png` (padded 18% for adaptive safe zone). Home header + chat-promo now use
  `logo-transparent` inside light tiles (contrast on the magenta gradient).
- **Animated splash — rotating ring.** `components/AnimatedSplash.tsx` rewritten: dark violet gradient
  bg, `logo-ring.png` in an endless 5.2s linear `Animated.loop` rotation around the static
  `logo-center.png`, wordmark + "VEDIC WISDOM · REIMAGINED" fade up (~2.6s total). Verified rotating on
  device.
- **`app.json`** — splash `backgroundColor` `#FCF5E7`→`#0D0D1A`, `imageWidth` 200→220; `adaptiveIcon`
  bg → `#0D0D1A`; notification `color` `#C5A059`→`#FF007F`; top-level `backgroundColor` → `#0D0D1A`.

### Native splash — BLOCKED on Windows path limit (follow-up)
The old gold logo still flashes for ~1s at cold start because the **native** splash is compiled into the
installed APK. Native res were updated (`android/.../res/values/colors.xml` splash/icon colors → magenta/
dark; all 5 `drawable-*/splashscreen_logo.png` → new neon logo) but **`gradlew :app:installDebug`
FAILS**: `ninja: error: ... RNGestureHandlerDetectorShadowNode.cpp.o: Filename longer than 260
characters` — react-native-gesture-handler new-arch codegen exceeds Windows MAX_PATH. Can't disable new
arch (reanimated v4/worklets require it). `HKLM\...\FileSystem\LongPathsEnabled=0` and the session isn't
admin. **To land the new native splash: build via EAS cloud, OR enable Windows long paths (admin) +
`git config --system core.longpaths true` then rebuild, OR move the repo to a short path (e.g. C:\Ritham).**
Note android/ is gitignored (CNG/prebuild-generated), so these res edits aren't committed — a
`prebuild` from `app.json` regenerates the dark splash + new `splashscreen_logo` from assets anyway.

## 41. Home polish — feature-card fix, blended astrologer promo, data-driven "Glance" (2026-07-10)

Follow-ups on §40 from user review (all JS-only, live via fast-refresh):

- **Feature cards no longer truncate.** Titles were single-line and clipped ("Today's Panc…").
  `app/(tabs)/index.tsx`: shortened names (Panchang, Numerology, **Vakri** [renamed from Retrograde],
  Shubh Muhurat, Live Darshan, Sade Sati), titles now wrap to 2 lines with a reserved `minHeight`
  (40) so every card aligns, and each card gained a top row (gradient icon chip + a small magenta
  tap-arrow chip) for a clearer, less-squashed layout.
- **Astrologer blended into the chat promo.** Source `Detailings/photo-removebg-preview.png` (pre-cut
  transparent portrait — purple saree + Ritham jewelry). Cropped to her bbox via PowerShell/.NET
  (scratchpad `cutout.ps1` did an edge flood-fill cutout of the earlier `photo.png`; the removebg
  version was then just bbox-cropped) → `assets/promo-astrologer.png` (378×454). In the promo she's
  absolutely positioned bottom-right, full-bleed, with a left→right `LinearGradient` scrim
  (`promoAstroFade`, deep-magenta→transparent) so her left edge melts into the card's violet — reads as
  part of the artwork, not a pasted cutout. Text column got `paddingRight` so copy never runs under her.
  Replaced the old white logo tile. **Metro gotcha:** swapping a `require()`d image needs a Metro
  restart with `-c` (stale asset hash otherwise renders nothing).
- **"Your Chart at a Glance" is now genuinely data-driven.** User: the Personality/Wealth/Career cards
  "looked random." Root cause in `config/kundliLifeAreas.ts`: every card used one template ("guided by
  X, sitting in the Nth bhaav — bringing focus to [theme of the *destination* house]"), so a card's
  text often described an unrelated area and never used the rich graha data. Rewrote `buildLifeAreas`
  to take `grahas` (GrahaFact[]) too and, per area, emit: (1) a **ruler** sentence naming the area's
  house lord + its real **dignity** (exalted / own sign / debilitated) + where it sits + what that
  *links this area* to, anchored on the area's OWN theme; (2) a **karaka** sentence — the area's natural
  significator (self→Sun, wealth→Jupiter, career→Saturn, love→Venus, health→Mars) with its true sign,
  house and condition (dignity/retrograde), skipped when the karaka is also the ruler. Same short,
  friendly voice, still 100% deterministic from stored `chart_facts` (no AI/runtime cost). `profile.tsx`
  passes `grahas` into the call. Verified on device against a live chart (Sagittarius lagna: Jupiter own
  sign in 10th, Sun own sign in Leo, etc.).

---

## 42. Home — auto-playing feature carousel replacing the single promo (2026-07-10)

Turned the single "Got a question?" chat promo into an **auto-playing carousel** cycling through every
feature, keeping the exact same card look. New `components/FeatureCarousel.tsx` (`FeatureCarousel` +
`CarouselSlide`), wired into `app/(tabs)/index.tsx` (slides built with the router handlers; the block sits
in a `carouselWrap` with `marginHorizontal: -Spacing.lg` to break out of the body padding to full width).

- **Slides (9):** Chat (unchanged — first) → Panchang → Numerology → Shubh Muhurat → Live Darshan → Vakri
  → Sade Sati → Store → Reports. Each keeps the violet→magenta gradient, badge + title + sub + white CTA
  pill, and a blended hero photo on the right with the same left→right scrim as the astrologer promo.
- **Behaviour/animation:** horizontal `Animated.FlatList`, `snapToInterval` with a small PEEK so the next
  card shows; auto-advances every 4.2s and loops; pauses on drag, resumes after; neighbours **scale+fade**
  via a `scrollX` interpolation; **animated pagination dots** (active dot widens); each hero image does a
  gentle **floating bob** (`Animated.loop` translateY, native driver). Per-slide `still` flag disables the
  float — set on the **chat astrologer** (user wanted her static). `imageBottom` anchors the person to the
  bottom; objects are centered. Hero art uses `resizeMode: contain` in a fixed right box so any aspect fits.
- **Gotcha:** `scrollX` also drives the dot **width** (a layout prop), so the `onScroll` `Animated.event`
  must use `useNativeDriver: false` — otherwise RN warns "Style property 'width' is not supported by the
  native animated module". The float loop uses its own value with the native driver (no conflict).
- **Images:** user generated 8 feature photos in Gemini (magenta/violet neon, transparent bg) →
  `Detailings/<name>.png.png`. Cropped each to its alpha bounding box via PowerShell/.NET (scratchpad
  `crop_carousel.ps1`) → `assets/carousel/{panchang,numerology,muhurat,darshan,vakri,sadesati,store,reports}.png`.
  Chat reuses `assets/promo-astrologer.png`. **Swapping `require()`d images needs a Metro restart with `-c`**
  (stale asset hash renders nothing otherwise).

---

## FUTURE FEATURE (planned, not built): Live AI Voice Astrologer — costs & pricing

Reference notes from planning (2026-07-10) for a **voice-only, real-time AI astrologer call in Indian
regional languages**, running alongside the existing text chat. Claude is the "brain"; only the voice
in/out layer is new. Nothing built yet — this is the decision + numbers to build against.

### The pipeline (speech-to-speech)
`user voice → STT (speech-to-text) → Claude Sonnet 5 (astrologer, kundli-grounded) → TTS (text-to-speech) → voice back`,
over WebRTC with turn-taking / barge-in. No video. Reuses the existing chat system prompt + entitlement model.

### Providers
- **Brain:** Claude **Sonnet 5** (already used by `chat` fn). Pricing: $3/$15 per 1M in/out (intro $2/$10
  through 2026-08-31); prompt caching reads ~0.1x. Claude works out to only **~₹1–2/min** — NOT the costly part.
- **Regional STT+TTS:** **Sarvam AI** (sarvam.ai) — built for Indian languages (Hindi, Tamil, Telugu, Kannada,
  Marathi, Bengali, Gujarati, Punjabi, Malayalam, Odia). Google Cloud STT/TTS is the fallback. ElevenLabs =
  best voices but pricey (~₹8–25/min).
- **Real-time orchestration:** self-host **Pipecat** or **LiveKit Agents** on a small always-on server
  (Fly.io/Railway/Render). NOTE: this canNOT live in a Supabase Edge Function (those are short-lived) — needs
  a dedicated voice server. Fast-prototype alternative: managed platform **Vapi/Retell** (bundles orchestration).

### Running cost per minute
- **DIY stack** (Sarvam + Claude + self-hosted Pipecat/LiveKit): **~₹4–6/min** (STT+TTS dominate).
- **Managed** (Vapi/Retell): **~₹9–15/min**. Use only to validate demand, then move to DIY for margin.

### Setup cost (we build it together on Claude Code — code/dev by AI, dashboards by user)
- Dev/code: **₹0** (built together).
- Voice server infra: **₹1,000–1,500/month**.
- Starter prepaid credits (Sarvam + Vapi): **₹3,000–5,000** one-time.
- **Total to launch ≈ ₹5,000 upfront + ~₹1,500/mo.** No license fees; all providers pay-as-you-go.

### Launch market pricing (DECIDED) — priced to fund marketing, not burn
Sell **"voice minutes" packs at an effective ≈ ₹15/min** (mirror the existing time-pack model in
`config/pricing.ts` + `create-order`):
| Pack    | Price | Minutes | ₹/min |
|---------|-------|---------|-------|
| Taster  | ₹49   | 3       | ₹16   |
| Popular | ₹149  | 10      | ₹15   |
| Value   | ₹399  | 28      | ₹14   |

- Cost ~₹5/min, sell ~₹15/min → **~3x margin, ~₹10/min gross profit** = the ad/marketing budget.
- Still ~half of human-astrologer apps (₹30–50/min), so easy to sell.
- Managed stack must instead retail ₹20–30/min to stay profitable.

### Build checklist when we start
1. Voice-agent server (Pipecat/LiveKit Agents) wiring STT→Claude→TTS + VAD/turn-taking/barge-in.
2. Deploy to Fly.io/Railway (always-on). Secrets: SARVAM key, ANTHROPIC key, LIVEKIT/transport.
3. RN client: call screen + WebRTC (LiveKit or Daily RN SDK) + mic permissions + audio session.
4. Meter per-minute via the existing time-based entitlement pattern (reuse `entitlements_ledger` /
   `payment_orders` / `create-order` + Razorpay); add "voice minutes" packs to `config/pricing.ts`.
5. Reuse the kundli-grounded system prompt + GREETING from `supabase/functions/chat/index.ts`.
