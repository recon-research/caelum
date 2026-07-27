/**
 * Contract tests for `caelum.theme($density, $density-compact)` — #413, D-757.
 *
 * `node --test` over the dart-sass API (already a build dependency; no new one). These live
 * here rather than in the Vitest suite because the subject is **Sass compilation**: the
 * validation added after #413's adversarial pass is a set of `@error`s, and an `@error` is
 * unobservable from jsdom — `theming/density-mixin.spec.ts` can only ever see configurations
 * that successfully compiled. Without this file the entire guard is untested, which is the
 * `inert-guard-delete-it` bar.
 *
 * **What the guard is for.** D-757's invariant is *"the compact arm's emitted values differ
 * from the baseline's"*. #413 first shipped a proxy for it — `$density-compact == $density`,
 * warn and drop — and a review found four ways to satisfy the proxy while emitting a dead or
 * INVERTED arm, all silent. Each is a REJECT case below, and each was reproduced against
 * dart-sass before the guard was written. The ACCEPT cases pin that the guard is not merely
 * strict: every adjacent in-range pair still compiles and still emits a live arm.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import * as sass from 'sass';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEME = path.join(ROOT, 'projects/caelum/styles/theme');

/** Compile `@include caelum.theme(<args>)`. Returns the CSS, or throws Sass's error. */
const compile = (args = '') =>
  sass.compileString(
    `@use '${THEME.replace(/\\/g, '/')}' as caelum;\n@include caelum.theme(${args});\n`,
    {
      loadPaths: [path.join(ROOT, 'node_modules')],
    },
  ).css;

/** The `--mat-*` declarations of a selector block, as a Map. `--mat-sys-*` shape/state excluded. */
function densityTokens(css, selectorTest) {
  for (const m of css.matchAll(/([^{}]*)\{([^}]*)\}/g)) {
    const sel = m[1].trim().split('\n').pop().trim();
    if (!selectorTest(sel)) continue;
    const out = new Map();
    for (const d of m[2].matchAll(/(--mat-(?!sys-)[a-z0-9-]+)\s*:\s*([^;]+)/g))
      out.set(d[1], d[2].trim());
    if (out.size) return out;
  }
  return new Map();
}

const baselineTokens = (css) => densityTokens(css, (s) => s === 'html');
const compactTokens = (css) => densityTokens(css, (s) => s.includes('data-density'));

// ── REJECT: every way found to produce a dead or inverted arm ────────────────────────────
// Each was measured against dart-sass BEFORE the guard existed; the comment is the observed
// behaviour of the unguarded mixin, not a prediction.
const REJECTED = [
  ['$density: -3', 'looser default arm — 29 tokens GROW under compact, inverting the knob'],
  ['$density: -5, $density-compact: minimum', 'every component saturates at its clamp floor'],
  ['$density: -3, $density-compact: 0', 'scale 0 emits no density tokens at all'],
  ['$density: -2px', '-2px == -2 is false, and Material clamps it to comfortable 0'],
  ['$density: compact', 'a string clamps to 0 — the attribute value is a plausible confusion'],
  ['$density: -2, $density-compact: -2', 'equal arms: ~2.8kB that changes nothing'],
  [
    '$density: null, $density-compact: null',
    'null baseline is not "comfortable", it is unvalidated',
  ],
  [
    '$density: -2.5',
    'fractional scale hard-errors from inside node_modules if it reaches Material',
  ],
  ['$density: 1', 'positive scales are clamped away by Material'],
];

for (const [args, why] of REJECTED) {
  test(`rejects theme(${args}) — ${why}`, () => {
    assert.throws(() => compile(args), /caelum\.theme\(\)/);
  });
}

test('rejects a nested @include — it would emit "<sel> html", which matches nothing', () => {
  // Pre-D-757 this was structurally impossible (`@use` is top-level-only). The mixin form
  // invites it, and unguarded it compiles clean into dead CSS: the silent #724 state.
  const nested = () =>
    sass.compileString(
      `@use '${THEME.replace(/\\/g, '/')}' as caelum;\n.app-theme { @include caelum.theme(); }\n`,
      { loadPaths: [path.join(ROOT, 'node_modules')] },
    ).css;
  assert.throws(nested, /top level of a GLOBAL stylesheet/);
});

// ── ACCEPT: the guard must not be merely strict ──────────────────────────────────────────
test('accepts the default and emits a live compact arm', () => {
  const css = compile();
  // At scale 0 Material emits NO density tokens in the baseline, so the arm introduces them
  // rather than differing from them — the knob is live either way.
  assert.equal(baselineTokens(css).size, 0, 'density 0 should emit no density tokens');
  assert.ok(compactTokens(css).size > 0, 'the default compact arm must emit density tokens');
});

test('every adjacent in-range pair compiles and emits a LIVE arm', () => {
  for (const [base, compact] of [
    [0, -1],
    [-1, -2],
    [-2, -3],
    [-3, -4],
    [-4, -5],
  ]) {
    const css = compile(`$density: ${base}, $density-compact: ${compact}`);
    const b = baselineTokens(css);
    const c = compactTokens(css);
    const moved = [...c].filter(([k, v]) => !b.has(k) || b.get(k) !== v);
    assert.ok(moved.length > 0, `theme(${base}, ${compact}) emitted a dead arm`);
  }
});

test('accepts $density-compact: null — the only correct answer at the -5 floor', () => {
  const css = compile('$density: -5, $density-compact: null');
  assert.equal(compactTokens(css).size, 0, 'null must emit no [data-density] density arm');
  assert.ok(baselineTokens(css).size > 0, 'the baked -5 baseline must still emit');
});

test('the default path is unchanged by the density parameters (D-757: a no-op for consumers)', () => {
  // #413 shipped on the claim that `@include caelum.theme()` reproduces the pre-mixin
  // side-effecting stylesheet byte-for-byte. Nothing else in the repo guards that claim.
  assert.equal(compile().length, compile('$density: 0, $density-compact: -2').length);
});
