// analytics — fire-and-forget product event tracking (Phase 10).
//
// track() must NEVER disrupt UX: it swallows all errors and no-ops when signed
// out. Events land in public.events (RLS: users insert their own only). Uses the
// cached session (no network round-trip) to resolve the user id.

import { supabase } from './supabase';

export type EventName =
  | 'login'
  | 'profile_created'
  | 'chat_message'
  | 'purchase'
  | 'report_generated'
  | 'panchang_viewed'
  | 'numerology_viewed'
  | 'home_hook_clicked'
  | 'muhurat_opened'
  | 'muhurat_activity_selected'
  | 'muhurat_results_viewed'
  | 'muhurat_funnel_clicked'
  | 'darshan_opened'
  | 'darshan_temple_clicked';

export function track(name: EventName, props?: Record<string, unknown>): void {
  // intentionally not awaited by callers — never block the UI on analytics
  (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      await supabase.from('events').insert({ user_id: uid, name, props: props ?? null });
    } catch {
      // analytics is best-effort; ignore failures
    }
  })();
}
