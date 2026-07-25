/**
 * Real-browser verification for `cae-toolbar` (#405, was #128).
 *
 * **The claim under test.** The component projects into three slots and separates them with
 * a `flex: 1 1 auto` spacer, so `caeToolbarStart` sits at the inline-start edge and
 * `caeToolbarEnd` at the inline-end edge. Its doc block is explicit that this was never
 * verified: "the unit spec can only assert DOM order (jsdom computes no flex), so the visual
 * placement is verified in a real browser at M4 (#128)."
 *
 * DOM order and placement are genuinely different claims — a spacer that failed to grow, or
 * a `mat-toolbar` that stopped being a single-row flex container, would leave the DOM order
 * assertions in `toolbar.spec.ts` passing while every group bunched up at the start. So the
 * assertions here are edge-relative (measured against the toolbar's *content* box, since
 * `mat-toolbar` carries horizontal padding), and one arm neutralizes `flex-grow` to prove
 * they can actually fail.
 *
 * The RTL arm is here for the same reason: the doc block promises *inline*-start/end, not
 * left/right. Nothing in the component reads direction — the promise rests entirely on flex
 * following the writing mode — and jsdom cannot tell a kept promise from a broken one.
 *
 * Run it: `npm run test:browser`.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CaeToolbar } from './toolbar';
import { expectNoA11yViolations } from '../testing/a11y';
import { loadCaelumTheme, themeToken } from '../testing/theme';

@Component({
  imports: [CaeToolbar],
  template: `
    <cae-toolbar>
      <div caeToolbarStart class="s">Brand</div>
      <div class="d">Loose</div>
      <div caeToolbarEnd class="e">Actions</div>
    </cae-toolbar>
  `,
  styles: `
    :host {
      display: block;
      width: 600px;
    }
  `,
})
class ToolbarHost {}

describe('CaeToolbar (real browser)', () => {
  let el: HTMLElement;

  function render(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ToolbarHost] });
    // mat-toolbar's own padding/height come from the token bridge; without the theme the
    // bar has no box worth measuring and axe judges unstyled colours (#724, PATTERNS §9).
    loadCaelumTheme();
    const fixture = TestBed.createComponent(ToolbarHost);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  const bar = () => el.querySelector('mat-toolbar') as HTMLElement;
  const rect = (sel: string) => (el.querySelector(sel) as HTMLElement).getBoundingClientRect();

  /**
   * The toolbar's content box. `mat-toolbar` pads horizontally, so "at the inline-start edge"
   * means flush with the *content* box — comparing against the border box would be off by the
   * padding and would pass for the wrong reason if the padding ever went to 0.
   */
  function contentBox(): { left: number; right: number } {
    const cs = getComputedStyle(bar());
    const r = bar().getBoundingClientRect();
    return {
      left: r.left + Number.parseFloat(cs.borderLeftWidth) + Number.parseFloat(cs.paddingLeft),
      right: r.right - Number.parseFloat(cs.borderRightWidth) - Number.parseFloat(cs.paddingRight),
    };
  }

  beforeEach(() => render());

  afterEach(() => {
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  it('lays the bar out as a single-row flex container — the premise of the spacer', () => {
    // Everything below depends on this. If mat-toolbar ever stopped being a row-flex
    // container the placement assertions would fail confusingly; fail here instead, naming
    // the cause. Also the #724 liveness guard: real tokens, so a real box.
    expect(themeToken('--cae-color-border')).not.toBe('');
    const cs = getComputedStyle(bar());
    expect(cs.display).toBe('flex');
    expect(cs.flexDirection).toBe('row');
    expect(bar().getBoundingClientRect().height).toBeGreaterThan(0);
  });

  it('grows the spacer to fill the gap between the groups', () => {
    const spacer = rect('.cae-toolbar__spacer');
    // The spacer has no content, so any width at all is flex-grow doing its job.
    expect(spacer.width).toBeGreaterThan(0);
    // It occupies the whole gap: start-side content ends where it begins, the end group
    // begins where it ends.
    expect(spacer.left).toBeCloseTo(rect('.d').right, 0);
    expect(spacer.right).toBeCloseTo(rect('.e').left, 0);
  });

  it('pins the start group to the inline-start edge and the end group to the inline-end edge', () => {
    const box = contentBox();
    expect(rect('.s').left).toBeCloseTo(box.left, 0);
    expect(rect('.e').right).toBeCloseTo(box.right, 0);
    // …and they really are apart, rather than both happening to sit near a narrow bar.
    expect(rect('.e').left - rect('.s').right).toBeGreaterThan(100);
  });

  it('really depends on flex-grow — a spacer that cannot grow bunches the groups up', () => {
    // The teeth. Without this arm the placement assertions above would also pass on a
    // toolbar whose groups merely happened to be laid out left-to-right in a wide bar.
    const box = contentBox();
    expect(rect('.e').right).toBeCloseTo(box.right, 0);
    const spacer = el.querySelector('.cae-toolbar__spacer') as HTMLElement;
    spacer.style.flex = '0 0 auto';
    // The end group now follows the loose content immediately, far from the end edge.
    expect(rect('.e').left).toBeCloseTo(rect('.d').right, 0);
    expect(box.right - rect('.e').right).toBeGreaterThan(100);
  });

  it('renders un-grouped content start-side, after the start group', () => {
    // toolbar.spec.ts asserts this in DOM order; here it is the rendered position, which is
    // what "renders start-side" actually promises.
    expect(rect('.d').left).toBeGreaterThanOrEqual(rect('.s').right);
    expect(rect('.d').right).toBeLessThan(rect('.e').left);
  });

  it('follows the writing direction — start/end are inline, not left/right', () => {
    // The component reads no direction and has no RTL code: the doc block's "inline-start"
    // promise rests entirely on flex following the writing mode. Confirm it holds, so the
    // wording stays honest for RTL adopters.
    const ltrStart = rect('.s').left;
    el.setAttribute('dir', 'rtl');
    const box = contentBox();
    // Mirrored: the start group is now at the right edge, the end group at the left.
    expect(rect('.s').right).toBeCloseTo(box.right, 0);
    expect(rect('.e').left).toBeCloseTo(box.left, 0);
    // …and it genuinely moved, rather than the assertions above being direction-agnostic.
    expect(rect('.s').left).toBeGreaterThan(ltrStart + 100);
  });

  it('has no axe violations, no rules disabled', async () => {
    await expectNoA11yViolations(el);
  });
});
