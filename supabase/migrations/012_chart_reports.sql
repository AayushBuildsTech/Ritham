-- Phase 7 extension: chart-based single-person reports (life/career/love/health/education).
-- Run in Supabase SQL Editor AFTER 001-011. Re-runnable.
--
-- These 5 chart reports share the same generation pipeline as Vastu/Matchmaking (the `report`
-- Edge Function — which already supports them) but use the user's own cached Kundli chart
-- instead of property/pair data. No new tables; only the `type` check constraint widens.
--
-- Pricing is already in config/pricing.ts (server-side create-order.js mirrors it).
-- The reports table already stores the generated HTML and score for all types.
--
-- This migration is idempotent: ALTER IF NOT EXISTS isn't standard SQL, so we use a DO block.

do $$
begin
  -- Widen the reports.type CHECK to include the 5 chart report types
  alter table public.reports
    drop constraint if exists reports_type_check;

  alter table public.reports
    add constraint reports_type_check
      check (type in ('vastu','matchmaking','life','career','love','health','education'));
end $$;
