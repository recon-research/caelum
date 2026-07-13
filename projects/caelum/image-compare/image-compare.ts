import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  isDevMode,
  model,
  numberAttribute,
  OnInit,
  viewChild,
} from '@angular/core';
import { Directionality } from '@angular/cdk/bidi';

/** PageUp/PageDown coarse step, in percentage points (arrow keys use the finer `step` input). */
const PAGE_STEP = 10;

/** Clamp into `[min, max]`; a non-finite input (`NaN`) collapses to `min` so it can't poison the model. */
const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.max(min, Math.min(v, max)) : min;

/**
 * `cae-image-compare` — a before/after reveal slider (`p-imagecompare` parity, Book 11 §3.4; the niche
 * media-family member split out of #275 as #293). Two same-sized images are stacked; a draggable divider
 * clips the top ("before") image so the bottom ("after") image shows through on the trailing side.
 *
 * **The divider is the APG *window splitter* pattern** (Book 11 §3.2 — the same separator work `cae-splitter`
 * will need): a focusable `role="separator"` with `aria-orientation`, `aria-valuenow/min/max`, and a full
 * **keyboard resize path** (Book 11 §3.5 non-negotiable #1) — a mouse-only reveal fails parity. Left/Right
 * nudge by `step` (the APG minimum for a vertical separator), Home/End snap, PageUp/Down step coarsely, and
 * Up/Down mirror Left/Right as a convenience. The drag axis and the horizontal
 * arrow keys resolve through {@link Directionality} for RTL (Book 04 §3.5): the reveal is always measured
 * from the inline-**start** edge, so in RTL "before" reveals from the right and Left/Right invert.
 *
 * **No LiveAnnouncer** (unlike the drag-drop cluster's move announcements, Book 11 §3.5 #2): the reveal % is
 * a *continuous* value on a focusable separator, so `aria-valuenow`/`aria-valuetext` are announced by the SR
 * on each keyboard change exactly like a slider thumb — a parallel live region would double-announce (the
 * ticket's "if warranted" → not warranted).
 *
 * **No foreign drag library** (Book 11 §3.5 #6, D-11): the pointer drag is native Pointer Events +
 * `setPointerCapture` — a reveal tracks a pointer *position*, not a repositioned element, so `cdkDrag`
 * (built for reorder/free-drag with its own transform) would be the wrong, heavier tool here. State lives in
 * a signal (`value`, zoneless — Book 11 §3.5 #4); rendering is declarative (a `clip-path` computed + a
 * logical `inset-inline-start`), so there is no imperative caret/value juggling like the masked input.
 *
 * **Two `src`/`alt` inputs, not content projection** — rendering the `<img>`s here (vs projecting the
 * consumer's) keeps them fully stylable to overlap exactly and lets the component own the `alt` text; the
 * arbitrary-content variant is a parity extra (deferred). The images should share an aspect ratio.
 *
 * Ships as its own entry point `caelum/image-compare` (the ticket's flagged fork — a distinct substrate
 * from the `caelum/image` dialog-lightbox, so it is not folded in). Token-only styling (Book 04 §3.6).
 * Deferred parity extras (vertical orientation, click-the-track-to-jump, a content-projection variant, an
 * i18n `aria-valuetext` formatter) are tracked in #318.
 */
@Component({
  selector: 'cae-image-compare',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'cae-image-compare' },
  template: `
    <div #track class="cae-image-compare__track">
      <!-- Base ("after"): in flow, defines the box; fully visible underneath. -->
      <img class="cae-image-compare__img" [src]="afterSrc()" [alt]="afterAlt()" draggable="false" />
      <!-- Revealed ("before"): absolute overlay, clipped to show only pct% from the inline-start edge. -->
      <img
        class="cae-image-compare__img cae-image-compare__img--before"
        [src]="beforeSrc()"
        [alt]="beforeAlt()"
        [style.clip-path]="clipPath()"
        draggable="false"
      />
      <!-- The divider: an APG window-splitter separator — focusable and keyboard-resizable. -->
      <div
        class="cae-image-compare__divider"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-valuenow]="rounded()"
        [attr.aria-valuetext]="valueText()"
        [attr.aria-label]="ariaLabel() || null"
        [style.inset-inline-start.%]="pct()"
        (keydown)="onKeydown($event)"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp()"
        (pointercancel)="onPointerUp()"
      >
        <span class="cae-image-compare__handle" aria-hidden="true"></span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-image-compare__track {
      position: relative;
      display: block;
      overflow: hidden;
      inline-size: 100%;
      line-height: 0;
    }
    .cae-image-compare__img {
      display: block;
      inline-size: 100%;
      block-size: auto;
      user-select: none;
    }
    /* The revealed layer overlays the base exactly; images should share an aspect ratio. */
    .cae-image-compare__img--before {
      position: absolute;
      inset: 0;
      block-size: 100%;
      object-fit: cover;
    }
    .cae-image-compare__divider {
      position: absolute;
      inset-block: 0;
      inline-size: 2px;
      transform: translateX(-50%);
      background: var(--cae-color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: ew-resize;
      /* Touch-drag the divider resizes; it must not scroll the page. */
      touch-action: none;
    }
    .cae-image-compare__handle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      inline-size: var(--cae-space-6);
      block-size: var(--cae-space-6);
      border-radius: var(--cae-radius-full);
      border: 2px solid var(--cae-color-primary);
      background: var(--cae-surface-raised);
      color: var(--cae-color-primary);
    }
    /* ◄ ► chevrons drawn from currentColor — no icon font. Logical borders mirror under RTL. */
    .cae-image-compare__handle::before,
    .cae-image-compare__handle::after {
      content: '';
      inline-size: 0;
      block-size: 0;
      border-block: 4px solid transparent;
    }
    .cae-image-compare__handle::before {
      border-inline-end: 6px solid currentColor;
    }
    .cae-image-compare__handle::after {
      border-inline-start: 6px solid currentColor;
    }
    /* Focus lands on the (thin) separator — surface the ring on the grip so it's visible over the images. */
    .cae-image-compare__divider:focus-visible {
      outline: none;
    }
    .cae-image-compare__divider:focus-visible .cae-image-compare__handle {
      outline: 2px solid var(--cae-color-primary);
      outline-offset: 2px;
      /* A surface-coloured halo under the outline keeps the ring visible over any image backdrop. */
      box-shadow: 0 0 0 4px var(--cae-surface-raised);
    }
  `,
})
export class CaeImageCompare implements OnInit {
  /**
   * Resolves the drag/keyboard axis for RTL (Book 04 §3.5). Root-provided; defaults to 'ltr'.
   * Reads the signal-backed `Directionality.value` directly (reactive on both the root service and a
   * `Dir` ancestor) rather than `toSignal(change, {initialValue})`: the change-based idiom snapshots
   * 'ltr' at construction and misses a *born-rtl* `[dir]` binding (the setter emits `change` only after
   * `ngAfterContentInit`), which — because the reveal axis is measured off `isRtl()` — mis-measures on
   * first paint, not just mis-clips the layer. Mirrors cae-pick-list (#364).
   */
  private readonly directionality = inject(Directionality);
  protected readonly isRtl = computed(() => this.directionality.value === 'rtl');

  /** The revealed image (top layer, clipped from the inline-start edge). */
  readonly beforeSrc = input.required<string>();
  readonly beforeAlt = input('');
  /** The base image (underneath, fully visible on the trailing side). */
  readonly afterSrc = input.required<string>();
  readonly afterAlt = input('');

  /**
   * Reveal position, 0–100 (% of the "before" image shown, measured from the inline-start edge). Two-way
   * bindable; an out-of-range or non-finite write is normalized back into [0, 100] (the constructor effect),
   * so a consumer reading `value()` back always sees the position the UI renders.
   */
  readonly value = model<number>(50);
  /** Arrow-key nudge in percentage points (Home/End snap to 0/100; PageUp/Down step by 10). */
  readonly step = input(1, { transform: numberAttribute });
  /** Accessible name for the divider separator — required for a focusable separator; dev-warns if absent. */
  readonly ariaLabel = input<string>();

  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  /** True only while THIS divider's pointer drag is active (set on primary-button pointerdown). */
  private dragging = false;

  constructor() {
    // Normalize an out-of-range or non-finite two-way write back into [0, 100] so a consumer reading
    // `value()` back sees the same position the UI shows (mat-slider clamps its model the same way). The
    // `v !== c` guard stops the effect re-triggering once the value is already in range (and clears a NaN).
    effect(() => {
      const v = this.value();
      const c = clamp(v, 0, 100);
      if (v !== c) this.value.set(c);
    });
  }

  /** The rendered position, clamped so an out-of-range two-way write can't overflow the reveal. */
  protected readonly pct = computed(() => clamp(this.value(), 0, 100));
  /** Integer for `aria-valuenow` (fractional steps still store precisely in `value`). */
  protected readonly rounded = computed(() => Math.round(this.pct()));
  /** `aria-valuetext` — the percentage only (locale-neutral; the `ariaLabel` names what is being revealed). */
  protected readonly valueText = computed(() => `${this.rounded()}%`);

  /**
   * Clip the "before" layer to show `pct%` from the inline-start edge. `clip-path: inset()` takes PHYSICAL
   * edges (it has no logical form), so the hidden side is resolved through {@link Directionality}: LTR hides
   * the right, RTL hides the left. The divider uses logical `inset-inline-start` and needs no such flip.
   */
  protected readonly clipPath = computed(() => {
    const hidden = 100 - this.pct();
    return this.isRtl() ? `inset(0 0 0 ${hidden}%)` : `inset(0 ${hidden}% 0 0)`;
  });

  ngOnInit(): void {
    if (!isDevMode()) return;
    if (!this.ariaLabel()?.trim()) {
      console.warn(
        '[cae-image-compare] No accessible name: pass [ariaLabel] so the focusable divider ' +
          '(role="separator") is announced (e.g. "Reveal comparison"). WCAG 4.1.2.',
      );
    }
    // A comparison whose BOTH images are alt-less is contentless to assistive tech — the separator alone
    // says "N%" with no indication of what is being compared. (One empty alt may be legitimately decorative.)
    if (!this.beforeAlt().trim() && !this.afterAlt().trim()) {
      console.warn(
        '[cae-image-compare] Both images have empty alt text — a comparison with no alt on either image ' +
          'is invisible to assistive tech. Pass [beforeAlt]/[afterAlt] (WCAG 1.1.1).',
      );
    }
    if (!(this.step() > 0)) {
      console.warn(
        `[cae-image-compare] [step] should be a positive number; got ${this.step()}. ` +
          'The arrow keys will not resize the divider.',
      );
    }
  }

  /** The accessible resize path (Book 11 §3.5 non-negotiable #1). Left/Right invert under RTL. */
  protected onKeydown(event: KeyboardEvent): void {
    const s = this.step();
    const rtl = this.isRtl();
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = this.pct() + (rtl ? -s : s);
        break;
      case 'ArrowLeft':
        next = this.pct() + (rtl ? s : -s);
        break;
      case 'ArrowUp':
        next = this.pct() + s;
        break;
      case 'ArrowDown':
        next = this.pct() - s;
        break;
      case 'PageUp':
        next = this.pct() + PAGE_STEP;
        break;
      case 'PageDown':
        next = this.pct() - PAGE_STEP;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = 100;
        break;
      default:
        return; // leave Tab and every other key alone
    }
    event.preventDefault();
    this.setPct(next);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return; // primary button only (a right/middle click must not move the divider)
    this.dragging = true;
    const target = event.currentTarget as HTMLElement | null;
    // Capture so the drag continues while the pointer strays off the thin divider. Guarded: jsdom (and a
    // synthetic event dispatched in a test) may lack pointerId / setPointerCapture.
    if (event.pointerId != null) {
      target?.setPointerCapture?.(event.pointerId);
    }
    // Focus the divider so the keyboard resize path works immediately after a mouse drag. `pointerdown`'s
    // preventDefault (below) doesn't block focus, but this makes it deterministic across browsers.
    target?.focus?.();
    event.preventDefault();
    this.moveTo(event.clientX);
  }

  protected onPointerMove(event: PointerEvent): void {
    // Only track moves that belong to THIS divider's active drag (set on pointerdown, cleared on up/cancel)
    // — a `buttons`-only guard would also honor an unrelated cross-element drag passing over the divider.
    if (!this.dragging) return;
    this.moveTo(event.clientX);
  }

  protected onPointerUp(): void {
    this.dragging = false;
  }

  /** Map a client X to a reveal %, measured from the inline-start edge (right edge under RTL). */
  private moveTo(clientX: number): void {
    const rect = this.track().nativeElement.getBoundingClientRect();
    if (rect.width === 0) return;
    const fromStart = this.isRtl() ? rect.right - clientX : clientX - rect.left;
    this.setPct((fromStart / rect.width) * 100);
  }

  private setPct(next: number): void {
    this.value.set(clamp(next, 0, 100));
  }
}
