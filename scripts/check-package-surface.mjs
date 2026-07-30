#!/usr/bin/env node
// Package-surface (installability) gate — issue #851, M5 release track.
// guard: #851
//
// THE QUESTION THIS ASKS, and nothing else does: *if a stranger installs the packed
// tarball into an app that has never seen this workspace, does it resolve?* That is M5's
// exit clause (2), and it is the one thing the workspace cannot check by building itself —
// every in-repo consumer (Forge AND caelum's own cross-entry-point specs) resolves through
// the `tsconfig` path map, so an undeclared runtime dependency or a file that never made it
// into the tarball is INVISIBLE until publish day. `npm publish` is irreversible; a bad
// 0.1.0 is a yanked version, not a fixed one.
//
// DELIBERATELY NOT A SUPERSET of check-lib-exports.mjs (#28), which runs just before it in
// `build:lib`. That gate answers a different question — *exports completeness*: folders ↔
// exports keys ↔ barrel membership, plus the optional-peer barrel-absence rule (#652/D-652).
// This one answers *installability*. Splitting them keeps each failure message pointed at
// the right fix; the checks below intentionally do not re-assert anything that gate owns.
//
// The four checks, each a real first-publish break class:
//   1. DECLARED IMPORTS  — every bare specifier an emitted FESM imports is a declared peer
//      or dependency, a Node builtin, or a self-reference that resolves to an exports key.
//      An undeclared import is `Cannot find module` in the consumer's app, and neither the
//      workspace build nor the test suite can see it (the path map satisfies everything).
//   2. TARBALL COMPLETENESS — every `exports` target is actually IN the packed tarball.
//      check-lib-exports asserts those files exist in dist/; `npm pack` then applies
//      `files`/`.npmignore`, so a dist file is NOT proof of a shipped file. Today the lib
//      declares no `files` field and everything ships — this pins that, so adding one later
//      cannot silently amputate the package.
//   3. HONEST PEER RANGES — every declared peerDependencies range is satisfied by the
//      version actually installed in this workspace, i.e. the version we build and test
//      against. Bump the workspace past the range and we would ship a claim we never tested.
//   4. VERSION COHERENCE — source package.json, the emitted dist package.json, and the
//      newest released CHANGELOG entry all name the same version. The classic release-day
//      miss: tag v0.1.0, publish 0.0.1.
//
// ANTI-VACUITY: a gate that passes because it measured nothing is worse than no gate — it
// reads green while proving nothing. Every scan below therefore carries a positive control
// that fails LOUDLY on an empty measurement (no entry points, no imports parsed, an empty
// tarball, no required peer ever observed). Derived from the package, never hardcoded, so a
// rename cannot leave it looking for a name that no longer exists (the #514 lesson).
//
// Zero new dependencies: Node builtins + `semver` (transitive via the Angular toolchain,
// same pattern as check-grid-tree-shake.mjs's esbuild) + `npm pack` itself.
//
// Retire-when: never, while the package is published from this repo — it is the only
// mechanical check of the consumer-side contract. Narrow it only if npm itself starts
// verifying the exports map against the tarball.
//
// Usage: node scripts/check-package-surface.mjs [distDir]   (default: dist/caelum)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire, isBuiltin } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const libDir = join(ROOT, 'projects', 'caelum');
const distDir = process.argv[2] || join(ROOT, 'dist', 'caelum');
const distPkgPath = join(distDir, 'package.json');
const changelogPath = join(ROOT, 'CHANGELOG.md');

function fail(msg) {
  console.error(`\x1b[31mFATAL\x1b[0m ${msg}`);
  process.exit(2);
}

if (!existsSync(distPkgPath)) fail(`no ${distPkgPath} — run \`ng build caelum\` first`);

const distPkg = JSON.parse(readFileSync(distPkgPath, 'utf8'));
const srcPkg = JSON.parse(readFileSync(join(libDir, 'package.json'), 'utf8'));
const NAME = distPkg.name;
if (!NAME) fail(`${distPkgPath} has no "name" — cannot derive the self-reference prefix`);

const require = createRequire(join(ROOT, 'package.json'));
let semver;
try {
  semver = require('semver');
} catch {
  fail(
    'semver not resolvable — it is normally transitive via the Angular toolchain; `npm i -D semver`',
  );
}

const exportsMap = distPkg.exports || {};
const peerDeps = distPkg.peerDependencies || {};
const peerMeta = distPkg.peerDependenciesMeta || {};
const runtimeDeps = distPkg.dependencies || {};
const declared = new Set([...Object.keys(peerDeps), ...Object.keys(runtimeDeps)]);

// Findings are bucketed PER CHECK, not into one flat list, so the summary below can report
// each check's own verdict. A summary that reads OK on a line the error list contradicts
// trains you to skim it — the same honesty rule check-lib-exports.mjs states for its table.
const found = { imports: [], tarball: [], peers: [], version: [] };
const errors = []; // flat view, for the exit code and the final dump
const notes = [];
/** Record a finding against one check (and the flat list the exit code reads). */
function bad(check, msg) {
  found[check].push(msg);
  errors.push(msg);
}

// --- Check 1: every bare specifier an emitted FESM imports is declared. ------------------
//
// Matches only STATEMENT-POSITION imports (`^\s*import`/`^\s*export` … `from '<spec>'`,
// plus bare side-effect `import '<spec>'`). Anchoring is what keeps prose out: a JSDoc
// continuation line starts with `*`, so `^\s*(?:import|export)\b` cannot match inside a
// block comment. A naive unanchored scan DOES match import-looking text in comments —
// measured on this very package (five phantom specifiers out of caelum's own JSDoc), the
// same comment-blindness #659 tracks for check-lib-exports. A dynamic `import('<spec>')` is
// deliberately not matched: it is lazy and does not force scan-time resolution.
const fesmDir = join(distDir, 'fesm2022');
if (!existsSync(fesmDir)) fail(`no ${fesmDir} — the build did not emit FESM output`);
const fesmFiles = readdirSync(fesmDir).filter((f) => f.endsWith('.mjs'));
if (fesmFiles.length === 0) fail(`${fesmDir} contains no .mjs — nothing to scan (broken probe)`);

const STATEMENT_IMPORT = /^\s*(?:import|export)\b[^\n]*?from\s*['"]([^'"]+)['"]/gm;
const SIDE_EFFECT_IMPORT = /^\s*import\s*['"]([^'"]+)['"]/gm;

/** Bare package name of a specifier: '@scope/pkg/sub' -> '@scope/pkg'; 'pkg/sub' -> 'pkg'. */
function bareNameOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const importsByPkg = new Map(); // bare name -> Set of full specifiers
let statementCount = 0;
for (const file of fesmFiles) {
  const src = readFileSync(join(fesmDir, file), 'utf8');
  for (const re of [STATEMENT_IMPORT, SIDE_EFFECT_IMPORT]) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      const spec = m[1];
      statementCount++;
      if (spec.startsWith('.') || spec.startsWith('/')) continue; // relative — internal
      const bare = bareNameOf(spec);
      if (!importsByPkg.has(bare)) importsByPkg.set(bare, new Set());
      importsByPkg.get(bare).add(spec);
    }
  }
}
if (statementCount === 0)
  fail(`parsed 0 import statements across ${fesmFiles.length} FESM(s) — the scanner is broken`);

// Positive control: a library of this shape MUST import at least one of its own required
// peers. Derived (the first non-optional peer observed), so it survives a peer-set change.
const requiredPeers = Object.keys(peerDeps).filter((p) => peerMeta[p]?.optional !== true);
const observedRequired = requiredPeers.filter((p) => importsByPkg.has(p));
if (requiredPeers.length > 0 && observedRequired.length === 0)
  fail(
    `POSITIVE CONTROL FAILED: not one of the ${requiredPeers.length} required peer(s) ` +
      `(${requiredPeers.join(', ')}) was observed in any FESM import — the scan matched ` +
      `nothing real, so a "clean" result here is a false green`,
  );

let selfRefCount = 0;
for (const [bare, specs] of [...importsByPkg].sort()) {
  if (bare === NAME) {
    // A self-reference resolves through the package's OWN exports map (Node supports it for
    // any package that declares `exports`). It is legitimate and needs no dependency entry —
    // but only if the subpath actually has a key, otherwise it dies in the consumer's app.
    for (const spec of [...specs].sort()) {
      selfRefCount++;
      const key = spec === NAME ? '.' : `./${spec.slice(NAME.length + 1)}`;
      if (!exportsMap[key])
        bad(
          'imports',
          `an entry point imports '${spec}', but the emitted exports map has no "${key}" key — ` +
            `a self-reference only resolves through the package's own exports, so this is ` +
            `\`Cannot find module\` in the consumer's app (invisible here: the tsconfig path map covers it)`,
        );
    }
    continue;
  }
  if (isBuiltin(bare)) continue;
  if (!declared.has(bare))
    bad(
      'imports',
      `emitted code imports '${bare}' (e.g. '${[...specs][0]}') but it is declared neither in ` +
        `peerDependencies nor dependencies — the consumer's install would not provide it`,
    );
}

// --- Check 2: every exports target is present in the PACKED tarball. ---------------------
//
// `npm pack --dry-run --json` is authoritative about what ships: it applies `files` /
// `.npmignore` / the always-included and always-excluded rules. Run inside distDir, which
// is the actual publish root.
let packed;
try {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: distDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // npm resolves through the shell on Windows; execFileSync needs the flag to match.
    shell: process.platform === 'win32',
  });
  packed = JSON.parse(out)[0];
} catch (e) {
  fail(`\`npm pack --dry-run\` failed in ${distDir} — ${e?.message ?? e}`);
}
const packedFiles = new Set((packed.files || []).map((f) => f.path.replace(/\\/g, '/')));
if (packedFiles.size === 0) fail(`\`npm pack\` reported an empty tarball for ${distDir}`);

// Collect every file an exports condition points at, for every key.
const exportTargets = new Set();
for (const [key, entry] of Object.entries(exportsMap)) {
  if (typeof entry === 'string') {
    exportTargets.add([key, entry]);
    continue;
  }
  if (entry && typeof entry === 'object')
    for (const target of Object.values(entry))
      if (typeof target === 'string') exportTargets.add([key, target]);
}
if (exportTargets.size === 0) fail(`the emitted exports map names no target files (broken probe)`);

for (const [key, target] of exportTargets) {
  // Exports targets are './'-relative posix paths; tarball paths are relative with no './'.
  const rel = posix.normalize(target.replace(/^\.\//, ''));
  if (!packedFiles.has(rel))
    bad(
      'tarball',
      `exports key "${key}" points at "${target}", which is NOT in the packed tarball — ` +
        `the file exists in ${distDir} but \`npm pack\` excludes it (a \`files\` field or ` +
        `.npmignore?), so the published package would resolve to nothing`,
    );
}

// --- Check 3: every peer range is satisfied by the version we actually build against. -----
for (const [peer, range] of Object.entries(peerDeps)) {
  const optional = peerMeta[peer]?.optional === true;
  let installed;
  try {
    installed = require(`${peer}/package.json`).version;
  } catch {
    // An absent OPTIONAL peer is the normal case for a consumer, but this workspace installs
    // both of ours to test them; an absent REQUIRED peer means we never built against it.
    (optional ? notes.push.bind(notes) : (m) => bad('peers', m))(
      optional
        ? `optional peer '${peer}' is not installed in this workspace — its range '${range}' is unverified here`
        : `required peer '${peer}' is not installed in this workspace, yet peerDependencies claims '${range}' — nothing ever built against it`,
    );
    continue;
  }
  if (!semver.satisfies(installed, range, { includePrerelease: true }))
    bad(
      'peers',
      `peerDependencies declares '${peer}': '${range}', but this workspace builds and tests ` +
        `against ${installed}, which the range does NOT admit — we would ship a compatibility ` +
        `claim no gate has ever exercised`,
    );
}

// --- Check 4: source / dist / CHANGELOG all name the same version. -----------------------
const VERSION = distPkg.version;
if (!VERSION) bad('version', `the emitted package.json has no "version"`);
if (srcPkg.version !== VERSION)
  bad(
    'version',
    `version skew: projects/caelum/package.json is '${srcPkg.version}' but the emitted package is '${VERSION}'`,
  );

// `changelogState` reports what was actually read, so the summary line cannot imply the
// CHANGELOG was checked when it is absent.
let changelogState;
if (!existsSync(changelogPath)) {
  changelogState = ', CHANGELOG.md ABSENT';
  bad(
    'version',
    `no CHANGELOG.md at the repo root — a published release needs release notes (#851)`,
  );
} else {
  const changelog = readFileSync(changelogPath, 'utf8');
  // Keep a Changelog: released entries are `## [X.Y.Z] - DATE`; `## [Unreleased]` is skipped.
  const released = [...changelog.matchAll(/^##\s*\[(\d+\.\d+\.\d+[^\]]*)\]/gm)].map((m) => m[1]);
  if (released.length === 0) {
    changelogState = ', CHANGELOG.md has no released entry';
    bad(
      'version',
      `CHANGELOG.md has no released "## [X.Y.Z]" entry — nothing documents ${VERSION}`,
    );
  } else {
    changelogState = `, CHANGELOG newest ${released[0]}`;
    if (released[0] !== VERSION)
      bad(
        'version',
        `CHANGELOG.md's newest released entry is '${released[0]}' but the package is '${VERSION}' — ` +
          `tag-and-publish would ship a version with no release notes`,
      );
  }
}

// --- Report. -----------------------------------------------------------------------------
console.log(
  `package-surface gate — ${NAME}@${VERSION} · ${fesmFiles.length} FESM(s), ` +
    `${statementCount} import statement(s) parsed · ${packedFiles.size} file(s) in the tarball`,
);
// Each line reports ITS OWN check's verdict, and the "what was measured" half states the
// quantity actually counted — never a claim the error list contradicts.
const row = (check, label, measured) =>
  console.log(
    `  ${found[check].length ? '\x1b[31mFAIL\x1b[0m' : '\x1b[32mOK  \x1b[0m'} ${label.padEnd(20)} ${measured}`,
  );
row(
  'imports',
  'declared imports',
  `${importsByPkg.size} external package(s), ${selfRefCount} self-reference(s)`,
);
row('tarball', 'tarball completeness', `${exportTargets.size} exports target(s) checked`);
row('peers', 'peer ranges', `${Object.keys(peerDeps).length} peer(s) vs installed`);
row('version', 'version coherence', `package ${VERSION}${changelogState}`);
for (const n of notes) console.log(`  \x1b[33mnote\x1b[0m ${n}`);

if (errors.length) {
  for (const e of errors) console.error(`  \x1b[31m${e}\x1b[0m`);
  console.error(`\x1b[31mPACKAGE SURFACE: RED — ${errors.length} problem(s).\x1b[0m`);
  process.exit(1);
}
console.log(
  `\x1b[32mPACKAGE SURFACE: GREEN — the packed tarball resolves standalone (M5 exit clause 2, agent-verifiable half).\x1b[0m`,
);
