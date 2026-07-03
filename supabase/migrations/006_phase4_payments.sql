-- Phase 4: Payments + entitlements (Razorpay)
-- Run in Supabase SQL Editor AFTER 001–005. Re-runnable.
--
-- Money layer. Two tables:
--   payment_orders     — audit of every Razorpay order we create (server-side).
--                        A row is written BEFORE checkout (status 'created') and
--                        flipped to 'paid' only after the HMAC signature verifies
--                        in the verify-payment Edge Function (non-negotiable rule #3:
--                        never trust the client; verify server-side).
--   entitlements_ledger — one row per VERIFIED paid grant (non-negotiable rule #7).
--                        A question pack grants `questions_total`/`questions_remaining`;
--                        a time pack grants `seconds_total`. The chat Edge Function
--                        (service role) is the only writer of consumption.
--
-- All money is stored in paise (integer), rule #6. Amounts are recomputed
-- server-side from the plan id — the client-sent amount is never trusted.

-- ─── payment orders (audit + verification anchor) ─────────────────────────────
create table if not exists public.payment_orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  kind                text not null check (kind in ('questions','time')),
  plan_id             text not null,                 -- e.g. 'darshan' | 'kiran'
  amount_paise        integer not null check (amount_paise > 0),
  currency            text not null default 'INR',
  razorpay_order_id   text unique,                   -- set once Razorpay returns it
  razorpay_payment_id text,                          -- set on successful verify
  status              text not null default 'created' check (status in ('created','paid','failed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_payment_orders_user on public.payment_orders(user_id);
create index if not exists idx_payment_orders_rzp  on public.payment_orders(razorpay_order_id);

drop trigger if exists trg_payment_orders_updated_at on public.payment_orders;
create trigger trg_payment_orders_updated_at
  before update on public.payment_orders
  for each row execute function public.touch_updated_at();

-- ─── entitlements ledger (one row per verified grant, rule #7) ─────────────────
create table if not exists public.entitlements_ledger (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  order_id            uuid references public.payment_orders(id) on delete set null,
  kind                text not null check (kind in ('questions','time')),
  plan_id             text not null,
  amount_paise        integer not null default 0,
  -- question packs
  questions_total     integer not null default 0,
  questions_remaining integer not null default 0,
  -- time packs
  seconds_total       integer not null default 0,
  consumed_at         timestamptz,                   -- set when fully used up
  created_at          timestamptz not null default now()
);
create index if not exists idx_entitlements_user on public.entitlements_ledger(user_id);
-- one grant per paid order (idempotent verify — a retried verify must not double-grant)
create unique index if not exists uq_entitlements_order on public.entitlements_ledger(order_id);

-- Active question balance: rows with questions left and not consumed.
create index if not exists idx_entitlements_active_q on public.entitlements_ledger(user_id)
  where kind = 'questions' and questions_remaining > 0 and consumed_at is null;
-- Active (unused) time packs.
create index if not exists idx_entitlements_active_t on public.entitlements_ledger(user_id)
  where kind = 'time' and consumed_at is null;

-- ─── RLS: clients read their own money rows; all writes go via service role ────
alter table public.payment_orders      enable row level security;
alter table public.entitlements_ledger enable row level security;

drop policy if exists "payment_orders: select own" on public.payment_orders;
create policy "payment_orders: select own" on public.payment_orders
  for select using (user_id = auth.uid());

drop policy if exists "entitlements: select own" on public.entitlements_ledger;
create policy "entitlements: select own" on public.entitlements_ledger
  for select using (user_id = auth.uid());
-- No client insert/update/delete policies: only the service role (Edge Functions)
-- may create orders and grant/consume entitlements.
