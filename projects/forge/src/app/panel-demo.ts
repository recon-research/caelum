import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CaeCard } from '@recon-research/caelum/card';
import { CaeInput } from '@recon-research/caelum/input';
import { CaeFieldset, CaePanel, CaePanelHeader } from '@recon-research/caelum/panel';

/**
 * The deferred "Panel & fieldset" demo (#711, M5 parity close) — the titled-container family
 * (`p-panel` / `p-fieldset`), the one **Compose** row in Book 11 §3.1's otherwise Direct table.
 *
 * Like the alert demo, this one is built around what a screenshot cannot show. Two things here are
 * invisible and both are the point:
 *
 * 1. **Why there are two components rather than one with a flag.** The fieldset card groups real
 *    form controls, because a `<legend>` is a *native* accessible-name mechanism: a screen reader
 *    repeats "Billing details" as the user arrives on each field inside it. Nothing a `MatCard`
 *    can do reproduces that, which is the whole argument for the second component.
 * 2. **That collapsing hides rather than removes.** The fieldset card invites you to type, collapse
 *    and expand — the values survive, because the content region is `[hidden]`, not `@if`-ed away.
 *    Removing it would also dangle the toggle's `aria-controls` at an element that no longer exists.
 *
 * The panel card additionally contrasts the two header forms: the plain `[header]` string (text, as
 * in `p-panel`) against a projected `[caePanelHeader]` — the only way to get a real `<h4>` a screen
 * reader's heading navigation can reach.
 *
 * `@defer`'d from App (#85): keeping the demo in its own lazy chunk holds those bytes off Forge's
 * initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-panel-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeFieldset, CaeInput, CaePanel, CaePanelHeader, FormsModule],
  templateUrl: './panel-demo.html',
  styleUrl: './panel-demo.scss',
})
export class PanelDemo {
  /** The toggleable panel's disclosure state, bound two-way so the button label can track it. */
  protected readonly detailsCollapsed = signal(false);
  /** The projected-header panel's disclosure state. */
  protected readonly historyCollapsed = signal(true);
  /** The billing group's disclosure state — collapse it to prove the typed values survive. */
  protected readonly billingCollapsed = signal(false);

  /** Bound into the collapsible fieldset, so the state-preservation claim is demonstrable. */
  protected readonly cardName = signal('Ada Lovelace');
  protected readonly cardNumber = signal('4242 4242 4242 4242');

  protected toggleDetails(): void {
    this.detailsCollapsed.update((collapsed) => !collapsed);
  }
}
