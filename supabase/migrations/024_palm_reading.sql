-- Palmistry × astrology report: Palm Reading ('palm').
-- Run in Supabase SQL Editor AFTER 001-023. Re-runnable.
--
-- Palm Reading reuses the existing `report` Edge Function pipeline. It is VISION-based
-- like Vastu (it reads an uploaded palm photo from the `reports` Storage bucket) and
-- cross-references the user's own cached Kundli chart. No new tables; only the
-- `type` check constraint widens to admit it.
--
-- The money layer is unchanged: purchases use kind='report', plan_id='palm', which the
-- existing payment_orders / entitlements_ledger kind checks already permit (plan_id has
-- no CHECK constraint). Pricing lives in config/pricing.ts (server create-order/index.ts
-- mirrors it: palm = 9900 paise / ₹99).
--
-- Idempotent: uses a DO block that drops and re-adds the constraint.

do $$
begin
  -- Widen the reports.type CHECK to include the palm reading report type
  alter table public.reports
    drop constraint if exists reports_type_check;

  alter table public.reports
    add constraint reports_type_check
      check (type in ('vastu','matchmaking','life','career','love','health','education','pastlife','palm'));
end $$;
