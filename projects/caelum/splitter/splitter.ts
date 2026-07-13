import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  effect,
  ElementRef,
  inject,
  input,
  isDevMode,
  numberAttribute,
  output,
  PLATFORM_ID,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { Directionality } from '@angular/cdk/bidi';

/** PageUp/PageDown coarse step, in percentage points (arrow keys use the finer `step` input). */
const PAGE_STEP = 10;

/** Clamp into `[min, max]`; a non-finite input (`NaN`) collapses to `min` so it can't poison the model. */
const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.max(min, Math.min(v, max)) : min;

/** Coerce an optional numeric input: blank/`null`/non-finite → `undefined` (an *unsized* panel). */
const optionalNumber = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(v as string);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * `cae-splitter-panel` — a single resizable pane inside a {@link CaeSplitter}. Its projected content is
 * captured as a `TemplateRef` (via an internal `<ng-template>`) so the parent `cae-splitter` can interleave
 * it with the resize dividers, mirroring `<p-splitterPanel>`. Content-projection only; the panel owns just
 * its initial `[size]` and `[minSize]` (both percentages). Nesting is free — a panel may project another
 * `cae-splitter`. Used exclusively as a child of `cae-splitter` (the tabs/stepper authoring idiom).
 */
@Component({
  selector: 'cae-splitter-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-template #content><ng-content /></ng-template>`,
})
export class CaeSplitterPanel {
  /**
   * Initial size as a percentage of the splitter. Omitted panels share the remaining space equally — so if
   * the sized panels already claim 100%, an unsized panel seeds to 0% (give it an explicit `[size]` or a
   * `[minSize]` to reserve room).
   */
  readonly size = input<number | undefined, unknown>(undefined, { transform: optionalNumber });
  /** Minimum size this panel can be resized to, as a percentage (default 0). Enforced across each pair. */
  readonly minSize = input(0, { transform: numberAttribute });
  /** The panel body, captured for `cae-splitter` to project between the dividers. */
  readonly content = viewChild.required<TemplateRef<unknown>>('content');
}

/**
 * `cae-splitter` — a keyboard-resizable multi-panel splitter (`p-splitter` parity, Book 11 §3.2; opens the
 * Splitter family, #323). N projected {@link CaeSplitterPanel} children are laid out as flex panes separated
 * by (N−1) draggable dividers; `[layout]` is `horizontal` (side-by-side) or `vertical` (stacked).
 *
 * **Each divider is the APG *window splitter* separator** — the same a11y substrate shipped in
 * `cae-image-compare` (#293), now applied to flex panels instead of a clip reveal (Book 11 §3.2: *"the parity
 * work is accessibility"* — a mouse-only splitter fails parity). A divider is a focusable `role="separator"`
 * with `aria-orientation` + `aria-valuenow/min/max` and a full **keyboard resize path** (Book 11 §3.5
 * non-negotiable #1): the axis arrows nudge by `step`, Home/End snap the leading panel to its min/max, and
 * PageUp/PageDown step coarsely. In a `horizontal` splitter the separator line is *vertical*, so
 * `aria-orientation="vertical"` and Left/Right are the axis (RTL-flipped through {@link Directionality}, Book
 * 04 §3.5); a `vertical` splitter is the mirror and is direction-independent (Up/Down, no flip).
 *
 * **No LiveAnnouncer** (Book 11 §3.5 #2 is for drag *reorder/transfer*): each keyboard step updates the
 * focused separator's `aria-valuenow`, announced by the SR like a slider thumb — a parallel live region would
 * double-announce. **No foreign drag library** (Book 11 §3.5 #6, D-11): the pointer drag is native Pointer
 * Events + `setPointerCapture` — a divider computes a flex-basis from a pointer *position*, it does not
 * translate as a dragged element, so `cdkDrag` would be the wrong, heavier tool (the same deliberate call as
 * the #293 sibling). Live sizes live in a signal (zoneless, Book 11 §3.5 #4), normalized to sum 100 and
 * NaN-safe-clamped against each panel's `minSize` on every resize. Token-only styling (Book 04 §3.6).
 *
 * ```html
 * <cae-splitter layout="horizontal">
 *   <cae-splitter-panel [size]="30" [minSize]="15">Sidebar</cae-splitter-panel>
 *   <cae-splitter-panel [size]="70">Content</cae-splitter-panel>
 * </cae-splitter>
 * ```
 *
 * **State persistence** (`p-splitter` `stateKey`/`stateStorage` parity, #325): set `[stateKey]` to persist the
 * live sizes to Web Storage and restore them on the next mount (best-effort — SSR-safe, storage-failure-safe).
 * Remaining deferred parity extras (collapse/expand, px min/max, double-click reset, `gutterSize`) are tracked
 * in the follow-ups filed on landing.
 */
@Component({
  selector: 'cae-splitter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: {
    class: 'cae-splitter',
    '[class.cae-splitter--horizontal]': "layout() === 'horizontal'",
    '[class.cae-splitter--vertical]': "layout() === 'vertical'",
  },
  template: `
    <div #container class="cae-splitter__container">
      @for (panel of panels(); track panel; let i = $index, last = $last) {
        <div class="cae-splitter__panel" [style.flex-basis.%]="sizes()[i] ?? null">
          <ng-container [ngTemplateOutlet]="panel.content()" />
        </div>
        @if (!last) {
          <div
            class="cae-splitter__gutter"
            role="separator"
            tabindex="0"
            [attr.aria-orientation]="orientation()"
            [attr.aria-valuemin]="valueMin(i)"
            [attr.aria-valuemax]="valueMax(i)"
            [attr.aria-valuenow]="valueNow(i)"
            [attr.aria-valuetext]="valueText(i)"
            [attr.aria-label]="ariaLabel() || null"
            (keydown)="onKeydown($event, i)"
            (pointerdown)="onPointerDown($event, i)"
            (pointermove)="onPointerMove($event, i)"
            (pointerup)="onPointerUp()"
            (pointercancel)="onPointerUp()"
          >
            <span class="cae-splitter__grip" aria-hidden="true"></span>
          </div>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      inline-size: 100%;
      block-size: 100%;
    }
    .cae-splitter__container {
      display: flex;
      inline-size: 100%;
      block-size: 100%;
    }
    :host(.cae-splitter--horizontal) .cae-splitter__container {
      flex-direction: row;
    }
    :host(.cae-splitter--vertical) .cae-splitter__container {
      flex-direction: column;
    }
    /* A pane holds exactly its computed flex-basis; it may shrink (so the dividers fit) but never grows past
       its share, and it scrolls its own overflow rather than pushing the layout. */
    .cae-splitter__panel {
      flex: 0 1 auto;
      min-inline-size: 0;
      min-block-size: 0;
      overflow: auto;
    }
    .cae-splitter__gutter {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--cae-color-border);
      /* Touch-drag the divider resizes; it must not scroll the page. */
      touch-action: none;
      user-select: none;
    }
    :host(.cae-splitter--horizontal) .cae-splitter__gutter {
      inline-size: var(--cae-space-2);
      cursor: col-resize;
    }
    :host(.cae-splitter--vertical) .cae-splitter__gutter {
      block-size: var(--cae-space-2);
      cursor: row-resize;
    }
    /* A token-styled grip: a short bar along the divider, drawn from a token colour — no icon font. */
    .cae-splitter__grip {
      border-radius: var(--cae-radius-full);
      background: var(--cae-color-on-surface-variant);
    }
    :host(.cae-splitter--horizontal) .cae-splitter__grip {
      inline-size: 2px;
      block-size: var(--cae-space-6);
    }
    :host(.cae-splitter--vertical) .cae-splitter__grip {
      block-size: 2px;
      inline-size: var(--cae-space-6);
    }
    /* Focus lands on the (thin) separator — surface the ring on the grip so it's visible over any panel. */
    .cae-splitter__gutter:focus-visible {
      outline: none;
    }
    .cae-splitter__gutter:focus-visible .cae-splitter__grip {
      outline: 2px solid var(--cae-color-primary);
      outline-offset: 2px;
      /* A surface-coloured halo under the outline keeps the ring visible over any panel backdrop. */
      box-shadow: 0 0 0 4px var(--cae-surface-raised);
    }
  `,
})
export class CaeSplitter {
  /**
   * Resolves the drag/keyboard axis for RTL (Book 04 §3.5). Root-provided; defaults to 'ltr'.
   * Reads the signal-backed `Directionality.value` directly (reactive on both the root service and a
   * `Dir` ancestor) rather than `toSignal(change, {initialValue})`: the change-based idiom snapshots
   * 'ltr' at construction and misses a *born-rtl* `[dir]` binding (the setter emits `change` only after
   * `ngAfterContentInit`), which — because the drag axis is measured off `isRtl()` — mis-measures on
   * first paint, not just mis-points a glyph. Mirrors cae-pick-list (#364).
   */
  private readonly directionality = inject(Directionality);
  protected readonly isRtl = computed(() => this.directionality.value === 'rtl');

  /** The declared panes, collected from projected `cae-splitter-panel` children (DOM order). */
  protected readonly panels = contentChildren(CaeSplitterPanel);

  /** Panel arrangement: `horizontal` = side-by-side (vertical dividers); `vertical` = stacked. */
  readonly layout = input<'horizontal' | 'vertical'>('horizontal');
  /** Arrow-key nudge in percentage points (Home/End snap to min/max; PageUp/Down step by 10). */
  readonly step = input(10, { transform: numberAttribute });
  /** Accessible name applied to every divider separator (they're distinguished by `aria-valuenow`). */
  readonly ariaLabel = input('Resize panels');
  /** Emits the live sizes array (summing 100) at the end of a pointer drag and after each keyboard resize. */
  readonly resizeEnd = output<number[]>();

  /**
   * Persist the live sizes across reloads under this key (`p-splitter` `stateKey` parity). Blank (the default)
   * disables persistence — the splitter stays byte-for-byte its stateless self. When set, the sizes are written
   * to {@link stateStorage} after every committed resize and restored once the panels resolve. A stored entry
   * whose length no longer matches the panel set (a structural change) or that is corrupt/non-numeric is
   * ignored, falling back to the declared `[size]` seed; a restored layout is re-run through the same
   * normalize + `minSize`-enforcement pipeline as the seed, so it can't announce an out-of-range value even if
   * a panel's `[minSize]` changed since it was saved. **Each key must be unique on the page** — two splitters
   * sharing a `[stateKey]` write to the same slot and overwrite each other's layout (a flat storage namespace).
   */
  readonly stateKey = input('');
  /**
   * Which Web Storage backs {@link stateKey}: `'session'` (default — cleared when the tab closes, matching
   * `p-splitter`'s `stateStorage`) or `'local'` (persists indefinitely). Ignored when `stateKey` is blank or
   * storage is unavailable (SSR / a sandboxed iframe / privacy mode); persistence is always best-effort and
   * never breaks a resize.
   */
  readonly stateStorage = input<'local' | 'session'>('session');

  /** Whether we're in a browser (persistence is a no-op under SSR — no `window`/Web Storage). */
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** Latch: the stored layout is restored at most once. Closes when a restore is applied OR on the first user
   *  resize (`setLeading`) — never merely on the first panels tick, so an async panel/key can still restore. */
  private stateRestored = false;

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
  /** Index of the divider currently being pointer-dragged, or -1. Set on primary-button pointerdown only. */
  private dragIndex = -1;
  /** Whether the active pointer drag has actually moved a divider — gates the `resizeEnd` on pointerup. */
  private dragChanged = false;

  /**
   * The size layout has two layers so the initial seed and live resizes don't fight. `seed` is a *pure*
   * computed from the panels' `[size]` inputs (so it always reflects the declared sizes, even as they resolve
   * asynchronously during projection). `override` holds a user's live resize. `sizes` prefers a length-matching
   * override, else the seed — so a resize sticks, a runtime `[size]` change can't clobber it, and a structural
   * add/remove (which changes the panel count) discards the now-stale override and re-seeds automatically.
   */
  private readonly seed = computed(() => this.seedSizes(this.panels()));
  private readonly override = signal<number[] | null>(null);
  /**
   * The live pane sizes (percentages summing ~100), in panel order — the seed, or a length-matching resize/
   * restore override. **Public + read-only** so a consumer can observe the layout reactively, including a
   * `[stateKey]` restore, which applies silently (it emits no `resizeEnd` — a restore is not a user resize, so
   * mirroring `resizeEnd` alone would miss it). Read it in a template via a ref (`#s.sizes()`) or in an
   * `effect`.
   */
  readonly sizes = computed<number[]>(() => {
    const panels = this.panels();
    const o = this.override();
    // A length-matching override wins, re-run through min-enforcement *reactively* — so a restored layout
    // (whose panels' `[minSize]` may still be propagating when it's applied) or a later `[minSize]` change is
    // corrected, keeping every separator's `aria-valuenow` in range. It's a no-op for a live resize, which
    // `setLeading` already clamped ≥ each min: `enforceMinSizes` returns the array untouched (byte-for-byte,
    // no float dust) when nothing is below its minimum.
    return o && o.length === panels.length ? this.enforceMinSizes(o, panels) : this.seed();
  });

  /**
   * `horizontal` splitter → the separator line is *vertical* (dragged left/right); `vertical` splitter → the
   * separator is *horizontal*. This counterintuitive convention was confirmed by the #293 a11y review.
   */
  protected readonly orientation = computed(() =>
    this.layout() === 'horizontal' ? 'vertical' : 'horizontal',
  );

  constructor() {
    // Dev-only config guards: a splitter needs ≥2 panels to have a divider, and the panel minimums must be
    // satisfiable. Reactive to the projected set. The warn STRINGS ship in the fesm because isDevMode() is a
    // runtime check.
    if (isDevMode()) {
      effect(() => {
        const panels = this.panels();
        if (panels.length < 2) {
          console.warn(
            `[cae-splitter] A splitter needs at least two <cae-splitter-panel> children to have a ` +
              `resizable divider; found ${panels.length}.`,
          );
        }
        const minSum = panels.reduce((sum, p) => sum + Math.max(0, p.minSize() || 0), 0);
        if (minSum > 100) {
          console.warn(
            `[cae-splitter] The panel [minSize] values sum to ${minSum}% (> 100%) — the dividers cannot ` +
              `satisfy every minimum, so resizing will be constrained.`,
          );
        }
        // A declared [size] below the same panel's [minSize] is contradictory; the seed honours the minimum
        // (so aria-valuenow stays in range), but surface the config smell rather than silently overriding it.
        panels.forEach((p, k) => {
          const s = p.size();
          const m = p.minSize();
          if (s != null && Number.isFinite(s) && Number.isFinite(m) && s < m) {
            console.warn(
              `[cae-splitter] Panel ${k + 1} has [size]=${s}% below its [minSize]=${m}% — the minimum wins.`,
            );
          }
        });
        // A focusable role="separator" needs an accessible name (WCAG 4.1.2); the default is non-empty, so
        // this only fires if a consumer explicitly clears it.
        if (!this.ariaLabel()?.trim()) {
          console.warn(
            '[cae-splitter] No accessible name: pass [ariaLabel] so each divider (role="separator") is ' +
              'announced (e.g. "Resize panels"). WCAG 4.1.2.',
          );
        }
        // A non-positive [step] leaves the arrow keys unable to resize (a 0 no-ops, a negative inverts them).
        if (!(this.step() > 0)) {
          console.warn(
            `[cae-splitter] [step] should be a positive number; got ${this.step()}. ` +
              'The arrow keys will not resize the divider correctly.',
          );
        }
      });
    }

    // Restore a persisted layout ONCE. The latch closes only when a restore is actually APPLIED (or on the
    // first user resize, in `setLeading`) — NOT merely on the first non-empty panels tick. Latching eagerly
    // would drop a legitimate restore whose entry isn't readable yet on that first tick: a panel set that
    // grows across two ticks (an `@if`/async pane — the saved length wouldn't match the partial set) or a
    // `[stateKey]` bound to a signal still blank at content-init. Leaving the latch open lets the effect retry
    // as `panels()`/`stateKey()` settle; the `setLeading` latch guarantees a late-arriving entry can never
    // clobber an interaction that already happened. `restoreState` sum-normalizes the entry; the `sizes`
    // computed then min-enforces it reactively (so a value saved before a `[minSize]` change — or read back
    // before the panels' `[minSize]` inputs have propagated — can't announce out of range).
    effect(() => {
      const panels = this.panels();
      if (this.stateRestored || panels.length === 0) return;
      const restored = this.restoreState(panels);
      if (restored) {
        this.stateRestored = true;
        this.override.set(restored);
      }
    });
  }

  /**
   * Seed live sizes: honour each `[size]`, split the remainder equally among unsized panels, normalize to 100,
   * then raise any pane below its `minSize`. The final min-enforcement step is what keeps the seeded layout —
   * and so each separator's `aria-valuenow` — inside `[minSize]`: a bare `[size]` seed would otherwise render
   * a pane below its stated minimum and announce an ARIA-invalid value (found by both review lenses).
   */
  private seedSizes(panels: readonly CaeSplitterPanel[]): number[] {
    const n = panels.length;
    if (n === 0) return [];
    const raw = panels.map((p) => {
      const s = p.size();
      return s != null && Number.isFinite(s) && s > 0 ? s : null;
    });
    const definedSum = raw.reduce<number>((a, v) => a + (v ?? 0), 0);
    const unsized = raw.filter((v) => v == null).length;
    const each = unsized > 0 ? Math.max(0, 100 - definedSum) / unsized : 0;
    return this.enforceMinSizes(this.normalize(raw.map((v) => v ?? each)), panels);
  }

  /** Scale an array of sizes to sum exactly 100; a non-positive *or non-finite* total falls back to an equal
   *  split. The non-finite guard matters on the restore trust-boundary: a tampered `[1e308, 1e308]` overflows
   *  the sum to `Infinity`, and `x / Infinity` would otherwise collapse every pane to a degenerate `0%`. */
  private normalize(sizes: number[]): number[] {
    const sum = sizes.reduce((a, b) => a + b, 0);
    if (!(sum > 0) || !Number.isFinite(sum)) return sizes.map(() => 100 / sizes.length);
    return sizes.map((s) => (s / sum) * 100);
  }

  /**
   * Raise any pane below its `minSize` up to it, taking the deficit proportionally from the panes that have
   * slack above their own minimum. The sum stays 100 and every pane ends ≥ its min *when feasible* (Σ min ≤
   * 100); an infeasible set (already dev-warned) is left untouched. A reduction can push a slack pane under
   * its own min, so iterate — `n` passes is a safe convergence bound.
   */
  private enforceMinSizes(sizes: number[], panels: readonly CaeSplitterPanel[]): number[] {
    const mins = panels.map((p) => {
      const m = p.minSize();
      return Number.isFinite(m) && m > 0 ? m : 0;
    });
    if (mins.reduce((a, b) => a + b, 0) >= 100) return sizes; // infeasible — the dev-warn covers it
    const out = [...sizes];
    for (let pass = 0; pass < out.length; pass++) {
      let deficit = 0;
      let slack = 0;
      for (let k = 0; k < out.length; k++) {
        if (out[k] < mins[k]) deficit += mins[k] - out[k];
        else slack += out[k] - mins[k];
      }
      if (deficit <= 1e-9 || slack <= 0) break;
      for (let k = 0; k < out.length; k++) {
        if (out[k] < mins[k]) out[k] = mins[k];
        else out[k] -= deficit * ((out[k] - mins[k]) / slack);
      }
    }
    return out;
  }

  /** The minimum for panel `i`, coerced non-negative (a non-finite/negative minSize is treated as 0). */
  private minSizeAt(i: number): number {
    const m = this.panels()[i]?.minSize() ?? 0;
    return Number.isFinite(m) && m > 0 ? m : 0;
  }

  /**
   * The reachable `[min, max]` of divider `i`, in the same "% of splitter" units as `aria-valuenow`: the
   * leading pane can shrink to its own `minSize` and grow until the trailing pane hits *its* `minSize`.
   * Reflecting the real constraints (not a static 0–100) is more honest to assistive tech than the #293
   * slider — which had no per-pane minimum — since a splitter pane genuinely can't reach every value.
   */
  private range(i: number): { min: number; max: number } {
    const total = (this.sizes()[i] ?? 0) + (this.sizes()[i + 1] ?? 0);
    const min = this.minSizeAt(i);
    return { min, max: Math.max(min, total - this.minSizeAt(i + 1)) };
  }

  /**
   * `aria-valuenow` for divider `i` — the leading pane's size, *clamped into* the announced `[min, max]` so
   * the ARIA triple is always coherent (WCAG 4.1.2). For a feasible config the seed already respects every
   * min, so this is a no-op; it only bites when the minimums are infeasible (Σ min > 100, dev-warned).
   */
  protected valueNow(i: number): number {
    const { min, max } = this.range(i);
    return Math.round(clamp(this.sizes()[i] ?? 0, min, max));
  }
  protected valueMin(i: number): number {
    return Math.round(this.range(i).min);
  }
  protected valueMax(i: number): number {
    return Math.round(this.range(i).max);
  }

  /** `aria-valuetext` — the percentage only (locale-neutral; `ariaLabel` names what is being resized). */
  protected valueText(i: number): string {
    return `${this.valueNow(i)}%`;
  }

  /**
   * Move divider `i` (between panes `i` and `i+1`) so the leading pane targets `targetA` percent. The pair's
   * combined size is conserved; the leading pane is clamped to `[minA, total − minB]` (NaN-safe), so neither
   * pane drops below its `minSize`. Every other pane is untouched. Returns whether anything actually changed —
   * a clamped or infeasible no-op returns `false`, so callers can suppress a spurious `resizeEnd`.
   */
  private setLeading(i: number, targetA: number): boolean {
    const sizes = [...this.sizes()];
    const a = sizes[i];
    const b = sizes[i + 1];
    if (a == null || b == null) return false;
    const total = a + b;
    const minA = this.minSizeAt(i);
    const maxA = total - this.minSizeAt(i + 1);
    if (minA > maxA) return false; // the pair can't satisfy both minimums — leave it as-is
    const newA = clamp(targetA, minA, maxA);
    if (newA === a) return false; // clamped to the current value — nothing to commit
    sizes[i] = newA;
    sizes[i + 1] = total - newA;
    this.override.set(sizes);
    // A user resize closes the restore window: once someone has moved a divider, a late-arriving persisted
    // entry (panels still resolving, or a `[stateKey]` set async) must never clobber the live interaction.
    this.stateRestored = true;
    return true;
  }

  /** The accessible resize path (Book 11 §3.5 #1). Axis is per-layout; horizontal arrows invert under RTL. */
  protected onKeydown(event: KeyboardEvent, i: number): void {
    const step = this.step();
    const horizontal = this.layout() === 'horizontal';
    const rtl = this.isRtl();
    const a = this.sizes()[i] ?? 0;
    let target: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        if (horizontal) target = a + (rtl ? -step : step);
        break;
      case 'ArrowLeft':
        if (horizontal) target = a + (rtl ? step : -step);
        break;
      case 'ArrowDown':
        if (!horizontal) target = a + step;
        break;
      case 'ArrowUp':
        if (!horizontal) target = a - step;
        break;
      case 'PageUp':
        // A coarse arrow along the layout's axis (so it never disagrees with ArrowUp/ArrowRight): grows the
        // leading pane in a horizontal LTR splitter, shrinks it (divider up) in a vertical one.
        target = horizontal ? a + (rtl ? -PAGE_STEP : PAGE_STEP) : a - PAGE_STEP;
        break;
      case 'PageDown':
        target = horizontal ? a + (rtl ? PAGE_STEP : -PAGE_STEP) : a + PAGE_STEP;
        break;
      case 'Home':
        target = this.minSizeAt(i); // leading pane to its minimum
        break;
      case 'End':
        target = a + (this.sizes()[i + 1] ?? 0) - this.minSizeAt(i + 1); // leading pane to its maximum
        break;
      default:
        return; // leave Tab and every non-axis key alone
    }
    if (target == null) return; // a cross-axis arrow for this layout — not ours to handle
    // Prevent the browser's own scroll for a handled key even at a clamp boundary, but only announce a resize
    // when the size actually moved (no spurious resizeEnd when held against the min/max).
    event.preventDefault();
    if (this.setLeading(i, target)) {
      this.persistState();
      this.resizeEnd.emit(this.sizes());
    }
  }

  protected onPointerDown(event: PointerEvent, i: number): void {
    if (event.button !== 0) return; // primary button only (a right/middle click must not move the divider)
    this.dragIndex = i;
    this.dragChanged = false;
    const target = event.currentTarget as HTMLElement | null;
    // Capture so the drag continues while the pointer strays off the thin divider. Guarded: jsdom (and a
    // synthetic event dispatched in a test) may lack pointerId / setPointerCapture.
    if (event.pointerId != null) {
      target?.setPointerCapture?.(event.pointerId);
    }
    // Focus the divider so the keyboard resize path works immediately after a mouse drag.
    target?.focus?.();
    event.preventDefault();
    this.moveFromPointer(event, i);
  }

  protected onPointerMove(event: PointerEvent, i: number): void {
    // Only track moves that belong to THIS divider's active drag (set on pointerdown, cleared on up/cancel)
    // — a `buttons`-only guard would also honor an unrelated cross-element drag passing over the divider.
    if (this.dragIndex !== i) return;
    this.moveFromPointer(event, i);
  }

  protected onPointerUp(): void {
    if (this.dragIndex < 0) return;
    const changed = this.dragChanged;
    this.dragIndex = -1;
    this.dragChanged = false;
    if (changed) {
      this.persistState(); // one persist + resizeEnd per drag, and only if it moved
      this.resizeEnd.emit(this.sizes());
    }
  }

  /** Map the pointer position to the leading pane's target size, measured from the splitter's start edge. */
  private moveFromPointer(event: PointerEvent, i: number): void {
    const rect = this.container().nativeElement.getBoundingClientRect();
    const horizontal = this.layout() === 'horizontal';
    const span = horizontal ? rect.width : rect.height;
    if (span === 0) return;
    let posPct: number;
    if (horizontal) {
      // Horizontal resolves through Directionality: in RTL the start edge is the right.
      posPct =
        ((this.isRtl() ? rect.right - event.clientX : event.clientX - rect.left) / span) * 100;
    } else {
      posPct = ((event.clientY - rect.top) / span) * 100; // vertical is direction-independent
    }
    // The leading pane starts after all the panes before it; subtract their share to get its target size.
    const preceding = this.sizes()
      .slice(0, i)
      .reduce((sum, s) => sum + s, 0);
    if (this.setLeading(i, posPct - preceding)) this.dragChanged = true;
  }

  // --- State persistence (`p-splitter` stateKey/stateStorage parity, #325) ---

  /**
   * The chosen Web Storage, or `null` when unusable. Guarded for SSR (no `window`) and for the browsers that
   * throw merely *accessing* `window.localStorage` (sandboxed iframe / privacy mode) — every persistence path
   * treats `null` as "skip", so a locked-down storage degrades to no-persistence, never an error.
   */
  private storage(): Storage | null {
    if (!this.isBrowser) return null;
    try {
      return this.stateStorage() === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  }

  /** Write the live sizes under `[stateKey]`. Best-effort: a blank key, unusable storage, or a `setItem`
   *  failure (quota exceeded / disabled) is swallowed — persistence must never break a resize. */
  private persistState(): void {
    const key = this.stateKey().trim();
    if (!key) return;
    const store = this.storage();
    if (!store) return;
    try {
      store.setItem(key, JSON.stringify(this.sizes()));
    } catch {
      // quota / disabled — best-effort only
    }
  }

  /**
   * Read + validate a persisted layout for the CURRENT panel set. Returns the stored sizes only when the entry
   * is a JSON array of finite numbers whose length matches `panels` (a structural change since the save
   * invalidates it); a missing/corrupt/mismatched entry returns `null` so the caller keeps the declared seed.
   * The returned array is applied raw — the `sizes` computed enforces each panel's `minSize` reactively.
   */
  private restoreState(panels: readonly CaeSplitterPanel[]): number[] | null {
    const key = this.stateKey().trim();
    if (!key) return null;
    const store = this.storage();
    if (!store) return null;
    let raw: string | null;
    try {
      raw = store.getItem(key);
    } catch {
      return null;
    }
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null; // corrupt entry — ignore, don't throw
    }
    if (!Array.isArray(parsed) || parsed.length !== panels.length) return null;
    const nums = parsed.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN));
    if (nums.some(Number.isNaN)) return null;
    // Web Storage is a trust boundary — another origin script, an extension, or a hand-edit can leave a
    // right-length numeric array that no longer sums to 100 (or holds negatives). Re-normalize to 100 so a
    // tampered entry can't render an absurd layout; the `sizes` computed then min-enforces it. Normalizing an
    // entry that sums to exactly 100 is byte-exact (verified for the integer round-trip case); a fractional
    // saved layout (e.g. thirds summing to 99.999…) is rescaled with sub-pixel dust that `aria-valuenow`'s
    // rounding hides — visually and semantically a no-op.
    return this.normalize(nums);
  }
}
