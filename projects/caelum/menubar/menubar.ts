import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  QueryList,
  signal,
  type TemplateRef,
  ViewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FocusableOption, FocusKeyManager } from '@angular/cdk/a11y';
import { DOWN_ARROW, UP_ARROW } from '@angular/cdk/keycodes';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { CaeMenu, CaeMenuTrigger, type CaeMenuItem } from 'caelum/menu';
import type { CaeItemIconContext } from 'caelum/icon';

/**
 * A top-level group in a {@link CaeMenubar} — a labelled trigger that opens a flat dropdown of
 * actions. `items` reuses `cae-menu`'s {@link CaeMenuItem}; for per-item icons see
 * {@link CaeMenubar.iconTemplate}. Nested/tiered submenus and other rich items (router links,
 * commands) are follow-ups (`cae-tiered-menu` / #150).
 */
export interface CaeMenubarItem {
  /** Visible label on the bar; also the trigger's accessible name. */
  label: string;
  /** The dropdown items for this group. */
  items: readonly CaeMenuItem[];
  /** Disable the whole group — its trigger is out of the tab order and skipped by roving. */
  disabled?: boolean;
}

/**
 * Internal roving item for the menubar's top-level triggers — a {@link FocusableOption} so a
 * `FocusKeyManager` (Book 05 §3.2) can move focus across the bar (Left/Right/Home/End + typeahead,
 * skip-disabled). Not exported: it exists only to give the key manager focusable, labelled,
 * disable-aware handles onto the trigger `<button>`s.
 */
/**
 * @internal — Angular requires a class in a component's `imports` to be exported from its file, so
 * this is `export`ed here, but `caelum/menubar`'s `public-api.ts` deliberately does NOT re-export it:
 * it is not part of the public API surface (a consumer never references it).
 */
@Directive({
  selector: '[caeMenubarItem]',
  host: { role: 'menuitem' },
})
export class MenubarTriggerItem implements FocusableOption {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Mirrors the group's effective disabled state so the key manager can skip it. */
  readonly menubarDisabled = input(false);
  get disabled(): boolean {
    return this.menubarDisabled();
  }
  focus(): void {
    this.el.nativeElement.focus();
  }
  /** Typeahead label — the trigger's own visible text. */
  getLabel(): string {
    return this.el.nativeElement.textContent?.trim() ?? '';
  }
}

/**
 * `cae-menubar` — a **composed** horizontal application menu bar (COMPARISON: `p-menubar` →
 * `cae-menubar`; `MatToolbar` + `MatMenu`, Compose; Book 09 §3.4 — "the common case, already
 * accessible, already overlay-backed"). The flagship M1 composed widget and the continuation of
 * the composed-over-composed arc: `cae-menu` → `cae-split-button` → `cae-menubar`.
 *
 * ```html
 * <cae-menubar [model]="groups" ariaLabel="Main" (itemSelect)="run($event)" />
 * ```
 *
 * **Composition (M1 §5b thesis).** A `MatToolbar` shell (`role="menubar"`, token surface for free)
 * holds one native `<button matButton>` per group (owned here, so `type="button"` is explicit — a
 * bare `matButton` defaults to `type="submit"` and would submit an enclosing form, the #148 tax);
 * each trigger opens an **embedded `cae-menu`** carrying that group's items, so `role="menu"`, item
 * navigation, `Escape`-closes-and-restores, and `aria-haspopup`/`aria-expanded` all come free.
 *
 * **a11y.** The bar is a `role="menubar"`; each trigger is a `role="menuitem"`. A CDK
 * `FocusKeyManager` gives the bar roving focus — only the active trigger is tab-focusable, and
 * Left/Right/Home/End + typeahead move between them, skipping disabled groups. Down/Up open the
 * active group's panel and move focus into it (Material owns the panel-side keys + Escape-restore);
 * Enter/Space open it too via the native button. A group with no items is treated as disabled (no
 * dead-end empty menu). Name the bar with {@link ariaLabel}.
 *
 * **v1 scope** (#153): one level of dropdown (the common File▸/Edit▸ admin case). Follow-ups —
 * tiered/nested submenus (`cae-tiered-menu`), rich items (router links/commands, #150),
 * responsive overflow collapse, RTL roving.
 *
 * Zoneless-compatible: `OnPush` + signal state (D-12).
 */
@Component({
  selector: 'cae-menubar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbarModule, MatButtonModule, CaeMenu, CaeMenuTrigger, MenubarTriggerItem],
  template: `
    <mat-toolbar
      class="cae-menubar"
      role="menubar"
      [attr.aria-label]="ariaLabel() || null"
      (keydown)="onKeydown($event)"
    >
      @for (group of model(); track $index) {
        <button
          matButton
          type="button"
          caeMenubarItem
          class="cae-menubar__item"
          [menubarDisabled]="disabledGroup(group)"
          [disabled]="disabledGroup(group)"
          [tabindex]="$index === activeIndex() ? 0 : -1"
          [caeMenuTriggerFor]="groupMenu"
        >
          {{ group.label }}
        </button>
        <cae-menu
          #groupMenu
          [items]="group.items"
          [iconTemplate]="iconTemplate()"
          (itemSelect)="itemSelect.emit($event)"
        />
      }
    </mat-toolbar>
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-menubar {
      /* A slim command strip, not a page app-bar: drop the toolbar's tall default height. */
      block-size: auto;
      min-block-size: 0;
      gap: var(--cae-space-1);
      padding-inline: var(--cae-space-2);
    }
    .cae-menubar__item {
      /* Snug menu-item hit area rather than the wide default button min-width. */
      min-width: 0;
    }
    /* Each dropdown panel lives in a CDK overlay; the cae-menu host is empty inline — hide it so
       it never counts as a stray child of the role=menubar surface. */
    cae-menu {
      display: none;
    }
  `,
})
export class CaeMenubar implements AfterViewInit, OnDestroy {
  /** The menubar groups (each a top-level trigger + its dropdown items), as data. */
  readonly model = input<readonly CaeMenubarItem[]>([]);
  /** Accessible name for the bar (`role="menubar"`). */
  readonly ariaLabel = input('');
  /**
   * Consumer escape hatch for the per-item icon slot (D-596), forwarded verbatim to **every**
   * group's dropdown — one template governs the whole bar, matching how a single `icon` glyph
   * convention spans it. An `ng-template` receiving `{ $implicit: item, index }` (`let-item`,
   * `let-index="index"`), stamped per dropdown item *instead of* its built-in `item.icon`;
   * `index` is the item's position within **its own group**, not a bar-wide running count.
   * See `CaeMenu.iconTemplate` for the full contract.
   */
  readonly iconTemplate = input<TemplateRef<CaeItemIconContext<CaeMenuItem>> | null>(null);
  /** Emits the chosen dropdown item when one is activated (delegated from each `cae-menu`). */
  readonly itemSelect = output<CaeMenuItem>();

  /** Index of the roving-tabbable trigger — only it is in the tab order (roving tabindex). */
  protected readonly activeIndex = signal(0);

  private readonly destroyRef = inject(DestroyRef);
  @ViewChildren(MenubarTriggerItem) private readonly triggers!: QueryList<MenubarTriggerItem>;
  // The menu triggers, one per group, in the same order as `triggers` — so the active roving index
  // selects the trigger whose panel Down/Up should open.
  @ViewChildren(CaeMenuTrigger) private readonly menuTriggers!: QueryList<CaeMenuTrigger>;
  private keyManager?: FocusKeyManager<MenubarTriggerItem>;

  /** A group is effectively disabled when explicitly disabled OR it has no items (no dead-end menu). */
  protected disabledGroup(group: CaeMenubarItem): boolean {
    return (group.disabled ?? false) || group.items.length === 0;
  }

  ngAfterViewInit(): void {
    this.keyManager = new FocusKeyManager(this.triggers)
      .withHorizontalOrientation('ltr')
      // The bar is horizontal, so Up/Down don't rove — they open the active group's panel (below).
      .withVerticalOrientation(false)
      .withWrap()
      .withHomeAndEnd()
      .withTypeAhead()
      .skipPredicate((item) => item.disabled);
    this.keyManager.change
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((index) => this.activeIndex.set(index));
    // Point the roving tabindex at the first enabled trigger without stealing focus on load.
    const first = this.triggers.toArray().findIndex((t) => !t.disabled);
    this.keyManager.updateActiveItem(Math.max(first, 0));
    this.activeIndex.set(this.keyManager.activeItemIndex ?? 0);
  }

  ngOnDestroy(): void {
    // Tear down the manager's typeahead subscription (the CDK cleanup contract).
    this.keyManager?.destroy();
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Down/Up open the active group's panel (WAI-ARIA menubar) — Material focuses the first item.
    // Intercept before the key manager so they open rather than move focus along the bar.
    if (event.keyCode === DOWN_ARROW || event.keyCode === UP_ARROW) {
      event.preventDefault();
      this.menuTriggers?.get(this.activeIndex())?.open();
      return;
    }
    this.keyManager?.onKeydown(event);
  }
}
