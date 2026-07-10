import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  isDevMode,
  numberAttribute,
} from '@angular/core';
import { CaeDialog, type CaeDialogRef } from 'caelum/dialog';
import { CaeImagePreview, type CaeImagePreviewData } from './image-preview';

/**
 * `cae-image` — a token-styled image with an opt-in full-size preview (`reference/COMPARISON.md`:
 * `p-image` → `cae-image`; Book 11 §3.4, the ★ media family's smallest member). It renders an `<img>`;
 * with `[preview]` set it overlays a focusable trigger that opens a **fullscreen preview** through
 * {@link CaeDialog} (D-15, Book 09 §3.3) with **zoom, rotate, and pan** — the same centered-modal substrate
 * as the galleria lightbox, so Material supplies the focus-trap, `Escape`/backdrop dismissal, and
 * focus-restore to the trigger for free. `preview` defaults to **`false`** (p-image parity — a bare image
 * is inert, so a migrating team's `<p-image>` doesn't silently become a modal trigger).
 *
 * Display-only: an image has no value, so there's no `ControlValueAccessor` (unlike tree-select). The
 * preview's zoom/pan transform is the primitive the galleria lightbox will later share (#289). No foreign
 * media library (Book 11 §3.5 gate 6). Every preview control is keyboard-operable, and pan has an arrow-key
 * path (Book 11 §3.5 non-negotiable #1), so nothing is pointer-only.
 *
 * ```html
 * <cae-image src="/photo.jpg" alt="A wide star field" preview previewAriaLabel="View full-size star field" />
 * ```
 */
@Component({
  selector: 'cae-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cae-image">
      <img
        class="cae-image__img"
        [src]="src()"
        [alt]="alt()"
        [style.width]="width() || null"
        [style.height]="height() || null"
      />
      @if (preview()) {
        <button
          type="button"
          class="cae-image__preview"
          [attr.aria-label]="previewAriaLabel()"
          (click)="openPreview()"
        >
          <span class="cae-image__preview-badge" aria-hidden="true">
            <span class="cae-image__preview-glyph"></span>
          </span>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    .cae-image {
      position: relative;
      display: inline-flex;
      line-height: 0;
    }
    .cae-image__img {
      display: block;
      max-inline-size: 100%;
      height: auto;
    }
    /* The preview trigger covers the image (click anywhere previews, like p-image); the transparent overlay
       never obscures the image. A token-styled magnifier badge (surface + border, like the galleria
       fullscreen button — no scrim, so it stays token-only) is revealed on hover/focus-visible. */
    .cae-image__preview {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 0;
      background: transparent;
      cursor: pointer;
    }
    .cae-image__preview-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: var(--cae-space-2);
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-full);
      background: var(--cae-surface-raised);
      color: var(--cae-color-on-surface);
      opacity: 0;
      transition: opacity var(--cae-motion-fast) ease;
    }
    .cae-image__preview:hover .cae-image__preview-badge,
    .cae-image__preview:focus-visible .cae-image__preview-badge {
      opacity: 1;
    }
    .cae-image__preview:focus-visible .cae-image__preview-badge {
      border-color: var(--cae-color-primary);
    }
    /* Magnifier: a ring plus a short handle, drawn from currentColor — no icon font. */
    .cae-image__preview-glyph {
      display: inline-block;
      position: relative;
      inline-size: 1.1em;
      block-size: 1.1em;
      border: 2px solid currentColor;
      border-radius: var(--cae-radius-full);
    }
    .cae-image__preview-glyph::after {
      content: '';
      position: absolute;
      inset-block-end: -0.35em;
      inset-inline-end: -0.2em;
      inline-size: 0.5em;
      block-size: 2px;
      background: currentColor;
      transform: rotate(45deg);
      transform-origin: inline-start;
    }
  `,
})
export class CaeImage {
  private readonly dialog = inject(CaeDialog);
  /** The open preview ref, or null — guards against stacking a second preview on a double-open. */
  private previewRef: CaeDialogRef<void> | null = null;

  /** The image source. */
  readonly src = input('');
  /** Alt text — required for a meaningful image (WCAG 1.1.1); empty marks a decorative image. */
  readonly alt = input('');
  /** Enable the click-to-preview overlay + fullscreen lightbox. Defaults **off** (p-image parity). */
  readonly preview = input(false, { transform: booleanAttribute });
  /** Optional CSS width/height applied to the `<img>` (a `p-image` passthrough). */
  readonly width = input('');
  readonly height = input('');
  /**
   * Zoom floor / ceiling / step for the preview (defaults: 0.5×–4×, 0.5 steps). Contract:
   * `minZoom ≤ 1 ≤ maxZoom` and `zoomStep > 0` — 1× is the fit/identity the preview opens and resets to; a
   * dev-warn fires if the bounds don't bracket 1.
   */
  readonly minZoom = input(0.5, { transform: numberAttribute });
  readonly maxZoom = input(4, { transform: numberAttribute });
  readonly zoomStep = input(0.5, { transform: numberAttribute });
  /** Accessible names for the trigger and the preview toolbar controls. */
  readonly previewAriaLabel = input('View full-size image');
  readonly controlsAriaLabel = input('Image controls');
  readonly zoomInAriaLabel = input('Zoom in');
  readonly zoomOutAriaLabel = input('Zoom out');
  /** Name for the reset control — it clears zoom AND rotation AND pan, so it's "Reset view", not just zoom. */
  readonly resetAriaLabel = input('Reset view');
  readonly rotateLeftAriaLabel = input('Rotate left');
  readonly rotateRightAriaLabel = input('Rotate right');
  readonly closeAriaLabel = input('Close');
  /** Optional caption shown beneath the image in the preview. */
  readonly caption = input('');

  // No `alt` dev-warn: unlike a gallery item (where `alt` is a required field, so an empty one is a real
  // omission — cae-galleria warns), a standalone image legitimately uses `alt=""` to mark itself
  // decorative (WCAG 1.1.1 / H67). The `<img>` always renders a valid `alt` attribute, and axe verifies
  // the rendered result — a heuristic warn here can only false-positive on intentionally-decorative images.

  constructor() {
    // Dev-only guard: the zoom bounds must bracket the 1× fit/identity the preview opens and resets to
    // (minZoom ≤ 1 ≤ maxZoom, min < max, step > 0). Out-of-range or reversed bounds don't crash but leave
    // the zoom controls silently broken (e.g. reversed bounds dead-lock clamp), so warn only when a preview
    // is actually reachable.
    if (isDevMode()) {
      effect(() => {
        const min = this.minZoom();
        const max = this.maxZoom();
        const step = this.zoomStep();
        if (this.preview() && !(min < max && step > 0 && min <= 1 && max >= 1)) {
          console.warn(
            `cae-image: invalid zoom bounds [minZoom=${min}, maxZoom=${max}, zoomStep=${step}] — the contract is minZoom ≤ 1 ≤ maxZoom with zoomStep > 0 (1× is the fit the preview opens/resets to). The zoom controls may behave unexpectedly.`,
          );
        }
      });
    }
  }

  /**
   * Open the fullscreen preview. Material (via {@link CaeDialog}) supplies the centered modal, focus-trap,
   * `Escape`/backdrop dismissal, and focus-restore to the trigger. No-ops when a preview is already open
   * (no stacking).
   */
  openPreview(): void {
    if (this.previewRef) return;
    this.previewRef = this.dialog.open<CaeImagePreview, void, CaeImagePreviewData>(
      CaeImagePreview,
      {
        // Stable class on the overlay pane — the documented consumer/theme hook for restyling the preview
        // surface; sizing itself is handled by maxWidth.
        panelClass: 'cae-image__preview-panel',
        ariaLabel: this.alt() || 'Image preview',
        maxWidth: '96vw',
        data: {
          src: this.src(),
          alt: this.alt(),
          caption: this.caption() || undefined,
          minZoom: this.minZoom(),
          maxZoom: this.maxZoom(),
          zoomStep: this.zoomStep(),
          labels: {
            controls: this.controlsAriaLabel(),
            zoomIn: this.zoomInAriaLabel(),
            zoomOut: this.zoomOutAriaLabel(),
            reset: this.resetAriaLabel(),
            rotateLeft: this.rotateLeftAriaLabel(),
            rotateRight: this.rotateRightAriaLabel(),
            close: this.closeAriaLabel(),
          },
        },
      },
    );
    // Release the guard when the preview closes (afterClosed emits once, then completes — no leak).
    this.previewRef.afterClosed().subscribe(() => (this.previewRef = null));
  }
}
