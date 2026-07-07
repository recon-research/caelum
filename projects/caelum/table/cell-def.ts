import { Directive, TemplateRef, inject, input } from '@angular/core';

/**
 * The context bound into a {@link CaeCellDef} template — the values a custom cell renderer receives.
 * Vendor-neutral (no Material type): the consumer never touches `mat-table` internals. This context is
 * **library-produced** — a consumer only ever *reads* it via `let-` bindings, never constructs it — so
 * adding a field (e.g. `absoluteIndex`, #213) is a non-breaking enhancement, not a breaking change.
 *
 * ```html
 * <ng-template caeCellDef="status" let-row let-value="value" let-i="index">
 *   <cae-badge [severity]="row.level">{{ value }}</cae-badge>
 * </ng-template>
 * ```
 *
 * @typeParam T - the row shape. In v1 it is always `unknown` in practice: a projected `<ng-template>`
 * cannot infer `T` from the sibling {@link CaeTable}, so `$implicit`/`value` reach the template as
 * `unknown` and the consumer narrows them. The generic is the (zero-cost) seam for a future
 * typed-context inference improvement — not accidental over-abstraction.
 */
export interface CaeCellContext<T> {
  /** The row object. The **implicit** value, so a bare `let-row` binds it (`unknown` in v1 — narrow it). */
  $implicit: T;
  /**
   * The cell's raw value for this column (`row[key]`), so `let-value="value"` avoids re-indexing.
   * Typed `unknown` — the template is keyed by a string column, so a precise per-column value type
   * is not available; the consumer narrows it (they know the column).
   */
  value: unknown;
  /**
   * The rendered row index — post-sort and **page-relative** (0..pageSize-1 within the current page,
   * as the row appears), so it resets each page. For a continuous number across pages (p-table's
   * body-template `rowIndex`, which is *absolute*) use {@link absoluteIndex}. Bind `let-i="index"`.
   */
  index: number;
  /**
   * The **absolute** rendered row index across all pages (`pageIndex * pageSize + index`), post-sort —
   * the p-table body-template `rowIndex` semantics. Unlike {@link index} it does *not* reset per page,
   * so an absolute "row #N" numbering column reads continuously (page 2 of a 10-row page starts at 10,
   * not 0). Equal to {@link index} when the table is unpaginated (a single page). Follows the user's
   * live page + page-size choice, not the initial inputs. Bind `let-n="absoluteIndex"`.
   */
  absoluteIndex: number;
}

/**
 * Marks an `<ng-template>` as the **custom cell renderer** for one {@link CaeTable} column — per-cell
 * body-content parity with `p-table` `pTemplate="body"` (#143). Bind the column `key`; the table
 * renders this template *inside its own `<td>`* for that column with the {@link CaeCellContext} in
 * scope, so a column can show a badge, button, formatted date/currency, or link instead of plain text:
 *
 * ```html
 * <cae-table [columns]="cols" [data]="rows">
 *   <ng-template caeCellDef="status" let-value="value">
 *     <cae-badge>{{ value }}</cae-badge>
 *   </ng-template>
 * </cae-table>
 * ```
 *
 * Columns without a matching `caeCellDef` keep the zero-boilerplate text default — the config path is
 * unchanged. A `caeCellDef` whose key matches no column, or a duplicate for the same key, is dev-warned.
 * This customizes cell *content* only; the library owns the `<tr>`/`<td>` wrapper (full-row templating
 * is out of v1 scope), which is what keeps the table's a11y structure intact.
 *
 * **Accessible cell content.** The default text path is inherently safe; a projected template is only
 * as accessible as you make it. When rendering interactive or non-text content, keep parity:
 * an icon-only button/link needs a discernible name (WCAG 4.1.2 — `aria-label` or visually-hidden
 * text); a badge/status whose meaning is color-only also needs text or shape (WCAG 1.4.1). This stays
 * a `role="table"` (not `grid`), so focusable cell content is reached by native Tab in DOM order —
 * fine for a few controls; for many interactive/virtualized cells reach for `cae-data-grid` (#175).
 *
 * @typeParam T - the row shape. Always `unknown` in v1 (see {@link CaeCellContext}) — the consumer
 * narrows `let-row`/`let-value`.
 */
@Directive({ selector: 'ng-template[caeCellDef]' })
export class CaeCellDef<T = unknown> {
  /** The column `key` this template renders (matches a {@link CaeTableColumn.key}). */
  readonly caeCellDef = input.required<string>();

  /** The captured template, rendered by {@link CaeTable} for the matching column. */
  readonly template = inject<TemplateRef<CaeCellContext<T>>>(TemplateRef);

  /**
   * Type-narrowing guard for the template context in a strictly-typed template (Angular's
   * `ngTemplateContextGuard`): tells the compiler the `let-` bindings are a {@link CaeCellContext}.
   */
  static ngTemplateContextGuard<T>(_dir: CaeCellDef<T>, ctx: unknown): ctx is CaeCellContext<T> {
    // Compile-time only (Angular never calls this at runtime); `void` marks ctx intentionally unused
    // in the body — it earns its keep solely in the return-type predicate above.
    void ctx;
    return true;
  }
}
