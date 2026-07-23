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
// Barrel membership is DERIVED, not listed (issue #652, D-595/D-652). An entry point that
// STATICALLY imports an OPTIONAL peerDependency must never be re-exported by the primary
// barrel: a bundler resolves the whole import graph at scan time (before tree-shaking), so one
// barrel re-export drags that "optional" peer into every `import … from 'caelum'` and makes it
// de-facto required — measured in #652 (`import { CaeButton } from 'caelum'` failed to build
// with @tanstack absent). The pre-#652 guard kept a hand-maintained `BARREL_EXEMPT` allowlist,
// which only checked the entries it LISTED — so a barrel-INCLUDED optional-peer importer passed
// silently, which is exactly how `caelum/grid` slipped through from M2. This derives the truth
// from two facts that ship in the package: (a) which peers are optional (package.json
// `peerDependenciesMeta`), (b) which entry points import one (scan each emitted FESM), and
// requires: importsOptionalPeer(name) ⟺ barrel-ABSENT(name). No exempt LIST to go stale — though
// the optional-peer SET still comes from `peerDependenciesMeta`, so a peer imported but not declared
// optional there escapes the scan (the check then demands the barrel re-export); that undeclared case
// plus the transitive-via-exempt-sibling and comment-strip edges are tracked in #659.
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

// --- Optional peers: the source of truth for barrel exemption (see the header note). ---
const libPkg = JSON.parse(readFileSync(join(libDir, 'package.json'), 'utf8'));
const optionalPeers = Object.entries(libPkg.peerDependenciesMeta || {})
  .filter(([, meta]) => meta && meta.optional === true)
  .map(([peer]) => peer);

// `peerDependenciesMeta` alone is inert to npm: a meta entry with no matching
// `peerDependencies` range ships a package that declares no peer at all — no version guidance,
// no install warning, a silent runtime mismatch instead. So every optional peer must ALSO carry
// a range.
for (const peer of optionalPeers) {
  if (!libPkg.peerDependencies?.[peer])
    errors.push(
      `peerDependenciesMeta marks '${peer}' optional, but there is no peerDependencies range for it — npm would ship no peer at all (no version guidance, no install warning).`,
    );
}

// The optional peer an entry point's EMITTED FESM statically imports, or null. Scans the .mjs
// (runtime imports only — a type-only import never reaches the FESM, and forces no bundler
// resolution, so ignoring it is correct). A missing FESM is not fatal here (the exports-key
// checks below own that failure); it simply imports nothing. Verified against what actually
// ships, not the source.
function importsOptionalPeer(name) {
  const emitted = exportsMap[`./${name}`]?.default;
  const fesm = emitted && join(distDir, emitted);
  if (!fesm || !existsSync(fesm)) return null;
  const src = readFileSync(fesm, 'utf8');
  for (const peer of optionalPeers) {
    // `(?:from|import)\s*` catches `import … from '<peer>'`, `export … from '<peer>'`, AND a bare
    // side-effect `import '<peer>'` (all force scan-time resolution); tolerant of odd whitespace.
    // A dynamic `import('<peer>')` is deliberately NOT matched — it is lazy, so it does not make the
    // peer de-facto required. The subpath/closing-quote anchor prevents a substring match (#659: strip
    // comments before scanning for full robustness).
    const esc = peer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:from|import)\\s*['"]${esc}(/[^'"]*)?['"]`);
    if (re.test(src)) return peer;
  }
  return null;
}

// Computed once — importsOptionalPeer reads a file, and we consult it in the loop AND the
// summary. The regex requires the closing quote immediately after <name>, so `caelum/grid`
// never matches a `caelum/grid-tanstack` re-export (or vice-versa).
const peerOf = new Map(entryPoints.map((name) => [name, importsOptionalPeer(name)]));
// `\s*` so a re-export re-added with odd whitespace (`from\t'…'`) cannot read as barrel-absent and
// slip an optional-peer entry back into the barrel undetected; `name` is regex-escaped defensively
// (kebab-case today, but a metachar would corrupt the test). #659 tracks stripping comments first.
const inBarrel = (name) =>
  new RegExp(`from\\s*['"]caelum/${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(barrel);

// 2. The barrel primary entry point must exist and resolve.
const dot = exportsMap['.'];
if (!dot || !dot.types || !dot.default) {
  errors.push(`missing/invalid "." (barrel) export — needs { types, default }`);
} else {
  for (const f of [dot.types, dot.default])
    if (!existsSync(join(distDir, f))) errors.push(`"." export points at a missing file: ${f}`);
}

// 3. Each entry-point folder must have a matching exports key (types+default, files present)
//    AND satisfy the barrel-membership rule: re-exported by the barrel UNLESS it imports an
//    optional peer, in which case it must be barrel-ABSENT (else the peer stops being optional).
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
  const peer = peerOf.get(name);
  if (peer && inBarrel(name))
    errors.push(
      `'caelum/${name}' imports the optional peer '${peer}' yet the barrel re-exports it — that drags '${peer}' into every \`import from 'caelum'\` and makes it de-facto required (#652). Drop the barrel re-export; consumers import 'caelum/${name}' directly.`,
    );
  if (!peer && !inBarrel(name))
    errors.push(
      `barrel src/public-api.ts does not re-export 'caelum/${name}' — a bare \`import from 'caelum'\` would drop it (it imports no optional peer, so it must ride the barrel).`,
    );
}

// 4. A stale exports key (no backing folder) means a removed/renamed entry point left a dangling path.
for (const key of Object.keys(exportsMap)) {
  if (key === '.' || key === './package.json') continue;
  const name = key.slice(2);
  if (!entryPoints.includes(name))
    errors.push(`exports key "${key}" has no backing projects/caelum/${name}/ folder (stale?)`);
}

const exemptCount = [...peerOf.values()].filter(Boolean).length;
console.log(
  `library exports gate — ${entryPoints.length} secondary entry point(s) + barrel · dist/caelum/package.json vs folders + barrel · optional peer(s): ${optionalPeers.join(', ') || 'none'}`,
);
for (const name of entryPoints) {
  const peer = peerOf.get(name);
  // An optional-peer entry must be barrel-ABSENT; a normal one barrel-PRESENT. A summary that
  // contradicts the error list below trains you to skim it, so it reads from the same rule.
  const ok = Boolean(exportsMap[`./${name}`]) && (peer ? !inBarrel(name) : inBarrel(name));
  const note = peer ? `  (barrel-exempt: imports optional peer ${peer})` : '';
  console.log(`  ${ok ? '\x1b[32mOK  \x1b[0m' : '\x1b[31mFAIL\x1b[0m'} caelum/${name}${note}`);
}

if (errors.length) {
  for (const e of errors) console.error(`  \x1b[31m${e}\x1b[0m`);
  console.error(`\x1b[31mLIBRARY EXPORTS: RED — ${errors.length} problem(s).\x1b[0m`);
  process.exit(1);
}
console.log(
  `\x1b[32mLIBRARY EXPORTS: GREEN — every entry point is in the exports map; all but ${exemptCount} optional-peer entry point(s) are re-exported by the barrel.\x1b[0m`,
);
