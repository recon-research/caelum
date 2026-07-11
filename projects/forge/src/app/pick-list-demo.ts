import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaePickList, CaePickListItemDef, CaePickListTransferEvent } from 'caelum/pick-list';

interface Role {
  id: string;
  name: string;
}

/**
 * The deferred "Pick list" `cae-pick-list` demo (#337) — the second drag-drop-cluster component. It
 * assigns roles two ways: drag a role across, or select one and use the transfer buttons between the
 * lists — both announce the move to a screen reader. The assigned set and the last transfer echo below
 * so the interaction is visibly live end-to-end (DoD liveness).
 *
 * `@defer`'d from App (#85): keeping the demo — and the `@angular/cdk/drag-drop` it pulls in — in its
 * own lazy chunk holds those bytes off Forge's initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-pick-list-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaePickList, CaePickListItemDef],
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

  /** The last transfer, echoed (visual only — cae-pick-list already announces via LiveAnnouncer). */
  protected readonly lastTransfer = signal<string | null>(null);

  protected onTransfer(event: CaePickListTransferEvent<Role>): void {
    const n = event.items.length;
    this.lastTransfer.set(`${n} role${n === 1 ? '' : 's'} to the ${event.to} list`);
  }
}
