-- Phase 1 (fix): referral-code generation was calling gen_random_bytes(), a
-- pgcrypto function. On Supabase pgcrypto lives in the `extensions` schema,
-- which is NOT on the trigger's search_path during a GoTrue auth insert. That
-- made the BEFORE INSERT referral trigger throw, rolling back signup and
-- surfacing as: 500 "Database error saving new user".
--
-- Fix: build the code from gen_random_uuid(), a built-in core function that is
-- always resolvable regardless of search_path. Behaviour is otherwise identical
-- (8-char uppercase code, look-alike characters replaced, uniqueness enforced).
--
-- Run this in Supabase SQL Editor AFTER 001 and 002. It is re-runnable.

create or replace function public.generate_referral_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  code text;
begin
  loop
    -- gen_random_uuid() is core (pg_catalog) — no extension schema needed.
    -- Take the first 8 hex chars, uppercase them.
    code := upper(replace(substring(gen_random_uuid()::text from 1 for 8), '-', ''));
    -- Remove chars that look alike (0/O, 1/I/l)
    code := replace(replace(replace(replace(code, '0', 'A'), 'O', 'B'), '1', 'C'), 'I', 'D');
    exit when not exists (select 1 from public.users where referral_code = code);
  end loop;
  new.referral_code := code;
  return new;
end;
$$;
