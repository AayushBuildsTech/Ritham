// Edge Function: delete-account
// In-app account + data deletion (Play Store / GDPR requirement — an in-app path,
// not just "email us"). The client calls this from Settings → Danger Zone after a
// double confirmation; on success the client signs out and the AuthGate returns to
// the sign-in screen.
//
// What gets wiped (all via the service role — the caller is the only user affected):
//   1. Storage — every object under the user's `reports/<uid>/` folder (floor plans).
//   2. public.users row — this CASCADES to profiles, chat_sessions, chat_messages,
//      payment_orders, entitlements_ledger and reports (all FK'd on delete cascade,
//      see migrations 004–008). events.user_id is FK'd on delete SET NULL, so past
//      analytics rows survive but are anonymised (de-linked from the person).
//   3. auth.users row — the actual login identity (there is NO FK from public.users
//      → auth.users, so this must be deleted explicitly; deleting one does not
//      cascade to the other).
//
// Secrets: only the standard SUPABASE_* vars (auto-provided). No extra config.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Identify the caller from their JWT — we only ever delete this user.
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const uid = user.id;

    // 1. Remove the user's Storage objects (reports/<uid>/…). Files live one level
    //    deep as `<uid>/vastu-<ts>.<ext>` (see lib/reportService.uploadFloorplan).
    const { data: files } = await admin.storage.from('reports').list(uid, { limit: 1000 });
    if (files && files.length) {
      const paths = files.map((f) => `${uid}/${f.name}`);
      const { error: rmErr } = await admin.storage.from('reports').remove(paths);
      if (rmErr) { console.error('delete-account storage remove failed:', rmErr.message); return json({ error: 'storage_delete_failed' }, 500); }
    }

    // 2. Delete the domain row — cascades all app data (profiles, chat, payments,
    //    entitlements, reports). Do this before removing the auth identity so RLS /
    //    triggers still see a coherent state.
    const { error: rowErr } = await admin.from('users').delete().eq('id', uid);
    if (rowErr) { console.error('delete-account row delete failed:', rowErr.message); return json({ error: 'data_delete_failed' }, 500); }

    // 3. Delete the auth identity itself (the Google login).
    const { error: authErr } = await admin.auth.admin.deleteUser(uid);
    if (authErr) { console.error('delete-account auth delete failed:', authErr.message); return json({ error: 'auth_delete_failed' }, 500); }

    return json({ ok: true });
  } catch (e) {
    console.error('delete-account error:', String((e as Error)?.message ?? e));
    return json({ error: 'server_error' }, 500);
  }
});
