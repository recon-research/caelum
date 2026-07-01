#!/usr/bin/env node
// US-origin attestation emitter (issue #4, Book 19 §3.5 + §4(e)). Writes a
// machine-readable manifest of the SHIPPED-runtime dependency tree's license +
// national origin INTO the package dir (dist/caelum/us-origin.attestation.json),
// so a consumer bound by the same US-origin constraint verifies the claim from
// the artifact they installed, not a webpage that can drift.
//
// This is ORTHOGONAL to npm/SLSA build provenance (Book 19 §2.2): build provenance
// attests *which commit/CI built the tarball* (Sigstore/OIDC/Rekor); this attests
// *what it's made of and who owns that* (D-11). A complete release ships BOTH;
// neither implies the other. The `orthogonality.note` field states this in-band.
//
// Usage: node scripts/emit-us-origin-attestation.mjs [distDir]   (default: dist/caelum)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = process.argv[2] || join(ROOT, 'dist', 'caelum');

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const allowlist = read(join(ROOT, 'provenance', 'allowlist.json'));
const lock = read(join(ROOT, 'package-lock.json'));
const rootPkg = read(join(ROOT, 'package.json'));
const distPkgPath = join(distDir, 'package.json');
if (!existsSync(distPkgPath)) {
  console.error(`\x1b[31mFATAL\x1b[0m no ${distPkgPath} — run \`ng build caelum\` first`);
  process.exit(2);
}
const distPkg = read(distPkgPath);

const libManifestPath = join(ROOT, 'projects', 'caelum', 'package.json');
const libPkg = existsSync(libManifestPath) ? read(libManifestPath) : {};

const policy = allowlist.policy;
const runtimePermissive = new Set(policy.license.runtimePermissive);
const allied = new Set(policy.origin.alliedNations);
const vetted = { ...allowlist.runtime, ...(allowlist.optionalPeers || {}) };
const optionalPeerNames = new Set(Object.keys(allowlist.optionalPeers || {}));
const directDeps = new Set(Object.keys(rootPkg.dependencies || {}));
const generatedAt = new Date().toISOString();
const today = generatedAt.slice(0, 10);

// SPDX-expression-aware admissibility, mirroring scripts/check_provenance.py so the
// attestation's verdict never disagrees with the gate on a dual/expression license.
function licenseAdmissible(expr) {
  const e = (expr || '').trim();
  if (!e || /^SEE /i.test(e) || /^(UNKNOWN|UNLICENSED)$/i.test(e)) return false;
  const terms = e
    .split(/\s+(?:OR|AND)\s+/i)
    .map((t) => t.replace(/[()]/g, '').trim())
    .filter(Boolean);
  if (!terms.length) return false;
  const isOr = /\bOR\b/i.test(e);
  const isAnd = /\bAND\b/i.test(e);
  return isOr && !isAnd
    ? terms.some((t) => runtimePermissive.has(t))
    : terms.every((t) => runtimePermissive.has(t));
}

// The shipped-runtime surface = the transitive closure of the root + library
// deps/peers/optional (manifest dependency KINDS, not npm's `dev` flag), so a
// dev-installed library peer is still attested — matches check_provenance.py.
// (Drift detection is intentionally the GATE's job; this reports resolved reality.)
const RUNTIME_EDGE_KEYS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const manifestRoots = (pkg) => {
  const r = new Set();
  for (const k of RUNTIME_EDGE_KEYS) for (const n of Object.keys(pkg[k] || {})) r.add(n);
  return r;
};
const byName = {};
for (const [p, m] of Object.entries(lock.packages || {})) {
  if (!p) continue;
  (byName[p.split('node_modules/').pop()] ||= []).push(m);
}
const closure = new Set();
const stack = [...manifestRoots(rootPkg), ...manifestRoots(libPkg)];
while (stack.length) {
  const name = stack.pop();
  if (closure.has(name)) continue;
  closure.add(name);
  for (const m of byName[name] || [])
    for (const k of RUNTIME_EDGE_KEYS)
      for (const dep of Object.keys(m[k] || {})) if (!closure.has(dep)) stack.push(dep);
}

const licOf = (meta) =>
  (typeof meta?.license === 'object' ? meta.license?.type : meta?.license) || 'UNKNOWN';

// One node per shipped-runtime NAME, resolved to its primary (top-level) install.
const runtimeTree = [];
const optionalPeers = [];
for (const name of [...closure].sort()) {
  const primary = (lock.packages || {})[`node_modules/${name}`];
  const v = vetted[name] || {};
  if (!primary) {
    // In the shipped closure but not installed — an unmet optional peer. Record it
    // pre-vetted so a consumer who installs it sees it was already cleared (D-11).
    if (optionalPeerNames.has(name)) {
      optionalPeers.push({
        name,
        license: v.license || null,
        origin: v.origin || null,
        maintainer: v.maintainer || null,
        shipped: v.shipped || 'conditional',
        installed: false,
        note: v.note || null,
      });
    }
    continue;
  }
  runtimeTree.push({
    name,
    version: primary.version || null,
    license: licOf(primary),
    origin: {
      class: v.origin === 'US' ? 'US' : v.origin ? 'allied' : 'UNVETTED',
      country: v.origin || 'UNVETTED',
      maintainer: v.maintainer || null,
    },
    tier: 'runtime',
    direct: directDeps.has(name),
    shipped: v.shipped || 'unknown',
    note: v.note || null,
    verified: today,
  });
}

// Verdict computed from the data (self-certifying, honest even run standalone).
const licenseGreen = runtimeTree.every((d) => licenseAdmissible(d.license));
const originGreen = runtimeTree.every((d) => allied.has(d.origin.country));
const nonUsOrigin = runtimeTree
  .filter((d) => d.origin.country !== 'US')
  .map((d) => ({ name: d.name, country: d.origin.country, justification: d.note }));

const attestation = {
  $schema: 'https://caelum.dev/schemas/us-origin-attestation-1.0.json',
  schemaVersion: '1.0',
  kind: 'us-origin-attestation',
  package: distPkg.name,
  version: distPkg.version,
  policy: { id: policy.decision, ref: policy.ref },
  scope: policy.scope,
  generatedAt,
  generator: { tool: 'emit-us-origin-attestation', version: '1.0.0' },
  statement: `Every shipped-runtime dependency of ${distPkg.name}@${distPkg.version} and its transitive tree was verified permissive-licensed and US-origin (or allied-nation, per D-11) as of ${today}.`,
  orthogonality: {
    buildProvenance: 'separate',
    note: 'Build-origin provenance is attested separately by npm/SLSA via Sigstore (OIDC + Rekor). This manifest attests only the license + national origin of the transitive RUNTIME dependency tree (D-11). Neither claim implies the other; a complete release ships both.',
  },
  verdict: { license: licenseGreen ? 'GREEN' : 'RED', origin: originGreen ? 'GREEN' : 'RED' },
  summary: {
    runtimeDepCount: runtimeTree.length,
    licenses: [...new Set(runtimeTree.map((d) => d.license))].sort(),
    nonUsOrigin,
    optionalPeers,
  },
  runtimeTree,
};

const outPath = join(distDir, 'us-origin.attestation.json');
writeFileSync(outPath, JSON.stringify(attestation, null, 2) + '\n');

const V = (g) => (g === 'GREEN' ? '\x1b[32mGREEN\x1b[0m' : '\x1b[31mRED\x1b[0m');
console.log(`emitted ${outPath}`);
console.log(
  `  ${runtimeTree.length} runtime deps · license ${V(attestation.verdict.license)} · origin ${V(attestation.verdict.origin)} · ${nonUsOrigin.length} allied-origin (${nonUsOrigin.map((n) => n.name).join(', ') || 'none'})`,
);
if (attestation.verdict.license !== 'GREEN' || attestation.verdict.origin !== 'GREEN') {
  console.error('\x1b[31mattestation is not GREEN — do not publish\x1b[0m');
  process.exit(1);
}
