import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatTreeModule } from '@angular/material/tree';

/** A node in a `cae-tree`. Nest via `children`; a node with children is expandable. */
export interface CaeTreeNode {
  /** Visible label. */
  label: string;
  /** Optional value identifying the node in `(nodeSelect)`; the whole node is emitted. */
  value?: string;
  /**
   * When `true`, the node cannot be selected/checked: it renders `aria-disabled="true"`, is visually
   * dimmed, and is excluded from selection in every mode — but stays focusable, so roving keyboard
   * still reaches it and a screen reader announces it (the aria-disabled-focusable pattern; Book 05
   * §3.2, Book 16 §2.2/§3.4). Expansion is view-only and stays operable. Honored today by
   * `cae-tree-select` (#282, provisional on decision #526 — per-node state on the shared node model);
   * `cae-tree` (#527) and `cae-tree-table` (#264) follow. A disabled node's `value` written into a
   * form control is retained but shown unselected, resolving if the node is later enabled.
   */
  disabled?: boolean;
  /** Child nodes; presence (and non-emptiness) makes this node expandable. */
  children?: readonly CaeTreeNode[];
}

/**
 * `cae-tree` — the Direct (1:1) wrapper over Material's `mat-tree`
 * (`reference/COMPARISON.md`: `p-tree` → `cae-tree`). Nodes are nested data
 * (`CaeTreeNode[]`); the wrapper drives Material's modern data API (`dataSource` +
 * `childrenAccessor` — the deprecated `TreeControl`/`DataSource` boilerplate is avoided).
 *
 * Accessibility follows the WAI-ARIA tree pattern the CDK provides: each node is a
 * `treeitem` with a **single roving tab stop** (one node is tabbable, the rest carry
 * `tabindex="-1"`), arrow keys move between nodes, and `(activation)` (Enter/Space) selects.
 * The label is therefore plain text — NOT a nested focusable control, which would add extra
 * tab stops and swallow the CDK's arrow-key handling. The toggle is a `tabindex="-1"` button
 * (a mouse affordance; keyboard users expand/collapse with Left/Right). Because a nested
 * `childrenAccessor` renders all descendants regardless of expansion, collapsed subtrees are
 * hidden with CSS bound to `isExpanded` (the a11y state stays correct via `aria-expanded`).
 * No animations. Theme comes free through the token bridge. Zoneless-compatible: `OnPush` +
 * signal state (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTreeModule],
  template: `
    <mat-tree
      #tree="matTree"
      [dataSource]="dataSource()"
      [childrenAccessor]="childrenAccessor"
      [attr.aria-label]="ariaLabel() || null"
    >
      <!-- Leaf node: the treeitem host is the focus/activation target (CDK roving tabindex +
           keyboard nav); (activation) selects via Enter/Space. (click) is the mouse
           equivalent; onNodeClick stops the bubble so a nested ancestor doesn't also select.

           NESTED, not <mat-tree-node>, even though a leaf stamps no children (#491). CdkTreeNode
           declares _type='flat' and CdkNestedTreeNode _type='nested', and each reports it to the tree
           via _setNodeTypeIfUnset() in ngOnInit — so a flat leaf inside a childrenAccessor (nested)
           tree made the tree log "conflicting node types … Current node type: nested, new node type
           flat", under which the CDK states expand/collapse bookkeeping is undefined. A leaf nested
           node with no matTreeNodeOutlet is safe: updateChildrenNodes() no-ops when the outlet query
           is empty, and nodeOutlet is a QueryList, so .changes never throws. -->
      <mat-nested-tree-node
        *matTreeNodeDef="let node"
        (activation)="nodeSelect.emit(node)"
        (click)="onNodeClick(node, $event)"
      >
        <span class="cae-tree__row cae-tree__row--leaf">
          <span class="cae-tree__label">{{ node.label }}</span>
        </span>
      </mat-nested-tree-node>

      <!-- Expandable node: toggle (tabindex=-1) + plain-text label; children stamped into the
           outlet, hidden when collapsed. -->
      <mat-nested-tree-node
        *matTreeNodeDef="let node; when: hasChild"
        [isExpandable]="true"
        (activation)="nodeSelect.emit(node)"
        (click)="onNodeClick(node, $event)"
      >
        <span class="cae-tree__row">
          <button
            type="button"
            class="cae-tree__toggle"
            matTreeNodeToggle
            [attr.aria-label]="(tree.isExpanded(node) ? 'Collapse ' : 'Expand ') + node.label"
          >
            <span aria-hidden="true">{{ tree.isExpanded(node) ? '▾' : '▸' }}</span>
          </button>
          <span class="cae-tree__label">{{ node.label }}</span>
        </span>
        <div
          class="cae-tree__children"
          role="group"
          [style.display]="tree.isExpanded(node) ? null : 'none'"
        >
          <ng-container matTreeNodeOutlet />
        </div>
      </mat-nested-tree-node>
    </mat-tree>
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-tree__row {
      display: inline-flex;
      align-items: center;
      gap: var(--cae-space-1);
      min-block-size: var(--cae-space-5);
    }
    /* Leaf rows have no toggle; this compensator reserves the toggle's footprint so leaf labels line up
       with expandable siblings. It MUST track the toggle's hit-target floor (--cae-target-min + the row
       gap), NOT --cae-space-5 — the toggle is now a density-invariant 24px (#456), so a space-5 value
       (16px at compact) would leave a ragged left edge. */
    .cae-tree__row--leaf {
      padding-inline-start: calc(var(--cae-target-min) + var(--cae-space-1));
    }
    .cae-tree__toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--cae-space-4);
      block-size: var(--cae-space-4);
      /* Floor the (borderless) toggle's hit target to the density-INVARIANT --cae-target-min (24px) so it
         holds WCAG 2.5.8 in every density arm — --cae-space-4 tightens to 12px under [data-density=compact].
         The button is transparent, so this grows only the tap area; the chevron glyph stays centered and
         unchanged (interactive-hit-target floor convention). */
      min-inline-size: var(--cae-target-min);
      min-block-size: var(--cae-target-min);
      padding: 0;
      border: 0;
      background: none;
      color: var(--cae-color-on-surface-variant);
      cursor: pointer;
    }
    .cae-tree__label {
      cursor: pointer;
    }
    /* One roving focus ring, drawn tightly around the focused node's row. */
    mat-tree-node:focus-visible,
    mat-nested-tree-node:focus-visible {
      outline: none;
    }
    mat-tree-node:focus-visible > .cae-tree__row,
    mat-nested-tree-node:focus-visible > .cae-tree__row,
    .cae-tree__toggle:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
      border-radius: var(--cae-radius-sm);
    }
    .cae-tree__children {
      padding-inline-start: var(--cae-space-4);
    }
  `,
})
export class CaeTree {
  /** The nodes to render, as nested data. */
  readonly nodes = input<readonly CaeTreeNode[]>([]);
  /** Accessible name for the tree. */
  readonly ariaLabel = input('');
  /** Emits the node when it is activated (Enter/Space on the focused node, or a click). */
  readonly nodeSelect = output<CaeTreeNode>();

  /** A fresh mutable array for Material's `dataSource` (which rejects readonly). */
  protected readonly dataSource = computed(() => [...this.nodes()]);

  /** Derives a node's children for Material's hierarchy expansion (mutable copy for the CDK). */
  protected readonly childrenAccessor = (node: CaeTreeNode): CaeTreeNode[] => [
    ...(node.children ?? []),
  ];

  /** `when` predicate selecting the expandable node template. */
  protected hasChild = (_: number, node: CaeTreeNode): boolean =>
    !!node.children && node.children.length > 0;

  /**
   * Emit selection for a mouse click, stopping the bubble so an ancestor node (which
   * contains its descendants in the outlet) doesn't also fire `nodeSelect`.
   */
  protected onNodeClick(node: CaeTreeNode, event: Event): void {
    event.stopPropagation();
    this.nodeSelect.emit(node);
  }
}
