import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatTreeModule } from '@angular/material/tree';

/** A node in a `cae-tree`. Nest via `children`; a node with children is expandable. */
export interface CaeTreeNode {
  /** Visible label. */
  label: string;
  /** Optional value identifying the node in `(nodeSelect)`; the whole node is emitted. */
  value?: string;
  /** Child nodes; presence (and non-emptiness) makes this node expandable. */
  children?: CaeTreeNode[];
}

/**
 * `cae-tree` — the Direct (1:1) wrapper over Material's `mat-tree`
 * (`reference/COMPARISON.md`: `p-tree` → `cae-tree`). Nodes are nested data
 * (`CaeTreeNode[]`); the wrapper drives Material's modern data API (`dataSource` +
 * `childrenAccessor` — the deprecated `TreeControl`/`DataSource` boilerplate is avoided).
 * Each node is a `treeitem`; its label and toggle are real `<button>`s, so selection and
 * expand/collapse are fully keyboard-operable (Tab + Enter/Space) and mouse-operable, with
 * the tree structure conveyed to assistive tech. Because a nested `childrenAccessor` renders
 * all descendants regardless of expansion, collapsed subtrees are hidden with CSS bound to
 * `isExpanded` (the a11y state stays correct via `aria-expanded`). No animations. Theme comes
 * free through the token bridge. Zoneless-compatible: `OnPush` + signal state (provisional on
 * #9; Book 01 §3.2).
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
      <!-- Leaf node: a focusable treeitem; its label button selects. -->
      <mat-tree-node *matTreeNodeDef="let node">
        <span class="cae-tree__row cae-tree__row--leaf">
          <button type="button" class="cae-tree__label" (click)="nodeSelect.emit(node)">
            {{ node.label }}
          </button>
        </span>
      </mat-tree-node>

      <!-- Expandable node: toggle + label; children stamped into the outlet, hidden when collapsed. -->
      <mat-nested-tree-node *matTreeNodeDef="let node; when: hasChild" [isExpandable]="true">
        <span class="cae-tree__row">
          <button
            type="button"
            class="cae-tree__toggle"
            matTreeNodeToggle
            [attr.aria-label]="(tree.isExpanded(node) ? 'Collapse ' : 'Expand ') + node.label"
          >
            <span aria-hidden="true">{{ tree.isExpanded(node) ? '▾' : '▸' }}</span>
          </button>
          <button type="button" class="cae-tree__label" (click)="nodeSelect.emit(node)">
            {{ node.label }}
          </button>
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
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .cae-tree__toggle:focus-visible,
    .cae-tree__label:focus-visible {
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
  /** Emits the node when its label is activated (click or keyboard). */
  readonly nodeSelect = output<CaeTreeNode>();

  /** A fresh mutable array for Material's `dataSource` (which rejects readonly). */
  protected readonly dataSource = computed(() => [...this.nodes()]);

  /** Derives a node's children for Material's hierarchy expansion. */
  protected readonly childrenAccessor = (node: CaeTreeNode): CaeTreeNode[] => node.children ?? [];

  /** `when` predicate selecting the expandable node template. */
  protected hasChild = (_: number, node: CaeTreeNode): boolean =>
    !!node.children && node.children.length > 0;
}
