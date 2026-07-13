-- Karmic & spiritual report: Past Life Predictions ('pastlife').
-- Run in Supabase SQL Editor AFTER 001-020. Re-runnable.
--
-- Like the other single-person chart reports (see 012_chart_reports.sql), 'pastlife'
-- reuses the existing `report` Edge Function pipeline and the user's own cached Kundli
-- chart. No new tables; only the `type` check constraint widens to admit it.
--
-- Pricing is already in config/pricing.ts (server-side create-order/index.ts mirrors it).
--
-- Idempotent: uses a DO block that drops and re-adds the constraint.

do $$
begin
  -- Widen the reports.type CHECK to include the pastlife report type
  alter table public.reports
    drop constraint if exists reports_type_check;

  alter table public.reports
    add constraint reports_type_check
      check (type in ('vastu','matchmaking','life','career','love','health','education','pastlife'));
end $$;
