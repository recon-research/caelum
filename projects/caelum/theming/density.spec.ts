// Density token arm — #411 (provisional on #412), Book 04 §3.4 (density = the
// parity lever, R4), §3.3 (re-bind the layer, not the components), D-04.
//
// The bridge is raw SCSS shipped as a package asset and jsdom can't run Sass, so
// this spec pulls the REAL `_tokens.scss` into the test DOM the honest way: a host
// component with ViewEncapsulation.None emits it as a global stylesheet (its
// `:root` rules land on document.documentElement unscoped), then getComputedStyle
// reads the resolved custom properties in each density arm — the actual compiled
// values, not a hand-copied guess. Space tokens are literal px, which jsdom's
// cascade resolves (the color tokens' `light-dark()` is stored raw and unread).
// Visual diff across density x scheme stays M4/#240 (jsdom renders no pixels).
import { Component, ViewEncapsulation } from '@angular/core';
import { TestBed } from '@angular/core/testing';

@Component({
  selector: 'cae-density-probe-host',
  template: '',
  styleUrl: '../styles/_tokens.scss',
  encapsulation: ViewEncapsulation.None,
})
class DensityProbeHost {}

const root = document.documentElement;
const SPACE_STEPS = [1, 2, 3, 4, 5, 6] as const;
const num = (prop: string): number =>
  Number.parseInt(getComputedStyle(root).getPropertyValue(prop).trim(), 10);
const spaceStep = (n: number): number => num(`--cae-space-${n}`);

describe('theming: density token arm (#411)', () => {
  beforeEach(async () => {
    root.removeAttribute('data-density');
    await TestBed.configureTestingModule({ imports: [DensityProbeHost] }).compileComponents();
    // Creating the host injects its global token stylesheet into the document.
    TestBed.createComponent(DensityProbeHost);
  });
  afterEach(() => root.removeAttribute('data-density'));

  it('applies the comfortable space scale by default (bridge is loaded)', () => {
    // Guards the whole spec: if the tokens didn't reach the DOM this is NaN.
    expect(spaceStep(4)).toBe(16);
  });

  it('[data-density="compact"] tightens the space scale and never loosens a step', () => {
    const comfy = SPACE_STEPS.map(spaceStep);
    root.setAttribute('data-density', 'compact');
    const compact = SPACE_STEPS.map(spaceStep);

    let tightened = 0;
    compact.forEach((v, i) => {
      expect(v).toBeLessThanOrEqual(comfy[i]); // never looser than comfortable
      if (v < comfy[i]) tightened++;
    });
    expect(tightened).toBeGreaterThan(0); // ...and it genuinely compacts
  });

  it('holds the WCAG 2.5.8 interactive floor (>=24px), density-INVARIANT', () => {
    expect(num('--cae-target-min')).toBeGreaterThanOrEqual(24);
    root.setAttribute('data-density', 'compact');
    // The floor must NOT shrink under compact — a denser layout can't drop a hit
    // target below the a11y bound.
    expect(num('--cae-target-min')).toBeGreaterThanOrEqual(24);
  });
});
