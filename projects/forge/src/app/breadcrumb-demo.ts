import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaeBreadcrumb, CaeBreadcrumbItem, CaeBreadcrumbSelectEvent } from 'caelum/breadcrumb';

/**
 * The deferred "Breadcrumb" `cae-breadcrumb` demo (#332) — the navigation-trail component. It shows a
 * `<nav aria-label>` → `<ol>` trail with a pinned home crumb, hyperlink ancestors, the current page
 * marked `aria-current="page"` (non-link), and token separators. A second trail uses a `›` separator
 * to show `[separator]` is configurable. Crumbs carry **real urls**; `(itemSelect)` now emits
 * `{ item, originalEvent }`, so {@link onSelect} calls `originalEvent.preventDefault()` to intercept
 * the navigation and keep this SPA alive (#333) — no more fragment-url workaround. A third trail shows
 * a **command crumb** (`command: true`, no url): a real `<button>` that fires an action without
 * navigating (`p-breadcrumb` `MenuItem.command` parity).
 *
 * `@defer`'d from App (#85): keeping the demo in its own lazy chunk holds those bytes off Forge's
 * initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-breadcrumb-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeBreadcrumb],
  templateUrl: './breadcrumb-demo.html',
  styleUrl: './breadcrumb-demo.scss',
})
export class BreadcrumbDemo {
  /**
   * The home crumb — set once, pinned before the trail (p-breadcrumb's home item). Carries the
   * built-in `home` glyph (`caelum/icon` registry, D-596/#644) rendered inside its link.
   */
  protected readonly home: CaeBreadcrumbItem = { label: 'Home', url: '/', icon: 'home' };

  /** A representative trail; the last entry ('Radios') is the current page and renders non-link. */
  protected readonly trail: readonly CaeBreadcrumbItem[] = [
    { label: 'Components', url: '/components', icon: 'folder' },
    { label: 'Forms', url: '/components/forms' },
    { label: 'Radios' },
  ];

  /** A trail whose middle crumb is a url-less command (a button that acts, not navigates). */
  protected readonly commandTrail: readonly CaeBreadcrumbItem[] = [
    { label: 'Workspace', url: '/workspace' },
    { label: 'Reindex', command: true },
    { label: 'Results' },
  ];

  /**
   * The last crumb activated via (itemSelect), with a repeat `count`. The command button keeps focus
   * after activation (it never navigates), so re-activating it is common — carrying a count makes the
   * `aria-live` echo's text change on every press, so it re-announces (identical text would be a
   * signal `Object.is` no-op and stay silent).
   */
  protected readonly lastSelected = signal<{ label: string; count: number } | null>(null);

  /**
   * Intercept an activation: `preventDefault()` suppresses a link crumb's native navigation so this
   * demo SPA survives (a no-op for the command button, which never navigates), then echo the label.
   */
  protected onSelect(event: CaeBreadcrumbSelectEvent): void {
    event.originalEvent.preventDefault();
    this.lastSelected.update((prev) =>
      prev && prev.label === event.item.label
        ? { label: prev.label, count: prev.count + 1 }
        : { label: event.item.label, count: 1 },
    );
  }
}
