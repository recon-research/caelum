import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  effect,
  forwardRef,
  inject,
  input,
  output,
  type TemplateRef,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatMenu, MatMenuItem, MatMenuTrigger, type MatMenuPanel } from '@angular/material/menu';
import type { CaeMenuPanelHost } from '@recon-research/caelum/shared';
import { CaeIcon, caeItemIconContext, type CaeItemIconContext } from '@recon-research/caelum/icon';

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
   * Honoured by every component that consumes this interface — `cae-menu` itself, the menus
   * embedded in `cae-split-button` / `cae-menubar`, and `cae-context-menu` — so one item
   * array renders the same icons wherever it is bound.
   */
  icon?: string;
  /**
   * Optional link target. A leaf carrying a `url` is a *navigation* item: `cae-panel-menu`
   * renders it as a real focusable `<a href>` (data-driven nav) rather than a command button.
   * The flat, action-oriented menus (`cae-menu`, `cae-split-button`, `cae-menubar`,
   * `cae-context-menu`) ignore it today and always emit `(itemSelect)`; first-class
   * `routerLink`-driven navigation is the optional-peer follow-up shape from D-595 (#150/#165).
   */
  url?: string;
  /**
   * Optional nested children — the item is a *branch*. Self-referential so one model describes a
   * whole tree, matching PrimeNG's universal `MenuItem` shape.
   *
   * **`cae-menu` renders these as tiered submenus** (#150 — how COMPARISON maps `p-tieredmenu`;
   * there is no separate `cae-tiered-menu` component planned), to any depth, and so do the menus
   * embedded in `cae-split-button` / `cae-menubar`. A branch is **navigational, not selectable**:
   * activating it opens its submenu and emits nothing, so `(itemSelect)` only ever carries a leaf
   * (Book 09 §3.5 draws the same line for CascadeSelect's intermediate nodes). An **empty** `items`
   * array is not a branch — that item renders as an ordinary leaf rather than a dead-end panel.
   * `cae-panel-menu` recurses on the same field, rendering a branch as a collapsible section.
   * `cae-context-menu` is the one family member that does not (it wraps CDK Menu, not `MatMenu`) —
   * that arm is #158.
   *
   * **Two preconditions, both introduced by the #150 recursion:**
   * - **The graph must be a finite tree.** A cycle (`a.items = [a]`, or a mutual pair) recurses
   *   until the stack overflows, and it happens at the first change detection — not on open, since
   *   a branch's nested menu is projected content that is *created* eagerly even though its DOM is
   *   only inserted when the panel opens. Material's own recursion guard cannot catch this: it
   *   trips only when a panel is its own direct parent, and here every level is a distinct
   *   instance. A dev-mode cycle check is #877.
   * - **Item objects need stable identity, and must be distinct within a level.** Rows track by
   *   item identity (see the template), so binding a freshly-built array of fresh objects on every
   *   change detection — `[items]="buildItems()"` with a non-memoised method — now destroys and
   *   recreates every row each pass, which drops focus and closes any open submenu. Hold the model
   *   in a `signal` or a `readonly` field. Repeating one object twice in a level is a dev-mode
   *   duplicate-key warning plus unreliable view reuse on reorder.
   */
  items?: readonly CaeMenuItem[];
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
 * **Tiered submenus (#150).** An item carrying nested `items` is a *branch*: it stamps its own
 * nested panel and opens it, to any depth, which is how COMPARISON maps `p-tieredmenu` (no separate
 * `cae-tiered-menu` component is planned). Book 09 §3.4 reaches for CDK Menu when building a
 * *dedicated* tiered-menu component; here the component already exists as a `MatMenu` Direct wrap
 * (D-01/D-02), and `MatMenu` implements every invariant that section names for nesting — verified
 * in its source, not assumed: `aria-haspopup`/`aria-expanded`/`aria-controls` on the branch row, a
 * decorative chevron, hover-open, no backdrop on a submenu, `Escape` closing one level, and
 * **RTL-aware** arrow traversal (right opens / left closes in LTR, mirrored in RTL). Roving focus
 * stays per-level because the recursion is a **component**: `MatMenu` collects its rows with a
 * content query, and a content query does not cross a component's view boundary, so a parent panel
 * never sees a nested level's rows at all. (Material *also* filters by each row's injected parent
 * panel, but that filter is a no-op here — and naming it as the reason would be actively
 * misleading, because it is exactly what would NOT have saved the `ng-template` draft described
 * below: with a template there is no view boundary, the nested rows ARE matched, and they inject
 * the outer panel.) So the submenu behaviour here is Material's, and this component supplies only
 * the recursion — rebuilding it on CDK Menu would rewrite a shipped Direct wrapper to
 * re-implement what it already inherits.
 *
 * **The recursion is the COMPONENT, not an `ng-template`** — the one shape choice here, and it is
 * forced. `MatMenu` finds its rows by `@ContentChildren` and each row finds its owning panel by
 * DI, and **both follow where a template is *declared*, not where its view is inserted**. A
 * recursive `<ng-template>` + `ngTemplateOutlet` (the `cae-panel-menu` idiom, which is fine there
 * because an expansion panel needs neither) is declared *outside* `<mat-menu>`, so the panel's
 * content query matched **zero** items — silently killing roving focus and typeahead — while every
 * would-be submenu trigger failed to see a parent panel and opened as a standalone menu that
 * closed its own parent. Measured, not deduced: an early draft of this component did exactly that
 * and its rendering looked correct. A branch therefore stamps a nested `cae-menu`, whose rows are
 * declared inside *its* `<mat-menu>`, and is wired up through the same public `[items]` input and
 * `getMenuPanel()` seam the consumer's own trigger uses.
 *
 * **Two template decisions worth knowing, kept here rather than inline** — HTML comments inside a
 * `template:` literal are string content, so they are *not* minified away and the per-entry-point
 * size gate charges for them, while this JSDoc is free:
 * - **Rows track by item identity, not `$index`.** `cae-menu` used to be a pure renderer (every row
 *   a stateless button), which is what made `$index` safe; a branch is not, because its submenu's
 *   open/closed state lives inside `MatMenuTrigger` and is never bound here. Under `$index` a
 *   removed branch hands that open state to whatever item slides into its position — the #774
 *   defect `cae-panel-menu` already carries a guard for. `$index` still feeds the icon template's
 *   positional index, which is genuinely about position, and is per-level.
 * - **`xPosition`/`yPosition` are not forwarded to a submenu.** They describe where the ROOT panel
 *   sits relative to its trigger, which is not a statement about the whole tree, so a submenu keeps
 *   Material's own side and the flexible strategy's edge fallbacks. Forwarding would be *visible*
 *   rather than inert — Material's submenu placement reads `menu.xPosition` — so whether a
 *   consumer expects the root's side to cascade is a real parity question, deferred to #875.
 *
 * Theme comes free through the token bridge. Zoneless-compatible: `OnPush` + signal state,
 * no zone-coupled APIs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Self-import: a branch renders a nested `cae-menu`. `forwardRef` because the class is still
  // being defined while this decorator is evaluated.
  imports: [
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    NgTemplateOutlet,
    CaeIcon,
    forwardRef(() => CaeMenu),
  ],
  template: `
    <!-- aria-label: '' yields an absent attribute (MatMenu maps it); see the class doc. -->
    <mat-menu [xPosition]="xPosition()" [yPosition]="yPosition()" [aria-label]="ariaLabel()">
      @for (item of items(); track item; let i = $index) {
        <!-- track item, NOT $index — a branch's open state is unbound (#774). See the class doc. -->
        @if (item.items?.length) {
          <button
            mat-menu-item
            [disabled]="item.disabled ?? false"
            [matMenuTriggerFor]="child.getMenuPanel() ?? null"
          >
            <ng-container
              [ngTemplateOutlet]="row"
              [ngTemplateOutletContext]="{ $implicit: item, index: i }"
            />
          </button>
          <!-- The recursion. xPosition/yPosition deliberately NOT forwarded (#875). -->
          <cae-menu
            #child
            [items]="item.items ?? []"
            [iconTemplate]="iconTemplate()"
            [ariaLabel]="item.label"
            (itemSelect)="itemSelect.emit($event)"
          />
        } @else {
          <button mat-menu-item [disabled]="item.disabled ?? false" (click)="itemSelect.emit(item)">
            <ng-container
              [ngTemplateOutlet]="row"
              [ngTemplateOutletContext]="{ $implicit: item, index: i }"
            />
          </button>
        }
      }
    </mat-menu>

    <!-- Row contents, shared by both arms; Material adds the branch chevron itself. -->
    <ng-template #row let-item let-index="index">
      @if (iconTemplate(); as tpl) {
        <ng-container
          [ngTemplateOutlet]="tpl"
          [ngTemplateOutletContext]="iconContext(item, index)"
        />
      } @else if (item.icon) {
        <cae-icon class="cae-menu__icon" [name]="item.icon" />
      }
      {{ item.label }}
    </ng-template>
  `,
  styles: `
    /* Renders nothing itself — every panel it owns is stamped into a CDK overlay, detached from
       this host. Without this the host is an empty INLINE box, which is harmless inside a menu
       panel (a block container: an empty inline with no margin/padding/border yields a line box
       treated as not existing) but NOT in the flow content where consumers actually place it: a
       flex or grid parent blockifies it into a real item, and gap then applies to it. Forge's own
       header is display:flex with gap:var(--cae-space-3) and a cae-menu sitting between two
       buttons, so the missing rule cost one stray gap; cae-menubar had already patched the same
       thing locally from the outside. Mirrors Material's own unencapsulated mat-menu display:none.
       Measured in menu.browser.spec.ts — in BOTH contexts, because an early draft tested only the
       menu-panel one, measured no difference, and wrongly deleted the rule as inert. */
    :host {
      display: none;
    }
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
  /**
   * Accessible name for the panel itself (`role="menu"`), for the case where the trigger's own name
   * does not describe the list — e.g. two menus opened from icon-only buttons.
   *
   * A **submenu sets this for itself**: a branch names its child panel with the branch's label, so
   * a screen-reader user arriving at level 2 or 3 hears which group they are in rather than a bare
   * "menu". `aria-controls` on the branch row supplies the *association*, not a name, and no axe
   * rule covers it — WAI-ARIA APG's menubar pattern names each submenu container from its parent
   * item, which is what this reproduces (#150). Consumers can still override it per level by
   * binding a nested `cae-menu` themselves.
   */
  readonly ariaLabel = input('');
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
   *
   * Stays an unqualified by-type query even though #150 made this component recursive: a branch's
   * nested panel belongs to a nested `cae-menu`'s OWN view, and a view query does not cross a
   * component boundary — so exactly one `<mat-menu>` is ever in scope here. (Pinning it to a
   * template ref was tried and dropped: mutation-testing showed the pin could not change any
   * outcome, and an inert guard is worse than none — it implies a hazard that is not there.)
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

  /** Context builder for {@link iconTemplate} — the single-homed D-596 helper (#649). */
  protected readonly iconContext = caeItemIconContext;
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
