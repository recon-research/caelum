import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CaeCard } from 'caelum/card';
import { CaeDatepicker, type CaeDateRange } from 'caelum/datepicker';

/**
 * The deferred "Date picker" demo (#666) — `cae-datepicker` across its full-parity mode set:
 * single (with `[minDate]`/`[maxDate]`), range, inline, multiple (a CDK-overlay calendar building a
 * `Date[]`, with Today/Clear), time-only + datetime (`MatTimepicker`), and a month-granularity view.
 * Each binds `[(ngModel)]` and echoes the picked value in an `aria-live` region, so the CVA
 * round-trip is visibly end-to-end (Book 07 §3.1 — the model is the value, not the display text).
 *
 * `@defer`'d from App (#85): its own lazy chunk keeps the datepicker family's bytes off Forge's
 * initial bundle, like the other below-the-fold demos.
 */
@Component({
  selector: 'app-datepicker-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeDatepicker, FormsModule],
  templateUrl: './datepicker-demo.html',
  styleUrl: './datepicker-demo.scss',
})
export class DatepickerDemo {
  /** Single-date value (bound via ngModel). */
  protected readonly single = signal<Date | null>(null);
  /** Range value — a library-owned `{ start, end }`, no Material `DateRange` leak. */
  protected readonly range = signal<CaeDateRange | null>(null);
  /** Inline-calendar value. */
  protected readonly inlineDate = signal<Date | null>(null);
  /** Multiple-date value — a `Date[]` (empty is `[]`). */
  protected readonly multi = signal<Date[]>([]);
  /** Time-only value — a `Date` carrying the chosen time. */
  protected readonly time = signal<Date | null>(null);
  /** Datetime value — a `Date` carrying both date and time. */
  protected readonly dateTime = signal<Date | null>(null);
  /** Month-granularity value — the first of the chosen month. */
  protected readonly month = signal<Date | null>(null);

  /** A sensible bound window for the single picker, to show min/max blocking selection. */
  protected readonly min = new Date(2020, 0, 1);
  protected readonly max = new Date(2030, 11, 31);

  protected fmt(d: Date | null): string {
    return d ? d.toLocaleDateString() : '—';
  }
  protected fmtRange(r: CaeDateRange | null): string {
    if (!r || (!r.start && !r.end)) return '—';
    return `${this.fmt(r.start)} → ${this.fmt(r.end)}`;
  }
  protected fmtList(dates: Date[]): string {
    return dates.length ? dates.map((d) => this.fmt(d)).join(', ') : '—';
  }
  protected fmtTime(d: Date | null): string {
    return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  }
  protected fmtDateTime(d: Date | null): string {
    return d ? `${this.fmt(d)} ${this.fmtTime(d)}` : '—';
  }
  protected fmtMonth(d: Date | null): string {
    return d ? d.toLocaleDateString([], { year: 'numeric', month: 'long' }) : '—';
  }
}
