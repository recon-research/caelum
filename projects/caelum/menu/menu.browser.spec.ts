/**
 * Real-browser verification for `cae-menu`'s tiered submenus (#150, via the #240 harness).
 *
 * **Why this file has to exist.** The recursion puts a nested `<cae-menu>` element *between the
 * rows* of its parent's panel — a branch's child panel is a sibling of the buttons, not a child of
 * one. If that element ever occupies a box it silently pushes the following rows apart, and jsdom
 * performs no layout, so nothing in `menu.spec.ts` can see it.
 *
 * **What was measured here, so nobody re-adds it.** A `:host { display: none }` rule was written
 * first, on the reasoning that an unknown element defaults to `display: inline` and would generate
 * a line box. That is wrong in this context and the rule was **deleted**: with no rule at all the
 * rows stay exactly flush, because Material lays its menu content out as a flex column and an empty
 * inline element with no text generates no line box. Confirmed by mutation — `none`, `block`, and
 * *no rule* all measure identically — and the test is not merely insensitive: a deliberate 20px
 * spacer in the branch arm moves the next row by 16px and fails this assertion. So the guard that
 * survives is the measurement, not a style rule.
 *
 * The rest of the submenu contract — ARIA, emission, per-level roving focus, depth — is behavioural
 * and stays in `menu.spec.ts`, where it runs on every push.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';

import { CaeMenu, CaeMenuItem, CaeMenuTrigger } from './menu';
import { loadCaelumTheme } from '../testing/theme';

@Component({
  imports: [CaeMenu, CaeMenuTrigger],
  template: `
    <cae-menu #actions [items]="items()" />
    <button type="button" [caeMenuTriggerFor]="actions">Actions</button>
  `,
})
class MenuBrowserHost {
  readonly items = signal<readonly CaeMenuItem[]>([]);
}

/** A leaf, a BRANCH (which stamps a nested cae-menu after its row), then another leaf. */
const WITH_BRANCH: readonly CaeMenuItem[] = [
  { value: 'a', label: 'Alpha' },
  { label: 'Branch', items: [{ value: 'c', label: 'Child' }] },
  { value: 'b', label: 'Bravo' },
];
/** The same three rows with no nested component between them — the control. */
const FLAT: readonly CaeMenuItem[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'x', label: 'Branch' },
  { value: 'b', label: 'Bravo' },
];

describe('cae-menu submenu layout (real browser, #150)', () => {
  let fixture: ComponentFixture<MenuBrowserHost>;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await loadCaelumTheme();
    fixture = TestBed.createComponent(MenuBrowserHost);
    document.body.appendChild(fixture.nativeElement);
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    overlayContainer?.ngOnDestroy();
    fixture?.nativeElement?.remove();
  });

  const rootTrigger = (): CaeMenuTrigger =>
    fixture.debugElement.query(By.directive(CaeMenuTrigger)).injector.get(CaeMenuTrigger);

  const openWith = async (items: readonly CaeMenuItem[]): Promise<HTMLElement[]> => {
    rootTrigger().close();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.items.set(items);
    fixture.detectChanges();
    await fixture.whenStable();
    rootTrigger().open();
    fixture.detectChanges();
    await fixture.whenStable();
    const panel = overlayContainer.getContainerElement().querySelector('.mat-mdc-menu-panel')!;
    return Array.from(panel.querySelectorAll<HTMLElement>('[mat-menu-item]'));
  };

  it("a branch's nested cae-menu contributes no box — rows stay flush", async () => {
    const rows = await openWith(WITH_BRANCH);
    expect(rows.map((r) => r.textContent!.trim())).toEqual(['Alpha', 'Branch', 'Bravo']);

    // The nested <cae-menu> sits between 'Branch' and 'Bravo'. If it occupied a line box those
    // two rows would separate; adjacent Material menu items are flush.
    const gapAfterBranch =
      rows[2].getBoundingClientRect().top - rows[1].getBoundingClientRect().bottom;
    const gapBeforeBranch =
      rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom;
    expect(gapAfterBranch).toBeCloseTo(gapBeforeBranch, 1);
    expect(gapAfterBranch).toBeLessThan(1);

    // And the branch panel measures the same overall as the equivalent flat menu.
    const branchHeight =
      rows[2].getBoundingClientRect().bottom - rows[0].getBoundingClientRect().top;
    const flat = await openWith(FLAT);
    const flatHeight = flat[2].getBoundingClientRect().bottom - flat[0].getBoundingClientRect().top;
    expect(branchHeight).toBeCloseTo(flatHeight, 1);
  });
});
