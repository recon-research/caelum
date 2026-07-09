import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  input,
  isDevMode,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatTreeModule } from '@angular/material/tree';
import { A11yModule } from '@angular/cdk/a11y';
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
 * sets `aria-required`. Real-browser SR/focus verification is deferred to M4 (like #263/#41).
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
      <div class="cae-tree-select__panel" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
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
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
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
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cae-tree-select__value--placeholder {
      color: var(--cae-color-on-surface-variant);
    }
    .cae-tree-select__arrow {
      flex: none;
      color: var(--cae-color-on-surface-variant);
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

  /** Whether `multiple` selection is active (derived from {@link selectionMode}). */
  protected readonly multiple = computed(() => this.selectionMode() === 'multiple');

  // Selection is tracked internally as a value array (0/1 entries in single mode, N in multiple),
  // then projected to the mode-appropriate seam (`string` | `string[]`) on emit/write — like cae-listbox.
  protected readonly selectedValues = signal<readonly string[]>([]);
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  /** Whether the overlay panel is open. */
  protected readonly isOpen = signal(false);
  /** Trigger width, captured on open so the panel matches it. */
  protected readonly triggerWidth = signal<number>(0);
  /** Stable id for the panel (aria-controls target). */
  protected readonly panelId = `cae-tree-select-panel-${nextUniqueId++}`;

  /** The trigger origin — read for its width when opening. */
  private readonly origin = viewChild(CdkOverlayOrigin);

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
  }

  // --- Panel rendering (mat-tree data API, mirrors cae-tree) ---
  /** A fresh mutable array for Material's `dataSource` (which rejects readonly). */
  protected readonly dataSource = computed(() => [...this.nodes()]);
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

  protected isSelected(value: string): boolean {
    return this.selectedValues().includes(value);
  }
  /** Whether this node is selected (null-safe: a node without a `value` is never selectable). */
  protected isNodeSelected(node: CaeTreeNode): boolean {
    return node.value != null && this.isSelected(node.value);
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
    this.onTouched();
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
      const next = this.isSelected(key)
        ? this.selectedValues().filter((value) => value !== key)
        : [...this.selectedValues(), key];
      this.selectedValues.set(next);
      this.onChangeFn([...next]);
    } else {
      // Re-picking the already-selected node is a no-op on the value — skip the spurious re-emit.
      if (!(this.selectedValues().length === 1 && this.selectedValues()[0] === key)) {
        this.selectedValues.set([key]);
        this.onChangeFn(key);
      }
      this.close(); // single-select commits and dismisses
    }
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
