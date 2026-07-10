import { ChangeDetectionStrategy, Component } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaeScrollPanel } from 'caelum/scroll-panel';

/**
 * The deferred "Scroll panel" `cae-scroll-panel` demo (#328) — the Splitter family's ScrollPanel sibling. It
 * shows both halves of the component's conditional a11y contract side by side: a fixed-height panel whose
 * content **overflows** (so it becomes a keyboard-focusable `role="region"` with token-styled scrollbars) and
 * one whose content **fits** (so it gets no tab stop and no landmark). Tab to the first panel and scroll it
 * with the arrow keys / Page keys — no pointer needed.
 *
 * `@defer`'d from App (#85): keeping the demo in its own lazy chunk holds those bytes off Forge's initial
 * bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-scroll-panel-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeScrollPanel],
  templateUrl: './scroll-panel-demo.html',
  styleUrl: './scroll-panel-demo.scss',
})
export class ScrollPanelDemo {
  /** A stand-in changelog, long enough to overflow the fixed-height panel and demand a scroll. */
  protected readonly releases = Array.from({ length: 12 }, (_, i) => ({
    version: `2.${11 - i}.0`,
    note: 'Token-styled scrollbars, native keyboard scroll, and screen-reader region semantics.',
  }));
}
