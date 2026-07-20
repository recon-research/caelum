#!/usr/bin/env node
// Shipped-library size gate (issue #4, Book 18 §3.2) — the size gate angular.json
// does NOT provide. It measures every per-entry-point FESM2022 bundle in the built
// library against a committed budget (size-budget.json), and fails on a regression
// OR on a new UNBUDGETED entry point (the ratchet: adding an import path forces a
// deliberate budget).
//
// WHAT IT WEIGHS (changed in #603): the bundle **minified, then gzipped** — not the
// raw file. ng-packagr's FESM output is deliberately unminified and keeps every
// comment, so gating the raw bytes charged this library for its own documentation:
// comments were ~32% of the gzipped total across all entry points and ~64% of some
// single rows, which put the gate in direct tension with the house style of writing
// measured findings down where they were found. It also overstated consumer cost —
// a downstream app minifies, so the raw figure is a number nobody ships. Minifying
// first makes the budget track CODE growth and makes prose free.
//
// WHY esbuild: it is already the minifier in this repo's Angular build tree, and it
// is a real parser. The obvious alternative — regex out /* */ and // — silently
// mis-measures the moment a comment marker appears inside a string or template
// literal, and this library ships CSS-in-template-literals by the kilobyte. A gate
// that quietly measures the wrong thing is worse than one that measures a number
// too big. zlib is still Node's own; esbuild is the only added dependency.
//
// CAVEAT: minified bytes move a little with the esbuild version, so the version is
// printed with the results and the budgets carry the 15-30% headroom size-budget.json
// prescribes. A minifier bump that shifts a row is expected; a code change that
// shifts one is the signal. The as-is figure is printed alongside for context, but
// nothing is gated on it. Reach for source-map-explorer only to diagnose WHICH
// module leaked after a breach.
//
// Usage: node scripts/check-lib-size.mjs [distDir]   (default: dist/caelum)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform, version as esbuildVersion } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = process.argv[2] || join(ROOT, 'dist', 'caelum');
const fesmDir = join(distDir, 'fesm2022');
const budgetPath = join(ROOT, 'size-budget.json');

function fail(msg) {
  console.error(`\x1b[31mFATAL\x1b[0m ${msg}`);
  process.exit(2);
}

if (!existsSync(fesmDir)) fail(`no ${fesmDir} — run \`ng build caelum\` first`);
if (!existsSync(budgetPath)) fail(`no ${budgetPath}`);

const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
const limits = budget.entrypoints || {};

const bundles = readdirSync(fesmDir).filter((f) => f.endsWith('.mjs'));
const rows = [];
const errors = [];
const seen = new Set();

for (const file of bundles.sort()) {
  const name = file.replace(/\.mjs$/, ''); // caelum.mjs -> caelum, caelum-select.mjs -> caelum-select
  seen.add(name);
  const src = readFileSync(join(fesmDir, file), 'utf8');
  const { code } = await transform(src, { loader: 'js', minify: true, legalComments: 'none' });
  const gz = gzipSync(code).length; // the gated figure — what a consumer actually ships
  const asIs = gzipSync(src).length; // context only: the raw FESM, comments and all
  const limit = limits[name];
  if (limit === undefined) {
    errors.push(
      `UNBUDGETED entry point: ${file} (${gz} B) — add a size-budget.json entrypoints["${name}"] row (the ratchet)`,
    );
    rows.push({ name, gz, asIs, limit: '—', ok: false });
    continue;
  }
  const ok = gz <= limit;
  if (!ok) errors.push(`OVER BUDGET: ${file} is ${gz} B, budget ${limit} B (+${gz - limit} B)`);
  rows.push({ name, gz, asIs, limit, ok });
}

// budget rows with no matching bundle — a removed/renamed entry point. `$`-prefixed
// keys are documentation (the file's own $comment convention), never entry points.
for (const name of Object.keys(limits)) {
  if (!name.startsWith('$') && !seen.has(name))
    console.log(
      `\x1b[33mnote\x1b[0m  budgeted entry point "${name}" has no built bundle — pruned/renamed?`,
    );
}

console.log(
  `library size gate — ${bundles.length} entry point(s), ${budget.compression} (esbuild ${esbuildVersion}) · budgets in size-budget.json`,
);
for (const r of rows) {
  const pct = typeof r.limit === 'number' ? ` (${Math.round((r.gz / r.limit) * 100)}%)` : '';
  const mark = r.ok ? '\x1b[32mOK  \x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(
    `  ${mark} ${r.name.padEnd(24)} ${String(r.gz).padStart(7)} B / ${String(r.limit).padStart(7)} B${pct.padEnd(7)} as-is ${String(r.asIs).padStart(7)} B`,
  );
}

if (errors.length) {
  for (const e of errors) console.error(`  \x1b[31m${e}\x1b[0m`);
  console.error(`\x1b[31mLIBRARY SIZE: RED — ${errors.length} breach(es).\x1b[0m`);
  process.exit(1);
}
console.log(`\x1b[32mLIBRARY SIZE: GREEN — every shipped entry point is within budget.\x1b[0m`);
