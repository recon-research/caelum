import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The placeholder outline `cae-skeleton` draws. */
export type CaeSkeletonShape = 'rect' | 'circle';
/**
 * The loading animation. `shimmer` sweeps a faint highlight across the box; `pulse` fades the whole
 * box in and out; `none` is a static block. Every animation is dropped under
 * `prefers-reduced-motion: reduce` (WCAG 2.3.3 / 2.2.2) — the placeholder still renders, it just
 * stops moving.
 */
export type CaeSkeletonAnimation = 'shimmer' | 'pulse' | 'none';

/**
 * `cae-skeleton` — a token-skinned loading placeholder (`reference/COMPARISON.md`: `p-skeleton` →
 * `cae-skeleton`, "CSS shimmer"; Book 11 §3.1). It draws nothing but a shaped, optionally-animated
 * box in the shape of the content that is loading, so a layout doesn't jump when the real content
 * arrives. No Material, no CDK — the host element IS the placeholder (no inner DOM).
 *
 * **Decorative by contract.** A skeleton conveys no information a screen-reader user needs — the
 * *busy* state does. So the host is `aria-hidden="true"` by default and announces nothing. When a
 * skeleton stands in for a whole labelled busy region on its own, pass `[ariaLabel]` (e.g. "Loading
 * profile"); that flips it to a `role="status"` + `aria-busy="true"` live region with that name,
 * which is the only case an assistive-tech user should hear it. Prefer letting the *container* own
 * `aria-busy` and keeping the skeletons silent.
 *
 * Size comes from `[width]`/`[height]` (any CSS length; default a full-width, one-line-tall bar) and
 * shape from `[shape]` (`rect` rounds with `--cae-radius-sm` or your `[borderRadius]`; `circle`
 * rounds fully — give it equal width/height). Every colour and radius reads from the `--cae-*` token
 * bridge (D-04), so it re-themes and re-densifies with everything else. Zoneless-compatible: `OnPush`
 * + signal inputs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'cae-skeleton',
    '[class.cae-skeleton--circle]': "shape() === 'circle'",
    '[class.cae-skeleton--shimmer]': "animation() === 'shimmer'",
    '[class.cae-skeleton--pulse]': "animation() === 'pulse'",
    // Only emit an inline dimension when the caller gives one, so the stylesheet defaults apply
    // otherwise (a bare inline style would beat the `:host` default and force it back).
    '[style.inline-size]': 'width() || null',
    '[style.block-size]': 'height() || null',
    // A caller-supplied radius overrides the shape default; circle's full radius stays in CSS.
    '[style.border-radius]': "shape() === 'circle' ? null : (borderRadius() || null)",
    // Decorative by default; a name promotes it to a busy status region (the only announced case).
    '[attr.aria-hidden]': 'ariaLabel() ? null : "true"',
    '[attr.role]': 'ariaLabel() ? "status" : null',
    '[attr.aria-busy]': 'ariaLabel() ? "true" : null',
    '[attr.aria-label]': 'ariaLabel() || null',
  },
  template: '',
  styles: `
    :host {
      display: block;
      /* Defaults: a full-width, single-line-tall bar (p-skeleton's default). A caller overrides
         either via [width]/[height]; an inline binding only appears when they do. */
      inline-size: 100%;
      block-size: 1rem;
      background-color: var(--cae-surface-sunken);
      border-radius: var(--cae-radius-sm);
    }

    :host(.cae-skeleton--circle) {
      border-radius: var(--cae-radius-full);
    }

    /* Shimmer — a faint highlight sweeps across the box on the inline axis. The overflow clip keeps
       the sweep inside the placeholder; the highlight is a token-derived tint, not a literal. */
    :host(.cae-skeleton--shimmer) {
      position: relative;
      overflow: hidden;
    }
    :host(.cae-skeleton--shimmer)::after {
      content: '';
      position: absolute;
      inset: 0;
      transform: translateX(-100%);
      background: linear-gradient(
        90deg,
        transparent,
        color-mix(in srgb, var(--cae-color-on-surface) 8%, transparent),
        transparent
      );
      animation: cae-skeleton-shimmer 1.4s var(--cae-easing-standard) infinite;
    }
    @keyframes cae-skeleton-shimmer {
      100% {
        transform: translateX(100%);
      }
    }

    /* Pulse — the whole box fades in and out. */
    :host(.cae-skeleton--pulse) {
      animation: cae-skeleton-pulse 1.5s var(--cae-easing-standard) infinite;
    }
    @keyframes cae-skeleton-pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    /* WCAG 2.3.3 / 2.2.2 — motion is decorative here, so drop it entirely (the placeholder still
       renders, just static) when the user asks for reduced motion. */
    @media (prefers-reduced-motion: reduce) {
      :host(.cae-skeleton--shimmer)::after,
      :host(.cae-skeleton--pulse) {
        animation: none;
      }
      :host(.cae-skeleton--shimmer)::after {
        content: none;
      }
    }
  `,
})
export class CaeSkeleton {
  /** The placeholder outline. `rect` (default) rounds by `[borderRadius]`; `circle` rounds fully. */
  readonly shape = input<CaeSkeletonShape>('rect');
  /** Placeholder width — any CSS length (default `100%`). */
  readonly width = input<string>();
  /** Placeholder height — any CSS length (default one line, `1rem`). */
  readonly height = input<string>();
  /** Corner radius for a `rect` (default `--cae-radius-sm`); ignored for a `circle`. */
  readonly borderRadius = input<string>();
  /** Loading animation (default `shimmer`); all animation stops under `prefers-reduced-motion`. */
  readonly animation = input<CaeSkeletonAnimation>('shimmer');
  /**
   * Optional accessible name. When set, the placeholder stops being `aria-hidden` and becomes a
   * `role="status"` + `aria-busy="true"` live region with this name — use it only when the skeleton
   * is the sole thing standing in for a labelled busy region.
   */
  readonly ariaLabel = input<string>();
}
