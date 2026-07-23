import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { CaeButton } from 'caelum/button';
import { CaeCard } from 'caelum/card';
import { CaeConfirmService } from 'caelum/confirm';
import { CaePopover, CaePopoverTrigger } from 'caelum/popover';

/**
 * The deferred "Popover & confirm-popup" demo (#664) — the command-overlay pair (`p-popover` /
 * `p-confirmPopup` parity). It shows `cae-popover` anchored to a trigger via `[caePopoverTriggerFor]`
 * (projected content, dismiss on Escape/outside-click, focus returned to the trigger), and the anchored
 * `CaeConfirmService.confirmAt($event, …)` — the SAME confirm service as the centered `confirm()`,
 * presented next to its trigger.
 *
 * `@defer`'d from App (#85): its own lazy chunk keeps the CDK-overlay bytes off Forge's initial bundle.
 */
@Component({
  selector: 'app-popover-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeButton, CaePopover, CaePopoverTrigger],
  templateUrl: './popover-demo.html',
  styleUrl: './popover-demo.scss',
})
export class PopoverDemo {
  private readonly confirm = inject(CaeConfirmService);
  /** The outcome of the last confirm-popup, shown so the round-trip is visibly end-to-end. */
  protected readonly lastResult = signal<'—' | 'Deleted' | 'Kept'>('—');

  /** Anchor a confirm next to the clicked button; record accept/reject so the demo does something real. */
  protected async onDelete(event: MouseEvent): Promise<void> {
    const ok = await this.confirm.confirmAt(event, {
      header: 'Delete this item?',
      message: 'This cannot be undone.',
      acceptLabel: 'Delete',
      rejectLabel: 'Keep',
    });
    this.lastResult.set(ok ? 'Deleted' : 'Kept');
  }
}
