import { Directive, TemplateRef, inject } from '@angular/core';

/**
 * The context bound into a {@link CaeCarouselItem} template — the values a slide renderer receives.
 * Vendor-neutral (no Material/CDK type): the consumer never touches carousel internals. This context is
 * **library-produced** — a consumer only ever *reads* it via `let-` bindings, never constructs it — so
 * adding a field later is a non-breaking enhancement, not a breaking change.
 *
 * ```html
 * <ng-template caeCarouselItem let-product let-i="index">
 *   <img [src]="product.image" [alt]="product.name" />
 *   <span>{{ i + 1 }}. {{ product.name }}</span>
 * </ng-template>
 * ```
 *
 * @typeParam T - the item shape (one element of the carousel's `value` array).
 */
export interface CaeCarouselItemContext<T> {
  /** The item object for this slide. The **implicit** value, so a bare `let-item` binds it. */
  $implicit: T;
  /** The item's 0-based index within `value` (stable across paging) — bind `let-i="index"`. */
  index: number;
}

/**
 * Marks the single `<ng-template>` that renders each {@link CaeCarousel} slide — the carousel analogue of
 * `p-carousel`'s `item` template. One template renders every item (the carousel stamps it once per element
 * of `value`, with the {@link CaeCarouselItemContext} in scope), so — unlike the per-column
 * {@link CaeTreeCellDef} — it takes **no key**:
 *
 * ```html
 * <cae-carousel [value]="products" ariaLabel="Featured products">
 *   <ng-template caeCarouselItem let-product>
 *     <article class="tile">{{ product.name }}</article>
 *   </ng-template>
 * </cae-carousel>
 * ```
 *
 * When no `caeCarouselItem` is projected the carousel falls back to the item's string form (and dev-warns),
 * so a bare `[value]` still renders something rather than blank slides.
 *
 * **Accessible slide content.** The carousel owns the slide wrapper and its `group`/`aria-roledescription`
 * semantics; the projected content is only as accessible as you make it — an image needs `alt` (WCAG 1.1.1),
 * an icon-only control a discernible name (WCAG 4.1.2). Slides outside the current view are `inert` +
 * `aria-hidden`, so their controls are correctly removed from the tab order and the accessibility tree.
 *
 * @typeParam T - the item shape. Always `unknown` in practice: a projected `<ng-template>` cannot infer `T`
 * from the sibling {@link CaeCarousel}, so `$implicit` reaches the template as `unknown` and the consumer
 * narrows it. The generic is the (zero-cost) seam for a future typed-context inference improvement.
 */
@Directive({ selector: 'ng-template[caeCarouselItem]' })
export class CaeCarouselItem<T = unknown> {
  /** The captured template, stamped by {@link CaeCarousel} once per item in `value`. */
  readonly template = inject<TemplateRef<CaeCarouselItemContext<T>>>(TemplateRef);

  /**
   * Type-narrowing guard for the template context in a strictly-typed template (Angular's
   * `ngTemplateContextGuard`): tells the compiler the `let-` bindings are a {@link CaeCarouselItemContext}.
   */
  static ngTemplateContextGuard<T>(
    _dir: CaeCarouselItem<T>,
    ctx: unknown,
  ): ctx is CaeCarouselItemContext<T> {
    // Compile-time only (Angular never calls this at runtime); `void` marks ctx intentionally unused
    // in the body — it earns its keep solely in the return-type predicate above.
    void ctx;
    return true;
  }
}
