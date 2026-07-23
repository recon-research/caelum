import { ChangeDetectionStrategy, Component } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaeTag, CaeTagSeverity } from 'caelum/tag';

interface StatusRow {
  label: string;
  severity: CaeTagSeverity | undefined;
  icon?: string;
}

/**
 * The deferred "Tag" `cae-tag` demo (#662) — the static status label composed over `mat-chip`. It
 * shows the neutral tag and each severity (success / info / warn / danger), the rounded variant, and
 * a tag with a leading glyph (the D-596 `[icon]` convention). Tags are non-interactive — they label,
 * they don't act — so unlike `cae-chip` there is no remove/click affordance.
 *
 * `@defer`'d from App (#85): keeping the demo in its own lazy chunk holds those bytes off Forge's
 * initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-tag-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeTag],
  templateUrl: './tag-demo.html',
  styleUrl: './tag-demo.scss',
})
export class TagDemo {
  /** One tag per severity (plus neutral), a few with a leading glyph. */
  protected readonly statuses: readonly StatusRow[] = [
    { label: 'Draft', severity: undefined },
    { label: 'Active', severity: 'success', icon: 'user' },
    { label: 'Info', severity: 'info' },
    { label: 'Review', severity: 'warn', icon: 'search' },
    { label: 'Blocked', severity: 'danger' },
  ];
}
