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

---

## B. Deploy / re-deploy Edge Functions — Supabase → Edge Functions → "Via Editor"

For each: open (or create) the function with the **exact slug** below, paste the file contents, **Deploy**.

> ⚠️ **Slug must match exactly.** When you create a *new* function via the dashboard, it can auto-rename
> it (that's how `chat` became `bright-processor`). After deploying each new one, confirm the slug in the
> dashboard equals the value below. If it differs, either rename it, **or** update the matching client
> constant (listed) and reload Metro.

| # | Slug | Source file | Client constant | New? |
|---|------|-------------|-----------------|------|
| 1 | `report` | `supabase/functions/report/index.ts` (single file — chart engine inlined as `namespace Chart`) | `REPORT_FUNCTION` in `lib/reportService.ts` | **re-deploy** (async generation + JSON hardening) |
| 2 | `panchang` | `supabase/functions/panchang/index.ts` | `PANCHANG_FUNCTION` in `lib/panchangService.ts` | **new** |
| 3 | `muhurat` | `supabase/functions/muhurat/index.ts` | `MUHURAT_FUNCTION` in `lib/muhuratService.ts` | **new** |
| 4 | `delete-account` | `supabase/functions/delete-account/index.ts` | `DELETE_ACCOUNT_FN` in `lib/accountService.ts` | **new** |

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

## Smoke test (on device, after A–D + credits)
- **Chat** — send a message → real Claude reply (no "Preview…" prefix).
- **Home** — horoscope renders; **Panchang**, **Numerology**, **Muhurat** load.
- **Report** — Reports tab → generate a chart report → "Preparing your report…" → renders → **Download** PDF.
- **Family** — add a member, switch the active person (whole app follows).
- **Settings** — Delete account works (use a throwaway login to verify).

---

## Notes / not blocking
- **Razorpay is still in TEST mode.** For real customers you'll switch to live keys + add the payment
  webhook, then redeploy `create-order`/`verify-payment` (separate go-live; deferred per PROGRESS §16).
- Pricing is in sync: `config/pricing.ts` ↔ `create-order`. **Any price change → redeploy `create-order`**
  (server recomputes amounts — never trusts the client).
- `report_generated` analytics fires on submit rather than on `ready` (cosmetic; report itself is correct).
