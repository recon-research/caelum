import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  CaeTimeline,
  CaeTimelineContent,
  CaeTimelineMarker,
  CaeTimelineOpposite,
} from './timeline';
import { expectNoA11yViolations } from '../testing/a11y';

interface Ev {
  when: string;
  what: string;
}

@Component({
  imports: [CaeTimeline, CaeTimelineContent, CaeTimelineOpposite, CaeTimelineMarker],
  template: `
    <cae-timeline [value]="events()" [align]="align" [layout]="layout">
      <ng-template caeTimelineOpposite let-e>{{ e.when }}</ng-template>
      <ng-template caeTimelineContent let-e let-it="item" let-i="index"
        >{{ i }}:{{ e.what }}:{{ it.what }}</ng-template
      >
      @if (withMarker) {
        <ng-template caeTimelineMarker let-e>M-{{ e.what }}</ng-template>
      }
    </cae-timeline>
  `,
})
class TimelineHost {
  readonly events = signal<Ev[]>([
    { when: '2021', what: 'Founded' },
    { when: '2022', what: 'Launched' },
    { when: '2023', what: 'Scaled' },
  ]);
  align: 'left' | 'right' | 'alternate' = 'left';
  layout: 'vertical' | 'horizontal' = 'vertical';
  withMarker = false;
}

describe('CaeTimeline', () => {
  let fixture: ComponentFixture<TimelineHost>;
  let root: HTMLElement;

  const make = async (setup: (h: TimelineHost) => void = () => {}): Promise<void> => {
    fixture = TestBed.createComponent(TimelineHost);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  };
  const events = (): HTMLElement[] => Array.from(root.querySelectorAll('.cae-timeline__event'));

  it('has no axe violations (ordered list with opposite + content)', async () => {
    await make();
    await expectNoA11yViolations(root);
  });

  it('renders ordered-list semantics — one <li> per value item inside an <ol>', async () => {
    await make();
    expect(root.querySelector('ol')).not.toBeNull();
    expect(root.querySelectorAll('ol > li').length).toBe(3);
  });

  it('renders the projected content and opposite templates with the event + index context', async () => {
    await make();
    const first = events()[0];
    expect(first.querySelector('.cae-timeline__opposite')?.textContent?.trim()).toBe('2021');
    // Content template binds all three context fields: `let-e` ($implicit), `let-it="item"`, and
    // `let-i="index"` → "index:$implicit.what:item.what". Proves $implicit AND item AND index wire.
    expect(first.querySelector('.cae-timeline__content')?.textContent?.trim()).toBe(
      '0:Founded:Founded',
    );
    expect(events()[2].querySelector('.cae-timeline__content')?.textContent?.trim()).toBe(
      '2:Scaled:Scaled',
    );
  });

  it('draws a decorative default dot and a connector between events (not after the last)', async () => {
    await make();
    const ev = events();
    // Default dot on every event, aria-hidden.
    expect(ev[0].querySelector('.cae-timeline__dot')?.getAttribute('aria-hidden')).toBe('true');
    // Connector on all but the last event.
    expect(ev[0].querySelector('.cae-timeline__connector')).not.toBeNull();
    expect(ev[2].querySelector('.cae-timeline__connector')).toBeNull();
    expect(ev[0].querySelector('.cae-timeline__connector')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('replaces the default dot with a custom marker template (announced, not aria-hidden)', async () => {
    await make((h) => (h.withMarker = true));
    const first = events()[0];
    expect(first.querySelector('.cae-timeline__dot')).toBeNull();
    expect(first.querySelector('.cae-timeline__marker')?.textContent?.trim()).toBe('M-Founded');
    // A custom marker may carry meaning, so it must NOT be aria-hidden (only the default dot is).
    expect(first.querySelector('.cae-timeline__marker')?.getAttribute('aria-hidden')).toBeNull();
  });

  it('uses only CSS logical properties (RTL-safe) — no physical left/right in the styles', () => {
    // The "alternate/horizontal hold under RTL" claim rests on logical properties; assert their use
    // structurally now (visual RTL is the M4 browser pass, #240). A `text-align: right` or
    // `padding-left` regression fails here rather than shipping silently to M4.
    const styles = (CaeTimeline as { ɵcmp?: { styles?: string[] } }).ɵcmp?.styles?.join('\n') ?? '';
    expect(styles).toContain('text-align: end');
    expect(styles).not.toMatch(/text-align:\s*(left|right)/);
    expect(styles).not.toMatch(/(margin|padding)-(left|right)\b/);
  });

  it('reflects [align] and [layout] as host classes', async () => {
    await make((h) => {
      h.align = 'alternate';
      h.layout = 'horizontal';
    });
    const tl = root.querySelector('cae-timeline')!;
    expect(tl.classList.contains('cae-timeline--align-alternate')).toBe(true);
    expect(tl.classList.contains('cae-timeline--horizontal')).toBe(true);
  });

  it('reacts to a value change', async () => {
    await make();
    fixture.componentInstance.events.set([{ when: 'x', what: 'y' }]);
    await fixture.whenStable();
    expect(events().length).toBe(1);
    // Single event → no connector.
    expect(events()[0].querySelector('.cae-timeline__connector')).toBeNull();
  });
});
