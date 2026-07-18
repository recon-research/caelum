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
 * shares): a focusable `role="separator"` with `aria-orientation`, `aria-valuenow/min/max`, and a full
 * **keyboard resize path** (Book 11 §3.5 non-negotiable #1) — a mouse-only reveal fails parity. The primary
 * axis follows `[layout]`: horizontal (default) reveals left↔right (Left/Right nudge by `step`, Up/Down a
 * convenience mirror); vertical stacks the plates and reveals top↔bottom (Down/Up primary, Left/Right the
 * mirror). Home/End snap, PageUp/Down step coarsely. The horizontal drag axis and its arrow keys resolve
 * through {@link Directionality} for RTL (Book 04 §3.5): the reveal is measured from the inline-**start**
 * edge, so in RTL "before" reveals from the right and Left/Right invert; the vertical (block) axis is
 * direction-independent.
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
 * arbitrary-content variant is a parity extra (deferred to #422). The images should share an aspect ratio.
 *
 * Ships as its own entry point `caelum/image-compare` (the ticket's flagged fork — a distinct substrate
 * from the `caelum/image` dialog-lightbox, so it is not folded in). Token-only styling (Book 04 §3.6).
 * Vertical orientation (`[layout]`), click-the-track-to-jump (the pointer surface is the whole track), and
 * an optional i18n `aria-valuetext` formatter all shipped (#318); the content-projection variant is #422.
 */
@Component({
  selector: 'cae-image-compare',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'cae-image-compare',
    '[class.cae-image-compare--vertical]': "layout() === 'vertical'",
  },
  template: `
    <div
      #track
      class="cae-image-compare__track"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp()"
      (pointercancel)="onPointerUp()"
    >
      <!-- Base ("after"): in flow, defines the box; fully visible underneath. -->
      <img class="cae-image-compare__img" [src]="afterSrc()" [alt]="afterAlt()" draggable="false" />
      <!-- Revealed ("before"): absolute overlay, clipped to show pct% from the start edge (inline-start
           when horizontal, block-start/top when vertical). -->
      <img
        class="cae-image-compare__img cae-image-compare__img--before"
        [src]="beforeSrc()"
        [alt]="beforeAlt()"
        [style.clip-path]="clipPath()"
        draggable="false"
      />
      <!-- The divider: an APG window-splitter separator — focusable and keyboard-resizable. The pointer
           drag lives on the #track (above) so a press ANYWHERE on the track jumps the divider there and
           drags from it (slider-track-click UX, #318); the divider only carries the keyboard path. -->
      <div
        #divider
        class="cae-image-compare__divider"
        role="separator"
        tabindex="0"
        [attr.aria-orientation]="orientation()"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-valuenow]="rounded()"
        [attr.aria-valuetext]="valueText()"
        [attr.aria-label]="ariaLabel() || null"
        [style.inset-inline-start.%]="layout() === 'vertical' ? null : pct()"
        [style.inset-block-start.%]="layout() === 'vertical' ? pct() : null"
        (keydown)="onKeydown($event)"
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
      /* The track is the whole drag/jump surface (press anywhere to jump + drag): the resize cursor cues
         that affordance, and touch-action:none stops a touch-drag from scrolling the page. Both reach the
         divider/handle/images inside — cursor inherits, touch-action intersects down the subtree. */
      cursor: ew-resize;
      touch-action: none;
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
    }
    /* NOT a hit-target gap, despite being a drag-shaped affordance (audited in #456): the pointer target
       is the whole __track (press-anywhere jump + drag, #318) — this handle is aria-hidden decoration with
       no handlers of its own, so WCAG 2.5.8 is measured against the track. Do not "floor" it: a
       min-inline-size here would override the flex automatic minimum and silently resize it (#546, which
       also tracks the fact that it does not render at the size these declarations imply). PATTERNS.md §10. */
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
    /* --- Vertical layout: a full-width horizontal divider revealing top↔bottom. --- */
    /* The reveal axis is now block, so the whole surface cues ns-resize (inherits to the divider). */
    :host(.cae-image-compare--vertical) .cae-image-compare__track {
      cursor: ns-resize;
    }
    :host(.cae-image-compare--vertical) .cae-image-compare__divider {
      inset-block: auto;
      inset-inline: 0;
      inline-size: auto;
      block-size: 2px;
      transform: translateY(-50%);
    }
    /* Re-point the horizontal chevrons to up/down: the reveal axis is now block, so the triangles point
       along it. border-block:0 clears the horizontal-mode transparent caps; border-inline becomes the new
       transparent sides; the colored border moves to the block edge. */
    :host(.cae-image-compare--vertical) .cae-image-compare__handle::before,
    :host(.cae-image-compare--vertical) .cae-image-compare__handle::after {
      border-block: 0;
      border-inline: 4px solid transparent;
    }
    :host(.cae-image-compare--vertical) .cae-image-compare__handle::before {
      border-block-end: 6px solid currentColor;
    }
    :host(.cae-image-compare--vertical) .cae-image-compare__handle::after {
      border-block-start: 6px solid currentColor;
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

  /** The revealed image (top layer, clipped from the start edge — inline-start horizontal, block-start vertical). */
  readonly beforeSrc = input.required<string>();
  readonly beforeAlt = input('');
  /** The base image (underneath, fully visible on the trailing side). */
  readonly afterSrc = input.required<string>();
  readonly afterAlt = input('');

  /**
   * Reveal position, 0–100 (% of the "before" image shown, measured from the start edge — inline-start when
   * horizontal, block-start (top) when vertical). Two-way
   * bindable; an out-of-range or non-finite write is normalized back into [0, 100] (the constructor effect),
   * so a consumer reading `value()` back always sees the position the UI renders.
   */
  readonly value = model<number>(50);
  /** Arrow-key nudge in percentage points (Home/End snap to 0/100; PageUp/Down step by 10). */
  readonly step = input(1, { transform: numberAttribute });
  /**
   * Optional formatter for the divider's `aria-valuetext` — localize or enrich the announced string
   * (e.g. `(pct) => \`${pct}% revealed\``, or a `$localize` template). Receives the rounded integer
   * percentage; defaults to a locale-neutral `"N%"` when unset (or if it returns an empty string).
   * (#318; family-wide i18n tracked separately.)
   */
  readonly valueTextFormatter = input<(pct: number) => string>();
  /** Accessible name for the divider separator — required for a focusable separator; dev-warns if absent. */
  readonly ariaLabel = input<string>();
  /**
   * Reveal axis. `horizontal` (default) reveals left↔right with a vertical divider (the separator's
   * `aria-orientation` is `vertical`); `vertical` stacks the plates and reveals top↔bottom with a horizontal
   * divider (`aria-orientation="horizontal"`, Down/Up the primary keys). Mirrors the `cae-splitter` `[layout]`
   * vocabulary — and its counterintuitive separator convention (the divider's orientation is the inverse of
   * the reveal axis; #293/#318). The block (vertical) axis is direction-independent, so RTL affects the
   * horizontal reveal only.
   */
  readonly layout = input<'horizontal' | 'vertical'>('horizontal');

  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  /** The separator element — focused on a track press so the keyboard path works right after a click/drag. */
  private readonly divider = viewChild.required<ElementRef<HTMLElement>>('divider');
  /** True only while THIS component's pointer drag is active (set on primary-button pointerdown). */
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
  /**
   * `aria-valuetext` — a `[valueTextFormatter]` output when supplied (i18n / enriched, #318), else the
   * locale-neutral `"N%"` (the `ariaLabel` names *what* is being revealed). A formatter that returns an
   * empty string also falls back to `"N%"`, so `aria-valuetext` is never present-but-empty (some SRs
   * announce an empty `aria-valuetext` as no value at all).
   */
  protected readonly valueText = computed(() => {
    const pct = this.rounded();
    return this.valueTextFormatter()?.(pct) || `${pct}%`;
  });

  /**
   * The separator's `aria-orientation` — the INVERSE of the reveal axis (APG window-splitter convention,
   * confirmed by the #293 a11y review): a divider dragged left/right (horizontal reveal) is a *vertical*
   * separator; one dragged up/down (vertical reveal) is *horizontal*. Mirrors `cae-splitter`. Branches on
   * `=== 'vertical'` (not `'horizontal'`) so an out-of-union value's announced orientation matches the
   * horizontal *behavior* the rest of the component falls back to for that value.
   */
  protected readonly orientation = computed(() =>
    this.layout() === 'vertical' ? 'horizontal' : 'vertical',
  );

  /**
   * Clip the "before" layer to show `pct%` from the start edge. `clip-path: inset()` takes PHYSICAL edges
   * (it has no logical form). Horizontal reveals from the inline-start edge, so the hidden side is resolved
   * through {@link Directionality}: LTR hides the right, RTL hides the left. Vertical reveals from the
   * block-start (top) edge and hides the bottom — the block axis is direction-independent, so no RTL flip.
   */
  protected readonly clipPath = computed(() => {
    const hidden = 100 - this.pct();
    if (this.layout() === 'vertical') return `inset(0 0 ${hidden}% 0)`;
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

  /**
   * The accessible resize path (Book 11 §3.5 non-negotiable #1). The primary axis follows `[layout]`:
   * horizontal → Left/Right (inverted under RTL), vertical → Down/Up (grow/shrink the top reveal). The
   * cross-axis arrows stay wired as a convenience mirror (Up/Down in horizontal, Right/Left in vertical);
   * PageUp/PageDown track the primary axis coarsely; Home/End snap to 0/100. Only the *horizontal* keys
   * invert under RTL — the vertical (block) reveal axis and its Right/Left mirror are direction-independent.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const s = this.step();
    const rtl = this.isRtl();
    const vertical = this.layout() === 'vertical';
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = this.pct() + (vertical ? s : rtl ? -s : s);
        break;
      case 'ArrowLeft':
        next = this.pct() + (vertical ? -s : rtl ? s : -s);
        break;
      case 'ArrowUp':
        next = this.pct() + (vertical ? -s : s);
        break;
      case 'ArrowDown':
        next = this.pct() + (vertical ? s : -s);
        break;
      case 'PageUp':
        // Coarse primary-axis arrow (ArrowRight horizontal, ArrowUp vertical) — same sign as that fine
        // key so the two never disagree: horizontal inverts under RTL (physical-right is the low-reveal
        // start edge), vertical is direction-independent.
        next = this.pct() + (vertical ? -PAGE_STEP : rtl ? -PAGE_STEP : PAGE_STEP);
        break;
      case 'PageDown':
        next = this.pct() + (vertical ? PAGE_STEP : rtl ? PAGE_STEP : -PAGE_STEP);
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
    // Capture on the track (the surface the handlers live on) so the drag continues while the pointer
    // strays off it. Guarded: jsdom (and a synthetic event dispatched in a test) may lack pointerId /
    // setPointerCapture.
    const track = event.currentTarget as HTMLElement | null;
    if (event.pointerId != null) {
      track?.setPointerCapture?.(event.pointerId);
    }
    // Focus the DIVIDER (not the pressed track) so the keyboard resize path works immediately after a
    // click/drag anywhere on the track. `pointerdown`'s preventDefault (below) doesn't block focus, but
    // this makes it deterministic across browsers — and necessary now the press can land off the divider.
    this.divider().nativeElement.focus();
    event.preventDefault();
    this.moveFromPointer(event);
  }

  protected onPointerMove(event: PointerEvent): void {
    // Only track moves that belong to THIS divider's active drag (set on pointerdown, cleared on up/cancel)
    // — a `buttons`-only guard would also honor an unrelated cross-element drag passing over the divider.
    if (!this.dragging) return;
    this.moveFromPointer(event);
  }

  protected onPointerUp(): void {
    this.dragging = false;
  }

  /**
   * Map a pointer position to a reveal %. Horizontal measures clientX from the inline-start edge (the right
   * edge under RTL); vertical measures clientY from the block-start (top) edge (direction-independent).
   */
  private moveFromPointer(event: PointerEvent): void {
    const rect = this.track().nativeElement.getBoundingClientRect();
    if (this.layout() === 'vertical') {
      if (rect.height === 0) return;
      this.setPct(((event.clientY - rect.top) / rect.height) * 100);
      return;
    }
    if (rect.width === 0) return;
    const fromStart = this.isRtl() ? rect.right - event.clientX : event.clientX - rect.left;
    this.setPct((fromStart / rect.width) * 100);
  }

  private setPct(next: number): void {
    this.value.set(clamp(next, 0, 100));
  }
}
