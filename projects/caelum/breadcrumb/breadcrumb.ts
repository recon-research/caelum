import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  isDevMode,
  output,
  type TemplateRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CaeIcon, caeItemIconContext, type CaeItemIconContext } from 'caelum/icon';

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
  /**
   * Mark a **url-less** crumb as an activatable action rather than inert text: it renders as a real
   * `<button type="button">` (keyboard-activatable, focusable) that fires `(itemSelect)` without
   * navigating — the framework-free equivalent of `p-breadcrumb`'s `MenuItem.command`. Ignored when
   * `url` is set (a link takes precedence — intercept its navigation via the event's `originalEvent`),
   * on the current/last crumb (never interactive), or when `disabled`. Wire the action to `(itemSelect)`.
   * Give it a non-empty `label`: that text is the button's accessible name (an empty label yields a
   * nameless button — axe `button-name`, WCAG 4.1.2), the same requirement a link crumb's label carries;
   * a dev-mode `console.warn` fires if any interactive crumb's label is empty (#384).
   */
  command?: boolean;
  /**
   * Optional leading glyph, by built-in name (`caelum/icon` registry — D-596). Rendered
   * decoratively (`aria-hidden`) inside the crumb's own element — within the `<a>`/`<button>`
   * for an interactive crumb, so it shares the hit target. The crumb's accessible name stays
   * {@link label}. For a custom glyph, supply the component-level `iconTemplate` instead,
   * which wins over this.
   */
  icon?: string;
}

/**
 * Payload of `(itemSelect)`: the activated crumb plus the DOM event that triggered it. `originalEvent`
 * lets a consumer intercept — e.g. `originalEvent.preventDefault()` on a link crumb to suppress the
 * native `href` navigation and handle it in-app (the hook a router-driven trail needs). The `click`
 * event fires for both link (`<a>`) and command (`<button>`) crumbs, including keyboard activation of
 * the button (Enter/Space synthesize a click).
 */
export interface CaeBreadcrumbSelectEvent {
  /** The crumb that was activated. */
  item: CaeBreadcrumbItem;
  /** The DOM `click` event — call `preventDefault()` to intercept a link crumb's native navigation. */
  originalEvent: MouseEvent;
}

/**
 * `cae-breadcrumb` — the navigation-trail component (`p-breadcrumb` parity, Book 09 §3.4;
 * COMPARISON row 119). Book 09 §3.4 settles the build verbatim: *"a `<nav aria-label="Breadcrumb">`
 * with an ordered list and token-styled separators, `aria-current="page"` on the last crumb — no
 * overlay, just honest navigation markup."* So there is **no overlay, no CDK, no menu machinery** —
 * the laziest-sufficient rung: semantic markup plus token styling.
 *
 * **The structure.** A `<nav>` with an accessible name (`[ariaLabel]`, default `"Breadcrumb"`, so
 * multiple navs on a page stay distinguishable) wraps an `<ol>` (the crumbs are ordered) carrying
 * explicit `role="list"`/`"listitem"` — `list-style:none` otherwise strips the list semantics under
 * WebKit/VoiceOver, leaving the trail as loose text with no list boundary (#385).
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
 * **Navigation is honest hyperlinks — or honest buttons.** A `url` crumb navigates natively and fires
 * `(itemSelect)` with `{ item, originalEvent }`, so a consumer can `preventDefault()` to intercept the
 * trail (analytics, or in-app routing). A **url-less crumb marked `command`** renders as a real
 * `<button>` that fires the same event without navigating — the framework-free equivalent of
 * `p-breadcrumb`'s `MenuItem.command` (a control that acts, not navigates, is a button, not a link —
 * WAI-ARIA APG). Per-item icons follow the library convention: `item.icon` names a built-in glyph,
 * `[iconTemplate]` overrides it (D-596, #644). Following the `cae-tab-menu` precedent,
 * `routerLink`/`routerLinkActive` mode remains a deferred additive follow-up (#333, D-595).
 * Zoneless-compatible: `OnPush` + signal inputs (Book 01 §3.2).
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
  imports: [NgTemplateOutlet, CaeIcon],
  host: {
    class: 'cae-breadcrumb',
  },
  template: `
    @if (crumbs().length) {
      <nav [attr.aria-label]="ariaLabel().trim() || 'Breadcrumb'">
        <!-- role="list"/"listitem": list-style:none strips WebKit/VoiceOver's implicit list semantics,
             so name them explicitly — otherwise Safari+VoiceOver announce the trail as loose text with
             no "list, N items" boundary (#385; the cae-file-upload precedent). Redundant-but-harmless on
             conforming engines; an <ol>'s ordinal nicety is a fair trade for a list that survives at all. -->
        <ol class="cae-breadcrumb__list" role="list">
          @for (item of crumbs(); track $index; let last = $last; let first = $first) {
            <li class="cae-breadcrumb__item" role="listitem">
              @if (!first) {
                <span class="cae-breadcrumb__sep" aria-hidden="true">{{ separator() }}</span>
              }
              @if (last) {
                <span class="cae-breadcrumb__current" aria-current="page">
                  <ng-container
                    [ngTemplateOutlet]="iconSlot"
                    [ngTemplateOutletContext]="iconContext(item, $index)"
                  />{{ item.label }}</span
                >
              } @else if (item.url && !item.disabled) {
                <a
                  class="cae-breadcrumb__link"
                  [href]="item.url"
                  (click)="itemSelect.emit({ item, originalEvent: $event })"
                >
                  <ng-container
                    [ngTemplateOutlet]="iconSlot"
                    [ngTemplateOutletContext]="iconContext(item, $index)"
                  />{{ item.label }}</a
                >
              } @else if (item.command && !item.disabled) {
                <button
                  type="button"
                  class="cae-breadcrumb__link cae-breadcrumb__button"
                  (click)="itemSelect.emit({ item, originalEvent: $event })"
                >
                  <ng-container
                    [ngTemplateOutlet]="iconSlot"
                    [ngTemplateOutletContext]="iconContext(item, $index)"
                  />{{ item.label }}
                </button>
              } @else {
                <span
                  class="cae-breadcrumb__text"
                  [attr.aria-disabled]="item.disabled ? 'true' : null"
                >
                  <ng-container
                    [ngTemplateOutlet]="iconSlot"
                    [ngTemplateOutletContext]="iconContext(item, $index)"
                  />{{ item.label }}</span
                >
              }
            </li>
          }
        </ol>
      </nav>
    }

    <!-- The one icon slot, stamped inside each of the four crumb leaves (never beside them — an
         interactive crumb's icon must share its <a>/<button> hit target). Consumer iconTemplate
         wins over the built-in item.icon glyph (D-596); with neither, it renders nothing.
         (additive-flanking-UI shared ng-template idiom.) -->
    <ng-template #iconSlot let-item let-index="index">
      @if (iconTemplate(); as tpl) {
        <ng-container
          [ngTemplateOutlet]="tpl"
          [ngTemplateOutletContext]="iconContext(item, index)"
        />
      } @else if (item.icon) {
        <cae-icon class="cae-breadcrumb__icon" [name]="item.icon" />
      }
    </ng-template>
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
      /* Floor the hit target to the density-INVARIANT --cae-target-min (24px) so every interactive crumb
         (a link <a> and a command <button> both carry this class) meets WCAG 2.5.8 in every density arm.
         A text crumb has no vertical padding — its block-size is pure line-height, which tightens with
         density/theme — and adjacent crumbs sit only --cae-space-2 apart, so the 2.5.8 spacing exception
         can't rescue a sub-24px target. inline-flex is required for the min-* floor to take effect on the
         otherwise-inline <a>; the min only grows a short crumb, leaving normal word-labels shrink-wrapped.
         (interactive-hit-target floor convention; #456 · PATTERNS §10.) */
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-inline-size: var(--cae-target-min);
      min-block-size: var(--cae-target-min);
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
    /* A command crumb is a real <button> (activate without navigating) that reads as a link — strip the
       native button chrome so it matches the __link affordance it shares (colour + underline inherited). */
    .cae-breadcrumb__button {
      background: none;
      border: 0;
      padding: 0;
      font: inherit;
      line-height: inherit;
      cursor: pointer;
    }
    /* Inert ancestor text and the current page differ by colour (and aria-current), not weight —
       Caelum ships no font-weight token, and colour + the ARIA state carry the distinction. */
    .cae-breadcrumb__text {
      color: var(--cae-color-on-surface-variant);
    }
    .cae-breadcrumb__current {
      color: var(--cae-color-on-surface);
    }
    /* Tighter than the __sep gap: the icon belongs to its label, the separator divides crumbs. */
    .cae-breadcrumb__icon {
      margin-inline-end: var(--cae-space-1);
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
   * Emits `{ item, originalEvent }` when a **link** crumb (`<a>`) or a **command** crumb (`<button>`)
   * is activated — never for the current page, a disabled crumb, or an inert url-less crumb. For a link
   * crumb the native `href` navigation still proceeds unless the consumer calls
   * `originalEvent.preventDefault()` (the interception hook a router-driven trail needs); a command
   * crumb never navigates. See {@link CaeBreadcrumbSelectEvent}.
   */
  readonly itemSelect = output<CaeBreadcrumbSelectEvent>();
  /**
   * Consumer escape hatch for the per-item icon slot (D-596): an `ng-template` receiving
   * `{ $implicit: item, index }` (`let-item`, `let-index="index"`), stamped once per crumb —
   * inside the crumb's own `<a>`/`<button>`/`<span>`, before the label — *instead of* the
   * built-in `item.icon` glyph. The template wins whenever both are supplied, for every
   * crumb, so one convention governs the whole trail. The template owns its own spacing and
   * accessibility (keep glyphs decorative; a crumb's accessible name is its label).
   */
  readonly iconTemplate = input<TemplateRef<CaeItemIconContext<CaeBreadcrumbItem>> | null>(null);

  /** `[home]` (if any) pinned before `[items]` as one ordered trail; `$last` is the current page. */
  protected readonly crumbs = computed<readonly CaeBreadcrumbItem[]>(() => {
    const home = this.home();
    return home ? [home, ...this.items()] : this.items();
  });

  /** Context builder for the icon slot / {@link iconTemplate} — the single-homed D-596 helper (#649). */
  protected readonly iconContext = caeItemIconContext;

  constructor() {
    // Dev-only DX guard (#384): an interactive crumb — a link (`url`) or a command button (`command`),
    // and neither the current page nor `disabled` — with an empty/whitespace `label` renders as a
    // NAMELESS control (axe link-name / button-name, WCAG 4.1.2). The interface documents "give it a
    // non-empty label"; this warns when the data violates it. Reactive to crumbs(), so it re-checks
    // whenever the trail changes; the whole effect is gated out of production by isDevMode().
    //
    // The CURRENT page (last crumb) gets its own parallel branch (#532) carrying a deliberately DISTINCT
    // message. It is inert text, so a nameless one is NOT a 4.1.2 failure — but it renders
    // `<span aria-current="page"></span>`, a "you are here" marker with no name, defeating the very
    // function a breadcrumb serves (WCAG 2.4.8 Location). Two criteria, two messages: folding them into
    // one would misattribute the failure. The branches are mutually exclusive by construction
    // (`isInteractive` requires `!isCurrent`); a crumb that is neither — inert ancestor text, or a
    // `disabled` one — is deliberately not warned, having no control and no location semantics.
    if (isDevMode()) {
      effect(() => {
        const crumbs = this.crumbs();
        crumbs.forEach((crumb, i) => {
          const isCurrent = i === crumbs.length - 1;
          const isInteractive = !isCurrent && !crumb.disabled && (!!crumb.url || !!crumb.command);
          const nameless = !crumb.label?.trim();
          if (isInteractive && nameless) {
            console.warn(
              `cae-breadcrumb: an interactive ${crumb.url ? 'link' : 'command'} crumb has an empty ` +
                `label, so it renders as a nameless control (axe link-name/button-name, WCAG 4.1.2). ` +
                'Give every interactive crumb a non-empty `label`.',
            );
          } else if (isCurrent && nameless) {
            console.warn(
              'cae-breadcrumb: the current-page crumb has an empty label, so the trail ends in a ' +
                'nameless `aria-current="page"` marker — a screen reader cannot announce where the user ' +
                'is, which is the function a breadcrumb exists to serve (WCAG 2.4.8 Location). Give the ' +
                'last crumb a non-empty `label`.',
            );
          }
        });
      });
    }
  }
}
