#!/usr/bin/env node
// Shipped-library exports-completeness gate (issue #28, Book 19 §3.2). The per-component
// secondary-entry-point split turned one barrel into N entry points that must stay in sync
// across three places: the source folder (projects/caelum/<name>/), the emitted package
// `exports` map (dist/caelum/package.json), and the primary barrel's re-export list
// (projects/caelum/src/public-api.ts). This gate is the mechanical guard that keeps them in
// sync — it is SELF-UPDATING (it derives the expected set from the folders on disk, not a
// hardcoded list), so it catches the exact footgun the split introduces: add a component
// folder but forget to wire the `exports` map or the barrel, and the component silently never
// ships as `caelum/<name>`. It also flags a stale `exports` key with no backing folder.
// Zero dependencies — Node builtins only (Book 18 §3.6). Runs inside `build:lib` after the
// size gate, so CI (`static gates`→ heavy matrix) and preflight get it for free.
//
// Usage: node scripts/check-lib-exports.mjs [distDir]   (default: dist/caelum)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const libDir = join(ROOT, 'projects', 'caelum');
const barrelPath = join(libDir, 'src', 'public-api.ts');
const distDir = process.argv[2] || join(ROOT, 'dist', 'caelum');
const distPkgPath = join(distDir, 'package.json');

function fail(msg) {
  console.error(`\x1b[31mFATAL\x1b[0m ${msg}`);
  process.exit(2);
}

if (!existsSync(distPkgPath)) fail(`no ${distPkgPath} — run \`ng build caelum\` first`);
if (!existsSync(barrelPath)) fail(`no ${barrelPath}`);

// 1. The expected secondary entry points = every subfolder of projects/caelum that carries
//    its own ng-package.json (the primary ng-package.json sits at projects/caelum/, not in a
//    subfolder, so it is naturally excluded).
const entryPoints = readdirSync(libDir)
  .filter((name) => {
    const dir = join(libDir, name);
    return (
      name !== 'src' &&
      existsSync(dir) &&
      statSync(dir).isDirectory() &&
      existsSync(join(dir, 'ng-package.json'))
    );
  })
  .sort();

if (entryPoints.length === 0) fail(`found no secondary entry-point folders under ${libDir}`);

const exportsMap = JSON.parse(readFileSync(distPkgPath, 'utf8')).exports || {};
const barrel = readFileSync(barrelPath, 'utf8');
const errors = [];

// 2. The barrel primary entry point must exist and resolve.
const dot = exportsMap['.'];
if (!dot || !dot.types || !dot.default) {
  errors.push(`missing/invalid "." (barrel) export — needs { types, default }`);
} else {
  for (const f of [dot.types, dot.default])
    if (!existsSync(join(distDir, f))) errors.push(`"." export points at a missing file: ${f}`);
}

// 3. Each entry-point folder must have a matching exports key (types+default, files present)
//    AND be re-exported by the barrel by package name.
for (const name of entryPoints) {
  const key = `./${name}`;
  const entry = exportsMap[key];
  if (!entry) {
    errors.push(`folder projects/caelum/${name}/ has no "${key}" key in the emitted exports map`);
  } else {
    if (!entry.types || !entry.default)
      errors.push(`"${key}" export is missing a types/default condition`);
    for (const f of [entry.types, entry.default])
      if (f && !existsSync(join(distDir, f)))
        errors.push(`"${key}" export points at a missing file: ${f}`);
  }
  // The barrel must re-export it so `import … from 'caelum'` stays complete (additive split).
  if (!new RegExp(`from ['"]caelum/${name}['"]`).test(barrel))
    errors.push(
      `barrel src/public-api.ts does not re-export 'caelum/${name}' — a bare \`import from 'caelum'\` would drop it`,
    );
}

// 4. A stale exports key (no backing folder) means a removed/renamed entry point left a dangling path.
for (const key of Object.keys(exportsMap)) {
  if (key === '.' || key === './package.json') continue;
  const name = key.slice(2);
  if (!entryPoints.includes(name))
    errors.push(`exports key "${key}" has no backing projects/caelum/${name}/ folder (stale?)`);
}

console.log(
  `library exports gate — ${entryPoints.length} secondary entry point(s) + barrel · dist/caelum/package.json vs folders + barrel`,
);
for (const name of entryPoints) {
  const ok = exportsMap[`./${name}`] && new RegExp(`from ['"]caelum/${name}['"]`).test(barrel);
  console.log(`  ${ok ? '\x1b[32mOK  \x1b[0m' : '\x1b[31mFAIL\x1b[0m'} caelum/${name}`);
}

if (errors.length) {
  for (const e of errors) console.error(`  \x1b[31m${e}\x1b[0m`);
  console.error(`\x1b[31mLIBRARY EXPORTS: RED — ${errors.length} problem(s).\x1b[0m`);
  process.exit(1);
}
console.log(
  `\x1b[32mLIBRARY EXPORTS: GREEN — every entry point is in the exports map and re-exported by the barrel.\x1b[0m`,
);
