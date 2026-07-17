import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CAE_DIALOG_DATA, injectCaeDialogRef } from 'caelum/dialog';

/** Accessible names for the preview toolbar — passed down from {@link CaeImage} so every control is nameable. */
export interface CaeImagePreviewLabels {
  /** Accessible name for the toolbar group as a whole. */
  controls: string;
  zoomIn: string;
  zoomOut: string;
  /** The reset control clears zoom + rotation + pan — name it accordingly ("Reset view"). */
  reset: string;
  rotateLeft: string;
  rotateRight: string;
  close: string;
}

/**
 * Payload {@link CaeImage.openPreview} hands the lightbox through {@link CAE_DIALOG_DATA}. The image is a
 * snapshot (a lightbox views one picture for its lifetime); the zoom bounds and labels come from the
 * opener's inputs so a consumer configures the preview from the `cae-image` tag.
 */
export interface CaeImagePreviewData {
  src: string;
  alt: string;
  caption?: string;
  /** Zoom floor / ceiling / step — the opener's `minZoom`/`maxZoom`/`zoomStep` inputs. */
  minZoom: number;
  maxZoom: number;
  zoomStep: number;
  labels: CaeImagePreviewLabels;
}

/** The keyboard pan step, in CSS pixels (arrow keys nudge the image by this much). */
const PAN_STEP = 32;

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(v, max));

/**
 * The fullscreen image viewer {@link CaeImage} opens through {@link CaeDialog} (D-15, Book 09 §3.3) — the
 * same centered-modal substrate as the galleria lightbox (NOT tree-select's `cdkConnectedOverlay`; a
 * lightbox is centered, not trigger-anchored). Material supplies the focus-trap, `Escape`/backdrop
 * dismissal, and focus-restore to the opener for free (Book 09 §2.2 beats 3–5), so this component owns
 * only the picture, its zoom/rotate/pan transform, and a labeled control group. It carries no
 * `@angular/material` import (`CAE_DIALOG_DATA` / {@link injectCaeDialogRef} are the seams). Not exported:
 * a preview is reached only via {@link CaeImage.openPreview}.
 *
 * **Every pointer gesture has a keyboard path** (Book 11 §3.5 non-negotiable #1): the toolbar buttons
 * zoom/rotate/reset, and arrow keys pan the zoomed image — so pan is not drag-only. The pan pointer
 * drag is a progressive enhancement over that keyboard path.
 */
@Component({
  selector: 'cae-image-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Zoom/reset/pan keys are caught on the HOST so they work wherever focus sits among the trapped toolbar
  // buttons, without making the (non-interactive) image viewport a tab stop. `Escape` is Material's own
  // dismissal (this handler never touches it).
  host: { '(keydown)': 'onKeydown($event)' },
  template: `
    <div class="cae-image-preview">
      <div class="cae-image-preview__toolbar" role="group" [attr.aria-label]="data.labels.controls">
        <button
          type="button"
          class="cae-image-preview__btn"
          [attr.aria-label]="data.labels.zoomOut"
          [attr.aria-disabled]="atMinZoom() ? 'true' : null"
          (click)="zoomOut()"
        >
          <span
            class="cae-image-preview__glyph cae-image-preview__glyph--minus"
            aria-hidden="true"
          ></span>
        </button>
        <button
          type="button"
          class="cae-image-preview__btn"
          [attr.aria-label]="data.labels.zoomIn"
          [attr.aria-disabled]="atMaxZoom() ? 'true' : null"
          (click)="zoomIn()"
        >
          <span
            class="cae-image-preview__glyph cae-image-preview__glyph--plus"
            aria-hidden="true"
          ></span>
        </button>
        <button
          type="button"
          class="cae-image-preview__btn"
          [attr.aria-label]="data.labels.rotateLeft"
          (click)="rotateLeft()"
        >
          <span
            class="cae-image-preview__glyph cae-image-preview__glyph--rotate cae-image-preview__glyph--rotate-left"
            aria-hidden="true"
          ></span>
        </button>
        <button
          type="button"
          class="cae-image-preview__btn"
          [attr.aria-label]="data.labels.rotateRight"
          (click)="rotateRight()"
        >
          <span
            class="cae-image-preview__glyph cae-image-preview__glyph--rotate cae-image-preview__glyph--rotate-right"
            aria-hidden="true"
          ></span>
        </button>
        <button
          type="button"
          class="cae-image-preview__btn"
          [attr.aria-label]="data.labels.reset"
          [attr.aria-disabled]="atIdentity() ? 'true' : null"
          (click)="reset()"
        >
          <span
            class="cae-image-preview__glyph cae-image-preview__glyph--reset"
            aria-hidden="true"
          ></span>
        </button>
        <button
          type="button"
          class="cae-image-preview__btn cae-image-preview__btn--close"
          [attr.aria-label]="data.labels.close"
          (click)="close()"
        >
          <span
            class="cae-image-preview__glyph cae-image-preview__glyph--close"
            aria-hidden="true"
          ></span>
        </button>
      </div>

      <!-- figure/figcaption programmatically ties the caption to the image (WCAG 1.3.1), mirroring the
           galleria lightbox — not a bare sibling <p>. -->
      <figure class="cae-image-preview__figure">
        <div
          class="cae-image-preview__viewport"
          (pointerdown)="onPanStart($event)"
          (pointermove)="onPanMove($event)"
          (pointerup)="onPanEnd()"
          (pointercancel)="onPanEnd()"
        >
          <img
            class="cae-image-preview__image"
            [class.cae-image-preview__image--panning]="panning()"
            [src]="data.src"
            [alt]="data.alt"
            [style.transform]="transform()"
            draggable="false"
          />
        </div>
        @if (data.caption) {
          <figcaption class="cae-image-preview__caption">{{ data.caption }}</figcaption>
        }
      </figure>

      <!-- The zoom level is announced by a polite live region. ARIA announces CHANGES, so the initial 100%
           on open is silent and each zoom/reset reads "Zoom N%" (the library convention is an in-template
           live region, as in the galleria lightbox — no LiveAnnouncer service). -->
      <div class="cae-image-preview__sr-status" aria-live="polite" aria-atomic="true">
        {{ zoomStatus() }}
      </div>
    </div>
  `,
  styles: `
    .cae-image-preview {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--cae-space-3);
      min-inline-size: min(70vw, 48rem);
    }
    .cae-image-preview__toolbar {
      display: flex;
      gap: var(--cae-space-2);
      align-self: flex-end;
    }
    /* Control buttons: token-styled, glyphs drawn from currentColor — no icon font. */
    .cae-image-preview__btn {
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
    /* Ends use aria-disabled (not the disabled property) so the focused button KEEPS focus instead of
       blurring to <body> when it dims at a zoom limit (WCAG 2.4.3); the handlers already no-op there. */
    .cae-image-preview__btn[aria-disabled='true'] {
      color: var(--cae-color-on-surface-variant);
      opacity: 0.5;
      cursor: default;
    }
    .cae-image-preview__btn:not([aria-disabled='true']):hover {
      border-color: var(--cae-color-primary);
    }
    .cae-image-preview__figure {
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--cae-space-2);
      min-inline-size: 0;
    }
    .cae-image-preview__viewport {
      display: flex;
      align-items: center;
      justify-content: center;
      max-inline-size: 100%;
      max-block-size: 78vh;
      overflow: hidden;
      touch-action: none;
    }
    .cae-image-preview__image {
      display: block;
      max-inline-size: 100%;
      max-block-size: 78vh;
      object-fit: contain;
      transform-origin: center center;
      cursor: grab;
      /* Pointer pan is a progressive enhancement; the keyboard arrow-pan path is the accessible route. */
      user-select: none;
    }
    .cae-image-preview__image--panning {
      cursor: grabbing;
    }
    .cae-image-preview__caption {
      margin: 0;
      text-align: center;
      color: var(--cae-color-on-surface-variant);
    }
    .cae-image-preview__glyph {
      display: inline-block;
      position: relative;
      inline-size: 0.8em;
      block-size: 0.8em;
    }
    /* + / − : bars from currentColor. */
    .cae-image-preview__glyph--plus::before,
    .cae-image-preview__glyph--plus::after,
    .cae-image-preview__glyph--minus::before {
      content: '';
      position: absolute;
      inset-block-start: 50%;
      inset-inline-start: 0;
      inline-size: 100%;
      block-size: 2px;
      transform: translateY(-50%);
      background: currentColor;
    }
    .cae-image-preview__glyph--plus::after {
      inline-size: 2px;
      block-size: 100%;
      inset-inline-start: 50%;
      inset-block-start: 0;
      transform: translateX(-50%);
    }
    /* Reset: a small square outline (the aria-label carries the meaning). */
    .cae-image-preview__glyph--reset {
      border: 2px solid currentColor;
      border-radius: var(--cae-radius-sm);
    }
    /* Rotate: a three-quarter ring with an arrowhead, drawn from currentColor. */
    .cae-image-preview__glyph--rotate {
      border: 2px solid currentColor;
      border-radius: var(--cae-radius-full);
      border-block-start-color: transparent;
    }
    .cae-image-preview__glyph--rotate::after {
      content: '';
      position: absolute;
      inline-size: 0.3em;
      block-size: 0.3em;
      border-block-start: 2px solid currentColor;
      border-inline-end: 2px solid currentColor;
      inset-block-start: -1px;
    }
    .cae-image-preview__glyph--rotate-right::after {
      inset-inline-end: -1px;
      transform: rotate(45deg);
    }
    .cae-image-preview__glyph--rotate-left::after {
      inset-inline-start: -1px;
      transform: rotate(-135deg);
    }
    /* Close: an ✕ from two currentColor bars. */
    .cae-image-preview__glyph--close::before,
    .cae-image-preview__glyph--close::after {
      content: '';
      position: absolute;
      inset-block-start: 50%;
      inset-inline-start: 0;
      inline-size: 100%;
      block-size: 2px;
      background: currentColor;
    }
    .cae-image-preview__glyph--close::before {
      transform: rotate(45deg);
    }
    .cae-image-preview__glyph--close::after {
      transform: rotate(-45deg);
    }
    /* Zoom announcement is screen-reader-only — visually hidden, not display:none (which would drop it
       from the a11y tree). */
    .cae-image-preview__sr-status {
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
export class CaeImagePreview {
  /** The opener's payload — the image snapshot, zoom bounds, and control labels. */
  protected readonly data = inject(CAE_DIALOG_DATA) as CaeImagePreviewData;
  private readonly ref = injectCaeDialogRef<void>();

  /** The zoom scale (1 = fit). Clamped to `[minZoom, maxZoom]`. */
  protected readonly scale = signal(1);
  /** Rotation in degrees (multiples of 90). */
  protected readonly rotation = signal(0);
  /** Pan offset in CSS pixels, applied in screen space (outermost transform). */
  protected readonly pan = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  /** True while a pointer drag-pan is in progress (swaps the grab/grabbing cursor). */
  protected readonly panning = signal(false);

  protected readonly atMinZoom = computed(() => this.scale() <= this.data.minZoom);
  protected readonly atMaxZoom = computed(() => this.scale() >= this.data.maxZoom);
  /** At the untransformed identity (nothing to reset) — dims the reset button, keeping its focus. */
  protected readonly atIdentity = computed(
    () => this.scale() === 1 && this.rotation() === 0 && this.pan().x === 0 && this.pan().y === 0,
  );

  /** `translate() scale() rotate()` — translate is outermost so pan is in screen pixels regardless of zoom. */
  protected readonly transform = computed(() => {
    const { x, y } = this.pan();
    return `translate(${x}px, ${y}px) scale(${this.scale()}) rotate(${this.rotation()}deg)`;
  });

  /** The polite live-region text — "Zoom N%" (initial 100% is silent; announced only on change). */
  protected readonly zoomStatus = computed(() => `Zoom ${Math.round(this.scale() * 100)}%`);

  protected zoomIn(): void {
    this.scale.set(clamp(this.scale() + this.data.zoomStep, this.data.minZoom, this.data.maxZoom));
  }

  protected zoomOut(): void {
    this.scale.set(clamp(this.scale() - this.data.zoomStep, this.data.minZoom, this.data.maxZoom));
  }

  // Rotation is normalized to (-360, 360) so a full turn returns to exactly 0 — otherwise `atIdentity`
  // would stay false (and Reset stay lit) after four turns even though the image looks unrotated.
  protected rotateLeft(): void {
    this.rotation.update((r) => (r - 90) % 360);
  }

  protected rotateRight(): void {
    this.rotation.update((r) => (r + 90) % 360);
  }

  /** Back to fit: scale 1, no rotation, no pan. */
  protected reset(): void {
    this.scale.set(1);
    this.rotation.set(0);
    this.pan.set({ x: 0, y: 0 });
  }

  /** Close the preview. `Escape`/backdrop close the same way (Material); focus restores to the opener. */
  protected close(): void {
    this.ref.close();
  }

  // --- Pointer drag-pan (a progressive enhancement over the arrow-key pan path) ---
  private lastX = 0;
  private lastY = 0;

  protected onPanStart(event: PointerEvent): void {
    this.panning.set(true);
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    // Capture so the drag continues if the pointer leaves the viewport. Guarded: jsdom (and a synthetic
    // MouseEvent dispatched in a test) may lack pointerId / setPointerCapture.
    if (event.pointerId != null) {
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    }
    event.preventDefault();
  }

  protected onPanMove(event: PointerEvent): void {
    if (!this.panning()) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.pan.update((p) => ({ x: p.x + dx, y: p.y + dy }));
  }

  protected onPanEnd(): void {
    this.panning.set(false);
  }

  /**
   * Keyboard controls while the modal is focused: `+`/`-` zoom, `0` reset, arrow keys pan (the accessible
   * pan path). `Escape` is Material's dismissal (untouched here).
   */
  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case '+':
      case '=':
        event.preventDefault();
        this.zoomIn();
        break;
      case '-':
      case '_':
        event.preventDefault();
        this.zoomOut();
        break;
      case '0':
        event.preventDefault();
        this.reset();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.pan.update((p) => ({ x: p.x - PAN_STEP, y: p.y }));
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.pan.update((p) => ({ x: p.x + PAN_STEP, y: p.y }));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.pan.update((p) => ({ x: p.x, y: p.y - PAN_STEP }));
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.pan.update((p) => ({ x: p.x, y: p.y + PAN_STEP }));
        break;
    }
  }
}
