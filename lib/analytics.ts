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
  | 'chat_history_opened'
  | 'chat_history_session_opened'
  | 'chat_history_deleted'
  | 'purchase'
  | 'report_generated'
  | 'report_started'
  | 'report_purchased'
  | 'report_downloaded'
  | 'palm_started'
  | 'palm_hint_shown'
  | 'palm_purchased'
  | 'palm_generated'
  | 'panchang_viewed'
  | 'numerology_viewed'
  | 'retrograde_tracker_viewed'
  | 'sadesati_tracker_viewed'
  | 'retrograde_chat_hook_clicked'
  | 'sadesati_chat_hook_clicked'
  | 'home_hook_clicked'
  | 'muhurat_opened'
  | 'muhurat_activity_selected'
  | 'muhurat_results_viewed'
  | 'muhurat_funnel_clicked'
  | 'darshan_opened'
  | 'darshan_temple_clicked'
  | 'dream_viewed'
  | 'dream_symbol_picked'
  | 'family_member_added'
  | 'family_member_removed'
  | 'active_profile_switched'
  | 'kundli_shared'
  | 'horoscope_shared'
  | 'puja_viewed'
  | 'puja_detail_viewed'
  | 'puja_book_started'
  | 'call_start'
  | 'call_ended'
  | 'language_selected'
  | 'language_changed';

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
