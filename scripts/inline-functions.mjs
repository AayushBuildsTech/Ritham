// Regenerate the self-contained (single-file) Edge Functions by inlining the shared
// engine modules into each index.ts.
//
// WHY: these functions are deployed by pasting a single index.ts into the Supabase
// dashboard, which does not upload new `_shared/*.ts` files to the remote bundler (a
// brand-new shared file → "Module not found" at deploy). So each function that uses a
// shared module must be self-contained. The `_shared/*.ts` files stay CANONICAL (used
// directly by muhurat, the Node/tsx tests, and the vedastro-sample proof).
//
// Modules (composed per function, in dependency order):
//   astro          — sidereal astronomy (base; used by everything)
//   kundliSummary  — local rich-chart engine + currentDynamics (chat/horoscope/kundli)
//   vedastro       — the VedAstro API client, wrapped in `namespace Veda` so its
//                    internals never collide with astro/kundliSummary when co-inlined
//                    (kundli/panchang). chat + horoscope do NOT inline it (they only
//                    READ stored data — grep-clean of VedAstro).
//
// WORKFLOW: edit the `_shared/*.ts` originals, then run:  node scripts/inline-functions.mjs
// IDEMPOTENT — strips any previously-inlined block before re-appending.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fnDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions');
const MARKER = '// ═══════════════════════════════════════════════════════════════════════════\n//  INLINED ENGINE';

// ── read + de-import the shared modules ─────────────────────────────────────────
const astro = readFileSync(join(fnDir, '_shared', 'astro.ts'), 'utf8').trim();
const summary = readFileSync(join(fnDir, '_shared', 'kundliSummary.ts'), 'utf8')
  .replace(/^import \{[^}]*\} from '\.\/astro\.ts';\s*$/m, '').trim();
const vedastro = readFileSync(join(fnDir, '_shared', 'vedastro.ts'), 'utf8')
  .replace(/^import \{[^}]*\} from '\.\/astro\.ts';\s*$/m, '').trim();

const MODULES = { astro, kundliSummary: summary, vedastro };

function engineBlock(parts) {
  const body = parts.map((p) => MODULES[p]).join('\n\n');
  return (
    '\n\n' + MARKER + ' — canonical source: supabase/functions/_shared/*.ts.\n' +
    '//  Inlined here because the dashboard deploy ships a single index.ts per function\n' +
    '//  (new _shared files do not reach the bundler). Edit the _shared/*.ts originals,\n' +
    '//  then run: node scripts/inline-functions.mjs\n' +
    '// ═══════════════════════════════════════════════════════════════════════════\n\n' +
    body + '\n'
  );
}

// Strip the function's own _shared import lines + any prior inlined block, re-append.
function rebuild(rel, parts, importPatterns) {
  const path = join(fnDir, rel);
  let src = readFileSync(path, 'utf8');
  const cut = src.indexOf(MARKER);
  if (cut !== -1) src = src.slice(0, cut).trimEnd();
  for (const re of importPatterns) src = src.replace(re, '');
  writeFileSync(path, src.trimEnd() + engineBlock(parts));
  const out = readFileSync(path, 'utf8');
  if (/from '\.\.\/_shared\//.test(out)) throw new Error(`${rel} still imports _shared`);
  console.log(`${rel} rebuilt — ${out.split('\n').length} lines, parts: ${parts.join('+')}`);
}

// kundli: VedAstro primary + local fallback → needs all three.
rebuild('kundli/index.ts', ['astro', 'kundliSummary', 'vedastro'], [
  /^import \{ Veda \} from '\.\.\/_shared\/vedastro\.ts';\s*$/m,
  /^import \{ computeRichKundli \} from '\.\.\/_shared\/kundliSummary\.ts';\s*$/m,
]);

// chat: reads the stored chart + computes dynamics — NO vedastro (never calls it).
rebuild('chat/index.ts', ['astro', 'kundliSummary'], [
  /^import \{ computeRichKundli, currentDynamics \} from '\.\.\/_shared\/kundliSummary\.ts';\s*$/m,
  /^import type \{ RichKundli, Dynamics \} from '\.\.\/_shared\/kundliSummary\.ts';\s*$/m,
]);

// panchang: VedAstro almanac + local fallback — astro + vedastro (lean; no summary).
rebuild('panchang/index.ts', ['astro', 'vedastro'], [
  /^import \{ [^}]*\} from '\.\.\/_shared\/astro\.ts';\s*$/m,
  /^import \{ Veda \} from '\.\.\/_shared\/vedastro\.ts';\s*$/m,
]);

// horoscope: per-profile transit-aware → needs currentDynamics (astro + kundliSummary).
rebuild('horoscope/index.ts', ['astro', 'kundliSummary'], [
  /^import \{ currentDynamics \} from '\.\.\/_shared\/kundliSummary\.ts';\s*$/m,
  /^import type \{ RichKundli, Dynamics \} from '\.\.\/_shared\/kundliSummary\.ts';\s*$/m,
]);
