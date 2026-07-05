import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';

/**
 * One item in a `cae-tab-menu` bar. Its `value` is the tab's identity — it is matched against
 * the two-way `activeValue` to decide which tab is `active`, and is carried by the whole item
 * on `(itemSelect)`. The interface is generic over the value type so a consumer can bind a
 * typed union (e.g. `'overview' | 'members'`) instead of bare strings; it defaults to `string`.
 */
export interface CaeTabMenuItem<TValue = string> {
  /** Visible label. */
  label: string;
  /** Identity of this tab — matched against `activeValue`, and emitted on selection. */
  value: TValue;
  /**
   * Disable just this tab. Per the ARIA disabled-tab pattern it stays keyboard-focusable (the
   * roving key manager still lands on it, and it reports `aria-disabled`) but cannot be
   * activated by click or keyboard.
   */
  disabled?: boolean;
}

/**
 * `cae-tab-menu` — the Direct wrapper over Material's `mat-tab-nav-bar` + `mat-tab-link`
 * (`reference/COMPARISON.md`: `p-tabMenu` → `cae-tab-menu`). A horizontal, tab-styled
 * navigation/selection bar: a row of tab links with a Material ink-bar under the active one and
 * full roving-keyboard accessibility (Left/Right/Home/End with wrap; Enter/Space activate).
 *
 * **Distinct from `cae-tabs`** (`p-tabs` → `mat-tab-group`, which owns and switches its content
 * panels): a tab-menu is a bar of links that *select* an item. The content shown for the active
 * item is the consumer's — projected into this component and swapped as `activeValue` changes.
 *
 * Data-driven: pass `[items]` (a `CaeTabMenuItem[]`); the active tab is the two-way
 * `[(activeValue)]`. Activating a tab (click, or Enter/Space) sets `activeValue` and emits
 * `(itemSelect)`. Because `activeValue` is a `model`, a click highlights the tab immediately
 * whether or not the consumer two-way-binds it — it updates its own state, then reports the
 * change (matching `p-tabMenu`, which tracks the active item itself).
 *
 * ```html
 * <cae-tab-menu [items]="sections" [(activeValue)]="section" ariaLabel="Workspace sections">
 *   @switch (section()) {
 *     @case ('overview') { … }
 *     @case ('members') { … }
 *   }
 * </cae-tab-menu>
 * ```
 *
 * The active value is `TValue | undefined` — `undefined` is a real state (no tab active), so a
 * consumer holding it in a signal types it `signal<T | undefined>(…)`.
 *
 * **Accessibility** — Material renders the full ARIA *tabs* pattern here (not the link/landmark
 * one): the bar is `role="tablist"`, each link `role="tab"` with `aria-selected`, and the
 * projected content is a `role="tabpanel"` wired to the tabs via `aria-controls`. This holds
 * because the wrapper *owns* the `mat-tab-nav-panel` internally — Material requires a
 * `[tabPanel]` (its nav bar throws without one) — and projects the consumer's content into it,
 * so the consumer never touches a Material type (adapter isolation, D-01/D-02). Disabled items
 * stay focusable but cannot activate.
 *
 * v1 is the manual-`active` model (the consumer owns which tab is active) — first-class
 * `p-tabMenu` parity. Router-linked mode (`routerLink` + `routerLinkActive`-driven `active`) and
 * per-item icons are deferred additive follow-ups (#165). Theme comes free through the token
 * bridge. Zoneless-compatible: `OnPush` + signal state (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-tab-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTabsModule],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="tabPanel" [attr.aria-label]="ariaLabel() || null">
      @for (item of items(); track item.value) {
        <!-- MatTabLink bridges keyboard activation to click internally: Enter/Space call the
             link's native click (verified — @angular/material tabs _handleKeydown), so (click)
             alone is the complete, keyboard-accessible activation path. A <button> would instead
             DOUBLE-fire (native + Material's synthetic click); the hrefless <a> is Material's own
             manual-nav pattern. The Enter-activation spec proves it. -->
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
        <a
          mat-tab-link
          [active]="item.value === activeValue()"
          [disabled]="item.disabled ?? false"
          (click)="select(item)"
        >
          {{ item.label }}
        </a>
      }
    </nav>
    <mat-tab-nav-panel #tabPanel>
      <ng-content />
    </mat-tab-nav-panel>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class CaeTabMenu<TValue = string> {
  /** The tab items, as data. */
  readonly items = input<readonly CaeTabMenuItem<TValue>[]>([]);
  /**
   * The active tab's `value`. Two-way bindable via `[(activeValue)]`; activating a tab sets it
   * (the model updates locally even when the consumer does not two-way-bind). `undefined` means
   * no tab is active.
   */
  readonly activeValue = model<TValue | undefined>(undefined);
  /** Accessible name for the tab list (`role="tablist"`). */
  readonly ariaLabel = input('');
  /**
   * Emits the chosen item when a tab is activated (click or keyboard). Fires only for enabled
   * tabs — a disabled tab cannot be activated.
   */
  readonly itemSelect = output<CaeTabMenuItem<TValue>>();

  /** Activate a tab: no-op if disabled; otherwise set `activeValue` and emit `itemSelect`. */
  protected select(item: CaeTabMenuItem<TValue>): void {
    if (item.disabled) return;
    this.activeValue.set(item.value);
    this.itemSelect.emit(item);
  }
}
