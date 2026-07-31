import {
  afterNextRender,
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  input,
  isDevMode,
  model,
  output,
  TemplateRef,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatDrawer, MatSidenavModule } from '@angular/material/sidenav';

/** Which edge the drawer is attached to. Material supports these two only — see `CaeDrawer`. */
export type CaeDrawerPosition = 'start' | 'end';

/**
 * How an open drawer relates to the content beside it.
 * - `over` — floats above the content behind a backdrop (modal).
 * - `push` — displaces the content sideways, still behind a backdrop (modal).
 * - `side` — sits beside the content and shrinks it; no backdrop, no focus trap (non-modal).
 */
export type CaeDrawerMode = 'over' | 'push' | 'side';

/**
 * The parent/child seam {@link CAE_DRAWER_CONTAINER} carries.
 *
 * @internal An interface rather than the container class so the token stays free of a forward
 * reference; `stripInternal` keeps it out of the published typings.
 */
export interface CaeDrawerHost {
  /**
   * Called by a {@link CaeDrawer} as it is destroyed — early enough that the `<mat-drawer>` stamped
   * for it is still alive. See {@link CaeDrawerContainer.releaseDrawer}.
   */
  releaseDrawer(drawer: CaeDrawer): void;
}

/**
 * Identifies the owning {@link CaeDrawerContainer} to its projected {@link CaeDrawer} children.
 *
 * A token rather than the class itself, to avoid a forward reference, and DI rather than "nearest
 * container wins" because a content query cannot tell ownership on its own — see
 * {@link CaeDrawerContainer.ownDrawers}. Material solves the identical problem the identical way
 * (`MAT_DRAWER_CONTAINER`).
 */
export const CAE_DRAWER_CONTAINER = new InjectionToken<CaeDrawerHost>('CAE_DRAWER_CONTAINER');

/**
 * `cae-drawer` — one drawer inside a {@link CaeDrawerContainer}
 * (`reference/COMPARISON.md`: `p-drawer` (was `p-sidebar`) → `cae-drawer`; Direct tier over
 * Material's `MatDrawer`). Declare it as a child of `cae-drawer-container`; everything else in the
 * container is the main content.
 *
 * Content-projection only, no logic — its projected content is captured as a `TemplateRef` (via an
 * internal `<ng-template>`) so the container can hand it to the real `<mat-drawer>` it stamps. That
 * indirection is **required**, not stylistic: `MatDrawerContainer` projects by *element selector*
 * (`<ng-content select="mat-drawer, mat-sidenav">`), so a `<cae-drawer>` element handed to it
 * directly would fall through to the *content* slot and render as page content. Same pattern, same
 * reason, as `cae-tab` inside `cae-tabs`.
 *
 * The host renders nothing and is `display: none` — it exists only to carry inputs and be found by
 * the container's content query. A `cae-drawer` outside any container therefore renders **nothing
 * at all**; that is why the constructor dev-warns.
 *
 * **Positions are `start`/`end` only.** `MatDrawer.position` is typed `'start' | 'end'`, so a
 * top/bottom drawer has no Material basis and is not offered here (#854 tracks the gap). `start`
 * and `end` are direction-relative: they flip under RTL, which is why they are not named
 * left/right. The flip is Material's own behaviour (`sidenav.mjs` `_validateDrawers` plus its
 * `[dir=rtl]` rules), but the claim is Caelum's, so it is pinned in `drawer.browser.spec.ts` —
 * geometry, and therefore unfalsifiable in jsdom (#858).
 *
 * Zoneless-compatible: `OnPush` + signal state (Book 01 §3.2).
 */
@Component({
  selector: 'cae-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-template #content><ng-content /></ng-template>`,
  styles: `
    :host {
      display: none;
    }
  `,
})
export class CaeDrawer {
  /**
   * @internal The container that will stamp this drawer, or `null` if it is declared outside one.
   * Used only for the ownership filter in {@link CaeDrawerContainer.ownDrawers}.
   */
  readonly container = inject(CAE_DRAWER_CONTAINER, { optional: true });
  /**
   * @internal The drawer body, for {@link CaeDrawerContainer} to project into the `<mat-drawer>` it
   * stamps. `stripInternal` (tsconfig.lib.json) keeps it out of the published typings — it is a
   * parent/child seam, not a supported consumer API.
   */
  readonly content = viewChild.required<TemplateRef<unknown>>('content');
  /** Which edge the drawer is attached to. Direction-relative: these flip under RTL. */
  readonly position = input<CaeDrawerPosition>('start');
  /** How the drawer relates to the content beside it. See {@link CaeDrawerMode}. */
  readonly mode = input<CaeDrawerMode>('over');
  /**
   * Whether the drawer is open. Two-way bindable as `[(opened)]`.
   *
   * A `model`, not an `input`+`output` pair, and that is load-bearing rather than stylistic: a
   * backdrop click or Escape mutates Material's own state directly, and the container writes the
   * result straight back here. With a plain input, a consumer who bound one-way `[opened]="true"`
   * would leave this signal stuck at `true` after such a dismissal — the binding value never
   * changes, so it is never re-asserted, and Material's real state has silently diverged from ours.
   *
   * **The write-back is driven from the animation START, not its end.** `MatDrawer` emits
   * `openedChange` from `_animationEnd`, i.e. ~400ms after the user acted. Relying on that alone
   * left this signal stale for the whole transition, which (a) let `aria-modal="true"` linger on a
   * closing drawer that is still visible — the very thing the container's gate exists to prevent —
   * and (b) **swallowed the user's next click**: a toggle written `opened.set(!opened())` computed
   * from the stale `true`, wrote `false`, and `_setOpen` early-returned on the equal value, so the
   * drawer never reopened. The container therefore also binds `openedStart`/`closedStart`, which
   * fire immediately. Found by review, not by the author's tests.
   *
   * **Bind it — do not set it as a bare attribute.** `model()` takes no `transform`, so
   * `<cae-drawer opened>` puts the string `''` here rather than `true`.
   */
  readonly opened = model(false);
  /**
   * Prevent Escape and backdrop clicks from closing the drawer. Leaves the user no dismissal path
   * of its own, so pair it with a close control inside the drawer.
   */
  readonly disableClose = input(false, { transform: booleanAttribute });
  /**
   * Accessible name for the drawer. **Required when the drawer is modal** (any mode but `side`,
   * unless the container overrides the backdrop): a modal region with no name is announced as an
   * unlabelled dialog, and axe's `aria-dialog-name` rule flags it. Dev-warns when missing. Use this
   * or {@link ariaLabelledby}, not both.
   *
   * On a **non-modal** drawer a name is optional, and supplying one promotes the drawer to a named
   * `region` landmark. Without a name a non-modal drawer carries no role at all — ARIA prohibits
   * `aria-label` on a role-less generic, so the container withholds the attribute rather than
   * emitting a name nothing can announce.
   */
  readonly ariaLabel = input('');
  /** Id of an element that names the drawer — the labelled-by alternative to {@link ariaLabel}. */
  readonly ariaLabelledby = input('');

  constructor() {
    const container = this.container;
    if (container) {
      // #855 — a drawer removed while open (`@if (showNav) { <cae-drawer …> }`, an ordinary thing
      // to write) leaves `inert` stranded on the content: `MatDrawer.ngOnDestroy` tears down its
      // focus trap but never re-runs `MatDrawerContent._updateInert`, so the page behind stays
      // non-interactive and hidden from AT with nothing on screen to explain it. This hook fires
      // while the `<mat-drawer>` is still alive — measured, and it is the whole window the fix has.
      inject(DestroyRef).onDestroy(() => container.releaseDrawer(this));
    }
    if (isDevMode()) {
      effect(() => {
        if (!this.container) {
          console.warn(
            'cae-drawer: must be declared inside a <cae-drawer-container> — it renders nothing on its own.',
          );
          return;
        }
        // Approximates modality from `mode` alone: a drawer cannot see the container's
        // `hasBackdrop` override, so a `side` drawer forced modal by the container is not warned
        // about. The common case is the defaulted one, and a dev warning may under-fire but must
        // never cry wolf.
        if (
          this.opened() &&
          this.mode() !== 'side' &&
          !this.ariaLabel() &&
          !this.ariaLabelledby()
        ) {
          console.warn(
            'cae-drawer: set `ariaLabel` or `ariaLabelledby` — a modal drawer is a role=dialog and requires an accessible name.',
          );
        }
      });
    }
  }
}

/**
 * `cae-drawer-container` — the layout host for one or two {@link CaeDrawer} children plus the main
 * content (`reference/COMPARISON.md`: `p-drawer` → `cae-drawer`; Direct tier over Material's
 * `MatDrawerContainer`; Book 11 §3.1 — layout panels as Direct, token-skinned ports). Anything
 * projected that is not a `cae-drawer` becomes the content beside the drawers:
 *
 * ```html
 * <cae-drawer-container>
 *   <cae-drawer [(opened)]="navOpen" mode="over" ariaLabel="Main navigation">…</cae-drawer>
 *   <main>…</main>
 * </cae-drawer-container>
 * ```
 *
 * **The container needs a definite block size.** `mat-drawer-container { height: 100% }` against an
 * auto-height host resolves to auto, so a container with no height collapses and the drawer is
 * invisible. Give the host a height.
 *
 * At most one drawer per `position`. Material throws on a duplicate **in dev builds only**
 * (`throwMatDuplicatedDrawerError` is `ngDevMode`-gated); in production the later drawer wins and
 * the earlier one is orphaned — it still renders and opens but gets no backdrop and no focus trap.
 *
 * ## The modal semantics Material leaves out
 *
 * `MatDrawer` sets **no `role` and no `aria-*`** — verified in `sidenav.mjs`, whose host block
 * carries only mode/position classes, `visibility`, and `attr.tabIndex`. Yet in every mode but
 * `side` it renders a backdrop and enables a focus trap. That is a panel that behaves modally while
 * telling assistive technology nothing — exactly the mixture **D-826** resolved for `cae-popover`,
 * so this container applies that decision's answer: a modal drawer gets `role="dialog"` +
 * `aria-modal="true"`, and owes an accessible name.
 *
 * Three consequences worth stating plainly, all found by review:
 *
 * 1. **The drawer body is wrapped in a focusable element when modal.** Material's own host binding
 *    puts `tabindex="-1"` on `<mat-drawer>`, so CDK's `isTabbable` (`tabIndex >= 0`) rejects it and
 *    `FocusTrap._getFirstTabbableElement` returns `null` for a drawer whose content has nothing
 *    tabbable — an ordinary informational drawer. Both anchor listeners then no-op and Tab walks
 *    out into the page behind an open `role="dialog"`. This is the #824 failure shape verbatim, and
 *    the fix is the same one D-826 took for the popover: give the trap a target it can return to.
 * 2. **`aria-modal` is gated on the drawer actually being open**, because a drawer mid-close is
 *    deliberately still visible (`.mat-drawer:not(.mat-drawer-opened):not(.mat-drawer-animating)`
 *    is what hides it) and a stale `aria-modal="true"` there would hide the rest of the page from
 *    AT for the length of the animation. That gate is only sound because
 *    {@link CaeDrawer.opened} is now written at animation *start*.
 * 3. **`aria-modal` is a claim about the container, not the viewport.** Material's backdrop is
 *    `position: absolute` inside the container, so it covers the container's box only. If the
 *    container does not span the viewport, content outside it stays visible and clickable while
 *    `aria-modal` tells AT it does not exist. **A modal drawer's container should span the
 *    viewport.**
 *
 * `role` is *not* gated on `opened`: a hidden dialog that keeps its role is conventional, and
 * removing it would churn the a11y tree on every toggle.
 *
 * ## Keeping the label and Material's machinery in step
 *
 * The modal *labelling* above is per-drawer; Material's modal *machinery* — the focus trap and the
 * `inert` it puts on `<mat-drawer-content>` — is container-wide and is recomputed only from a
 * drawer's own open/close or `mode` change. Wherever those two disagree the component announces one
 * thing and behaves as another, which is the whole failure class this container has to close:
 *
 * 1. **A drawer destroyed while open** stranded `inert` on the content, freezing the page behind a
 *    drawer that no longer exists — `MatDrawer.ngOnDestroy` never re-runs `_updateInert` (#855). The
 *    container closes such a drawer first; see {@link releaseDrawer}.
 * 2. **`hasBackdrop` changed while a drawer is open** moved the label and nothing else, so the
 *    drawer was announced as a dialog over a reachable page, or (worse) held focus while presented
 *    as ordinary content (#857). The container re-syncs Material, and pulls focus into a drawer that
 *    has just become modal — Material's own `_takeFocus` fires on open only.
 * 3. **Two drawers open behind a backdrop** is where Material itself is incoherent, and
 *    order-dependently so. That configuration is dev-warned rather than modelled, and no drawer
 *    claims `aria-modal` in it (#856; see {@link ariaModalFor}).
 *
 * `position` is the one modality-adjacent input with no such hazard — it is direction-relative and
 * flips under RTL, pinned in `drawer.browser.spec.ts` (#858).
 *
 * Zoneless-compatible: `OnPush` + signal state (Book 01 §3.2); the container is published to its
 * children through DI (Book 01 §3.3).
 */
@Component({
  selector: 'cae-drawer-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSidenavModule, NgTemplateOutlet],
  providers: [{ provide: CAE_DRAWER_CONTAINER, useExisting: CaeDrawerContainer }],
  template: `
    <mat-drawer-container [hasBackdrop]="hasBackdrop()" (backdropClick)="backdropClick.emit()">
      @for (drawer of ownDrawers(); track drawer) {
        <mat-drawer
          [position]="drawer.position()"
          [mode]="drawer.mode()"
          [opened]="drawer.opened()"
          [disableClose]="drawer.disableClose()"
          [attr.role]="roleFor(drawer)"
          [attr.aria-modal]="ariaModalFor(drawer)"
          [attr.aria-label]="roleFor(drawer) ? drawer.ariaLabel() || null : null"
          [attr.aria-labelledby]="roleFor(drawer) ? drawer.ariaLabelledby() || null : null"
          (openedStart)="drawer.opened.set(true)"
          (closedStart)="drawer.opened.set(false)"
          (openedChange)="drawer.opened.set($event)"
        >
          <div #panel class="cae-drawer__panel" [attr.tabindex]="isModal(drawer) ? 0 : null">
            <ng-container [ngTemplateOutlet]="drawer.content()" />
          </div>
        </mat-drawer>
      }
      <ng-content />
    </mat-drawer-container>
  `,
  styles: `
    :host {
      display: block;
    }

    mat-drawer-container {
      height: 100%;
    }

    .cae-drawer__panel {
      display: block;
      block-size: 100%;
    }

    /* The panel is only focusable to give the focus trap a target; a focus ring on the whole panel
       when the user merely opened the drawer is noise. Keyboard focus still shows one. */
    .cae-drawer__panel:focus {
      outline: none;
    }
    .cae-drawer__panel:focus-visible {
      outline: 2px solid var(--cae-color-primary);
      outline-offset: -2px;
    }
  `,
})
export class CaeDrawerContainer {
  /**
   * `descendants: true` is passed EXPLICITLY — it is not the default for `contentChildren`.
   *
   * What it does and does not buy, **measured rather than assumed** (dropping it was mutation-
   * tested): control flow is *not* the case that needs it — a drawer inside an `@if` is still
   * collected by a `descendants: false` query, because a control-flow block does not introduce a
   * query level. The case that needs it is a plain **wrapper element**: `<div><cae-drawer/></div>`
   * is dropped without it, and the drawer then silently never renders. That is an ordinary thing
   * for a consumer to write, so the spec pins the wrapped shape specifically — an `@if`-only test
   * passes just as happily with the flag removed, which is how this nearly shipped unguarded.
   */
  private readonly allDrawers = contentChildren(CaeDrawer, { descendants: true });

  /**
   * The drawers this container actually owns.
   *
   * The ownership filter is what makes `descendants: true` safe. Without it a nested
   * `cae-drawer-container` is **silent corruption, not an error**: the outer query reaches the
   * inner container's drawer, so both containers stamp it, its body is instantiated twice
   * (duplicate DOM and duplicate `id`s), and two `MatDrawer`s write back to one model. Material
   * guards the identical hazard the identical way, filtering on `_container === this`.
   */
  protected readonly ownDrawers = computed(() =>
    this.allDrawers().filter((drawer) => drawer.container === this),
  );

  /** The owned drawers that are currently open — the container-wide view modality depends on. */
  private readonly openDrawers = computed(() => this.ownDrawers().filter((d) => d.opened()));

  private readonly matDrawers = viewChildren(MatDrawer);
  private readonly panels = viewChildren<ElementRef<HTMLElement>>('panel');
  private readonly injector = inject(Injector);

  /**
   * Last rendered `CaeDrawer` → `<mat-drawer>` pairing, refreshed on every render.
   *
   * Needed because the two lists are aligned at render time and **not** at destroy time: when a
   * drawer is removed, the content query has already dropped it while its `<mat-drawer>` is still
   * in the DOM (measured — `matDrawersInDom=1 ownDrawersLen=0`), so {@link releaseDrawer} cannot
   * recover the pairing by index and has to have cached it.
   */
  private readonly stamped = new WeakMap<CaeDrawer, MatDrawer>();

  /** Per-drawer `{opened, modal}` from the previous reconcile — see the focus-in effect. */
  private readonly lastModality = new WeakMap<CaeDrawer, { opened: boolean; modal: boolean }>();

  /**
   * Force the backdrop on or off for every drawer in this container. Leave unset (`null`) to keep
   * Material's rule — a backdrop for every mode but `side`.
   *
   * The transform matters: Material's own setter coerces, so `<cae-drawer-container hasBackdrop>`
   * gives Material the string `''` → `true` (a real backdrop and a real focus trap) while an
   * uncoerced signal here would hold `''`, which is falsy, and silently withhold `role="dialog"`
   * from every drawer in the container — permanently, since nothing writes back to this input.
   *
   * **Safe to change while a drawer is open** (#857). Material recomputes its focus trap and the
   * content's `inert` only from a drawer's own open/close or `mode` change — its `hasBackdrop`
   * setter calls neither — so the container re-syncs it explicitly, and pulls focus into a drawer
   * this input has just made modal.
   */
  readonly hasBackdrop = input<boolean | null, unknown>(null, {
    transform: (value: unknown) => (value == null ? null : booleanAttribute(value)),
  });
  /** Emits when the backdrop is clicked (fires whether or not `disableClose` blocked the close). */
  readonly backdropClick = output<void>();

  /**
   * Whether this drawer gets a backdrop — which is Material's own trigger for rendering the scrim
   * and, for a lone drawer, for enabling its focus trap.
   *
   * Mirrors `MatDrawerContainer._drawerHasBackdrop` **branch for branch** rather than approximating
   * it: an unset override defers to the drawer's own mode, a set one wins outright. Re-deriving the
   * rule instead of mirroring it is how the a11y contract and the rendered behaviour drift apart.
   *
   * Note what this is **not**: a statement about the focus trap. Material's trap predicate is
   * `opened && container._isShowingBackdrop()`, which ORs across *both* positions, so with a `side`
   * and an `over` drawer open together the `side` drawer can be trapped while this returns `false`
   * for it. Worse, that is order-dependent rather than merely wrong — `_updateFocusTrapState` runs
   * at each drawer's own transition, so opening the `over` drawer first traps both (measured), and
   * the reverse order traps only the `over` one. Two drawers open behind a backdrop is therefore an
   * unsupported configuration that dev-warns (#856), not a shape modelled here; see
   * {@link ariaModalFor} for what the labelling does in it.
   */
  protected isModal(drawer: CaeDrawer): boolean {
    const override = this.hasBackdrop();
    return override == null ? drawer.mode() !== 'side' : override;
  }

  /**
   * The role the drawer should carry: a modal drawer is a `dialog`; a *named* non-modal drawer is a
   * `region` landmark; an unnamed non-modal drawer is plain layout and gets no role.
   *
   * The naming branch is not cosmetic. `<mat-drawer>` is an unknown element, so with no role it
   * maps to `generic`, and ARIA **prohibits** `aria-label`/`aria-labelledby` there — the name would
   * be announced by nothing. So the container emits a name only when it also emits a role.
   */
  protected roleFor(drawer: CaeDrawer): 'dialog' | 'region' | null {
    if (this.isModal(drawer)) return 'dialog';
    return drawer.ariaLabel() || drawer.ariaLabelledby() ? 'region' : null;
  }

  /**
   * `aria-modal="true"`, but only for a drawer that is genuinely the exclusive one (#856).
   *
   * `aria-modal` claims *everything outside this node is inert*. With a second drawer open that
   * claim is false — the other drawer is outside this one and demonstrably not inert — and two
   * siblings each asserting it is invalid state that Material alone never produced (it emits no
   * `aria-modal` at all). So the exclusivity claim is made once or not at all; `role="dialog"`
   * stays on both, since a dialog is still a dialog. The dev warning below names the situation.
   */
  protected ariaModalFor(drawer: CaeDrawer): 'true' | null {
    const exclusive = this.openDrawers().length === 1;
    return this.isModal(drawer) && drawer.opened() && exclusive ? 'true' : null;
  }

  /**
   * @internal Close a drawer that is being destroyed while open, before its `<mat-drawer>` goes
   * with it (#855).
   *
   * `MatDrawer.ngOnDestroy` destroys the focus trap but never re-runs
   * `MatDrawerContent._updateInert`, and `_drawers.changes` only re-validates — so a drawer removed
   * while open strands `inert="true"` on the content and freezes the page until some later modal
   * drawer opens *and* closes. Closing it first routes through `_setOpen(false, …)`, which calls
   * `_drawerToggled` synchronously (clearing `inert` **and** keeping Material's own `_isInert`
   * bookkeeping in step — the reason this is not done by removing the attribute ourselves: a
   * hand-cleared attribute leaves `_isInert` stuck `true`, and the next drawer to open would then
   * find its `_updateInert` a no-op and render modal over *reachable* content) and `_restoreFocus`,
   * which also fixes the focus dropping to `<body>`.
   */
  releaseDrawer(drawer: CaeDrawer): void {
    const matDrawer = this.stamped.get(drawer);
    this.stamped.delete(drawer);
    this.lastModality.delete(drawer);
    if (matDrawer?.opened) matDrawer.close();
  }

  constructor() {
    // Pair each drawer with the <mat-drawer> stamped for it while the two lists are still aligned;
    // see `stamped` for why the pairing cannot be recovered later.
    effect(() => {
      const cae = this.ownDrawers();
      const mat = this.matDrawers();
      untracked(() => {
        for (let i = 0; i < cae.length && i < mat.length; i++) this.stamped.set(cae[i], mat[i]);
      });
    });

    // #857 — re-sync Material after a modality change it does not react to.
    //
    // `_updateFocusTrapState` and `_updateInert` run only from a drawer's own open/close or its
    // `mode` setter. A `mode` change arrives through the binding, so Material handles that itself;
    // `hasBackdrop` is the gap — `MatDrawerContainer`'s setter calls neither. Changing it while a
    // drawer is open therefore re-labels the drawer here and moves nothing there: a `side` drawer
    // announced as a modal dialog with the page fully reachable, or (the worse arm) an `over`
    // drawer presented as ordinary content while the trap and `inert` stay on.
    //
    // Re-assigning `mode` its CURRENT value is the lever: `set mode` in `sidenav.mjs` is unguarded
    // — no equality check — so it re-runs `_updateFocusTrapState()` and `_drawerModeChanged()` →
    // `_updateInert()` against the now-current state. It is a public input, not a private reach.
    //
    // It must run in the AFTER-RENDER phase, not a plain `effect`: both recompute from Material's
    // own `_backdropOverride`, which this component's `[hasBackdrop]` binding writes during the
    // template update. A component effect runs before that, so it would poke Material into
    // recomputing the value it already had — measured, the fix silently did nothing.
    afterRenderEffect(() => {
      this.hasBackdrop();
      untracked(() => {
        for (const matDrawer of this.matDrawers()) {
          const mode = matDrawer.mode;
          matDrawer.mode = mode;
        }
      });
    });

    // #857, focus half — a drawer that becomes modal while ALREADY open never gets focus moved
    // into it: `MatDrawer._takeFocus()` runs only from the `openedChange` subscription, so nothing
    // fires on a modality flip. That leaves focus outside a `role="dialog" aria-modal="true"`
    // region whose content Material has just made `inert`, i.e. focus lands on nothing. Restricted
    // to the already-open edge on purpose: on a normal open Material focuses the drawer itself, and
    // duplicating that would fight it.
    effect(() => {
      const states = this.ownDrawers().map((drawer) => ({
        drawer,
        opened: drawer.opened(),
        modal: this.isModal(drawer),
      }));
      untracked(() => {
        const panels = this.panels();
        states.forEach(({ drawer, opened, modal }, index) => {
          const previous = this.lastModality.get(drawer);
          this.lastModality.set(drawer, { opened, modal });
          if (!previous?.opened || !opened || previous.modal || !modal) return;
          const panel = panels[index];
          if (panel) {
            afterNextRender(() => panel.nativeElement.focus(), { injector: this.injector });
          }
        });
      });
    });

    if (isDevMode()) {
      // #856 — the supported surface is ONE drawer open behind a backdrop. Material's focus trap
      // and `inert` are container-wide while Caelum's labelling is per-drawer, and the two only
      // agree in that case. Worse, Material's own answer is order-dependent rather than merely
      // incoherent: `_updateFocusTrapState` runs at each drawer's own transition, so opening an
      // `over` drawer and then a `side` one traps BOTH (measured `true,true`), while the reverse
      // order traps only the `over` one (`false,true`) — the same markup, two behaviours. Mirroring
      // that faithfully is not a goal, so the extra drawer is warned about rather than modelled.
      effect(() => {
        // `open.some(isModal)` mirrors `MatDrawerContainer._isShowingBackdrop()`, which ORs across
        // positions — the trap and `inert` are container-wide facts, unlike the per-drawer label.
        const open = this.openDrawers();
        if (open.length > 1 && open.some((drawer) => this.isModal(drawer))) {
          // Kept short on purpose: a `console.warn` argument is shipped string content and is
          // charged against the entry point's size budget, unlike the JSDoc above it (#150).
          console.warn(
            'cae-drawer-container: open one drawer at a time behind a backdrop — the focus trap is container-wide (#856).',
          );
        }
      });
    }
  }
}
