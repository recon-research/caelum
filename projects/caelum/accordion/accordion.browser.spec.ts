/**
 * Real-browser verification for `cae-accordion` (#405, was #79; roving restored in #759).
 *
 * **The claim under test.** `cae-accordion` now has the WAI-ARIA APG's *optional* inter-header
 * Up/Down/Home/End roving, which it lost to a view boundary: Material drives the rove from a
 * `FocusKeyManager` over headers found by `@ContentChildren`, and that query cannot see the
 * `<mat-expansion-panel-header>` rendered inside `cae-expansion-panel`'s own view. #759 hands the
 * manager those headers; this file is the evidence that the keyboard actually behaves.
 *
 * This file previously pinned the *absence* of the rove (a documented limitation is a claim like
 * any other, and nothing fails when one is stated inaccurately). That inversion is the point: the
 * limitation test was what made the fix's scope legible, and it flips to a behaviour test here
 * rather than being deleted.
 *
 * **Two things must survive the fix, and they pull against it:**
 *
 * 1. **The APG *required* interactions.** Every header reachable by Tab, Enter and Space toggling
 *    it. A wrapper that gained the optional rove but broke tabbing is a regression, not a fix.
 * 2. **The rove is *additive*, not a roving tab stop.** Material binds
 *    `[attr.tabindex]="disabled ? -1 : tabIndex"` on every header, so a real `mat-accordion` leaves
 *    each one independently tabbable and layers arrow keys on top. Re-homing focus into a single
 *    tab stop would be a *different* widget from the one Material ships — and would silently drop
 *    every other header out of the Tab order.
 *
 * **Why a browser.** All of it is pure focus behaviour: which element `Tab` reaches, and where a
 * real `ArrowDown` puts focus. jsdom can dispatch a synthetic key event but cannot answer either.
 * The item list feeding the manager — the mechanism, including the ownership filter for nested
 * accordions — is pinned in jsdom (`accordion.spec.ts`), where it is directly observable.
 *
 * Run it: `npm run test:browser`.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { userEvent } from 'vitest/browser';

import { CaeAccordion, CaeExpansionPanel } from './accordion';
import { expectNoA11yViolations } from '../testing/a11y';
import { loadCaelumTheme, themeToken } from '../testing/theme';

/** Shared by both hosts below — neither depends on which fixture is mounted. */
const titleOf = (n: Element | null) => n?.querySelector('mat-panel-title')?.textContent?.trim();
const active = () => document.activeElement?.closest('mat-expansion-panel-header') ?? null;

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

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [AccordionHost] });
    loadCaelumTheme();
    const fixture = TestBed.createComponent(AccordionHost);
    fixture.detectChanges();
    // whenStable, not detectChanges alone: #759's sync runs in an afterRenderEffect, and after-render
    // hooks are flushed by the application tick — a bare detectChanges() would leave the key manager
    // empty and every rove test below would fail for the wrong reason.
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  const headers = () => Array.from(el.querySelectorAll<HTMLElement>('mat-expansion-panel-header'));
  const byTitle = (t: string) => headers().find((h) => titleOf(h) === t)!;

  it('resolves the real token layer, so the headers are the ones Caelum ships', () => {
    expect(themeToken('--cae-focus-ring')).not.toBe('');
    expect(headers()).toHaveLength(3);
    expect(headers().map(titleOf)).toEqual(['Shipping', 'Billing', 'Returns']);
  });

  it('keeps every header its own tab stop — the rove is additive, not a roving tab stop', () => {
    // Guards the #759 fix against the obvious wrong shape. Adding arrow-key movement invites
    // re-homing focus into ONE tab stop (the tree/listbox shape elsewhere in this sweep), which
    // would drop the other headers out of the Tab order entirely. Material does not do that to a
    // `mat-accordion`, so neither may we — matching it is the whole parity claim.
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

  it('roves between headers with ArrowDown/ArrowUp (#759)', async () => {
    byTitle('Shipping').focus();

    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe(byTitle('Billing'));

    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe(byTitle('Returns'));

    await userEvent.keyboard('{ArrowUp}');
    expect(active()).toBe(byTitle('Billing'));
  });

  it('wraps at both ends, and jumps with Home/End — Material’s own manager options', async () => {
    // Not incidental behaviour to re-derive: these come from `withWrap()` and `withHomeAndEnd()` on
    // the manager #759 feeds. They are asserted because they are the reason for reusing Material's
    // manager instead of standing up a second one — if a future change swaps in a hand-rolled
    // manager, this is what notices the silent loss.
    byTitle('Shipping').focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(active()).toBe(byTitle('Returns'));

    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe(byTitle('Shipping'));

    await userEvent.keyboard('{End}');
    expect(active()).toBe(byTitle('Returns'));

    await userEvent.keyboard('{Home}');
    expect(active()).toBe(byTitle('Shipping'));
  });

  it('continues from the header the user tabbed to, not from the top of the list', async () => {
    // The half that a naive fix drops. The key manager tracks an active INDEX, and Tab moves focus
    // without telling it — so unless the header's focus monitor re-syncs the manager
    // (`accordion._handleHeaderFocus`, live only because our inner panel injects MAT_ACCORDION),
    // ArrowDown after a Tab restarts at the first header and focus jumps backwards under the user.
    byTitle('Shipping').focus();
    await userEvent.keyboard('{Tab}');
    expect(active()).toBe(byTitle('Billing'));

    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe(byTitle('Returns'));
  });

  it('still toggles with Enter after arrowing — the rove does not swallow the required keys', async () => {
    // Material's header handles Enter/Space itself and forwards only *other* keys to the accordion.
    // Feeding that accordion a non-empty item list must not disturb the split.
    byTitle('Shipping').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe(byTitle('Billing'));

    await userEvent.keyboard('{Enter}');
    expect(byTitle('Billing').getAttribute('aria-expanded')).toBe('true');
    expect(byTitle('Shipping').getAttribute('aria-expanded')).toBe('false');
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

@Component({
  imports: [CaeAccordion, CaeExpansionPanel],
  template: `
    <cae-accordion>
      @if (showInserted()) {
        <cae-expansion-panel title="Inserted">inserted body</cae-expansion-panel>
      }
      <cae-expansion-panel title="Alpha">alpha body</cae-expansion-panel>
      <cae-expansion-panel title="Beta">beta body</cae-expansion-panel>
    </cae-accordion>
  `,
})
class DynamicAccordionHost {
  readonly showInserted = signal(false);
}

describe('CaeAccordion (real browser) — the panel list changes under a focused header', () => {
  let fixture: ComponentFixture<DynamicAccordionHost>;
  let el: HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [DynamicAccordionHost] });
    loadCaelumTheme();
    fixture = TestBed.createComponent(DynamicAccordionHost);
    fixture.detectChanges();
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  const headers = () => Array.from(el.querySelectorAll<HTMLElement>('mat-expansion-panel-header'));
  const byTitle = (t: string) => headers().find((h) => titleOf(h) === t)!;

  it('re-homes the key manager when a panel is inserted above the focused header', async () => {
    // A filtered or lazily-populated accordion does this routinely, and it is the #611 failure mode
    // on a different widget: the manager tracks the active item by INDEX, and re-`reset`ting its
    // list does not by itself tell it that the focused header moved. Left stale, the index still
    // points at slot 0 — so the next ArrowDown walks to slot 1, which is now the focused header
    // itself, and focus silently goes nowhere (or backwards) under the user's hand.
    byTitle('Alpha').focus();
    expect(active()).toBe(byTitle('Alpha'));

    fixture.componentInstance.showInserted.set(true);
    await fixture.whenStable();

    expect(headers().map(titleOf)).toEqual(['Inserted', 'Alpha', 'Beta']);
    // The insert itself must not move focus — only the manager's bookkeeping changes.
    expect(active()).toBe(byTitle('Alpha'));

    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe(byTitle('Beta'));
  });
});
