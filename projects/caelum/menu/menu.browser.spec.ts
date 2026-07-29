/**
 * Real-browser verification for `cae-menu`'s tiered submenus (#150, via the #240 harness).
 *
 * **Why this file has to exist.** The recursion puts a nested `<cae-menu>` element *between the
 * rows* of its parent's panel — a branch's child panel is a sibling of the buttons, not a child of
 * one. If that element ever occupies a box it silently pushes the following rows apart, and jsdom
 * performs no layout, so nothing in `menu.spec.ts` can see it.
 *
 * **Two contexts, and testing only one produced a wrong conclusion — that is why both arms exist.**
 * An early draft of this slice wrote `:host { display: none }` on `cae-menu`, measured it *inside a
 * menu panel*, found `none` / `block` / *no rule* all identical, and deleted the rule as inert. The
 * measurement was right and the conclusion was wrong, because the panel is the one context where it
 * does not matter:
 *   1. **Inside a menu panel** (`.mat-mdc-menu-content`) the parent is a **block** container — it
 *      declares no `display` at all, and the `flex: 1` on it is a flex-ITEM property, inert here.
 *      CSS 2.1 §9.4.2 lets an empty inline with no margin/padding/border yield a line box treated as
 *      not existing, so the rows stay flush either way. (The "Material uses a flex column" reason a
 *      draft of this comment gave is simply false.)
 *   2. **In consumer flow content** the parent is typically `display: flex` with a `gap` — Forge's
 *      own header is exactly that, with `<cae-menu>` between two buttons. There the empty inline
 *      **blockifies into a real flex item** and the gap applies to it, costing one stray gap.
 *      `cae-menubar` had already patched this locally from the outside before the rule existed.
 *
 * So the rule is NOT inert; it is load-bearing in context 2 and merely unnecessary in context 1. The
 * flex arm below is the one that kills its mutation. Both are kept, because deleting the panel arm
 * would re-open the door to the same wrong conclusion.
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

/**
 * Reproduces the shape consumers actually use, and the one Forge's header uses: a flex row with a
 * `gap`, with `<cae-menu>` sitting BETWEEN two visible controls.
 */
@Component({
  imports: [CaeMenu, CaeMenuTrigger],
  template: `
    <div id="row" style="display: flex; align-items: center; gap: 24px; width: 600px">
      <button id="a" type="button">A</button>
      <cae-menu #m [items]="items" />
      <button id="b" type="button" [caeMenuTriggerFor]="m">B</button>
    </div>
  `,
})
class FlowContentHost {
  items: CaeMenuItem[] = [{ value: 'x', label: 'X' }];
}

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

    // And the branch panel measures the same overall as the equivalent flat menu. Material defers
    // `overlayRef.detach()` behind its close animation, so a close/reopen can hand back the SAME
    // panel: without these two guards a failure to re-render would compare the panel with itself
    // and pass.
    const branchHeight =
      rows[2].getBoundingClientRect().bottom - rows[0].getBoundingClientRect().top;
    const flat = await openWith(FLAT);
    expect(flat.map((r) => r.textContent!.trim())).toEqual(['Alpha', 'Branch', 'Bravo']);
    expect(flat[0]).not.toBe(rows[0]);
    const flatHeight = flat[2].getBoundingClientRect().bottom - flat[0].getBoundingClientRect().top;
    expect(branchHeight).toBeCloseTo(flatHeight, 1);
  });
});

describe('cae-menu host in consumer flow content (real browser, #150)', () => {
  let fixture: ComponentFixture<FlowContentHost>;

  beforeEach(() => loadCaelumTheme());

  afterEach(() => fixture?.nativeElement?.remove());

  it('contributes no flex item — the gap between neighbours stays a single gap', async () => {
    fixture = TestBed.createComponent(FlowContentHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const a = root.querySelector<HTMLElement>('#a')!;
    const b = root.querySelector<HTMLElement>('#b')!;
    const caeMenu = root.querySelector<HTMLElement>('cae-menu')!;

    // The BEHAVIOURAL assertion first, deliberately: not a flex item at all means exactly ONE 24px
    // gap between the two buttons. Without the rule the empty inline blockifies into an item and the
    // row pays TWO gaps (48px) — the stray space Forge's header showed. This is what the
    // panel-layout arm above cannot see, since a block container absorbs the empty inline either
    // way. Verified by mutation: deleting the rule fails on THIS line.
    expect(b.getBoundingClientRect().left - a.getBoundingClientRect().right).toBeCloseTo(24, 0);
    // Then the mechanism, as corroboration only. Deleting the rule computes `block` here, not
    // `inline` — the browser blockifies an in-flow child of a flex container, which is precisely
    // why the gap applies to it.
    expect(getComputedStyle(caeMenu).display).toBe('none');
    expect(caeMenu.getBoundingClientRect().width).toBe(0);
  });
});
