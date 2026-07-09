import { Directive, TemplateRef, inject, input } from '@angular/core';

/**
 * The context bound into a {@link CaeTreeCellDef} template — the values a custom tree-table cell
 * renderer receives. Vendor-neutral (no Material type): the consumer never touches `mat-table`
 * internals. This context is **library-produced** — a consumer only ever *reads* it via `let-`
 * bindings, never constructs it — so adding a field later is a non-breaking enhancement, not a
 * breaking change.
 *
 * Unlike {@link CaeCellContext} (the flat-table cell context) this carries the node's **tree
 * position** — `level`, `expandable`, `expanded` — so a cell can react to the hierarchy (bold a
 * parent, show a child count, indent a secondary line). There is no page-relative/absolute row
 * index: a tree-table is not paginated in v1, and a node's meaningful identity is its place in the
 * hierarchy, not a flat ordinal.
 *
 * ```html
 * <ng-template caeTreeCellDef="name" let-row let-level="level" let-expandable="expandable">
 *   <strong [class.is-branch]="expandable">{{ row.name }}</strong>
 * </ng-template>
 * ```
 *
 * @typeParam T - the row shape (the node's `data`). Always `unknown` in v1 in practice: a projected
 * `<ng-template>` cannot infer `T` from the sibling {@link CaeTreeTable}, so `$implicit`/`value` reach
 * the template as `unknown` and the consumer narrows them. The generic is the (zero-cost) seam for a
 * future typed-context inference improvement — not accidental over-abstraction.
 */
export interface CaeTreeCellContext<T> {
  /** The node's `data` object. The **implicit** value, so a bare `let-row` binds it (`unknown` in v1 — narrow it). */
  $implicit: T;
  /**
   * The cell's raw value for this column (`data[key]`), so `let-value="value"` avoids re-indexing.
   * Typed `unknown` — the template is keyed by a string column, so a precise per-column value type is
   * not available; the consumer narrows it (they know the column).
   */
  value: unknown;
  /** The node's **0-based depth** in the tree (a root is `0`); mirrors the row's `aria-level - 1`. Bind `let-level="level"`. */
  level: number;
  /** Whether this node has children (an expandable branch). Bind `let-expandable="expandable"`. */
  expandable: boolean;
  /** Whether this (expandable) node is currently expanded — always `false` for a leaf. Bind `let-expanded="expanded"`. */
  expanded: boolean;
}

/**
 * Marks an `<ng-template>` as the **custom cell renderer** for one {@link CaeTreeTable} column — the
 * tree-table analogue of {@link CaeCellDef} (`p-treeTable` body templating). Bind the column `key`;
 * the tree-table renders this template *inside its own `<td>`* for that column, with the
 * {@link CaeTreeCellContext} in scope, so a column can show a badge, formatted value, or link instead
 * of plain text — while the library keeps ownership of the `<tr>`/`<td>` wrapper and its `treegrid`
 * a11y structure (row roles, `aria-level`/`aria-expanded`, the expand toggle and depth indent on the
 * lead column):
 *
 * ```html
 * <cae-tree-table [nodes]="tree" [columns]="cols">
 *   <ng-template caeTreeCellDef="size" let-value="value">
 *     <cae-badge>{{ value }}</cae-badge>
 *   </ng-template>
 * </cae-tree-table>
 * ```
 *
 * Columns without a matching `caeTreeCellDef` keep the zero-boilerplate text default. A `caeTreeCellDef`
 * whose key matches no column, or a duplicate for the same key, is dev-warned.
 *
 * **Accessible cell content.** The default text path is inherently safe; a projected template is only
 * as accessible as you make it. An icon-only button/link needs a discernible name (WCAG 4.1.2); a
 * status conveyed by color alone also needs text or shape (WCAG 1.4.1). The tree-table is a
 * `role="treegrid"` with row-level roving focus, so keep interactive cell content simple — a control
 * that itself demands arrow-key navigation would fight the grid's own keyboard model (single controls
 * are fine; that is a v1 scope note, not a defect).
 *
 * @typeParam T - the row shape. Always `unknown` in v1 (see {@link CaeTreeCellContext}) — the consumer
 * narrows `let-row`/`let-value`.
 */
@Directive({ selector: 'ng-template[caeTreeCellDef]' })
export class CaeTreeCellDef<T = unknown> {
  /** The column `key` this template renders (matches a {@link CaeTreeTableColumn.key}). */
  readonly caeTreeCellDef = input.required<string>();

  /** The captured template, rendered by {@link CaeTreeTable} for the matching column. */
  readonly template = inject<TemplateRef<CaeTreeCellContext<T>>>(TemplateRef);

  /**
   * Type-narrowing guard for the template context in a strictly-typed template (Angular's
   * `ngTemplateContextGuard`): tells the compiler the `let-` bindings are a {@link CaeTreeCellContext}.
   */
  static ngTemplateContextGuard<T>(
    _dir: CaeTreeCellDef<T>,
    ctx: unknown,
  ): ctx is CaeTreeCellContext<T> {
    // Compile-time only (Angular never calls this at runtime); `void` marks ctx intentionally unused
    // in the body — it earns its keep solely in the return-type predicate above.
    void ctx;
    return true;
  }
}
