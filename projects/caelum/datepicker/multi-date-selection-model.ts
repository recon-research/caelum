import { DateAdapter } from '@angular/material/core';
import { MatDateSelectionModel } from '@angular/material/datepicker';

/**
 * A `MatDateSelectionModel` that holds an *arbitrary set* of dates — the one date-selection
 * primitive Angular Material does not ship (it provides only `MatSingleDateSelectionModel` and
 * `MatRangeDateSelectionModel`, verified against @angular/material 22.0.3). It is the single
 * genuine *build* inside the otherwise-Compose `cae-datepicker` (issue #666): it backs
 * `selectionMode="multiple"`, owning the add/remove/toggle + ordering logic, while `cae-datepicker`
 * drives a bare `<mat-calendar>` from this model's {@link selection} through `[dateClass]` — the
 * calendar's own `[selected]` input only understands a single date or a `DateRange`, never a set,
 * and `MatDatepicker`'s popup hard-wires the single-selection model in its own component
 * `providers` (so it cannot be repurposed for multi-select via DI).
 *
 * `add(date)` **toggles**: a date not yet in the set is inserted, keeping the set sorted ascending
 * so the emitted `Date[]` is order-stable regardless of the order dates were clicked; a date already
 * in the set is removed. This mirrors how a multi-select calendar behaves — re-clicking a selected
 * day clears it — and is exactly the call `MatDatepickerContent` makes on the model (`model.add(...)`).
 *
 * Adapter-driven throughout (`sameDate`/`compareDate`), so it stays correct under any `DateAdapter`,
 * not just the native one `cae-datepicker` currently provides.
 */
export class CaeMultiDateSelectionModel extends MatDateSelectionModel<Date[], Date> {
  constructor(adapter: DateAdapter<Date>) {
    super([], adapter);
  }

  /**
   * Toggle `date` in or out of the selection, keeping the set sorted ascending and free of
   * duplicate days. A `null` or invalid date is a no-op (mirrors `MatSingleDateSelectionModel`,
   * which silently ignores an invalid add).
   */
  add(date: Date | null): void {
    if (date == null || !this._isValidDateInstance(date)) {
      return;
    }
    const current = this.selection;
    const existing = current.findIndex((d) => this._adapter.sameDate(d, date));
    const next =
      existing >= 0
        ? current.filter((_, i) => i !== existing)
        : [...current, date].sort((a, b) => this._adapter.compareDate(a, b));
    this.updateSelection(next, this);
  }

  /** Valid when every selected date is a real, valid `Date`; an empty set is valid (nothing picked). */
  isValid(): boolean {
    return this.selection.every((d) => this._isValidDateInstance(d));
  }

  /** A multi-selection is "complete" — a usable, committable value — once it holds at least one date. */
  isComplete(): boolean {
    return this.selection.length > 0;
  }

  /** A fresh model over a copy of the current set (the `Date` instances themselves are shared). */
  clone(): CaeMultiDateSelectionModel {
    const cloned = new CaeMultiDateSelectionModel(this._adapter);
    cloned.updateSelection([...this.selection], this);
    return cloned;
  }
}
