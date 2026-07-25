/**
 * Real-browser verification for `cae-accordion` (#405, was #79).
 *
 * **The claim under test — a negative one.** Unlike its siblings in this sweep, `cae-accordion`
 * documents an a11y behaviour it does *not* have:
 *
 * > *"The APG's **optional** inter-header Up/Down/Home/End roving is NOT forwarded: Material
 * > drives it from an `@ContentChildren(MatExpansionPanelHeader)` query that doesn't cross the
 * > `cae-expansion-panel` view boundary. Tracked in #79 for a real-browser check at M4."*
 *
 * A documented limitation is a claim like any other, and it is the *dangerous* kind: nothing fails
 * when a limitation is stated inaccurately. Two things therefore need pinning, and they pull in
 * opposite directions:
 *
 * 1. **The limitation is real** — arrow keys genuinely do not rove between headers. If a future
 *    Angular release starts crossing that boundary, this file fails and the doc block gets
 *    corrected instead of quietly becoming a lie.
 * 2. **The limitation is only the optional part.** The APG's *required* accordion interactions —
 *    every header reachable by Tab, Enter and Space toggling it — must still work. A wrapper that
 *    lost the optional rove is conformant; one that also broke tabbing is broken. Nothing today
 *    separates those two outcomes.
 *
 * **Why a browser.** Both halves are pure focus behaviour: which element `Tab` reaches, and
 * whether a real `ArrowDown` moves focus. jsdom can dispatch a synthetic key event but cannot
 * answer where the browser would actually put focus.
 *
 * Run it: `npm run test:browser`.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { userEvent } from 'vitest/browser';

import { CaeAccordion, CaeExpansionPanel } from './accordion';
import { expectNoA11yViolations } from '../testing/a11y';
import { loadCaelumTheme, themeToken } from '../testing/theme';

@Component({
  imports: [CaeAccordion, CaeExpansionPanel],
  template: `
    <cae-accordion>
      <cae-expansion-panel title="Shipping">shipping body</cae-expansion-panel>
      <cae-expansion-panel title="Billing">billing body</cae-expansion-panel>
      <cae-expansion-panel title="Returns">returns body</cae-expansion-panel>
    </cae-accordion>
  `,
})
class AccordionHost {}

describe('CaeAccordion (real browser)', () => {
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [AccordionHost] });
    loadCaelumTheme();
    const fixture = TestBed.createComponent(AccordionHost);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  const headers = () => Array.from(el.querySelectorAll<HTMLElement>('mat-expansion-panel-header'));
  const titleOf = (n: Element | null) => n?.querySelector('mat-panel-title')?.textContent?.trim();
  const active = () => document.activeElement?.closest('mat-expansion-panel-header') ?? null;
  const byTitle = (t: string) => headers().find((h) => titleOf(h) === t)!;

  it('resolves the real token layer, so the headers are the ones Caelum ships', () => {
    expect(themeToken('--cae-focus-ring')).not.toBe('');
    expect(headers()).toHaveLength(3);
    expect(headers().map(titleOf)).toEqual(['Shipping', 'Billing', 'Returns']);
  });

  it('makes every header its own tab stop — the shape a non-roving accordion has', () => {
    // The observable signature of "no roving": each header is independently tabbable, rather than
    // one tab stop that the arrow keys move (the tree/listbox shape in this same sweep).
    for (const header of headers()) {
      expect(header.getAttribute('tabindex')).toBe('0');
    }
  });

  it('reaches each header with Tab — the APG *required* interaction', async () => {
    byTitle('Shipping').focus();
    expect(active()).toBe(byTitle('Shipping'));

    await userEvent.keyboard('{Tab}');
    // Focus must land on the next header, not be trapped or skipped. This is the half that must
    // keep working regardless of the missing rove.
    expect(active()).toBe(byTitle('Billing'));
  });

  it('does NOT rove between headers with the arrow keys — the documented limitation, pinned', async () => {
    byTitle('Shipping').focus();

    await userEvent.keyboard('{ArrowDown}');
    // The #79 claim itself. Verified rather than assumed: if Angular ever forwards the
    // ContentChildren query across the wrapper's view boundary, this fails and the doc block in
    // `accordion.ts` must be corrected — which is the entire point of pinning a limitation.
    expect(active()).toBe(byTitle('Shipping'));

    await userEvent.keyboard('{End}');
    expect(active()).toBe(byTitle('Shipping'));

    // Vacuity guard, in this test rather than a sibling one. "Focus did not move" is exactly the
    // assertion that also passes when keys reach nothing at all — a broken harness, a detached
    // fixture, an unfocusable header. Enter on the SAME element in the SAME state must still
    // toggle it, so the two arrows above are proven inert rather than merely undelivered.
    await userEvent.keyboard('{Enter}');
    expect(byTitle('Shipping').getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles the focused header with Enter and Space — the other required interaction', async () => {
    const shipping = byTitle('Shipping');
    expect(shipping.getAttribute('aria-expanded')).toBe('false');

    shipping.focus();
    await userEvent.keyboard('{Enter}');
    expect(shipping.getAttribute('aria-expanded')).toBe('true');

    await userEvent.keyboard(' ');
    expect(shipping.getAttribute('aria-expanded')).toBe('false');
  });

  it('has no axe violations, no rules disabled', async () => {
    await expectNoA11yViolations(el);
  });
});
