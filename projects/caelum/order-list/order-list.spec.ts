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
      [ariaLabel]="ariaLabel()"
      [ariaLabelledby]="ariaLabelledby()"
      (reorder)="lastReorder.set($event)"
    >
      <ng-template caeOrderListItem let-item let-i="index" let-active="active">
        <span class="tpl">{{ $any(item).name }}#{{ i }}{{ active ? '*' : '' }}</span>
      </ng-template>
    </cae-order-list>
  `,
})
class OrderListHost {
  readonly items = signal<readonly Row[]>([]);
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
  function activeText(): string {
    return list.querySelector('[aria-selected="true"]')!.textContent!.trim();
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
    // The listbox is described by the visually-hidden reorder instructions.
    const describedby = list.getAttribute('aria-describedby');
    expect(describedby).toBeTruthy();
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

  it('activates the first row by default: aria-selected + the sole tab stop', () => {
    render();
    const rows = options();
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    expect(rows[0].getAttribute('tabindex')).toBe('0');
    expect(rows[1].getAttribute('tabindex')).toBe('-1');
    expect(rows[2].getAttribute('tabindex')).toBe('-1');
    expect(list.querySelectorAll('[aria-selected="true"]').length).toBe(1);
  });

  it('activates a row on click (selection + tab stop follow)', () => {
    render();
    options()[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(options()[2].getAttribute('aria-selected')).toBe('true');
    expect(options()[2].getAttribute('tabindex')).toBe('0');
    expect(options()[0].getAttribute('aria-selected')).toBe('false');
  });

  it('moves the active row with Arrow/Home/End, following focus (no reorder)', () => {
    render();
    const before = optionTexts();
    options()[0].focus();

    options()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(options()[1]);
    expect(activeText()).toContain('Bravo');

    options()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(options()[2]);

    options()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(options()[0]);

    // Navigation never reorders the underlying list, and doesn't announce a move.
    expect(optionTexts()).toEqual(before);
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

  it('Move down reorders the value, follows the item active, emits + announces', () => {
    render(); // active = Alpha (0)
    btn('Move down').click();
    fixture.detectChanges();

    expect(host.items().map((r) => r.name)).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(activeText()).toContain('Alpha'); // active follows the moved item to index 1
    const evt = host.lastReorder()!;
    expect(evt.previousIndex).toBe(0);
    expect(evt.currentIndex).toBe(1);
    expect(evt.items.map((r) => r.name)).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(announce).toHaveBeenCalledWith('Moved to position 2 of 3');
  });

  it('Move to bottom / to top / up reorder correctly and keep the item active', () => {
    render();
    btn('Move to bottom').click(); // Alpha 0 -> 2
    fixture.detectChanges();
    expect(host.items().map((r) => r.name)).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(host.lastReorder()!.currentIndex).toBe(2);
    expect(activeText()).toContain('Alpha');

    btn('Move to top').click(); // Alpha 2 -> 0
    fixture.detectChanges();
    expect(host.items().map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    options()[2].dispatchEvent(new MouseEvent('click', { bubbles: true })); // select Charlie
    fixture.detectChanges();
    btn('Move up').click(); // Charlie 2 -> 1
    fixture.detectChanges();
    expect(host.items().map((r) => r.name)).toEqual(['Alpha', 'Charlie', 'Bravo']);
    expect(activeText()).toContain('Charlie');
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
    expect(activeText()).toContain('Charlie'); // the dropped item becomes active
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

  it('clamps the active index when the list shrinks below it (no stale/resurrected index)', () => {
    render(); // 3 rows
    options()[2].dispatchEvent(new MouseEvent('click', { bubbles: true })); // active = 2 (Charlie)
    fixture.detectChanges();
    expect(activeText()).toContain('Charlie');
    // Shrink to a single row: the active index (2) is now out of range and must clamp to 0.
    host.items.set([{ id: 'solo', name: 'Solo' }]);
    fixture.detectChanges();
    expect(activeText()).toContain('Solo');
    expect(disabled('Move up')).toBe(true);
    expect(disabled('Move down')).toBe(true);
    // Grow back: the clamped index must NOT resurrect the old position 2.
    host.items.set(ROWS());
    fixture.detectChanges();
    expect(list.querySelector('[aria-selected="true"]')).toBe(options()[0]);
  });

  it('renders an empty list without crashing — no rows, all buttons aria-disabled', () => {
    render({ items: [] });
    expect(options().length).toBe(0);
    expect(list.querySelectorAll('[aria-selected="true"]').length).toBe(0);
    expect(disabled('Move up')).toBe(true);
    expect(disabled('Move down')).toBe(true);
  });
});
