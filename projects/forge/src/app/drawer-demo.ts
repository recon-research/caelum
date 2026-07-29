import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { CaeButton } from 'caelum/button';
import { CaeCard } from 'caelum/card';
import { CaeDrawer, CaeDrawerContainer, CaeDrawerMode } from 'caelum/drawer';

/**
 * The deferred "Drawer" `cae-drawer` demo (#709, M5 parity close) — the off-canvas / nav drawer
 * (`p-drawer`, was `p-sidebar`), a Direct port over Material's `MatDrawer` + `MatDrawerContainer`.
 *
 * The demo is built around the one thing that is easy to get wrong and invisible in a screenshot:
 * **a drawer's mode decides its accessibility contract, not just its animation.** Switch the mode
 * live and watch the semantics change with it — in `over` and `push` the drawer renders a backdrop
 * and traps focus, so it is announced as a modal dialog; in `side` it is part of the layout, keeps
 * the content beside it reachable, and carries no dialog role at all. The demo prints the resulting
 * `role`/`aria-modal` so the contract is visible rather than asserted.
 *
 * Keyboard: open the drawer and Tab — focus stays inside it in the modal modes and wraps at the
 * ends; Escape dismisses it and returns focus to the trigger. In `side` mode Tab walks straight out
 * into the page content, which is the point.
 *
 * `@defer`'d from App (#85): keeping the demo in its own lazy chunk holds those bytes off Forge's
 * initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-drawer-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeButton, CaeCard, CaeDrawer, CaeDrawerContainer],
  templateUrl: './drawer-demo.html',
  styleUrl: './drawer-demo.scss',
})
export class DrawerDemo {
  /** Whether the demo drawer is open. Two-way bound, so Escape and the backdrop write back here. */
  protected readonly opened = signal(false);
  /** The live-switchable mode — the control that changes the a11y contract, not just the motion. */
  protected readonly mode = signal<CaeDrawerMode>('over');
  /** The modes offered by the switcher, in the order they appear. */
  protected readonly modes: readonly CaeDrawerMode[] = ['over', 'push', 'side'];

  /** A stand-in console nav, so the drawer holds something a real admin shell would. */
  protected readonly navItems = [
    { label: 'Overview', hint: 'Fleet health at a glance' },
    { label: 'Orders', hint: 'Open and fulfilled' },
    { label: 'Inventory', hint: 'Stock by warehouse' },
    { label: 'Reports', hint: 'Scheduled exports' },
  ];

  protected selectMode(mode: CaeDrawerMode): void {
    this.mode.set(mode);
  }
}
