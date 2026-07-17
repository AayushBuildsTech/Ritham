# Ritham — Pre-Production Security & Readiness Audit

**Date:** 2026-07-17
**Auditor:** Elite engineering review (staff eng / security / DevSecOps / SRE / Play compliance)
**Commit:** `541437b` (branch `main`)
**App:** Expo SDK 57 / React Native 0.86 / React 19.2 · Supabase (Postgres + Edge Functions) · Razorpay · Anthropic Claude · Vapi (voice)

---

## 0. Scope & Methodology (honest depth statement)

This audit is **evidence-based** — every finding below cites a real file and line. To spend the budget where risk lives, depth was allocated by blast radius:

| Area | Depth |
|---|---|
| Payments (create-order / verify-payment), entitlements, money-table RLS | **Deep** — read line-by-line |
| Auth (Supabase JWT, Google native, account deletion) | **Deep** |
| Row-Level Security across all 27 migrations | **Deep** |
| Edge Functions (all 15) — auth gating, secret handling, abuse | **Deep** |
| Client secret exposure / hardcoded keys | **Deep** (repo-wide grep) |
| Build config (app.json, eas.json, babel, package.json) | **Deep** |
| 40 UI screens, 35 lib services, astronomy engine math | **Light** — spot-checked; not line-by-line verified |
| Runtime performance (cold start, jank, memory, ANR) | **Not measured** — needs on-device profiling |
| Live infra state (which migrations/secrets are actually applied in prod) | **Cannot verify from repo** — flagged as verification items |

I have **not** fabricated per-file 1–10 scores for all 130 files (that would be noise). Modules I read deeply are scored; the rest are called out as "needs deeper pass."

**Headline:** The security & payments *architecture* is genuinely strong — server-authoritative pricing, HMAC verification, idempotent grants, service-role-only writes, owner-scoped RLS, no client secrets. The blockers are **operational/config**, **cost-abuse (no rate limiting)**, **Play data-safety disclosure**, and **near-zero automated tests** — not structural rewrites.

---

## 1. Findings by Severity

### 🔴 HIGH

---

#### H-1 · No application-level rate limiting on any endpoint → AI cost / financial DoS
- **Category:** Security (OWASP API4:2023 Unrestricted Resource Consumption) / SRE / Cost
- **Affected:** all `supabase/functions/*/index.ts`; most acute in `palm-check/index.ts`, `horoscope/index.ts`, `kundli/index.ts`, `panchang/index.ts`
- **Description:** No function implements request throttling. `palm-check` (`palm-check/index.ts:28-45`) calls Claude Haiku **vision** for any authenticated user with **no entitlement check and no cap on call frequency** — only an 8 MB size bound (which *fails open*, `:42`). `horoscope`/`kundli`/`panchang` call paid APIs (Claude / VedAstro) as "free" features; caching reduces repeat cost but new profiles/inputs bypass the cache.
- **Risk:** With "thousands of users" and free Google sign-up, a single actor (or script farming free accounts) can drive an unbounded Anthropic/VedAstro bill. This is a direct financial-availability risk.
- **Reproduce:** Auth as any user → loop `POST /functions/v1/palm-check` with a 5 MB base64 image → every call bills a Claude vision request; nothing stops it.
- **Recommended fix:** Add a per-user (and per-IP) sliding-window limiter backed by a Postgres table or Supabase's built-in rate limiting / an edge KV. Gate `palm-check` behind a cheap per-day quota (e.g. 10/day/user). Set a hard monthly spend alarm on the Anthropic and VedAstro accounts.
- **Estimated impact:** Prevents runaway spend; protects margin at scale.

---

#### H-2 · `voice-webhook` auth fails open when `VAPI_WEBHOOK_SECRET` is unset
- **Category:** Security (Broken Auth on a state-mutating webhook)
- **Affected:** `supabase/functions/voice-webhook/index.ts:39`
- **Description:** `if (VAPI_WEBHOOK_SECRET && req.headers.get('x-vapi-secret') !== VAPI_WEBHOOK_SECRET) return 403`. If the secret is **not configured**, the guard is skipped entirely and the endpoint accepts anonymous POSTs that end call sessions and decrement entitlements.
- **Risk:** If the secret is missing in prod, an attacker who knows/guesses a `callSessionId` (UUID) can forge an `end-of-call-report` — e.g. report `durationSeconds: 0` to avoid being billed for consumed call time (free calls), or end others' active sessions. The compare is also not constant-time (minor).
- **Reproduce:** Unset the secret → `POST /voice-webhook` with `{message:{type:'end-of-call-report', call:{metadata:{callSessionId:'<uuid>'}}, durationSeconds:0}}` → session ends, no decrement.
- **Recommended fix:** Fail **closed** — if `VAPI_WEBHOOK_SECRET` is empty, reject all requests (`500 not_configured`). Use a timing-safe comparison. **Verify the secret is set in prod.**
- **Code:**
  ```ts
  if (!VAPI_WEBHOOK_SECRET) return json({ error: 'not_configured' }, 500);
  if (!timingSafeEqual(req.headers.get('x-vapi-secret') ?? '', VAPI_WEBHOOK_SECRET))
    return json({ error: 'forbidden' }, 403);
  ```
- **Estimated impact:** Closes a billing-integrity / session-tampering hole.

---

> **Correction (completion pass):** the astronomy engine *does* have a validation harness (`_shared/astro.test.ts`) checked against astronomical anchors. H-3 stands because that harness (a) isn't wired into CI and (b) covers only the astro math — **payments, entitlements, RLS, and auth remain untested**, which is the money-critical gap.

#### H-3 · No automated tests for the money/auth path (astro engine aside)
- **Category:** QA / Product Reliability
- **Affected:** whole repo — only `supabase/functions/_shared/astro.test.ts` exists; no tests for payments, entitlements, RLS, or auth.
- **Description:** The payment/entitlement pipeline is the highest-value, highest-risk code and has **no regression tests**. Migration `022_fix_entitlements_report_kind.sql` documents a real production incident where a CHECK-constraint change silently broke **every report payment** — exactly the class of bug a test would catch.
- **Risk:** Any refactor to pricing, kind constraints, or the inlined `chat`/`voice-llm` prompt copies can silently break monetization with no safety net.
- **Recommended fix:** Add Deno tests for `verify-payment` (valid sig grants once; invalid sig → failed; retry idempotent), `create-order` (server pricing wins; unknown plan rejected; puja add-on validation), and a SQL test that asserts RLS denies cross-user reads on `profiles`, `payment_orders`, `entitlements_ledger`, `puja_bookings`.
- **Estimated impact:** Prevents money-losing regressions.

---

#### H-4 · Verify live payment keys / applied migrations / required secrets (deployment integrity)
- **Category:** Release / Ops (cannot be confirmed from the repo)
- **Affected:** `create-order/index.ts:11-15` comment says *"test keys for now"*; migrations `025`, `026`, `027`; secrets `ANTHROPIC_API_KEY`, `RAZORPAY_KEY_ID/SECRET`, `VAPI_WEBHOOK_SECRET`, `OWNER_EMAILS`, `OWNER_NOTIFY_URL`, `VOICE_TOKEN_SECRET`.
- **Description:** Several code paths hard-depend on remote state this repo can't see. If Razorpay is still on **test** keys, real checkout fails/collects nothing. If migrations `025/027` aren't applied, puja `create-order` inserts fail on the `kind='puja'` CHECK / missing `gotras` column. If `ANTHROPIC_API_KEY` is unset, chat/report/palm silently return **mock** output (`chat/index.ts:12-14`, `palm-check/index.ts:45`) — a live app shipping placeholder AI answers.
- **Risk:** Broken monetization or placeholder content in production.
- **Recommended fix:** Pre-launch checklist — confirm in the Supabase dashboard: (a) live Razorpay keys, (b) migrations through `027` applied, (c) all secrets present, (d) `x-vapi-secret` + Vapi Server URL configured. Add a `/healthz` function that asserts each secret is present (without echoing values).
- **Estimated impact:** Prevents a dead-on-arrival launch.

---

### 🟠 MEDIUM

---

#### M-1 · Signed voice token logged to device console; `console.*` not stripped in release
- **Category:** Sensitive Data Exposure / Logging / Play readiness
- **Affected:** `lib/callService.ts:82` (logs full `data` incl. the signed `token`); `babel.config.js` (no `transform-remove-console`); other logs at `app/(tabs)/call.tsx:1`, `lib/numerologyService.ts:1`.
- **Description:** `console.log('[call] voice-token resp:', JSON.stringify({ error, data }))` prints the bearer token that authorizes `voice-llm` turns. Babel has no console-stripping plugin, so these ship in the release APK and reach `logcat`.
- **Risk:** Token/PII leakage to device logs (USB debugging, on-device log readers, crash aggregators). Low reach on modern Android but a clear best-practice violation and a Play data-handling smell.
- **Recommended fix:** Remove the token from the log (log only `{ ok, error, kind }`), and add to `babel.config.js` prod env:
  ```js
  env: { production: { plugins: ['transform-remove-console'] } }
  ```
- **Estimated impact:** Removes credential/PII exposure in release logs.

---

#### M-2 · Internal error details returned to the client
- **Category:** Information Disclosure (OWASP API)
- **Affected:** every function's catch block, e.g. `create-order/index.ts:234`, `verify-payment/index.ts:123`, `report/index.ts`, `puja-admin/index.ts:94`, plus `detail: error.message` on DB errors.
- **Description:** Responses include `detail: String(e.message)` / `detail: error.message`, surfacing DB/driver/internal messages (table/column names, constraint names) to any caller.
- **Risk:** Aids reconnaissance (schema/enumeration); leaks internals.
- **Recommended fix:** Return a generic message + a correlation id; log the real detail server-side only. Keep `detail` behind a debug flag.
- **Estimated impact:** Reduces attack-surface intelligence.

---

#### M-3 · No CI/CD, SAST, or dependency scanning
- **Category:** DevSecOps
- **Affected:** repo has no `.github/workflows/`.
- **Description:** No automated build, lint, type-check, test, `npm audit`, or secret-scanning gate. Bleeding-edge deps (RN 0.86, React 19.2, reanimated 4) raise the value of an automated guardrail.
- **Recommended fix:** Add a GitHub Actions pipeline: `tsc --noEmit`, `expo-doctor`, `npm audit --audit-level=high`, Deno test for functions, and a secret scanner (gitleaks). Gate merges to `main`.
- **Estimated impact:** Catches regressions & CVEs before release.

---

#### M-4 · Free-tier anti-abuse degrades to per-account when `deviceId` is absent
- **Category:** Business Logic / Cost abuse
- **Affected:** `chat/index.ts:139-151`, `voice-token/index.ts:146` (`const deviceOk = deviceHash ? … : true`).
- **Description:** The free chat minute / free call are scarce per-account **and** per-device — good. But if the client omits `deviceId`, it falls back to per-account only, so free grants can be farmed by creating many free Google accounts.
- **Risk:** Bounded but real free-AI cost leakage.
- **Recommended fix:** Treat a missing `deviceId` as *not eligible for the free tier* (require the hashed device id), or add a soft IP-based secondary axis.
- **Estimated impact:** Tightens the free-tier cost cap.

---

#### M-5 · Play "Data Safety" + privacy disclosure of third-party processors
- **Category:** Privacy / Play Compliance
- **Affected:** data flows in `report` (palm/floor-plan photos → Anthropic vision), `voice-*` (microphone audio → Vapi/Deepgram/ElevenLabs), all chart features (DOB/time/exact birth place = sensitive PII), Razorpay (payment), analytics `events`.
- **Description:** The app collects **precise personal data** (birth date/time/place), **photos**, and **audio**, and shares them with multiple sub-processors. The Play Data Safety form and the in-app privacy policy must enumerate each category, purpose, and third party.
- **Risk:** Play rejection / removal for a Data-Safety mismatch; GDPR/DPDP (India) exposure.
- **Recommended fix:** Complete Data Safety declaring: personal identifiers, photos, audio, purchases, app activity; list processors (Supabase, Anthropic, Vapi, Deepgram, ElevenLabs, Razorpay, VedAstro, Google). Ensure the privacy policy (already linked in `constants/legal.ts`) names them. Confirm the account-deletion URL is also reachable **off-app** (Play now requires a web deletion path in addition to the in-app one, which exists — `delete-account`).
- **Estimated impact:** Play approval + regulatory alignment.

---

### 🟡 LOW

- **L-1 · CORS `Access-Control-Allow-Origin: '*'` on all functions** (`*/index.ts`). Acceptable for a native app (bearer-token, no cookies), but lock to known origins if a web build ships. — *Info*
- **L-2 · `x-vapi-secret` compare not constant-time** (`voice-webhook/index.ts:39`). Timing side-channel is impractical over HTTP but trivially fixable (see H-2).
- **L-3 · Pricing duplicated in three places** (`config/pricing.ts`, `create-order`, `verify-payment`). Server-authoritative is correct, but drift risk is real — the comments even warn "keep in sync." Consider generating both from one source, or a test asserting parity.
- **L-4 · Inlined prompt copies can drift** — `chat/index.ts` carries a hand-maintained copy of `_shared/brain.ts` (not produced by `inline-functions.mjs`). A parity test would prevent silent divergence.
- **L-5 · Asset optimization** — repo ships many PNGs under `assets/**`; the project's own standard is trimmed WebP. Verify APK size and convert remaining large PNGs. — *Performance / Play app size*
- **L-6 · Bleeding-edge dependency set** (RN 0.86, React 19.2, reanimated 4, worklets 0.10). Pin exact versions and soak-test; new-architecture crashes at scale are hard to reproduce. — *Reliability*

---

## 2. Category Scorecard

| Dimension | Score | Notes |
|---|---:|---|
| **Security** | **78 / 100** | Excellent money/auth/RLS core; loses points for no rate limiting (H-1), webhook fail-open (H-2), error-detail leak (M-2), token logging (M-1). |
| **Architecture** | **82 / 100** | Clean separation, single-source astro engine with deterministic inlining, strong inline documentation. Drift risk in duplicated pricing/prompt copies. |
| **Performance** | **Not measured** | No on-device profiling done. Provisional 70/100 pending cold-start/jank/ANR/memory traces and asset (WebP) optimization. |
| **Code Quality** | **82 / 100** | Readable, well-commented, security intent stated in-code. TS throughout. |
| **Production Readiness** | **60 / 100** | No monitoring/crash reporting, no CI, ~0 tests, manual puja fulfillment, unverified secrets/migrations. |
| **Google Play Readiness** | **68 / 100** | In-app account deletion ✓, minimal justified permissions ✓; must finish Data Safety (M-5), confirm live keys (H-4), strip debug logs (M-1). |
| **Test Coverage** | **5 / 100** | 1 test file; none for money/auth/RLS. |
| **Overall Security Score** | **78 / 100** | |

---

## 3. Top Priority Fixes (ranked)

1. **H-1** Add rate limiting + entitlement/quota gate to `palm-check` and all AI/VedAstro endpoints; set spend alarms.
2. **H-4** Verify prod: live Razorpay keys, migrations ≤027 applied, all secrets set, `ANTHROPIC_API_KEY` present (no mock in prod).
3. **H-2** Make `voice-webhook` fail **closed**; confirm `VAPI_WEBHOOK_SECRET` is set; timing-safe compare.
4. **M-5** Complete Play Data Safety + privacy disclosure of all sub-processors; confirm web deletion path.
5. **M-1** Remove voice-token from `callService.ts:82` log; add `transform-remove-console` for production.
6. **H-3** Add tests for verify-payment (grant-once/idempotent/invalid-sig), create-order pricing, and RLS cross-user denial.
7. **M-2** Stop returning internal `detail` to clients; log server-side with a correlation id.
8. **M-3** Add CI: type-check, `npm audit`, gitleaks, Deno function tests.
9. **M-4** Require hashed `deviceId` for free-tier eligibility.
10. **L-3/L-4** Add a parity test for pricing tables and the `brain.ts` ↔ `chat/index.ts` prompt copies.
11. **L-5** Convert remaining large PNG assets to WebP; check APK size.
12. **L-6** Pin exact dep versions; soak-test the new architecture.

---

## 4. Release Blockers (must clear before public launch)

- [ ] **H-4** Live Razorpay keys + `ANTHROPIC_API_KEY` set (no mock AI) + migrations ≤027 applied + all secrets present.
- [ ] **H-2** `voice-webhook` fails closed and `VAPI_WEBHOOK_SECRET` confirmed set.
- [ ] **H-1** Rate limit / quota on `palm-check` + AI endpoints, with an Anthropic/VedAstro spend cap alarm.
- [ ] **M-5** Play Data Safety form + privacy policy list every data category and sub-processor.
- [ ] **M-1** Voice token removed from logs; `console.*` stripped in release build.
- [ ] Add **crash reporting** (Sentry/Crashlytics) before "thousands of users" — currently none, so production crashes are invisible.

---

## 5. Nice-to-Have / Technical Debt

- Single-source the pricing tables and the astrologer prompt (generate the `chat` copy from `brain.ts`).
- Add structured server logging + a `/healthz` secret-presence probe.
- Introduce feature flags / remote config for kill-switching the AI features if spend spikes.
- Backfill unit tests for the astronomy engine edge cases (timezones, DST, pre-1970 DOB, high latitudes).
- Verify accessibility (TalkBack labels, 4.5:1 contrast, 48dp touch targets) across screens — not audited in depth.

---

## 6. Compliance Summary

| Item | Status |
|---|---|
| In-app account & data deletion | ✅ `delete-account` (cascades + storage + auth identity + Google revoke) |
| Secrets committed to git | ✅ None (`.env.local` gitignored; repo-wide grep clean) |
| Client hardcoded keys | ✅ None (only public `EXPO_PUBLIC_*`) |
| RLS on user tables | ✅ Owner-scoped `select`; all writes service-role only |
| Payment integrity | ✅ Server pricing + HMAC + idempotent grants + timing-safe compare |
| Medical/death-prediction guardrails | ✅ Enforced in `brain.ts` system prompt |
| Data Safety disclosure | ⚠ Must complete (M-5) |
| Rate limiting / abuse controls | ❌ Missing (H-1) |
| Crash reporting / monitoring | ❌ Missing |
| Automated tests / CI | ❌ Missing (H-3, M-3) |

---

## 7. Final Verdict

### ❌ NOT READY FOR PRODUCTION *(as-is)* — but close.

The **core is production-grade**: server-authoritative payments, HMAC verification, idempotent entitlement grants, owner-scoped RLS with service-role-only writes, no committed or hardcoded secrets, a proper in-app deletion path, and thoughtfully documented security intent. That is better than most apps reach at launch.

It is **not yet releasable to "thousands of users"** because of a small, well-defined blocker set that maps to real financial/availability/compliance risk: **no rate limiting on paid AI endpoints (H-1)**, a **fail-open payment/session webhook (H-2)**, **unverified live keys/migrations/secrets (H-4)**, **incomplete Play Data Safety disclosure (M-5)**, **credential logging (M-1)**, and **no crash reporting or automated tests**. None require re-architecture; most are configuration, a limiter, and disclosure.

**Clear the § 4 blocker list → the verdict moves to ⚠ READY WITH MINOR FIXES, then ✅.**

---

*Verification items I could not confirm from the repo (need dashboard/runtime access): actual Razorpay key mode, which migrations are applied in prod, which Edge secrets are set, on-device performance (cold start/jank/ANR/memory), APK size, and accessibility conformance.*

---

## 8. Remediation Log — pass 1 (code changes committed this session)

> These are **code fixes**; the Edge Functions and the new migration must be **deployed/applied** to take effect in production (see deploy checklist below).

| Finding | Status | Change |
|---|---|---|
| **H-1** Rate limiting | ✅ Code | New migration `028_rate_limiting.sql` (atomic `rate_limit_hit` fixed-window counter, deny-all RLS). Gated `palm-check` (30/day), `kundli` (40/day), `horoscope` (100/day) per user; limiter **fails open** on error so it never blocks a genuine user. |
| **H-1b** `kundli` had no in-code JWT check | ✅ Code | *New finding during remediation.* `kundli/index.ts` only checked the `Bearer ` prefix, relying solely on the gateway toggle. Added real `getUser()` verification (defense-in-depth) + the rate-limit bucket. |
| **H-2** `voice-webhook` fail-open | ✅ Code | Now fails **closed** when `VAPI_WEBHOOK_SECRET` is unset; uses a constant-time compare. |
| **M-1** Token logging / console in release | ✅ Code | `callService.ts` no longer logs the token/full payload (only `ok`/`kind`/`error`). `babel.config.js` strips `console.*` in production via `transform-remove-console` (added to `devDependencies` — **run `npm install`**). |
| **M-2** Internal error detail leakage | ✅ Code | Removed `detail: <exception/DB message>` from every error **response** across all 13 functions; the detail is now `console.error`-logged server-side only. (Legitimate astro-domain `detail:` content left untouched.) |

**Still open (not yet done):** H-3 (tests), H-4 (verify live keys/migrations/secrets), M-3 (CI), M-4 (device-id required for free tier), M-5 (Play Data Safety), crash reporting.

### Deploy checklist for pass-1 fixes
1. Apply migration `028_rate_limiting.sql` in the Supabase SQL editor.
2. Redeploy Edge Functions: `palm-check`, `kundli`, `horoscope`, `voice-webhook`, and (error-detail change) `create-order`, `verify-payment`, `puja-admin`, `delete-account`, `report`, `chat`, `voice-token`, `voice-llm`, `panchang`, `muhurat`.
3. Confirm `VAPI_WEBHOOK_SECRET` is set (voice-webhook now rejects all calls without it).
4. `npm install` (pulls `babel-plugin-transform-remove-console`) before the next release build.
5. Smoke-test: a normal palm/kundli/horoscope call still works; a burst trips `429 rate_limited`; a voice call completes and the webhook decrements correctly.

## 9. Remediation Log — pass 2 (deployed to production via Supabase CLI)

**Applied to the live project (`eaxdqizerkuqkujxacru`) this session:**

- ✅ **Migration `028_rate_limiting.sql` applied** to the remote DB (`supabase db push`). *Note: the push had to route around a pre-existing repo bug — two migration files share version `024` (`024_palm_reading.sql` + `024_report_pages.sql`); `db push --include-all` would collide on the `schema_migrations` PK. Tracked as **L-7** below.*
- ✅ **12 of 14 functions redeployed:** `palm-check`, `kundli`, `horoscope`, `chat`, `create-order`, `verify-payment`, `puja-admin`, `delete-account`, `report`, `voice-token`, `panchang`, `muhurat` (JWT verification on); `voice-llm` (`--no-verify-jwt`, Vapi-called).
- ✅ **Smoke-tested:** `palm-check` and `kundli` boot and return `401` without a user JWT; `kundli`'s new in-code `getUser()` now rejects the anon key (previously it passed the `Bearer` prefix check).
- ⏸ **`voice-webhook` NOT deployed** — deliberately held (see H-2 status below).

### Secret inventory (verified via `supabase secrets list`)
| Secret | State | Impact |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ set | **Real AI in prod** (not mock) — resolves that part of H-4. |
| `RAZORPAY_KEY_ID` / `_SECRET` | ✅ set | Present. **Intentionally kept on TEST keys for now** (owner decision, 2026-07-17) to keep testing the app; switching to **live** keys is a deliberate pre-public-launch step, not an oversight. |
| `VEDASTRO_API_KEY`, `VAPI_PUBLIC_KEY`, `VAPI_ASSISTANT_ID`, `VOICE_TOKEN_SECRET`, `VOICE_LLM_URL`, `OWNER_EMAILS` | ✅ set | OK. |
| **`VAPI_WEBHOOK_SECRET`** | ❌ **NOT set** | **Confirms H-2 is live** — the deployed webhook currently authenticates nothing. |
| `OWNER_NOTIFY_URL` | ❌ not set | Puja owner notifications are a silent no-op (bookings still visible in dashboard). Operational, not security. |

### H-2 status: BLOCKED on Vapi-side coordination (cannot be completed from the repo)
`VAPI_WEBHOOK_SECRET` is unset **and** Vapi is (therefore) not sending an `x-vapi-secret` header. Neither "set the secret" nor "deploy the fail-closed webhook" is safe alone — either one, done in isolation, makes the live webhook reject Vapi's real end-of-call reports, which **breaks call-time metering** (paid call seconds would stop decrementing = revenue leak). Both sides must be changed together:
1. In the **Vapi dashboard**, set a Server-URL/Server-Message secret (a strong random value) so Vapi sends it as `x-vapi-secret`.
2. `npx supabase secrets set VAPI_WEBHOOK_SECRET='<same value>'`.
3. `npx supabase functions deploy voice-webhook --no-verify-jwt`.
4. Make a test call; confirm the webhook returns `200` and `seconds_used` decrements.

Until step 1 is done, the fail-closed code is committed but intentionally **not deployed**; the live webhook remains fail-open (the H-2 risk persists but metering keeps working).

---

## 10. Remaining-areas audit (completion pass)

Coverage of the categories not yet reported. New findings below; existing scores updated in § 11.

### 🟠 M-6 · 59 MB of un-optimized raster assets (violates the project's own WebP standard) — ✅ RESOLVED
> **Status (2026-07-17):**
> - **Pass 1 (lossless):** all 25 content PNGs >1 MB → lossless WebP (pixel-identical); refs repointed. 55.4 MB → 36.6 MB.
> - **Pass 2 (lossy q90):** the 8 temple + 9 report photographic images → visually-identical q90 WebP (full res kept; spot-checked). 27.0 MB → 4.3 MB.
> - **Pass 3 (high-quality q95):** the 4 store cutouts + guru portrait + login hero + palm banner → crystal-clear q95 WebP, alpha kept lossless (full res + transparency preserved; face + cutout spot-checked, no artifacts). 8.9 MB → 3.0 MB.
> - **Net: all 25 large images ≈59 MB → ≈8 MB (~−51 MB, ~86%).** Launcher/splash/notification icons intentionally remain PNG (Android requirement). M-6 fully resolved.

- **Category:** Android Performance / Play app size
- **Affected:** `assets/**` — 55 raster files totalling **59.2 MB**; **25 PNGs exceed 1 MB** (e.g. `assets/guru/guru-portrait.png` 2.9 MB, `assets/store/store-hero.png` 2.9 MB, most `assets/store/*` and `assets/temples/*` 2–2.9 MB). Only 29 assets are WebP.
- **Description:** These ship inside the app bundle, so the install size balloons (raster payload alone ≈ 59 MB → APK/AAB likely 80 MB+). The project already mandates "trimmed WebP, never multi-MB PNGs."
- **Risk:** Lower install conversion, slow first paint on the screens that load these, more data usage — at "thousands of users" this is real drop-off.
- **Reproduce:** `git ls-files assets | grep .png` → 25 files > 1 MB.
- **Recommended fix:** Convert the 25 large PNGs to sized WebP (Pillow, quality ~80, dimension-capped to their on-screen size). Expected saving ~40–50 MB. Keep alpha where needed (`guru-portrait`, icons).
- **Estimated impact:** Materially smaller download; faster image screens.

### 🟠 M-7 · No accessibility annotations anywhere (screen-reader unusable)
- **Category:** Accessibility (WCAG / Play "Accessibility" best practice)
- **Affected:** all `app/**` + `components/**` — **0** occurrences of `accessibilityLabel` / `accessibilityRole` / `accessibilityHint` / `accessibilityState`.
- **Description:** The UI is icon-heavy (custom `Icon` component, gradient `Pressable` cards, no text on many controls). With no labels, TalkBack announces controls as unlabeled/generic, and state (selected/disabled) isn't conveyed.
- **Risk:** App is effectively unusable for blind/low-vision users; fails an accessibility review and excludes a user segment.
- **Recommended fix:** Add `accessibilityRole="button"` + a meaningful `accessibilityLabel` to every `Pressable`/icon control (Settings rows, tab bar, paywall buttons, carousel, call orb). Add `accessibilityState={{ selected, disabled }}` to segmented controls. Verify contrast (the magenta-on-dark theme) meets 4.5:1 and touch targets are ≥ 48 dp.
- **Estimated impact:** Opens the app to assistive-tech users; passes a11y review.

### 🟡 L-8 · 14 moderate npm-audit advisories (build-time tooling)
- **Category:** Dependencies / Supply chain
- **Affected:** `@expo/config-plugins` (transitive via `expo-sharing`, `expo-splash-screen`). `npm audit`: **14 moderate, 0 high/critical.**
- **Description:** The advisories are in Expo **build-time** config plugins, not runtime app code, so device exposure is low. Still worth clearing before launch.
- **Recommended fix:** `npm audit` review; bump Expo patch releases when available (`npx expo install --fix`). Don't `npm audit fix --force` blindly (it can cross-grade RN/Expo).

### Areas reviewed with no new blocking findings
- **Client payment flow** (`paymentService.ts`, `reportService.ts`, `palmService.ts`) — clean: client sends only `kind`+`planId` (or the puja payload); price/verify are fully server-side. ✅
- **Pricing parity** — `config/pricing.ts` **matches** the server tables in `create-order`/`verify-payment` today (session, call, question, report). The drift *risk* (L-3) remains because it's hand-synced, but there is no current mismatch. ✅
- **Function slug integrity** — every client `*_FUNCTION` constant resolves to the real deployed slug (`chat`,`kundli`,`horoscope`,`panchang`,`muhurat`,`report`,…); **no orphaned `bright-processor`** exists. The historical rename hazard is not currently live. ✅
- **verify_jwt configuration** — confirmed per-function via `functions list`: app-facing = `true`, `voice-llm`/`voice-webhook` = `false`. Correct. ✅
- **i18n** — dual EN/HI is threaded throughout (`lib/i18n.ts` + `isHindi` branches + server `lang` param to chat/report/horoscope). Broadly complete; a full string-coverage diff wasn't done (recommend a lint that flags untranslated keys).
- **Business logic / dates** — the astro engine defaults birth timezone to `Asia/Kolkata` and stores a per-profile `timezone`; money is integer paise throughout (rule #6). **Not exhaustively verified:** DST/historical-timezone correctness for pre-1970 or non-IST births, and leap/edge dates — these are exactly what the missing unit tests (H-3) should cover.
- **Storage security** — `reports` bucket is private with per-folder `auth.uid()` RLS on all four ops. ✅
- **Notifications / deep links** — `scheme: ritham`, minimal permissions (`RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`), no custom exported intent handlers beyond Expo defaults. Low risk; not deeply fuzzed.
- **Birth-detail input validation** (`app/profile.tsx`) — requires name/gender/full DOB/TOB/place and **rejects impossible calendar dates** (e.g. 30 Feb, line 188). Inputs are structured pickers (no free-text injection); the `kundli` fn re-validates types server-side. ✅
- **Astronomy engine** (`_shared/astro.ts`) — a real validation harness exists (`astro.test.ts`) asserting Sankranti ingress dates, Lahiri ayanamsa range, Rahu/Ketu opposition, and Delhi solstice sunrise/sunset against known values. Strong for the *astro* core (see H-3 correction). ✅
- **`geocoding.ts`** — Open-Meteo (keyless), fixed host, `encodeURIComponent`'d query → no SSRF / no key exposure. ✅
- **`muhurat` fn** — zero AI/provider cost (pure compute), cached per (activity, city, range), and bounded (`MAX_HORIZON` 90d, `MAX_RESULTS` 20). Not a cost-abuse surface. ✅

### 🟡 L-9 · Numerology "Expression" number is 0 for non-Latin names
- **Category:** Business logic / product edge case
- **Affected:** `lib/numerology.ts:55-60` (`expressionFromName`) — strips to `[A-Z]`, so a name entered in Devanagari (Hindi users) reduces to `wrap(0)`.
- **Risk:** The Expression/Destiny number shows as 0, and the meaning lookup (`constants/numerology.ts`) has no entry for 0 → blank/absent guidance for Hindi-script names. Cosmetic, not a crash if the UI guards it — verify it does.
- **Fix:** Transliterate to Latin before mapping, or fall back to the romanised name already captured elsewhere, or hide the Expression card when it can't be computed.

### 11. Updated scorecard (post-completion)

| Dimension | Was | Now | Note |
|---|---:|---:|---|
| Security | 78 | **83** | H-1 rate limiting + kundli auth deployed; H-2 pending Vapi coordination. |
| Architecture | 82 | 82 | Unchanged. |
| Performance | 70* | **62** | 59 MB un-optimized assets (M-6) pulls this down; still no runtime profiling. |
| Code Quality | 82 | 82 | Unchanged. |
| Production Readiness | 60 | **66** | Real AI + keys confirmed set; migration/functions deployed; tests/CI/monitoring still absent. |
| Play Readiness | 68 | 68 | App-size (M-6) and a11y (M-7) offset the deployment progress; Data Safety still pending. |
| **Accessibility** | — | **25** | *New dimension.* No annotations at all (M-7). |
| Test Coverage | 5 | 5 | Unchanged. |

---

## 12. Audit complete — final status

All 20 requested areas have been reviewed. Depth was risk-weighted (payments/auth/RLS/edge functions line-by-line; UI/perf/a11y at survey level with concrete evidence). Nothing critical (data breach / payment bypass / secret leak) was found — the core is well built. The gating issues for a public launch are **operational** (H-2 Vapi coordination, live-key verification, Data Safety, crash reporting), **cost-safety** (H-1 — now deployed), and **quality/coverage** (H-3 tests, M-6 app size, M-7 accessibility).

**Verdict stands: ❌ NOT READY (as-is) → clears to ⚠ once the § 4 blockers + M-5 are done, then ✅ with tests/a11y/asset polish.**

Deployed this session (live now): rate limiting, kundli in-code auth, error-detail hygiene, migration 028. Not deployed (needs you): voice-webhook (H-2). Everything else in § 4/§ 5 is on you to schedule.

---

## L-7 · Duplicate migration version `024` (repo housekeeping)
- **Category:** DevOps / migration hygiene
- **Affected:** `supabase/migrations/024_palm_reading.sql` and `024_report_pages.sql`
- **Description:** Two migrations share the `024` prefix. `supabase_migrations.schema_migrations` keys on version, so only one `024` can be recorded; `db push --include-all` collides. The remote DB already has both effects (idempotent `add column` / `check` widening), so there is no data problem — only a CLI-history hazard.
- **Fix:** Rename `024_report_pages.sql` → `029_report_pages.sql` (its effect is idempotent and order-independent), then `supabase migration repair --status applied 029` if needed. Do this in a dedicated commit.
