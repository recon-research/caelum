/**
 * Real-browser verification for `cae-divider` (#405, was #91).
 *
 * **The claim under test.** `cae-divider`'s host is `display: contents`, so the wrapper
 * contributes no box and the inner `<mat-divider>` participates directly in the parent's
 * layout. The component's doc block states the consequence that motivated it: a `vertical`
 * divider "stretches inside a flex row exactly as a bare `mat-divider` would (a wrapping
 * block would collapse to zero height)".
 *
 * That is a pure **layout** claim, and jsdom computes no layout — every rect there is 0, so
 * the jsdom spec can only assert the role/orientation attributes and was explicitly deferred
 * to this pass. The assertions below measure the thing the sentence promises, and the
 * `display: block` arm re-creates the collapse it warns about, so the guard has teeth rather
 * than restating the CSS.
 *
 * **Why the a11y arm matters.** `display: contents` is also a known a11y-tree hazard: engines
 * have historically dropped a *role-bearing* element that carries it, and axe reads the DOM,
 * so it would never catch that. The wrapper is safe only because the role lives on the inner
 * element instead — an invariant the source states in prose but nothing enforced. It is
 * asserted here (`docs/PATTERNS.md` §12), so moving `role="separator"` onto the
 * `display: contents` host fails a test instead of silently un-announcing every divider.
 *
 * Run it: `npm run test:browser`.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CaeDivider } from './divider';
import { expectNoA11yViolations } from '../testing/a11y';
import { loadCaelumTheme, themeToken } from '../testing/theme';

/** Fixed, unambiguous geometry — every assertion below derives from these two numbers. */
const ROW_HEIGHT = 120;
const ROW_WIDTH = 300;

@Component({
  imports: [CaeDivider],
  template: `
    <div class="row">
      <div class="pane">A</div>
      <cae-divider vertical />
      <div class="pane">B</div>
    </div>
    <div class="stack">
      <p>above</p>
      <cae-divider />
      <p>below</p>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      height: ${ROW_HEIGHT}px;
      width: ${ROW_WIDTH}px;
      /* No padding/border: the row's content box IS its border box, so the stretch
         assertion can compare against ROW_HEIGHT directly. */
      padding: 0;
      border: 0;
    }
    .pane {
      flex: 1 1 auto;
    }
    .stack {
      width: ${ROW_WIDTH}px;
    }
    p {
      margin: 0;
    }
  `,
})
class DividerHost {}

describe('CaeDivider (real browser)', () => {
  let el: HTMLElement;

  function render(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [DividerHost] });
    // Without the real token layer the divider's border is invalid-at-computed-value-time
    // and measures 0px — every geometry assertion below would then be testing an unstyled
    // page rather than what Caelum ships (#724, PATTERNS §9).
    loadCaelumTheme();
    const fixture = TestBed.createComponent(DividerHost);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  const host = (i: number) => el.querySelectorAll<HTMLElement>('cae-divider')[i];
  const rule = (i: number) => el.querySelectorAll<HTMLElement>('mat-divider')[i];
  const vHost = () => host(0);
  const vRule = () => rule(0);
  const hRule = () => rule(1);

  beforeEach(() => render());

  afterEach(() => {
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  it('resolves the real token layer, so the rule is painted with a real border', () => {
    // The liveness guard for every measurement below: a themeless page computes the
    // divider's border to 0px and the "it renders" assertions become vacuous (#724).
    expect(themeToken('--cae-color-border')).not.toBe('');
    const cs = getComputedStyle(vRule());
    expect(cs.borderRightStyle).toBe('solid');
    expect(Number.parseFloat(cs.borderRightWidth)).toBeGreaterThan(0);
  });

  it('gives the wrapper no box of its own, so the rule is the flex item', () => {
    // The mechanism the doc block names. `display: contents` means the host is not itself
    // laid out — the browser promotes <mat-divider> to a direct child of .row.
    expect(getComputedStyle(vHost()).display).toBe('contents');
    const row = el.querySelector('.row') as HTMLElement;
    // Its offsetParent-independent proof: the rule's box is a sibling of the panes, sized
    // by the row's own stretch, not nested inside a wrapper box.
    expect(vRule().parentElement).toBe(vHost());
    expect(row.getBoundingClientRect().height).toBe(ROW_HEIGHT);
  });

  it('stretches a vertical divider to the full height of a flex row', () => {
    // The #91 claim itself. 0 under jsdom, which is why this waited for the harness.
    const rect = vRule().getBoundingClientRect();
    expect(rect.height).toBe(ROW_HEIGHT);
    // …and it is a hairline, not a column: only the 1px right border occupies width.
    expect(rect.width).toBeLessThanOrEqual(2);
    expect(rect.width).toBeGreaterThan(0);
  });

  it('collapses to zero height if the wrapper is given a box — the reason for display:contents', () => {
    // The teeth. Re-create the failure the doc block warns about ("a wrapping block would
    // collapse to zero height"): with a box, the *wrapper* becomes the stretched flex item
    // and the rule inside it is a block of height auto — i.e. invisible. Proving the
    // collapse here is what stops the assertion above from merely restating the CSS.
    expect(vRule().getBoundingClientRect().height).toBe(ROW_HEIGHT);
    vHost().style.display = 'block';
    expect(vHost().getBoundingClientRect().height).toBe(ROW_HEIGHT);
    expect(vRule().getBoundingClientRect().height).toBe(0);
  });

  it('spans the full width of its container when horizontal', () => {
    const rect = hRule().getBoundingClientRect();
    expect(rect.width).toBe(ROW_WIDTH);
    expect(rect.height).toBeLessThanOrEqual(2);
    expect(rect.height).toBeGreaterThan(0);
  });

  it('keeps role="separator" off the display:contents element', () => {
    // The a11y-tree hazard, pinned. A role on a `display: contents` element can be dropped
    // from the a11y tree, and axe — which reads the DOM — cannot see that happen. The
    // wrapper is safe only because it carries no ARIA and the role sits on the inner
    // element, which has a real box. Assert both halves (PATTERNS §12).
    expect(vHost().hasAttribute('role')).toBe(false);
    expect(vRule().getAttribute('role')).toBe('separator');
    expect(getComputedStyle(vRule()).display).not.toBe('contents');
    expect(vRule().getBoundingClientRect().height).toBeGreaterThan(0);
  });

  it('reflects orientation on the element that carries the role', () => {
    expect(vRule().getAttribute('aria-orientation')).toBe('vertical');
    expect(hRule().getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('has no axe violations, no rules disabled', async () => {
    await expectNoA11yViolations(el);
  });
});
