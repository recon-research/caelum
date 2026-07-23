import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { CaeButton } from 'caelum/button';
import { CaeCard } from 'caelum/card';
import { CaeSkeleton } from 'caelum/skeleton';

/**
 * The deferred "Skeleton" `cae-skeleton` demo (#662) — the loading placeholder. It shows a media-
 * object placeholder (a circle + two lines) that swaps to real content when {@link toggle} flips
 * {@link loading}, plus a row of the three animations (shimmer / pulse / none). The skeletons are
 * `aria-hidden` — the card's own `aria-busy` is what a screen reader hears — so this demo drives a
 * real busy→ready transition rather than a static showcase.
 *
 * `@defer`'d from App (#85): keeping the demo in its own lazy chunk holds those bytes off Forge's
 * initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-skeleton-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeButton, CaeSkeleton],
  templateUrl: './skeleton-demo.html',
  styleUrl: './skeleton-demo.scss',
})
export class SkeletonDemo {
  /** Whether the media object is still "loading" (showing skeletons) or has resolved to content. */
  protected readonly loading = signal(true);

  /** Flip the busy state so the placeholder gives way to the real content (and back). */
  protected toggle(): void {
    this.loading.update((v) => !v);
  }
}
