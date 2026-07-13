-- Fix: restore 'report' to the entitlements_ledger kind check + reconcile paid orders.
-- Run in Supabase SQL Editor AFTER 001-021. Re-runnable.
--
-- Regression: 020_voice_calls.sql re-created entitlements_ledger_kind_check as
-- ('questions','time','call') — accidentally dropping 'report' that 008 had added.
-- (payment_orders_kind_check kept 'report', so orders + Razorpay checkout succeed,
-- but verify-payment's entitlement INSERT with kind='report' hit a check violation
-- → grant_failed → the client showed "Payment not completed" for EVERY report type.)
--
-- This migration:
--   1. widens entitlements_ledger.kind back to include 'report' (keeping 'call'),
--   2. grants the missing entitlement for any already-paid report order that never
--      got one (idempotent — the unique index on order_id prevents double-grants).

-- 1. widen the kind check to include 'report' again
alter table public.entitlements_ledger drop constraint if exists entitlements_ledger_kind_check;
alter table public.entitlements_ledger add  constraint entitlements_ledger_kind_check
  check (kind in ('questions','time','report','call'));

-- 2. reconcile: back-grant entitlements for paid report orders that are missing one
insert into public.entitlements_ledger (user_id, order_id, kind, plan_id, amount_paise)
select po.user_id, po.id, po.kind, po.plan_id, po.amount_paise
from public.payment_orders po
left join public.entitlements_ledger el on el.order_id = po.id
where po.status = 'paid'
  and po.kind = 'report'
  and el.id is null;
