// Maps raw Supabase auth errors to calm, human copy for the sign-in screens.
// We never show the raw provider string to users (it leaks internals and reads
// like a bug). Match on message text + HTTP status, fall back to a safe generic.

export function friendlyAuthError(err: unknown): string {
  const e = err as { message?: string; status?: number; code?: string } | null;
  const raw = (e?.message ?? '').toLowerCase();
  const status = e?.status;

  if (!raw && status == null) return 'Something went wrong. Please try again.';

  // no connectivity / request never reached Supabase
  if (/network|failed to fetch|fetch failed|timeout|timed out|connection/.test(raw)) {
    return 'Couldn’t reach the server. Check your internet connection and try again.';
  }
  // rate limiting (Supabase returns 429 + "For security purposes, you can only request this after N seconds")
  if (status === 429 || /rate limit|too many|only request this after|for security purposes/.test(raw)) {
    return 'Too many attempts. Please wait a minute before trying again.';
  }
  // Google sign-in rejected / cancelled by the provider
  if (/cancel|dismiss|denied|access_denied/.test(raw)) {
    return 'Sign-in was cancelled. Please try again.';
  }
  // server-side / provider issues
  if (status != null && status >= 500) {
    return 'Our service is briefly unavailable. Please try again in a moment.';
  }
  return 'Something went wrong. Please try again in a moment.';
}
