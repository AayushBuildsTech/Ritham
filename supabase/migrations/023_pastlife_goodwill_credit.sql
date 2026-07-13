-- One-time goodwill grant: a complimentary 'pastlife' report credit for users who
-- already PAID for a Past Life report but received the fallback narration (a transient
-- Claude failure) before the prompt/regeneration fix. Run AFTER 001-022. Re-runnable.
--
-- Safe & idempotent: grants a fresh unconsumed credit ONLY to users who paid for a
-- pastlife report and do NOT already hold an unused pastlife credit. order_id is left
-- NULL (Postgres treats NULLs as distinct, so the unique index on order_id is fine),
-- marking this as a complimentary (non-order) grant.

insert into public.entitlements_ledger (user_id, order_id, kind, plan_id, amount_paise)
select distinct po.user_id, null::uuid, 'report', 'pastlife', 0
from public.payment_orders po
where po.kind = 'report'
  and po.plan_id = 'pastlife'
  and po.status = 'paid'
  and not exists (
    select 1 from public.entitlements_ledger el
    where el.user_id = po.user_id
      and el.kind = 'report'
      and el.plan_id = 'pastlife'
      and el.consumed_at is null
  );
