import { ChangeDetectionStrategy, Component } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaeImage } from 'caelum/image';

/**
 * Build a self-contained SVG "photo" as a data URI — a coloured plate with a label. Authored inline so the
 * demo ships NO external image assets: deterministic (no `Math.random`/`Date.now`) and provenance-clean (no
 * fetched binaries), the same reason the galleria/carousel demos used inline SVG. The hex colours are image
 * *content*, not component theming, so the token-only rule (which scans styles) doesn't apply to them.
 */
function panel(bg: string, label: string): string {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='960' height='600'>" +
    "<rect width='960' height='600' fill='" +
    bg +
    "'/>" +
    "<text x='480' y='320' font-family='sans-serif' font-size='64' fill='#ffffff' " +
    "text-anchor='middle'>" +
    label +
    '</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/**
 * The deferred "Image preview" `cae-image` demo (#275) — the ★ media family's smallest member. It shows the
 * component end-to-end: a token-styled image that opens a fullscreen preview (on the shared `cae-dialog`
 * shell — focus-trap + Escape + focus-restore) with zoom, rotate, and a keyboard-operable pan. The preview's
 * zoom/pan transform is the primitive the galleria lightbox will later share (#289).
 *
 * `@defer`'d from App (#85): keeping the image (and the dialog module it pulls in) in its own lazy chunk
 * holds those bytes off Forge's initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-image-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeImage],
  templateUrl: './image-demo.html',
  styleUrl: './image-demo.scss',
})
export class ImageDemo {
  /** A self-contained constellation "plate" — an inline SVG image, no external asset. */
  protected readonly src = panel('#1e3a5f', 'Orion');
}
