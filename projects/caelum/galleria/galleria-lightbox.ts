import { hasModifierKey } from '@angular/cdk/keycodes';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type TemplateRef,
} from '@angular/core';
import { CAE_DIALOG_DATA, injectCaeDialogRef } from 'caelum/dialog';
import type { CaeGalleriaItem } from './galleria';
import type { CaeGalleriaTemplateContext } from './galleria-item';

/**
 * Payload {@link CaeGalleria.openFullscreen} hands the lightbox through {@link CAE_DIALOG_DATA}.
 * `onNavigate` is the live seam back to the opener: the lightbox calls it on every index change, so
 * the inline galleria's `activeIndex` stays in sync **however** the dialog closes (button, `Escape`,
 * backdrop) — there's no need to close-with-a-result, which `Escape`/backdrop can't carry anyway.
 */
export interface CaeGalleriaLightboxData {
  items: readonly CaeGalleriaItem[];
  index: number;
  circular: boolean;
  /** The opener's projected `caeGalleriaItem` template (or null) — so fullscreen renders the same content. */
  itemTemplate: TemplateRef<CaeGalleriaTemplateContext> | null;
  /** Caption placement, mirrored from the inline view so fullscreen matches it. */
  captionPosition: 'below' | 'overlay';
  onNavigate: (index: number) => void;
  prevAriaLabel: string;
  nextAriaLabel: string;
  closeAriaLabel: string;
}

/**
 * The fullscreen image viewer {@link CaeGalleria} opens through {@link CaeDialog} (D-15, Book 09 §3.3):
 * a large image + prev/next + a live position counter, on Material's centered modal — which already
 * supplies the focus-trap, `Escape`/backdrop dismissal, and **focus-restore to the opening button**
 * (Book 09 §2.2 beats 3–5), so this component owns only the picture and its navigation. It carries no
 * `@angular/material` import (`CAE_DIALOG_DATA` / {@link injectCaeDialogRef} are the seams). Not
 * exported: a lightbox is reached only via {@link CaeGalleria.openFullscreen}.
 */
@Component({
  selector: 'cae-galleria-lightbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Left/Right arrows navigate while the modal is focused. The listener lives on the HOST (not the
  // inner div) so it catches keydown bubbling from whichever trapped button holds focus, without making
  // a non-interactive container a tab stop.
  host: { '(keydown)': 'onKeydown($event)' },
  imports: [NgTemplateOutlet],
  template: `
    <div class="cae-galleria-lightbox">
      <button
        type="button"
        class="cae-galleria-lightbox__close"
        [attr.aria-label]="data.closeAriaLabel"
        (click)="close()"
      >
        <span class="cae-galleria-lightbox__close-glyph" aria-hidden="true"></span>
      </button>

      <button
        type="button"
        class="cae-galleria-lightbox__nav cae-galleria-lightbox__nav--prev"
        [attr.aria-label]="data.prevAriaLabel"
        [attr.aria-disabled]="!data.circular && atStart() ? 'true' : null"
        (click)="prev()"
      >
        <span
          class="cae-galleria-lightbox__chevron cae-galleria-lightbox__chevron--prev"
          aria-hidden="true"
        ></span>
      </button>

      <figure class="cae-galleria-lightbox__figure">
        @if (activeItem(); as item) {
          @if (data.itemTemplate; as tpl) {
            <ng-container
              [ngTemplateOutlet]="tpl"
              [ngTemplateOutletContext]="templateContext(item)"
            ></ng-container>
          } @else {
            <img class="cae-galleria-lightbox__image" [src]="item.src" [alt]="item.alt" />
            @if (item.caption) {
              <figcaption
                class="cae-galleria-lightbox__caption"
                [class.cae-galleria-lightbox__caption--overlay]="data.captionPosition === 'overlay'"
              >
                {{ item.caption }}
              </figcaption>
            }
          }
        }
      </figure>

      <button
        type="button"
        class="cae-galleria-lightbox__nav cae-galleria-lightbox__nav--next"
        [attr.aria-label]="data.nextAriaLabel"
        [attr.aria-disabled]="!data.circular && atEnd() ? 'true' : null"
        (click)="next()"
      >
        <span
          class="cae-galleria-lightbox__chevron cae-galleria-lightbox__chevron--next"
          aria-hidden="true"
        ></span>
      </button>

      <!-- Position is announced by a polite live region (ARIA announces CHANGES, so the initial value
           on open is silent; each navigation reads "Image N of M"). No LiveAnnouncer service — the
           library's convention is an in-template live region (cae-carousel does the same). -->
      <div class="cae-galleria-lightbox__counter" aria-live="polite" aria-atomic="true">
        {{ counterText() }}
      </div>
    </div>
  `,
  styles: `
    .cae-galleria-lightbox {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--cae-space-3);
      min-inline-size: min(80vw, 60rem);
    }
    .cae-galleria-lightbox__figure {
      /* position:relative anchors an overlay caption to the image box; inert for the below layout. */
      position: relative;
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--cae-space-2);
      min-inline-size: 0;
    }
    .cae-galleria-lightbox__image {
      display: block;
      max-inline-size: 100%;
      max-block-size: 72vh;
      object-fit: contain;
    }
    .cae-galleria-lightbox__caption {
      margin: 0;
      text-align: center;
      color: var(--cae-color-on-surface-variant);
    }
    /* Overlay placement, mirrored from the inline view (see cae-galleria __caption--overlay). Two
       lightbox-only deltas: the fullscreen image is square-cornered (so no bottom radii here), and the
       band is lifted off the bottom edge so it clears the centered position counter (#405 visual check). */
    .cae-galleria-lightbox__caption--overlay {
      position: absolute;
      inset-inline: 0;
      inset-block-end: var(--cae-space-6);
      padding-block: var(--cae-space-1);
      padding-inline: var(--cae-space-2);
      background: var(--cae-surface-base);
      background: color-mix(in srgb, var(--cae-surface-base) 82%, transparent);
      color: var(--cae-color-on-surface);
    }
    .cae-galleria-lightbox__counter {
      position: absolute;
      inset-block-end: 0;
      inset-inline-start: 50%;
      transform: translateX(-50%);
      color: var(--cae-color-on-surface-variant);
    }
    /* Close + nav buttons: token-styled, glyphs drawn from currentColor — no icon font. */
    .cae-galleria-lightbox__close,
    .cae-galleria-lightbox__nav {
      flex: 0 0 auto;
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
    .cae-galleria-lightbox__close {
      position: absolute;
      inset-block-start: 0;
      inset-inline-end: 0;
    }
    .cae-galleria-lightbox__nav[aria-disabled='true'] {
      color: var(--cae-color-on-surface-variant);
      opacity: 0.5;
      cursor: default;
    }
    .cae-galleria-lightbox__close:hover,
    .cae-galleria-lightbox__nav:not([aria-disabled='true']):hover {
      border-color: var(--cae-color-primary);
    }
    .cae-galleria-lightbox__chevron {
      display: inline-block;
      inline-size: 0.5em;
      block-size: 0.5em;
      border-inline-end: 2px solid currentColor;
      border-block-end: 2px solid currentColor;
    }
    .cae-galleria-lightbox__chevron--prev {
      transform: rotate(135deg);
      margin-inline-start: 0.2em;
    }
    .cae-galleria-lightbox__chevron--next {
      transform: rotate(-45deg);
      margin-inline-end: 0.2em;
    }
    /* Close glyph: an ✕ drawn from two currentColor bars. */
    .cae-galleria-lightbox__close-glyph {
      position: relative;
      inline-size: 0.7em;
      block-size: 0.7em;
    }
    .cae-galleria-lightbox__close-glyph::before,
    .cae-galleria-lightbox__close-glyph::after {
      content: '';
      position: absolute;
      inset-block-start: 50%;
      inset-inline-start: 0;
      inline-size: 100%;
      block-size: 2px;
      background: currentColor;
    }
    .cae-galleria-lightbox__close-glyph::before {
      transform: rotate(45deg);
    }
    .cae-galleria-lightbox__close-glyph::after {
      transform: rotate(-45deg);
    }
  `,
})
export class CaeGalleriaLightbox {
  /** The opener's payload — items, the starting index, and the live `onNavigate` sync seam. */
  protected readonly data = inject(CAE_DIALOG_DATA) as CaeGalleriaLightboxData;
  private readonly ref = injectCaeDialogRef<void>();

  /** Total item count (fixed for the lightbox's lifetime — the opener's array is a snapshot). */
  private readonly count = this.data.items.length;
  /** The currently-viewed index; seeded from the opener and kept in sync back via `onNavigate`. */
  protected readonly index = signal(this.data.index);
  /** The item at {@link index}, or `null` if the (snapshot) array is somehow empty. */
  protected readonly activeItem = computed(() => this.data.items[this.index()] ?? null);
  protected readonly atStart = computed(() => this.index() === 0);
  protected readonly atEnd = computed(() => this.index() === this.count - 1);
  /** The polite live-region text — "Image N of M". */
  protected readonly counterText = computed(() => `Image ${this.index() + 1} of ${this.count}`);

  /** The context handed to a projected `caeGalleriaItem` template (mirrors the inline view's context). */
  protected templateContext(item: CaeGalleriaItem): CaeGalleriaTemplateContext {
    return { $implicit: item, index: this.index() };
  }

  /** Go back one image; wraps to the last when {@link CaeGalleriaLightboxData.circular}. */
  protected prev(): void {
    if (this.index() > 0) this.setIndex(this.index() - 1);
    else if (this.data.circular) this.setIndex(this.count - 1);
  }

  /** Advance one image; wraps to the first when {@link CaeGalleriaLightboxData.circular}. */
  protected next(): void {
    if (this.index() < this.count - 1) this.setIndex(this.index() + 1);
    else if (this.data.circular) this.setIndex(0);
  }

  /** Set the index AND push it back to the opener so the inline galleria tracks the fullscreen view. */
  private setIndex(i: number): void {
    this.index.set(i);
    this.data.onNavigate(i);
  }

  /** Close the lightbox. `Escape`/backdrop close the same way (Material); focus restores to the opener. */
  protected close(): void {
    this.ref.close();
  }

  /**
   * Keyboard nav while the modal is focused: Left/Right step prev/next, Home/End jump to first/last.
   * `Escape` is Material's own dismissal (this handler never touches it). Stepping is LOGICAL (Left→prev):
   * unlike the inline strip (which flips Left/Right under RTL), the lightbox renders LTR — `openFullscreen`
   * passes no dialog `direction` — so its arrows don't yet mirror. Making it RTL-aware is #466 (part of #288).
   */
  protected onKeydown(event: KeyboardEvent): void {
    // A chord the widget doesn't implement belongs to the browser: Alt+Arrow is Back/Forward,
    // Ctrl+Home/End jump the document, Ctrl+0/± is zoom. Consuming them steals a global affordance (#581).
    if (hasModifierKey(event)) return;
    // TODO(#466): flip Left/Right (and re-aim the chevrons) under RTL, to match the inline strip — needs the
    // lightbox dialog opened with direction:rtl so its layout mirrors first. Kept LTR-only until then.
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.prev();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.next();
        break;
      case 'Home':
        event.preventDefault();
        this.setIndex(0);
        break;
      case 'End':
        event.preventDefault();
        this.setIndex(this.count - 1);
        break;
    }
  }
}
