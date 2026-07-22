import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  isDevMode,
} from '@angular/core';

/**
 * The built-in glyph names `cae-icon` can render (D-596). A deliberately small, additive set
 * for the common data-driven cases (a home crumb, disclosure chevrons, file trees, list
 * actions); anything richer goes through a component's `iconTemplate` escape hatch, which is
 * why this union is not trying to be an icon font.
 */
export type CaeIconName =
  | 'home'
  | 'folder'
  | 'file'
  | 'plus'
  | 'search'
  | 'user'
  | 'chevron-up'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-left';

/**
 * The library-owned glyph registry (D-596): self-authored SVG path data on a 24×24 grid,
 * stroke-drawn so every glyph themes through `currentColor` with no fill, no icon font, and
 * no CDN fetch (US-origin / no-CDN discipline, D-05/D-10 — the same reason `cae-chip` and
 * `cae-password` draw their glyphs inline rather than using `mat-icon`). Values are `d`
 * attributes only — never consumer-supplied markup — so nothing here passes through a
 * sanitizer. Readonly by type: the set grows by library release, not by consumer mutation;
 * a consumer needing a custom glyph uses the owning component's `iconTemplate`.
 */
export const CAE_ICON_GLYPHS: Readonly<Record<CaeIconName, string>> = {
  home: 'M3 11 L12 3 L21 11 M5 9.5 V20 H19 V9.5',
  folder: 'M3 19 V6 H9.5 L12 8.5 H21 V19 Z',
  file: 'M6 3 H14 L18 7 V21 H6 Z M14 3 V7 H18',
  plus: 'M12 5 V19 M5 12 H19',
  search: 'M10.5 17 A6.5 6.5 0 1 0 10.5 4 A6.5 6.5 0 0 0 10.5 17 M15.5 15.5 L20.5 20.5',
  'chevron-up': 'M5 15 L12 8 L19 15',
  'chevron-right': 'M9 5 L16 12 L9 19',
  'chevron-down': 'M5 9 L12 16 L19 9',
  'chevron-left': 'M15 5 L8 12 L15 19',
  user: 'M12 11 A3.5 3.5 0 1 0 12 4 A3.5 3.5 0 0 0 12 11 M5 20.5 V19.5 A5.5 5.5 0 0 1 10.5 14 H13.5 A5.5 5.5 0 0 1 19 19.5 V20.5',
};

/**
 * The template context every data-driven component's `iconTemplate` receives (D-596):
 * `$implicit` is the item being rendered (so `let-item` just works) and `index` is its
 * position in the rendered list — the `CaeCarouselItemContext` shape, kept uniform across
 * every data-driven component that exposes an `iconTemplate`, so a consumer learns it once
 * (deliberately not enumerated: the list grew in #645 and would rot at the next component).
 * Type-only; it lives here because the icon-supply convention owns it.
 */
export interface CaeItemIconContext<TItem> {
  /** The item this icon slot belongs to (`let-item` binds this). */
  $implicit: TItem;
  /** The same item under its D-596 name, for explicit `let-x="item"` binding. */
  item: TItem;
  /** The item's index in the rendered list. */
  index: number;
}

/**
 * `cae-icon` — renders one named glyph from {@link CAE_ICON_GLYPHS} as inline SVG
 * (D-596). Decorative by contract: the SVG is `aria-hidden` and unfocusable, because in
 * every shipping use the accessible name is the neighbouring item label — an icon-only
 * affordance must carry its own name on the *interactive* element, never on the glyph.
 * Sized `1em` and stroked `currentColor`, so it inherits the surrounding text's size and
 * colour with no inputs to configure; an unknown `name` renders nothing (and warns in dev
 * builds) rather than throwing mid-render. Zoneless-compatible: `OnPush` + signal state
 * (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // An unknown name must leave NO layout footprint: consumers put a margin on this host
    // (their icon-gap class), so an empty inline-flex box would still indent the label by a
    // token width — the "phantom icon" ghost. Hiding the host removes margin and box alike;
    // a valid name clears the inline style and the stylesheet's inline-flex applies.
    '[style.display]': "path() ? null : 'none'",
  },
  template: `
    @if (path(); as d) {
      <svg class="cae-icon__glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path [attr.d]="d" />
      </svg>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      /* Optical baseline drop for inline contexts (a breadcrumb link's text run): an SVG has
         no baseline, so without this the glyph rides the line box's bottom and sits visibly
         high next to text. Ignored in flex layouts (menu items), which center instead. */
      vertical-align: -0.125em;
    }
    .cae-icon__glyph {
      inline-size: 1em;
      block-size: 1em;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class CaeIcon {
  /**
   * The glyph to render. Typed to autocomplete the built-in {@link CaeIconName}s while
   * accepting any `string`, because item models carry `icon?: string` (D-596) — validation
   * happens here at render, where an unknown name degrades to empty instead of breaking the
   * list that hosts it.
   */
  readonly name = input.required<CaeIconName | (string & {})>();

  /**
   * The registry lookup; `undefined` (→ render nothing) for an unknown name. Gated on OWN
   * keys: a bare index (or `in`) would resolve `Object.prototype` names — `'toString'`,
   * `'constructor'` — to inherited truthy functions, rendering a garbage-`d` svg while the
   * warn below stayed silent. Realistic input at this trust boundary (server-driven items).
   */
  protected readonly path = computed(() => {
    const name = this.name();
    return Object.hasOwn(CAE_ICON_GLYPHS, name) ? CAE_ICON_GLYPHS[name as CaeIconName] : undefined;
  });

  constructor() {
    if (isDevMode()) {
      // Dev-only misspelling guard: an unknown name silently rendering nothing is exactly the
      // kind of quiet failure a data-driven [items] array invites. Silent when clean.
      // Object.hasOwn, matching path() — `in` would let prototype names skip the warn.
      effect(() => {
        const name = this.name();
        if (!Object.hasOwn(CAE_ICON_GLYPHS, name)) {
          console.warn(
            `cae-icon: unknown glyph name "${name}" — nothing rendered. ` +
              `Built-in names: ${Object.keys(CAE_ICON_GLYPHS).join(', ')}. ` +
              `For a custom glyph, use the owning component's iconTemplate (D-596).`,
          );
        }
      });
    }
  }
}
