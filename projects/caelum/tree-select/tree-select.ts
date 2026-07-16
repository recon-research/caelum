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

/** Single- or multi-select node selection. `checkbox` (tri-state propagation) is a follow-up (#264-class). */
export type CaeTreeSelectionMode = 'single' | 'multiple';

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
 * empty) in `single` mode, a `string[]` in `multiple` mode. A node without a `value` is navigational
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
 * CDK key manager roves over exactly the visible nodes; surviving branches are force-expanded so matches
 * are reachable, and the pre-filter expansion is snapshotted and restored on clear. Filtering is view-only:
 * it never mutates the value, so a selected-but-filtered-out key round-trips and its label returns when the
 * filter clears. (Real-browser SR/focus verification — like the reveal-on-open — is an M4 item; the wiring
 * is unit-tested here.)
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
            [attr.cdkFocusInitial]="isFocusInitial(node) ? '' : null"
            (activation)="onActivate(node)"
            (click)="onActivate(node, $event)"
          >
            <span
              class="cae-tree-select__row cae-tree-select__row--leaf"
              [class.cae-tree-select__row--selected]="isNodeSelected(node)"
            >
              @if (isNodeSelected(node)) {
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
            [attr.cdkFocusInitial]="isFocusInitial(node) ? '' : null"
            (activation)="onActivate(node)"
            (click)="onActivate(node, $event)"
          >
            <span
              class="cae-tree-select__row"
              [class.cae-tree-select__row--selected]="isNodeSelected(node)"
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
              @if (isNodeSelected(node)) {
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
   * `single` (default) → the value is a `string`; `multiple` → a `string[]`. Set ONCE, statically:
   * the value seam's shape depends on it, so a runtime flip changes the emitted type mid-flight.
   * `checkbox` (tri-state parent↔child propagation) is a follow-up (#264-class), not this value.
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
   */
  readonly filterWith = input<(node: CaeTreeNode, query: string) => boolean>((node, query) =>
    node.label.toLowerCase().includes(query),
  );

  /** Whether `multiple` selection is active (derived from {@link selectionMode}). */
  protected readonly multiple = computed(() => this.selectionMode() === 'multiple');

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
   * their ancestor paths. A node that matches the predicate keeps its whole subtree (original object —
   * so its identity, and expansion, survive); an ancestor of a match is kept with only its surviving
   * branches (a fresh object, reconciled by {@link expansionKey} not reference); a node with no match
   * in its subtree is dropped. Feeding a pruned `dataSource` (rather than hiding rows in place) is what
   * keeps the CDK key manager's roving navigation over exactly the visible nodes.
   */
  protected readonly filteredNodes = computed<readonly CaeTreeNode[]>(() => {
    if (!this.isFiltering()) return this.nodes();
    const query = this.query().trim().toLowerCase();
    const predicate = this.filterWith();
    const prune = (nodes: readonly CaeTreeNode[]): CaeTreeNode[] => {
      const kept: CaeTreeNode[] = [];
      for (const node of nodes) {
        if (predicate(node, query)) {
          kept.push(node); // match → keep the whole subtree (original reference)
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

  // Filter-expansion bookkeeping (untracked): the pre-filter expansion snapshot, restored on clear.
  // Keyed by node OBJECT — snapshot and restore both walk `nodes()`, so reference identity is stable
  // between them. (Deliberately NOT a `mat-tree` `expansionKey`: a stable key makes the tree cache child
  // structure by key, which would defeat the structural pruning below — so filtering relies on the
  // pruned copies' fresh identity to re-flatten, and this effect maintains their expansion each keystroke.)
  private wasFiltering = false;
  private preFilterExpanded = new Set<CaeTreeNode>();

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
    // hide it from roving navigation. Snapshot the pre-filter expansion on the first filtering keystroke
    // and restore it when the query clears, so the filter is a temporary overlay that leaves the user's
    // manual expansion intact. `filteredNodes` is a tracked dep (re-runs per keystroke to expand fresh
    // matches); the tree read + expansion mutations are untracked (they must not re-trigger the effect).
    effect(() => {
      const filtering = this.isFiltering();
      const filtered = this.filteredNodes();
      const tree = untracked(this.treeRef);
      if (!tree) return;
      untracked(() => {
        if (filtering) {
          if (!this.wasFiltering) this.preFilterExpanded = this.snapshotExpanded();
          this.wasFiltering = true;
          const expandInternal = (nodes: readonly CaeTreeNode[]): void => {
            for (const node of nodes) {
              if (node.children?.length) {
                tree.expand(node);
                expandInternal(node.children);
              }
            }
          };
          expandInternal(filtered);
        } else if (this.wasFiltering) {
          this.wasFiltering = false;
          const restore = (nodes: readonly CaeTreeNode[]): void => {
            for (const node of nodes) {
              if (node.children?.length) {
                if (this.preFilterExpanded.has(node)) tree.expand(node);
                else tree.collapse(node);
                restore(node.children);
              }
            }
          };
          restore(this.nodes());
          this.preFilterExpanded = new Set();
        }
      });
    });
  }

  /** Snapshot every currently-expanded internal node (the pre-filter state), keyed by object identity. */
  private snapshotExpanded(): Set<CaeTreeNode> {
    const tree = this.treeRef();
    const expanded = new Set<CaeTreeNode>();
    if (!tree) return expanded;
    const walk = (nodes: readonly CaeTreeNode[]): void => {
      for (const node of nodes) {
        if (node.children?.length) {
          if (tree.isExpanded(node)) expanded.add(node);
          walk(node.children);
        }
      }
    };
    walk(this.nodes());
    return expanded;
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
    if (!this.multiple()) return names[0];
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
  /** Whether this node is selected (null-safe: a node without a `value` is never selectable). */
  protected isNodeSelected(node: CaeTreeNode): boolean {
    return node.value != null && this.isSelected(node.value);
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
    this.isOpen.set(false);
    // Reset the filter so the next open shows the full tree. The panel view (and its filter input) is
    // destroyed on close, so clearing the query is enough; also drop the filter-expansion bookkeeping
    // so a reopened, fresh tree starts from a clean (reveal-only) expansion state.
    this.query.set('');
    this.wasFiltering = false;
    this.preFilterExpanded = new Set();
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
    if (this.multiple()) {
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
    this.onChangeFn(this.multiple() ? [] : '');
    this.onTouched();
  }

  // --- ControlValueAccessor ---
  // Normalizes to the mode-appropriate internal array; an unknown key matches no node (nothing shows
  // selected, but the key is retained so it resolves once its node loads). An array written to a
  // SINGLE-select resolves to empty (not a junk single item); a lone string written to a MULTIPLE-
  // select is coerced to a one-element array. null/''/[] all mean "empty" for a selection control.
  writeValue(value: string | readonly string[] | null | undefined): void {
    if (this.multiple()) {
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
