import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';

/** A single item in a `cae-menu`. */
export interface CaeMenuItem {
  /** Visible label. */
  label: string;
  /** Optional value identifying the item in `(itemSelect)`; the whole item is emitted. */
  value?: string;
  /** Disable just this item. */
  disabled?: boolean;
}

/**
 * `cae-menu` — the Direct (1:1) wrapper over Material's `mat-menu`
 * (`reference/COMPARISON.md`: `p-menu` → `cae-menu`). Items are data (`CaeMenuItem[]`),
 * rendered as real `mat-menu-item` buttons so keyboard navigation, focus, and ripple work
 * (Material is projection-based — it has no `items` input, so the wrapper owns the data and
 * generates the projected buttons). The panel lives in a CDK overlay; a separate focusable
 * host opens it via the `caeMenuTriggerFor` directive — the PrimeNG `#menu` +
 * `menu.toggle()` idiom, kept declarative:
 *
 * ```html
 * <cae-menu #actions [items]="items" (itemSelect)="run($event)" />
 * <button [caeMenuTriggerFor]="actions">Actions</button>
 * ```
 *
 * Theme comes free through the token bridge. Zoneless-compatible: `OnPush` + signal state,
 * no zone-coupled APIs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatMenu, MatMenuItem],
  template: `
    <mat-menu [xPosition]="xPosition()" [yPosition]="yPosition()">
      @for (item of items(); track $index) {
        <button mat-menu-item [disabled]="item.disabled ?? false" (click)="itemSelect.emit(item)">
          {{ item.label }}
        </button>
      }
    </mat-menu>
  `,
})
export class CaeMenu {
  /** The menu items, as data. */
  readonly items = input<readonly CaeMenuItem[]>([]);
  /** Horizontal alignment of the panel relative to its trigger. */
  readonly xPosition = input<'before' | 'after'>('after');
  /** Vertical alignment of the panel relative to its trigger. */
  readonly yPosition = input<'above' | 'below'>('below');
  /** Emits the chosen item when a menu item is activated (click or keyboard). */
  readonly itemSelect = output<CaeMenuItem>();

  /**
   * The underlying Material menu panel — an INTERNAL seam read cross-instance by
   * `caeMenuTriggerFor`, not a consumer API. `@internal` strips it from the published
   * typings (tsconfig `stripInternal`) so `MatMenu` never leaks into the public surface.
   * @internal
   */
  readonly panel = viewChild.required(MatMenu);
}

/**
 * `caeMenuTriggerFor` — opens a `cae-menu` from a focusable host. Composes Material's
 * `MatMenuTrigger` (overlay, positioning, keyboard) and wires the `cae-menu`'s panel into
 * it, so the consumer references the `cae-menu` instance directly (never a Material type):
 * `<button [caeMenuTriggerFor]="myCaeMenu">`.
 *
 * **Accessibility contract — apply to a focusable element** (a native `<button>`, or an
 * element with `tabindex`). `MatMenuTrigger` puts `aria-haspopup`/`aria-expanded` and its
 * keyboard handlers on THIS host; on a non-focusable host (e.g. a bare `<cae-button>`
 * wrapper, whose real control is the inner `<button>`) the menu becomes pointer-only and
 * the ARIA lands on the wrong element. Forwarding the trigger to `cae-button`'s inner
 * control is #57 (the sibling of the `tooltip` seam #36 added to `cae-button`; blocked on a
 * public panel accessor, since `CaeMenu`'s `panel` seam is internal-only).
 */
@Directive({
  selector: '[caeMenuTriggerFor]',
  exportAs: 'caeMenuTrigger',
  hostDirectives: [MatMenuTrigger],
})
export class CaeMenuTrigger {
  private readonly trigger = inject(MatMenuTrigger);
  /** The `cae-menu` this host opens. */
  readonly caeMenuTriggerFor = input.required<CaeMenu>();

  constructor() {
    // Keep the composed MatMenuTrigger pointed at the cae-menu's panel. Runs after view
    // init, so the panel viewChild is resolved regardless of element order; re-runs if the
    // bound cae-menu changes.
    effect(() => {
      this.trigger.menu = this.caeMenuTriggerFor().panel();
    });
  }

  /** Toggle the menu open/closed (PrimeNG `menu.toggle()` parity). */
  toggle(): void {
    this.trigger.toggleMenu();
  }
  /** Open the menu. */
  open(): void {
    this.trigger.openMenu();
  }
  /** Close the menu. */
  close(): void {
    this.trigger.closeMenu();
  }
}
