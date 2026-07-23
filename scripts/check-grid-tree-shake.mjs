#!/usr/bin/env node
// Grid engine tree-shake isolation gate (issue #182, from the #171 leakage-lens review).
//
// THE CONTRACT (D-03 adapter isolation, at the BUNDLE level): `caelum/grid`'s fesm
// (dist/caelum/fesm2022/caelum-grid.mjs) exports the dependency-free providers
// (provideCaelumGrid — client default; provideServerGrid — lazy/remote) and the CaeDataGrid
// component. The TanStack opt-in (provideTanStackGrid, which statically imports
// @tanstack/table-core, the ONE engine dependency) lives in its OWN fesm
// (caelum-grid-tanstack.mjs) since #652/D-652 — split into a barrel-exempt entry point so the
// optional peer never rides the primary barrel. A client-default (or server) consumer must
// ship ZERO engine bytes — post-split that holds STRUCTURALLY (the adapter is not in
// caelum-grid.mjs's graph at all), stronger than the pre-#652 reliance on downstream
// tree-shaking. This gate still earns its keep: it catches an accidental engine re-import
// BACK into caelum/grid (e.g. a client path statically referencing the adapter) — which would
// silently ship ~14 kB of engine to every client-default consumer with every other gate green.
//
// THE EVIDENCE GAP this closes (#171 review): Forge proves the DEFERRAL path (table-core in
// a lazy chunk, absent from eager main); size-budget.json guards the FESM size; but nothing
// exercised the actual consumer-tree-shake — an accidental top-level side effect, or a client
// path statically referencing the adapter, would silently ship ~14 kB of engine to every
// client-default consumer and every existing gate would stay green. This probe bundles each
// public entry surface with esbuild and asserts, from the metafile's per-input bytesInOutput
// (authoritative — parse-graph presence in metafile.inputs is NOT the signal; a tree-shaken
// module is still an input at 0 output bytes), that table-core code survives ONLY behind
// provideTanStackGrid.
//
// The provideTanStackGrid probe is a POSITIVE CONTROL: it must find the engine, or the probe
// itself is broken (e.g. esbuild stopped resolving table-core, or the fesm's import vanished)
// and a "clean" client result would be a false green. A guard that can't fail is worthless.
//
// esbuild is resolved transitively (the Angular builder IS esbuild — guaranteed present for
// any build of this workspace); if it ever disappears this script exits LOUDLY (not a silent
// false-green), telling the maintainer to `npm i -D esbuild`. Zero other dependencies.
//
// Usage: node scripts/check-grid-tree-shake.mjs [distDir]   (default: dist/caelum)
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = process.argv[2] || join(ROOT, 'dist', 'caelum');
const gridFesm = join(distDir, 'fesm2022', 'caelum-grid.mjs');
const gridTanstackFesm = join(distDir, 'fesm2022', 'caelum-grid-tanstack.mjs');

function fail(msg) {
  console.error(`\x1b[31mFATAL\x1b[0m ${msg}`);
  process.exit(2);
}

if (!existsSync(gridFesm)) fail(`no ${gridFesm} — run \`ng build caelum\` first`);
if (!existsSync(gridTanstackFesm)) fail(`no ${gridTanstackFesm} — run \`ng build caelum\` first`);

const require = createRequire(join(ROOT, 'package.json'));
let esbuild;
try {
  esbuild = require('esbuild');
} catch {
  fail('esbuild not resolvable — it is normally transitive via @angular/build; `npm i -D esbuild`');
}

// The engine dependency and the distinctive table-core runtime symbols the adapter pulls in.
// If any survive tree-shaking into a probe's output, the engine shipped to that surface.
//
// TODO(#216): one-engine assumption. This gate covers the ONE current third-party engine behind
// the CaeGridAdapter port. Material (the ALLOWED base — e.g. a future MatGridAdapter #179) is not a
// fenced engine and needs no probe. But if a NEW third-party engine is admitted behind the port, its
// leakage into the dependency-free surfaces would be invisible here while this positive control stays
// green — extend ENGINE/ENGINE_SYMBOLS/PROBES (ideally from a source shared with the ESLint fence).
const ENGINE = '@tanstack/table-core';
const ENGINE_SYMBOLS = [
  'getSortedRowModel',
  'getCoreRowModel',
  'getPaginationRowModel',
  'createTable',
];

// Each probe imports a realistic public surface a consumer would use, from the fesm that
// actually exports it. `expectEngine` encodes the contract: only the TanStack opt-in (in the
// separate caelum-grid-tanstack.mjs) may pull the engine in; caelum/grid's dependency-free
// providers must not. CaeDataGrid is paired in the caelum/grid probes (it is always imported
// alongside a provider) so a static reference from the component to any adapter is exercised
// too; the tanstack probe imports from caelum-grid-tanstack.mjs, where CaeDataGrid does not
// live (it stays in caelum/grid), so it names only the opt-in provider.
const PROBES = [
  {
    label: 'client-default (provideCaelumGrid)',
    fesm: gridFesm,
    imports: ['provideCaelumGrid', 'CaeDataGrid'],
    expectEngine: false,
  },
  {
    label: 'server (provideServerGrid)',
    fesm: gridFesm,
    imports: ['provideServerGrid', 'CaeDataGrid'],
    expectEngine: false,
  },
  {
    label: 'tanstack opt-in (provideTanStackGrid)',
    fesm: gridTanstackFesm,
    imports: ['provideTanStackGrid'],
    expectEngine: true,
  },
];

const tmp = mkdtempSync(join(tmpdir(), 'cae-treeshake-'));

async function measure({ label, fesm, imports }) {
  const entry = join(tmp, `${label.replace(/[^a-z]+/gi, '-')}.mjs`);
  // console.log marks the imports as used so esbuild does not drop the whole entry as dead.
  writeFileSync(
    entry,
    `import { ${imports.join(', ')} } from ${JSON.stringify(fesm)};\nconsole.log(${imports.join(', ')});\n`,
  );
  let result;
  try {
    result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      write: false,
      metafile: true,
      treeShaking: true,
      minify: false,
      logLevel: 'silent',
      // Keep @tanstack NON-external so, if referenced, its code inlines and is measurable.
      // Angular/rxjs/tslib are irrelevant to this gate and huge — leave them external.
      external: ['@angular/*', 'rxjs', 'rxjs/*', 'tslib'],
      absWorkingDir: ROOT,
    });
  } catch (e) {
    // A build-time failure (engine unresolvable, or a stale/renamed dist) already exits non-zero,
    // but route it through fail() so the maintainer gets an actionable message, not a raw stack.
    fail(
      `bundling ${label} failed — engine unresolvable, or a stale/renamed dist? — ${e?.message ?? e}`,
    );
  }
  // Aggregate over ALL emitted outputs, not just [0]: the current config yields one chunk, but a
  // future dynamic import() or a sourcemap could split the bundle, and leaked engine code might land
  // in any chunk — indexing [0] would silently miss it (a false GREEN, the exact failure this gate
  // exists to catch).
  if (!result.outputFiles.length) fail(`bundling ${label} produced no output`);
  const text = result.outputFiles.map((f) => f.text).join('\n');
  let engineBytes = 0;
  for (const outFile of Object.values(result.metafile.outputs)) {
    for (const [inPath, info] of Object.entries(outFile.inputs)) {
      if (inPath.includes(ENGINE)) engineBytes += info.bytesInOutput;
    }
  }
  const symbols = ENGINE_SYMBOLS.filter((s) => text.includes(s));
  return { engineBytes, symbols };
}

const rows = [];
const errors = [];
try {
  for (const probe of PROBES) {
    const { engineBytes, symbols } = await measure(probe);
    const hasEngine = engineBytes > 0 || symbols.length > 0;
    const ok = hasEngine === probe.expectEngine;
    rows.push({ label: probe.label, engineBytes, symbols, expectEngine: probe.expectEngine, ok });
    if (!ok) {
      errors.push(
        probe.expectEngine
          ? `POSITIVE CONTROL FAILED: ${probe.label} shipped NO engine — the probe cannot detect ${ENGINE}, so a "clean" client result is a false green (broken probe)`
          : `ENGINE LEAKED: ${probe.label} shipped ${engineBytes} B of ${ENGINE}${symbols.length ? ` (symbols: ${symbols.join(', ')})` : ''} — a client-default consumer must tree-shake the engine out (D-03)`,
      );
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`grid engine tree-shake gate — ${PROBES.length} surface(s) probed against ${ENGINE}`);
for (const r of rows) {
  const mark = r.ok ? '\x1b[32mOK  \x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  const state = r.engineBytes > 0 || r.symbols.length ? `engine ${r.engineBytes} B` : 'engine-free';
  const want = r.expectEngine ? 'wants engine' : 'wants engine-free';
  console.log(`  ${mark} ${r.label.padEnd(38)} ${state.padEnd(14)} (${want})`);
}

if (errors.length) {
  for (const e of errors) console.error(`  \x1b[31m${e}\x1b[0m`);
  console.error(`\x1b[31mGRID TREE-SHAKE: RED — ${errors.length} breach(es).\x1b[0m`);
  process.exit(1);
}
console.log(
  `\x1b[32mGRID TREE-SHAKE: GREEN — the engine ships only behind provideTanStackGrid.\x1b[0m`,
);
