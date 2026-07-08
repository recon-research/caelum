import { Directive, TemplateRef, inject } from '@angular/core';

/**
 * The context bound into a {@link CaeRowDetailDef} template — what an expandable row's detail
 * renderer receives. Vendor-neutral (no Material type): the consumer never touches `mat-table`
 * internals. **Library-produced** — a consumer only ever *reads* it via `let-` bindings, never
 * constructs it — so adding a field later is a non-breaking enhancement, not a breaking change.
 *
 * ```html
 * <ng-template caeRowDetailDef let-row>
 *   <dl class="order-detail">
 *     <dt>Placed</dt><dd>{{ asOrder(row).placedAt | date }}</dd>
 *   </dl>
 * </ng-template>
 * ```
 */
export interface CaeRowDetailContext<T> {
  /** The row object whose detail is being rendered. The **implicit** value, so a bare `let-row` binds it. */
  $implicit: T;
}

/**
 * Marks an `<ng-template>` as the **expandable detail** renderer for a {@link CaeTable} — p-table
 * `rowexpansion` parity (#144). Projecting one turns expansion on: the table prepends an
 * accessible expand-toggle button column and renders a full-width detail row beneath each row,
 * shown only while that row is expanded. The template renders inside the detail row with the
 * {@link CaeRowDetailContext} (`$implicit` = the row) in scope:
 *
 * ```html
 * <cae-table [columns]="cols" [data]="rows" [(expanded)]="open">
 *   <ng-template caeRowDetailDef let-row>
 *     <p>More about {{ asPerson(row).name }}…</p>
 *   </ng-template>
 * </cae-table>
 * ```
 *
 * There is **one** detail template per table (unlike the per-column {@link CaeCellDef}); if more than
 * one is projected the first is used. Expansion is **view state** (Book 10 §3.2): the table holds it in
 * the {@link CaeTable.expanded} signal model (by reference identity), never in the row data.
 *
 * **Accessibility.** The toggle is a real `<button>` (keyboard-operable natively — Enter/Space) carrying
 * `aria-expanded` and `aria-controls` pointing at the detail region; the detail content is only as
 * accessible as you make it (name any icon-only controls, don't rely on color alone). The table stays
 * `role="table"`, so focusable detail content is reached by native Tab in DOM order.
 *
 * @typeParam T - the row shape. Always `unknown` in practice: a projected `<ng-template>` cannot infer
 * `T` from the sibling {@link CaeTable}, so `$implicit` reaches the template as `unknown` — the consumer
 * narrows `let-row`. The generic is the (zero-cost) seam for a future typed-context inference improvement.
 */
@Directive({ selector: 'ng-template[caeRowDetailDef]' })
export class CaeRowDetailDef<T = unknown> {
  /** The captured template, rendered by {@link CaeTable} in each expanded row's detail cell. */
  readonly template = inject<TemplateRef<CaeRowDetailContext<T>>>(TemplateRef);

  /**
   * Type-narrowing guard for the template context in a strictly-typed template (Angular's
   * `ngTemplateContextGuard`): tells the compiler the `let-` bindings are a {@link CaeRowDetailContext}.
   */
  static ngTemplateContextGuard<T>(
    _dir: CaeRowDetailDef<T>,
    ctx: unknown,
  ): ctx is CaeRowDetailContext<T> {
    void ctx;
    return true;
  }
}
