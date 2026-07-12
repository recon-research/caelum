import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { CaeCard } from 'caelum/card';
import {
  CaePickList,
  CaePickListItemDef,
  CaePickListReorderEvent,
  CaePickListSourceHeaderDef,
  CaePickListTargetHeaderDef,
  CaePickListTransferEvent,
} from 'caelum/pick-list';

interface Role {
  id: string;
  name: string;
}

/**
 * The deferred "Pick list" `cae-pick-list` demo (#337; multi-select + within-list reorder + header
 * slots + in-list filter #342) — the second drag-drop-cluster component. It assigns roles two ways: drag
 * a role across, or **multi-select** roles (click / Ctrl+click / Shift+click; Space, Shift+Arrow, Ctrl+A
 * by keyboard) and move the whole block with the transfer buttons. Each list can also be **reordered in
 * place** — drag a row, or use its outer up / top / down / bottom buttons. A per-list **filter** box
 * narrows each list by name (reorder is disabled while a list filters; transfer stays live). Projected
 * **header slots** (`caePickListSourceHeader`/`caePickListTargetHeader`) give each list a visible title
 * that is also its `aria-labelledby` accessible name. Every move announces to a screen reader. The
 * assigned set, the live source selection, the last transfer, and the last reorder echo below so the
 * interaction is visibly live end-to-end (DoD liveness).
 *
 * `@defer`'d from App (#85): keeping the demo — and the `@angular/cdk/drag-drop` it pulls in — in its
 * own lazy chunk holds those bytes off Forge's initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-pick-list-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CaeCard,
    CaePickList,
    CaePickListItemDef,
    CaePickListSourceHeaderDef,
    CaePickListTargetHeaderDef,
  ],
  templateUrl: './pick-list-demo.html',
  styleUrl: './pick-list-demo.scss',
})
export class PickListDemo {
  /** Unassigned roles (distinct object references so identity tracking follows each row on transfer). */
  protected readonly available = signal<readonly Role[]>([
    { id: 'billing', name: 'Billing' },
    { id: 'reports', name: 'Reports' },
    { id: 'audit', name: 'Audit log' },
    { id: 'api', name: 'API keys' },
  ]);

  /** Roles granted to the workspace — the target list. */
  protected readonly assigned = signal<readonly Role[]>([
    { id: 'members', name: 'Members' },
    { id: 'settings', name: 'Settings' },
  ]);

  /** The live assigned set, echoed so a transfer is visibly reflected. */
  protected readonly assignedText = computed(
    () =>
      this.assigned()
        .map((r) => r.name)
        .join(' · ') || '(none)',
  );

  /** The available (source) list's multi-selection, two-way bound so the transfer buttons act on the block. */
  protected readonly availableSel = signal<readonly Role[]>([]);

  /** The live source selection, echoed so multi-select is visibly reflected. */
  protected readonly availableSelText = computed(
    () =>
      this.availableSel()
        .map((r) => r.name)
        .join(' · ') || '(none)',
  );

  /** The last transfer, echoed (visual only — cae-pick-list already announces via LiveAnnouncer). */
  protected readonly lastTransfer = signal<string | null>(null);

  /** Matches a role by its display name (object rows can't use the default `String(item)` matcher). */
  protected readonly roleFilter = (role: Role, query: string): boolean =>
    role.name.toLowerCase().includes(query.toLowerCase());

  /** The last within-list reorder, echoed (visual only — the component already announces it). */
  protected readonly lastReorder = signal<string | null>(null);

  protected onTransfer(event: CaePickListTransferEvent<Role>): void {
    const n = event.items.length;
    this.lastTransfer.set(`${n} role${n === 1 ? '' : 's'} to the ${event.to} list`);
  }

  protected onReorder(event: CaePickListReorderEvent<Role>): void {
    const n = event.movedIndices.length;
    this.lastReorder.set(`${n} role${n === 1 ? '' : 's'} in the ${event.side} list`);
  }
}
