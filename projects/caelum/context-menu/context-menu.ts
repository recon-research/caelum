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
 * `cdkContextMenuTriggerFor` on the target opens a `cdkMenu` panel of `cdkMenuItem`s. All of
 * the a11y is free from those primitives (Book 09 §3.4 invariants): `role="menu"`/`menuitem`,
 * arrow-key roving + typeahead, Escape closes and restores focus, focus trap. The native
 * `contextmenu` event also fires for the keyboard Menu key / Shift+F10, so keyboard users
 * reach it too. `@angular/cdk` is already vendored, so this adds no dependency (D-11 clean).
 *
 * Items are data (`CaeMenuItem[]`, the same shape as `cae-menu`), so the whole family shares
 * one model. Wrap the right-clickable target as content:
 *
 * ```html
 * <cae-context-menu [items]="rowActions" (itemSelect)="run($event)">
 *   <div class="canvas">Right-click me</div>
 * </cae-context-menu>
 * ```
 *
 * An empty `items` disables the trigger, so right-click falls through to the browser's own
 * menu (no dead-end empty panel — the `cae-menubar` empty-items rule, applied to the target).
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
    cae-context-menu,
    .cae-context-menu__target {
      display: contents;
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

    .cae-context-menu__item:focus:not(.cdk-menu-item-disabled) {
      background: color-mix(in srgb, var(--mat-sys-on-surface) 12%, transparent);
      outline: none;
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
