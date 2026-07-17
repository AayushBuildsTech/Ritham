-- Puja slots — the scheduled date for each puja, editable by the owner from the
-- in-app admin (so changing the date needs NO code change / redeploy).
-- One row per puja. `booking_close_at` is the instant bookings stop (3 days
-- before the puja by default). The app reads this to drive the countdown; the
-- create-order Edge Function reads it to reject late bookings.

create table if not exists public.puja_slots (
  puja_id          text primary key,
  puja_date        date not null,
  booking_close_at timestamptz not null,
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_puja_slots_updated_at on public.puja_slots;
create trigger trg_puja_slots_updated_at
  before update on public.puja_slots
  for each row execute function public.touch_updated_at();

-- seed the current slot: 3 Oct 2026, bookings close end of 30 Sep IST
insert into public.puja_slots (puja_id, puja_date, booking_close_at)
values ('pitra_dosha_rameswaram', '2026-10-03', '2026-10-01T00:00:00+05:30')
on conflict (puja_id) do nothing;

-- RLS: any signed-in user may READ the slot (to show the countdown); writes go
-- only through the service role (the owner-gated puja-admin Edge Function).
alter table public.puja_slots enable row level security;

drop policy if exists "puja_slots: read" on public.puja_slots;
create policy "puja_slots: read" on public.puja_slots
  for select using (auth.uid() is not null);
