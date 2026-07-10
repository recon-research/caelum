import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaeImageCompare } from 'caelum/image-compare';

/**
 * Build a self-contained SVG "photo" as a data URI — a coloured plate with a label. Authored inline so the
 * demo ships NO external image assets: deterministic (no `Math.random`/`Date.now`) and provenance-clean (no
 * fetched binaries), the same approach as the image/galleria/carousel demos. The hex colours are image
 * *content*, not component theming, so the token-only rule (which scans styles) doesn't apply to them.
 */
function panel(bg: string, label: string): string {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='960' height='600'>" +
    "<rect width='960' height='600' fill='" +
    bg +
    "'/>" +
    "<text x='480' y='320' font-family='sans-serif' font-size='72' fill='#ffffff' " +
    "text-anchor='middle'>" +
    label +
    '</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/**
 * The deferred "Image compare" `cae-image-compare` demo (#293) — the ★ media family's before/after reveal
 * slider. It shows the component end-to-end: drag the divider (or focus it and use the arrow keys / Home /
 * End) to reveal the "before" plate over the "after" plate. The reveal % is two-way bound so the readout
 * tracks the divider — proving `[(value)]` and the keyboard path in one view.
 *
 * `@defer`'d from App (#85): keeping the slider in its own lazy chunk holds those bytes off Forge's initial
 * bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-image-compare-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeImageCompare, DecimalPipe],
  templateUrl: './image-compare-demo.html',
  styleUrl: './image-compare-demo.scss',
})
export class ImageCompareDemo {
  /** The "before" plate (revealed from the leading edge) and the "after" plate underneath. */
  protected readonly beforeSrc = panel('#5b6472', 'Before');
  protected readonly afterSrc = panel('#1e7f5f', 'After');
  /** Two-way bound to the divider so the readout mirrors the reveal. */
  protected readonly reveal = signal(50);
}
