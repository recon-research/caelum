import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  Directive,
  ElementRef,
  inject,
  input,
  isDevMode,
  model,
  viewChild,
} from '@angular/core';
import { MatCard } from '@angular/material/card';
import { CaeIcon } from '@recon-research/caelum/icon';

import { redirectFocusOutOfCollapsedRegion } from './collapse-focus';

// Module-scoped id counter for the header/content ids the toggle's `aria-labelledby` and
// `aria-controls` point at. Deterministic per load, and never collides across instances.
let nextUniqueId = 0;

/**
 * Marker for a **rich** panel header projected into `<cae-panel>` — use it when the plain
 * `[header]` string is not enough:
 *
 * ```html
 * <cae-panel toggleable>
 *   <h2 caePanelHeader>Billing details <cae-badge>3</cae-badge></h2>
 *   …
 * </cae-panel>
 * ```
 *
 * It exists for two reasons beyond selecting the slot. First, `cae-panel` must know whether a
 * header was projected at all, so it can decide to render the header row and where to point the
 * toggle's `aria-labelledby` — an attribute selector alone is not queryable, only a directive is.
 * Second, it is the **only** way to give the panel a real heading element: like `p-panel` (and
 * like `cae-card`'s `title`), the `[header]` string renders as plain text, which is invisible to
 * a screen reader's heading navigation. Project an `<h2>`/`<h3>` here when the panel is a
 * document section rather than a bare box.
 *
 * Two constraints worth knowing. **Import it alongside `CaePanel`** — `<h2 caePanelHeader>` without
 * the import is a legal bare attribute, not a compile error, and the header silently never renders.
 * And it must be a **direct child** of `<cae-panel>`: wrapping it in a `<div>` or an `@if` moves it
 * out of the projection slot. Everything in this slot becomes part of the toggle's accessible name,
 * so keep it to text — an action button projected here would have its own name absorbed too.
 */
@Directive({ selector: '[caePanelHeader]' })
export class CaePanelHeader {}

/**
 * `cae-panel` — a titled container with an optional disclosure, composed over Material's
 * `mat-card` (`reference/COMPARISON.md`: `p-panel` → `cae-panel`; Book 11 §3.1 rates the row
 * **Compose**, `MatCard` + a built header contract).
 *
 * It fills the gap between the two nearest shipped components, neither of which fits: `cae-card`
 * is the plain container but has **no header contract and no collapse**, and
 * `cae-expansion-panel` collapses but carries **accordion semantics** — a group, one-at-a-time
 * coordination through `MAT_ACCORDION` — that a standalone titled panel must not imply.
 *
 * `mat-card` supplies only the *surface* here (background, radius, outline), already bridged to
 * `--cae-*` (D-04); it is imported as the standalone `MatCard`, not `MatCardModule`, so the
 * fourteen other card directives this template never uses stay out of the graph. The surface is
 * pinned to `outlined` — Material's own default is `raised`, which would render a panel on a grey
 * elevated surface beside an outlined `cae-card` and `cae-fieldset`. It is deliberately not an
 * input: `p-panel` has no appearance concept, and `cae-card` already ships all three surfaces for
 * a consumer who wants one. The header row is
 * Caelum's own flex row rather than `mat-card-header`, whose grid is built for an avatar +
 * title + subtitle and would have to be fought to seat a trailing toggle.
 *
 * **The disclosure.** `[toggleable]` renders a real `<button type="button">` — keyboard-operable
 * natively (Enter/Space), no `keydown` handler to get wrong — carrying `aria-expanded` and
 * `aria-controls` pointing at the content region. This is the WAI-ARIA APG *Disclosure* pattern,
 * not *Accordion*: a lone panel needs no heading wrapper and no arrow-key roving. Only the toggle
 * is clickable, never the whole header row (`p-panel`'s `toggler="header"` variant is deliberately
 * not ported — it makes any interactive content a consumer projects into the header a nested
 * interactive, and swallows text selection).
 *
 * Collapsing **hides** the content (`[hidden]`) rather than removing it, so a projected form keeps
 * its values, its scroll position, and its pending validation across a collapse/expand cycle.
 * `hidden` also takes it out of the accessibility tree *and* the tab order, which `@if` would do
 * too — but at the cost of destroying that state.
 *
 * Theme comes free through the token bridge. Zoneless-compatible: `OnPush` + signal inputs (D-12).
 *
 * @example
 * ```html
 * <cae-panel header="Shipping address" toggleable [(collapsed)]="addressCollapsed">
 *   <p>1 Example Way…</p>
 * </cae-panel>
 * ```
 */
@Component({
  selector: 'cae-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCard, CaeIcon],
  template: `
    <mat-card appearance="outlined">
      @if (showHeader()) {
        <div class="cae-panel__header" [class.cae-panel__header--collapsed]="collapsed()">
          <div class="cae-panel__title" [id]="headerId">
            {{ header() }}
            <ng-content select="[caePanelHeader]" />
          </div>
          @if (toggleable()) {
            <button
              #toggleBtn
              type="button"
              class="cae-panel__toggle"
              [class.cae-panel__toggle--expanded]="!collapsed()"
              [attr.aria-expanded]="!collapsed()"
              [attr.aria-controls]="contentId"
              [attr.aria-label]="toggleLabel()"
              [attr.aria-labelledby]="toggleLabelledBy()"
              (click)="toggle()"
            >
              <cae-icon class="cae-panel__chevron" name="chevron-down" aria-hidden="true" />
            </button>
          }
        </div>
      }
      <div #content class="cae-panel__content" [id]="contentId" [hidden]="collapsed()">
        <ng-content />
      </div>
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-panel__header {
      display: flex;
      align-items: center;
      gap: var(--cae-space-2);
      padding: var(--cae-space-3) var(--cae-space-4);
      border-block-end: 1px solid var(--cae-color-border);
      color: var(--cae-color-on-surface);
      font-family: var(--cae-font-heading);
      font-size: var(--cae-text-md);
      font-weight: var(--cae-weight-medium);
      line-height: var(--cae-line-heading);
    }
    /* Collapsed, the separator would divide the header from nothing — and sit one pixel above the
       card's own outline as a double line. Hide it by COLOUR, not width, so the header's height is
       identical in both states and toggling causes no layout shift. */
    .cae-panel__header--collapsed {
      border-block-end-color: transparent;
    }
    .cae-panel__title {
      flex: 1 1 auto;
      min-inline-size: 0;
    }
    .cae-panel__toggle {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      /* Floor the hit target to the density-INVARIANT --cae-target-min (24px): a --cae-space-*
         floor collapses to 16px at [data-density=compact] and fails WCAG 2.5.8 (PATTERNS 10). */
      min-inline-size: var(--cae-target-min);
      min-block-size: var(--cae-target-min);
      padding: 0;
      border: 0;
      border-radius: var(--cae-radius-sm);
      background: none;
      color: inherit;
      cursor: pointer;
    }
    .cae-panel__toggle:focus-visible {
      outline: var(--cae-focus-ring-width) solid var(--cae-focus-ring-color);
      outline-offset: var(--cae-focus-ring-offset);
    }
    .cae-panel__chevron {
      display: inline-flex;
    }
    /* Down when COLLAPSED (the "expand" affordance), rotated up when expanded -- the direction
       Material's expansion indicator and p-panel both use, so a cae-panel and a
       cae-expansion-panel on one page never point opposite ways in the same state (WCAG 3.2.4).
       The flip is on the BLOCK axis only, so it carries no inline direction to mirror in RTL. */
    .cae-panel__toggle--expanded .cae-panel__chevron {
      transform: rotate(180deg);
    }
    .cae-panel__content {
      padding: var(--cae-space-4);
      color: var(--cae-color-on-surface);
      font-size: var(--cae-text-sm);
      line-height: var(--cae-line-body);
    }
    /* Re-assert the UA rule for [hidden]. Any author 'display' on the content would otherwise beat
       the UA stylesheet regardless of specificity and leave collapsed content visible. */
    .cae-panel__content[hidden] {
      display: none;
    }
  `,
})
export class CaePanel {
  /** Plain-text header. Renders as text, not a heading — project `[caePanelHeader]` for an `<h2>`. */
  readonly header = input('');
  /** Render the collapse toggle. Without it the panel is a plain titled container. */
  readonly toggleable = input(false, { transform: booleanAttribute });
  /**
   * Whether the body is collapsed. Two-way: `[(collapsed)]`.
   *
   * **Bind it** (`[collapsed]="true"`) — never write a bare `collapsed` attribute. A `model()`
   * takes no `booleanAttribute` transform, so the bare form arrives as `''`, which is falsy: the
   * panel renders **expanded** and the attribute is a silent no-op, the opposite of the intent.
   * Caelum's own templates compile with `strictTemplates` (#858), which makes the bare form a type
   * error here; a consumer app without it reaches the silent no-op.
   *
   * It is deliberately **not** gated on `[toggleable]`, so a panel with no toggle of its own can
   * still be driven from an external control — a "collapse all" button, say. The corollary is that
   * `[collapsed]="true"` without `[toggleable]` leaves the content unreachable *from the panel*:
   * the consumer owns the affordance, and should wire it with {@link contentId} (#871).
   *
   * Collapsing while focus is **inside** the content region would drop focus to `<body>` — a WCAG
   * 2.4.3 strand reachable only on the *programmatic* path, since the toggle sits outside its own
   * content region. The panel redirects focus to its toggle instead (#870; see
   * `redirectFocusOutOfCollapsedRegion`). With **no** toggle there is nothing to land on, so that
   * case dev-warns and the strand stands — move focus deliberately before collapsing from outside.
   */
  readonly collapsed = model(false);
  /**
   * Accessible name for the toggle. Leave it unset in the normal case: the toggle is then labelled
   * by the header itself (`aria-labelledby`), so AT announces "Billing details, button, expanded"
   * — the header text is what identifies the control, exactly as in the APG accordion pattern.
   * Set this only to override that, or to name a toggle on a panel that has no header at all.
   */
  readonly toggleAriaLabel = input('');

  /**
   * A projected rich header, if the consumer supplied one (see {@link CaePanelHeader}).
   *
   * `descendants: false` is passed EXPLICITLY, and is load-bearing: `contentChild` defaults it to
   * **true**, but `<ng-content select="[caePanelHeader]">` matches only **top-level** projected
   * nodes. Left at the default the query sees strictly more than the slot does, so a marker nested
   * inside a wrapper (or under an `@if`) reports "a header exists" while nothing is projected into
   * the header cell — leaving `aria-labelledby` pointed at an empty element and the toggle with no
   * accessible name at all (WCAG 4.1.2). Two independent review lenses reached that from opposite
   * directions. Keeping the two scopes identical is the whole fix.
   */
  private readonly projectedHeader = contentChild(CaePanelHeader, { descendants: false });

  private readonly uid = nextUniqueId++;
  /** `aria-labelledby` target — the header cell, whichever of the two header forms filled it. */
  protected readonly headerId = `cae-panel-header-${this.uid}`;
  /**
   * `aria-controls` target — the id of the collapsible region.
   *
   * **Public because `[collapsed]` is not gated on `[toggleable]`** (#871): a panel driven entirely
   * from an external "collapse all" button is a supported shape, and that button needs an id to
   * point `aria-controls` at. Without this it could carry `aria-expanded` but never say *what* it
   * expands, so AT announces a state with no referent.
   *
   * Read it off a template reference to the component:
   *
   * ```html
   * <button
   *   type="button"
   *   [attr.aria-expanded]="!billing.collapsed()"
   *   [attr.aria-controls]="billing.contentId"
   *   (click)="billing.collapsed.set(!billing.collapsed())"
   * >Toggle billing</button>
   *
   * <cae-panel #billing header="Billing" [(collapsed)]="billingCollapsed">…</cae-panel>
   * ```
   *
   * The id **format** is not API — read this property, never hard-code `cae-panel-content-0` in a
   * selector or stylesheet. Uniqueness is per *module instance*: `nextUniqueId` is module-scoped, so
   * two independently-bundled copies of `caelum/panel` on one page each start at zero.
   *
   * Exposed as a **readonly** rather than a `[contentId]` input on YAGNI grounds: no consumer has
   * asked to choose the id, and D-850 keeps adding the input later a *minor* bump. (An earlier note
   * here claimed an input would introduce a uniqueness contract the readonly avoids — that was
   * wrong, per the module-scope caveat above, and is corrected rather than left for a future slice
   * to cite as settled.)
   */
  readonly contentId = `cae-panel-content-${this.uid}`;

  /**
   * Whether anything would land in the header row. `toggleable` counts: the toggle has to live
   * somewhere, so a header-less toggleable panel still gets the row (and the toggle then falls back
   * to `toggleAriaLabel`, since an empty `aria-labelledby` target would leave it unnamed).
   */
  protected readonly showHeader = computed(() => this.hasHeaderContent() || this.toggleable());

  /**
   * `trim()` matters: `header="   "` is truthy but renders a title cell with no readable text, so
   * without it the toggle would be labelled by an empty element — the same unnamed-button defect
   * the `descendants` note above describes, reached through whitespace instead of nesting.
   */
  private readonly hasHeaderContent = computed(
    () => !!this.header().trim() || !!this.projectedHeader(),
  );

  /** `aria-label` — only when it would not shadow a real header (`null` drops the attribute). */
  protected readonly toggleLabel = computed(() => {
    const explicit = this.toggleAriaLabel();
    if (explicit) return explicit;
    return this.hasHeaderContent() ? null : 'Toggle';
  });

  /** `aria-labelledby` — the header, unless an explicit label was given or there is no header. */
  protected readonly toggleLabelledBy = computed(() =>
    !this.toggleAriaLabel() && this.hasHeaderContent() ? this.headerId : null,
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * The component's **own** content region and toggle, for the collapse focus redirect (#870).
   *
   * `viewChild` rather than a `querySelector` on the host, and that is load-bearing: a view query
   * cannot see into projected content, so a `cae-panel` nested inside another one's body stays
   * invisible here. A host `querySelector('.cae-panel__toggle')` on a panel that is *not* itself
   * toggleable would match the nested panel's toggle — first in document order — and send focus
   * into the wrong component entirely.
   */
  private readonly contentRef = viewChild<ElementRef<HTMLElement>>('content');
  private readonly toggleRef = viewChild<ElementRef<HTMLElement>>('toggleBtn');

  constructor() {
    // Not dev-only: this is behaviour, not a guard. Wrapping it in `isDevMode()` would ship the fix
    // dead in production while leaving the whole suite green, since tests run in dev mode (#955).
    //
    // It reads `collapsed` unconditionally so the effect stays subscribed on every path (#710). The
    // view queries below are read only past that early return, which is deliberate and NOT a #710
    // violation: while expanded, a `toggleable` flip must not re-run the redirect and yank focus out
    // of a visible region. So on the quiet path the producer set is `{collapsed}` alone.
    //
    // Phase left at the default `mixedReadWrite`, which is the honest one here rather than an
    // oversight: reading `activeElement` is a read, and `focus()`'s scroll-into-view is a write.
    afterRenderEffect(() => {
      if (!this.collapsed()) return;
      redirectFocusOutOfCollapsedRegion(
        this.contentRef()?.nativeElement,
        this.toggleRef()?.nativeElement,
        'cae-panel',
      );
    });

    if (isDevMode()) {
      afterRenderEffect(() => {
        // Every signal the guard depends on is read UNCONDITIONALLY: a read reached only inside the
        // branch below would not be a dependency on the quiet path, so the effect would stop
        // re-running and the check would silently pass forever (#710).
        const labelledBy = this.toggleLabelledBy();
        const toggleable = this.toggleable();
        if (!toggleable || !labelledBy) return;

        // The static routes to an unnamed toggle are closed by `hasHeaderContent` (trimmed) and by
        // the `descendants: false` query. This catches the one they cannot: a projected header
        // that renders no text.
        //
        // Its reach is bounded, deliberately. A `querySelector`/`textContent` read is NOT reactive
        // (#863), and the projected node's identity does not change when its text does — so this
        // re-checks on renders driven by the signals read above, not on every content change. It
        // catches the header that is empty when those run, which is the shape that actually ships;
        // making it catch every later mutation would need a MutationObserver for a dev warning.
        const title = this.host.nativeElement.querySelector(`[id="${labelledBy}"]`);
        if (title && !title.textContent?.trim()) {
          console.warn(
            'cae-panel: the collapse toggle is labelled by a header that renders no text, so it ' +
              'has no accessible name (WCAG 4.1.2). Give [header] a value, project content into ' +
              '[caePanelHeader], or set [toggleAriaLabel].',
          );
        }
      });
    }
  }

  /**
   * There is deliberately no separate `toggled` output: a `model()` already emits `collapsedChange`
   * on exactly this write, with the same value — `p-panel`'s `onAfterToggle` is `(collapsedChange)`.
   */
  protected toggle(): void {
    this.collapsed.set(!this.collapsed());
  }
}
