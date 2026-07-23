import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  isDevMode,
  signal,
  TemplateRef,
  ViewContainerRef,
  viewChild,
} from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import type { ConnectedPosition } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';

/**
 * Where the panel sits relative to its trigger. Each side has a flip fallback (below↔above,
 * end↔start) so the panel never clips off-viewport — the CDK picks the first position that fits.
 */
export type CaePopoverPosition = 'bottom' | 'top' | 'left' | 'right';

// The trigger↔panel gap, in px. A structural/behavioral value the CDK position API takes as a number
// (it can't read a CSS custom property), NOT a themeable design token — mirrors cae-tree-select's
// numeric `offsetY`. Kept as one named constant so both axes stay consistent.
const OVERLAY_GAP = 8;

/**
 * The default primary + flip-fallback positions for each side. `withPush` handles the perpendicular
 * axis, so two entries per side (preferred, then the opposite edge) are enough for the parallel flip
 * that keeps the panel on-viewport. Exported so an advanced consumer can reason about or reuse the map.
 */
export const CAE_POPOVER_POSITIONS: Record<CaePopoverPosition, ConnectedPosition[]> = {
  bottom: [
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: OVERLAY_GAP,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -OVERLAY_GAP,
    },
  ],
  top: [
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -OVERLAY_GAP,
    },
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: OVERLAY_GAP,
    },
  ],
  right: [
    { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: OVERLAY_GAP },
    { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top', offsetX: -OVERLAY_GAP },
  ],
  left: [
    { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top', offsetX: -OVERLAY_GAP },
    { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: OVERLAY_GAP },
  ],
};

// Module-scoped id counter for the panel's stable `id` (the trigger's aria-controls target).
// Deterministic per load — no Math.random/Date.now (the reproducible-build rule).
let nextUniqueId = 0;

/**
 * `cae-popover` — an anchored, trigger-relative content overlay (`reference/COMPARISON.md` row 108:
 * `p-popover`, was `p-overlaypanel`, → `cae-popover`; Book 09 §3.2, the command-overlay family). It is
 * the **content + config holder**; the {@link CaePopoverTrigger} directive (`[caePopoverTriggerFor]`)
 * owns the overlay lifecycle — the `MatMenuTrigger` split, so one popover can be reached from any
 * trigger and the trigger carries the a11y wiring. This is the OTHER overlay family from the
 * centered-modal `cae-dialog`: a command overlay positioned against an origin (Book 09 §2.1).
 *
 * ```html
 * <button [caePopoverTriggerFor]="help" type="button">Help</button>
 * <cae-popover #help="caePopover" ariaLabel="Formatting help">
 *   <p>Markdown is supported.</p>
 * </cae-popover>
 * ```
 *
 * **The panel is `role="dialog"`** with an accessible name (`ariaLabel`; a dev-only warning fires when
 * it is missing — a dialog needs a name, Book 09 §3.6 gate 4) and `tabindex="-1"` so focus can land on
 * it. The five-beat overlay lifecycle (Book 09 §2.2/§3.6) lives in the trigger directive: open →
 * position/flip → move focus into the panel (`cdkTrapFocus`) → dismiss on `Escape` **or** outside-click
 * (when `[dismissable]`) → **restore focus to the trigger on every close path**. Token-only theming
 * (surface/elevation/border from `--cae-*`; Book 04 §3.6). Zoneless-compatible: `OnPush` + signal state.
 */
@Component({
  selector: 'cae-popover',
  exportAs: 'caePopover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule],
  template: `
    <ng-template>
      <div
        #panel
        class="cae-popover__panel"
        role="dialog"
        tabindex="-1"
        [id]="panelId"
        [attr.aria-label]="ariaLabel() || null"
        cdkTrapFocus
      >
        <ng-content />
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: contents;
    }
    .cae-popover__panel {
      box-sizing: border-box;
      max-inline-size: min(24rem, calc(100vw - var(--cae-space-6)));
      max-block-size: min(24rem, calc(100vh - var(--cae-space-6)));
      overflow: auto;
      padding: var(--cae-space-3);
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      background: var(--cae-surface-raised);
      color: var(--cae-color-on-surface);
      box-shadow: var(--cae-elevation-3);
    }
    /* The container is a focus fallback (tabindex=-1), not an interactive control — no visible ring when
       it holds focus only because the panel had no other focusable target. Inner controls draw their own. */
    .cae-popover__panel:focus {
      outline: none;
    }
  `,
})
export class CaePopover {
  /** Accessible name for the dialog panel (a dialog needs a name; dev-warns when unset). */
  readonly ariaLabel = input('');
  /** Which side of the trigger the panel prefers; each side flips to its opposite edge if it won't fit. */
  readonly position = input<CaePopoverPosition>('bottom');
  /** Whether an outside (backdrop) click dismisses the panel. `Escape` always closes regardless. */
  readonly dismissable = input(true, { transform: booleanAttribute });

  /** Stable id for the panel (the trigger's aria-controls target). */
  readonly panelId = `cae-popover-${nextUniqueId++}`;

  // Reached by the trigger directive: the panel template it portals into the overlay, and the VCR that
  // roots the embedded view (so projected content keeps this popover's injection context + CD parent).
  /** @internal */ readonly _template = viewChild.required(TemplateRef);
  /** @internal */ readonly _vcr = inject(ViewContainerRef);
  /** @internal Open state, reflected by the trigger's `aria-expanded`. Owned here so the two stay in sync. */
  readonly _isOpen = signal(false);

  constructor() {
    // A dialog needs an accessible name (Book 09 §3.6 gate 4). Dev-only warn, mirroring cae-tree-select.
    effect(() => {
      if (isDevMode() && this._isOpen() && !this.ariaLabel()) {
        console.warn(
          'cae-popover: set `ariaLabel` — the panel is a role=dialog and requires an accessible name.',
        );
      }
    });
  }
}

/**
 * `[caePopoverTriggerFor]` — wires any focusable element to a {@link CaePopover}, owning the CDK overlay
 * lifecycle (the `MatMenuTrigger` idiom). It reflects `aria-haspopup=dialog` + `aria-expanded` +
 * `aria-controls` on the trigger, opens/closes on click, and — the load-bearing part — **restores focus
 * to the trigger on every close path** (Escape, outside-click, programmatic, detach) through the single
 * {@link close} funnel, so the dismiss path (the usual miss) can't diverge from the accept path.
 */
@Directive({
  selector: '[caePopoverTriggerFor]',
  exportAs: 'caePopoverTrigger',
  host: {
    'aria-haspopup': 'dialog',
    '[attr.aria-expanded]': 'popover()._isOpen()',
    '[attr.aria-controls]': 'popover()._isOpen() ? popover().panelId : null',
    '(click)': 'toggle()',
    '(keydown)': 'onKeydown($event)',
  },
})
export class CaePopoverTrigger {
  /** The popover this trigger controls (`[caePopoverTriggerFor]="ref"`, an exported `#ref="caePopover"`). */
  readonly popover = input.required<CaePopover>({ alias: 'caePopoverTriggerFor' });

  private readonly overlay = inject(Overlay);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private overlayRef: OverlayRef | null = null;

  constructor() {
    // Dispose an open overlay if the trigger itself is destroyed while the panel is up (e.g. an @if
    // removes the trigger) — the imperative OverlayRef would otherwise outlive its trigger and leak.
    inject(DestroyRef).onDestroy(() => this.overlayRef?.dispose());
  }

  /** Open when closed, close when open. */
  toggle(): void {
    if (this.overlayRef) this.close();
    else this.open();
  }

  /** Open the panel anchored to the trigger and move focus into it. No-op if already open. */
  open(): void {
    if (this.overlayRef) return;
    const popover = this.popover();

    const overlayRef = this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.elementRef)
        .withPositions(CAE_POPOVER_POSITIONS[popover.position()])
        .withPush(true)
        .withFlexibleDimensions(false),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      // Transparent full-screen backdrop: the standard MatMenu/MatSelect outside-click detector. Present
      // even when not dismissable (so a stray outside click can't leak to the page) — it just no-ops then.
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    });
    this.overlayRef = overlayRef;
    overlayRef.attach(new TemplatePortal(popover._template(), popover._vcr));
    popover._isOpen.set(true);

    if (popover.dismissable()) {
      overlayRef.backdropClick().subscribe(() => this.close());
    }
    // Escape always closes (a dialog affordance), independent of [dismissable].
    overlayRef.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape' && !hasModifier(event)) {
        event.preventDefault();
        this.close();
      }
    });
    // Safety net: any detach we didn't initiate (e.g. scroll-strategy close) still runs the close funnel.
    // close() nulls overlayRef BEFORE dispose(), so the dispose→detachments re-entry early-returns.
    overlayRef.detachments().subscribe(() => this.close());

    this.moveFocusIn(overlayRef);
  }

  /**
   * Close the panel and restore focus to the trigger. THE single close path — Escape, outside-click,
   * detach, and programmatic close all funnel here, so focus restoration can't diverge between them.
   */
  close(): void {
    const overlayRef = this.overlayRef;
    if (!overlayRef) return;
    this.overlayRef = null; // null first so the dispose→detachments handler early-returns (no re-entry)
    overlayRef.dispose();
    this.popover()._isOpen.set(false);
    // Restore focus to the trigger. Runs AFTER dispose (which tears down the focus trap), so this is the
    // authoritative final focus target on every path — including outside-click, the usually-missed one.
    this.elementRef.nativeElement.focus();
  }

  /** ArrowDown/ArrowUp open the panel from the trigger (in addition to click / native Enter-Space). */
  protected onKeydown(event: KeyboardEvent): void {
    if (!this.overlayRef && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      this.open();
    } else if (this.overlayRef && event.key === 'Escape' && !hasModifier(event)) {
      event.preventDefault();
      this.close();
    }
  }

  /**
   * Move focus into the open panel: an author-marked `[cdkFocusInitial]`, else the panel container
   * itself (`tabindex=-1`). Focusing the container is the APG-permitted default (as `MatDialog` does
   * when no autofocus target exists) and guarantees focus enters even for informational content with no
   * focusable child — so the trap holds and `Escape` works. Explicit (not `cdkTrapFocusAutoCapture`) so
   * the enter + restore story is one deterministic, testable pair.
   */
  private moveFocusIn(overlayRef: OverlayRef): void {
    const host = overlayRef.overlayElement;
    // HTML lowercases attribute names, so match both casings — jsdom's selector engine is case-sensitive
    // on the name where a browser is not (the CDK writes the attribute, we only read it back).
    const initial = host.querySelector<HTMLElement>('[cdkFocusInitial], [cdkfocusinitial]');
    (initial ?? host.querySelector<HTMLElement>('.cae-popover__panel'))?.focus();
  }
}

/** True if the event carries a modifier — such a chord isn't a bare Escape and must pass through. */
function hasModifier(event: KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}
