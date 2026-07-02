import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatTreeModule } from '@angular/material/tree';

/** A node in a `cae-tree`. Nest via `children`; a node with children is expandable. */
export interface CaeTreeNode {
  /** Visible label. */
  label: string;
  /** Optional value identifying the node in `(nodeSelect)`; the whole node is emitted. */
  value?: string;
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
           equivalent; onNodeClick stops the bubble so a nested ancestor doesn't also select. -->
      <mat-tree-node
        *matTreeNodeDef="let node"
        (activation)="nodeSelect.emit(node)"
        (click)="onNodeClick(node, $event)"
      >
        <span class="cae-tree__row cae-tree__row--leaf">
          <span class="cae-tree__label">{{ node.label }}</span>
        </span>
      </mat-tree-node>

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
    .cae-tree__row--leaf {
      padding-inline-start: var(--cae-space-5);
    }
    .cae-tree__toggle {
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
