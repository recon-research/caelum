import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaeGalleria, type CaeGalleriaItem } from 'caelum/galleria';

/**
 * Build a self-contained SVG "photo" as a data URI — a coloured panel with a label. Authored inline so
 * the demo ships NO external image assets: it stays deterministic (no `Math.random`/`Date.now`) and
 * provenance-clean (no fetched binaries), the same reason the carousel demo used text-only slides. The
 * hex colours are image *content*, not component theming, so the token-only rule (which scans styles)
 * doesn't apply to them.
 */
function panel(bg: string, label: string): string {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'>" +
    "<rect width='800' height='500' fill='" +
    bg +
    "'/>" +
    "<text x='400' y='270' font-family='sans-serif' font-size='56' fill='#ffffff' " +
    "text-anchor='middle'>" +
    label +
    '</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// A small, deterministic set of constellation "plates" — self-contained SVG images, no external assets.
const IMAGES: readonly CaeGalleriaItem[] = [
  {
    src: panel('#1e3a5f', 'Orion'),
    alt: 'The Orion field',
    caption: 'A wide star field in deep blue.',
  },
  {
    src: panel('#3f2b56', 'Lyra'),
    alt: 'The Lyra cluster',
    caption: 'Violet nebulosity around Lyra.',
  },
  { src: panel('#14532d', 'Draco'), alt: 'The Draco arc' },
  {
    src: panel('#5b2c1a', 'Phoenix'),
    alt: 'The Phoenix ridge',
    caption: 'Warm dust lanes near Phoenix.',
  },
  { src: panel('#334155', 'Pyxis'), alt: 'The Pyxis expanse' },
];

/**
 * The deferred "Star plates" `cae-galleria` demo (#274) — the ★ media family's image gallery. It shows
 * the gallery end-to-end: a main image with prev/next navigators, a thumbnail strip that selects the
 * viewed plate (arrow-navigable, roving tabindex), a position live region, and a fullscreen lightbox on
 * the shared `cae-dialog` shell (focus-trap + Escape + focus-restore). The visible "Viewing:" readout is
 * driven by the two-way `[(activeIndex)]` binding — proof the selection is live, including from fullscreen.
 *
 * `@defer`'d from App (#85): keeping the gallery (and the dialog module it pulls in) in its own lazy
 * chunk holds those bytes off Forge's initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-galleria-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeGalleria],
  templateUrl: './galleria-demo.html',
  styleUrl: './galleria-demo.scss',
})
export class GalleriaDemo {
  protected readonly images = IMAGES;

  /** Two-way active index — bound to the gallery and read back into the visible readout (liveness). */
  protected readonly index = signal(0);

  /** The current plate's alt text — proves selection (inline OR fullscreen) flows back through the model. */
  protected readonly currentAlt = computed(() => this.images[this.index()]?.alt ?? '');
}
