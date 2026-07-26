/**
 * Real-browser verification for `cae-table` (#405, two boxes: single-select #223 and sticky #254).
 *
 * ## Single-select radio grouping (#223)
 *
 * `table.ts` rests an a11y contract on a *third-party* behaviour it never measured:
 *
 * > *"Arrow-key roving+select between the radios then rests on native same-name-radio behaviour
 * > (real-browser verify #223)"*
 *
 * Standalone `MatRadioButton`s scattered across table rows are not a `MatRadioGroup` — a group
 * element cannot wrap rows — so the grouping is the browser's own, inferred from a shared `name`.
 * Whether that survives being spread across `<tr>`s, and whether it still moves focus when every
 * radio but one carries `tabindex="-1"`, is exactly the kind of assumption this sweep exists to
 * check. **Measured, and it holds**: `tabindexes=0,-1,-1,-1`, `ArrowDown` → `focus=1 checked=1`,
 * and the tab stop then follows the selection (`-1,0,-1,-1`).
 *
 * ## Sticky header + columns (#254)
 *
 * Two things the unit tests explicitly cannot reach — `table.spec.ts` says so: *"jsdom has no layout:
 * every `getBoundingClientRect()` is 0, so the offsets the styler computes are all `0px` and prove
 * nothing about real placement."* Here the offsets are real, so this file asserts **placement**, and
 * then the a11y consequence of placement.
 *
 * **Measure the `<th>`, not the `<tr>`.** `position: sticky` is applied to the header *cells*; the
 * row box scrolls away underneath them. Measuring `thead tr` reports the un-stuck position and reads
 * as "sticky is broken" — it cost a wrong conclusion while writing this file.
 *
 * **The focus-occlusion hazard is real, and only a *short* backwards move exposes it.** Chromium
 * *centers* an element that is far out of view: jumping from the bottom of the table to row 2 parks
 * the control at 85px clearance in a 192px scrollport, comfortably below a 56px header band — with
 * `stickyHeader` on *or off*, identically (`scrollTop 1442->108` both ways). So a long jump proves
 * nothing, and Chromium is confirmed **not** sticky-aware. Step back one row instead — the minimum
 * scroll — and the control parks flush at clearance `0`, directly under the band. That is the
 * WCAG 2.2 SC 2.4.11 failure obligation 3 in `table.ts` exists to prevent, and the tests below pin
 * both halves: the hazard, and the `scroll-padding-block-start` recipe that fixes it.
 *
 * cae-table dev-warns on the *neighbouring* 2.4.11 hazard (a non-contiguous sticky-column run) but
 * not on this one; that asymmetry is filed as **#766**.
 *
 * Run it: `npm run test:browser`.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { userEvent } from 'vitest/browser';

import { CaeTable } from './table';
import { CaeCellDef } from './cell-def';
import type { CaeTableColumn } from './table';
import { expectNoA11yViolations } from '../testing/a11y';
import { loadCaelumTheme } from '../testing/theme';

interface Person {
  name: string;
  role: string;
  role2: string;
  role3: string;
  role4: string;
}

const COLUMNS: CaeTableColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'role', header: 'Role' },
];
const ROWS: Person[] = Array.from({ length: 30 }, (_, i) => ({
  name: `Person ${i}`,
  role: `Role ${i}`,
  role2: `Second ${i}`,
  role3: `Third ${i}`,
  role4: `Fourth ${i}`,
}));

@Component({
  imports: [CaeTable],
  template: `
    <button type="button" id="before">before</button>
    <cae-table
      caption="Roster"
      selectionMode="single"
      [columns]="columns"
      [data]="data"
      [(selection)]="selection"
    />
    <button type="button" id="after">after</button>
  `,
})
class SingleSelectHost {
  readonly columns = COLUMNS;
  readonly data = ROWS.slice(0, 4);
  readonly selection = signal<readonly Person[]>([]);
}

@Component({
  imports: [CaeTable, CaeCellDef],
  template: `
    <div
      id="scroller"
      role="region"
      aria-label="Team roster"
      tabindex="0"
      [style.scroll-padding-block-start.px]="pad()"
      style="block-size: 12rem; overflow: auto;"
    >
      <cae-table caption="Team roster" stickyHeader [columns]="columns" [data]="data">
        <ng-template caeCellDef="name" let-value="value" let-i="index">
          <button type="button" class="row-btn" [attr.data-idx]="i">{{ value }}</button>
        </ng-template>
      </cae-table>
    </div>
  `,
})
class StickyHeaderHost {
  readonly columns = COLUMNS;
  readonly data = ROWS;
  readonly pad = signal(0);
}

@Component({
  imports: [CaeTable],
  template: `
    <div
      id="scroller"
      role="region"
      aria-label="Wide roster"
      tabindex="0"
      style="inline-size: 20rem; overflow: auto;"
    >
      <cae-table
        caption="Wide roster"
        style="display: block; min-inline-size: 60rem"
        [columns]="columns"
        [data]="data"
      />
    </div>
  `,
})
class StickyColumnHost {
  // Five columns, so the frozen one is a small fraction of the table's width. That matters: a sticky
  // box cannot leave its containing block, so a frozen column un-pins once the scroll passes
  // (tableWidth - columnWidth). With two columns the sticky one was 527px of 960px and slid after
  // 433px of scroll — correct per spec, but outside the regime frozen columns exist for.
  readonly columns: CaeTableColumn[] = [
    { key: 'name', header: 'Name', sticky: true },
    { key: 'role', header: 'Role' },
    { key: 'role2', header: 'Role 2' },
    { key: 'role3', header: 'Role 3' },
    { key: 'role4', header: 'Role 4' },
  ];
  readonly data = ROWS.slice(0, 5);
}

@Component({
  imports: [CaeTable],
  template: `<cae-table caption="Roster" [columns]="columns" [data]="data()" />`,
})
class EmptyStateHost {
  readonly columns = COLUMNS;
  readonly data = signal<readonly Person[]>(ROWS.slice(0, 3));
}

const frame = (): Promise<unknown> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

describe('CaeTable — single-select radio grouping (real browser, #223)', () => {
  let fixture: ComponentFixture<SingleSelectHost>;
  let el: HTMLElement;

  const radios = (): HTMLInputElement[] =>
    Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  const focusedIndex = (): number => radios().findIndex((r) => r === document.activeElement);
  const checkedIndex = (): number => radios().findIndex((r) => r.checked);

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [SingleSelectHost] });
    loadCaelumTheme();
    fixture = TestBed.createComponent(SingleSelectHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('shares one name across the rows, so the browser treats them as one group', () => {
    expect(radios()).toHaveLength(4);
    // The whole native-grouping contract depends on this: one name, N rows. If a future change gave
    // each row its own name, every assertion below would still pass except the arrow-key ones.
    expect(new Set(radios().map((r) => r.name)).size).toBe(1);
  });

  it('puts exactly one radio in the tab order, and Tab leaves the group after it', async () => {
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1, -1]);

    (el.querySelector('#before') as HTMLElement).focus();
    await userEvent.keyboard('{Tab}');
    expect(focusedIndex()).toBe(0);

    // The point of the roving tabindex: a 4-row table costs ONE tab stop, not four.
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).toBe(el.querySelector('#after'));
  });

  it('roves AND selects with the arrow keys, the native same-name-radio behaviour', async () => {
    radios()[0].focus();
    expect(checkedIndex()).toBe(-1);

    // Native radio semantics: the arrow moves focus and checks in one step — there is no
    // "focused but unselected" state to land in. That is what makes the roving tabindex safe.
    await userEvent.keyboard('{ArrowDown}');
    expect(focusedIndex()).toBe(1);
    expect(checkedIndex()).toBe(1);

    await userEvent.keyboard('{ArrowDown}');
    expect(focusedIndex()).toBe(2);
    expect(checkedIndex()).toBe(2);

    await userEvent.keyboard('{ArrowUp}');
    expect(focusedIndex()).toBe(1);
    expect(checkedIndex()).toBe(1);
  });

  it('drives the vendor-neutral selection model from an arrow-key change', async () => {
    radios()[0].focus();
    await userEvent.keyboard('{ArrowDown}');
    fixture.detectChanges();

    // The arrow selection must reach `selection`, not just the DOM — `(change)` -> `selectOne(row)`.
    expect(fixture.componentInstance.selection()).toEqual([ROWS[1]]);
  });

  it('moves the tab stop onto the selected row', async () => {
    radios()[0].focus();
    await userEvent.keyboard('{ArrowDown}');
    fixture.detectChanges();

    // Re-entering the table by Tab must land on the *selected* row, not back at the first.
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1]);
  });

  it('has no axe violations', async () => {
    await expectNoA11yViolations(el);
  });
});

describe('CaeTable — sticky header placement + focus occlusion (real browser, #254)', () => {
  let fixture: ComponentFixture<StickyHeaderHost>;
  let el: HTMLElement;
  let scroller: HTMLElement;

  /** The sticky element is the header CELL; the row box scrolls away beneath it. */
  const headerCell = (): HTMLElement => el.querySelector<HTMLElement>('thead th')!;
  const rowButton = (i: number): HTMLElement => el.querySelector(`.row-btn[data-idx="${i}"]`)!;
  /** Distance from the scrollport's top edge to an element's top edge, in CSS px. */
  const clearance = (e: HTMLElement): number =>
    Math.round(e.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
  const contentTop = (e: HTMLElement): number =>
    e.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;

  /**
   * Move focus backwards by one row, with the target parked `above` px above the scrollport — the
   * minimum-scroll case. A long jump instead triggers Chromium's centering and hides the hazard.
   */
  async function stepBackOneRow(target: number, above: number): Promise<void> {
    (document.activeElement as HTMLElement | null)?.blur();
    scroller.scrollTop = contentTop(rowButton(target)) + above;
    await frame();
    rowButton(target + 1).focus();
    await frame();
    rowButton(target).focus();
    await frame();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [StickyHeaderHost] });
    loadCaelumTheme();
    fixture = TestBed.createComponent(StickyHeaderHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    scroller = el.querySelector<HTMLElement>('#scroller')!;
  });

  it('pins the header cells to the scrollport top while the body scrolls away', async () => {
    // At rest the header sits *below* the `<caption>`, so its clearance is the caption's height —
    // not 0. Asserting 0 here instead is how this test first failed; the pinning claim is about
    // where the header ends up once the content scrolls, not where it starts.
    const headerAtRest = clearance(headerCell());
    expect(headerAtRest).toBeGreaterThan(0);
    const firstRowBefore = clearance(rowButton(0));

    scroller.scrollTop = scroller.scrollHeight;
    await frame();

    // The header pulls up to the scrollport edge and holds; the body moved. In jsdom both rects are
    // 0 and this is vacuous, which is why `table.spec.ts` asserts the sticky *class* and defers
    // placement to here.
    expect(clearance(headerCell())).toBe(0);
    expect(getComputedStyle(headerCell()).position).toBe('sticky');
    expect(clearance(rowButton(0))).toBeLessThan(firstRowBefore);
  });

  it('parks a backwards-focused control UNDER the header when the wrapper has no scroll-padding', async () => {
    fixture.componentInstance.pad.set(0);
    fixture.detectChanges();

    await stepBackOneRow(10, 10);

    // The hazard, reproduced: the browser scrolled the minimum amount, so the control sits flush at
    // the scrollport top — inside the band the header paints over. WCAG 2.2 SC 2.4.11.
    const headerBottom = clearance(headerCell()) + headerCell().getBoundingClientRect().height;
    expect(clearance(rowButton(10))).toBeLessThan(headerBottom);
  });

  it('clears the header once the wrapper carries scroll-padding-block-start', async () => {
    const headerHeight = Math.round(headerCell().getBoundingClientRect().height);
    fixture.componentInstance.pad.set(headerHeight);
    fixture.detectChanges();

    await stepBackOneRow(10, 10);

    // The documented obligation-3 recipe, verified: same movement, no longer obscured.
    const headerBottom = clearance(headerCell()) + headerCell().getBoundingClientRect().height;
    expect(clearance(rowButton(10))).toBeGreaterThanOrEqual(headerBottom);
  });

  it('has no axe violations with a sticky header', async () => {
    await expectNoA11yViolations(el);
  });
});

describe('CaeTable — sticky column placement (real browser, #254)', () => {
  let fixture: ComponentFixture<StickyColumnHost>;
  let el: HTMLElement;
  let scroller: HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [StickyColumnHost] });
    loadCaelumTheme();
    fixture = TestBed.createComponent(StickyColumnHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    scroller = el.querySelector<HTMLElement>('#scroller')!;
  });

  it('freezes the start column against the inline-start edge while the table scrolls sideways', async () => {
    const firstCell = (): HTMLElement => el.querySelector<HTMLElement>('tbody td')!;
    const secondCell = (): HTMLElement =>
      el.querySelectorAll<HTMLElement>('tbody tr:first-child td')[1];
    const left = (e: HTMLElement): number =>
      Math.round(e.getBoundingClientRect().left - scroller.getBoundingClientRect().left);

    // Obligation 2: the table must actually overflow its wrapper, or nothing scrolls and nothing
    // freezes — a sticky test on a non-overflowing table passes while measuring nothing.
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
    expect(left(firstCell())).toBe(0);
    const secondBefore = left(secondCell());

    // A moderate scroll, deliberately inside (tableWidth - stickyColumnWidth) — see the host's note.
    const scrollBy = 200;
    expect(scroller.scrollWidth - scroller.clientWidth).toBeGreaterThan(scrollBy);
    scroller.scrollLeft = scrollBy;
    await frame();

    expect(left(firstCell())).toBe(0);
    expect(left(secondCell())).toBe(secondBefore - scrollBy);
  });
});

/**
 * The empty-state live region (#405, found while verifying `cae-tree-table`'s #263 box).
 *
 * `cae-table` and `cae-tree-table` both hid this region with `display: none` while `:empty`, which
 * prunes it from the accessibility tree for the entire time the table has rows — i.e. right up to
 * the populated→empty transition it exists to announce, making that the reliably-silent case.
 * `cae-data-grid` already documented the rule and the reason in its own stylesheet; these two had
 * copied each other instead (tree-table's template comment literally says "Mirrors cae-table").
 * Fixed in both by adopting the grid's clip-based hide.
 *
 * Only the *populated-state* computed-style assertion catches this: the mutation record stays
 * `characterData` either way, and by the time the region holds text it is displayed even when buggy.
 */
describe('CaeTable — empty-state live region (real browser, #405)', () => {
  let fixture: ComponentFixture<EmptyStateHost>;
  let el: HTMLElement;

  const region = (): HTMLElement => el.querySelector<HTMLElement>('.cae-table__empty')!;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [EmptyStateHost] });
    loadCaelumTheme();
    fixture = TestBed.createComponent(EmptyStateHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('stays in the a11y tree while the table has rows, so the region is watched', () => {
    expect(region().textContent).toBe('');
    expect(getComputedStyle(region()).display).not.toBe('none');
    expect(getComputedStyle(region()).visibility).not.toBe('hidden');
  });

  it('announces by mutating that same node rather than inserting one already holding text', async () => {
    const born = region();

    let textMutations = 0;
    const insertedCarryingText: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') textMutations++;
        for (const node of Array.from(record.addedNodes)) {
          const added = node as HTMLElement;
          if (added.classList?.contains('cae-table__empty') && added.textContent?.trim()) {
            insertedCarryingText.push(added.textContent.trim());
          }
        }
      }
    });
    observer.observe(el, { characterData: true, childList: true, subtree: true });

    fixture.componentInstance.data.set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await frame();
    observer.disconnect();

    expect(region().textContent).toContain('No data.');
    expect(textMutations).toBeGreaterThan(0);
    expect(insertedCarryingText).toEqual([]);
    expect(region()).toBe(born);
  });
});
