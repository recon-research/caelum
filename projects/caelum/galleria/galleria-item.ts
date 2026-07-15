import { Directive, TemplateRef, inject } from '@angular/core';
import type { CaeGalleriaItem } from './galleria';

/**
 * The context bound into a {@link CaeGalleriaItemDef} / {@link CaeGalleriaThumbnailDef} template — the
 * values a projected renderer receives. Vendor-neutral (no Material/CDK type): the consumer never touches
 * galleria internals. This context is **library-produced** — a consumer only ever *reads* it via `let-`
 * bindings, never constructs it — so adding a field later is a non-breaking enhancement.
 *
 * ```html
 * <ng-template caeGalleriaItem let-item let-i="index">
 *   <video [src]="item.src" [attr.aria-label]="item.alt" controls></video>
 * </ng-template>
 * ```
 */
export interface CaeGalleriaTemplateContext {
  /** The gallery item for this view. The **implicit** value, so a bare `let-item` binds it. */
  $implicit: CaeGalleriaItem;
  /** The item's 0-based index within `items` — bind `let-i="index"`. */
  index: number;
}

/**
 * Marks the single `<ng-template>` that renders each {@link CaeGalleria} **main view** (and the fullscreen
 * lightbox) — the galleria analogue of `p-galleria`'s `item` template, for content the typed image model
 * can't express (video, captioned figures, custom markup). One template renders every item (stamped with
 * the {@link CaeGalleriaTemplateContext} in scope), so it takes **no key**:
 *
 * ```html
 * <cae-galleria [items]="clips" ariaLabel="Product clips">
 *   <ng-template caeGalleriaItem let-item>
 *     <video [src]="item.src" [attr.aria-label]="item.alt" controls></video>
 *   </ng-template>
 * </cae-galleria>
 * ```
 *
 * Optional: with no `caeGalleriaItem` projected the gallery renders the typed `<img [src] [alt]>` from the
 * item model (the first-class v1 path, not a degraded fallback). The same template also drives the
 * fullscreen lightbox, so custom content stays consistent between the inline and fullscreen views. A
 * projected template replaces the **entire** figure body (the auto `<figcaption>` too), so render
 * `item.caption` yourself from the context if you want it.
 *
 * **Accessible content.** The galleria owns the `figure`/`tabpanel` wrapper and its semantics; the projected
 * content is only as accessible as you make it — a `<video>` needs a discernible name, any image `alt`
 * (WCAG 1.1.1). `item.alt` is still required regardless: it names the thumbnail tab (WCAG 4.1.2).
 */
@Directive({ selector: 'ng-template[caeGalleriaItem]' })
export class CaeGalleriaItemDef {
  /** The captured template, stamped by {@link CaeGalleria} for the active item (inline + lightbox). */
  readonly template = inject<TemplateRef<CaeGalleriaTemplateContext>>(TemplateRef);

  /** Type-narrowing guard for the `let-` bindings in a strictly-typed template (compile-time only). */
  static ngTemplateContextGuard(
    _dir: CaeGalleriaItemDef,
    ctx: unknown,
  ): ctx is CaeGalleriaTemplateContext {
    void ctx;
    return true;
  }
}

/**
 * Marks the single `<ng-template>` that renders each {@link CaeGalleria} **thumbnail** — `p-galleria`'s
 * `thumbnail` template. The galleria keeps the `role="tab"` button wrapper (roving tabindex, `aria-selected`,
 * keyboard), so this template replaces only the thumbnail's inner content (the default `<img>`):
 *
 * ```html
 * <ng-template caeGalleriaThumbnail let-item>
 *   <span class="badge">{{ item.caption }}</span>
 * </ng-template>
 * ```
 *
 * Optional: with none projected the strip renders the typed thumbnail `<img>`. The active thumb's button
 * carries `.cae-galleria__thumb--active` + `aria-selected="true"`, so custom active styling is a CSS hook.
 * Project only **non-interactive** content: the `role="tab"` button owns focus and activation (roving
 * tabindex), so a nested `<button>`/`<a>` would be invalid markup and add a stray tab stop.
 */
@Directive({ selector: 'ng-template[caeGalleriaThumbnail]' })
export class CaeGalleriaThumbnailDef {
  /** The captured template, stamped by {@link CaeGalleria} once per thumbnail in the strip. */
  readonly template = inject<TemplateRef<CaeGalleriaTemplateContext>>(TemplateRef);

  /** Type-narrowing guard for the `let-` bindings in a strictly-typed template (compile-time only). */
  static ngTemplateContextGuard(
    _dir: CaeGalleriaThumbnailDef,
    ctx: unknown,
  ): ctx is CaeGalleriaTemplateContext {
    void ctx;
    return true;
  }
}
