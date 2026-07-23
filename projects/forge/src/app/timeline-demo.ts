import { ChangeDetectionStrategy, Component } from '@angular/core';

import { CaeCard } from 'caelum/card';
import {
  CaeTimeline,
  CaeTimelineContent,
  CaeTimelineMarker,
  CaeTimelineOpposite,
} from 'caelum/timeline';

interface Milestone {
  date: string;
  title: string;
  detail: string;
  icon: string;
}

/**
 * The deferred "Timeline" `cae-timeline` demo (#662) — the event timeline. It shows a vertical,
 * left-aligned timeline with a date on the opposite side and a custom marker glyph per event, plus a
 * second timeline in `alternate` alignment to show events flipping sides. The events render as a
 * semantic ordered list; the rail (connector + default dot) is decorative.
 *
 * `@defer`'d from App (#85): keeping the demo in its own lazy chunk holds those bytes off Forge's
 * initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-timeline-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeTimeline, CaeTimelineContent, CaeTimelineOpposite, CaeTimelineMarker],
  templateUrl: './timeline-demo.html',
  styleUrl: './timeline-demo.scss',
})
export class TimelineDemo {
  /** A representative project history. */
  protected readonly milestones: readonly Milestone[] = [
    { date: '2021 Q1', title: 'Founded', detail: 'Three people and a repository.', icon: 'home' },
    {
      date: '2022 Q3',
      title: 'First release',
      detail: 'Shipped v1 to early adopters.',
      icon: 'plus',
    },
    { date: '2023 Q2', title: 'Scaled', detail: 'Grew to a team of twenty.', icon: 'user' },
    { date: '2024 Q4', title: 'Series B', detail: 'Closed the growth round.', icon: 'folder' },
  ];
}
