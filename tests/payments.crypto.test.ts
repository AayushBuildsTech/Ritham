// Payment verification crypto — the security core of verify-payment.
// These mirror the exact algorithm in supabase/functions/verify-payment/index.ts.
// If verify-payment changes, keep this in sync; the tests assert the security
// PROPERTIES (valid signature accepted, tampered/forged rejected), which is what
// actually protects the money path.
//
// Run: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── copies of verify-payment's crypto (must stay byte-identical in behaviour) ──
async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Razorpay signs `${order_id}|${payment_id}` with the key secret.
const SECRET = 'test_secret_key_do_not_use_in_prod';
const ORDER = 'order_ABC123';
const PAYMENT = 'pay_XYZ789';

test('hmacHex is a deterministic 64-char lowercase hex digest', async () => {
  const a = await hmacHex(SECRET, `${ORDER}|${PAYMENT}`);
  const b = await hmacHex(SECRET, `${ORDER}|${PAYMENT}`);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('a signature made with the right secret verifies', async () => {
  const expected = await hmacHex(SECRET, `${ORDER}|${PAYMENT}`);
  const clientSignature = await hmacHex(SECRET, `${ORDER}|${PAYMENT}`); // what Razorpay returns
  assert.equal(timingSafeEqual(expected, clientSignature), true);
});

test('a tampered payment id is rejected', async () => {
  const expected = await hmacHex(SECRET, `${ORDER}|${PAYMENT}`);
  const forged = await hmacHex(SECRET, `${ORDER}|pay_TAMPERED`);
  assert.equal(timingSafeEqual(expected, forged), false);
});

test('a signature made with the wrong secret is rejected', async () => {
  const expected = await hmacHex(SECRET, `${ORDER}|${PAYMENT}`);
  const wrong = await hmacHex('attacker_guessed_secret', `${ORDER}|${PAYMENT}`);
  assert.equal(timingSafeEqual(expected, wrong), false);
});

test('timingSafeEqual: equal/unequal/length-mismatch', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false); // length differs
  assert.equal(timingSafeEqual('', ''), true);
});
