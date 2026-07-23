import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
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
import { CaeAccordion, CaeExpansionPanel } from 'caelum/accordion';
import type { CaeMenuItem } from 'caelum/menu';
import { CaeIcon, caeItemIconContext, type CaeItemIconContext } from 'caelum/icon';

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
        @for (item of items; track $index; let i = $index) {
          @if (item.items?.length) {
            <cae-expansion-panel [title]="item.label" [disabled]="item.disabled ?? false">
              <ng-container
                [ngTemplateOutlet]="level"
                [ngTemplateOutletContext]="{ $implicit: item.items }"
              />
            </cae-expansion-panel>
          } @else if (item.url && !item.disabled) {
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
              [disabled]="item.disabled ?? false"
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
    /* A nested accordion sits inside a panel body; strip its default spacing so depth reads as
       indentation, not gaps. The body already indents via the expansion panel's padding. */
    .cae-panel-menu__group .cae-panel-menu__group {
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
    }
  }

  /** Activate a command leaf: no-op if disabled; otherwise emit it. */
  protected activate(item: CaeMenuItem): void {
    if (item.disabled) return;
    this.itemSelect.emit(item);
  }
}
