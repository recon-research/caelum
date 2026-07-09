import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaeCarousel, CaeCarouselItem } from 'caelum/carousel';

/** A "what's new" highlight tile — plain text content (no external image, so the demo stays provenance-clean and deterministic). */
interface Highlight {
  title: string;
  blurb: string;
}

// A small, deterministic set of neutral product-highlight slides (no Math.random / Date.now — the
// reproducible-build + OnPush determinism rule). Text-only so the carousel needs no image assets and
// ships nothing that would trip provenance or the artifact CSP.
const HIGHLIGHTS: readonly Highlight[] = [
  {
    title: 'Signals, end to end',
    blurb:
      'Every Caelum component is OnPush and signal-driven, so it repaints correctly under zoneless change detection.',
  },
  {
    title: 'Token-only theming',
    blurb:
      'Density, colour, and shape all resolve to --cae-* custom properties — restyle the whole library from one token layer.',
  },
  {
    title: 'Accessibility built in',
    blurb:
      'Keyboard paths, ARIA roles, and focus management ship with each component, verified against the WAI-ARIA patterns.',
  },
  {
    title: 'Swappable data engines',
    blurb:
      'The data grid renders thousands of rows over one neutral port — client, server, or virtualized — chosen by DI.',
  },
  {
    title: 'Adopt one at a time',
    blurb:
      'Each component is its own tree-shakable entry point, so a team can migrate a single control without pulling in the rest.',
  },
];

/**
 * The deferred "Release highlights" `cae-carousel` demo (#273) — the first ★ media-family component. It
 * shows the carousel end-to-end: a content-agnostic rotating set of highlight tiles with circular paging,
 * autoplay that pauses on hover/focus and stops from the built-in play/pause control (WCAG 2.2.2), prev/
 * next buttons, an indicator group navigable by arrow keys, and full APG carousel semantics. The visible
 * "Slide N of M" counter is driven by the two-way `[(page)]` binding — proof the paging is live.
 *
 * `@defer`'d from App (#85): keeping the carousel in its own lazy chunk holds its bytes off Forge's
 * initial bundle (the #142 / D-16 budget), like the other below-the-fold demos.
 */
@Component({
  selector: 'app-carousel-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeCarousel, CaeCarouselItem],
  templateUrl: './carousel-demo.html',
  styleUrl: './carousel-demo.scss',
})
export class CarouselDemo {
  protected readonly highlights = HIGHLIGHTS;

  /** Two-way page index — bound to the carousel and read back into the visible counter (liveness). */
  protected readonly page = signal(0);

  /** A plain visual counter (NOT a live region — the carousel owns slide announcement, so a role=status here would double-announce). */
  protected readonly slideNote = computed(
    () => `Slide ${this.page() + 1} of ${this.highlights.length}`,
  );

  /**
   * Narrow a slide's `$implicit` (typed `unknown` — a projected `caeCarouselItem` template can't infer the
   * carousel's item type, see {@link CaeCarouselItemContext}) back to {@link Highlight}, so the template
   * stays type-checked. The documented consumer pattern: the consumer knows their item shape and narrows.
   */
  protected asHighlight(item: unknown): Highlight {
    return item as Highlight;
  }
}
