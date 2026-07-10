import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaeBreadcrumb, CaeBreadcrumbItem } from 'caelum/breadcrumb';

/**
 * The deferred "Breadcrumb" `cae-breadcrumb` demo (#332) — the navigation-trail component. It shows a
 * `<nav aria-label>` → `<ol>` trail with a pinned home crumb, hyperlink ancestors, the current page
 * marked `aria-current="page"` (non-link), and CSS-drawn token separators. A second trail uses a `›`
 * separator to show `[separator]` is configurable. Clicking a crumb records it via `(itemSelect)`.
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
  // Fragment urls so activating a crumb sets location.hash WITHOUT a full-page navigation — a real
  // href would tear this SPA down before the (itemSelect) echo below could paint. A real app points
  // crumbs at real urls (and uses the deferred routerLink mode for in-app navigation).

  /** The home crumb — set once, pinned before the trail (p-breadcrumb's home item). */
  protected readonly home: CaeBreadcrumbItem = { label: 'Home', url: '#home' };

  /** A representative trail; the last entry ('Radios') is the current page and renders non-link. */
  protected readonly trail: readonly CaeBreadcrumbItem[] = [
    { label: 'Components', url: '#components' },
    { label: 'Forms', url: '#forms' },
    { label: 'Radios' },
  ];

  /** Records the last crumb activated via (itemSelect) so the demo can echo it. */
  protected readonly lastSelected = signal<string | null>(null);
}
