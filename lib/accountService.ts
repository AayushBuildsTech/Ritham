// accountService — client wrapper around the delete-account Edge Function.
//
// Deletes the signed-in user's account and all associated data server-side
// (Storage floor plans + every domain row + the auth identity). The caller is
// the ONLY user affected — the function derives the target from the JWT.
//
// The Edge Function slug below must match what Supabase deployed it as. The
// dashboard "Via Editor" deploy can auto-rename a function (that's how the chat
// fn became `bright-processor`). If delete-account gets a different slug on
// deploy, update DELETE_ACCOUNT_FN here.

import { supabase } from './supabase';

const DELETE_ACCOUNT_FN = 'delete-account';

export interface DeleteAccountResult {
  ok: boolean;
  error?: string; // machine code, e.g. 'unauthorized' | 'storage_delete_failed'
}

export async function deleteAccount(): Promise<DeleteAccountResult> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    DELETE_ACCOUNT_FN,
    { body: {} },
  );
  if (error || !data || data.error || !data.ok) {
    return { ok: false, error: data?.error ?? error?.message ?? 'delete_failed' };
  }
  return { ok: true };
}
