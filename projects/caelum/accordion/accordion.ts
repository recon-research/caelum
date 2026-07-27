import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  contentChildren,
  inject,
  input,
  output,
  QueryList,
  viewChild,
} from '@angular/core';
import {
  MatAccordion,
  MatExpansionModule,
  MatExpansionPanelHeader,
} from '@angular/material/expansion';

/**
 * `cae-accordion` — the Direct (1:1) wrapper over Material's `mat-accordion`
 * (`reference/COMPARISON.md`: `p-accordion` → `cae-accordion`; Book 11). A zero-logic
 * container: it applies `MatAccordion` as a host directive and projects its `cae-expansion-panel`
 * children through `<ng-content>`, mirroring the `<p-accordion>` authoring model.
 *
 * No template re-stamping is needed (unlike `cae-tabs`/`cae-stepper`): expansion panels render
 * eagerly and coordinate purely through DI. A projected `cae-expansion-panel` finds this accordion
 * because its inner `mat-expansion-panel` does `inject(MAT_ACCORDION, { skipSelf: true })`, which
 * walks up the injector tree to this host — content children see a projecting host's element-level
 * providers (Book 01 §3.3). Single-expand (`multi=false`, the default) is coordinated by Material's
 * `UniqueSelectionDispatcher` keyed by this accordion's auto-generated unique id, so two separate
 * `cae-accordion`s never cross-talk (no manual group naming, unlike `cae-radio`).
 *
 * Theme comes free through the token bridge. Zoneless-compatible: `OnPush`, no zone-coupled APIs
 * (provisional on #9; Book 01 §3.2).
 *
 * Inputs are exposed straight off `MatAccordion` (a pure passthrough, like `caeTooltip`):
 * - `multiple` — allow more than one panel open at once (aliases Material's `multi`; matches
 *   PrimeNG's `p-accordion [multiple]` and the sibling `cae-select-button`; default `false`).
 * - `displayMode` — `'default'` (spaced cards) or `'flat'` (flush, divider-separated).
 * - `hideToggle` — hide the expand/collapse chevrons for every panel.
 *
 * A11y: each header is a focusable control with `aria-expanded`/`aria-controls`/`aria-disabled`,
 * toggled by Enter/Space and reachable by Tab — the WAI-ARIA APG *required* accordion interactions —
 * plus the APG's *optional* inter-header Up/Down/Home/End roving (#759, see `syncHeaders` below).
 * All of it is pinned in a real browser (`accordion.browser.spec.ts`, #405, was #79).
 *
 * Note that roving here means *arrow keys also move focus*, *not* a single roving tab stop: Material
 * binds `[attr.tabindex]="disabled ? -1 : tabIndex"` on every header (tabIndex defaults to 0), so a
 * real `mat-accordion` leaves each header independently tabbable and layers the arrows on top. Caelum
 * matches that exactly — Tab still reaches every header.
 */
@Component({
  selector: 'cae-accordion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    { directive: MatAccordion, inputs: ['multi: multiple', 'displayMode', 'hideToggle'] },
  ],
  template: `<ng-content />`,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class CaeAccordion {
  /** The `MatAccordion` host directive — the owner of the key manager this feeds. */
  private readonly accordion = inject(MatAccordion, { self: true });

  /**
   * `descendants: true` is passed EXPLICITLY — it is not the default for `contentChildren`, and
   * omitting it silently drops any panel that is not a direct child (measured: a panel inside a
   * `<div>` wrapper is not collected, so it never roves). Material queries its own headers with
   * `{ descendants: true }`, so anything less is a parity gap against the very component we wrap.
   *
   * Collecting that widely is what makes the ownership filter in {@link syncHeaders} load-bearing:
   * the query now reaches panels that belong to a *nested* accordion, and only the filter keeps the
   * two groups from roving into each other.
   */
  private readonly panels = contentChildren(CaeExpansionPanel, { descendants: true });

  constructor() {
    // afterRenderEffect, not effect: MatAccordion's ngAfterContentInit resets `_ownHeaders` from its
    // (permanently empty) query, and the after-render phase is the only hook guaranteed to run after
    // every lifecycle hook in the pass — so this write is always the last one, never the clobbered one.
    afterRenderEffect(() => this.syncHeaders());
  }

  /**
   * Give Material's key manager the headers its own content query cannot see (#759).
   *
   * `MatAccordion` drives Up/Down/Home/End from a `FocusKeyManager` over `_ownHeaders`, which it
   * fills from `@ContentChildren(MatExpansionPanelHeader, { descendants: true })`. A content query
   * does not cross a component view boundary and `cae-expansion-panel` renders its
   * `<mat-expansion-panel-header>` inside its OWN view — so that query matches nothing, the manager
   * holds no items, and every arrow key is a no-op.
   *
   * *Only* the item list is missing; the rest of the wiring is already live, because the inner
   * `mat-expansion-panel` injects `MAT_ACCORDION` and finds this host. The header's `_keydown`
   * routes every non-Enter/Space key to `accordion._handleHeaderKeydown`, and its focus monitor
   * calls `accordion._handleHeaderFocus` — the sync that makes ArrowDown continue from the header
   * the user actually tabbed to. Supplying the list therefore reuses Material's manager, including
   * `withWrap()` and `withHomeAndEnd()`, instead of standing up a second one to keep in step.
   *
   * The ownership filter is Material's own line and needs no cast — `header.panel.accordion` is
   * public in `expansion.d.ts`. It matters for nesting: a nested `cae-accordion`'s panels are
   * collected by the outer `descendants: true` query but belong to the inner accordion, so each
   * manager ends up with exactly its own headers.
   *
   * **A D-623 reach.** `_ownHeaders` is TS-private. Guard 1 is the feature-detect below, degrading
   * to the pre-#759 behaviour (no roving — still APG-conformant, since the rove is optional) rather
   * than throwing if a Material bump renames it. Guard 2 is the shape pin in `accordion.spec.ts`,
   * so that bump fails in CI instead of silently in a user's keyboard. Guard 3 — report upstream,
   * drop the reach once a public seam exists — is #796.
   *
   * Diffed against the QueryList's LIVE contents, never a cached copy: Material re-runs its own
   * `_ownHeaders.reset(...)` whenever `_headers` emits, so reading live is what makes this repair
   * itself after such a clobber instead of guarding the repair away.
   */
  private syncHeaders(): void {
    const own = (this.accordion as unknown as { _ownHeaders?: QueryList<MatExpansionPanelHeader> })
      ._ownHeaders;
    if (typeof own?.reset !== 'function' || typeof own.notifyOnChanges !== 'function') return;

    const headers = this.panels()
      .map((panel) => panel.header())
      .filter((header): header is MatExpansionPanelHeader => header !== undefined)
      .filter((header) => header.panel.accordion === this.accordion);

    const current = own.toArray();
    if (current.length === headers.length && current.every((h, i) => h === headers[i])) return;
    own.reset(headers);
    // notifyOnChanges is NOT redundant with reset: the manager reads the item array lazily (so the
    // rove itself works either way), but it tracks the active item by INDEX. Only this notification
    // re-maps that index when a structural change shifts a focused header — without it, inserting a
    // panel above the focused one sends the next ArrowDown backwards. Same failure as #611.
    own.notifyOnChanges();
  }
}

/**
 * `cae-expansion-panel` — the Direct (1:1) wrapper over Material's `mat-expansion-panel`
 * (`reference/COMPARISON.md`: `p-accordionTab`/`p-accordion-panel` → `cae-expansion-panel`;
 * Book 11). A single collapsible section: `title`/`description` render Material's two-part header,
 * the projected content is the body. Usable inside a `cae-accordion` (coordinated open/close) or on
 * its own (an independent collapsible panel — PrimeNG's toggleable `p-panel`).
 *
 * `expanded` is two-way bindable (`[(expanded)]`). The header is natively accessible — a focusable
 * control with `aria-expanded`/`aria-controls`/`aria-disabled`, toggled by Enter/Space (Book 06);
 * inter-header arrow-key roving is the accordion's concern (see `CaeAccordion`, #759). When
 * coordinated by an accordion, a single-expand auto-close still fires `expandedChange`, so a bound
 * model stays in sync with no reconciliation on our side. Not a form control, so no CVA and no
 * `<mat-error>`. Zoneless-compatible: `OnPush` + signal state (provisional on #9; Book 01 §3.2).
 *
 * Rich (non-text) header content — an icon or badge beside the title — is a followup (#78), like the
 * rich-error escape hatch (#48); today the header is `title` + optional `description` text.
 */
@Component({
  selector: 'cae-expansion-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatExpansionModule],
  template: `
    <mat-expansion-panel
      [expanded]="expanded()"
      [disabled]="disabled()"
      [hideToggle]="hideToggle()"
      (expandedChange)="expandedChange.emit($event)"
      (opened)="opened.emit()"
      (closed)="closed.emit()"
    >
      <mat-expansion-panel-header>
        <mat-panel-title>{{ title() }}</mat-panel-title>
        @if (description()) {
          <mat-panel-description>{{ description() }}</mat-panel-description>
        }
      </mat-expansion-panel-header>
      <ng-content />
    </mat-expansion-panel>
  `,
})
export class CaeExpansionPanel {
  /**
   * @internal The header instance, for {@link CaeAccordion}'s key manager (#759). Material renders
   * it inside THIS component's view, so the accordion's own content query cannot reach it and
   * collects it from here instead. `stripInternal` (tsconfig.lib.json) keeps it out of the published
   * typings — it is a parent/child seam, not a supported consumer API.
   */
  readonly header = viewChild(MatExpansionPanelHeader);
  /** Header title text (Material's `mat-panel-title`). */
  readonly title = input('');
  /** Optional secondary header text shown to the side (Material's `mat-panel-description`). */
  readonly description = input('');
  /**
   * Whether the panel is open. Prefer two-way `[(expanded)]`: a user toggle mutates Material's own
   * state directly, so a one-way `[expanded]` that never reflects the change back will silently
   * diverge from the rendered panel (an unchanged input value is not re-asserted).
   */
  readonly expanded = input(false, { transform: booleanAttribute });
  /** Disable the panel — the header can't be toggled and is styled/announced as disabled. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * Hide this panel's expand/collapse chevron. Combined with the accordion's `hideToggle` as an OR
   * (Material's rule), so leaving it `false` never overrides an accordion-level `hideToggle`.
   */
  readonly hideToggle = input(false, { transform: booleanAttribute });
  /** Emits the new open state whenever it changes (drives `[(expanded)]`). */
  readonly expandedChange = output<boolean>();
  /** Emits when the panel starts opening (PrimeNG's `onOpen`). */
  readonly opened = output<void>();
  /** Emits when the panel starts closing (PrimeNG's `onClose`). */
  readonly closed = output<void>();
}
