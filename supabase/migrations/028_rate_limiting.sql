-- Rate limiting for cost-bearing Edge Functions (anti-abuse / spend protection).
-- Run in Supabase SQL Editor AFTER 001-027. Idempotent / re-runnable.
--
-- WHY: functions that call paid third-party APIs (Anthropic vision in palm-check,
-- VedAstro in kundli, Claude in horoscope) were callable by any authenticated user
-- with no per-user throttle → a single actor (or a farm of free Google accounts)
-- could run up an unbounded AI/VedAstro bill. This adds a simple, atomic,
-- fixed-window counter the service-role functions call before doing paid work.
--
-- Design: one row per (bucket) where bucket = "<feature>:<uid>". A single
-- INSERT ... ON CONFLICT statement increments (or resets, once the window has
-- elapsed) and returns the new count — so it is race-safe across isolates.

create table if not exists public.rate_limits (
  bucket     text primary key,
  count      integer     not null default 0,
  expires_at timestamptz not null
);

-- Returns TRUE if this hit is within the allowance, FALSE if the caller is over
-- the limit for the current window. SECURITY DEFINER so it runs regardless of the
-- caller's role; only the service role (Edge Functions) ever calls it.
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_limit  integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits (bucket, count, expires_at)
  values (p_bucket, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (bucket) do update
    set count = case when public.rate_limits.expires_at < now() then 1
                     else public.rate_limits.count + 1 end,
        expires_at = case when public.rate_limits.expires_at < now()
                          then now() + make_interval(secs => p_window_seconds)
                          else public.rate_limits.expires_at end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

-- Lock the table down: no client access at all (functions use the service role,
-- which bypasses RLS). RLS enabled with no policies = deny-all for clients.
alter table public.rate_limits enable row level security;

-- Housekeeping: an index to let a periodic job (or a cron) prune expired rows.
create index if not exists idx_rate_limits_expires on public.rate_limits(expires_at);
