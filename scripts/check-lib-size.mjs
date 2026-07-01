#!/usr/bin/env node
// Shipped-library size gate (issue #4, Book 18 §3.2) — the size gate angular.json
// does NOT provide. It measures the gzipped size of every per-entry-point FESM2022
// bundle in the built library against a committed budget (size-budget.json), and
// fails on a regression OR on a new UNBUDGETED entry point (the ratchet: adding an
// import path forces a deliberate budget). Zero dependencies — Node's own zlib is
// the laziest sufficient measurement (Book 18 §3.6); reach for source-map-explorer
// only to diagnose WHICH module leaked after a breach.
//
// Usage: node scripts/check-lib-size.mjs [distDir]   (default: dist/caelum)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const gz = gzipSync(readFileSync(join(fesmDir, file))).length;
  const limit = limits[name];
  if (limit === undefined) {
    errors.push(
      `UNBUDGETED entry point: ${file} (${gz} B gzip) — add a size-budget.json entrypoints["${name}"] row (the ratchet)`,
    );
    rows.push({ name, gz, limit: '—', ok: false });
    continue;
  }
  const ok = gz <= limit;
  if (!ok)
    errors.push(`OVER BUDGET: ${file} is ${gz} B gzip, budget ${limit} B (+${gz - limit} B)`);
  rows.push({ name, gz, limit, ok });
}

// budget rows with no matching bundle — a removed/renamed entry point
for (const name of Object.keys(limits)) {
  if (!seen.has(name))
    console.log(
      `\x1b[33mnote\x1b[0m  budgeted entry point "${name}" has no built bundle — pruned/renamed?`,
    );
}

console.log(
  `library size gate — ${bundles.length} entry point(s), ${budget.compression} · budgets in size-budget.json`,
);
for (const r of rows) {
  const pct = typeof r.limit === 'number' ? ` (${Math.round((r.gz / r.limit) * 100)}%)` : '';
  const mark = r.ok ? '\x1b[32mOK  \x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(
    `  ${mark} ${r.name.padEnd(24)} ${String(r.gz).padStart(7)} B gzip / ${String(r.limit).padStart(7)} B${pct}`,
  );
}

if (errors.length) {
  for (const e of errors) console.error(`  \x1b[31m${e}\x1b[0m`);
  console.error(`\x1b[31mLIBRARY SIZE: RED — ${errors.length} breach(es).\x1b[0m`);
  process.exit(1);
}
console.log(`\x1b[32mLIBRARY SIZE: GREEN — every shipped entry point is within budget.\x1b[0m`);
