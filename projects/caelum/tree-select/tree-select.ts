import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  forwardRef,
  inject,
  input,
  isDevMode,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import { A11yModule, LiveAnnouncer } from '@angular/cdk/a11y';
import { CdkOverlayOrigin, OverlayModule } from '@angular/cdk/overlay';
import type { ConnectedPosition } from '@angular/cdk/overlay';
// Type-only (erased at runtime — no bundle coupling): tree-select reuses the tree node model
// rather than re-declaring it, so a `cae-tree`/`cae-tree-select` consumer shares one node shape
// (the "reuse the node model" goal, ROADMAP M3). A node's `value` is its selection KEY here.
import type { CaeTreeNode } from 'caelum/tree';

/**
 * Node selection: `single` (one key), `multiple` (independent keys, no propagation), or `checkbox`
 * (per-node checkbox with tri-state parent↔child propagation — checking a parent checks its whole
 * subtree; partially-checked children mark the parent indeterminate). `single` emits a `string`;
 * `multiple`/`checkbox` emit a `string[]`.
 */
export type CaeTreeSelectionMode = 'single' | 'multiple' | 'checkbox';

/** A value-bearing node's checkbox state in `checkbox` mode (WAI-ARIA `aria-checked` tri-state). */
type CaeTreeCheckState = 'checked' | 'unchecked' | 'mixed';

// Module-scoped id counter for the panel's stable `id` (aria-controls target). Deterministic per
// load — no Math.random/Date.now (the reproducible-build rule).
let nextUniqueId = 0;

/**
 * `cae-tree-select` — a form control that selects one or many nodes from a hierarchical tree shown
 * in a pop-up panel (`reference/COMPARISON.md` row 57: `p-treeSelect` → `cae-tree-select`; Book 09
 * §3.5, the value-bearing overlay family). The **form-control cousin** of `cae-tree-table` (#262,
 * the data cousin over the same hierarchy — Book 10) and the tree-shaped sibling of `cae-select`.
 *
 * **The value is the model, never the view (Book 09 §3.5).** The `ControlValueAccessor` value is the
 * selected node **key(s)** — a node's {@link CaeTreeNode.value} — while the trigger shows the matching
 * label(s). Expansion state is view-only and never leaks into the value. Like `cae-listbox`, the seam
 * is a plain value (not a `model()`) to match the PrimeNG migration target: a `string` (`''` when
 * empty) in `single` mode, a `string[]` in `multiple` **and** `checkbox` mode. A node without a `value` is navigational
 * (expand/collapse only), never selectable.
 *
 * **The panel is the library's first `cdkConnectedOverlay` (#279).** Every other picker
 * (`cae-select`/`cae-multi-select`/`cae-autocomplete`) delegates to `mat-select`/`matAutocomplete`,
 * but a `mat-select` key manager assumes a FLAT option list — projecting a focusable tree into that
 * panel is unsolved (#138), so a tree that expands/collapses and navigates hierarchically must own
 * its overlay. The five-beat lifecycle (Book 09 §2.2/§3.6) is: open → position/flip → move focus into
 * the tree (`cdkTrapFocus` auto-capture) → dismiss on Escape **or** outside-click → restore focus to
 * the trigger (trap-focus restore on detach). The panel tree is Material's `mat-tree` — rendering,
 * roving-tabindex, and Right/Left expand-collapse come from the CDK tree key manager, not hand-rolled
 * keydown math (Book 05 §3.2), exactly as `cae-tree` does.
 *
 * **Accessibility.** The trigger is `role=combobox` + `aria-haspopup=tree` + `aria-expanded` +
 * `aria-controls` (the open panel). A `combobox` needs an accessible name: set `ariaLabel` or
 * `ariaLabelledby`. Selection feedback is consumer-owned (Caelum's `#47` pattern for non-`mat-form-field`
 * selection controls, as in `cae-listbox`/`cae-radio`/`cae-select-button`): point `ariaDescribedby` at
 * your error/hint text and pair with a form-level live region for submit-time announcement; `required`
 * sets `aria-required`. On open, focus starts on the first selected node (APG select-only-combobox, via
 * `cdkFocusInitial` — the trap's auto-capture lands there instead of the first node), falling back to the
 * first node when nothing selected is currently rendered (a selected descendant of a collapsed parent is
 * not in the DOM). In `multiple` mode — where the panel stays open and `aria-selected` flips silently —
 * each toggle is announced with the running count via `LiveAnnouncer` (#281); the count is genuinely new
 * information, though on some screen readers it may double-speak the label alongside the just-focused node's
 * `aria-selected` state (an M4 real-browser tuning item). Real-browser SR/focus verification is deferred to
 * M4 (like #263/#41).
 *
 * **Clearing (`[showClear]`, #282).** An optional × button in the trigger resets the selection to empty
 * (`p-treeSelect` parity — the library's first `showClear`). It renders only while a selection is visible;
 * because it unmounts on its own click, it moves focus to the trigger first when it held focus (WCAG 2.4.3).
 * The clear is observed through the form value (`onChange` / `valueChanges` fire the empty value) — this
 * family is CVA-only, so there is no separate `(clear)` output (a deliberate deviation from `p-treeSelect`'s
 * `onClear`). A dev-only guard warns when two nodes share a `value` key (colliding selection identity).
 *
 * **Filtering (`[filterable]`, #282).** An opt-in search box at the top of the panel narrows the tree to
 * nodes matching the query plus their ancestor path (`p-treeSelect`'s `filter`, the tree cousin of
 * `cae-multi-select`'s `filterable`). Because this panel owns its focus trap, the box is fully keyboard-
 * and SR-reachable — focus starts in it on open, `ArrowDown` moves into the tree, and a polite live region
 * announces the result count. Filtering feeds a **pruned `dataSource`** (not hidden-in-place rows) so the
 * CDK key manager roves over exactly the visible nodes; surviving branches (fresh copies) are
 * force-expanded so matches are reachable, and because only the copies are ever expanded, clearing the
 * filter restores the user's pre-filter expansion for free. Filtering is view-only:
 * it never mutates the value, so a selected-but-filtered-out key round-trips and its label returns when the
 * filter clears. (Real-browser SR/focus verification — like the reveal-on-open — is an M4 item; the wiring
 * is unit-tested here.)
 *
 * **Checkbox mode (`selectionMode='checkbox'`, #280).** A third mode gives every selectable node a
 * checkbox with **tri-state parent↔child propagation** (`p-treeSelect` `selectionMode="checkbox"` +
 * `propagateSelectionUp/Down`): checking a parent checks its whole subtree (down), and a parent whose
 * children are *all* checked rolls up to checked while a partially-checked parent shows **indeterminate**
 * (up). The value is the same `string[]` seam as `multiple`, holding the **canonical set of fully-checked
 * keys** — leaves *and* fully-checked parents (parity: a fully-checked parent IS selected). Indeterminate
 * parents are derived state, never in the value; `writeValue` canonicalizes an arbitrary key set the same
 * way (writing all of a parent's children rolls the parent up in the *view*, and the parent joins the
 * emitted value on the next change — `writeValue` itself never re-emits, per the CVA contract), and a key
 * with no node yet is **retained** so it round-trips once its node loads (like `single`/`multiple`). Both
 * the canonical set and each node's tri-state come from one post-order walk ({@link classify}). A11y
 * follows the APG "tree with checkboxes" pattern: `aria-checked` (`true`/`false`/`mixed`) rides the
 * **treeitem** and the box is a decorative indicator — NOT a nested focusable — so the single roving tab
 * stop is preserved, exactly as in `single`/`multiple`. Because checkbox state rides `aria-checked`,
 * `aria-multiselectable` (which pairs with the `aria-selected` model) is deliberately omitted in this
 * mode. Like `multiple`, the panel stays open on toggle and each change is announced with the running
 * count. (Same node-selection + tri-state hazard class as `cae-tree-table` #264.)
 *
 * Token-only theming (surface/elevation/border/focus-ring from `--cae-*`; Book 04 §3.6). No foreign
 * library. Zoneless-compatible: `OnPush` + signal state (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-tree-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTreeModule, OverlayModule, A11yModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeTreeSelect), multi: true },
  ],
  template: `
    <button
      #trigger="cdkOverlayOrigin"
      cdkOverlayOrigin
      type="button"
      class="cae-tree-select__trigger"
      role="combobox"
      aria-haspopup="tree"
      [class.cae-tree-select__trigger--open]="isOpen()"
      [class.cae-tree-select__trigger--clearable]="canClear()"
      [attr.aria-expanded]="isOpen()"
      [attr.aria-controls]="isOpen() ? panelId : null"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-labelledby]="ariaLabelledby() || null"
      [attr.aria-describedby]="ariaDescribedby() || null"
      [attr.aria-required]="required() ? 'true' : null"
      [disabled]="isDisabled()"
      (click)="toggle()"
      (keydown)="onTriggerKeydown($event)"
      (focusout)="onTriggerBlur()"
    >
      <span
        class="cae-tree-select__value"
        [class.cae-tree-select__value--placeholder]="!hasSelection()"
      >
        {{ displayText() }}
      </span>
      <span class="cae-tree-select__arrow" aria-hidden="true">▾</span>
    </button>

    <!-- Clear (×): a SIBLING of the trigger, not a child — a button nested in the trigger button is
         invalid HTML. Overlaid on the trigger's trailing edge (before the arrow); shown only while
         [showClear] is set, something is selected, and the control is enabled. -->
    @if (canClear()) {
      <button
        type="button"
        class="cae-tree-select__clear"
        aria-label="Clear selection"
        (click)="clear($event)"
      >
        <span aria-hidden="true">×</span>
      </button>
    }

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayOpen]="isOpen()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayWidth]="triggerWidth()"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="close()"
      (overlayKeydown)="onOverlayKeydown($event)"
      (detach)="close()"
    >
      <div #panel class="cae-tree-select__panel" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
        @if (filterable()) {
          <!-- In-panel filter: focus starts here on open (cdkFocusInitial), so a keyboard user types
               immediately; ArrowDown moves into the tree. It sits inside the focus trap, so unlike
               cae-multi-select's mat-select-parked filter it is fully keyboard/SR-reachable. -->
          <input
            #filterInput
            type="text"
            class="cae-tree-select__filter"
            autocomplete="off"
            [attr.cdkFocusInitial]="''"
            [placeholder]="filterPlaceholder()"
            [attr.aria-label]="filterAriaLabel()"
            [attr.aria-controls]="panelId"
            (input)="onFilter(filterInput.value)"
            (keydown)="onFilterKeydown($event)"
          />
        }
        <mat-tree
          #tree="matTree"
          [id]="panelId"
          [dataSource]="dataSource()"
          [childrenAccessor]="childrenAccessor"
          [attr.aria-label]="ariaLabel() || null"
          [attr.aria-labelledby]="ariaLabelledby() || null"
          [attr.aria-multiselectable]="multiple() ? 'true' : null"
        >
          <!-- Leaf: the treeitem host is the focus/activation target (CDK roving tabindex + keyboard).
               (activation) selects via Enter/Space; (click) is the mouse equivalent. -->
          <mat-tree-node
            *matTreeNodeDef="let node"
            [attr.aria-selected]="ariaSelected(node)"
            [attr.aria-checked]="ariaChecked(node)"
            [attr.cdkFocusInitial]="isFocusInitial(node) ? '' : null"
            (activation)="onActivate(node)"
            (click)="onActivate(node, $event)"
          >
            <span
              class="cae-tree-select__row cae-tree-select__row--leaf"
              [class.cae-tree-select__row--selected]="!checkbox() && isNodeSelected(node)"
            >
              @if (checkbox() && isSelectable(node)) {
                <span
                  class="cae-tree-select__checkbox"
                  [class.cae-tree-select__checkbox--checked]="nodeCheckState(node) === 'checked'"
                  [class.cae-tree-select__checkbox--mixed]="nodeCheckState(node) === 'mixed'"
                  aria-hidden="true"
                ></span>
              } @else if (!checkbox() && isNodeSelected(node)) {
                <span class="cae-tree-select__check" aria-hidden="true">✓</span>
              }
              <span class="cae-tree-select__label">{{ node.label }}</span>
            </span>
          </mat-tree-node>

          <!-- Expandable: toggle (tabindex=-1, mouse affordance; keyboard uses Left/Right) + label.
               The toggle stops propagation so expanding never also selects. -->
          <mat-nested-tree-node
            *matTreeNodeDef="let node; when: hasChild"
            [isExpandable]="true"
            [attr.aria-selected]="ariaSelected(node)"
            [attr.aria-checked]="ariaChecked(node)"
            [attr.cdkFocusInitial]="isFocusInitial(node) ? '' : null"
            (activation)="onActivate(node)"
            (click)="onActivate(node, $event)"
          >
            <span
              class="cae-tree-select__row"
              [class.cae-tree-select__row--selected]="!checkbox() && isNodeSelected(node)"
            >
              <button
                type="button"
                class="cae-tree-select__toggle"
                matTreeNodeToggle
                (click)="$event.stopPropagation()"
                [attr.aria-label]="(tree.isExpanded(node) ? 'Collapse ' : 'Expand ') + node.label"
              >
                <span aria-hidden="true">{{ tree.isExpanded(node) ? '▾' : '▸' }}</span>
              </button>
              @if (checkbox() && isSelectable(node)) {
                <span
                  class="cae-tree-select__checkbox"
                  [class.cae-tree-select__checkbox--checked]="nodeCheckState(node) === 'checked'"
                  [class.cae-tree-select__checkbox--mixed]="nodeCheckState(node) === 'mixed'"
                  aria-hidden="true"
                ></span>
              } @else if (!checkbox() && isNodeSelected(node)) {
                <span class="cae-tree-select__check" aria-hidden="true">✓</span>
              }
              <span class="cae-tree-select__label">{{ node.label }}</span>
            </span>
            <div
              class="cae-tree-select__children"
              role="group"
              [style.display]="tree.isExpanded(node) ? null : 'none'"
            >
              <ng-container matTreeNodeOutlet />
            </div>
          </mat-nested-tree-node>
        </mat-tree>
        @if (isFiltering() && filteredNodes().length === 0) {
          <div class="cae-tree-select__empty" role="presentation">{{ emptyMessage() }}</div>
        }
        <!-- Polite live region announcing the filter result count as the query changes (empty when not
             filtering, so it stays silent until the user searches). -->
        <div class="cae-tree-select__sr" aria-live="polite" aria-atomic="true">
          {{ filterResultText() }}
        </div>
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
      /* Positioning context for the overlaid clear (×) button. */
      position: relative;
    }
    .cae-tree-select__trigger {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--cae-space-2);
      inline-size: 100%;
      min-block-size: var(--cae-space-6);
      padding: var(--cae-space-2) var(--cae-space-3);
      /* Reserve trailing room for the absolutely-placed dropdown arrow (and the × when clearable). */
      padding-inline-end: var(--cae-space-6);
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      background: var(--cae-surface-base);
      color: var(--cae-color-on-surface);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .cae-tree-select__trigger:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
    }
    .cae-tree-select__trigger--open,
    .cae-tree-select__trigger:hover:not(:disabled) {
      border-color: var(--cae-color-primary);
    }
    .cae-tree-select__trigger:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .cae-tree-select__value {
      /* min-inline-size:0 lets the sole flex child shrink so the ellipsis engages (the arrow is now
         absolutely positioned, out of flow). */
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cae-tree-select__value--placeholder {
      color: var(--cae-color-on-surface-variant);
    }
    /* The dropdown arrow sits at the trailing edge, out of the flex flow, so the × can occupy the slot
       just inside it without the two competing for the same flex-end position. Decorative → clicks fall
       through to the trigger button beneath it. */
    .cae-tree-select__arrow {
      position: absolute;
      inset-inline-end: var(--cae-space-3);
      inset-block: 0;
      display: inline-flex;
      align-items: center;
      color: var(--cae-color-on-surface-variant);
      pointer-events: none;
    }
    /* When the clear button is present, reserve extra trailing room (arrow slot + a floored × slot) so
       the ellipsized value text does not run under the ×. */
    .cae-tree-select__trigger--clearable {
      padding-inline-end: calc(var(--cae-space-6) + var(--cae-target-min));
    }
    /* The clear affordance: overlaid on the trigger's trailing edge, just inside of the arrow. The hit
       target is floored to the density-INVARIANT --cae-target-min (24px) — NOT --cae-space-*, which
       shrinks under [data-density=compact] — so it holds the WCAG 2.5.8 minimum in every density arm. */
    .cae-tree-select__clear {
      position: absolute;
      inset-block: 0;
      inset-inline-end: var(--cae-space-6);
      margin-block: auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-inline-size: var(--cae-target-min);
      min-block-size: var(--cae-target-min);
      inline-size: var(--cae-target-min);
      block-size: var(--cae-target-min);
      padding: 0;
      border: 0;
      border-radius: var(--cae-radius-full);
      background: none;
      color: var(--cae-color-on-surface-variant);
      font-size: 1.1em;
      line-height: 1;
      cursor: pointer;
    }
    .cae-tree-select__clear:hover {
      color: var(--cae-color-on-surface);
    }
    .cae-tree-select__clear:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
    }

    .cae-tree-select__panel {
      box-sizing: border-box;
      max-block-size: 18rem;
      overflow: auto;
      padding: var(--cae-space-2);
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      background: var(--cae-surface-raised);
      box-shadow: var(--cae-elevation-3);
    }
    .cae-tree-select__filter {
      box-sizing: border-box;
      inline-size: 100%;
      /* Floor the touch target to the density-INVARIANT --cae-target-min so it holds WCAG 2.5.8 in the
         compact density arm (padding off --cae-space-* alone would shrink below the minimum). */
      min-block-size: var(--cae-target-min);
      margin-block-end: var(--cae-space-2);
      padding: var(--cae-space-2) var(--cae-space-3);
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-sm);
      background: var(--cae-surface-base);
      color: var(--cae-color-on-surface);
      font: inherit;
    }
    .cae-tree-select__filter:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
      border-color: var(--cae-color-primary);
    }
    .cae-tree-select__filter::placeholder {
      color: var(--cae-color-on-surface-variant);
    }
    .cae-tree-select__empty {
      padding: var(--cae-space-2) var(--cae-space-1);
      color: var(--cae-color-on-surface-variant);
    }
    /* Visually-hidden live region — announced by screen readers, out of the visual layout. */
    .cae-tree-select__sr {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      margin: -1px;
      padding: 0;
      border: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .cae-tree-select__row {
      display: inline-flex;
      align-items: center;
      gap: var(--cae-space-1);
      min-block-size: var(--cae-space-5);
      padding-inline: var(--cae-space-1);
      border-radius: var(--cae-radius-sm);
    }
    .cae-tree-select__row--leaf {
      padding-inline-start: var(--cae-space-5);
    }
    .cae-tree-select__row--selected {
      color: var(--cae-color-primary);
      background: var(--cae-surface-sunken);
    }
    .cae-tree-select__toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--cae-space-4);
      block-size: var(--cae-space-4);
      padding: 0;
      border: 0;
      background: none;
      color: var(--cae-color-on-surface-variant);
      cursor: pointer;
    }
    .cae-tree-select__check {
      display: inline-flex;
      inline-size: var(--cae-space-3);
      color: var(--cae-color-primary);
    }
    /* Checkbox mode: a decorative tri-state indicator — the treeitem carries the real aria-checked, so
       this box is aria-hidden and NOT interactive (the row/treeitem is the hit target, needing no
       --cae-target-min floor of its own). Drawn entirely from tokens: an empty bordered box on the base
       surface, primary-filled with a ✓ (checked) or − (indeterminate). */
    .cae-tree-select__checkbox {
      box-sizing: border-box;
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--cae-space-4);
      block-size: var(--cae-space-4);
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-sm);
      background: var(--cae-surface-base);
      color: var(--cae-color-on-primary);
      font-size: 0.75em;
      line-height: 1;
    }
    .cae-tree-select__checkbox--checked,
    .cae-tree-select__checkbox--mixed {
      border-color: var(--cae-color-primary);
      background: var(--cae-color-primary);
    }
    .cae-tree-select__checkbox--checked::after {
      content: '✓';
    }
    .cae-tree-select__checkbox--mixed::after {
      content: '−';
    }
    .cae-tree-select__label {
      cursor: pointer;
    }
    /* One roving focus ring, drawn tightly around the focused node's row (mirrors cae-tree). */
    mat-tree-node:focus-visible,
    mat-nested-tree-node:focus-visible {
      outline: none;
    }
    mat-tree-node:focus-visible > .cae-tree-select__row,
    mat-nested-tree-node:focus-visible > .cae-tree-select__row,
    .cae-tree-select__toggle:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
      border-radius: var(--cae-radius-sm);
    }
    .cae-tree-select__children {
      padding-inline-start: var(--cae-space-4);
    }
  `,
})
export class CaeTreeSelect implements ControlValueAccessor {
  /** The nodes to choose from, as nested data. A node's `value` is its selection key. */
  readonly nodes = input<readonly CaeTreeNode[]>([]);
  /**
   * `single` (default) → the value is a `string`; `multiple` and `checkbox` → a `string[]`. `checkbox`
   * adds per-node checkboxes with tri-state parent↔child propagation (see the class docstring). Set
   * ONCE, statically: the value seam's shape depends on it, so a runtime flip changes the emitted type
   * mid-flight (a dev-only warning fires if it changes after init).
   */
  readonly selectionMode = input<CaeTreeSelectionMode>('single');
  /** Text shown in the trigger when nothing is selected. */
  readonly placeholder = input('Select…');
  /**
   * Show a clear (×) button in the trigger that resets the selection to empty (`p-treeSelect`
   * `showClear` parity — the library's first `showClear`, establishing the input name for the family).
   * The button appears only while a selection is *visible* (a resolved label); an unresolved key —
   * a value written before its node loads — round-trips and becomes clearable once the node arrives.
   */
  readonly showClear = input(false, { transform: booleanAttribute });
  /** Marks the control required — drives `aria-required` on the trigger (sibling of cae-listbox). */
  readonly required = input(false, { transform: booleanAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Accessible name for the combobox when no visible label wraps it (set this OR `ariaLabelledby`). */
  readonly ariaLabel = input('');
  /** `id` of a visible element that labels the control (preferred when a label is shown). */
  readonly ariaLabelledby = input('');
  /**
   * `id`(s) of element(s) describing the control — the a11y hook for a consumer-owned error or hint
   * (Caelum's `#47` pattern; see the class docstring). Placed on the single focusable trigger, where
   * a screen reader reads it on focus; pair with a form-level live region for submit-time announcement.
   */
  readonly ariaDescribedby = input('');

  /**
   * Show an opt-in in-panel search box that filters the tree to nodes matching the typed query (plus
   * their ancestor path, so a match is reachable) — `p-treeSelect`'s `filter`, and the tree cousin of
   * `cae-multi-select`'s `filterable`. Unlike `cae-multi-select` (where Material parks focus on the
   * `mat-select` host, so its filter is a v1 mouse convenience), this panel owns its focus trap, so the
   * filter box is fully keyboard- and screen-reader-reachable: on open focus starts in it, and
   * `ArrowDown` moves into the tree. Filtering is view-only — it never changes the selection value, and
   * a selected-but-filtered-out key stays in the model (its label reappears when the filter clears).
   */
  readonly filterable = input(false, { transform: booleanAttribute });
  /** Placeholder for the filter box. */
  readonly filterPlaceholder = input('Filter');
  /** Accessible name for the filter box (it has no visible label). */
  readonly filterAriaLabel = input('Filter nodes');
  /** Shown in the panel (and announced) when the filter matches nothing. */
  readonly emptyMessage = input('No matches');
  /**
   * Predicate deciding whether a node matches the typed query (already lower-cased + trimmed).
   * Defaults to a case-insensitive label substring match; override for e.g. prefix or key matching. A
   * node matches on its own text only — its ancestors are kept regardless, so the match stays reachable.
   * A custom predicate is called for EVERY node including navigational ones, so guard an optional field:
   * a `value`-based matcher must handle `node.value === undefined` (e.g. `(node.value ?? '').startsWith(q)`).
   */
  readonly filterWith = input<(node: CaeTreeNode, query: string) => boolean>((node, query) =>
    node.label.toLowerCase().includes(query),
  );

  /** Whether `multiple` selection is active (derived from {@link selectionMode}). */
  protected readonly multiple = computed(() => this.selectionMode() === 'multiple');
  /** Whether `checkbox` (tri-state) selection is active. */
  protected readonly checkbox = computed(() => this.selectionMode() === 'checkbox');
  /** Whether the value seam is an array (`multiple` OR `checkbox`) rather than a lone `string`. */
  protected readonly arrayValued = computed(() => this.multiple() || this.checkbox());

  // Selection is tracked internally as a value array (0/1 entries in single mode, N in multiple),
  // then projected to the mode-appropriate seam (`string` | `string[]`) on emit/write — like cae-listbox.
  protected readonly selectedValues = signal<readonly string[]>([]);
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  /**
   * The key whose node auto-capture focus lands on when the panel opens (APG select-only-combobox): the
   * first selected key. EXACTLY ONE node is marked `cdkFocusInitial`, and the reveal effect expands that
   * same key's ancestors — so the marked node is always the revealed (focusable) one, never a hidden
   * later-selected sibling that `querySelector('[cdkFocusInitial]')` would otherwise pick in DOM order.
   */
  protected readonly focusInitialKey = computed<string | undefined>(() => this.selectedValues()[0]);

  /** Whether the overlay panel is open. */
  protected readonly isOpen = signal(false);
  /** Trigger width, captured on open so the panel matches it. */
  protected readonly triggerWidth = signal<number>(0);
  /** Stable id for the panel (aria-controls target). */
  protected readonly panelId = `cae-tree-select-panel-${nextUniqueId++}`;

  /** The trigger origin — read for its width when opening. */
  private readonly origin = viewChild(CdkOverlayOrigin);

  /** Polite announcer for multi-select toggles (the panel stays open, so aria-selected flips silently). */
  private readonly announcer = inject(LiveAnnouncer);

  /** The rendered panel tree — reached to reveal (expand-to) the selected node when the panel opens. */
  private readonly treeRef = viewChild(MatTree);
  /** The panel element — reached to move focus from the filter box into the first tree node. */
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>('panel');

  /** The live filter text; empty when not searching. Reset when the panel closes. */
  protected readonly query = signal('');
  /** Whether a filter query is actively narrowing the tree (opted in AND non-blank). */
  protected readonly isFiltering = computed(
    () => this.filterable() && this.query().trim().length > 0,
  );
  /**
   * The nodes shown in the panel: the full tree when not filtering, otherwise the matching nodes plus
   * their ancestor paths. A node that matches the predicate keeps its whole subtree; an ancestor of a
   * match is kept with only its surviving branches; a node with no match in its subtree is dropped.
   * Every kept node is a **fresh copy** (deliberately no `mat-tree` `expansionKey` — a stable key would
   * make the tree cache child structure by key and defeat this pruning, so it re-flattens by the copies'
   * reference identity). Cloning the *whole* kept branch (not just ancestors) is what lets the
   * force-expand effect touch only throwaway copies, never the originals — so clearing the filter
   * restores the pre-filter expansion for free. Feeding a pruned `dataSource` (rather than hiding rows
   * in place) keeps the CDK key manager roving over exactly the visible nodes.
   */
  protected readonly filteredNodes = computed<readonly CaeTreeNode[]>(() => {
    if (!this.isFiltering()) return this.nodes();
    const query = this.query().trim().toLowerCase();
    const predicate = this.filterWith();
    const clone = (node: CaeTreeNode): CaeTreeNode =>
      node.children?.length ? { ...node, children: node.children.map(clone) } : { ...node };
    const prune = (nodes: readonly CaeTreeNode[]): CaeTreeNode[] => {
      const kept: CaeTreeNode[] = [];
      for (const node of nodes) {
        if (predicate(node, query)) {
          kept.push(clone(node)); // match → keep the whole subtree, as fresh copies
        } else if (node.children?.length) {
          const keptChildren = prune(node.children);
          if (keptChildren.length) kept.push({ ...node, children: keptChildren }); // ancestor of a match
        }
      }
      return kept;
    };
    return prune(this.nodes());
  });
  /** How many nodes match the query on their own (ancestors kept for reachability don't count). */
  protected readonly matchCount = computed(() => {
    if (!this.isFiltering()) return 0;
    const query = this.query().trim().toLowerCase();
    const predicate = this.filterWith();
    let count = 0;
    const walk = (nodes: readonly CaeTreeNode[]): void => {
      for (const node of nodes) {
        if (predicate(node, query)) count++;
        if (node.children?.length) walk(node.children);
      }
    };
    walk(this.nodes());
    return count;
  });
  /** The polite live-region text — "N result(s)" or the empty message; blank when not filtering. */
  protected readonly filterResultText = computed(() => {
    if (!this.isFiltering()) return '';
    const count = this.matchCount();
    return count === 0 ? this.emptyMessage() : `${count} result${count === 1 ? '' : 's'}`;
  });

  /** Below-start with a flip-to-above fallback so the panel never clips off-viewport. */
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  ];

  private onChangeFn: (value: string | readonly string[]) => void = () => {};
  protected onTouched: () => void = () => {};

  constructor() {
    // Parity a11y guard (dev-only): a role=combobox needs an accessible name (Book 09 §3.6 gate 4).
    effect(() => {
      if (isDevMode() && !this.ariaLabel() && !this.ariaLabelledby()) {
        console.warn(
          'cae-tree-select: set `ariaLabel` or `ariaLabelledby` — a combobox requires an accessible name.',
        );
      }
    });
    // Data-integrity guard (dev-only): a node's `value` is its selection KEY, and two nodes sharing one
    // collapse in selection identity — selecting either highlights both, and the trigger's label map keeps
    // only the last. Walk the tree and warn on any repeated key so the collision is caught in development.
    effect(() => {
      if (!isDevMode()) return;
      const seen = new Set<string>();
      const dupes = new Set<string>();
      const walk = (nodes: readonly CaeTreeNode[]): void => {
        for (const node of nodes) {
          if (node.value != null) {
            if (seen.has(node.value)) dupes.add(node.value);
            else seen.add(node.value);
          }
          if (node.children?.length) walk(node.children);
        }
      };
      walk(this.nodes());
      if (dupes.size > 0) {
        console.warn(
          `cae-tree-select: duplicate node value key(s) [${[...dupes].join(', ')}] — selection keys ` +
            'must be unique; a repeated key selects every node that shares it and the trigger shows one label.',
        );
      }
    });
    // Contract guard (dev-only): the value seam's shape (string vs string[]) is fixed by the initial
    // selectionMode, so a later flip silently changes the emitted type. cae-listbox gets a hard throw
    // from MatSelectionList; this control manages its own selection, so it warns instead.
    let firstMode: CaeTreeSelectionMode | undefined;
    effect(() => {
      const mode = this.selectionMode();
      if (firstMode === undefined) firstMode = mode;
      else if (isDevMode() && mode !== firstMode) {
        console.warn(
          'cae-tree-select: `selectionMode` changed after init — the value shape depends on it; set it once, statically.',
        );
      }
    });
    // On open, reveal (expand-to) the first selected node so it is not inside a collapsed, display:none
    // subtree — then `cdkFocusInitial` lands the trap's auto-capture focus on it (APG select-only-combobox,
    // a11y F2 #281). Runs once per open: `isOpen`/`treeRef` are the ONLY tracked deps (a fresh tree is created
    // on each open); the selection and node walk are read untracked, so neither a mid-open multi-select toggle
    // nor a re-emitted `nodes()` reference re-runs the reveal (which would fight a user's manual collapse).
    // A no-op when nothing is selected or the key isn't in the tree (auto-capture's first-node focus stands).
    effect(() => {
      if (!this.isOpen()) return;
      const tree = this.treeRef();
      if (!tree) return;
      untracked(() => {
        const firstKey = this.focusInitialKey();
        if (firstKey == null) return;
        for (const ancestor of this.ancestorPath(firstKey)) tree.expand(ancestor);
      });
    });
    // While filtering, force-expand every surviving internal node so its matches are reachable — the CDK
    // tree key manager only descends into EXPANDED subtrees, so a collapsed ancestor of a match would
    // hide it from roving navigation. `filteredNodes` is a tracked dep (re-runs per keystroke to expand
    // fresh matches); the tree read + expansion mutations are untracked. Every surviving node is a fresh
    // COPY (see `filteredNodes`), so this only ever expands throwaway copies — the ORIGINAL nodes'
    // expansion is never touched, so clearing the filter restores the user's pre-filter expansion for
    // free (the originals re-render with the state they still hold). No snapshot/restore needed.
    effect(() => {
      if (!this.isFiltering()) return;
      const filtered = this.filteredNodes();
      const tree = untracked(this.treeRef);
      if (!tree) return;
      untracked(() => {
        const expandInternal = (nodes: readonly CaeTreeNode[]): void => {
          for (const node of nodes) {
            if (node.children?.length) {
              tree.expand(node);
              expandInternal(node.children);
            }
          }
        };
        expandInternal(filtered);
      });
    });
    // Reset the filter whenever the panel is closed OR the filter is disabled, so it can never linger
    // behind an empty (destroyed/uncontrolled) box. This is the single source of truth for "no visible
    // box → no query"; it covers every close path — `close()`, backdrop `detach`, and `setDisabledState`
    // (which closes without calling `close()`) — where a per-path reset would be easy to miss.
    effect(() => {
      if (!this.isOpen() || !this.filterable()) this.query.set('');
    });
  }

  /**
   * The ancestor nodes from a root down to (but not including) the node holding `key`, in order — the
   * path to expand so a selected node is revealed. `[]` if the key isn't found or is itself a root.
   */
  private ancestorPath(key: string): CaeTreeNode[] {
    const path: CaeTreeNode[] = [];
    const find = (nodes: readonly CaeTreeNode[]): boolean => {
      for (const node of nodes) {
        if (node.value === key) return true;
        if (node.children?.length) {
          path.push(node);
          if (find(node.children)) return true;
          path.pop();
        }
      }
      return false;
    };
    find(this.nodes());
    return path;
  }

  /**
   * The engine of `checkbox` mode: one post-order walk over {@link nodes} that both **canonicalizes**
   * an arbitrary set of seed keys and derives every value-bearing node's tri-state — the single source
   * of truth for both the emitted value and the `aria-checked`/box display.
   *
   * - **Down:** a node forced checked (it is a seed, or an ancestor is checked) forces its whole
   *   subtree checked.
   * - **Up:** a parent whose children are *all* checked rolls up to `checked` (and joins `canonical` —
   *   the `p-treeSelect` parity where a fully-checked parent IS selected); some-but-not-all → `mixed`
   *   (indeterminate); none → `unchecked`.
   *
   * Value-less navigational nodes carry no checkbox (never added to `canonical`) but pass their subtree
   * state through transparently, so a value-bearing ancestor still rolls up over them. A node whose
   * subtree carries NO selectable (value-bearing) node is `relevant: false` — it has no checkbox state
   * to contribute, so it is excluded from a parent's all/any-checked tally rather than counted as
   * `unchecked` (which would wrongly pin the parent to `mixed` forever). Idempotent on an already-
   * canonical seed set, so re-running it for display reproduces the stored selection exactly.
   */
  private classify(seeds: ReadonlySet<string>): {
    canonical: string[];
    states: Map<string, CaeTreeCheckState>;
  } {
    const canonical: string[] = [];
    const states = new Map<string, CaeTreeCheckState>();
    // Returns the node's tri-state AND whether its subtree contains any selectable node (`relevant`).
    const visit = (
      node: CaeTreeNode,
      forcedByAncestor: boolean,
    ): { state: CaeTreeCheckState; relevant: boolean } => {
      const forced = forcedByAncestor || (node.value != null && seeds.has(node.value));
      let anyRelevantChild = false;
      let allChecked = true;
      let anyChecked = false;
      for (const child of node.children ?? []) {
        const childResult = visit(child, forced);
        if (!childResult.relevant) continue; // a no-selectable-content subtree has no opinion
        anyRelevantChild = true;
        if (childResult.state !== 'checked') allChecked = false;
        if (childResult.state !== 'unchecked') anyChecked = true;
      }
      // A node with no relevant children (a leaf, or a parent of only value-less nodes) takes its state
      // straight from `forced`; otherwise it rolls up over its selectable children.
      const state: CaeTreeCheckState = !anyRelevantChild
        ? forced
          ? 'checked'
          : 'unchecked'
        : allChecked
          ? 'checked'
          : anyChecked
            ? 'mixed'
            : 'unchecked';
      if (node.value != null) {
        states.set(node.value, state);
        if (state === 'checked') canonical.push(node.value);
      }
      return { state, relevant: node.value != null || anyRelevantChild };
    };
    for (const node of this.nodes()) visit(node, false);
    return { canonical, states };
  }

  /** Locate a node in the ORIGINAL (unfiltered) tree by its `value` key — used to walk a full subtree. */
  private findNodeByKey(key: string): CaeTreeNode | undefined {
    let found: CaeTreeNode | undefined;
    const walk = (nodes: readonly CaeTreeNode[]): boolean => {
      for (const node of nodes) {
        if (node.value === key) {
          found = node;
          return true;
        }
        if (node.children?.length && walk(node.children)) return true;
      }
      return false;
    };
    walk(this.nodes());
    return found;
  }

  /** Every `value` key in a node's subtree, the node included — the keys to drop on an uncheck cascade. */
  private subtreeKeys(node: CaeTreeNode): string[] {
    const keys: string[] = [];
    const walk = (n: CaeTreeNode): void => {
      if (n.value != null) keys.push(n.value);
      for (const child of n.children ?? []) walk(child);
    };
    walk(node);
    return keys;
  }

  /** The `value` keys of the ancestors of the node holding `key` (root→parent), for the uncheck cascade. */
  private ancestorKeys(key: string): string[] {
    return this.ancestorPath(key)
      .map((node) => node.value)
      .filter((value): value is string => value != null);
  }

  // --- Panel rendering (mat-tree data API, mirrors cae-tree) ---
  /** A fresh mutable array for Material's `dataSource` (which rejects readonly) — filtered when searching. */
  protected readonly dataSource = computed(() => [...this.filteredNodes()]);
  /** Derives a node's children for Material's hierarchy expansion (mutable copy for the CDK). */
  protected readonly childrenAccessor = (node: CaeTreeNode): CaeTreeNode[] => [
    ...(node.children ?? []),
  ];
  /** `when` predicate selecting the expandable node template. */
  protected hasChild = (_: number, node: CaeTreeNode): boolean =>
    !!node.children && node.children.length > 0;

  // --- Trigger display ---
  /** Map of selection key → label, walked from the node tree (for the trigger's display text). */
  private readonly labelByValue = computed(() => {
    const map = new Map<string, string>();
    const walk = (nodes: readonly CaeTreeNode[]): void => {
      for (const node of nodes) {
        if (node.value != null) map.set(node.value, node.label);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(this.nodes());
    return map;
  });
  /**
   * The labels of the currently-selected keys that RESOLVE to a node, in selection order. Keys with
   * no matching node are dropped from the display (not shown as junk) but stay in the value — so a
   * value written before `nodes` loads round-trips and its label appears once the node arrives.
   */
  private readonly resolvedLabels = computed(() => {
    const labels = this.labelByValue();
    return this.selectedValues()
      .map((value) => labels.get(value))
      .filter((label): label is string => label != null);
  });
  /** Whether any selected key resolves to a node (drives the placeholder styling). */
  protected readonly hasSelection = computed(() => this.resolvedLabels().length > 0);
  /** The trigger text: placeholder when nothing resolves, the label(s) otherwise (summarized past two). */
  protected readonly displayText = computed(() => {
    const names = this.resolvedLabels();
    if (names.length === 0) return this.placeholder();
    if (!this.arrayValued()) return names[0];
    return names.length <= 2 ? names.join(', ') : `${names.length} selected`;
  });
  /**
   * Whether the clear (×) button renders: opted in via {@link showClear}, a *visible* selection to
   * clear ({@link hasSelection}, so the × never sits next to a placeholder), the control enabled
   * (a disabled control's value must not be mutable), and the panel closed — while it is open the
   * transparent CDK backdrop overlays the trigger, so a shown × would be un-clickable (the click
   * would hit the backdrop and close instead). A held value whose key never resolves to a node is not
   * independently clearable via the × (it isn't a *visible* selection); it clears once its node loads,
   * or via a programmatic reset to `''` / `[]`.
   */
  protected readonly canClear = computed(
    () => this.showClear() && this.hasSelection() && !this.isDisabled() && !this.isOpen(),
  );

  protected isSelected(value: string): boolean {
    return this.selectedValues().includes(value);
  }
  /** Whether this node can be selected/checked — it carries a `value` key (navigational nodes don't). */
  protected isSelectable(node: CaeTreeNode): boolean {
    return node.value != null;
  }
  /** Whether this node is selected (null-safe: a node without a `value` is never selectable). */
  protected isNodeSelected(node: CaeTreeNode): boolean {
    return node.value != null && this.isSelected(node.value);
  }
  /**
   * Per value-bearing node checkbox state for `checkbox` mode, derived from the current (canonical)
   * selection via one {@link classify} pass. Empty in the other modes (no checkboxes). A node's own
   * `value` keys the map; a value-less navigational node has no entry (and no checkbox).
   */
  protected readonly nodeStates = computed(() =>
    this.checkbox()
      ? this.classify(new Set(this.selectedValues())).states
      : new Map<string, CaeTreeCheckState>(),
  );
  /** This node's checkbox state (checkbox mode); `unchecked` for a value-less / unlisted node. */
  protected nodeCheckState(node: CaeTreeNode): CaeTreeCheckState {
    return (node.value != null && this.nodeStates().get(node.value)) || 'unchecked';
  }
  /**
   * `aria-checked` for a node's treeitem — the APG "tree with checkboxes" tri-state. `null` outside
   * `checkbox` mode and for value-less nodes (which carry no checkbox), so it never doubles up with
   * `aria-selected` (which {@link ariaSelected} drops in checkbox mode).
   */
  protected ariaChecked(node: CaeTreeNode): 'true' | 'false' | 'mixed' | null {
    if (!this.checkbox() || node.value == null) return null;
    const state = this.nodeCheckState(node);
    return state === 'checked' ? 'true' : state === 'mixed' ? 'mixed' : 'false';
  }
  /**
   * Whether this node is the SINGLE auto-capture focus target on open — the first selected key's node
   * (see {@link focusInitialKey}). Null-safe so an empty selection (`focusInitialKey === undefined`)
   * never matches a navigational node's absent `value`. Yields to the filter box when `filterable`: the
   * input carries `cdkFocusInitial` instead, so focus starts there (and marking two targets would let
   * `querySelector` pick whichever comes first in DOM order — the input — anyway).
   */
  protected isFocusInitial(node: CaeTreeNode): boolean {
    return !this.filterable() && node.value != null && node.value === this.focusInitialKey();
  }
  /**
   * `aria-selected` for a node. Dropped (`null`) for a navigational node. In SINGLE mode it is set
   * only on the selected node (APG single-select; a resting `false` on every node is SR noise); in
   * MULTIPLE mode (an `aria-multiselectable` tree) every selectable node carries its true/false state.
   */
  protected ariaSelected(node: CaeTreeNode): boolean | null {
    if (this.checkbox()) return null; // checkbox mode conveys state via aria-checked (tri-state), not aria-selected
    if (node.value == null) return null;
    if (!this.multiple() && !this.isSelected(node.value)) return null;
    return this.isSelected(node.value);
  }

  // --- Open / close ---
  protected toggle(): void {
    if (this.isOpen()) this.close();
    else this.openPanel();
  }
  protected openPanel(): void {
    // Nothing to pick (or disabled) → don't open. An empty tree would strand trap-focus auto-capture
    // (no tabbable node to catch focus), so opening on an empty/still-loading node set is a no-op.
    if (this.isDisabled() || this.nodes().length === 0) return;
    const el = this.origin()?.elementRef.nativeElement as HTMLElement | undefined;
    if (el) this.triggerWidth.set(el.offsetWidth);
    this.isOpen.set(true);
  }
  protected close(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false); // the reset effect clears the filter query on any close (incl. this one)
    this.onTouched();
  }

  // --- Filtering ---
  protected onFilter(text: string): void {
    this.query.set(text);
  }
  /**
   * Keyboard in the filter box: `ArrowDown` moves focus into the tree (its first node), from where the
   * CDK key manager takes over. Printable + caret keys (Home/End/Left/Right) edit the query — the tree's
   * key manager listens on the `mat-tree` element, not this input's ancestors, so they don't leak into
   * navigation and need no `stopPropagation`. `Escape` bubbles to the overlay keydown handler (close).
   */
  protected onFilterKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.focusFirstNode();
    }
  }
  /** Move focus to the first rendered tree node (from the filter box). No-op if the tree is empty. */
  private focusFirstNode(): void {
    const first = this.panelRef()?.nativeElement.querySelector<HTMLElement>('[role="treeitem"]');
    first?.focus();
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    // Enter/Space fall through to the native button (click) → toggle; ArrowDown/Up open (and
    // trap-focus auto-capture moves focus into the tree). Escape while open closes.
    if (this.isDisabled()) return;
    if (!this.isOpen() && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      this.openPanel();
    } else if (this.isOpen() && event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }
  protected onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }
  protected onTriggerBlur(): void {
    // Mark touched when focus leaves the trigger WITHOUT opening the panel (opening moves focus into
    // the panel, where isOpen() is already true, so this skips — close() marks touched for that path).
    if (!this.isOpen()) this.onTouched();
  }

  // --- Selection ---
  protected onActivate(node: CaeTreeNode, event?: Event): void {
    event?.stopPropagation();
    const key = node.value;
    if (key == null) return; // navigational node — not selectable
    if (this.checkbox()) {
      this.toggleCheckbox(node, key);
    } else if (this.multiple()) {
      const wasSelected = this.isSelected(key);
      const next = wasSelected
        ? this.selectedValues().filter((value) => value !== key)
        : [...this.selectedValues(), key];
      this.selectedValues.set(next);
      this.onChangeFn([...next]);
      // Multi-select keeps the panel open and flips aria-selected silently; announce the toggle + the
      // running count so a screen-reader user gets feedback (a11y F6, #281). Single mode needs none — it
      // closes on pick and the trigger's new value is announced when focus returns to it.
      this.announcer.announce(
        `${node.label} ${wasSelected ? 'deselected' : 'selected'}, ${next.length} selected`,
      );
    } else {
      // Re-picking the already-selected node is a no-op on the value — skip the spurious re-emit.
      if (!(this.selectedValues().length === 1 && this.selectedValues()[0] === key)) {
        this.selectedValues.set([key]);
        this.onChangeFn(key);
      }
      this.close(); // single-select commits and dismisses
    }
  }

  /**
   * Toggle a node's checkbox (`checkbox` mode) with tri-state propagation. A `checked` node UNchecks:
   * its subtree keys and its ancestor keys are dropped from the seed set (an ancestor can no longer be
   * fully checked, and a leftover subtree key would wrongly roll it back up). An `unchecked` OR `mixed`
   * node CHECKS: adding it as a seed makes {@link classify} force its whole subtree on and roll any
   * now-fully-checked ancestor up. The recomputed canonical set is stored and emitted; like `multiple`
   * the panel stays open and the toggle + running count is announced (a11y F6, #281).
   */
  private toggleCheckbox(node: CaeTreeNode, key: string): void {
    const seeds = new Set(this.selectedValues());
    const wasChecked = this.nodeCheckState(node) === 'checked';
    if (wasChecked) {
      // Walk the subtree from the ORIGINAL tree, not `node`: while filtering, `node` is a pruned clone
      // from the filtered dataSource, so its children may be missing — walking it would leave a
      // filtered-out checked descendant in the value and wrongly roll the parent back up to mixed.
      const original = this.findNodeByKey(key) ?? node;
      for (const value of this.subtreeKeys(original)) seeds.delete(value);
      for (const value of this.ancestorKeys(key)) seeds.delete(value);
    } else {
      seeds.add(key);
    }
    const canonical = this.classify(seeds).canonical;
    this.selectedValues.set(canonical);
    this.onChangeFn([...canonical]);
    this.announcer.announce(
      `${node.label} ${wasChecked ? 'unchecked' : 'checked'}, ${canonical.length} selected`,
    );
  }

  /**
   * Reset the selection to empty (the `[showClear]` × button). Emits the mode-appropriate empty value
   * (`''` single / `[]` multiple) and marks the control touched. The × renders only while there's a
   * selection, so clearing UNMOUNTS it: if it held focus (keyboard activation), move focus to the
   * always-present trigger FIRST — otherwise removing the focused button drops focus to `<body>`
   * (WCAG 2.4.3; the [[focus-after-control-unmount]] pattern). Moving focus before the mutation is
   * deterministic (the trigger never unmounts), so no post-render callback is needed.
   */
  protected clear(event: Event): void {
    event.stopPropagation(); // never bubble to the trigger toggle (defensive — it's a separate element)
    if (this.isDisabled()) return;
    if (document.activeElement === event.currentTarget) {
      (this.origin()?.elementRef.nativeElement as HTMLElement | undefined)?.focus();
    }
    this.selectedValues.set([]);
    this.onChangeFn(this.arrayValued() ? [] : '');
    this.onTouched();
  }

  // --- ControlValueAccessor ---
  // Normalizes to the mode-appropriate internal array; an unknown key matches no node (nothing shows
  // selected, but the key is retained so it resolves once its node loads). An array written to a
  // SINGLE-select resolves to empty (not a junk single item); a lone string written to a MULTIPLE-
  // select is coerced to a one-element array. null/''/[] all mean "empty" for a selection control.
  writeValue(value: string | readonly string[] | null | undefined): void {
    if (this.checkbox()) {
      // Canonicalize an arbitrary written key set through the SAME tri-state walk as a toggle: seeds
      // propagate down (a written parent checks its subtree) and roll up (all children written → the
      // parent is added). So `['app','api']` (both of Projects' leaves) canonicalizes to `[...,'proj']`.
      // Any key with no node YET is RETAINED, not dropped: a value written before an async `nodes()`
      // loads must round-trip like it does in single/multiple, else it is silently lost. classify
      // ignores unknown keys and `nodeStates`/`resolvedLabels` derive off `nodes()`, so when the node
      // arrives the retained key rolls up and displays; the next toggle emits the fully canonical set.
      // No onChange — writeValue is the model→view direction (CVA contract).
      const seeds = Array.isArray(value)
        ? [...value]
        : value != null && value !== ''
          ? [value as string]
          : [];
      const known = this.labelByValue();
      const canonical = this.classify(new Set(seeds)).canonical;
      this.selectedValues.set([...canonical, ...seeds.filter((key) => !known.has(key))]);
    } else if (this.multiple()) {
      this.selectedValues.set(
        Array.isArray(value) ? [...value] : value != null && value !== '' ? [value as string] : [],
      );
    } else {
      this.selectedValues.set(
        !Array.isArray(value) && value != null && value !== '' ? [value as string] : [],
      );
    }
  }
  registerOnChange(fn: (value: string | readonly string[]) => void): void {
    this.onChangeFn = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
    // Close a disabled control directly — NOT via close(), whose onTouched() would wrongly mark the
    // field touched (and could surface touched+invalid error styling) just for being disabled.
    if (isDisabled) this.isOpen.set(false);
  }
}
