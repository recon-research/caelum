import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
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
import {
  CaeMenu,
  caeMenuHasUsableItems,
  CaeMenuTrigger,
  type CaeMenuItem,
} from '@recon-research/caelum/menu';
import type { CaeItemIconContext } from '@recon-research/caelum/icon';

/**
 * A top-level group in a {@link CaeMenubar} — a labelled trigger that opens a flat dropdown of
 * actions. `items` reuses `cae-menu`'s {@link CaeMenuItem}; for per-item icons see
 * {@link CaeMenubar.iconTemplate}. **Nested/tiered submenus arrive for free** (#150): a group's
 * dropdown is a `cae-menu`, so any item with non-empty `items` is a submenu branch. Other rich
 * items (router links, commands) remain follow-ups on the model itself.
 */
export interface CaeMenubarItem {
  /** Visible label on the bar; also the trigger's accessible name. */
  label: string;
  /** The dropdown items for this group. */
  items: readonly CaeMenuItem[];
  /**
   * Disable the whole group. Its trigger is still **reachable by arrow keys** and announces itself
   * unavailable (`aria-disabled`, D-859); it just cannot be opened, and the roving tab stop seeds
   * past it. Before D-859 it was skipped outright, which hid the group from the keyboard entirely.
   */
  disabled?: boolean;
}

/**
 * Internal roving item for the menubar's top-level triggers — a {@link FocusableOption} so a
 * `FocusKeyManager` (Book 05 §3.2) can move focus across the bar (Left/Right/Home/End + typeahead;
 * dead groups are roved ONTO rather than skipped, D-859). Not exported: it exists only to give the
 * key manager focusable, labelled, disable-aware handles onto the trigger `<button>`s.
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
  /**
   * The menu trigger on **this** button, or `null` when the group is dead — D-859 two-branches the
   * template, so a dead trigger carries no `CaeMenuTrigger` at all.
   *
   * Resolved by DI from the same element rather than by a parallel `ViewChildren` index, which is
   * what this used to be. A `QueryList<CaeMenuTrigger>` now holds only the **live** triggers, so
   * `menuTriggers.get(activeIndex)` would name the wrong group the moment any *earlier* group went
   * dead — and `undefined` for the last one, silently doing nothing on Down. Reading it off the
   * roving item's own host makes the two physically incapable of disagreeing.
   */
  readonly menuTrigger = inject(CaeMenuTrigger, { optional: true, self: true });
  /** Mirrors the group's effective disabled state — dead groups are still announced, not skipped. */
  readonly menubarDisabled = input(false);
  get disabled(): boolean {
    return this.menubarDisabled();
  }
  /** The trigger's own `<button>` — the bar witnesses focus on it across a branch swap. */
  get element(): HTMLElement {
    return this.el.nativeElement;
  }
  /** Does this trigger's button contain `node`? (focus bookkeeping, see `CaeMenubar`.) */
  contains(node: Node | null): boolean {
    return !!node && this.el.nativeElement.contains(node);
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
 * Left/Right/Home/End + typeahead move between them **including** dead or disabled groups, which
 * take focus and announce themselves unavailable (`aria-disabled`, **D-859**) rather than vanishing
 * from the keyboard — so a user arrowing along the bar can still learn the group exists. Down/Up open the
 * active group's panel and move focus into it (Material owns the panel-side keys + Escape-restore);
 * Enter/Space open it too via the native button. A group with **nothing reachable behind it** is
 * treated as disabled (#961) — empty, all-disabled, or every branch bottoming out in disabled rows;
 * the bar asks `cae-menu`'s own question rather than a looser one. Name the bar with
 * {@link ariaLabel}.
 *
 * **Model updates — groups need stable identity** (#879, the family rule from #774). Groups track by
 * **object identity**, so a group's dropdown state follows the group it belongs to across a model
 * change. `$index` would be wrong here for the same reason it was wrong for `cae-expansion-panel`
 * (#774) and `cae-menu`'s branches (#150): a `caeMenuTriggerFor`'s open/closed state lives inside
 * Material and is never bound in this template, so a view reused at a position keeps it. Remove an
 * open group and the group that slid into its slot would appear **already open**, showing its own
 * items, having never been triggered. The cost of identity tracking is the usual one: rebuilding
 * `model()` into fresh object literals every change-detection pass re-creates every trigger and
 * panel, so hold the array (or its groups) stable.
 *
 * The contract has a **visible failure mode worth naming** (#977). Mutating a group's items *in
 * place* — `groups[0].items = [...]` on a stable `model` array — updates the **panel**, because
 * `[items]="group.items"` is a live binding, while leaving the **trigger's** dead/live verdict
 * stale: an in-place mutation touches no signal, so the OnPush row is never re-checked and the new
 * binding never reaches the DOM. The two then disagree — an enabled trigger over an empty panel, or
 * the reverse. This is the identity contract showing up as a *disagreement* rather than as nothing
 * happening, and it is not the `deadGroups` memo: keying that memo on `group.items` instead of
 * `model()` was measured and behaves identically, as does the pre-#961 `items.length === 0` check.
 * Replace the group (or the array) rather than mutating it; the alternative is a deep compare on
 * every change detection, which is not worth it at menubar scale.
 *
 * **v1 scope** (#153): one level of dropdown (the common File▸/Edit▸ admin case). Follow-ups —
 * rich items (router links/commands, #150),
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
      (focusin)="onFocusIn($event)"
    >
      <!-- track group, NOT $index — a trigger's open state is unbound (#774/#879). See the class doc. -->
      @for (group of model(); track group) {
        <!-- Declared before the triggers so the @else branch's caeMenuTriggerFor resolves a ref
             that already exists; cae-menu renders nothing inline (:host display none). -->
        <cae-menu
          #groupMenu
          [items]="group.items"
          [iconTemplate]="iconTemplate()"
          (itemSelect)="itemSelect.emit($event)"
        />
        <!-- D-859 two-branches on deadness, exactly as cae-button does for its own optional
             trigger (PATTERNS §4): the ONLY difference between the arms is caeMenuTriggerFor.
             It cannot be one button with a conditional binding — MatMenuTrigger host-binds
             attr.aria-expanded to menuOpen UNCONDITIONALLY (only aria-haspopup is nulled by a
             null menu), so a dead trigger would still announce as a collapsed disclosure. Keep
             the arms byte-identical apart from that line; the parity spec is the only guard. -->
        @if (disabledGroup(group)) {
          <button
            matButton
            type="button"
            caeMenubarItem
            class="cae-menubar__item"
            [menubarDisabled]="true"
            [disabled]="true"
            disabledInteractive
            [tabindex]="$index === activeIndex() ? 0 : -1"
          >
            {{ group.label }}
          </button>
        } @else {
          <button
            matButton
            type="button"
            caeMenubarItem
            class="cae-menubar__item"
            [menubarDisabled]="false"
            [disabled]="false"
            [tabindex]="$index === activeIndex() ? 0 : -1"
            [caeMenuTriggerFor]="groupMenu"
          >
            {{ group.label }}
          </button>
        }
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
  // One per group in model order, live or dead — D-859 keeps a dead group's button (and this
  // directive on it), dropping only the menu trigger, so this list stays index-aligned with
  // `model()`. Reach a group's trigger through `MenubarTriggerItem.menuTrigger`, never a second
  // QueryList: that one would hold only the live triggers and misalign (see that field's doc).
  @ViewChildren(MenubarTriggerItem) private readonly triggers!: QueryList<MenubarTriggerItem>;
  private keyManager?: FocusKeyManager<MenubarTriggerItem>;

  /**
   * The groups with nothing reachable behind them, resolved once per model change rather than per
   * binding — {@link disabledGroup} is read twice for every group on every change detection
   * (`menubarDisabled` and `disabled`), and the predicate walks that group's whole subtree.
   *
   * Keyed on `model()`, matching `CaeMenu.graph` and `CaeSplitButton.toggleDisabled`. A review
   * proposed keying it on `group.items` instead, so that swapping one group's items on a *stable*
   * model array would re-run — the worry being a trigger left disabled over a panel that
   * `[items]="group.items"` had already refreshed. **Measured, both keyings behave identically**,
   * and so does the pre-#961 `group.items.length === 0`: an in-place mutation touches no signal,
   * so the row view is never re-checked and the binding never reaches the DOM at all. The
   * staleness is the family's `model`-identity contract (see the class doc), not this memo — see
   * #975. Keying per items array would buy only skipping the re-walk of unchanged groups on a
   * model change, which at menubar scale is noise.
   */
  private readonly deadGroups = computed(
    () => new Set(this.model().filter((group) => !caeMenuHasUsableItems(group.items))),
  );

  /**
   * A group is effectively disabled when explicitly disabled OR its dropdown would open onto
   * nothing focusable — the family's no-dead-end rule (#961), asked the way `cae-menu` asks it.
   * This used to be `group.items.length === 0`, which covers only the *empty* arm: a group of one
   * disabled item, or one whose branches all bottom out in disabled rows (#962), is not empty, so
   * its trigger stayed enabled and Material parked focus on a panel answering no key but Escape.
   */
  protected disabledGroup(group: CaeMenubarItem): boolean {
    return (group.disabled ?? false) || this.deadGroups().has(group);
  }

  ngAfterViewInit(): void {
    this.keyManager = new FocusKeyManager(this.triggers)
      .withHorizontalOrientation('ltr')
      // The bar is horizontal, so Up/Down don't rove — they open the active group's panel (below).
      .withVerticalOrientation(false)
      .withWrap()
      .withHomeAndEnd()
      .withTypeAhead()
      // D-859: rove ONTO dead groups rather than skipping them. CDK's default is
      // `item => item.disabled` (`_list-key-manager-chunk.mjs`), which made a dead group vanish
      // from the keyboard entirely — a user arrowing along the bar could not learn it existed.
      // It now receives focus and announces itself unavailable (`aria-disabled`), matching how
      // `cae-context-menu` already roves onto disabled rows (PATTERNS §9). Down/Up still refuse to
      // open it, twice over: the guard in `onKeydown` and the absence of a trigger to call.
      .skipPredicate(() => false);
    this.keyManager.change
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((index) => this.activeIndex.set(index));
    // Point the roving tabindex at the first enabled trigger without stealing focus on load.
    this.seedActiveIndex();
    // …and re-seed whenever the rendered trigger set changes. Nothing else does: this hook runs
    // once, and CDK's `_itemsChanged` repairs the index only when it already holds a live item, so
    // a model that arrives ASYNCHRONOUSLY — the ordinary permissions/HTTP shape — seeds against an
    // empty QueryList and leaves `activeIndex` at 0. D-859 softened that consequence without
    // removing it: the bar's only `tabindex="0"` no longer sits on a *natively* disabled button —
    // a dead trigger is `aria-disabled` and focusable — so the menubar keeps its tab stop rather
    // than dropping out of the tab order entirely (the WCAG 2.1.1 break #974 fixed). What remains
    // is that the stop would land on the one group that cannot open, so seeding onto a live
    // trigger is still worth doing; it is now a quality-of-focus repair, not a rescue.
    this.triggers.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      // Focus first: if the swap took it, roving follows focus and there is nothing to re-seed.
      if (this.restoreFocusAfterSwap()) return;
      // Only when the index no longer names an operable trigger — re-seeding unconditionally would
      // yank the roving position back to the start on any model edit, which the roving specs catch.
      const current = this.triggers.get(this.activeIndex());
      if (current && !current.disabled) return;
      this.seedActiveIndex();
    });
  }

  /**
   * Witness for {@link restoreFocusAfterSwap} — the trigger that last held focus, captured on the
   * way IN because it cannot be recovered on the way out.
   */
  private focusWitness: { element: HTMLElement; index: number } | null = null;

  protected onFocusIn(event: FocusEvent): void {
    const index = this.triggers?.toArray().findIndex((t) => t.contains(event.target as Node)) ?? -1;
    const trigger = index < 0 ? null : this.triggers.get(index);
    this.focusWitness = trigger ? { element: trigger.element, index } : null;
  }

  /**
   * Keep focus on the group that had it when its trigger flips live↔dead (#977).
   *
   * D-859's two-branch template is what makes this necessary: a group going dead **destroys** the
   * focused `<button>` and builds its replacement in the other arm, so focus falls to `<body>` —
   * the very strand D-859 set out to fix, arriving by a different route. The dead branch is
   * `aria-disabled` rather than natively disabled, so the replacement *can* hold focus; something
   * just has to put it there. Focus stays on the same group, now announced unavailable, rather
   * than jumping to a neighbour — a silent jump is the more disorienting of the two.
   *
   * Gated on the witness's element being genuinely **disconnected**, not on `activeElement` alone:
   * `activeElement === body` cannot distinguish "our element was destroyed" from "the user clicked
   * the page background", and restoring in the second case is a focus steal. Both conditions are
   * required, and `focus()` re-fires `focusin`, which re-captures the witness for the next swap.
   */
  private restoreFocusAfterSwap(): boolean {
    const witness = this.focusWitness;
    if (!witness || witness.element.isConnected) return false;
    if (document.activeElement !== document.body) return false;
    const replacement = this.triggers.get(witness.index);
    if (!replacement) return false;
    this.keyManager?.updateActiveItem(witness.index);
    this.activeIndex.set(witness.index);
    replacement.focus();
    return true;
  }

  /**
   * Point the roving tabindex at the first operable trigger. Never focuses anything: this decides
   * only which trigger is Tab-reachable, and it also gives the key manager the active item it needs
   * before any arrow key arrives.
   */
  private seedActiveIndex(): void {
    const first = this.triggers.toArray().findIndex((t) => !t.disabled);
    // `first < 0` (every trigger dead) falls back to 0: nothing here is operable, so there is no
    // better index, and the bar has nothing to put in the tab order either way.
    this.keyManager?.updateActiveItem(Math.max(first, 0));
    this.activeIndex.set(this.keyManager?.activeItemIndex ?? 0);
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
      // Refuse to open a dead group — now belt AND braces. Under D-859 a dead trigger carries no
      // `CaeMenuTrigger` at all (nothing to call) and is `aria-disabled`, which is the one thing
      // `MatMenuTrigger._openMenu` actually refuses on (`_triggerIsAriaDisabled` reads the
      // attribute; native `disabled` does not set it, which is why this guard had to be written by
      // hand for #961 in the first place). The explicit check stays: it is the only one that does
      // not depend on the template branching correctly.
      const group = this.model()[this.activeIndex()];
      if (group && !this.disabledGroup(group)) {
        this.triggers.get(this.activeIndex())?.menuTrigger?.open();
      }
      return;
    }
    this.keyManager?.onKeydown(event);
  }
}
