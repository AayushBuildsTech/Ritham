# Ritham — Go-Live Runbook

One-time steps to take the app **fully live**. After you finish A–D below **and add Anthropic
credits**, every feature works end-to-end. All steps are in the **Supabase Dashboard** (SQL Editor +
Edge Functions → "Via Editor") and the **Anthropic Console** — the local `supabase` CLI does not work on
this Windows machine, so the dashboard is the path.

> Code is complete and typechecks (`npx tsc --noEmit` passes). Nothing here needs a native app rebuild —
> all client changes are JS-only (just reload Metro).

---

## 0. Already done (for reference)
- **Migrations run:** `001`–`008`, `012`.
- **Functions deployed:** `bright-processor` (chat), `create-order`, `verify-payment`, `horoscope`,
  `report` (older version — **re-deploy in step B1**).
- **Secrets set:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `ANTHROPIC_API_KEY`.

---

## A. Run the remaining migrations — Supabase → SQL Editor

Open each file under `supabase/migrations/`, copy its full contents into a new SQL query, **Run**.
All are written to be **safe to re-run** (`IF NOT EXISTS` / `CREATE OR REPLACE` / re-runnable), so if
you're unsure whether one already ran, just run it again.

| # | File | What it adds | Note |
|---|------|--------------|------|
| 1 | `009_phase10_analytics.sql` | `events` table (analytics) | Until run, `track()` silently no-ops (app still works) |
| 2 | `010_panchang_numerology.sql` | `panchang_cache` + `profiles.numerology` | Needed by step B2 |
| 3 | `011_muhurat.sql` | `muhurat_cache` | Needed by step B3 |
| 4 | `013_family_members.sql` | `profiles.relation` (family) | Run if not already |
| 5 | `014_fix_user_sync.sql` | user→profile FK sync fix | Run if not already (re-runnable) |
| 6 | `015_chat_history_delete.sql` | delete-own RLS on `chat_sessions` | Run if not already |
| 7 | `016_vedastro_rich_kundli.sql` | VedAstro usage counter + per-profile horoscope cache | **VedAstro integration** (see §E) |

---

## B. Deploy / re-deploy Edge Functions — Supabase → Edge Functions → "Via Editor"

For each: open (or create) the function with the **exact slug** below, paste the file contents, **Deploy**.

> ⚠️ **Slug must match exactly.** When you create a *new* function via the dashboard, it can auto-rename
> it (that's how `chat` became `bright-processor`). After deploying each new one, confirm the slug in the
> dashboard equals the value below. If it differs, either rename it, **or** update the matching client
> constant (listed) and reload Metro.

| # | Slug | Source file | Client constant | New? |
|---|------|-------------|-----------------|------|
| 1 | `bright-processor` | `supabase/functions/chat/index.ts` | `CHAT_FUNCTION` in `lib/chatService.ts` | **re-deploy** (cost guardrails: message + history caps, atomic free-minute) |
| 2 | `report` | `supabase/functions/report/index.ts` (single file — chart engine inlined as `namespace Chart`) | `REPORT_FUNCTION` in `lib/reportService.ts` | **re-deploy** (async generation + JSON hardening + credit claim/input caps) |
| 3 | `panchang` | `supabase/functions/panchang/index.ts` | `PANCHANG_FUNCTION` in `lib/panchangService.ts` | **new** — now VedAstro-sourced (§E) |
| 4 | `muhurat` | `supabase/functions/muhurat/index.ts` | `MUHURAT_FUNCTION` in `lib/muhuratService.ts` | **new** |
| 5 | `delete-account` | `supabase/functions/delete-account/index.ts` | `DELETE_ACCOUNT_FN` in `lib/accountService.ts` | **new** |
| 6 | `kundli` | `supabase/functions/kundli/index.ts` (single file — engines inlined) | `KUNDLI_FUNCTION` in `lib/kundliService.ts` | **new** — VedAstro primary (§E) |
| 7 | `horoscope` | `supabase/functions/horoscope/index.ts` | `HOROSCOPE_FUNCTION` in `lib/horoscopeService.ts` | **re-deploy** — now transit-aware (§E) |

> `bright-processor` is the deployed slug for the chat function (the dashboard auto-named it) — paste
> `chat/index.ts` into the existing `bright-processor` function; don't create a new `chat` function.

**No new secrets** for any of these — `panchang`/`muhurat` are pure compute (no AI), and `delete-account`
uses the auto-injected service-role key.

---

## C. Add Anthropic credits — the "pay" step (your action)

- **console.anthropic.com → Settings → Billing** → add a payment method and **purchase credits**
  (prepaid; a few dollars covers lots of testing). The API key is already set; the account just needs a
  positive balance. Without credits, every AI call returns `400 "credit balance is too low"`.
- Rough cost at Sonnet 5 intro pricing (~$2/$10 per M tok): a full Life report ≈ **$0.08–0.10**; chat
  reply ≈ fractions of a cent; horoscopes are cached and shared across users.

---

## D. Reload the app
Press **`R`** in the Metro terminal (or shake device → **Reload**). JS-only; no rebuild.

---

## E. VedAstro integration (rich Kundli + Panchang data engine) — PROGRESS §35

VedAstro (api.vedastro.org, Swiss Ephemeris) is now the source of truth for the Kundli + Panchang,
behind `kundliService` (spec §0). It is **primary with an automatic local-engine fallback**, so onboarding
never fails even if VedAstro is down/rate-limited.

1. **Migration:** run `016_vedastro_rich_kundli.sql` (§A row 7) — adds the usage counter + per-profile
   horoscope cache column. `kundli_source` is free text, so `'vedastro'` needs no constraint change.
2. **Secret:** Edge Functions → Secrets → add **`VEDASTRO_API_KEY=FreeAPIUser`** (free tier, 5 req/min, no
   card). Upgrade to a paid key later at scale (~₹79/mo) — no code change, just replace the secret value.
3. **Deploy (single-file paste, dashboard):**
   - **`kundli`** (§B row 6) — **new** function; VedAstro primary + local fallback (astro + kundliSummary +
     the `Veda` client are all inlined into the one `index.ts`). Confirm the slug is literally `kundli`.
   - **`panchang`** (§B row 3) — re-deploy the updated file (VedAstro almanac + local fallback).
   - **`horoscope`** (§B row 7) — re-deploy (now per-profile, transit-aware; reads the stored chart, never
     calls VedAstro).
   - **`bright-processor` (chat)** — re-deploy `chat/index.ts` (injects the full VedAstro `chart_facts`;
     fixed so a VedAstro v3 chart is never downgraded).
4. **No app rebuild** (JS-only client) — reload Metro. Existing profiles auto-upgrade to the VedAstro chart
   the next time their Kundli is opened (thin/legacy charts self-heal; the Kundli screen also has a
   **"Refresh with VedAstro"** button for any chart still on the local fallback).
5. **Verify locally first (optional):** `node scripts/vedastro-sample.mjs` hits the live API through the
   real module and prints a rich chart, summary, panchang, numerology, and the chat-grounding proof.

**Rate-limit note (§8):** VedAstro is called only **once per profile** (2 API calls) and **once per city
per day** for Panchang (both cached). The `vedastro_usage` table logs daily call volume so you can watch
free-tier headroom. Chat/horoscope/muhurat never call VedAstro.

---

## Smoke test (on device, after A–D + credits)
- **Chat** — send a message → real Claude reply (no "Preview…" prefix).
- **Home** — horoscope renders; **Panchang**, **Numerology**, **Muhurat** load.
- **Report** — Reports tab → generate a chart report → "Preparing your report…" → renders → **Download** PDF.
- **Family** — add a member, switch the active person (whole app follows).
- **Settings** — Delete account works (use a throwaway login to verify).

---

## Security guardrails

### Enforced in code (active as soon as you deploy `bright-processor` + `report`)
- **No forged entitlements.** `entitlements_ledger` / `payment_orders` are RLS **select-only** for clients
  — only the service-role Edge Functions write them. Payments are verified server-side (HMAC, timing-safe
  compare, amount recomputed from the stored order, idempotent grant).
- **Report credit can't be multiplied.** The paid credit is **claimed atomically before** any Claude call,
  so N concurrent requests off one purchase can't each trigger a (paid) generation; the claim is released
  only if generation fails (retry-safe).
- **Input caps on paid AI calls.** Chat message ≤ 2000 chars + only the last 20 turns are sent to Claude;
  Vaastu questionnaire ≤ 4 KB and floor-plan image ≤ 6 MB; chart `placements` ≤ 30 and person object ≤ 8 KB.
- **Free minute is one per phone**, claimed atomically (no concurrent double-grant).
- **Own-data only.** Every function derives the user from the JWT and filters by it; RLS scopes reports,
  chats, profiles, orders, entitlements, and Storage floor-plans to `auth.uid()`.

### You must set these in the dashboard before real customers (NOT code)
1. **Remove the test OTP `123456`.** Supabase → Authentication → Providers → Phone → **delete the test
   number(s)**. Until then, anyone can log in as any phone number — this is the single biggest hole. (Fine
   for your own testing; must be gone before launch.)
2. **Lock down the `reports` Storage bucket.** Storage → `reports` bucket → set a **file-size limit
   (~6 MB)** and restrict **allowed MIME types to images** (`image/png`, `image/jpeg`). RLS already scopes
   it per-user; this bounds what can be uploaded.
3. **Razorpay → live mode** (when taking real money): live keys + payment webhook, then redeploy
   `create-order`/`verify-payment`. Deferred per PROGRESS §16.
4. **Consider a rate limit** on the AI functions (chat/report) for launch — e.g. a per-user requests-per-
   minute cap (a small `rpm` check against a counter table) — as defence-in-depth beyond the entitlement
   gating. Not required for correctness; entitlements already bound paid spend.

## Notes / not blocking
- **Razorpay is still in TEST mode.** For real customers you'll switch to live keys + add the payment
  webhook, then redeploy `create-order`/`verify-payment` (separate go-live; deferred per PROGRESS §16).
- Pricing is in sync: `config/pricing.ts` ↔ `create-order`. **Any price change → redeploy `create-order`**
  (server recomputes amounts — never trusts the client).
- `report_generated` analytics fires on submit rather than on `ready` (cosmetic; report itself is correct).
