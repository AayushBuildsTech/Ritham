-- Family members: let one account keep multiple people (self + family).
-- The `profiles` table already permits many rows per user (see 004); this adds a
-- relationship label so the app can distinguish the account owner from spouse,
-- children, parents, etc. Everything else (Kundli, chat, horoscope, reports)
-- already works per-profile via profileId. Re-runnable.

alter table public.profiles
  add column if not exists relation text not null default 'self';

-- Keep the label to a known vocabulary (the app supplies it; default is 'self').
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_relation_check') then
    alter table public.profiles
      add constraint profiles_relation_check
      check (relation in (
        'self','spouse','son','daughter','father','mother','brother','sister','friend','other'
      ));
  end if;
end $$;

create index if not exists idx_profiles_user_relation on public.profiles(user_id, relation);

-- Refresh PostgREST's schema cache so the new column is usable immediately
-- (otherwise inserts writing `relation` fail with "could not find the 'relation'
-- column … in the schema cache" until the cache reloads on its own).
notify pgrst, 'reload schema';

-- Existing single-profile users are already 'self' via the column default.
-- RLS from 004 (own-rows only) already covers every family member — no change.
