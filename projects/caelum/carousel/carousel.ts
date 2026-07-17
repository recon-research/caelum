import { Directionality } from '@angular/cdk/bidi';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  contentChild,
  effect,
  inject,
  input,
  isDevMode,
  model,
  signal,
  viewChildren,
} from '@angular/core';
import { CaeCarouselItem, CaeCarouselItemContext } from './carousel-item';

/**
 * One responsive breakpoint rule for {@link CaeCarousel.responsiveOptions} (`p-carousel` parity). At
 * viewports **at or below** `breakpoint` (a CSS `max-width` length, e.g. `'1024px'`) the carousel shows
 * `numVisible` items and advances `numScroll` at a time. When several rules match, the **narrowest** wins —
 * ranked by the breakpoint's numeric value, so keep every rule in the **same unit** (mixing `px` and
 * `rem`/`em` can mis-rank them). When none match, the base {@link CaeCarousel.numVisible} /
 * {@link CaeCarousel.numScroll} apply.
 */
export interface CaeCarouselResponsiveOption {
  /** The `max-width` breakpoint this rule applies at or below (a CSS length in a single unit, e.g. `'1024px'`). */
  breakpoint: string;
  /** Items visible in the window at this breakpoint. */
  numVisible: number;
  /** Items advanced per step at this breakpoint. */
  numScroll: number;
}

/**
 * `cae-carousel` — a content-agnostic rotating carousel (`reference/COMPARISON.md`: `p-carousel` →
 * `cae-carousel`). The first member of the ★ media family (Book 11 §3.4). Built from scratch on a signal
 * index model (Book 11 §4 — *"the active slide is a signal"*) rather than a foreign carousel library
 * (Book 11 §3.5 gate 6 — the one-engine provenance rule; the brief's "vetted US lib if heavy" fork stays
 * closed, this build is small). Zoneless-compatible: `OnPush` + signal state (D-12). No `color` input —
 * theming is free via the token bridge (D-04).
 *
 * **The sliding-window model.** `value` is windowed: {@link numVisible} items are shown at once and each
 * step advances by {@link numScroll} (both default 1). The active {@link page} is a two-way signal model;
 * the render is a single flex track translated by whole items, with a page count derived as
 * `ceil((n - numVisible) / numScroll) + 1`. The last window is clamped to the end so trailing blank slots
 * never appear. {@link circular} wraps prev/next past the ends.
 *
 * **Autoplay — WCAG 2.2.2 compliant.** With `[autoplayInterval]` &gt; 0 the carousel advances on a timer that
 * **pauses on hover and on focus** (so a reader is never outrun) and can be stopped outright by the built-in
 * **play/pause control** — the "Pause, Stop, Hide" success criterion for auto-updating content. It also
 * **respects `prefers-reduced-motion`**: it does not auto-start when the user asks for reduced motion (they
 * can still start it explicitly), and the slide transition is dropped under that preference.
 *
 * **Accessibility (WAI-ARIA APG "Carousel").** The host is a `role="group"` with
 * `aria-roledescription="carousel"` and a required accessible name ({@link ariaLabel} — dev-warned if
 * unset); `group` (not `region`) is the conservative default so N carousels on a page don't spawn N
 * landmarks. Each slide is a `role="group"` with `aria-roledescription="slide"` and an `aria-label` of the
 * form "N of M"; slides outside the current window are `inert` + `aria-hidden`, removing their controls
 * from the tab order and the a11y tree. The slide track is an `aria-live` region — **polite when idle so a
 * page change announces the revealed slides, `off` while autoplaying** so the rotation doesn't spam. The
 * previous/next buttons are labelled and disable at the ends (non-circular); the indicator dots are a
 * **roving-tabindex** group (one tab stop) navigable with Left/Right/Up/Down/Home/End (Left/Right follow
 * visual order in RTL via {@link Directionality}; Up/Down are direction-independent; selection follows focus),
 * each labelled "Page N of M" with `aria-current` on the active page. The real-browser SR announcement,
 * like cae-tree-table's, is confirmed in the M4 pass (#240).
 *
 * **Slide content.** Project a single `<ng-template caeCarouselItem let-item let-i="index">` to render each
 * slide; see {@link CaeCarouselItem}. Without one, slides fall back to the item's string form (dev-warned).
 *
 * **Responsive window.** {@link responsiveOptions} overrides {@link numVisible} / {@link numScroll} by
 * viewport width (`p-carousel` parity): each rule applies at or below its `max-width` breakpoint, the
 * narrowest match wins, and the window **re-resolves live** as the viewport crosses a breakpoint (browser
 * only — SSR / no `matchMedia` keeps the base window). #276.
 *
 * **Orientation.** {@link orientation} `'vertical'` stacks the sliding window on the block axis (translateY)
 * inside a definite-height viewport ({@link verticalViewportHeight}, `p-carousel`'s `verticalViewPortHeight`);
 * the indicator group's roving keys already cover both axes (Up/Down navigate, and Left/Right too), and
 * because the block axis is direction-independent a vertical carousel is unaffected by RTL. Horizontal
 * (default) is unchanged. #276.
 *
 * **v1 scope** (#273): fixed horizontal window, circular, autoplay (+pause/stop/reduced-motion), prev/next,
 * indicators, keyboard, full ARIA, content projection. Follow-ups (#276): touch/CDK-drag swipe-to-advance
 * (buttons + arrows already give the full keyboard path, §3.5 gate 1, so swipe is an enhancement, not a
 * parity gap), a seamless circular loop (clone edge items for an uninterrupted wrap — the index-wrap
 * {@link circular} is complete, but the transform jumps at the boundary), and focus restoration when a
 * focused slide is removed from the window (see the focus note below). Vertical mode ships with a horizontal
 * control bar (up/down chevrons); stacking the nav buttons prev-above/next-below for full `p-carousel`
 * layout parity is #445.
 *
 * **Focus note (M4, #276).** Autoplay pauses on focus, and indicator/button paging moves focus off the
 * slide first, so those paths are safe. But a window shift that leaves a focused slide behind — a consumer
 * writing `[(page)]` or changing `numVisible`/`value`, **or an end-user resize crossing a
 * {@link responsiveOptions} breakpoint** — while keyboard focus is *inside* a slide's content makes that
 * slide `inert` and drops DOM focus to `<body>`; restoring it is a real-browser follow-up (the same hazard
 * cae-tree-table documents at #263).
 *
 * @typeParam T - the item shape (one element of {@link value}).
 */
@Component({
  selector: 'cae-carousel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: {
    class: 'cae-carousel',
    '[class.cae-carousel--rtl]': 'isRtl()',
    '[class.cae-carousel--vertical]': 'isVertical()',
    role: 'group',
    // roledescription only when NAMED — an unnamed aria-roledescription="carousel" is announced as a
    // nameless "carousel" (worse than none); the dev-warn nudges the consumer to set [ariaLabel].
    '[attr.aria-roledescription]': "ariaLabel() ? 'carousel' : null",
    '[attr.aria-label]': 'ariaLabel() || null',
    '(mouseenter)': '_hovered.set(true)',
    '(mouseleave)': '_hovered.set(false)',
    '(focusin)': '_focused.set(true)',
    '(focusout)': '_focused.set(false)',
  },
  template: `
    <div class="cae-carousel__viewport" [style.--cae-carousel-viewport-block-size]="vpBlockSize()">
      <!-- The track holds EVERY item; only the current window is non-inert. aria-live is polite when idle
           (a page change announces the revealed slides) and off while autoplaying (no rotation spam). -->
      <div
        class="cae-carousel__track"
        [style.transform]="trackTransform()"
        [attr.aria-live]="playing() ? 'off' : 'polite'"
        aria-atomic="false"
      >
        @for (item of value(); track $index; let i = $index) {
          <div
            class="cae-carousel__item"
            role="group"
            aria-roledescription="slide"
            [attr.aria-label]="slideLabel(i)"
            [style.flex-basis.%]="itemBasis()"
            [attr.aria-hidden]="isItemVisible(i) ? null : 'true'"
            [attr.inert]="isItemVisible(i) ? null : ''"
          >
            @if (itemTemplate(); as tpl) {
              <ng-container
                [ngTemplateOutlet]="tpl"
                [ngTemplateOutletContext]="itemContext(item, i)"
              ></ng-container>
            } @else {
              {{ itemText(item) }}
            }
          </div>
        }
      </div>
    </div>

    @if (totalPages() > 1) {
      <div class="cae-carousel__controls">
        @if (showNavigators()) {
          <button
            type="button"
            class="cae-carousel__nav cae-carousel__nav--prev"
            [attr.aria-label]="prevAriaLabel()"
            [attr.aria-disabled]="atStart() && !circular() ? 'true' : null"
            (click)="prev()"
          >
            <span
              class="cae-carousel__chevron cae-carousel__chevron--prev"
              aria-hidden="true"
            ></span>
          </button>
        }

        @if (showIndicators()) {
          <div class="cae-carousel__indicators" role="group" [attr.aria-label]="indicatorsLabel()">
            @for (p of pages(); track p; let i = $index) {
              <button
                #indicatorBtn
                type="button"
                class="cae-carousel__indicator"
                [class.cae-carousel__indicator--active]="i === clampedPage()"
                [attr.aria-label]="indicatorLabel(i)"
                [attr.aria-current]="i === clampedPage() ? 'true' : null"
                [tabindex]="i === clampedPage() ? 0 : -1"
                (click)="goTo(i)"
                (keydown)="onIndicatorKeydown($event, i)"
              ></button>
            }
          </div>
        }

        @if (showNavigators()) {
          <button
            type="button"
            class="cae-carousel__nav cae-carousel__nav--next"
            [attr.aria-label]="nextAriaLabel()"
            [attr.aria-disabled]="atEnd() && !circular() ? 'true' : null"
            (click)="next()"
          >
            <span
              class="cae-carousel__chevron cae-carousel__chevron--next"
              aria-hidden="true"
            ></span>
          </button>
        }

        @if (autoplayInterval() > 0) {
          <button
            type="button"
            class="cae-carousel__play"
            [attr.aria-label]="playLabel()"
            (click)="togglePlay()"
          >
            <span
              class="cae-carousel__play-icon"
              [class.cae-carousel__play-icon--pause]="autoplayOn()"
              [class.cae-carousel__play-icon--play]="!autoplayOn()"
              aria-hidden="true"
            ></span>
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-carousel__viewport {
      overflow: hidden;
    }
    .cae-carousel__track {
      display: flex;
      transition: transform 300ms ease;
      will-change: transform;
    }
    .cae-carousel__item {
      flex: 0 0 auto;
      box-sizing: border-box;
      min-inline-size: 0;
    }
    .cae-carousel__controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--cae-space-2);
      margin-block-start: var(--cae-space-2);
    }
    /* Nav + play buttons: token-styled, no icon font — glyphs drawn from currentColor. */
    .cae-carousel__nav,
    .cae-carousel__play {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--cae-space-5);
      block-size: var(--cae-space-5);
      /* Floor the hit target to the density-INVARIANT --cae-target-min (24px) so it holds WCAG 2.5.8
         under [data-density=compact], where --cae-space-5 tightens to 16px (interactive-hit-target floor). */
      min-inline-size: var(--cae-target-min);
      min-block-size: var(--cae-target-min);
      padding: 0;
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-full);
      background: var(--cae-surface-raised);
      color: var(--cae-color-on-surface);
      cursor: pointer;
    }
    /* Ends use aria-disabled (not the disabled property) so the focused button KEEPS focus instead of
       blurring to <body> when it dims at an end (WCAG 2.4.3); prev()/next() already no-op there. */
    .cae-carousel__nav[aria-disabled='true'] {
      color: var(--cae-color-on-surface-variant);
      opacity: 0.5;
      cursor: default;
    }
    .cae-carousel__nav:not([aria-disabled='true']):hover,
    .cae-carousel__play:hover {
      border-color: var(--cae-color-primary);
    }
    /* Physical borders (identical to the inline-end/block-end pair in LTR) so the glyph direction is set
       solely by the rotation — deterministic under RTL, where it is mirrored below. */
    .cae-carousel__chevron {
      display: inline-block;
      inline-size: 0.5em;
      block-size: 0.5em;
      border-right: 2px solid currentColor;
      border-bottom: 2px solid currentColor;
    }
    .cae-carousel__chevron--prev {
      transform: rotate(135deg);
      margin-inline-start: 0.2em;
    }
    .cae-carousel__chevron--next {
      transform: rotate(-45deg);
      margin-inline-end: 0.2em;
    }
    /* RTL: previous sits to the physical right and points right; next points left — mirror the rotations
       (glyph direction confirmed visually in the #240 browser pass, like the SR announcements). */
    .cae-carousel--rtl .cae-carousel__chevron--prev {
      transform: rotate(-45deg);
    }
    .cae-carousel--rtl .cae-carousel__chevron--next {
      transform: rotate(135deg);
    }
    /* Vertical orientation (#276): stack the track on the block axis and give the viewport a definite height
       (from --cae-carousel-viewport-block-size, set by [verticalViewportHeight]) so the slides' flex-basis%
       resolves against a real height and the overflow clips; block-size:100% on the track lets that percentage
       basis resolve. The block axis is direction-independent, so the transform drops the RTL mirror (see
       trackTransform) and these chevron rules follow the RTL ones above so vertical wins when both apply. The
       layout itself (flex-basis resolution, chevron glyph direction) is confirmed in the #240 browser pass —
       jsdom does no layout, so the specs verify the wiring (custom property + transform), not the paint. */
    .cae-carousel--vertical .cae-carousel__viewport {
      block-size: var(--cae-carousel-viewport-block-size);
    }
    .cae-carousel--vertical .cae-carousel__track {
      flex-direction: column;
      block-size: 100%;
    }
    .cae-carousel--vertical .cae-carousel__item {
      min-block-size: 0;
    }
    /* Prev points up, next points down (the base chevron is the bottom-right corner; -135°/45° re-aim it). */
    .cae-carousel--vertical .cae-carousel__chevron--prev {
      transform: rotate(-135deg);
    }
    .cae-carousel--vertical .cae-carousel__chevron--next {
      transform: rotate(45deg);
    }
    /* Play triangle / pause bars, drawn from currentColor. */
    .cae-carousel__play-icon {
      display: inline-block;
      position: relative;
      inline-size: 0.8em;
      block-size: 0.8em;
    }
    .cae-carousel__play-icon--play {
      inline-size: 0;
      block-size: 0;
      border-style: solid;
      border-width: 0.4em 0 0.4em 0.7em;
      border-color: transparent transparent transparent currentColor;
    }
    .cae-carousel__play-icon--pause::before,
    .cae-carousel__play-icon--pause::after {
      content: '';
      position: absolute;
      inset-block: 0;
      inline-size: 0.24em;
      background: currentColor;
    }
    .cae-carousel__play-icon--pause::before {
      inset-inline-start: 0.12em;
    }
    .cae-carousel__play-icon--pause::after {
      inset-inline-end: 0.12em;
    }
    /* flex-wrap so the target-min-floored dots (24px hit target each) wrap instead of overflowing the
       no-wrap controls row when a carousel has many pages (#456 review); justify-content centres the
       wrapped rows (inert for the common single-row case). */
    .cae-carousel__indicators {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: var(--cae-space-1);
    }
    /* Indicator dots: the BUTTON is the hit target, floored to --cae-target-min (24px) so it holds
       WCAG 2.5.8 in every density arm; the visible dot is a smaller ::before circle centered inside it.
       Sizing the button off --cae-space-2 would shrink the target to 6px under [data-density=compact]
       (interactive-hit-target floor convention). Mirrors the galleria indicator. */
    .cae-carousel__indicator {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-inline-size: var(--cae-target-min);
      min-block-size: var(--cae-target-min);
      padding: 0;
      border: 0;
      border-radius: var(--cae-radius-full);
      background: none;
      cursor: pointer;
    }
    .cae-carousel__indicator::before {
      content: '';
      inline-size: var(--cae-space-2);
      block-size: var(--cae-space-2);
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-full);
      background: transparent;
    }
    .cae-carousel__indicator--active::before {
      background: var(--cae-color-primary);
      border-color: var(--cae-color-primary);
    }
    /* House focus ring on every control (button roving tab stop lives on the active indicator). */
    .cae-carousel__nav:focus-visible,
    .cae-carousel__play:focus-visible,
    .cae-carousel__indicator:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
    }
    @media (prefers-reduced-motion: reduce) {
      .cae-carousel__track {
        transition: none;
      }
    }
  `,
})
export class CaeCarousel<T = unknown> {
  /** The items to page through. Each becomes one slide (rendered by the {@link CaeCarouselItem} template). */
  readonly value = input<readonly T[]>([]);
  /** Items visible in the window at once (default 1; clamped to ≥ 1). */
  readonly numVisible = input(1);
  /** Items advanced per step (default 1; clamped to ≥ 1). */
  readonly numScroll = input(1);
  /**
   * Layout axis (`p-carousel` parity). `'horizontal'` (default) lays the sliding window out inline and
   * navigates Left/Right; `'vertical'` stacks it on the block axis (translateY), navigates Up/Down, and
   * gives the viewport a definite height ({@link verticalViewportHeight}). The block axis is
   * direction-independent, so a vertical carousel does **not** mirror under RTL. #276.
   */
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  /**
   * The viewport height in {@link orientation} `'vertical'` mode (`p-carousel`'s `verticalViewPortHeight`).
   * A vertical window needs a definite height for the slides' `flex-basis` to resolve and the overflow to
   * clip; this input sets the viewport's `block-size` (any CSS length, default `20rem`), and is ignored in
   * horizontal mode (where the content sizes the box). #276.
   */
  readonly verticalViewportHeight = input('20rem');
  /**
   * Responsive overrides for {@link numVisible} / {@link numScroll} by viewport width — see
   * {@link CaeCarouselResponsiveOption} for the matching rules (`p-carousel` parity). Re-evaluated live as
   * the viewport crosses a breakpoint (browser only — SSR / no `matchMedia` keeps the base window). Bind a
   * **stable reference** (a component field), not an inline array literal, so the breakpoint listeners
   * aren't rebuilt on every change-detection. #276.
   */
  readonly responsiveOptions = input<readonly CaeCarouselResponsiveOption[]>([]);
  /** Whether prev/next wrap past the ends (and autoplay loops). Default false. */
  readonly circular = input(false);
  /** Autoplay timer in ms; `0` (default) disables autoplay. See the class doc for the WCAG 2.2.2 behaviour. */
  readonly autoplayInterval = input(0);
  /**
   * Accessible name for the carousel — **required** for a named `aria-roledescription="carousel"` (APG).
   * Dev-warned when empty.
   */
  readonly ariaLabel = input('');
  /** Whether to render the indicator dots (only shown when there is more than one page). Default true. */
  readonly showIndicators = input(true);
  /** Whether to render the prev/next buttons (only shown when there is more than one page). Default true. */
  readonly showNavigators = input(true);
  /** Accessible label for the previous-slide button. */
  readonly prevAriaLabel = input('Previous slide');
  /** Accessible label for the next-slide button. */
  readonly nextAriaLabel = input('Next slide');
  /** Accessible label for the indicator group. */
  readonly indicatorsLabel = input('Choose slide to display');

  /** The active page index (0-based), two-way. Bind `[(page)]` for two-way or `(pageChange)` to observe. */
  readonly page = model(0);

  /** Whether we're in a browser — autoplay's timer never arms during SSR (matches the matchMedia guard). */
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /**
   * Reads the signal-backed `Directionality.value` directly (reactive on both the root service and a `[dir]`
   * ancestor) rather than `toSignal(dir.change, {initialValue})`, which reports 'ltr' at construction and
   * misses a *born-rtl* `[dir]` binding — and, because the sliding-window transform axis and the indicator
   * Left/Right arrows key off `isRtl()`, would mis-render on first paint (mirrors cae-splitter / cae-image-compare #364).
   */
  private readonly directionality = inject(Directionality);
  protected readonly isRtl = computed(() => this.directionality.value === 'rtl');
  /** Whether the carousel stacks on the block axis (vertical) rather than inline (horizontal). #276. */
  protected readonly isVertical = computed(() => this.orientation() === 'vertical');
  /**
   * This carousel's own indicator buttons. A **view query** auto-scopes to THIS component's view — a nested
   * `<cae-carousel>` inside a slide keeps its dots in the child's view, invisible here — so focus-by-index
   * needs no per-instance DOM token.
   */
  private readonly indicatorBtns = viewChildren<ElementRef<HTMLElement>>('indicatorBtn');

  /** True while the pointer is over the carousel — pauses autoplay. */
  protected readonly _hovered = signal(false);
  /** True while focus is inside the carousel — pauses autoplay. */
  protected readonly _focused = signal(false);
  /** Whether hover/focus is currently pausing autoplay. */
  private readonly interacting = computed(() => this._hovered() || this._focused());

  /** Whether the OS asks for reduced motion — computed once (rarely toggles mid-session; a live signal is #276). */
  private readonly reducedMotion = this.computeReducedMotion();
  /**
   * Whether autoplay is ON — the play/pause toggle's state. Defaults on, unless the OS requests reduced
   * motion (then off; the user can still start it explicitly). Kept separate from the transient hover/focus
   * pause so leaving the carousel resumes this chosen mode.
   */
  protected readonly autoplayOn = signal(!this.reducedMotion);
  /** Whether autoplay is actively advancing right now (on AND enabled AND >1 page AND not paused AND in a browser). */
  protected readonly playing = computed(
    () =>
      this.isBrowser &&
      this.autoplayInterval() > 0 &&
      this.totalPages() > 1 &&
      this.autoplayOn() &&
      !this.interacting(),
  );

  /**
   * Live per-breakpoint match state, keyed by each {@link responsiveOptions} entry's `breakpoint` string,
   * maintained by the responsive effect in the constructor. Empty during SSR and when there are no
   * responsive options, so the base window applies. Read only by {@link activeOption}.
   */
  private readonly matches = signal<ReadonlyMap<string, boolean>>(new Map());
  /**
   * The {@link responsiveOptions} rule in effect for the current viewport, or `null` when none matches (→
   * the base {@link numVisible} / {@link numScroll}). Among the currently-matching rules the **narrowest**
   * breakpoint wins; a rule whose breakpoint doesn't parse as a length never wins. Purely derived from
   * {@link responsiveOptions} + {@link matches}.
   */
  private readonly activeOption = computed<CaeCarouselResponsiveOption | null>(() => {
    const matches = this.matches();
    let best: CaeCarouselResponsiveOption | null = null;
    let bestWidth = Infinity;
    for (const o of this.responsiveOptions()) {
      if (!matches.get(o.breakpoint)) continue;
      const width = parseFloat(o.breakpoint);
      if (Number.isFinite(width) && width < bestWidth) {
        bestWidth = width;
        best = o;
      }
    }
    return best;
  });

  /** {@link numVisible} — the {@link activeOption} override or the base input — floored to a positive integer. */
  private readonly visibleCount = computed(() =>
    Math.max(1, Math.floor(this.activeOption()?.numVisible ?? this.numVisible())),
  );
  /**
   * {@link numScroll} — the {@link activeOption} override or the base input — floored to a positive integer,
   * and never MORE than numVisible: a scroll step larger than the window would skip over interior slides,
   * leaving them permanently unreachable by keyboard/AT.
   */
  private readonly scrollCount = computed(() =>
    Math.min(
      Math.max(1, Math.floor(this.activeOption()?.numScroll ?? this.numScroll())),
      this.visibleCount(),
    ),
  );

  /** Total page count: `ceil((n - numVisible) / numScroll) + 1`, or 1 when everything fits in one window. */
  protected readonly totalPages = computed(() => {
    const n = this.value().length;
    const v = this.visibleCount();
    if (n <= v) return 1;
    return Math.ceil((n - v) / this.scrollCount()) + 1;
  });

  /** The active page clamped into `[0, totalPages - 1]` — the render source of truth (the model may lag). */
  protected readonly clampedPage = computed(() =>
    Math.max(0, Math.min(this.page(), this.totalPages() - 1)),
  );

  /** First item index of the current window, clamped to the end so the last window is always full. */
  private readonly windowStart = computed(() => {
    const n = this.value().length;
    const v = this.visibleCount();
    return Math.min(this.clampedPage() * this.scrollCount(), Math.max(0, n - v));
  });

  /** Each slide's flex-basis as a percentage of the viewport (100 / numVisible). */
  protected readonly itemBasis = computed(() => 100 / this.visibleCount());
  /**
   * The vertical viewport height, surfaced as the `--cae-carousel-viewport-block-size` custom property
   * consumed by the CSS in vertical mode; `null` in horizontal (the content sizes the box). #276.
   */
  protected readonly vpBlockSize = computed<string | null>(() =>
    this.isVertical() ? this.verticalViewportHeight() : null,
  );
  /**
   * The track's translate offset (percent), by whole items. Vertical stacks on the block axis, which is
   * direction-independent, so it always translates up (negative Y) — RTL never applies. Horizontal mirrors
   * under RTL: the flex row lays items inline-start (right) → inline-end, so the window translates toward the
   * inline-start (positive X) instead of negative X — read reactively off {@link isRtl}. #276.
   */
  protected readonly trackTransform = computed(() => {
    const offset = this.windowStart() * this.itemBasis();
    if (this.isVertical()) return `translateY(-${offset}%)`;
    return `translateX(${this.isRtl() ? '' : '-'}${offset}%)`;
  });

  /** `[0, 1, …, totalPages-1]` — drives the indicator `@for`. */
  protected readonly pages = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i));
  /** Whether the carousel is on its first page. */
  protected readonly atStart = computed(() => this.clampedPage() === 0);
  /** Whether the carousel is on its last page. */
  protected readonly atEnd = computed(() => this.clampedPage() === this.totalPages() - 1);

  /** Accessible label for the play/pause toggle — reflects the toggle state, not the transient hover-pause. */
  protected readonly playLabel = computed(() =>
    this.autoplayOn() ? 'Pause autoplay' : 'Start autoplay',
  );

  /** The single projected slide template (`caeCarouselItem`), or `null` for the text fallback. */
  private readonly itemDef = contentChild(CaeCarouselItem);
  /** The captured slide template, or `null` when none is projected. */
  protected readonly itemTemplate = computed(() => this.itemDef()?.template ?? null);

  constructor() {
    // Autoplay: a single interval that lives only while `playing()` is true. Any change to playing (hover,
    // focus, toggle, interval) re-runs this and resets the timer via onCleanup. A page change does NOT
    // re-run it (playing() doesn't depend on page), so rotation is steady.
    effect((onCleanup) => {
      if (!this.playing()) return;
      const id = setInterval(() => this.autoAdvance(), this.autoplayInterval());
      onCleanup(() => clearInterval(id));
    });

    // Responsive window: keep a live match-map for each [responsiveOptions] breakpoint. Re-runs — rebuilding
    // the matchMedia listeners — whenever the options change; browser-only (SSR / no matchMedia leaves the
    // map empty, so the base numVisible/numScroll apply, matching computeReducedMotion's guard). Listeners
    // are torn down on every re-run and on destroy via onCleanup, mirroring the autoplay interval's cleanup.
    // The `change` handler writes a signal from outside a CD tick, which the zoneless scheduler picks up. #276.
    effect((onCleanup) => {
      const opts = this.responsiveOptions();
      if (!this.isBrowser || typeof window.matchMedia !== 'function' || opts.length === 0) {
        this.matches.set(new Map());
        return;
      }
      const queries = opts.map((o) => window.matchMedia(`(max-width: ${o.breakpoint})`));
      const sync = () => {
        const next = new Map<string, boolean>();
        opts.forEach((o, i) => next.set(o.breakpoint, queries[i].matches));
        this.matches.set(next);
      };
      sync();
      for (const q of queries) q.addEventListener('change', sync);
      onCleanup(() => {
        for (const q of queries) q.removeEventListener('change', sync);
      });
    });

    // Keep the two-way page model in range when value/numVisible/numScroll shrink the page count (or a
    // consumer over-sets it). Runs after CD, so no ExpressionChanged hazard; the guard prevents a loop.
    // Skip while `value` is empty: an async-loaded carousel bound to a pre-set `[(page)]` reports
    // totalPages=1 (so clampedPage=0) before its items arrive — reconciling then would clobber the
    // consumer's intended page to 0. Once items load the effect re-runs (value() is a dependency) and
    // clamps as needed, converging identically (mirrors the cae-galleria #274 count>0 guard). #290.
    effect(() => {
      const clamped = this.clampedPage();
      if (this.value().length > 0 && this.page() !== clamped) this.page.set(clamped);
    });

    // Dev-only guidance: a carousel with no accessible name, or slides with no item template.
    if (isDevMode()) {
      effect(() => {
        if (!this.ariaLabel()) {
          console.warn(
            'cae-carousel: no [ariaLabel] — a carousel needs an accessible name (aria-roledescription="carousel" is announced unlabeled without one). Set [ariaLabel].',
          );
        }
        if (this.value().length > 0 && !this.itemTemplate()) {
          console.warn(
            'cae-carousel: no <ng-template caeCarouselItem> projected — slides fall back to the item string form. Project an item template to control slide rendering.',
          );
        }
      });
    }
  }

  /** Whether item `i` is inside the current window (non-inert, visible, tabbable). */
  protected isItemVisible(i: number): boolean {
    const start = this.windowStart();
    return i >= start && i < start + this.visibleCount();
  }

  /** The `aria-label` for slide `i` — "N of M" so a reader tracks position within the set. */
  protected slideLabel(i: number): string {
    return `${i + 1} of ${this.value().length}`;
  }

  /** The `aria-label` for indicator `i` — "Page N of M". */
  protected indicatorLabel(i: number): string {
    return `Page ${i + 1} of ${this.totalPages()}`;
  }

  /** The {@link CaeCarouselItemContext} handed to the slide template. */
  protected itemContext(item: T, index: number): CaeCarouselItemContext<T> {
    return { $implicit: item, index };
  }

  /** Nullish-safe string form of an item for the no-template fallback. */
  protected itemText(item: T): string {
    return item == null ? '' : String(item);
  }

  /** Go to page `p` (clamped). Sets the model (emitting `pageChange`) only when it actually changes. */
  goTo(p: number): void {
    const target = Math.max(0, Math.min(p, this.totalPages() - 1));
    if (target !== this.page()) this.page.set(target);
  }

  /** Advance one page; wraps to the first page at the end when {@link circular}. */
  next(): void {
    const p = this.clampedPage();
    if (p < this.totalPages() - 1) this.goTo(p + 1);
    else if (this.circular()) this.goTo(0);
  }

  /** Go back one page; wraps to the last page at the start when {@link circular}. */
  prev(): void {
    const p = this.clampedPage();
    if (p > 0) this.goTo(p - 1);
    else if (this.circular()) this.goTo(this.totalPages() - 1);
  }

  /** Autoplay advance: always loops (autoplay is inherently circular), independent of the {@link circular} input. */
  private autoAdvance(): void {
    const p = this.clampedPage();
    this.goTo(p >= this.totalPages() - 1 ? 0 : p + 1);
  }

  /** Toggle the play/pause state (the "Pause, Stop, Hide" control, WCAG 2.2.2). */
  togglePlay(): void {
    this.autoplayOn.update((on) => !on);
  }

  /**
   * The indicator group's roving-tabindex keyboard model: Left/Up → previous page, Right/Down → next page,
   * Home/End → first/last, each moving focus to (and selecting) the target dot. Selection follows focus,
   * which is why the active dot is the single tab stop.
   */
  protected onIndicatorKeydown(event: KeyboardEvent, i: number): void {
    let target: number;
    switch (event.key) {
      // Left/Right follow VISUAL order — flipped in RTL so ArrowLeft goes to the later page (which sits to
      // the physical left). Up/Down are the block axis and stay direction-independent (RTL is inline-only).
      case 'ArrowRight':
        target = this.isRtl() ? i - 1 : i + 1;
        break;
      case 'ArrowDown':
        target = i + 1;
        break;
      case 'ArrowLeft':
        target = this.isRtl() ? i + 1 : i - 1;
        break;
      case 'ArrowUp':
        target = i - 1;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = this.totalPages() - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const clamped = Math.max(0, Math.min(target, this.totalPages() - 1));
    this.goTo(clamped);
    this.focusIndicator(clamped);
  }

  /**
   * Move DOM focus to indicator `i` (the new roving tab stop). Uses the {@link indicatorBtns} view query,
   * which only ever contains THIS carousel's dots (a nested carousel's live in its own view), so no
   * instance token is needed. Programmatic `.focus()` ignores the current `tabindex` sign, so it lands
   * immediately.
   */
  private focusIndicator(i: number): void {
    this.indicatorBtns()[i]?.nativeElement.focus();
  }

  /** Whether the OS requests reduced motion (SSR/jsdom-safe: no `matchMedia` → treated as no preference). */
  private computeReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
