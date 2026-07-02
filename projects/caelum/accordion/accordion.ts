import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatAccordion, MatExpansionModule } from '@angular/material/expansion';

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
 * toggled by Enter/Space and reachable by Tab — the WAI-ARIA APG *required* accordion interactions.
 * The APG's *optional* inter-header Up/Down/Home/End roving is NOT forwarded: Material drives it from
 * an `@ContentChildren(MatExpansionPanelHeader)` query that doesn't cross the `cae-expansion-panel`
 * view boundary. Tracked in #79 for a real-browser check at M4 (with #41).
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
export class CaeAccordion {}

/**
 * `cae-expansion-panel` — the Direct (1:1) wrapper over Material's `mat-expansion-panel`
 * (`reference/COMPARISON.md`: `p-accordionTab`/`p-accordion-panel` → `cae-expansion-panel`;
 * Book 11). A single collapsible section: `title`/`description` render Material's two-part header,
 * the projected content is the body. Usable inside a `cae-accordion` (coordinated open/close) or on
 * its own (an independent collapsible panel — PrimeNG's toggleable `p-panel`).
 *
 * `expanded` is two-way bindable (`[(expanded)]`). The header is natively accessible — a focusable
 * control with `aria-expanded`/`aria-controls`/`aria-disabled`, toggled by Enter/Space (Book 06);
 * inter-header arrow-key roving is the accordion's concern (see `CaeAccordion`, #79). When
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
