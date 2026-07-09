-- Security hardening (pre-launch, least privilege). Run in Supabase SQL Editor
-- AFTER 001–016. Idempotent / re-runnable.
--
-- The `reports` table is written ONLY by the `report` Edge Function using the
-- service role (which bypasses RLS). The client never inserts or updates reports
-- directly — it only SELECTs its own rows (listReports / getReport). The client
-- insert/update policies from migration 008 are therefore unnecessary surface: a
-- malicious authenticated user could fabricate or mutate their OWN report rows
-- (no cross-user access, no payment bypass, but not something the app needs).
-- Remove them so writes are strictly server-side, matching payment_orders,
-- entitlements_ledger and chat_* (all select-own-only for clients).

drop policy if exists "reports: insert own" on public.reports;
drop policy if exists "reports: update own" on public.reports;

-- "reports: select own" is intentionally kept — clients read their own reports.
-- RLS stays ENABLED on the table; with no client insert/update policy, those
-- operations are denied for clients while the service-role Edge Function is
-- unaffected (it bypasses RLS).


-- ── horoscopes: close a cross-user read (data leak) ───────────────────────────
-- Migration 007 shipped `horoscopes` as a SHARED per-(sign,period) cache with an
-- open read policy: `for select to authenticated using (true)`. Migration 016 then
-- made horoscopes PER-PROFILE and transit-aware — each row is now keyed by
-- profile_id and its body can reference THAT person's dasha/transits. The open
-- read policy therefore let any authenticated user read every other user's
-- personalised horoscope (and their profile_ids).
--
-- The `horoscope` Edge Function reads/writes this table with the SERVICE ROLE
-- (bypasses RLS) and the client app never reads `horoscopes` directly (it always
-- goes through the function), so restricting client reads to the owner breaks
-- nothing while closing the leak.
drop policy if exists "horoscopes: read for authenticated" on public.horoscopes;
drop policy if exists "horoscopes: select own" on public.horoscopes;
create policy "horoscopes: select own" on public.horoscopes
  for select using (
    profile_id in (select id from public.profiles where user_id = auth.uid())
  );

-- NOTE: panchang_cache and muhurat_cache stay "read for authenticated" on purpose —
-- they are genuinely shared, non-personal caches (per city/day, per rule) with no PII.
