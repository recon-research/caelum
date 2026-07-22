import { DestroyRef, Directive, ErrorHandler, inject, isDevMode } from '@angular/core';
import { LocationStrategy } from '@angular/common';
import { Router } from '@angular/router';
import { CaeBreadcrumb, type CaeBreadcrumbSelectEvent } from 'caelum/breadcrumb';

/**
 * `caeBreadcrumbRouterLink` — opt-in SPA navigation for a `cae-breadcrumb` trail (#333, **D-595**).
 *
 * ```html
 * <cae-breadcrumb caeBreadcrumbRouterLink [home]="home" [items]="crumbs" />
 * ```
 *
 * **Why a directive over the existing `<a href>`, not a second breadcrumb component.** The base
 * `cae-breadcrumb` already renders every navigable crumb as a real `<a [href]="item.url">` — which
 * is the accessible, honest markup (Book 09 §3.4) and the thing that makes middle-click, ctrl-click,
 * "copy link address" and crawlers work. A parallel router-flavoured component would have to
 * duplicate that whole template plus its `aria-current` / dev-warn / icon logic, and the two copies
 * would drift. So this directive keeps ONE trail implementation and only *upgrades the click*: it
 * subscribes to the host's `(itemSelect)` and, for a plain left-click, calls `preventDefault()` and
 * routes in-app instead of letting the browser do a full page load. The `href` stays on the element
 * either way, so the markup and the a11y *tree* are unchanged.
 *
 * **Scope — only app-absolute paths are routed.** `item.url` is the crumb's `href` verbatim, so a
 * value the router cannot own (`https://…`, `mailto:`, protocol-relative `//host`, or a
 * document-relative `reports`) is handed straight back to the browser rather than parsed into
 * route segments that match nothing. A breadcrumb points at *ancestors*, which are often outside
 * the SPA, so this is the common case, not an edge case. Note also that `item.url` doubles as the
 * router URL: under `withHashLocation()` or a non-root `APP_BASE_HREF` those differ, and the
 * directive dev-warns rather than shipping a silently 404-ing new tab (it cannot compute the href
 * the way `RouterLink` does, precisely because it does not own the markup).
 *
 * **No `NavigationExtras` seam.** `queryParams`/`fragment` need none — `navigateByUrl` parses
 * `?…`/`#…` straight out of the string — but `state`, `info`, `skipLocationChange` and
 * `replaceUrl` are unavailable. A consumer needing one drops this directive and routes from
 * `(itemSelect)` directly, which stays supported: **a consumer's own `preventDefault()` wins over
 * this directive**, so the documented interception hook keeps working.
 *
 * **Focus after navigation is the app's job**, as it is with `RouterLink` (so this is parity, not a
 * regression). A full page load moves focus to the new document and announces it; an in-app route
 * change does neither — and the clicked crumb is typically destroyed by the very navigation it
 * triggered (it becomes the new current page, which renders as inert text), dropping focus to
 * `<body>`. Handle it app-side the usual way: focus the routed view's heading, or use a route
 * announcer. Tracked for a library-side helper in #653.
 *
 * **Modifier clicks are left to the browser**, mirroring `RouterLink.onClick` branch-for-branch
 * (`@angular/router` `_router_module-chunk.mjs`): a non-primary button or any of ctrl/shift/alt/meta
 * means the user asked for a new tab/window/download, so this directive does nothing and the native
 * `href` navigation proceeds. An `[target]` other than `_self` is honoured for the same reason.
 * Getting this wrong is the classic SPA-link bug — ctrl-click that silently navigates in place.
 *
 * **`routerLinkActive` is deliberately absent.** A breadcrumb's "active" crumb is the current page,
 * which the base component already marks `aria-current="page"` and renders as inert text (never a
 * link) — so there is no anchor for an active class to sit on, and nothing for it to disambiguate.
 *
 * Zoneless-compatible: no zone-coupled APIs, no change-detection assumptions (D-12).
 */
@Directive({
  selector: 'cae-breadcrumb[caeBreadcrumbRouterLink]',
  exportAs: 'caeBreadcrumbRouterLink',
  host: { '(click)': 'onHostClick($event)' },
})
export class CaeBreadcrumbRouterLink {
  private readonly router = inject(Router);
  private readonly breadcrumb = inject(CaeBreadcrumb);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly locationStrategy = inject(LocationStrategy, { optional: true });
  /** Urls already dev-warned about, so a repeated click doesn't spam the console. */
  private readonly warned = new Set<string>();

  /**
   * The crumb activated by the click currently being dispatched, captured at `(itemSelect)` time
   * and consumed when that same click reaches the host. See {@link onHostClick} for why the
   * decision cannot be made at capture time.
   */
  private pending: { url: string; anchorTarget: string | undefined; event: MouseEvent } | null =
    null;

  constructor() {
    // OutputEmitterRef tears its subscribers down with the owning component, and that component is
    // this directive's own host — so the two die together and a leak is not reachable here. The
    // explicit DestroyRef cleanup is kept anyway for lifecycle symmetry: the disposal path is
    // visible at the acquisition site rather than resting on a framework guarantee about a
    // *different* object's lifetime.
    const sub = this.breadcrumb.itemSelect.subscribe((event) => this.capture(event));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  /**
   * Runs synchronously inside the anchor's own click dispatch — the only moment when
   * `originalEvent.currentTarget` is still the `<a>` — so the anchor's `target` is read here.
   * Records only; deciding here would be too early (see {@link onHostClick}).
   */
  private capture(event: CaeBreadcrumbSelectEvent): void {
    const url = event.item.url;
    // A command crumb (no `url`) is an action, not a destination — it has no route to navigate to,
    // and the consumer's own (itemSelect) handler owns it. Leave it entirely alone.
    this.pending = url
      ? {
          url,
          anchorTarget: (event.originalEvent.currentTarget as HTMLAnchorElement | null)?.target,
          event: event.originalEvent,
        }
      : null;
  }

  /**
   * The decision point, deliberately on the **bubbled** click at the host rather than in the
   * `(itemSelect)` subscriber above.
   *
   * A consumer's `preventDefault()` on the original event is the base component's DOCUMENTED
   * interception hook, and it is expressed from *their* `(itemSelect)` handler — a sibling
   * subscriber to this directive's. Subscribers run in registration order, and a directive is
   * constructed before the template's output binding is wired, so this directive always runs
   * FIRST: deciding there would navigate before the consumer is ever asked, and no subscriber
   * ordering fixes it (run late instead and the veto is simply ignored).
   *
   * Waiting for the bubble dissolves the race. Every `(itemSelect)` subscriber has already run by
   * the time the click reaches the host element, so `defaultPrevented` here is the consumer's
   * final answer. Suppressing the native navigation this late is still effective — the browser
   * performs the default action after dispatch completes, not during it.
   */
  protected onHostClick(event: MouseEvent): void {
    const p = this.pending;
    this.pending = null;
    // Only act on the click this trail actually reported. A click anywhere else inside the host
    // (padding, a separator, a consumer's projected content) never set `pending`.
    if (!p || p.event !== event) return;
    const { url, anchorTarget: target } = p;

    // The consumer's veto, now knowable.
    if (event.defaultPrevented) return;

    // RouterLink's exact guard: anything but a plain primary click is the user asking the BROWSER
    // for this URL (new tab, new window, download), so let the native href do its job.
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey)
      return;
    // Defensive: the base component renders no `target` and `CaeBreadcrumbItem` has no such field
    // (`target` is an anchor attribute, NOT an inherited one — a host attribute would not reach
    // these anchors), but a future `[target]` input or direct DOM mutation must not be swallowed.
    if (target && target !== '_self') return;

    const e = event;

    // Only an app-absolute path is ours to route. `navigateByUrl` would parse anything — turning
    // `https://portal.example.com` into garbage segments that match no route, and resolving a
    // document-relative `reports` as absolute `/reports` (where the href resolves it against the
    // current directory). Both cases end with a suppressed navigation and a DEAD crumb, so hand
    // them back to the browser, which handles all three correctly. `//host` is protocol-relative.
    if (!url.startsWith('/') || url.startsWith('//')) return;

    if (isDevMode()) this.warnIfUrlIsNotTheBrowserUrl(url);

    // Only now suppress the full page load — never before the guards, or a refused navigation would
    // leave the click doing nothing at all.
    e.preventDefault();
    // The promise MUST be handled. `Router.scheduleNavigation` returns a derived promise that
    // rejects on a failed navigation (an unmatched route, a throwing guard/resolver) unless the app
    // opted into `resolveNavigationPromiseOnError`, which is off by default — so an unhandled
    // rejection would surface as `Uncaught (in promise) NG04002` while the user sits on the old
    // page with the native navigation already suppressed. RouterLink routes it to the app's error
    // handler for exactly this reason; mirror that rather than swallowing it.
    this.router.navigateByUrl(url)?.catch((err: unknown) => this.errorHandler.handleError(err));
  }

  /**
   * Dev-only: the crumb's `href` is `item.url` verbatim, but the router resolves that same string
   * through the app's `LocationStrategy`. Under `withHashLocation()` or a non-root `APP_BASE_HREF`
   * the two disagree — a left-click routes correctly while ctrl/middle-click and "copy link
   * address" request a URL the server does not serve. `RouterLink` avoids this by *computing* its
   * href via `prepareExternalUrl`; this directive cannot, because it deliberately does not own the
   * markup. So make the mismatch loud in dev instead of shipping a silently broken new tab.
   */
  private warnIfUrlIsNotTheBrowserUrl(url: string): void {
    const external = this.locationStrategy?.prepareExternalUrl(url);
    if (external === undefined || external === url || this.warned.has(url)) return;
    this.warned.add(url);
    console.warn(
      `caeBreadcrumbRouterLink: the crumb's href is "${url}" but this app's LocationStrategy ` +
        `serves that route at "${external}". In-app clicks work, but ctrl/middle-click and ` +
        `"copy link address" will request "${url}" and likely 404. Set item.url to the ` +
        `browser-visible URL, or drop the directive and route from (itemSelect).`,
    );
  }
}
