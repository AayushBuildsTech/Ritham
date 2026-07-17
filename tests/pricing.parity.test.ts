// Pricing parity — the client price list (config/pricing.ts) must never drift from
// the SERVER source of truth (create-order recomputes the amount; verify-payment
// grants the entitlement). A mismatch is a money bug: the class of regression that
// migration 022 documented. This reads the actual Edge Function sources as text and
// asserts every client price/grant appears server-side.
//
// Run: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SESSION_PLANS, CALL_PACKS, QUESTION_PACKS, REPORT_PRICES } from '../config/pricing.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const createOrder = readFileSync(join(root, 'supabase/functions/create-order/index.ts'), 'utf8');
const verifyPayment = readFileSync(join(root, 'supabase/functions/verify-payment/index.ts'), 'utf8');

// create-order defines `<id>: { price_paise: N, ... }` — assert client == server price.
function assertServerPrice(src: string, id: string, price: number) {
  const re = new RegExp(`${id}:\\s*\\{[^}]*price_paise:\\s*(\\d+)`);
  const m = src.match(re);
  assert.ok(m, `create-order is missing a price entry for '${id}'`);
  assert.equal(Number(m![1]), price, `price drift for '${id}': client ${price} vs server ${m![1]}`);
}

test('create-order prices match client SESSION_PLANS', () => {
  for (const p of SESSION_PLANS) assertServerPrice(createOrder, p.id, p.price_paise);
});
test('create-order prices match client CALL_PACKS', () => {
  for (const p of CALL_PACKS) assertServerPrice(createOrder, p.id, p.price_paise);
});
test('create-order prices match client QUESTION_PACKS', () => {
  for (const p of QUESTION_PACKS) assertServerPrice(createOrder, p.id, p.price_paise);
});
test('create-order prices match client REPORT_PRICES', () => {
  for (const [type, { price_paise }] of Object.entries(REPORT_PRICES)) {
    assertServerPrice(createOrder, type, price_paise);
  }
});

// verify-payment grants question counts / seconds — assert those match the client too.
function assertServerGrant(src: string, table: string, id: string, value: number) {
  const tableRe = new RegExp(`${table}[^=]*=\\s*\\{([^}]*)\\}`, 's');
  const block = src.match(tableRe);
  assert.ok(block, `verify-payment is missing the ${table} table`);
  const idRe = new RegExp(`${id}:\\s*(\\d+)`);
  const m = block![1].match(idRe);
  assert.ok(m, `verify-payment ${table} is missing '${id}'`);
  assert.equal(Number(m![1]), value, `grant drift for '${id}' in ${table}: client ${value} vs server ${m![1]}`);
}

test('verify-payment QUESTION_PACKS grant counts match client', () => {
  for (const p of QUESTION_PACKS) assertServerGrant(verifyPayment, 'QUESTION_PACKS', p.id, p.questions);
});
test('verify-payment SESSION_PLANS second grants match client', () => {
  for (const p of SESSION_PLANS) assertServerGrant(verifyPayment, 'SESSION_PLANS', p.id, p.seconds);
});
test('verify-payment CALL_PACKS second grants match client', () => {
  for (const p of CALL_PACKS) assertServerGrant(verifyPayment, 'CALL_PACKS', p.id, p.seconds);
});
