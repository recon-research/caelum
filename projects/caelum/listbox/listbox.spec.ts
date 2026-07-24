import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeListbox, CaeListboxOption } from './listbox';
import { expectNoA11yViolations } from '../testing/a11y';

/**
 * Unlike MatSlider, MatSelectionList needs no layout geometry, so it renders in jsdom and a
 * `.click()` on an option fires `selectionChange` — the CVA glue is exercised end to end here. The
 * one thing jsdom can't exercise is the WAI-ARIA roving-tabindex arrow-key navigation between
 * options (that needs a real focus/keyboard environment); it's bundled into the M4 real-browser
 * a11y verification (#41 / #79).
 */
describe('CaeListbox', () => {
  let component: CaeListbox;
  let fixture: ComponentFixture<CaeListbox>;

  const OPTIONS: CaeListboxOption[] = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Bravo' },
    { value: 'c', label: 'Charlie', disabled: true },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeListbox] }).compileComponents();
    fixture = TestBed.createComponent(CaeListbox);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    await fixture.whenStable();
  });

  const list = (): HTMLElement => fixture.nativeElement.querySelector('mat-selection-list');
  const optionEls = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('mat-list-option'));
  const optionByLabel = (label: string): HTMLElement =>
    optionEls().find((o) => o.textContent?.includes(label))!;

  it('renders one role=option per data item inside a role=listbox', () => {
    expect(component).toBeTruthy();
    expect(list().getAttribute('role')).toBe('listbox');
    expect(optionEls().length).toBe(3);
  });

  it('has no axe violations (named via ariaLabel, renders inline — no overlay)', async () => {
    fixture.componentRef.setInput('ariaLabel', 'Team members');
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('defaults to single-select (aria-multiselectable is not true)', () => {
    expect(list().getAttribute('aria-multiselectable')).not.toBe('true');
  });

  it('reflects a written single value onto the option (writeValue → aria-selected)', () => {
    component.writeValue('b');
    fixture.detectChanges();
    expect(optionByLabel('Bravo').getAttribute('aria-selected')).toBe('true');
    expect(optionByLabel('Alpha').getAttribute('aria-selected')).toBe('false');
  });

  it('emits the selected value as a string when an option is clicked (single)', () => {
    let latest: unknown;
    component.registerOnChange((v) => (latest = v));
    optionByLabel('Alpha').click();
    fixture.detectChanges();
    expect(latest).toBe('a');
    expect(component['selectedValues']()).toEqual(['a']);
  });

  it('single-select replaces the prior selection', () => {
    component.writeValue('a');
    fixture.detectChanges();
    let latest: unknown;
    component.registerOnChange((v) => (latest = v));
    optionByLabel('Bravo').click();
    fixture.detectChanges();
    expect(latest).toBe('b');
    expect(optionByLabel('Alpha').getAttribute('aria-selected')).toBe('false');
    expect(optionByLabel('Bravo').getAttribute('aria-selected')).toBe('true');
  });

  it('resets to nothing selected on a null value (single)', () => {
    component.writeValue('a');
    fixture.detectChanges();
    component.writeValue(null);
    fixture.detectChanges();
    expect(optionByLabel('Alpha').getAttribute('aria-selected')).toBe('false');
    expect(component['selectedValues']()).toEqual([]);
  });

  it('does not echo onChange when the form writes a value (the CVA no-echo invariant)', () => {
    let calls = 0;
    component.registerOnChange(() => calls++);
    component.writeValue('a');
    fixture.detectChanges();
    expect(calls).toBe(0);
  });

  it('marks touched on focusout (registerOnTouched)', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    list().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(touched).toBe(true);
  });

  it('does not select a per-option disabled item on click', () => {
    let calls = 0;
    component.registerOnChange(() => calls++);
    optionByLabel('Charlie').click(); // disabled: true
    fixture.detectChanges();
    expect(calls).toBe(0);
    expect(component['selectedValues']()).toEqual([]);
  });

  it('disables the whole list via setDisabledState (and via the template input, merged)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(component['isDisabled']()).toBe(true);
    // Clearing only the form-model source leaves a template disable in force (OR-merge).
    fixture.componentRef.setInput('disabled', true);
    component.setDisabledState(false);
    fixture.detectChanges();
    expect(component['isDisabled']()).toBe(true);
    fixture.componentRef.setInput('disabled', false);
    fixture.detectChanges();
    expect(component['isDisabled']()).toBe(false);
  });

  it('coerces a bare disabled attribute (booleanAttribute)', () => {
    fixture.componentRef.setInput('disabled', '');
    fixture.detectChanges();
    expect(component.disabled()).toBe(true);
  });

  it('sets aria-required on the listbox when required (absent by default)', () => {
    expect(list().getAttribute('aria-required')).toBeNull();
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();
    expect(list().getAttribute('aria-required')).toBe('true');
  });

  it('names the listbox via ariaLabel (absent by default)', () => {
    expect(list().getAttribute('aria-label')).toBeNull();
    fixture.componentRef.setInput('ariaLabel', 'Regions');
    fixture.detectChanges();
    expect(list().getAttribute('aria-label')).toBe('Regions');
  });

  it('forwards ariaLabelledby to the listbox (absent by default)', () => {
    expect(list().getAttribute('aria-labelledby')).toBeNull();
    fixture.componentRef.setInput('ariaLabelledby', 'regions-label');
    fixture.detectChanges();
    expect(list().getAttribute('aria-labelledby')).toBe('regions-label');
  });

  it('forwards ariaDescribedby onto each focusable option, not the container (the #47 hook; absent by default)', () => {
    // The list roves focus onto the options, so the description lands on each <mat-list-option>
    // (where a screen reader reads it on focus), NOT the never-focused listbox host.
    expect(list().getAttribute('aria-describedby')).toBeNull();
    expect(optionByLabel('Alpha').getAttribute('aria-describedby')).toBeNull();
    fixture.componentRef.setInput('ariaDescribedby', 'regions-error');
    fixture.detectChanges();
    expect(list().getAttribute('aria-describedby')).toBeNull(); // not on the container
    for (const label of ['Alpha', 'Bravo', 'Charlie']) {
      expect(optionByLabel(label).getAttribute('aria-describedby')).toBe('regions-error');
    }
    // Clearing it drops the attribute from every option.
    fixture.componentRef.setInput('ariaDescribedby', '');
    fixture.detectChanges();
    expect(optionByLabel('Alpha').getAttribute('aria-describedby')).toBeNull();
  });

  describe('multiple mode', () => {
    // `multiple` is fixed at MatSelectionList init (it throws if changed later — see the component
    // docstring), so build a fresh fixture with it set BEFORE the first render rather than flipping
    // the single-mode one from the outer beforeEach.
    beforeEach(async () => {
      fixture = TestBed.createComponent(CaeListbox);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('options', OPTIONS);
      fixture.componentRef.setInput('multiple', true);
      await fixture.whenStable();
    });

    it('exposes aria-multiselectable on the listbox', () => {
      expect(list().getAttribute('aria-multiselectable')).toBe('true');
    });

    it('selects a [start, …] set written by the form model (writeValue)', () => {
      component.writeValue(['a', 'b']);
      fixture.detectChanges();
      expect(optionByLabel('Alpha').getAttribute('aria-selected')).toBe('true');
      expect(optionByLabel('Bravo').getAttribute('aria-selected')).toBe('true');
      expect(component['selectedValues']()).toEqual(['a', 'b']);
    });

    it('emits a string[] and accumulates selections when options are toggled', () => {
      component.writeValue(['b']);
      fixture.detectChanges();
      let latest: string[] = [];
      component.registerOnChange((v) => (latest = v as string[]));
      optionByLabel('Alpha').click();
      fixture.detectChanges();
      expect([...latest].sort()).toEqual(['a', 'b']);
    });

    it('shrinks the emitted string[] when an already-selected option is toggled off (deselect)', () => {
      // Guards against an append-only regression: handleChange must read the authoritative full
      // selection, so removing a selection emits the SHRUNK array, not just accumulate.
      component.writeValue(['a', 'b']);
      fixture.detectChanges();
      let latest: string[] = ['a', 'b'];
      component.registerOnChange((v) => (latest = v as string[]));
      optionByLabel('Alpha').click(); // toggle OFF the already-selected 'a'
      fixture.detectChanges();
      expect(latest).toEqual(['b']);
      expect(optionByLabel('Alpha').getAttribute('aria-selected')).toBe('false');
      expect(optionByLabel('Bravo').getAttribute('aria-selected')).toBe('true');
    });

    it('coerces a bare string written to a multiple list into a single-item array', () => {
      component.writeValue('a');
      fixture.detectChanges();
      expect(component['selectedValues']()).toEqual(['a']);
    });

    it('resets to an empty selection on a null value', () => {
      component.writeValue(['a', 'b']);
      fixture.detectChanges();
      component.writeValue(null);
      fixture.detectChanges();
      expect(component['selectedValues']()).toEqual([]);
    });
  });
});
