import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LiveAnnouncer } from '@angular/cdk/a11y';

import { CaeCard } from 'caelum/card';
import {
  CaeOrderList,
  CaeOrderListHeaderDef,
  CaeOrderListItemDef,
  CaeOrderListReorderEvent,
} from 'caelum/order-list';

interface Widget {
  id: string;
  name: string;
}

/**
 * The deferred "Order list" `cae-order-list` demo (#336; multi-select + in-list filter + header slot
 * + per-item disabled + drag handle #341). It reorders a set of dashboard sections two ways: drag a row
 * (`cdkDropList`), or **multi-select** rows (click / Ctrl+click / Shift+click; Space, Shift+Arrow, Ctrl+A
 * by keyboard) and move the whole block with the buttons — both paths announce to a screen reader. A
 * projected `caeOrderListHeader` gives the list a **visible title that also names it** for a screen
 * reader. One section is **locked** (`[disabledMatch]`) — dimmed, `aria-disabled`, and non-movable, yet
 * still keyboard-navigable. The **drag-handle** toggle restricts dragging to a per-row grip. A `[filter]`
 * box narrows the list by name (reorder is intentionally disabled while filtering — a partial view has no
 * coherent "move up"). The current order and the live selection echo below so the interaction is visibly
 * live end-to-end (DoD liveness).
 *
 * `@defer`'d from App (#85): keeping the demo — and the `@angular/cdk/drag-drop` it pulls in — in its
 * own lazy chunk holds those bytes off Forge's initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-order-list-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeOrderList, CaeOrderListHeaderDef, CaeOrderListItemDef],
  templateUrl: './order-list-demo.html',
  styleUrl: './order-list-demo.scss',
})
export class OrderListDemo {
  /** The reorderable sections (distinct object references so identity tracking follows each row). */
  protected readonly widgets = signal<readonly Widget[]>([
    { id: 'overview', name: 'Overview' },
    { id: 'activity', name: 'Activity' },
    { id: 'members', name: 'Members' },
    { id: 'billing', name: 'Billing' },
    { id: 'settings', name: 'Settings' },
  ]);

  /** The live order, echoed so a reorder is visibly reflected. */
  protected readonly orderText = computed(() =>
    this.widgets()
      .map((w) => w.name)
      .join(' · '),
  );

  /** The current multi-selection, two-way bound so the move buttons act on the whole set. */
  protected readonly selected = signal<readonly Widget[]>([]);

  /** The selected sections, echoed so multi-select is visibly reflected. */
  protected readonly selectedText = computed(() =>
    this.selected()
      .map((w) => w.name)
      .join(' · '),
  );

  /** Matches a section by its display name (object rows can't use the default `String(item)` matcher). */
  protected readonly widgetFilter = (widget: Widget, query: string): boolean =>
    widget.name.toLowerCase().includes(query.toLowerCase());

  /** "Billing" is locked (`[disabledMatch]`): dimmed + `aria-disabled`, non-selectable and non-movable. */
  protected readonly widgetLocked = (widget: Widget): boolean => widget.id === 'billing';

  /** Identity key (`[trackBy]`): key rows by `id` so selection/focus survive an immutable data refresh. */
  protected readonly widgetKey = (widget: Widget): unknown => widget.id;

  /** Announces the refresh, so a screen-reader user gets confirmation the (visually-silent) action ran. */
  private readonly announcer = inject(LiveAnnouncer);

  /**
   * Replace every row with a **fresh object instance** carrying the same `id` — the shape of an
   * immutable server refresh. Because the list is keyed by `id` ({@link widgetKey}), the selection and
   * roving focus survive; without `[trackBy]` this would drop both (nothing matches by reference).
   */
  protected refreshData(): void {
    this.widgets.set(this.widgets().map((w) => ({ ...w })));
    this.announcer.announce('Data refreshed; your selection is preserved');
  }

  /** Live toggle for `[dragHandle]`: whole-row drag ↔ drag only via a per-row grip handle. */
  protected readonly dragHandle = signal(false);

  /** The last move, echoed into a polite live region. */
  protected readonly lastMove = signal<string | null>(null);

  /** Live toggle for the reorder-control column's side (#341 `controlsPosition`: before ↔ after). */
  protected readonly controlsAfter = signal(false);

  protected onReorder(event: CaeOrderListReorderEvent<Widget>): void {
    this.lastMove.set(
      `${event.items[event.currentIndex].name} → position ${event.currentIndex + 1}`,
    );
  }
}
