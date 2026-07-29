import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { CaeAlert, CaeAlertSeverity } from 'caelum/alert';
import { CaeButton } from 'caelum/button';
import { CaeCard } from 'caelum/card';

/**
 * The deferred "Alert" `cae-alert` demo (#710, M5 parity close) — the inline status / validation
 * message (`p-message`), a Build-S: Material ships no first-party alert, and `cae-toast` is a
 * different contract (transient, overlay-positioned, `LiveAnnouncer`-driven).
 *
 * The demo is built around the thing that is invisible in a screenshot: **an alert is a live region,
 * and which one is a design decision.** The gallery of four severities is deliberately
 * `politeness="off"` — four alerts that announce themselves merely for existing on a page is the
 * anti-pattern, not the feature. The announcement is demonstrated separately, by *inserting* an
 * alert in response to a button, which is how a real validation message arrives.
 *
 * The third card shows the dismissal contract: a close button destroys the element that has focus,
 * so `[dismissFocusTarget]` says where focus goes instead of `<body>` (WCAG 2.4.3).
 *
 * `@defer`'d from App (#85): keeping the demo in its own lazy chunk holds those bytes off Forge's
 * initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-alert-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeAlert, CaeButton, CaeCard],
  templateUrl: './alert-demo.html',
  styleUrl: './alert-demo.scss',
})
export class AlertDemo {
  // The focus landing spot is the `#dismissLanding` template reference variable, bound straight
  // into `[dismissFocusTarget]` — no `viewChild` here. A template ref *shadows* a same-named class
  // member inside the template, so a `viewChild('dismissLanding')` would be unreachable from the
  // binding that needs it (the compiler catches it: "HTMLHeadingElement has no call signatures").

  /** The static gallery, in severity order. */
  protected readonly severities: readonly { severity: CaeAlertSeverity; text: string }[] = [
    { severity: 'info', text: 'Scheduled maintenance runs Sunday 02:00–04:00 UTC.' },
    { severity: 'success', text: 'Workspace saved. All 14 changes are live.' },
    { severity: 'warn', text: 'Two warehouses have not reported stock in 24 hours.' },
    { severity: 'danger', text: 'Payment failed — the card on file expired.' },
  ];

  /** Whether the announced (inserted) validation alert is on screen. */
  protected readonly submitted = signal(false);
  /** Whether the dismissible banner is showing. */
  protected readonly bannerVisible = signal(true);

  protected toggleSubmitted(): void {
    this.submitted.update((submitted) => !submitted);
  }

  /**
   * Guarded because the button is `disabledInteractive` — it keeps `aria-disabled` instead of the
   * native attribute so it does not drop focus, which also means Material still delivers the click.
   */
  protected showBanner(): void {
    if (this.bannerVisible()) return;
    this.bannerVisible.set(true);
  }
}
