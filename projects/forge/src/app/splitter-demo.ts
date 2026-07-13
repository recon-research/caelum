import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaeSplitter, CaeSplitterPanel } from 'caelum/splitter';

/**
 * The deferred "Splitter" `cae-splitter` demo (#323) — the Splitter family opener. It shows the component
 * end-to-end and proves composition: an outer **horizontal** splitter whose right pane nests a **vertical**
 * splitter. Drag any divider, or focus it and resize with the arrow keys / Home / End. The outer divider is
 * `[collapsible]` (#325): focus it and press Enter to collapse the sidebar to zero, Enter again to restore it
 * (the WAI-ARIA APG Window-Splitter optional behaviour). The live readout reads
 * the outer splitter's public `sizes()` signal (via a template ref), so it tracks every layout change —
 * including a `[stateKey]` restore, which is silent (no `resizeEnd`). Both splitters carry a `[stateKey]`
 * (#325) backed by the default `sessionStorage`, so the resized layout survives a page reload and is restored
 * on the next paint — resize, reload, and the panes return where they were left.
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
export class SplitterDemo {}
