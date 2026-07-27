// The `caelum.theme($density, $density-compact)` mixin keeps the D-19 runtime knob alive at a
// non-default compile-time baseline — #413, D-757, Book 04 §3.4.
//
// **The defect this pins.** D-757 ships a compile-time density baseline. The obvious way to
// write it — interpolate one `$density` into the `html` block, leave the `[data-density]` arm
// hardcoded at `-2` — runs backwards: a consumer who bakes `-2` gets *both* arms at `-2`. The
// arm still emits (61 `--mat-*` declarations, ~2.8 kB), but not one value differs from the
// baseline, so `data-density="compact"` becomes a **silent no-op with no route back to a
// roomier arm** — quietly killing the knob D-19 ratified. Parameterizing both arms is the fix,
// and this is the assertion that fails without it.
//
// **Why it reads `--mat-*` and not `--cae-space-*`.** #413 originally proposed asserting that
// the compact arm resolves *different `--cae-space-*` values*. That assertion is **vacuous
// here**: the space scale is emitted by `_tokens.scss`, which `$density` does not touch, so it
// differs identically under the naive and the correct shape and catches nothing. `$density`
// governs Material's density-derived component tokens — measured on this fixture, 30 of the
// arm's 61 declarations differ when both arms are parameterized (`-2`/`-3`) and **0** differ
// under the naive shape. Those are the only values that can see the bug.
//
// **Vacuity guard.** If the fixture failed to load, every read below returns `''` and the
// inequality assertions would pass trivially against each other — so the baseline reads are
// asserted non-empty first (`theme.ts`, #724/#736: an unloaded theme passes hardest).
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
 * Material density-derived component tokens, chosen because they resolve to plain px literals
 * (jsdom's cascade handles them) and sit on components Caelum actually wraps. Each one moves
 * between density `-2` and `-3`; none is emitted at all at density `0`, which is why the
 * fixture bakes a non-default baseline.
 */
const DENSITY_TOKENS = [
  '--mat-checkbox-state-layer-size',
  '--mat-expansion-header-collapsed-state-height',
  '--mat-list-list-item-one-line-container-height',
] as const;

describe('theming: caelum.theme() density mixin (#413)', () => {
  beforeEach(async () => {
    root.removeAttribute('data-density');
    await TestBed.configureTestingModule({ imports: [DensityMixinProbeHost] }).compileComponents();
    // Creating the host injects its compiled global stylesheet into the document.
    TestBed.createComponent(DensityMixinProbeHost);
  });
  afterEach(() => root.removeAttribute('data-density'));

  it('emits the baked baseline arm (fixture is loaded)', () => {
    // The vacuity guard for every assertion below: at density 0 Material emits none of these,
    // so a non-empty read is also proof the NON-DEFAULT $density reached mat.theme().
    for (const name of DENSITY_TOKENS) {
      expect(token(name), `${name} missing — the theme fixture did not load`).not.toBe('');
    }
  });

  it('keeps [data-density="compact"] switching at a non-default baseline', () => {
    const baseline = DENSITY_TOKENS.map(token);
    root.setAttribute('data-density', 'compact');
    const compact = DENSITY_TOKENS.map(token);

    // The naive single-baseline shape emits the arm with values identical to the baseline;
    // every token below would then be unchanged and the knob would be dead.
    DENSITY_TOKENS.forEach((name, i) => {
      expect(compact[i], `${name} did not move — the compact arm is a no-op`).not.toBe(baseline[i]);
    });
  });

  it('tightens rather than loosens under compact', () => {
    const px = (v: string) => Number.parseFloat(v);
    const baseline = DENSITY_TOKENS.map((n) => px(token(n)));
    root.setAttribute('data-density', 'compact');

    DENSITY_TOKENS.forEach((name, i) => {
      expect(px(token(name)), `${name} loosened under compact`).toBeLessThan(baseline[i]);
    });
  });
});
