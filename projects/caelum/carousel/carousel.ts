import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  contentChild,
  effect,
  inject,
  input,
  isDevMode,
  model,
  signal,
} from '@angular/core';
import { CaeCarouselItem, CaeCarouselItemContext } from './carousel-item';

/**
 * A responsive-option row: below `breakpoint` (a CSS length) the carousel uses this `numVisible`/`numScroll`.
 * Reserved for the responsive follow-up (#273 out-of-scope note) — v1 renders a fixed window — so it is
 * exported now to keep the input's type stable, but not yet consumed.
 */
export interface CaeCarouselResponsiveOption {
  /** Max viewport width (CSS length, e.g. `'768px'`) at or below which this option applies. */
  breakpoint: string;
  /** Items visible at this breakpoint. */
  numVisible: number;
  /** Items scrolled per step at this breakpoint. */
  numScroll: number;
}

/** Process-global counter seeding a unique per-instance scope token, so a carousel-in-a-slide never
 *  matches the outer carousel's indicator query (mirrors cae-tree-table's row scope). */
let nextCarouselId = 0;

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
 * **roving-tabindex** group (one tab stop) navigable with Left/Right/Home/End (selection follows focus),
 * each labelled "Page N of M" with `aria-current` on the active page. The real-browser SR announcement,
 * like cae-tree-table's, is confirmed in the M4 pass (#240).
 *
 * **Slide content.** Project a single `<ng-template caeCarouselItem let-item let-i="index">` to render each
 * slide; see {@link CaeCarouselItem}. Without one, slides fall back to the item's string form (dev-warned).
 *
 * **v1 scope** (#273): fixed horizontal window, circular, autoplay (+pause/stop/reduced-motion), prev/next,
 * indicators, keyboard, full ARIA, content projection. Follow-ups: responsive `responsiveOptions`, vertical
 * orientation, and touch/CDK-drag swipe-to-advance (buttons + arrows already give the full keyboard path,
 * §3.5 gate 1, so swipe is an enhancement, not a parity gap).
 *
 * @typeParam T - the item shape (one element of {@link value}).
 */
@Component({
  selector: 'cae-carousel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: {
    class: 'cae-carousel',
    role: 'group',
    'aria-roledescription': 'carousel',
    '[attr.aria-label]': 'ariaLabel() || null',
    '(mouseenter)': '_hovered.set(true)',
    '(mouseleave)': '_hovered.set(false)',
    '(focusin)': '_focused.set(true)',
    '(focusout)': '_focused.set(false)',
  },
  template: `
    <div class="cae-carousel__viewport">
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
            [disabled]="atStart() && !circular()"
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
                type="button"
                class="cae-carousel__indicator"
                [class.cae-carousel__indicator--active]="i === clampedPage()"
                [attr.data-cae-carousel-scope]="scope"
                [attr.data-cae-carousel-indicator]="i"
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
            [disabled]="atEnd() && !circular()"
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
              [class.cae-carousel__play-icon--pause]="playDesire()"
              [class.cae-carousel__play-icon--play]="!playDesire()"
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
      padding: 0;
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-full);
      background: var(--cae-surface-raised);
      color: var(--cae-color-on-surface);
      cursor: pointer;
    }
    .cae-carousel__nav:disabled {
      color: var(--cae-color-on-surface-variant);
      opacity: 0.5;
      cursor: default;
    }
    .cae-carousel__nav:not(:disabled):hover,
    .cae-carousel__play:hover {
      border-color: var(--cae-color-primary);
    }
    .cae-carousel__chevron {
      display: inline-block;
      inline-size: 0.5em;
      block-size: 0.5em;
      border-inline-end: 2px solid currentColor;
      border-block-end: 2px solid currentColor;
    }
    .cae-carousel__chevron--prev {
      transform: rotate(135deg);
      margin-inline-start: 0.2em;
    }
    .cae-carousel__chevron--next {
      transform: rotate(-45deg);
      margin-inline-end: 0.2em;
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
    .cae-carousel__indicators {
      display: inline-flex;
      align-items: center;
      gap: var(--cae-space-1);
    }
    .cae-carousel__indicator {
      inline-size: var(--cae-space-2);
      block-size: var(--cae-space-2);
      padding: 0;
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-full);
      background: transparent;
      cursor: pointer;
    }
    .cae-carousel__indicator--active {
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
  /**
   * Responsive breakpoint overrides. **Not yet consumed** (v1 renders a fixed window) — reserved for the
   * responsive follow-up so the public input type is stable now; see the class doc's v1-scope note.
   */
  readonly responsiveOptions = input<readonly CaeCarouselResponsiveOption[]>([]);

  /** The active page index (0-based), two-way. Bind `[(page)]` for two-way or `(pageChange)` to observe. */
  readonly page = model(0);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Per-instance scope token stamped on each indicator, so {@link focusIndicator} finds THIS carousel's dots. */
  protected readonly scope = String(nextCarouselId++);

  /** True while the pointer is over the carousel — pauses autoplay. */
  protected readonly _hovered = signal(false);
  /** True while focus is inside the carousel — pauses autoplay. */
  protected readonly _focused = signal(false);
  /** Whether hover/focus is currently pausing autoplay. */
  private readonly interacting = computed(() => this._hovered() || this._focused());

  /**
   * Explicit play/pause intent from the toggle button: `null` = follow the default (autoplay on, unless
   * reduced motion is requested), `true`/`false` = the user chose. Kept separate from the transient
   * hover/focus pause so leaving the carousel resumes the user's chosen mode.
   */
  private readonly _autoplayOn = signal<boolean | null>(null);
  /** Whether the OS asks for reduced motion — computed once (rarely toggles mid-session; a live signal is a follow-up). */
  private readonly reducedMotion = this.computeReducedMotion();
  /** The effective "should be playing" intent: explicit choice, else on unless reduced motion is requested. */
  protected readonly playDesire = computed(() => this._autoplayOn() ?? !this.reducedMotion);
  /** Whether autoplay is actively advancing right now (intent AND enabled AND not hover/focus-paused). */
  protected readonly playing = computed(
    () => this.autoplayInterval() > 0 && this.playDesire() && !this.interacting(),
  );

  /** {@link numVisible} floored to a positive integer. */
  private readonly visibleCount = computed(() => Math.max(1, Math.floor(this.numVisible())));
  /** {@link numScroll} floored to a positive integer. */
  private readonly scrollCount = computed(() => Math.max(1, Math.floor(this.numScroll())));

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
  /** The track's translate offset (percent), by whole items. */
  protected readonly trackTransform = computed(
    () => `translateX(-${this.windowStart() * this.itemBasis()}%)`,
  );

  /** `[0, 1, …, totalPages-1]` — drives the indicator `@for`. */
  protected readonly pages = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i));
  /** Whether the carousel is on its first page. */
  protected readonly atStart = computed(() => this.clampedPage() === 0);
  /** Whether the carousel is on its last page. */
  protected readonly atEnd = computed(() => this.clampedPage() === this.totalPages() - 1);

  /** Accessible label for the play/pause toggle — reflects the play *intent*, not the transient hover-pause. */
  protected readonly playLabel = computed(() =>
    this.playDesire() ? 'Pause autoplay' : 'Start autoplay',
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

    // Keep the two-way page model in range when value/numVisible/numScroll shrink the page count (or a
    // consumer over-sets it). Runs after CD, so no ExpressionChanged hazard; the guard prevents a loop.
    effect(() => {
      const clamped = this.clampedPage();
      if (this.page() !== clamped) this.page.set(clamped);
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

  /** Toggle the user's play/pause intent (the "Pause, Stop, Hide" control, WCAG 2.2.2). */
  togglePlay(): void {
    this._autoplayOn.set(!this.playDesire());
  }

  /**
   * The indicator group's roving-tabindex keyboard model: Left/Up → previous page, Right/Down → next page,
   * Home/End → first/last, each moving focus to (and selecting) the target dot. Selection follows focus,
   * which is why the active dot is the single tab stop.
   */
  protected onIndicatorKeydown(event: KeyboardEvent, i: number): void {
    let target: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        target = i + 1;
        break;
      case 'ArrowLeft':
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
   * Move DOM focus to indicator `i` (the new roving tab stop). Scoped to THIS carousel by the per-instance
   * `data-cae-carousel-scope` token, so a nested carousel inside a slide is never matched. Programmatic
   * `.focus()` ignores the current `tabindex` sign, so it lands immediately.
   */
  private focusIndicator(i: number): void {
    this.host.nativeElement
      .querySelector<HTMLElement>(
        `[data-cae-carousel-scope="${this.scope}"][data-cae-carousel-indicator="${i}"]`,
      )
      ?.focus();
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
