import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { CaeCard } from 'caelum/card';
import type { CaeMenuItem } from 'caelum/menu';
import { CaePanelMenu } from 'caelum/panel-menu';

/**
 * The deferred "Navigation menu" demo (#665) — the accordion-composed nested nav (`p-panelmenu`
 * parity). It binds a data-driven `[model]` of nested `CaeMenuItem`s: branches become collapsible
 * sections (composed from `cae-accordion`), command leaves are buttons that emit `(itemSelect)`, and
 * the "Documentation" item carries a `url` so it renders as a real `<a href>`.
 *
 * `@defer`'d from App (#85): its own lazy chunk keeps the composed-accordion bytes off Forge's initial
 * bundle, like the other below-the-fold demos.
 */
@Component({
  selector: 'app-panel-menu-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaePanelMenu],
  templateUrl: './panel-menu-demo.html',
  styleUrl: './panel-menu-demo.scss',
})
export class PanelMenuDemo {
  /** A three-level nav tree — branches, command leaves (icons), and one real link leaf (`url`). */
  protected readonly nav: readonly CaeMenuItem[] = [
    {
      label: 'Workspace',
      items: [
        { label: 'Overview', value: 'overview', icon: 'home' },
        { label: 'Search', value: 'search', icon: 'search' },
        {
          label: 'Files',
          items: [
            { label: 'Open…', value: 'open', icon: 'folder' },
            { label: 'New file', value: 'new', icon: 'plus' },
            {
              label: 'Documentation',
              url: 'https://github.com/recon-research/caelum',
              icon: 'file',
            },
          ],
        },
      ],
    },
    {
      label: 'People',
      items: [
        { label: 'Members', value: 'members', icon: 'user' },
        { label: 'Invite…', value: 'invite', icon: 'plus' },
      ],
    },
  ];

  /** The last activated command leaf, shown so the round-trip is visibly end-to-end. */
  protected readonly lastCommand = signal('—');

  /** Record the activated command leaf (navigation leaves follow their href instead). */
  protected run(item: CaeMenuItem): void {
    this.lastCommand.set(item.label);
  }
}
