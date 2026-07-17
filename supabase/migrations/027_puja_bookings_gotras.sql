-- The live puja_bookings table predated the per-devotee `gotras` column (it was
-- created from an earlier version of 025, so `create table if not exists` in the
-- updated 025 skipped it). Add the column to match the current schema. Idempotent.
alter table public.puja_bookings
  add column if not exists gotras text[] not null default '{}';
