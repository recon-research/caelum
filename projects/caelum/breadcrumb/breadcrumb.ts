import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * One crumb in a `cae-breadcrumb` trail. A crumb is a labelled ancestor; when it carries a `url` it
 * renders as a real hyperlink (`<a href>`), otherwise it is inert text. The **last** crumb in the
 * combined trail is the current page and renders as plain text with `aria-current="page"` — it is
 * never a link (a page does not navigate to itself), matching `p-breadcrumb`.
 */
export interface CaeBreadcrumbItem {
  /** Visible label. */
  label: string;
  /**
   * Optional navigation target. Present ⇒ the crumb is a keyboard-focusable `<a href>` (unless it is
   * the current/last crumb or `disabled`). Absent ⇒ inert text. Router-driven navigation
   * (`routerLink`) is a deferred additive follow-up; `url` is the honest, framework-free default the
   * book names (Book 09 §3.4).
   */
  url?: string;
  /**
   * Disable this crumb: it renders as inert text with `aria-disabled="true"` even if it has a `url`
   * (no tab stop, not activatable).
   */
  disabled?: boolean;
}

/**
 * `cae-breadcrumb` — the navigation-trail component (`p-breadcrumb` parity, Book 09 §3.4;
 * COMPARISON row 119). Book 09 §3.4 settles the build verbatim: *"a `<nav aria-label="Breadcrumb">`
 * with an ordered list and token-styled separators, `aria-current="page"` on the last crumb — no
 * overlay, just honest navigation markup."* So there is **no overlay, no CDK, no menu machinery** —
 * the laziest-sufficient rung: semantic markup plus token styling.
 *
 * **The structure.** A `<nav>` with an accessible name (`[ariaLabel]`, default `"Breadcrumb"`, so
 * multiple navs on a page stay distinguishable) wraps an `<ol>` (the crumbs are ordered).
 * `[home]` (parity with `p-breadcrumb`'s home item) and `[items]` render as **one trail** — home is
 * pinned first. The **last** crumb of that combined trail is the current page (plain text with
 * `aria-current="page"`, never a self-link); every earlier crumb with a `url` is a real `<a href>`,
 * and a `disabled` crumb is inert text with `aria-disabled`. On a home-only page (empty `[items]`),
 * `[home]` itself becomes the current page — so the trail always marks one. When there are no crumbs
 * at all, nothing renders (no empty landmark).
 *
 * **Separators are real, but silent.** Each separator is an `aria-hidden` `<span>` drawing the
 * `[separator]` glyph (default `/`; `''` removes the glyph, spacing remains). Rendering it as a
 * hidden element — rather than CSS `::before` generated content, which Chromium and WebKit both
 * expose to the accessibility tree — keeps a screen reader from announcing "slash" between every
 * crumb (the `<ol>`/`<li>` structure already conveys the hierarchy), matching the WAI-ARIA APG
 * breadcrumb technique. Token-styled (D-04); the glyph is plain text interpolation, so it is
 * XSS-safe and never touches the CSS parser.
 *
 * **Navigation is honest hyperlinks.** A `url` crumb navigates natively; `(itemSelect)` also fires
 * on activation for observation (analytics, or a consumer intercepting the trail). Following the
 * `cae-tab-menu` precedent, router-linked mode (`routerLink`/`routerLinkActive`), a
 * `{ item, originalEvent }` payload for click interception, and per-item icons are deferred additive
 * follow-ups. Zoneless-compatible: `OnPush` + signal inputs (Book 01 §3.2).
 *
 * **Multiple breadcrumbs on one page** must each carry a distinct `[ariaLabel]` — two default
 * `"Breadcrumb"` names collide as non-unique landmarks (axe `landmark-unique`).
 *
 * ```html
 * <cae-breadcrumb
 *   [home]="{ label: 'Home', url: '/' }"
 *   [items]="[{ label: 'Reports', url: '/reports' }, { label: 'Q3' }]"
 * />
 * ```
 */
@Component({
  selector: 'cae-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'cae-breadcrumb',
  },
  template: `
    @if (crumbs().length) {
      <nav [attr.aria-label]="ariaLabel().trim() || 'Breadcrumb'">
        <ol class="cae-breadcrumb__list">
          @for (item of crumbs(); track $index; let last = $last; let first = $first) {
            <li class="cae-breadcrumb__item">
              @if (!first) {
                <span class="cae-breadcrumb__sep" aria-hidden="true">{{ separator() }}</span>
              }
              @if (last) {
                <span class="cae-breadcrumb__current" aria-current="page">{{ item.label }}</span>
              } @else if (item.url && !item.disabled) {
                <a class="cae-breadcrumb__link" [href]="item.url" (click)="itemSelect.emit(item)">{{
                  item.label
                }}</a>
              } @else {
                <span
                  class="cae-breadcrumb__text"
                  [attr.aria-disabled]="item.disabled ? 'true' : null"
                  >{{ item.label }}</span
                >
              }
            </li>
          }
        </ol>
      </nav>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-breadcrumb__list {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .cae-breadcrumb__item {
      display: inline-flex;
      align-items: center;
    }
    /* A real, silent separator (aria-hidden) rather than CSS ::before content — the latter is exposed
       to the a11y tree by Chromium/WebKit and would be announced between every crumb. */
    .cae-breadcrumb__sep {
      margin-inline: var(--cae-space-2);
      color: var(--cae-color-on-surface-variant);
    }
    /* Underlined at rest so the link affordance is not conveyed by colour alone (WCAG 1.4.1 / F73). */
    .cae-breadcrumb__link {
      color: var(--cae-color-primary);
      text-decoration: underline;
      border-radius: var(--cae-radius-sm);
    }
    .cae-breadcrumb__link:focus-visible {
      outline: 2px solid var(--cae-color-primary);
      outline-offset: 2px;
      /* A surface-coloured halo keeps the ring visible over any backdrop (WCAG 1.4.11 non-text
         contrast) — mirrors the sibling layout components' focus treatment. */
      box-shadow: 0 0 0 4px var(--cae-surface-raised);
    }
    /* Inert ancestor text and the current page differ by colour (and aria-current), not weight —
       Caelum ships no font-weight token, and colour + the ARIA state carry the distinction. */
    .cae-breadcrumb__text {
      color: var(--cae-color-on-surface-variant);
    }
    .cae-breadcrumb__current {
      color: var(--cae-color-on-surface);
    }
  `,
})
export class CaeBreadcrumb {
  /** The crumbs, as data. The last crumb of the combined trail is the current page. */
  readonly items = input<readonly CaeBreadcrumbItem[]>([]);
  /**
   * An optional leading crumb pinned before `[items]` — `p-breadcrumb`'s home item. When `[items]`
   * is empty it is the sole crumb and therefore the current page; otherwise it is an ancestor.
   */
  readonly home = input<CaeBreadcrumbItem | null>(null);
  /** The separator glyph drawn between crumbs (default `/`); `''` removes the glyph. */
  readonly separator = input('/');
  /** Accessible name for the `<nav>` landmark (default `"Breadcrumb"`). */
  readonly ariaLabel = input('');
  /**
   * Emits the activated crumb on click of a link crumb (never for the current page or a disabled or
   * url-less crumb). Native `href` navigation still proceeds — this is an observation hook.
   */
  readonly itemSelect = output<CaeBreadcrumbItem>();

  /** `[home]` (if any) pinned before `[items]` as one ordered trail; `$last` is the current page. */
  protected readonly crumbs = computed<readonly CaeBreadcrumbItem[]>(() => {
    const home = this.home();
    return home ? [home, ...this.items()] : this.items();
  });
}
