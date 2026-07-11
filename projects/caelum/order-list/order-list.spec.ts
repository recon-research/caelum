import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { vi } from 'vitest';

import { CaeOrderList, CaeOrderListItemDef, CaeOrderListReorderEvent } from './order-list';

interface Row {
  id: string;
  name: string;
}

/** A fresh trail each call so tests never share array identity. */
const ROWS = (): Row[] => [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Bravo' },
  { id: 'c', name: 'Charlie' },
];

/** Host with a projected item template — the common, content-agnostic case. */
@Component({
  selector: 'cae-order-list-host',
  imports: [CaeOrderList, CaeOrderListItemDef],
  template: `
    <cae-order-list
      [value]="items()"
      (valueChange)="items.set($event)"
      [selection]="selection()"
      (selectionChange)="selection.set($event)"
      [ariaLabel]="ariaLabel()"
      [ariaLabelledby]="ariaLabelledby()"
      (reorder)="lastReorder.set($event)"
    >
      <ng-template
        caeOrderListItem
        let-item
        let-i="index"
        let-active="active"
        let-selected="selected"
      >
        <span class="tpl"
          >{{ $any(item).name }}#{{ i }}{{ active ? '*' : '' }}{{ selected ? '+' : '' }}</span
        >
      </ng-template>
    </cae-order-list>
  `,
})
class OrderListHost {
  readonly items = signal<readonly Row[]>([]);
  readonly selection = signal<readonly Row[]>([]);
  readonly ariaLabel = signal('');
  readonly ariaLabelledby = signal('');
  readonly lastReorder = signal<CaeOrderListReorderEvent<Row> | null>(null);
}

/** Host with NO template — exercises the `{{ item }}` fallback with plain strings. */
@Component({
  selector: 'cae-order-list-fallback-host',
  imports: [CaeOrderList],
  template: `<cae-order-list [value]="items()" ariaLabel="Plain" />`,
})
class FallbackHost {
  readonly items = signal<readonly string[]>(['x', 'y', 'z']);
}

describe('CaeOrderList', () => {
  let fixture: ComponentFixture<OrderListHost>;
  let host: OrderListHost;
  let list: HTMLElement;
  let announce: ReturnType<typeof vi.spyOn>;

  function render(
    opts: { items?: readonly Row[]; ariaLabel?: string; ariaLabelledby?: string } = {},
  ): void {
    fixture = TestBed.createComponent(OrderListHost);
    host = fixture.componentInstance;
    host.items.set(opts.items ?? ROWS());
    if (opts.ariaLabel !== undefined) host.ariaLabel.set(opts.ariaLabel);
    if (opts.ariaLabelledby !== undefined) host.ariaLabelledby.set(opts.ariaLabelledby);
    // Attach to the document so `.focus()` moves `document.activeElement` (jsdom requirement).
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    list = fixture.nativeElement.querySelector('[role="listbox"]') as HTMLElement;
  }

  beforeEach(() => {
    const announcer = TestBed.inject(LiveAnnouncer);
    // Stub the announce so the test never mounts a real live region; we only assert the call.
    announce = vi.spyOn(announcer, 'announce').mockResolvedValue(undefined);
  });

  afterEach(() => {
    fixture?.nativeElement.remove();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  /** The option rows' visible text, in order. */
  function optionTexts(): string[] {
    return Array.from(list.querySelectorAll<HTMLElement>('[role="option"]')).map((el) =>
      el.textContent!.trim(),
    );
  }
  function options(): HTMLElement[] {
    return Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
  }
  function btn(label: string): HTMLButtonElement {
    return fixture.nativeElement.querySelector(
      `button[aria-label="${label}"]`,
    ) as HTMLButtonElement;
  }
  // Buttons use aria-disabled (NOT native [disabled]) so a bound-reaching button stays focusable.
  function disabled(label: string): boolean {
    return btn(label).getAttribute('aria-disabled') === 'true';
  }
  // Focus (roving tab stop) is now separate from selection — read them independently.
  function focusedText(): string {
    return list.querySelector('[tabindex="0"]')!.textContent!.trim();
  }
  function selectedTexts(): string[] {
    return Array.from(list.querySelectorAll<HTMLElement>('[aria-selected="true"]')).map((el) =>
      el.textContent!.trim(),
    );
  }
  function key(el: HTMLElement, k: string, mods: Partial<KeyboardEventInit> = {}): void {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...mods }));
    fixture.detectChanges();
  }
  function clickRow(i: number, mods: Partial<MouseEventInit> = {}): void {
    options()[i].dispatchEvent(new MouseEvent('click', { bubbles: true, ...mods }));
    fixture.detectChanges();
  }

  it('renders a named listbox of option rows, one per item, wired as a cdkDropList', () => {
    render();
    expect(list).toBeTruthy();
    expect(list.getAttribute('aria-label')).toBe('Order list'); // default name
    expect(options().length).toBe(3);
    expect(options().every((o) => o.getAttribute('role') === 'option')).toBe(true);
    // The CdkDropList directive is actually applied (it stamps this class on its host) — so the
    // (cdkDropListDropped) binding that drives onDrop is real, not just a handler tested in isolation.
    expect(list.classList.contains('cdk-drop-list')).toBe(true);
    // The instructions are described-by the OPTIONS (not the container) so roving tabindex re-announces
    // them as focus moves — the listbox.ts precedent (a container describedby is never re-read).
    const describedby = options()[0].getAttribute('aria-describedby');
    expect(describedby).toBeTruthy();
    expect(list.getAttribute('aria-describedby')).toBeNull();
    expect(fixture.nativeElement.querySelector(`#${describedby}`)?.textContent).toContain(
      'reorder',
    );
  });

  it('names the list from [ariaLabel], and prefers [ariaLabelledby] when set', () => {
    render({ ariaLabel: 'Selected columns' });
    expect(list.getAttribute('aria-label')).toBe('Selected columns');

    render({ ariaLabel: 'ignored', ariaLabelledby: 'heading-id' });
    expect(list.getAttribute('aria-labelledby')).toBe('heading-id');
    expect(list.getAttribute('aria-label')).toBeNull(); // labelledby wins; no double name
  });

  it('focuses the first row by default (sole tab stop) with nothing selected (multiselectable)', () => {
    render();
    const rows = options();
    expect(list.getAttribute('aria-multiselectable')).toBe('true');
    // Focus (tab stop) defaults to row 0; selection is empty (p-orderList parity).
    expect(rows[0].getAttribute('tabindex')).toBe('0');
    expect(rows[1].getAttribute('tabindex')).toBe('-1');
    expect(rows[2].getAttribute('tabindex')).toBe('-1');
    expect(rows.every((r) => r.getAttribute('aria-selected') === 'false')).toBe(true);
    expect(selectedTexts()).toEqual([]);
  });

  it('plain click selects only that row (replace) and focuses it', () => {
    render();
    clickRow(2);
    expect(options()[2].getAttribute('aria-selected')).toBe('true');
    expect(options()[2].getAttribute('tabindex')).toBe('0'); // focus follows
    expect(options()[0].getAttribute('aria-selected')).toBe('false');
    expect(selectedTexts()).toEqual(['Charlie#2*+']); // exactly one selected
    expect(host.selection().map((r) => r.name)).toEqual(['Charlie']); // [(selection)] round-trips out
  });

  it('Arrow/Home/End move focus only — no reorder, no selection, no announce', () => {
    render();
    const before = optionTexts();
    options()[0].focus();

    key(options()[0], 'ArrowDown');
    expect(document.activeElement).toBe(options()[1]);
    expect(focusedText()).toContain('Bravo');

    key(options()[1], 'End');
    expect(document.activeElement).toBe(options()[2]);

    key(options()[2], 'Home');
    expect(document.activeElement).toBe(options()[0]);

    // Navigation never reorders, never selects, and doesn't announce a move.
    expect(optionTexts()).toEqual(before);
    expect(selectedTexts()).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
  });

  it('marks the up/top buttons aria-disabled at the first row and down/bottom at the last', () => {
    render();
    // Active is row 0 by default.
    expect(disabled('Move up')).toBe(true);
    expect(disabled('Move to top')).toBe(true);
    expect(disabled('Move down')).toBe(false);
    expect(disabled('Move to bottom')).toBe(false);
    // aria-disabled, not native [disabled] — the button stays in the tab order (never blurs).
    expect(btn('Move up').disabled).toBe(false);

    options()[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(disabled('Move up')).toBe(false);
    expect(disabled('Move down')).toBe(true);
    expect(disabled('Move to bottom')).toBe(true);
  });

  it('keeps a bound-reaching move button focused (aria-disabled, not native disabled → no strand)', () => {
    render(); // active = row 0
    const down = btn('Move to bottom');
    down.focus();
    expect(document.activeElement).toBe(down);
    down.click(); // Alpha 0 -> 2; now "Move down"/"Move to bottom" become aria-disabled
    fixture.detectChanges();
    // The focused button must NOT be blurred to <body> — a native [disabled] flip would strand it.
    expect(disabled('Move to bottom')).toBe(true);
    expect(document.activeElement).toBe(down);
    expect(down.getAttribute('aria-disabled')).toBe('true');
  });

  it('Move down (nothing selected) moves the focused row, follows it, emits + announces', () => {
    render(); // focus = Alpha (0), nothing selected → buttons fall back to the focused row
    btn('Move down').click();
    fixture.detectChanges();

    expect(host.items().map((r) => r.name)).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(focusedText()).toContain('Alpha'); // focus follows the moved item to index 1
    const evt = host.lastReorder()!;
    expect(evt.previousIndex).toBe(0);
    expect(evt.currentIndex).toBe(1);
    expect(evt.items.map((r) => r.name)).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(announce).toHaveBeenCalledWith('Moved to position 2 of 3');
  });

  it('Move to bottom / to top / up reorder correctly and keep the item focused', () => {
    render();
    btn('Move to bottom').click(); // focused Alpha 0 -> 2 (fallback)
    fixture.detectChanges();
    expect(host.items().map((r) => r.name)).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(host.lastReorder()!.currentIndex).toBe(2);
    expect(focusedText()).toContain('Alpha');

    btn('Move to top').click(); // focused Alpha 2 -> 0
    fixture.detectChanges();
    expect(host.items().map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    clickRow(2); // select Charlie → move now acts on the selection
    btn('Move up').click(); // Charlie 2 -> 1
    fixture.detectChanges();
    expect(host.items().map((r) => r.name)).toEqual(['Alpha', 'Charlie', 'Bravo']);
    expect(focusedText()).toContain('Charlie');
  });

  it('reorders on a CDK drop, following the item active + announcing', () => {
    render();
    const cmp = fixture.debugElement.query(By.directive(CaeOrderList))
      .componentInstance as CaeOrderList<Row>;
    // jsdom can't run a real pointer drag; drive the drop handler with the CDK-shaped indices.
    (
      cmp as unknown as {
        onDrop(e: Pick<CdkDragDrop<Row[]>, 'previousIndex' | 'currentIndex'>): void;
      }
    ).onDrop({ previousIndex: 2, currentIndex: 0 });
    fixture.detectChanges();

    expect(host.items().map((r) => r.name)).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(host.lastReorder()!.previousIndex).toBe(2);
    expect(host.lastReorder()!.currentIndex).toBe(0);
    expect(focusedText()).toContain('Charlie'); // the dropped item becomes focused
    expect(announce).toHaveBeenCalledWith('Moved to position 1 of 3');
  });

  it('ignores a no-op drop (same index) — no emit, no announce', () => {
    render();
    const cmp = fixture.debugElement.query(By.directive(CaeOrderList))
      .componentInstance as CaeOrderList<Row>;
    (
      cmp as unknown as {
        onDrop(e: Pick<CdkDragDrop<Row[]>, 'previousIndex' | 'currentIndex'>): void;
      }
    ).onDrop({ previousIndex: 1, currentIndex: 1 });
    fixture.detectChanges();
    expect(host.lastReorder()).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('renders rich rows through the projected item template (item, index, active)', () => {
    render();
    expect(optionTexts()).toEqual(['Alpha#0*', 'Bravo#1', 'Charlie#2']);
  });

  it('falls back to {{ item }} when no item template is projected', () => {
    const fb = TestBed.createComponent(FallbackHost);
    fb.detectChanges();
    const rows = Array.from(
      (fb.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="option"]'),
    ).map((el) => el.textContent!.trim());
    expect(rows).toEqual(['x', 'y', 'z']);
    fb.destroy();
  });

  it('reacts to a list replaced at runtime', () => {
    render();
    host.items.set([{ id: 'z', name: 'Zeta' }]);
    fixture.detectChanges();
    expect(optionTexts()).toEqual(['Zeta#0*']);
    expect(disabled('Move down')).toBe(true); // single row: nothing to move
    expect(disabled('Move up')).toBe(true);
  });

  it('clamps the focus index when the list shrinks below it (no stale/resurrected index)', () => {
    render(); // 3 rows
    clickRow(2); // focus = 2 (Charlie), and Charlie selected
    expect(focusedText()).toContain('Charlie');
    // Shrink to a single row: the focus index (2) is out of range → clamp to 0; the pruned selection empties.
    host.items.set([{ id: 'solo', name: 'Solo' }]);
    fixture.detectChanges();
    expect(focusedText()).toContain('Solo');
    expect(selectedTexts()).toEqual([]); // Charlie is gone → selection pruned
    expect(disabled('Move up')).toBe(true);
    expect(disabled('Move down')).toBe(true);
    // Grow back: the clamped index must NOT resurrect the old position 2.
    host.items.set(ROWS());
    fixture.detectChanges();
    expect(list.querySelector('[tabindex="0"]')).toBe(options()[0]);
  });

  it('renders an empty list without crashing — no rows, all buttons aria-disabled', () => {
    render({ items: [] });
    expect(options().length).toBe(0);
    expect(selectedTexts()).toEqual([]);
    expect(disabled('Move up')).toBe(true);
    expect(disabled('Move down')).toBe(true);
  });

  // --- Multi-select (ARIA listbox multiselect) ---------------------------------------------------

  it('Ctrl/Cmd+click toggles a row into/out of the selection (additive)', () => {
    render();
    clickRow(0); // select Alpha (replace)
    clickRow(2, { ctrlKey: true }); // add Charlie
    expect(selectedTexts()).toEqual(['Alpha#0+', 'Charlie#2*+']); // list order; Charlie is focused
    expect(host.selection().map((r) => r.name)).toEqual(['Alpha', 'Charlie']);
    clickRow(0, { ctrlKey: true }); // toggle Alpha off
    expect(host.selection().map((r) => r.name)).toEqual(['Charlie']);
  });

  it('Shift+click selects the contiguous range from the anchor', () => {
    render();
    clickRow(0); // anchor = 0
    clickRow(2, { shiftKey: true }); // range 0..2
    expect(host.selection().map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('Space toggles the focused row; Ctrl+A selects all; announces the count', () => {
    render();
    options()[1].focus();
    key(options()[1], ' '); // toggle Bravo on
    expect(host.selection().map((r) => r.name)).toEqual(['Bravo']);
    expect(announce).toHaveBeenCalledWith('1 of 3 selected');

    key(options()[1], 'a', { ctrlKey: true }); // select all
    expect(host.selection().map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(announce).toHaveBeenCalledWith('3 of 3 selected');
  });

  it('Shift+ArrowDown range-extends the selection while moving focus', () => {
    render();
    options()[0].focus();
    key(options()[0], 'ArrowDown', { shiftKey: true }); // anchor 0 → focus 1, range 0..1
    expect(document.activeElement).toBe(options()[1]);
    expect(host.selection().map((r) => r.name)).toEqual(['Alpha', 'Bravo']);
    key(options()[1], 'ArrowDown', { shiftKey: true }); // extend to 0..2
    expect(host.selection().map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('moves a multi-selection as a block, preserving relative order (non-adjacent)', () => {
    const four: Row[] = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Bravo' },
      { id: 'c', name: 'Charlie' },
      { id: 'd', name: 'Delta' },
    ];
    render({ items: four });
    clickRow(0); // select Alpha (0)
    clickRow(2, { ctrlKey: true }); // + Charlie (2)  → non-adjacent selection {0, 2}
    btn('Move down').click(); // each selected row bubbles down past its non-selected neighbour
    fixture.detectChanges();
    expect(host.items().map((r) => r.name)).toEqual(['Bravo', 'Alpha', 'Delta', 'Charlie']);
    // Same items still selected (by identity), relative order Alpha-before-Charlie preserved.
    expect(host.selection().map((r) => r.name)).toEqual(['Alpha', 'Charlie']);
    expect(announce).toHaveBeenCalledWith('Moved 2 items down');
  });

  it('Move to top lifts the whole selection to the top in relative order', () => {
    render(); // Alpha, Bravo, Charlie
    clickRow(1); // Bravo
    clickRow(2, { ctrlKey: true }); // + Charlie → {Bravo, Charlie}
    btn('Move to top').click();
    fixture.detectChanges();
    expect(host.items().map((r) => r.name)).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(announce).toHaveBeenCalledWith('Moved 2 items to top');
  });

  it('writes selection in from the parent ([(selection)] two-way) and reflects it', () => {
    render();
    const rows = host.items();
    host.selection.set([rows[0], rows[2]]); // parent selects Alpha + Charlie
    fixture.detectChanges();
    expect(selectedTexts()).toEqual(['Alpha#0*+', 'Charlie#2+']);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    expect(options()[1].getAttribute('aria-selected')).toBe('false');
  });

  it('Escape clears the whole selection (keyboard parity with pointer)', () => {
    render();
    options()[0].focus();
    key(options()[0], 'a', { ctrlKey: true }); // select all
    expect(host.selection().length).toBe(3);
    key(options()[0], 'Escape');
    expect(host.selection()).toEqual([]);
    expect(selectedTexts()).toEqual([]);
    expect(announce).toHaveBeenCalledWith('Selection cleared');
  });

  it('Shift+End range-extends from the anchor to the last row', () => {
    render();
    options()[0].focus();
    key(options()[0], ' '); // anchor = Alpha (0)
    key(options()[0], 'End', { shiftKey: true }); // extend 0..2
    expect(host.selection().map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(document.activeElement).toBe(options()[2]);
  });

  it('keeps the range anchor stable across a reorder (anchor is the item, not a stale index)', () => {
    const four: Row[] = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Bravo' },
      { id: 'c', name: 'Charlie' },
      { id: 'd', name: 'Delta' },
    ];
    render({ items: four });
    clickRow(3); // select Delta, anchor = Delta (row 3)
    btn('Move to top').click(); // Delta -> row 0; value = [Delta, Alpha, Bravo, Charlie]
    fixture.detectChanges();
    expect(host.items().map((r) => r.name)).toEqual(['Delta', 'Alpha', 'Bravo', 'Charlie']);
    // Shift+click Bravo (now row 2): a STALE index anchor (3) would give the wrong range; the item
    // anchor (Delta, now row 0) gives Delta..Bravo = [Delta, Alpha, Bravo].
    clickRow(2, { shiftKey: true });
    expect(host.selection().map((r) => r.name)).toEqual(['Delta', 'Alpha', 'Bravo']);
  });

  it('a drag that reorders a selected row keeps the emitted selection in list order', () => {
    const four: Row[] = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Bravo' },
      { id: 'c', name: 'Charlie' },
      { id: 'd', name: 'Delta' },
    ];
    render({ items: four });
    clickRow(0); // Alpha
    clickRow(2, { ctrlKey: true }); // + Charlie → selection [Alpha, Charlie]
    const cmp = fixture.debugElement.query(By.directive(CaeOrderList))
      .componentInstance as CaeOrderList<Row>;
    // Drag Charlie (2) to the front → value [Charlie, Alpha, Bravo, Delta]
    (
      cmp as unknown as {
        onDrop(e: Pick<CdkDragDrop<Row[]>, 'previousIndex' | 'currentIndex'>): void;
      }
    ).onDrop({ previousIndex: 2, currentIndex: 0 });
    fixture.detectChanges();
    expect(host.items().map((r) => r.name)).toEqual(['Charlie', 'Alpha', 'Bravo', 'Delta']);
    // Emitted selection must be in the new list order (Charlie before Alpha), not the stale [Alpha, Charlie].
    expect(host.selection().map((r) => r.name)).toEqual(['Charlie', 'Alpha']);
  });

  it('reports every moved row in (reorder).movedIndices for a block move', () => {
    const four: Row[] = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Bravo' },
      { id: 'c', name: 'Charlie' },
      { id: 'd', name: 'Delta' },
    ];
    render({ items: four });
    clickRow(0); // Alpha (0)
    clickRow(2, { ctrlKey: true }); // + Charlie (2)
    btn('Move down').click();
    fixture.detectChanges();
    expect(host.lastReorder()!.movedIndices).toEqual([0, 2]); // both moved rows' previous indices
  });
});
