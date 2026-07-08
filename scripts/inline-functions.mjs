// Regenerate the self-contained (single-file) `kundli` and `chat` Edge Functions by
// inlining the shared astro + kundliSummary engines into each index.ts.
//
// WHY: these two functions are deployed by pasting a single index.ts into the
// Supabase dashboard, which does not upload new `_shared/*.ts` files to the remote
// bundler (a brand-new shared file → "Module not found" at deploy). So kundli/chat
// must be self-contained. The `_shared/astro.ts` + `_shared/kundliSummary.ts` files
// remain the CANONICAL source (used directly by panchang/muhurat and the Node tests).
//
// WORKFLOW: edit the `_shared/*.ts` originals, then run:  node scripts/inline-functions.mjs
// This is IDEMPOTENT — it strips any previously-inlined block before re-appending, so
// re-running never duplicates the engine.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fnDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions');

const MARKER = '// ═══════════════════════════════════════════════════════════════════════════\n//  INLINED ENGINE';

const astro = readFileSync(join(fnDir, '_shared', 'astro.ts'), 'utf8').trim();
let summary = readFileSync(join(fnDir, '_shared', 'kundliSummary.ts'), 'utf8');
summary = summary.replace(/^import \{[^}]*\} from '\.\/astro\.ts';\s*$/m, '').trim();

const ENGINE =
  '\n\n' + MARKER + ' — canonical source: supabase/functions/_shared/astro.ts +\n' +
  '//  _shared/kundliSummary.ts. Inlined here because the dashboard deploy ships a\n' +
  '//  single index.ts per function (new _shared files do not reach the bundler).\n' +
  '//  Edit the _shared/*.ts originals, then run: node scripts/inline-functions.mjs\n' +
  '// ═══════════════════════════════════════════════════════════════════════════\n\n' +
  astro + '\n\n' + summary + '\n';

// Strip _shared import lines + any prior inlined block, then re-append a fresh engine.
function rebuild(rel, importPatterns) {
  const path = join(fnDir, rel);
  let src = readFileSync(path, 'utf8');
  const cut = src.indexOf(MARKER);
  if (cut !== -1) src = src.slice(0, cut).trimEnd(); // drop the old inlined block
  for (const re of importPatterns) src = src.replace(re, '');
  writeFileSync(path, src.trimEnd() + ENGINE);
  const out = readFileSync(path, 'utf8');
  if (/from '\.\.\/_shared\//.test(out)) throw new Error(`${rel} still imports _shared`);
  console.log(`${rel} rebuilt — ${out.split('\n').length} lines, self-contained.`);
}

rebuild('kundli/index.ts', [
  /^import \{ computeRichKundli \} from '\.\.\/_shared\/kundliSummary\.ts';\s*$/m,
]);
rebuild('chat/index.ts', [
  /^import \{ computeRichKundli, currentDynamics \} from '\.\.\/_shared\/kundliSummary\.ts';\s*$/m,
  /^import type \{ RichKundli, Dynamics \} from '\.\.\/_shared\/kundliSummary\.ts';\s*$/m,
]);
