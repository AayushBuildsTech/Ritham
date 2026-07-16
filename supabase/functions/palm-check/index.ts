// Edge Function: palm-check
// A CHEAP, pre-payment gate for the Palm Reading feature. Before we show the free
// hint / unlock button, the client sends the picked photo here and we ask a small,
// fast vision model (Claude Haiku) a single yes/no question: "is this a clear human
// palm?". This stops a blurry / non-palm image from ever reaching the ₹99 checkout.
//
// Design:
//  - Auth required (a logged-in user) so the endpoint isn't open to the world.
//  - Uses Haiku (cheap) + tiny max_tokens — a fraction of a rupee per call.
//  - FAILS OPEN: any validator error → { palm: true }. The authoritative check is
//    still the paid `report` vision call, which releases the credit if unreadable —
//    so a validator hiccup must never block a genuine paying user.
//  - Mock passthrough when ANTHROPIC_API_KEY is unset (local dev).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = 'claude-haiku-4-5-20251001'; // small + fast + cheap for a yes/no check

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
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { image, mime } = await req.json();
    if (!image || typeof image !== 'string') return json({ error: 'missing_image' }, 400);
    // Bound the request: base64 is ~4/3 of the byte size. ~8MB base64 ≈ 6MB image.
    if (image.length > 8 * 1024 * 1024) return json({ palm: true, reason: 'skipped_large' }); // fail open

    // No key (local/dev) → let everything through; the paid path self-mocks anyway.
    if (!ANTHROPIC_API_KEY) return json({ palm: true, reason: 'no_key' });

    const mediaType = String(mime ?? '').includes('png') ? 'image/png' : 'image/jpeg';
    const system =
      'You are a strict image validator for a palmistry app. Judge ONLY whether the photo is ' +
      'a clear, in-focus photograph of a HUMAN PALM (the front/inner side of a hand) with the ' +
      'creases and lines visible enough to read. Reject if it is blurry, too dark or overexposed, ' +
      'badly cropped, the BACK of the hand, or not a human palm at all (object, animal, face, screenshot). ' +
      'Reply with ONLY valid JSON, no prose: {"palm": boolean, "reason": string} where reason is a ' +
      'short user-facing hint (max ~12 words) when palm is false.';

    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 80,
          thinking: { type: 'disabled' },
          system,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: 'Is this a clear, readable human palm? Reply only the JSON.' },
            ],
          }],
        }),
      });
    } catch (_e) {
      return json({ palm: true, reason: 'validator_unreachable' }); // fail open
    }
    if (!res.ok) return json({ palm: true, reason: 'validator_error' }); // fail open

    const data = await res.json();
    const text = (data.content ?? []).find((b: any) => b.type === 'text')?.text ?? '';
    const s = text.indexOf('{'); const e = text.lastIndexOf('}');
    let parsed: any = {};
    try { parsed = JSON.parse(s >= 0 && e > s ? text.slice(s, e + 1) : text); } catch { return json({ palm: true, reason: 'unparsed' }); }

    // Only an explicit false blocks the user; anything ambiguous fails open.
    const palm = parsed.palm !== false;
    return json({ palm, reason: palm ? '' : String(parsed.reason ?? '') });
  } catch (e) {
    return json({ palm: true, reason: 'server_error', detail: String((e as Error)?.message ?? e) }); // fail open
  }
});
