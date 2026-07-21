import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  effect,
  inject,
  input,
  output,
  type TemplateRef,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatMenu, MatMenuItem, MatMenuTrigger, type MatMenuPanel } from '@angular/material/menu';
import type { CaeMenuPanelHost } from 'caelum/shared';
import { CaeIcon, type CaeItemIconContext } from 'caelum/icon';

/** A single item in a `cae-menu`. */
export interface CaeMenuItem {
  /** Visible label. */
  label: string;
  /** Optional value identifying the item in `(itemSelect)`; the whole item is emitted. */
  value?: string;
  /** Disable just this item. */
  disabled?: boolean;
  /**
   * Optional leading glyph, by built-in name (`caelum/icon` registry — D-596). Rendered
   * decoratively (`aria-hidden`); the item's accessible name stays {@link label}. For a
   * custom glyph, supply the component-level `iconTemplate` instead, which wins over this.
   * Honoured where the icon slot is rendered: `cae-menu` itself and the menus embedded in
   * `cae-split-button` / `cae-menubar`; `cae-context-menu` shares this interface but does
   * not render icons yet (#645).
   */
  icon?: string;
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
  imports: [MatMenu, MatMenuItem, NgTemplateOutlet, CaeIcon],
  template: `
    <mat-menu [xPosition]="xPosition()" [yPosition]="yPosition()">
      @for (item of items(); track $index) {
        <button mat-menu-item [disabled]="item.disabled ?? false" (click)="itemSelect.emit(item)">
          @if (iconTemplate(); as tpl) {
            <ng-container
              [ngTemplateOutlet]="tpl"
              [ngTemplateOutletContext]="iconContext(item, $index)"
            />
          } @else if (item.icon) {
            <cae-icon class="cae-menu__icon" [name]="item.icon" />
          }
          {{ item.label }}
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .cae-menu__icon {
      margin-inline-end: var(--cae-space-2);
    }
  `,
})
export class CaeMenu implements CaeMenuPanelHost {
  /** The menu items, as data. */
  readonly items = input<readonly CaeMenuItem[]>([]);
  /**
   * Consumer escape hatch for the per-item icon slot (D-596): an `ng-template` receiving
   * `{ $implicit: item, index }` (`let-item`, `let-index="index"`), stamped once per item
   * *instead of* the built-in `item.icon` glyph — the template wins whenever both are
   * supplied, for every item, so one convention governs the whole menu. The template owns
   * its own spacing and accessibility (keep glyphs decorative; the item's accessible name
   * is its label).
   */
  readonly iconTemplate = input<TemplateRef<CaeItemIconContext<CaeMenuItem>> | null>(null);
  /** Horizontal alignment of the panel relative to its trigger. */
  readonly xPosition = input<'before' | 'after'>('after');
  /** Vertical alignment of the panel relative to its trigger. */
  readonly yPosition = input<'above' | 'below'>('below');
  /** Emits the chosen item when a menu item is activated (click or keyboard). */
  readonly itemSelect = output<CaeMenuItem>();

  /**
   * The raw view query backing {@link getMenuPanel} — an INTERNAL seam, not a consumer API.
   * `@internal` strips it from the published typings (tsconfig `stripInternal`) so the concrete
   * `MatMenu` type never leaks into the public surface; triggers read it through `getMenuPanel`.
   * Non-required so it reads as `undefined` (rather than throwing) before the panel's view has
   * initialised — a trigger's effect re-runs when it resolves.
   * @internal
   */
  readonly panel = viewChild(MatMenu);

  /**
   * The Material menu panel this `cae-menu` hosts, for a trigger to open — the integration seam
   * behind {@link CaeMenuPanelHost} that `cae-button`'s `menuTriggerFor` (#57) and the
   * `caeMenuTriggerFor` directive consume. Returns `undefined` until the panel's view has
   * initialised (read it reactively; callers wire it as `?? null`). This is a *method*, not a
   * bindable input, so `MatMenuPanel` never enters the public *bindable* surface (D-01/D-02): a
   * consumer binds the `cae-menu` instance to a trigger, never this panel directly.
   */
  getMenuPanel(): MatMenuPanel | undefined {
    return this.panel();
  }

  /** Context builder for {@link iconTemplate} (the carousel `itemContext` idiom). */
  protected iconContext(item: CaeMenuItem, index: number): CaeItemIconContext<CaeMenuItem> {
    return { $implicit: item, item, index };
  }
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
 * the ARIA lands on the wrong element. On a `<cae-button>`, reach for its `menuTriggerFor`
 * input instead (#57, the sibling of the `tooltip` seam #36): it forwards this trigger to the
 * inner focusable `<button>`, so the menu is keyboard/SR-reachable and the ARIA lands right.
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
    // Keep the composed MatMenuTrigger pointed at the cae-menu's panel. Reads it through the
    // public `getMenuPanel` seam; re-runs if the bound cae-menu changes OR when its panel
    // resolves (so element order and lazy/conditional menus are handled). `?? null` covers the
    // pre-resolution window — MatMenuTrigger treats a null menu as inert.
    effect(() => {
      this.trigger.menu = this.caeMenuTriggerFor().getMenuPanel() ?? null;
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
