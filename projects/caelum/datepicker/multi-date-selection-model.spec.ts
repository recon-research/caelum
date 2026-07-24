import { TestBed } from '@angular/core/testing';
import { DateAdapter, provideNativeDateAdapter } from '@angular/material/core';
import { firstValueFrom } from 'rxjs';

import { CaeMultiDateSelectionModel } from './multi-date-selection-model';

/**
 * Direct unit tests for the one genuine *build* in `cae-datepicker` (#666 AC: "the custom multi-date
 * `MatDateSelectionModel` is unit-tested directly, including add/remove/toggle of an already-selected
 * date and ordering stability").
 */
describe('CaeMultiDateSelectionModel', () => {
  let adapter: DateAdapter<Date>;
  let model: CaeMultiDateSelectionModel;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideNativeDateAdapter()] });
    adapter = TestBed.inject(DateAdapter);
    model = new CaeMultiDateSelectionModel(adapter);
  });

  afterEach(() => model.ngOnDestroy());

  const jan = (day: number, hours = 0): Date => new Date(2026, 0, day, hours);

  it('starts empty — a valid but not-complete selection', () => {
    expect(model.selection).toEqual([]);
    expect(model.isValid()).toBe(true);
    expect(model.isComplete()).toBe(false);
  });

  it('add() inserts a new date and the selection becomes complete', () => {
    model.add(jan(10));
    expect(model.selection).toEqual([jan(10)]);
    expect(model.isComplete()).toBe(true);
    expect(model.isValid()).toBe(true);
  });

  it('add() of an already-selected date REMOVES it (toggle)', () => {
    model.add(jan(10));
    model.add(jan(20));
    expect(model.selection.length).toBe(2);
    model.add(jan(10)); // re-click the same day
    expect(model.selection).toEqual([jan(20)]);
  });

  it('toggles by calendar DAY, not by exact instant (adapter sameDate)', () => {
    model.add(jan(10, 0));
    model.add(jan(10, 15)); // same day, different time → toggles the existing off
    expect(model.selection).toEqual([]);
  });

  it('keeps the set sorted ascending regardless of click order (ordering stability)', () => {
    model.add(jan(30));
    model.add(jan(1));
    model.add(jan(15));
    expect(model.selection).toEqual([jan(1), jan(15), jan(30)]);
  });

  it('ignores a null add (no-op)', () => {
    model.add(null);
    expect(model.selection).toEqual([]);
    expect(model.isComplete()).toBe(false);
  });

  it('ignores an invalid Date add (no-op)', () => {
    model.add(new Date(NaN));
    expect(model.selection).toEqual([]);
    expect(model.isValid()).toBe(true);
  });

  it('emits selectionChanged when the set changes', async () => {
    const change = firstValueFrom(model.selectionChanged);
    model.add(jan(5));
    const event = await change;
    expect(event.selection).toEqual([jan(5)]);
    expect(event.oldValue).toEqual([]);
  });

  it('clone() is an independent model with an equal selection', () => {
    model.add(jan(10));
    model.add(jan(20));
    const clone = model.clone();
    expect(clone.selection).toEqual([jan(10), jan(20)]);

    clone.add(jan(5)); // mutating the clone must not touch the original
    expect(clone.selection).toEqual([jan(5), jan(10), jan(20)]);
    expect(model.selection).toEqual([jan(10), jan(20)]);
  });
});
