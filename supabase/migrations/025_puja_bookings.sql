-- Phase: Puja Booking — Pitra Dosha Puja at Agni Theertham, Rameswaram
-- Run in Supabase SQL Editor AFTER 001–024. Re-runnable.
--
-- A puja is a FULFILLMENT order, not a consumable entitlement. It reuses the
-- Razorpay rails (payment_orders + create-order/verify-payment) with a new
-- kind 'puja', but writes a puja_bookings row instead of an entitlements_ledger
-- grant. The owner performs the ritual manually on the devotee's behalf, so the
-- booking carries the full sankalp (devotee names, gotra, wish) and prasad
-- delivery address.
--
-- All money is stored in paise (integer), rule #6. Amounts are recomputed
-- server-side from the puja id / tier / add-on ids — the client is never trusted.

-- ─── widen payment_orders.kind to allow 'puja' ───────────────────────────────
-- (entitlements_ledger is intentionally NOT widened: a puja grants no entitlement.)
alter table public.payment_orders drop constraint if exists payment_orders_kind_check;
alter table public.payment_orders add  constraint payment_orders_kind_check
  check (kind in ('questions','time','report','call','puja'));

-- ─── puja bookings (one row per booking; the fulfillment record) ──────────────
create table if not exists public.puja_bookings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  profile_id     uuid references public.profiles(id) on delete set null, -- who it's for
  order_id       uuid references public.payment_orders(id) on delete set null,

  -- what was booked (server-validated against config/pujas.ts mirror)
  puja_id        text not null,                 -- e.g. 'pitra_dosha_rameswaram'
  tier_id        text not null,                 -- 'individual'|'partner'|'family'|'joint'
  add_on_ids     text[] not null default '{}',  -- selected bhet/daan ids
  dakshina_paise integer not null default 0 check (dakshina_paise >= 0),
  amount_paise   integer not null check (amount_paise > 0), -- server-computed total
  currency       text not null default 'INR',

  -- sankalp (the ritual is performed in these names)
  devotee_names  text[] not null default '{}',
  gotra          text,                           -- primary/shared gotra
  gotras         text[] not null default '{}',   -- per-devotee gotras, aligned to devotee_names
  puja_wish      text,

  -- prasad delivery
  want_prasad    boolean not null default true,
  contact_phone  text,
  address        jsonb,                          -- { pincode, city, state, line1, line2 }
  preferred_date date,

  status         text not null default 'pending_payment'
                   check (status in ('pending_payment','paid','in_progress','completed','cancelled','refunded')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_puja_bookings_user   on public.puja_bookings(user_id);
create index if not exists idx_puja_bookings_order  on public.puja_bookings(order_id);
create index if not exists idx_puja_bookings_status on public.puja_bookings(status);

drop trigger if exists trg_puja_bookings_updated_at on public.puja_bookings;
create trigger trg_puja_bookings_updated_at
  before update on public.puja_bookings
  for each row execute function public.touch_updated_at();

-- ─── RLS: clients read their own bookings; all writes go via service role ─────
alter table public.puja_bookings enable row level security;

drop policy if exists "puja_bookings: select own" on public.puja_bookings;
create policy "puja_bookings: select own" on public.puja_bookings
  for select using (user_id = auth.uid());
-- No client insert/update/delete policies: only the service role (Edge Functions)
-- creates bookings (in create-order) and flips their status (in verify-payment).
