// The `caelum.theme($density, $density-compact)` mixin keeps the D-19 runtime knob alive at a
// non-default compile-time baseline — #413, D-757, Book 04 §3.4.
//
// **The defect this pins.** D-757 ships a compile-time density baseline. The obvious way to
// write it — interpolate one `$density` into the `html` block, leave the `[data-density]` arm
// hardcoded at `-2` — runs backwards: a consumer who bakes `-2` gets *both* arms at `-2`. The
// arm still emits, but not one value differs from the baseline, so `data-density="compact"`
// becomes a **silent no-op with no route back to a roomier arm** — quietly killing the knob
// D-19 ratified. Parameterizing both arms is the fix. (Exact declaration counts are
// Material-version data and live once, in ARCHITECTURE §3.1.)
//
// **Why it reads `--mat-*` and not `--cae-space-*`.** #413 originally proposed asserting that
// the compact arm resolves *different `--cae-space-*` values*. That assertion is **vacuous
// here**: the space scale is emitted by `_tokens.scss`, which `$density` does not touch, so it
// differs identically under the naive and the correct shape and catches nothing. `$density`
// governs Material's density-derived component tokens — the only values that can see the bug.
//
// **Why the assertions are ABSOLUTE, and what they still cannot catch.** Pinning the literal
// px values makes a declaration that jsdom silently dropped read as `''` and fail loudly,
// rather than hide behind an inequality. It does **not** — measured, not assumed — catch the
// mixins that *ignore a parameter*: an arm hardcoded to `-3`, an `html` block hardcoded to
// `-2`, or an arm computed as `$density - 1` all emit exactly the numbers a `-2`/`-3` fixture
// expects, so all three survive every assertion in this file. That is structural, not a gap
// to patch here: one fixture compiles one argument pair, and a hardcoded mixin is by
// definition indistinguishable from a correct one at that pair. Killing them requires VARYING
// the arguments, which only a Sass-API test can do — `scripts/theme-mixin.test.mjs`, where
// both mutants fail. Don't strengthen this file to chase them; the division is deliberate.
//
// So: that file owns the mixin's argument contract; this one owns the half it cannot see —
// that the compiled CSS actually reaches the DOM and resolves through the cascade.
//
// **Non-vacuity.** Each test fails on its own if the fixture does not load: an absent token
// reads `''`, which is not `'32px'`. Note the *compile-time* half of this contract — the
// `@error` validation that rejects an inverted or dead arm — cannot be reached from jsdom at
// all, since only configurations that compiled ever get here; `scripts/theme-mixin.test.mjs`
// covers it against the Sass API.
import { Component, ViewEncapsulation } from '@angular/core';
import { TestBed } from '@angular/core/testing';

@Component({
  selector: 'cae-density-mixin-probe-host',
  template: '',
  styleUrl: './_density-mixin-probe.scss',
  encapsulation: ViewEncapsulation.None,
})
class DensityMixinProbeHost {}

const root = document.documentElement;
const token = (name: string): string => getComputedStyle(root).getPropertyValue(name).trim();

/**
 * Material density-derived component tokens, with their exact values at the fixture's two
 * scales. Chosen because they resolve to plain px literals (jsdom's cascade handles them),
 * they sit on components Caelum wraps, and none of the three clamps between `-2` and `-3`
 * (checkbox and expansion clamp at `-3`, list at `-5`) — a `-4`/`-5` fixture would have
 * silently no-op'd two of them. None is emitted at all at density `0`, which is why the
 * fixture bakes a non-default baseline.
 */
const DENSITY_TOKENS = [
  { name: '--mat-checkbox-state-layer-size', baseline: '32px', compact: '28px' },
  { name: '--mat-expansion-header-collapsed-state-height', baseline: '40px', compact: '36px' },
  { name: '--mat-list-list-item-one-line-container-height', baseline: '40px', compact: '36px' },
] as const;

describe('theming: caelum.theme() density mixin (#413)', () => {
  beforeEach(async () => {
    root.removeAttribute('data-density');
    await TestBed.configureTestingModule({ imports: [DensityMixinProbeHost] }).compileComponents();
    // Creating the host injects its compiled global stylesheet into the document.
    TestBed.createComponent(DensityMixinProbeHost);
  });
  afterEach(() => root.removeAttribute('data-density'));

  it('bakes $density into the baseline arm', () => {
    // Absolute values: a mixin that ignored $density and hardcoded the html block would still
    // pass a relative check here, because -2 is exactly what it would have hardcoded.
    for (const { name, baseline } of DENSITY_TOKENS) {
      expect(token(name), `${name} is not at the baked $density: -2 value`).toBe(baseline);
    }
  });

  it('switches [data-density="compact"] to $density-compact at a non-default baseline', () => {
    root.setAttribute('data-density', 'compact');
    // The naive single-baseline shape emits the arm at the BASELINE values, so each of these
    // would read '32px'/'40px'/'40px' and fail. An arm hardcoded to -3, or computed as
    // $density - 1, is caught by the baseline test above rather than here.
    for (const { name, compact } of DENSITY_TOKENS) {
      expect(token(name), `${name} did not switch to $density-compact: -3`).toBe(compact);
    }
  });

  it('tightens rather than loosens under compact', () => {
    // Direction is a separate claim from value: an inverted pair ($density tighter than
    // $density-compact) grows every control under an attribute named "compact". The mixin now
    // rejects that at compile time, so this is the runtime witness that the shipped fixture is
    // the right way round.
    const px = (v: string) => Number.parseFloat(v);
    const baseline = DENSITY_TOKENS.map(({ name }) => px(token(name)));
    root.setAttribute('data-density', 'compact');

    DENSITY_TOKENS.forEach(({ name }, i) => {
      expect(px(token(name)), `${name} loosened under compact`).toBeLessThan(baseline[i]);
    });
  });
});
