import {
  AfterViewInit,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  output,
  QueryList,
  signal,
  ViewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FocusableOption, FocusKeyManager } from '@angular/cdk/a11y';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { CaeMenu, CaeMenuTrigger, type CaeMenuItem } from 'caelum/menu';

/**
 * A top-level group in a {@link CaeMenubar} — a labelled trigger that opens a flat dropdown of
 * actions. `items` reuses `cae-menu`'s {@link CaeMenuItem}; nested/tiered submenus and rich items
 * (icons, router links, commands) are follow-ups (`cae-tiered-menu` / #150).
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
@Directive({
  selector: '[caeMenubarItem]',
  host: { role: 'menuitem' },
})
export class MenubarTriggerItem implements FocusableOption {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Mirrors the group's `disabled` flag so the key manager can skip it. */
  readonly menubarDisabled = input(false, { transform: booleanAttribute });
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
 * Left/Right/Home/End + typeahead move between them, skipping disabled groups; Down/Enter/Space
 * opens a panel (Material) and focus enters it. Name the bar with {@link ariaLabel}.
 *
 * **v1 scope** (#153): one level of dropdown (the common File▸/Edit▸ admin case). Follow-ups —
 * tiered/nested submenus (`cae-tiered-menu`), rich items (icons/router links/commands, #150),
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
          [menubarDisabled]="group.disabled ?? false"
          [disabled]="group.disabled ?? false"
          [tabindex]="$index === activeIndex() ? 0 : -1"
          [caeMenuTriggerFor]="groupMenu"
        >
          {{ group.label }}
        </button>
        <cae-menu #groupMenu [items]="group.items" (itemSelect)="itemSelect.emit($event)" />
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
export class CaeMenubar implements AfterViewInit {
  /** The menubar groups (each a top-level trigger + its dropdown items), as data. */
  readonly model = input<readonly CaeMenubarItem[]>([]);
  /** Accessible name for the bar (`role="menubar"`). */
  readonly ariaLabel = input('');
  /** Emits the chosen dropdown item when one is activated (delegated from each `cae-menu`). */
  readonly itemSelect = output<CaeMenuItem>();

  /** Index of the roving-tabbable trigger — only it is in the tab order (roving tabindex). */
  protected readonly activeIndex = signal(0);

  private readonly destroyRef = inject(DestroyRef);
  @ViewChildren(MenubarTriggerItem) private readonly triggers!: QueryList<MenubarTriggerItem>;
  private keyManager?: FocusKeyManager<MenubarTriggerItem>;

  ngAfterViewInit(): void {
    this.keyManager = new FocusKeyManager(this.triggers)
      .withHorizontalOrientation('ltr')
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

  protected onKeydown(event: KeyboardEvent): void {
    this.keyManager?.onKeydown(event);
  }
}
