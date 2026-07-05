import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  input,
  output,
} from '@angular/core';
import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import type { CaeMenuItem } from 'caelum/menu';

/**
 * `cae-context-menu` — a right-click (context) menu wrapper over the CDK Menu family
 * (`reference/COMPARISON.md`: `p-contextMenu` -> `cae-context-menu`, Compose, Book 09 §3.4).
 *
 * Unlike `cae-menu`/`cae-menubar`/`cae-split-button` (which wrap `MatMenu`), a context menu
 * opens on right-click at the pointer — a capability `MatMenuTrigger` lacks. The reach-for
 * ladder (Book 06 §3.1) lands on the lower-level `@angular/cdk/menu` primitives here:
 * `cdkContextMenuTriggerFor` on the target opens a `cdkMenu` panel of `cdkMenuItem`s. The
 * menu-panel a11y is free from those primitives (Book 09 §3.4 invariants): `role="menu"`/`menuitem`,
 * arrow-key roving + typeahead, Escape closes and restores focus, focus trap. `@angular/cdk` is
 * already vendored, so this adds no dependency (D-11 clean).
 *
 * **Keyboard opening.** The keyboard route to a context menu is the Menu key / Shift+F10, which
 * fire the native `contextmenu` event on the *focused* element — so the target must be focusable
 * or a keyboard user can never reach it. This wrapper makes the projected target a focusable
 * region by default (`tabindex="0"` + a visible focus ring) whenever there are items, so keyboard
 * access works out of the box with no consumer plumbing. Items are data (`CaeMenuItem[]`, the same
 * shape as `cae-menu`), so the whole family shares one model. Wrap the right-clickable target as content:
 *
 * ```html
 * <cae-context-menu [items]="rowActions" (itemSelect)="run($event)">
 *   <div class="canvas">Right-click here</div>
 * </cae-context-menu>
 * ```
 *
 * An empty `items` disables the trigger and drops the target out of the tab order, so right-click
 * falls through to the browser's own menu (no dead-end empty panel — the `cae-menubar` empty-items
 * rule, applied to the target). Parity extras (nested submenus, rich items, groups,
 * global/programmatic open, per-target data) are tracked in #158.
 *
 * CDK Menu is behaviour-only (unlike the auto-styled `MatMenu`), so the panel and items are
 * styled here, token-only. The panel renders inside a CDK overlay (outside this component's
 * view), which emulated encapsulation would not reach — hence `ViewEncapsulation.None` with
 * BEM-namespaced `cae-context-menu__*` classes. Zoneless-compatible: `OnPush` + signals.
 */
@Component({
  selector: 'cae-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [CdkContextMenuTrigger, CdkMenu, CdkMenuItem],
  template: `
    <div
      class="cae-context-menu__target"
      [tabindex]="items().length ? 0 : -1"
      [cdkContextMenuTriggerFor]="panel"
      [cdkContextMenuDisabled]="items().length === 0"
    >
      <ng-content />
    </div>

    <ng-template #panel>
      <div cdkMenu class="cae-context-menu__panel">
        @for (item of items(); track $index) {
          <button
            cdkMenuItem
            type="button"
            class="cae-context-menu__item"
            [cdkMenuItemDisabled]="item.disabled ?? false"
            (cdkMenuItemTriggered)="itemSelect.emit(item)"
          >
            {{ item.label }}
          </button>
        }
      </div>
    </ng-template>
  `,
  styles: `
    cae-context-menu {
      display: contents;
    }

    /* A real box (not display:contents, which is not reliably focusable) so the target can hold
       tabindex + a focus ring — the keyboard route to the context menu (Menu key / Shift+F10). */
    .cae-context-menu__target {
      display: block;
    }

    .cae-context-menu__target:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
    }

    .cae-context-menu__panel {
      display: flex;
      flex-direction: column;
      min-inline-size: 12rem;
      margin: 0;
      padding-block: var(--cae-space-1);
      background: var(--mat-sys-surface-container-high, var(--mat-sys-surface));
      color: var(--mat-sys-on-surface);
      border-radius: var(--mat-sys-corner-extra-small);
      box-shadow: var(--cae-elevation-2);
      outline: none;
    }

    .cae-context-menu__item {
      display: flex;
      align-items: center;
      gap: var(--cae-space-2);
      inline-size: 100%;
      min-block-size: 2.25rem;
      padding-block: var(--cae-space-2);
      padding-inline: var(--cae-space-4);
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .cae-context-menu__item:hover:not(.cdk-menu-item-disabled) {
      background: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
    }

    /* The CDK key manager roves onto disabled items too (skipPredicate is off), so the focus ring
       is on every roved item; only the enabled ones also get the activatable-hover tint. */
    .cae-context-menu__item:focus {
      outline: var(--cae-focus-ring);
      outline-offset: calc(-1 * var(--cae-focus-ring-width));
    }

    .cae-context-menu__item:focus:not(.cdk-menu-item-disabled) {
      background: color-mix(in srgb, var(--mat-sys-on-surface) 12%, transparent);
    }

    .cae-context-menu__item.cdk-menu-item-disabled {
      color: var(--mat-sys-on-surface-variant);
      opacity: 0.5;
      cursor: default;
    }
  `,
})
export class CaeContextMenu {
  /** The context-menu items, as data (shared `CaeMenuItem` shape). Empty disables the menu. */
  readonly items = input<readonly CaeMenuItem[]>([]);
  /** Emits the chosen item when a menu item is activated (click or keyboard). */
  readonly itemSelect = output<CaeMenuItem>();
}
