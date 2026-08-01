import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  isDevMode,
  output,
  type TemplateRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CaeAccordion, CaeExpansionPanel } from '@recon-research/caelum/accordion';
import type { CaeMenuItem } from '@recon-research/caelum/menu';
import { CaeIcon, caeItemIconContext, type CaeItemIconContext } from '@recon-research/caelum/icon';

/**
 * Arrow-key roving over the leaf rows of ONE level (a panel's own item list, #665). Applied to every
 * leaf `<a>`/`<button>` `cae-panel-menu` renders. Enter/Space stay native — the leaf is a real link or
 * button — so this only adds the vertical Arrow/Home/End traversal a navigation list is expected to
 * offer. It is deliberately scoped by the nearest `.cae-panel-menu__group` (the level's accordion): a
 * nested level lives in its own group, so a deeper level's leaves are filtered out and the roving never
 * leaks across a panel boundary. The leaves stay natural Tab stops too (no roving `tabindex`), so Tab
 * still walks the whole menu — Arrow is an addition, not a replacement (the accordion headers keep
 * their own Tab model; inter-header Arrow roving is the accordion's deferral, #79).
 */
@Directive({
  selector: '[caePanelMenuLeaf]',
  host: {
    '(keydown)': 'onKeydown($event)',
  },
})
export class CaePanelMenuLeaf {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  onKeydown(event: KeyboardEvent): void {
    const key = event.key;
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return;
    const el = this.host.nativeElement;
    const group = el.closest('.cae-panel-menu__group');
    if (!group) return;
    // This level's enabled leaves only: a candidate whose nearest group is a DEEPER accordion
    // (a nested, possibly-expanded panel) is excluded, so Arrow never crosses into a sub-level.
    const leaves = Array.from(
      group.querySelectorAll<HTMLElement>('.cae-panel-menu__leaf:not([disabled])'),
    ).filter((leaf) => leaf.closest('.cae-panel-menu__group') === group);
    if (leaves.length === 0) return;
    const current = leaves.indexOf(el);
    let next: number;
    switch (key) {
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = leaves.length - 1;
        break;
      case 'ArrowDown':
        next = current < 0 ? 0 : (current + 1) % leaves.length;
        break;
      default: // ArrowUp
        next = current <= 0 ? leaves.length - 1 : current - 1;
        break;
    }
    event.preventDefault();
    leaves[next]?.focus();
  }
}

/**
 * `cae-panel-menu` — the data-driven, multi-level navigation menu (`reference/COMPARISON.md`:
 * `p-panelmenu` → `cae-panel-menu`; Book 09 §3.4). It **composes** the shipped `caelum/accordion`
 * for its collapsible sections rather than re-implementing expansion/animation/multi-open (the
 * "already in the codebase" rung of the laziest-sufficient ladder), and binds the shipped
 * {@link CaeMenuItem} model — a branch is any item with nested `items`, a leaf is any item without.
 *
 * ```html
 * <cae-panel-menu [model]="nav" ariaLabel="Workspace" [multiple]="true" />
 * ```
 *
 * **Structure & semantics.** The whole component is a single `<nav>` landmark with an accessible
 * name (`ariaLabel`, dev-warned when missing). Top-level branches render as `cae-expansion-panel`
 * headers inside one `cae-accordion`; each panel body recurses the same rendering for its children,
 * so depth is unbounded (a nested branch is another accordion). Leaves are real controls: an item
 * with a `url` is a focusable `<a href>` (data-driven navigation), an item without is a `<button>`
 * that emits `(itemSelect)` — so keyboard, focus, and the accessible name (the label) are native.
 *
 * **Model updates.** Items are tracked by **object identity**, so a panel's open/closed state follows
 * its item rather than its position — filtering or reordering `model` leaves the surviving branches
 * as the user left them (#774). The corollary is a consumer contract: keep item object references
 * stable across updates. Rebuilding the array with fresh object literals on every change re-stamps
 * the panels and resets expansion, so derive the model once (or memoize it) rather than constructing
 * it inside a template expression.
 *
 * **Keyboard.** Expansion headers follow the accordion's own model (Tab to reach, Enter/Space to
 * toggle; inter-header Arrow roving is the accordion's deferral, #79). Within a panel's item list,
 * Arrow-Up/Down + Home/End rove the leaves (see {@link CaePanelMenuLeaf}); Enter/Space activate them
 * natively. `[multiple]` allows several panels open at once, delegated straight to `cae-accordion`.
 *
 * **Icons** follow the D-596 convention on the leaves: `item.icon` names a built-in glyph, and the
 * component-level `iconTemplate` overrides it per item (built with the single-homed
 * {@link caeItemIconContext}, #649). Icons on the *branch headers* wait on the rich
 * expansion-panel header slot (#78) — today a header is its label text.
 *
 * **Rows track by item identity, not `$index`** (kept in the JSDoc, not the template, because
 * template comments are string content that ships and is charged by the size gate). Every menu
 * whose rendered child owns *unbound* state needs this: an expansion panel's open/closed flag lives
 * inside Material and is never bound here, so `$index` reuse hands a surviving panel's open state to
 * whatever item lands on that position — drop the expanded branch and its collapsed sibling renders
 * expanded (#774). `cae-menu` joined the same rule at #150, when its branches gained submenus (a
 * `MatMenuTrigger`'s open state is unbound in exactly the same way). Family audit, so the next
 * reader need not redo it: `cae-context-menu` is genuinely exempt (flat rows, no trigger per row,
 * until #158 gives it submenus), and **`cae-menubar` joined the rule at #879** — it stamps a trigger
 * per group, so it carried this defect until that slice moved it to `track group`.
 *
 * Router-linked leaves (`routerLink`/`routerLinkActive`) are the optional-peer follow-up from D-595
 * (#150/#165); per-item disabled decorations and badges/suffixes are follow-ups too. Token-only
 * theming through the bridge; zoneless-compatible (`OnPush` + signal state; provisional on #9).
 */
@Component({
  selector: 'cae-panel-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeAccordion, CaeExpansionPanel, CaeIcon, NgTemplateOutlet, CaePanelMenuLeaf],
  template: `
    <nav class="cae-panel-menu" [attr.aria-label]="ariaLabel() || null">
      <ng-container [ngTemplateOutlet]="level" [ngTemplateOutletContext]="{ $implicit: model() }" />
    </nav>

    <ng-template #level let-items>
      <cae-accordion class="cae-panel-menu__group" [multiple]="multiple()">
        <!-- track item, NOT $index — an expansion panel's open flag is unbound (#774). Family
             audit in the class doc; cae-menubar's exception is #879. -->
        @for (item of items; track item; let i = $index) {
          @if (isBranch(item)) {
            <cae-expansion-panel [title]="item.label" [disabled]="item.disabled ?? false">
              <ng-container
                [ngTemplateOutlet]="level"
                [ngTemplateOutletContext]="{ $implicit: item.items }"
              />
            </cae-expansion-panel>
          } @else if (item.url && !rowDisabled(item)) {
            <a class="cae-panel-menu__leaf" caePanelMenuLeaf [href]="item.url">
              <ng-container
                [ngTemplateOutlet]="leaf"
                [ngTemplateOutletContext]="{ $implicit: item, index: i }"
              />
            </a>
          } @else {
            <button
              type="button"
              class="cae-panel-menu__leaf"
              caePanelMenuLeaf
              [disabled]="rowDisabled(item)"
              (click)="activate(item)"
            >
              <ng-container
                [ngTemplateOutlet]="leaf"
                [ngTemplateOutletContext]="{ $implicit: item, index: i }"
              />
            </button>
          }
        }
      </cae-accordion>
    </ng-template>

    <ng-template #leaf let-item let-index="index">
      @if (iconTemplate(); as tpl) {
        <ng-container
          [ngTemplateOutlet]="tpl"
          [ngTemplateOutletContext]="iconContext(item, index)"
        />
      } @else if (item.icon) {
        <cae-icon class="cae-panel-menu__icon" [name]="item.icon" />
      }
      <span class="cae-panel-menu__label">{{ item.label }}</span>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-panel-menu__leaf {
      display: flex;
      align-items: center;
      gap: var(--cae-space-2);
      inline-size: 100%;
      /* A NEW interactive affordance floors its hit target with the invariant target token, not a
         spacing step (else compact density undershoots the 24px WCAG 2.5.8 minimum). */
      min-block-size: var(--cae-target-min);
      padding-block: var(--cae-space-1);
      padding-inline: var(--cae-space-3);
      box-sizing: border-box;
      border: none;
      border-radius: var(--cae-radius-sm);
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: start;
      text-decoration: none;
      cursor: pointer;
    }
    .cae-panel-menu__leaf:hover {
      background: var(--cae-surface-sunken);
    }
    .cae-panel-menu__leaf:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
    }
    .cae-panel-menu__leaf:disabled {
      cursor: default;
      opacity: 0.5;
    }
    .cae-panel-menu__icon {
      flex: none;
    }
    .cae-panel-menu__label {
      min-inline-size: 0;
    }
  `,
})
export class CaePanelMenu {
  /**
   * The menu tree, as data. Reuses the shipped {@link CaeMenuItem} model: a branch is any item with
   * a non-empty `items`, a leaf is any item without. Icons via `item.icon`; navigation leaves via
   * `item.url`.
   */
  readonly model = input<readonly CaeMenuItem[]>([]);
  /** Accessible name for the `<nav>` landmark (required in practice — dev-warned when empty). */
  readonly ariaLabel = input('');
  /** Allow more than one top-level section open at once — delegated to `cae-accordion` (`multi`). */
  readonly multiple = input(false, { transform: booleanAttribute });
  /**
   * Consumer escape hatch for the per-item icon slot (D-596): an `ng-template` receiving
   * `{ $implicit: item, index }` (`let-item`, `let-index="index"`), stamped once per leaf *instead
   * of* the built-in `item.icon` glyph — the template wins whenever both are supplied. The template
   * owns its own spacing and accessibility (keep glyphs decorative; the leaf's accessible name is
   * its label).
   */
  readonly iconTemplate = input<TemplateRef<CaeItemIconContext<CaeMenuItem>> | null>(null);
  /** Emits the activated leaf — a command item (one without a `url`). Navigation leaves follow their
   * `href` natively and do not emit. */
  readonly itemSelect = output<CaeMenuItem>();

  /** Context builder for {@link iconTemplate} — the single-homed D-596 helper (#649). */
  protected readonly iconContext = caeItemIconContext;

  /**
   * The items reachable from {@link model} that sit on a cycle — recomputed only when the model
   * changes. See {@link findMenuCycles} for why the detection is node-scoped.
   */
  private readonly cyclicItems = computed(() => findMenuCycles(this.model()));

  constructor() {
    if (isDevMode()) {
      // A <nav> without an accessible name is an unlabelled landmark — indistinguishable from any
      // other nav to a screen-reader user. Silent when a name is set.
      effect(() => {
        if (!this.ariaLabel()) {
          console.warn(
            'cae-panel-menu: set [ariaLabel] so the <nav> landmark has an accessible name (#665).',
          );
        }
      });
      // Dev-only DIAGNOSTIC for a cycle (#960). The break itself is NOT dev-gated — it lives in
      // `isBranch`, so a production build renders a broken model inertly rather than overflowing
      // the stack (#955: a behaviour effect wrapped in isDevMode() is a defect; a warning is not).
      effect(() => {
        for (const item of this.cyclicItems()) {
          console.warn(
            `cae-panel-menu: "${item.label}" is on a cycle in CaeMenuItem.items, which must be a ` +
              'finite graph. Rendered as a disabled leaf; recursing would not terminate.',
          );
        }
      });
    }
  }

  /**
   * Whether `item` renders as a collapsible section rather than a leaf. It must have children, and
   * it must not sit on a cycle — stopping there is what bounds the recursion (#960).
   *
   * Unlike `cae-menu`, an all-disabled branch is left alone here. That rule exists there because
   * Material parks focus on an empty `role="menu"` panel with no way out but Escape (#880); an
   * expansion panel has no such trap — its header stays focusable and its disabled rows are simply
   * inert — so disabling the section would remove information for no accessibility gain.
   */
  protected isBranch(item: CaeMenuItem): boolean {
    return !!item.items?.length && !this.cyclicItems().has(item);
  }

  /** Whether the row for `item` is non-interactive: the consumer disabled it, or it is a cycle break. */
  protected rowDisabled(item: CaeMenuItem): boolean {
    return (item.disabled ?? false) || this.cyclicItems().has(item);
  }

  /** Activate a command leaf: no-op if disabled; otherwise emit it. */
  protected activate(item: CaeMenuItem): void {
    if (this.rowDisabled(item)) return;
    this.itemSelect.emit(item);
  }
}

/**
 * The items on a cycle in the graph reachable from `roots`, by colouring DFS: an item still on the
 * current path is a back edge, and back edges are exactly the cycles. Recursion stops at the *first*
 * sighting, so this is `O(V+E)` — a path-scoped guard ("is this one of my ancestors") would
 * terminate without *bounding*, unrolling every simple path through a dense cycle (`cae-menu`
 * measured 1957 panels / 2377 ms at seven nodes before that version was replaced, #877).
 *
 * `done` is what keeps it linear, and it is also why a legal **DAG still renders in full**: a
 * subtree shared by two sibling branches is re-entered, found already finished rather than on the
 * path, and skipped for cycle purposes only. A visited-ever check that conflated the two would kill
 * exactly that case, which is why it has its own spec.
 *
 * **Deliberately a second copy of `cae-menu`'s traversal, not a shared import** (#960). The natural
 * home for a shared helper would be `caelum/shared`, which is type-only by construction — a 64-byte
 * budget, and the reason `cae-button` can name the menu seam without dragging menu code into every
 * button bundle. The alternative, importing from `caelum/menu`, would put `@angular/material/menu`
 * in the dependency graph of every `cae-panel-menu` consumer to reuse fifteen lines. Consolidating
 * the two (a `caelum/menu-model` entry point holding `CaeMenuItem` and its graph utilities) is a
 * public-API question, filed as #968. Note the copies are not identical: `cae-menu` needs dead ends
 * as well, so its version is bottom-up (`analyseMenuGraph`).
 */
function findMenuCycles(roots: readonly CaeMenuItem[]): ReadonlySet<CaeMenuItem> {
  const onPath = new Set<CaeMenuItem>();
  const done = new Set<CaeMenuItem>();
  const cyclic = new Set<CaeMenuItem>();
  const walk = (item: CaeMenuItem): void => {
    if (onPath.has(item)) {
      cyclic.add(item);
      return;
    }
    if (done.has(item)) return;
    onPath.add(item);
    for (const child of item.items ?? []) walk(child);
    onPath.delete(item);
    done.add(item);
  };
  for (const root of roots) walk(root);
  return cyclic;
}
