import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  isDevMode,
  signal,
  viewChild,
} from '@angular/core';
import { CdkScrollable } from '@angular/cdk/scrolling';

/**
 * `cae-scroll-panel` — a token-styled, cross-browser scroll container (`p-scrollpanel` parity, Book 11 §3.2;
 * COMPARISON row 96). The consumer sizes the box (a `height`/`max-height` or flex context on the host); when
 * the projected content exceeds that box, the panel scrolls with **theme-styled scrollbars** and stays
 * **keyboard- and screen-reader-accessible**.
 *
 * **The laziest sufficient build** (Book 11 §3.2, verbatim: *"native `overflow` with token-styled scrollbars
 * plus `@angular/cdk/scrolling` where a unified scroll stream or custom thumb is genuinely needed — don't
 * reach for a custom-scrollbar engine when CSS + a CDK scrollable does it"*). PrimeNG ships a bespoke
 * draggable-thumb engine; native `overflow:auto` + modern scrollbar CSS (`scrollbar-width`/`scrollbar-color`
 * on Firefox, `::-webkit-scrollbar` on Chromium/Safari, both token-driven) does the same job with **zero
 * foreign code** — keeping the provenance surface clean (D-11).
 *
 * **Accessibility is the parity leg** (axe `scrollable-region-focusable`). A scrollable region is only
 * keyboard-operable if it can receive focus, so when the content **overflows** the container becomes
 * `tabindex="0"` and the browser's own scroll keys (arrows, PageUp/Down, Home/End, Space) work — no bespoke
 * key handler. When named, it also exposes `role="region"` + `aria-label` so a screen-reader user can find
 * and enter it. When the content **fits**, none of that applies: no empty tab stop, no misleading landmark.
 * Overflow is measured with a native `ResizeObserver` (US-clean) over the host and its content, driving the
 * `overflowing` signal (zoneless, Book 01 §3.2). The container is also a {@link CdkScrollable} (host
 * directive) so it registers with the CDK `ScrollDispatcher` — overlays/sticky content anchored inside
 * reposition on its scroll (the "unified scroll stream" hook the book names). Token-only styling (D-04).
 * (Caveat: reaching a `tabindex`-focusable non-interactive container by <kbd>Tab</kbd> in Safari requires the
 * OS "Full Keyboard Access" setting — inherent to the axe-recommended technique, not specific to this build.)
 *
 * ```html
 * <cae-scroll-panel ariaLabel="Release notes" style="height: 12rem">
 *   <p>…long content…</p>
 * </cae-scroll-panel>
 * ```
 *
 * Deferred parity extras (custom draggable `role=scrollbar` thumbs, a programmatic `scrollTo` API,
 * axis-lock inputs, content virtualization) are tracked in the follow-ups filed on landing.
 */
@Component({
  selector: 'cae-scroll-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [CdkScrollable],
  host: {
    class: 'cae-scroll-panel',
    // Focusable while the content overflows, so a keyboard user can scroll it (axe
    // `scrollable-region-focusable`) without stranding an empty tab stop when it fits. If the overflow
    // clears WHILE the container is focused, keep it at tabindex="-1" (focusable, out of the tab order)
    // rather than removing tabindex outright — dropping it from the active element would blur it and dump
    // focus to <body> (WCAG 2.4.3 Focus Order). Once focus leaves, it reverts to a plain div.
    '[attr.tabindex]': 'tabIndex()',
    '(focus)': 'isFocused.set(true)',
    '(blur)': 'isFocused.set(false)',
    // A named region landmark, but only when it BOTH overflows AND has an accessible name — an unnamed
    // region is landmark noise, and a landmark on non-scrolling content misleads assistive tech.
    '[attr.role]': 'isRegion() ? "region" : null',
    '[attr.aria-label]': 'isRegion() ? ariaLabel() : null',
  },
  template: `<div #content class="cae-scroll-panel__content"><ng-content /></div>`,
  styles: `
    :host {
      display: block;
      overflow: auto;
      /* Firefox: a thin scrollbar with a token-coloured thumb over a transparent track. */
      scrollbar-width: thin;
      scrollbar-color: var(--cae-color-border) transparent;
    }
    /* Chromium/Safari: the same token thumb (scrollbar-color is not yet honoured there). */
    :host::-webkit-scrollbar {
      inline-size: var(--cae-space-2);
      block-size: var(--cae-space-2);
    }
    :host::-webkit-scrollbar-track {
      background: transparent;
    }
    :host::-webkit-scrollbar-thumb {
      background: var(--cae-color-border);
      border-radius: var(--cae-radius-full);
    }
    :host::-webkit-scrollbar-thumb:hover {
      background: var(--cae-color-on-surface-variant);
    }
    /* The focus ring lands on the scroll container itself once it becomes keyboard-focusable. */
    :host(:focus-visible) {
      outline: 2px solid var(--cae-color-primary);
      outline-offset: 2px;
      /* A surface-coloured halo keeps the ring visible (WCAG 1.4.11 non-text contrast) over any scrolled
         content or backdrop — mirrors the sibling cae-splitter's focus treatment. */
      box-shadow: 0 0 0 4px var(--cae-surface-raised);
    }
    /* A plain block wrapper: it gives the ResizeObserver a stable box that grows with the projected content
       (the host's own box is fixed by the consumer, so it can't report content growth on its own). */
    .cae-scroll-panel__content {
      display: block;
    }
  `,
})
export class CaeScrollPanel {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');

  /** Accessible name for the scroll region — applied as `aria-label` (with `role="region"`) when it overflows. */
  readonly ariaLabel = input('');

  /** Whether the content currently overflows the container on either axis; drives focusability + the region. */
  protected readonly overflowing = signal(false);
  /** Whether the container itself currently holds focus — see the `tabindex` host-binding rationale. */
  protected readonly isFocused = signal(false);
  /** A named landmark is exposed only when the panel is both scrollable and has an accessible name. */
  protected readonly isRegion = computed(() => this.overflowing() && !!this.ariaLabel().trim());
  /**
   * `tabindex`: `0` (a normal tab stop) while the content overflows; `-1` (focusable, out of the tab order)
   * if the overflow clears while the container is still focused — so focus is retained instead of falling to
   * `<body>`; otherwise absent (a plain, non-focusable div).
   */
  protected readonly tabIndex = computed<number | null>(() =>
    this.overflowing() ? 0 : this.isFocused() ? -1 : null,
  );

  constructor() {
    const destroyRef = inject(DestroyRef);

    // A scrollable-but-unnamed panel stays keyboard-scrollable, but a screen-reader user can't discover it as
    // a region — nudge toward a name (dev-only; reactive, so it fires once the overflow/name state warrants).
    if (isDevMode()) {
      effect(() => {
        if (this.overflowing() && !this.ariaLabel().trim()) {
          console.warn(
            '[cae-scroll-panel] The content overflows but the panel has no accessible name — pass ' +
              '[ariaLabel] so screen-reader users can discover the scroll region (it stays keyboard-' +
              'scrollable either way).',
          );
        }
      });
    }

    afterNextRender(() => {
      this.measureOverflow();
      // Re-measure whenever the container OR its content changes size (native, US-clean). Absent in some
      // non-DOM/SSR runtimes and in jsdom — guarded; the initial measure above still runs.
      if (typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() => this.measureOverflow());
      ro.observe(this.host.nativeElement);
      ro.observe(this.content().nativeElement);
      destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  /**
   * Set {@link overflowing} from the live layout: the content overflows when the host's scroll size exceeds
   * its client size on either axis. A 1px tolerance absorbs sub-pixel rounding so a pixel-exact fit doesn't
   * flip to "overflowing" (and add a spurious tab stop). Exposed so tests can drive it deterministically
   * (jsdom reports zero for every layout metric).
   *
   * Known limitation (#329): the `ResizeObserver` can miss a purely *horizontal*, post-mount content change
   * (a `white-space:nowrap` node that grows wider than the box with no height change and no host resize),
   * since neither observed box reports it. The initial measure catches statically-wide content and vertical
   * growth is always caught, so this is a narrow edge — tracked, not closed, per the Build-S scope.
   */
  protected measureOverflow(): void {
    const el = this.host.nativeElement;
    this.overflowing.set(
      el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
    );
  }
}
