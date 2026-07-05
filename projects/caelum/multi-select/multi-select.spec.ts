import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { MatSelect } from '@angular/material/select';

import { CaeMultiSelect, CaeMultiSelectOption } from './multi-select';

const OPTIONS: CaeMultiSelectOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('CaeMultiSelect', () => {
  let component: CaeMultiSelect;
  let fixture: ComponentFixture<CaeMultiSelect>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeMultiSelect] }).compileComponents();
    fixture = TestBed.createComponent(CaeMultiSelect);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    await fixture.whenStable();
  });

  const matSelect = (): MatSelect =>
    fixture.debugElement.query(By.directive(MatSelect)).componentInstance;

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reflects an array written by the form model (writeValue)', () => {
    component.writeValue(['a', 'c']);
    fixture.detectChanges();
    expect(matSelect().value).toEqual(['a', 'c']);
  });

  it('normalizes a nullish or mis-shaped model to an empty array (mat-select[multiple] needs one)', () => {
    // mat-select[multiple] throws on a non-array value; the control must never hand it a string/null.
    component.writeValue(null as unknown as string[]);
    fixture.detectChanges();
    expect(matSelect().value).toEqual([]);
    component.writeValue('a' as unknown as string[]);
    fixture.detectChanges();
    expect(matSelect().value).toEqual([]);
  });

  it('copies the written array so external mutation cannot desync the model', () => {
    const source = ['a'];
    component.writeValue(source);
    source.push('b');
    fixture.detectChanges();
    // The control snapshotted ['a']; mutating the caller's array afterwards must not leak in
    // (an aliased reference would surface as ['a', 'b'] on the inner select).
    expect(matSelect().value).toEqual(['a']);
  });

  it('propagates a multi-selection back to the form as an array (registerOnChange)', async () => {
    let latest: string[] | undefined;
    component.registerOnChange((v) => (latest = v));
    matSelect().open();
    fixture.detectChanges();
    await fixture.whenStable();
    // Options live in the CDK overlay (document body) only while the panel is open.
    const options = document.querySelectorAll<HTMLElement>('mat-option');
    expect(options.length).toBe(OPTIONS.length);
    options[0].click();
    options[2].click();
    fixture.detectChanges();
    expect(latest).toEqual(['a', 'c']);
  });

  it('filters the panel options by the typed query (case-insensitive label match)', () => {
    (component as unknown as { onFilter(t: string): void }).onFilter('gam');
    const shown = (component as unknown as { filteredOptions(): CaeMultiSelectOption[] })
      .filteredOptions()
      .map((o) => o.value);
    expect(shown).toEqual(['c']);
  });

  it('keeps currently-selected options rendered even when they do not match the filter (no data loss)', () => {
    // mat-select drops the selection for an option that unmounts, so a selected-but-filtered-out
    // value would silently vanish from the form. The filter must never hide a selected option.
    component.writeValue(['a']);
    (component as unknown as { onFilter(t: string): void }).onFilter('gam');
    const shown = (component as unknown as { filteredOptions(): CaeMultiSelectOption[] })
      .filteredOptions()
      .map((o) => o.value);
    expect(shown).toEqual(['a', 'c']); // 'a' survives (selected), 'c' matches — in options() order.
  });

  it('exposes the chosen options in options() order for the chip summary', () => {
    component.writeValue(['c', 'a']); // written out of order …
    const chips = (component as unknown as { selectedOptions(): CaeMultiSelectOption[] })
      .selectedOptions()
      .map((o) => o.label);
    expect(chips).toEqual(['Alpha', 'Gamma']); // … but summarized in options() order.
  });

  it('keeps text-editing keys in the filter (printable + caret) but lets list-nav/close keys reach mat-select', () => {
    const swallow = (key: string): boolean => {
      let stopped = false;
      const ev = { key, stopPropagation: () => (stopped = true) } as unknown as KeyboardEvent;
      (component as unknown as { onFilterKeydown(e: KeyboardEvent): void }).onFilterKeydown(ev);
      return stopped;
    };
    // Text-editing keys type into / move the caret within the filter box.
    expect(swallow('a')).toBe(true); // printable
    expect(swallow(' ')).toBe(true); // space is printable too
    expect(swallow('Home')).toBe(true); // caret to start, not a first-option jump
    expect(swallow('End')).toBe(true);
    expect(swallow('ArrowLeft')).toBe(true);
    expect(swallow('ArrowRight')).toBe(true);
    // List-navigation + close keys reach mat-select's key manager.
    expect(swallow('ArrowDown')).toBe(false);
    expect(swallow('ArrowUp')).toBe(false);
    expect(swallow('Enter')).toBe(false);
    expect(swallow('Escape')).toBe(false);
    expect(swallow('Tab')).toBe(false);
  });

  it('keeps the filter box off by default (opt-in in v1) and renders it only when filterable is set', () => {
    // filterable defaults false in v1: the filter is not yet keyboard/SR-reachable (#138), so the
    // baseline mat-select (fully accessible via typeahead) is what ships on by default.
    expect(component.filterable()).toBe(false);
    fixture.componentRef.setInput('filterable', true);
    fixture.detectChanges();
    expect(component.filterable()).toBe(true);
  });

  it('resets the filter when the panel closes so it reopens showing the full list', () => {
    const c = component as unknown as {
      onFilter(t: string): void;
      onOpenedChange(o: boolean): void;
      query(): string;
    };
    c.onFilter('gam');
    expect(c.query()).toBe('gam');
    c.onOpenedChange(false);
    expect(c.query()).toBe('');
  });

  it('renders the floating label when provided', () => {
    fixture.componentRef.setInput('label', 'Skills');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-label')?.textContent).toContain('Skills');
  });

  it('disables the control when the form model disables it (setDisabledState)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(matSelect().disabled).toBe(true);
  });

  it('marks touched on focusout even if the panel never opened (registerOnTouched)', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    const el = fixture.nativeElement.querySelector('mat-select') as HTMLElement;
    el.dispatchEvent(new Event('focusout', { bubbles: true }));
    fixture.detectChanges();
    expect(touched).toBe(true);
  });
});

// Validation-error forwarding (the #29/#47 bridge, inherited from CaeFormFieldControlBase): the
// consumer binds their control to the OUTER <cae-multi-select>, so this exercises the bridge that
// reflects that control's validity into the inner mat-select's error state. Validators.required
// treats an empty array as invalid.
@Component({
  imports: [CaeMultiSelect, ReactiveFormsModule],
  template: `
    <cae-multi-select
      [formControl]="ctrl"
      [errorMessages]="messages"
      label="Skills"
      [options]="opts"
    />
  `,
})
class MultiSelectErrorHost {
  readonly opts: CaeMultiSelectOption[] = OPTIONS;
  readonly ctrl = new FormControl<string[]>([], {
    nonNullable: true,
    validators: [Validators.required],
  });
  messages: Record<string, string> = { required: 'Pick at least one skill' };
}

describe('CaeMultiSelect — validation errors', () => {
  let fixture: ComponentFixture<MultiSelectErrorHost>;
  let host: MultiSelectErrorHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MultiSelectErrorHost] }).compileComponents();
    fixture = TestBed.createComponent(MultiSelectErrorHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const selectErrorState = (): boolean =>
    fixture.debugElement.query(By.directive(MatSelect)).injector.get(MatSelect).errorState;
  const errorText = (): string =>
    fixture.nativeElement.querySelector('mat-error')?.textContent?.trim() ?? '';

  it('treats an empty array as required-invalid but stays silent while untouched', () => {
    expect(host.ctrl.invalid).toBe(true);
    expect(selectErrorState()).toBe(false);
    expect(errorText()).toBe('');
  });

  it('shows the mapped message once the control is invalid and touched', async () => {
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(selectErrorState()).toBe(true);
    expect(errorText()).toContain('Pick at least one skill');
  });

  it('clears the error when a value is chosen (control becomes valid)', async () => {
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    host.ctrl.setValue(['a']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(selectErrorState()).toBe(false);
    expect(errorText()).toBe('');
  });
});
