import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaeSplitter, CaeSplitterPanel } from 'caelum/splitter';

/**
 * The deferred "Splitter" `cae-splitter` demo (#323) — the Splitter family opener. It shows the component
 * end-to-end and proves composition: an outer **horizontal** splitter whose right pane nests a **vertical**
 * splitter. Drag any divider, or focus it and resize with the arrow keys / Home / End. The outer splitter's
 * `(resizeEnd)` feeds a live readout, so a committed drag or keyboard step updates the sidebar/content split.
 *
 * `@defer`'d from App (#85): keeping the splitter in its own lazy chunk holds those bytes off Forge's initial
 * bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-splitter-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeSplitter, CaeSplitterPanel, DecimalPipe],
  templateUrl: './splitter-demo.html',
  styleUrl: './splitter-demo.scss',
})
export class SplitterDemo {
  /** Live sizes of the OUTER (horizontal) splitter — seeded to match its panel `[size]`s, updated on resize. */
  protected readonly outerSizes = signal<number[]>([30, 70]);

  protected onOuterResize(sizes: number[]): void {
    this.outerSizes.set(sizes);
  }
}
