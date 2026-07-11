import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaeOrderList, CaeOrderListItemDef, CaeOrderListReorderEvent } from 'caelum/order-list';

interface Widget {
  id: string;
  name: string;
}

/**
 * The deferred "Order list" `cae-order-list` demo (#336) — the first drag-drop-cluster component. It
 * reorders a set of dashboard sections two ways: drag a row (`cdkDropList`), or select one and use the
 * move buttons — both announce *"Moved to position N of M"* to a screen reader. The current order and
 * the last move echo below so the interaction is visibly live end-to-end (DoD liveness).
 *
 * `@defer`'d from App (#85): keeping the demo — and the `@angular/cdk/drag-drop` it pulls in — in its
 * own lazy chunk holds those bytes off Forge's initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-order-list-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeOrderList, CaeOrderListItemDef],
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

  /** The last move, echoed into a polite live region. */
  protected readonly lastMove = signal<string | null>(null);

  protected onReorder(event: CaeOrderListReorderEvent<Widget>): void {
    this.lastMove.set(
      `${event.items[event.currentIndex].name} → position ${event.currentIndex + 1}`,
    );
  }
}
