import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CaeCard } from 'caelum/card';
import { CaeDatepicker, type CaeDateRange } from 'caelum/datepicker';

/**
 * The deferred "Date picker" demo (#666, stage 1) — `cae-datepicker` in its three stage-1 modes:
 * a single-date input with `[minDate]`/`[maxDate]`, a range input (`selectionMode="range"`), and an
 * `[inline]` calendar. Each binds `[(ngModel)]` and echoes the picked value in an `aria-live` region,
 * so the CVA round-trip is visibly end-to-end (Book 07 §3.1 — the model is the value, not the text).
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
}
