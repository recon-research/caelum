import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  isDevMode,
  model,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CaeDialog, type CaeDialogRef } from 'caelum/dialog';
import { CaeGalleriaLightbox, type CaeGalleriaLightboxData } from './galleria-lightbox';

/**
 * One image in a {@link CaeGalleria}. `src`/`alt` are required (every gallery image needs alt text —
 * WCAG 1.1.1); `thumbnailSrc` falls back to `src` when omitted; `caption` shows under the main image
 * and in the lightbox. v1 is a typed image model — content-agnostic projected item/thumbnail templates
 * (`p-galleria`'s `item`/`thumbnail` templates) are a follow-up, a stepping-stone not a scope cut.
 */
export interface CaeGalleriaItem {
  /** Full-size image source — the main view and the lightbox. */
  src: string;
  /** Alt text — required; becomes the image's accessible name and the thumbnail tab's label. */
  alt: string;
  /** Thumbnail source; defaults to {@link src} when omitted. */
  thumbnailSrc?: string;
  /** Optional caption shown beneath the main image and in the lightbox. */
  caption?: string;
}

/** Monotonic id source so a page can hold many galleries without id collisions (no `Math.random`). */
let nextUniqueId = 0;

/**
 * `cae-galleria` — an image gallery (`reference/COMPARISON.md`: `p-galleria` → `cae-galleria`; Book 11
 * §3.4, the ★ media family). A main image view with prev/next navigators, a **thumbnail strip** that
 * selects the viewed image (WAI-ARIA tabs: `role="tablist"` of `role="tab"` thumbnails driving one
 * `role="tabpanel"` main view, selection-follows-focus with a roving tabindex), a position live-region,
 * and a **fullscreen lightbox** opened through {@link CaeDialog} (D-15, Book 09 §3.3) — Material's
 * centered modal supplies the focus-trap, `Escape`/backdrop dismissal, and focus-restore for free.
 *
 * State lives in signals (zoneless, Book 11 §3.5 pt 4); `activeIndex` is a two-way `model` shared with
 * the lightbox so navigating fullscreen updates the inline view. No foreign media library (Book 11
 * §3.5 gate 6). The strip renders every thumbnail in v1 (fully keyboard-verifiable); cdk-virtual-scroll
 * virtualization for very large galleries is a follow-up gated on the M4 browser runner (#240), since
 * verifying roving focus over a virtualized strip needs real layout jsdom can't provide (#274).
 *
 * ```html
 * <cae-galleria [items]="photos" ariaLabel="Product photos" [(activeIndex)]="index" />
 * ```
 */
@Component({
  selector: 'cae-galleria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="cae-galleria"
      role="group"
      [attr.aria-roledescription]="ariaLabel() ? 'gallery' : null"
      [attr.aria-label]="ariaLabel() || null"
    >
      @if (count() > 0) {
        <div
          class="cae-galleria__stage"
          [attr.role]="hasThumbnails() ? 'tabpanel' : null"
          [id]="panelId"
          [attr.aria-labelledby]="hasThumbnails() ? tabId(clampedIndex()) : null"
        >
          @if (showNavigators() && count() > 1) {
            <button
              type="button"
              class="cae-galleria__nav cae-galleria__nav--prev"
              [attr.aria-label]="prevAriaLabel()"
              [attr.aria-disabled]="atStart() && !circular() ? 'true' : null"
              (click)="prev()"
            >
              <span
                class="cae-galleria__chevron cae-galleria__chevron--prev"
                aria-hidden="true"
              ></span>
            </button>
          }

          <div class="cae-galleria__main">
            <figure class="cae-galleria__figure">
              @if (activeItem(); as item) {
                <img class="cae-galleria__image" [src]="item.src" [alt]="item.alt" />
                @if (item.caption) {
                  <figcaption class="cae-galleria__caption">{{ item.caption }}</figcaption>
                }
              }
            </figure>
            <button
              type="button"
              class="cae-galleria__fullscreen"
              [attr.aria-label]="fullscreenAriaLabel()"
              (click)="openFullscreen()"
            >
              <span class="cae-galleria__expand-glyph" aria-hidden="true"></span>
            </button>
          </div>

          @if (showNavigators() && count() > 1) {
            <button
              type="button"
              class="cae-galleria__nav cae-galleria__nav--next"
              [attr.aria-label]="nextAriaLabel()"
              [attr.aria-disabled]="atEnd() && !circular() ? 'true' : null"
              (click)="next()"
            >
              <span
                class="cae-galleria__chevron cae-galleria__chevron--next"
                aria-hidden="true"
              ></span>
            </button>
          }
        </div>

        @if (hasThumbnails()) {
          <div class="cae-galleria__thumbs" role="tablist" [attr.aria-label]="thumbnailsLabel()">
            @for (item of items(); track $index; let i = $index) {
              <button
                #thumbBtn
                type="button"
                role="tab"
                class="cae-galleria__thumb"
                [class.cae-galleria__thumb--active]="i === clampedIndex()"
                [id]="tabId(i)"
                [attr.aria-selected]="i === clampedIndex()"
                [attr.aria-controls]="panelId"
                [attr.aria-label]="thumbLabel(item, i)"
                [tabindex]="i === clampedIndex() ? 0 : -1"
                (click)="select(i)"
                (keydown)="onThumbKeydown($event, i)"
              >
                <img class="cae-galleria__thumb-image" [src]="thumbSrc(item)" alt="" />
              </button>
            }
          </div>
        }

        <!-- Polite position announcement. ARIA announces live-region CHANGES only, so the initial value
             is silent and each navigation reads "Image N of M". The library convention is an in-template
             live region (cae-carousel does the same), not the LiveAnnouncer service. -->
        <div class="cae-galleria__sr-status" aria-live="polite" aria-atomic="true">
          {{ statusText() }}
        </div>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-galleria__stage {
      display: flex;
      align-items: center;
      gap: var(--cae-space-2);
    }
    .cae-galleria__main {
      position: relative;
      flex: 1 1 auto;
      min-inline-size: 0;
      display: flex;
      justify-content: center;
    }
    .cae-galleria__figure {
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--cae-space-2);
      min-inline-size: 0;
    }
    .cae-galleria__image {
      display: block;
      max-inline-size: 100%;
      max-block-size: 60vh;
      object-fit: contain;
      border-radius: var(--cae-radius-md);
    }
    .cae-galleria__caption {
      margin: 0;
      text-align: center;
      color: var(--cae-color-on-surface-variant);
    }
    /* Nav + fullscreen buttons: token-styled, glyphs drawn from currentColor — no icon font. */
    .cae-galleria__nav,
    .cae-galleria__fullscreen {
      flex: 0 0 auto;
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
    .cae-galleria__fullscreen {
      position: absolute;
      inset-block-start: var(--cae-space-2);
      inset-inline-end: var(--cae-space-2);
    }
    /* Ends use aria-disabled (not the disabled property) so the focused button KEEPS focus instead of
       blurring to <body> when it dims at an end (WCAG 2.4.3); prev()/next() already no-op there. */
    .cae-galleria__nav[aria-disabled='true'] {
      color: var(--cae-color-on-surface-variant);
      opacity: 0.5;
      cursor: default;
    }
    .cae-galleria__nav:not([aria-disabled='true']):hover,
    .cae-galleria__fullscreen:hover {
      border-color: var(--cae-color-primary);
    }
    .cae-galleria__chevron {
      display: inline-block;
      inline-size: 0.5em;
      block-size: 0.5em;
      border-inline-end: 2px solid currentColor;
      border-block-end: 2px solid currentColor;
    }
    .cae-galleria__chevron--prev {
      transform: rotate(135deg);
      margin-inline-start: 0.2em;
    }
    .cae-galleria__chevron--next {
      transform: rotate(-45deg);
      margin-inline-end: 0.2em;
    }
    /* Expand hint: a framed square from currentColor (the aria-label carries the meaning). */
    .cae-galleria__expand-glyph {
      display: inline-block;
      inline-size: 0.7em;
      block-size: 0.7em;
      border: 2px solid currentColor;
      border-radius: var(--cae-radius-sm);
    }
    /* Thumbnail strip: a horizontally-scrollable row; the active thumb is scrolled into view on nav. */
    .cae-galleria__thumbs {
      display: flex;
      gap: var(--cae-space-2);
      margin-block-start: var(--cae-space-3);
      overflow-x: auto;
      padding-block-end: var(--cae-space-1);
    }
    .cae-galleria__thumb {
      flex: 0 0 auto;
      padding: 0;
      border: 2px solid transparent;
      border-radius: var(--cae-radius-md);
      background: none;
      cursor: pointer;
      line-height: 0;
    }
    .cae-galleria__thumb:not(.cae-galleria__thumb--active):hover {
      border-color: var(--cae-color-border);
    }
    .cae-galleria__thumb--active {
      border-color: var(--cae-color-primary);
    }
    .cae-galleria__thumb-image {
      display: block;
      /* Structural thumbnail geometry (a fixed strip height), not a themeable design value. */
      block-size: 3.5rem;
      inline-size: 5rem;
      object-fit: cover;
      border-radius: var(--cae-radius-sm);
    }
    /* The position live region is for screen readers only — visually hidden, not display:none (which
       would drop it from the a11y tree). */
    .cae-galleria__sr-status {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `,
})
export class CaeGalleria {
  private readonly dialog = inject(CaeDialog);
  private readonly destroyRef = inject(DestroyRef);
  /** The open lightbox ref, or null — guards against stacking a second lightbox on a double-open. */
  private lightboxRef: CaeDialogRef<void> | null = null;

  /** The images. `alt` is required on each (WCAG 1.1.1). */
  readonly items = input<readonly CaeGalleriaItem[]>([]);
  /** The currently-viewed image index — two-way; shared with the lightbox so fullscreen nav syncs back. */
  readonly activeIndex = model(0);
  /** Wrap prev/next past the ends (default off). */
  readonly circular = input(false, { transform: booleanAttribute });
  /** Show the thumbnail strip (default on). Hidden anyway for a single image. */
  readonly showThumbnails = input(true, { transform: booleanAttribute });
  /** Show the prev/next navigators over the main image (default on). Hidden for a single image. */
  readonly showNavigators = input(true, { transform: booleanAttribute });
  /** Accessible name for the gallery group — set one (its role/roledescription is dropped without it). */
  readonly ariaLabel = input('');
  readonly prevAriaLabel = input('Previous image');
  readonly nextAriaLabel = input('Next image');
  readonly fullscreenAriaLabel = input('View full screen');
  readonly closeAriaLabel = input('Close');
  /** Accessible name for the thumbnail tablist. */
  readonly thumbnailsLabel = input('Image thumbnails');

  /** Per-instance id root so `panelId`/`tabId` never collide across galleries on one page. */
  private readonly uid = nextUniqueId++;
  protected readonly panelId = `cae-galleria-panel-${this.uid}`;
  /** Stable id for thumbnail tab `i` — the tabpanel's `aria-labelledby` points at the active one. */
  protected tabId(i: number): string {
    return `cae-galleria-tab-${this.uid}-${i}`;
  }

  /** This gallery's thumbnail tab buttons (view query → auto-scoped to this instance). */
  private readonly thumbBtns = viewChildren<ElementRef<HTMLElement>>('thumbBtn');

  protected readonly count = computed(() => this.items().length);
  /** The active index clamped into range — the render source of truth (the model may lag/over-set). */
  protected readonly clampedIndex = computed(() =>
    Math.max(0, Math.min(this.activeIndex(), this.count() - 1)),
  );
  protected readonly activeItem = computed(() => this.items()[this.clampedIndex()] ?? null);
  protected readonly atStart = computed(() => this.clampedIndex() === 0);
  protected readonly atEnd = computed(() => this.clampedIndex() === this.count() - 1);
  /** The polite live-region text — "Image N of M" (empty when there are no images). */
  protected readonly statusText = computed(() =>
    this.count() > 0 ? `Image ${this.clampedIndex() + 1} of ${this.count()}` : '',
  );
  /**
   * Whether the thumbnail tablist actually renders. Gates BOTH the tablist `@if` AND the main view's
   * `role="tabpanel"`/`aria-labelledby` tab semantics — so a single-image or `showThumbnails=false`
   * gallery is a plain figure, never an orphan tabpanel pointing at a non-existent tab.
   */
  protected readonly hasThumbnails = computed(() => this.showThumbnails() && this.count() > 1);

  constructor() {
    // Tear down this gallery's lightbox when the host is destroyed while it's still open (#294): close the
    // modal so focus isn't stranded on <body> with no live restore target. The afterClosed subscription is
    // tied to the same DestroyRef in openFullscreen().
    this.destroyRef.onDestroy(() => this.lightboxRef?.close());

    // Keep the two-way model in range when items shrink or a consumer over-sets it. Runs after CD (no
    // ExpressionChanged hazard); the guard prevents a write loop.
    effect(() => {
      const clamped = this.clampedIndex();
      // Guard on count > 0 so a still-loading gallery (items() transiently empty) doesn't clobber a
      // consumer's pre-set [(activeIndex)] down to 0 — when items arrive this re-runs and clamps the
      // preserved index into the real range.
      if (this.count() > 0 && this.activeIndex() !== clamped) this.activeIndex.set(clamped);
    });

    // Dev-only guidance: an unlabeled gallery, or images missing alt text.
    if (isDevMode()) {
      effect(() => {
        if (this.count() > 0 && !this.ariaLabel()) {
          console.warn(
            'cae-galleria: no [ariaLabel] — a gallery needs an accessible name (its aria-roledescription="gallery" is dropped when unlabeled, since roledescription is invalid on an unnamed group). Set [ariaLabel].',
          );
        }
        if (this.items().some((it) => !it.alt)) {
          console.warn(
            'cae-galleria: one or more items have no `alt` — every gallery image needs alt text (WCAG 1.1.1).',
          );
        }
      });
    }
  }

  protected thumbSrc(item: CaeGalleriaItem): string {
    return item.thumbnailSrc ?? item.src;
  }

  /** The thumbnail tab's accessible name — the image's alt plus its position in the set. */
  protected thumbLabel(item: CaeGalleriaItem, i: number): string {
    return `${item.alt || 'Image'} (${i + 1} of ${this.count()})`;
  }

  /** Go to image `i` (clamped). Sets the model (emitting `activeIndexChange`) only on a real change. */
  goTo(i: number): void {
    const target = Math.max(0, Math.min(i, this.count() - 1));
    if (target !== this.activeIndex()) this.activeIndex.set(target);
  }

  /** Advance one image; wraps to the first at the end when {@link circular}. */
  next(): void {
    const i = this.clampedIndex();
    if (i < this.count() - 1) this.goTo(i + 1);
    else if (this.circular()) this.goTo(0);
  }

  /** Go back one image; wraps to the last at the start when {@link circular}. */
  prev(): void {
    const i = this.clampedIndex();
    if (i > 0) this.goTo(i - 1);
    else if (this.circular()) this.goTo(this.count() - 1);
  }

  /** Thumbnail click → view that image. Focus already landed on the clicked thumb, so don't move it. */
  protected select(i: number): void {
    this.goTo(i);
  }

  /**
   * The thumbnail tablist's roving-tabindex keyboard model: Left/Up → previous, Right/Down → next,
   * Home/End → first/last — each moving focus to (and selecting) the target thumb. Selection follows
   * focus, which is why the active thumb is the single tab stop.
   */
  protected onThumbKeydown(event: KeyboardEvent, i: number): void {
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
        target = this.count() - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const clamped = Math.max(0, Math.min(target, this.count() - 1));
    this.goTo(clamped);
    this.focusThumb(clamped);
  }

  /** Move focus to thumb `i` (the new roving tab stop) and scroll it into the visible strip. */
  private focusThumb(i: number): void {
    const el = this.thumbBtns()[i]?.nativeElement;
    el?.focus();
    // scrollIntoView is a no-op stub under jsdom; the optional call guards a missing implementation.
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /**
   * Open the fullscreen lightbox at the current image. Material (via {@link CaeDialog}) supplies the
   * centered modal, focus-trap, `Escape`/backdrop dismissal, and focus-restore to whatever was focused
   * when it opened — the fullscreen button on the click/keyboard path. The lightbox live-syncs
   * `activeIndex` back through `onNavigate`, so the inline view reflects whatever was last seen, however
   * the dialog closes. No-ops on an empty gallery, or when a lightbox is already open (no stacking).
   */
  openFullscreen(): void {
    if (this.count() === 0 || this.lightboxRef) return;
    this.lightboxRef = this.dialog.open<CaeGalleriaLightbox, void, CaeGalleriaLightboxData>(
      CaeGalleriaLightbox,
      {
        // Stable class on the overlay pane — the documented consumer/theme hook for restyling the
        // lightbox surface (CaeDialogConfig.panelClass); sizing itself is handled by maxWidth.
        panelClass: 'cae-galleria__lightbox-panel',
        ariaLabel: this.ariaLabel() || 'Image viewer',
        maxWidth: '96vw',
        data: {
          items: this.items(),
          index: this.clampedIndex(),
          circular: this.circular(),
          onNavigate: (i) => this.activeIndex.set(i),
          prevAriaLabel: this.prevAriaLabel(),
          nextAriaLabel: this.nextAriaLabel(),
          closeAriaLabel: this.closeAriaLabel(),
        },
      },
    );
    // Release the guard when the lightbox closes. afterClosed emits once then completes, but tie it to the
    // DestroyRef so a host destroyed mid-lightbox can't leave the closure pinning this instance (#294).
    this.lightboxRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => (this.lightboxRef = null));
  }
}
