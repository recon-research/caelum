import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { CaeInputOtp } from './input-otp';

describe('CaeInputOtp', () => {
  let component: CaeInputOtp;
  let fixture: ComponentFixture<CaeInputOtp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeInputOtp] }).compileComponents();
    fixture = TestBed.createComponent(CaeInputOtp);
    component = fixture.componentInstance;
    // A named group is the normal case — set it so ngOnInit's no-accessible-name dev-warn (asserted
    // in its own test) doesn't fire on every setup.
    fixture.componentRef.setInput('ariaLabel', 'Code');
    // Attach to the document so `document.activeElement` reflects focus() (jsdom only focuses
    // connected elements) — the focus-management tests depend on it.
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  // --- helpers ---
  const cells = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('input'));
  const type = (el: HTMLInputElement, value: string): void => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const key = (el: HTMLInputElement, k: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
  };
  const paste = (el: HTMLInputElement, text: string): void => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
    el.dispatchEvent(event);
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders `length` cells inside a role=group (default 6)', () => {
    expect(cells().length).toBe(6);
    expect(fixture.nativeElement.getAttribute('role')).toBe('group');
  });

  it('honours a custom length', () => {
    fixture.componentRef.setInput('length', 4);
    fixture.detectChanges();
    expect(cells().length).toBe(4);
  });

  it('distributes a written value across the cells (writeValue: model → view)', () => {
    component.writeValue('482913');
    fixture.detectChanges();
    expect(cells().map((c) => c.value)).toEqual(['4', '8', '2', '9', '1', '3']);
  });

  it('truncates a written value longer than length', () => {
    fixture.componentRef.setInput('length', 4);
    component.writeValue('123456');
    fixture.detectChanges();
    expect(cells().map((c) => c.value)).toEqual(['1', '2', '3', '4']);
  });

  it('recomposes and emits the combined code as a single string when a cell is edited', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    type(cells()[0], '7');
    expect(latest).toBe('7');
    type(cells()[1], '3');
    expect(latest).toBe('73');
    expect(typeof latest).toBe('string');
  });

  it('advances focus to the next cell after entering a character', () => {
    const [c0, c1] = cells();
    c0.focus();
    type(c0, '5');
    expect(document.activeElement).toBe(c1);
  });

  it('emits a shorter string for an incomplete code (completeness is the consumer validator’s job)', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    type(cells()[0], '1');
    type(cells()[1], '2');
    expect(latest).toBe('12'); // not padded to length
  });

  it('rejects a non-digit while integerOnly (default) and keeps the cell unchanged', () => {
    const emitted: string[] = [];
    component.registerOnChange((v) => emitted.push(v));
    const c0 = cells()[0];
    type(c0, 'a');
    expect(c0.value).toBe(''); // reverted
    expect(emitted).toEqual([]); // nothing emitted
    expect(c0.getAttribute('inputmode')).toBe('numeric');
  });

  it('allows any character and uses inputmode=text when integerOnly is cleared', () => {
    fixture.componentRef.setInput('integerOnly', false);
    fixture.detectChanges();
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const c0 = cells()[0];
    expect(c0.getAttribute('inputmode')).toBe('text');
    type(c0, 'a');
    expect(latest).toBe('a');
  });

  it('Backspace clears a filled cell in place (stays put)', () => {
    component.writeValue('12');
    fixture.detectChanges();
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const [c0, c1] = cells();
    c1.focus();
    key(c1, 'Backspace');
    fixture.detectChanges();
    expect(c1.value).toBe(''); // cleared
    expect(document.activeElement).toBe(c1); // did not retreat (cell was filled)
    expect(latest).toBe('1');
    expect(c0.value).toBe('1');
  });

  it('leaves Ctrl+Backspace to the browser (word-delete, #581)', () => {
    component.writeValue('12');
    fixture.detectChanges();
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const [c0, c1] = cells();
    c1.focus();
    const ev = new KeyboardEvent('keydown', {
      key: 'Backspace',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    c1.dispatchEvent(ev);
    fixture.detectChanges();
    expect(c1.value).toBe('2'); // unchanged — not cleared
    expect(c0.value).toBe('1'); // and no retreat
    expect(latest).toBeUndefined(); // no emit
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Backspace on an empty cell retreats and clears the previous cell', () => {
    component.writeValue('12');
    fixture.detectChanges();
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const c2 = cells()[2];
    c2.focus(); // cell 2 is empty
    key(c2, 'Backspace');
    fixture.detectChanges();
    expect(document.activeElement).toBe(cells()[1]); // retreated to cell 1
    expect(cells()[1].value).toBe(''); // previous cell cleared
    expect(latest).toBe('1');
  });

  it('preventDefaults the handled navigation/edit keys', () => {
    const c1 = cells()[1];
    c1.focus();
    expect(key(c1, 'ArrowLeft').defaultPrevented).toBe(true);
    expect(key(c1, 'ArrowRight').defaultPrevented).toBe(true);
    expect(key(c1, 'Backspace').defaultPrevented).toBe(true);
    expect(key(c1, 'Home').defaultPrevented).toBe(true);
    expect(key(c1, 'End').defaultPrevented).toBe(true);
  });

  it('ArrowLeft/ArrowRight and Home/End move focus across the cells', () => {
    const c = cells();
    c[2].focus();
    key(c[2], 'ArrowLeft');
    expect(document.activeElement).toBe(c[1]);
    key(c[1], 'ArrowRight');
    expect(document.activeElement).toBe(c[2]);
    key(c[2], 'Home');
    expect(document.activeElement).toBe(c[0]);
    key(c[0], 'End');
    expect(document.activeElement).toBe(c[5]);
  });

  it('spreads a pasted code across all cells and emits the whole value', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const c = cells();
    c[0].focus();
    paste(c[0], '482913');
    fixture.detectChanges();
    expect(c.map((x) => x.value)).toEqual(['4', '8', '2', '9', '1', '3']);
    expect(latest).toBe('482913');
    expect(document.activeElement).toBe(c[5]); // focus lands on the last filled cell
  });

  it('paste spreads from the focused cell, not always from the start', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const c = cells();
    paste(c[2], '77');
    fixture.detectChanges();
    expect(c.map((x) => x.value)).toEqual(['', '', '7', '7', '', '']);
    expect(latest).toBe('77'); // clamped to length; middle-filled joins to "77"
  });

  it('filters non-digits out of a pasted code while integerOnly', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    paste(cells()[0], '4-8 2/9');
    fixture.detectChanges();
    expect(latest).toBe('4829');
  });

  it('spreads a multi-character `input` (SMS one-time-code autofill fires input, not paste)', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const c = cells();
    // Autofill drops the whole code into the first cell as an input event.
    type(c[0], '482913');
    fixture.detectChanges();
    expect(c.map((x) => x.value)).toEqual(['4', '8', '2', '9', '1', '3']);
    expect(latest).toBe('482913');
  });

  it('is one tab stop: only the active cell is tabbable (roving tabindex)', () => {
    const c = cells();
    expect(c.map((x) => x.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1', '-1']);
    c[3].focus(); // focus updates the active cell
    fixture.detectChanges();
    expect(c.map((x) => x.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1', '0', '-1', '-1']);
  });

  it('writeValue points the tab stop at the first empty cell', () => {
    component.writeValue('12'); // cells 0,1 filled → next empty is 2
    fixture.detectChanges();
    expect(cells()[2].getAttribute('tabindex')).toBe('0');
  });

  it('forwards ariaDescribedby onto every cell (#47 consumer-owned errors)', () => {
    fixture.componentRef.setInput('ariaDescribedby', 'code-error');
    fixture.detectChanges();
    expect(cells().every((c) => c.getAttribute('aria-describedby') === 'code-error')).toBe(true);
  });

  it('names each cell (default "Character N of M", overridable) and sets the group label', () => {
    fixture.componentRef.setInput('ariaLabel', 'One-time code');
    fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('aria-label')).toBe('One-time code');
    expect(cells()[0].getAttribute('aria-label')).toBe('Character 1 of 6');

    fixture.componentRef.setInput('cellAriaLabel', (i: number, n: number) => `Digit ${i + 1}/${n}`);
    fixture.detectChanges();
    expect(cells()[0].getAttribute('aria-label')).toBe('Digit 1/6');
  });

  it('sets autocomplete=one-time-code on the first cell only (OS SMS autofill target)', () => {
    const c = cells();
    expect(c[0].getAttribute('autocomplete')).toBe('one-time-code');
    expect(c.slice(1).every((x) => x.getAttribute('autocomplete') === 'off')).toBe(true);
  });

  it('marks cells aria-required when required is set', () => {
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();
    expect(cells().every((c) => c.getAttribute('aria-required') === 'true')).toBe(true);
  });

  it('disables the cells (template input and reactive-forms setDisabledState)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(cells().every((c) => c.disabled)).toBe(true);

    fixture.componentRef.setInput('disabled', false);
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(cells().every((c) => c.disabled)).toBe(true);
  });

  it('fires onTouched only when focus leaves the whole group, not between cells', () => {
    const onTouched = vi.fn();
    component.registerOnTouched(onTouched);
    const c = cells();

    // focusout to a sibling cell → still inside the group → no touch
    const between = new FocusEvent('focusout', { relatedTarget: c[1], bubbles: true });
    c[0].dispatchEvent(between);
    expect(onTouched).not.toHaveBeenCalled();

    // focusout to nothing (left the group) → touched
    c[5].dispatchEvent(new FocusEvent('focusout', { relatedTarget: null, bubbles: true }));
    expect(onTouched).toHaveBeenCalledTimes(1);
  });

  it('Delete clears the current cell in place', () => {
    component.writeValue('12');
    fixture.detectChanges();
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const c0 = cells()[0];
    c0.focus();
    key(c0, 'Delete');
    fixture.detectChanges();
    expect(c0.value).toBe('');
    expect(document.activeElement).toBe(c0); // Delete does not move focus
    expect(latest).toBe('2'); // cell 1 still holds "2"
  });

  it('overwrites a filled cell (select-on-focus then type replaces)', () => {
    component.writeValue('5');
    fixture.detectChanges();
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const c0 = cells()[0];
    c0.focus(); // selects the "5"
    type(c0, '7'); // replaced selection → single char
    expect(c0.value).toBe('7');
    expect(latest).toBe('7');
  });

  it('does not emit onChange on writeValue (CVA guard) and clears on null/empty', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    component.writeValue('123');
    fixture.detectChanges();
    expect(onChange).not.toHaveBeenCalled(); // writeValue must not emit
    expect(cells().map((c) => c.value)).toEqual(['1', '2', '3', '', '', '']);

    component.writeValue(null);
    fixture.detectChanges();
    expect(cells().every((c) => c.value === '')).toBe(true);
    component.writeValue('');
    fixture.detectChanges();
    expect(cells().every((c) => c.value === '')).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('displays a seeded value faithfully — writeValue is not re-filtered to integerOnly', () => {
    component.writeValue('12ab'); // consumer bug, but faithful display + round-trip
    fixture.detectChanges();
    expect(
      cells()
        .slice(0, 4)
        .map((c) => c.value),
    ).toEqual(['1', '2', 'a', 'b']);
  });

  it('truncates a pasted code longer than the remaining cells and clamps focus to the last cell', () => {
    fixture.componentRef.setInput('length', 4);
    fixture.detectChanges();
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const c = cells();
    c[0].focus();
    paste(c[0], '123456');
    fixture.detectChanges();
    expect(c.map((x) => x.value)).toEqual(['1', '2', '3', '4']);
    expect(latest).toBe('1234');
    expect(document.activeElement).toBe(c[3]); // clamped, not out of range
  });

  it('ignores an all-invalid paste while integerOnly (no emit, no focus jump)', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    const c = cells();
    c[0].focus();
    paste(c[0], 'abcd');
    fixture.detectChanges();
    expect(onChange).not.toHaveBeenCalled();
    expect(c.every((x) => x.value === '')).toBe(true);
    expect(document.activeElement).toBe(c[0]); // unchanged
  });

  it('keeps exactly one tab stop even if length shrinks past the active cell (clamp guard)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cells()[5].focus(); // activeIndex → 5
    fixture.detectChanges();
    fixture.componentRef.setInput('length', 3); // misuse: length is set-once, but must not break a11y
    fixture.detectChanges();
    const tabindexes = cells().map((c) => c.getAttribute('tabindex'));
    expect(cells().length).toBe(3);
    expect(tabindexes.filter((t) => t === '0').length).toBe(1); // still reachable by Tab
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('set-once')); // and it warned
  });

  it('forwards ariaLabelledby onto the group host', () => {
    fixture.componentRef.setInput('ariaLabelledby', 'external-label');
    fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('aria-labelledby')).toBe('external-label');
  });

  it('dev-warns when length is below 1', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = TestBed.createComponent(CaeInputOtp);
    f.componentRef.setInput('ariaLabel', 'Code');
    f.componentRef.setInput('length', 0);
    f.detectChanges();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('at least 1 cell'));
    expect(f.nativeElement.querySelectorAll('input').length).toBe(0);
    f.destroy();
  });

  it('dev-warns when the group has no accessible name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = TestBed.createComponent(CaeInputOtp); // no ariaLabel/ariaLabelledby
    f.detectChanges();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no accessible name'));
    f.destroy();
  });

  // --- mask (#309) ---
  it('mask=false (default) shows the glyphs as type=text', () => {
    expect(cells().every((c) => c.type === 'text')).toBe(true);
  });

  it('mask renders the cells as type=password to obscure the glyphs', () => {
    fixture.componentRef.setInput('mask', true);
    fixture.detectChanges();
    expect(cells().every((c) => c.type === 'password')).toBe(true);
  });

  it('masking is display-only: entry/paste still round-trip the real value, not dots', () => {
    fixture.componentRef.setInput('mask', true);
    fixture.detectChanges();
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const c = cells();
    // typed entry
    c[0].focus();
    type(c[0], '4');
    expect(latest).toBe('4'); // the true digit reaches the model
    expect(c[0].value).toBe('4'); // el.value holds the real char (obscuring is visual only)
    // paste-spread still works under mask
    paste(c[1], '8291');
    fixture.detectChanges();
    expect(latest).toBe('48291');
    expect(cells().map((x) => x.value)).toEqual(['4', '8', '2', '9', '1', '']);
  });

  // --- readonly (#309) ---
  it('readonly sets the native readonly attribute but leaves the cells enabled (focusable, in a11y tree)', () => {
    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();
    const c = cells();
    expect(c.every((x) => x.readOnly)).toBe(true); // announced "read only"
    expect(c.every((x) => !x.disabled)).toBe(true); // NOT disabled — stays focusable/perceivable
    expect(c.filter((x) => x.getAttribute('tabindex') === '0').length).toBe(1); // still one tab stop
  });

  it('readonly makes entry, Backspace, Delete, and paste inert (no model mutation)', () => {
    component.writeValue('12');
    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    const c = cells();
    c[2].focus();
    type(c[2], '9'); // typed/autofilled entry
    key(c[0], 'Backspace'); // delete-back on a filled cell
    key(c[1], 'Delete'); // delete-in-place on a filled cell
    paste(c[2], '5555'); // paste-spread
    fixture.detectChanges();
    expect(onChange).not.toHaveBeenCalled(); // nothing emitted
    expect(cells().map((x) => x.value)).toEqual(['1', '2', '', '', '', '']); // model untouched
  });

  it('readonly still allows focus navigation across cells (arrows/Home/End)', () => {
    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();
    const c = cells();
    c[2].focus();
    key(c[2], 'ArrowLeft');
    expect(document.activeElement).toBe(c[1]);
    key(c[1], 'ArrowRight');
    expect(document.activeElement).toBe(c[2]);
    key(c[2], 'Home');
    expect(document.activeElement).toBe(c[0]);
    key(c[0], 'End');
    expect(document.activeElement).toBe(c[5]);
  });

  it('readonly still accepts a programmatic value (writeValue populates the display)', () => {
    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();
    component.writeValue('4821');
    fixture.detectChanges();
    expect(
      cells()
        .slice(0, 4)
        .map((c) => c.value),
    ).toEqual(['4', '8', '2', '1']);
  });

  it('readonly re-enables editing when toggled back off (the guard is reactive, not a latch)', () => {
    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    cells()[0].focus();
    type(cells()[0], '7');
    expect(latest).toBeUndefined(); // inert while readonly

    fixture.componentRef.setInput('readonly', false);
    fixture.detectChanges();
    type(cells()[0], '7');
    expect(latest).toBe('7'); // editing works again — the guard reads readonly() live
  });

  it('readonly suppresses the SMS-autofill hint and aria-required (no dead affordances)', () => {
    fixture.componentRef.setInput('required', true);
    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();
    const c = cells();
    // cell 0 no longer advertises one-time-code autofill (would revert silently), and a locked field
    // is not announced "required".
    expect(c.every((x) => x.getAttribute('autocomplete') === 'off')).toBe(true);
    expect(c.every((x) => x.getAttribute('aria-required') === null)).toBe(true);
  });

  it('mask + readonly compose: cells are obscured, read-only, and inert', () => {
    component.writeValue('1234');
    fixture.componentRef.setInput('mask', true);
    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    const c = cells();
    expect(c.every((x) => x.type === 'password')).toBe(true); // obscured
    expect(c.every((x) => x.readOnly)).toBe(true); // read-only
    key(c[0], 'Backspace');
    paste(c[0], '9999');
    fixture.detectChanges();
    expect(onChange).not.toHaveBeenCalled(); // inert
    expect(
      cells()
        .slice(0, 4)
        .map((x) => x.value),
    ).toEqual(['1', '2', '3', '4']); // the real value, untouched
  });
});

/** A string `length="4"` attribute coerces to a number (numberAttribute transform). */
@Component({
  standalone: true,
  imports: [CaeInputOtp],
  template: `<cae-input-otp length="5" ariaLabel="Code" />`,
})
class OtpAttrHost {}

describe('CaeInputOtp — numberAttribute', () => {
  it('coerces a string length attribute to a number of cells', () => {
    const fixture = TestBed.createComponent(OtpAttrHost);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(5);
    fixture.destroy();
  });
});

/** Reactive-forms round-trip: the OTP behaves as one control on a real FormControl. */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, CaeInputOtp],
  template: `<cae-input-otp [formControl]="code" [length]="4" ariaLabel="Code" />`,
})
class OtpHost {
  readonly code = new FormControl('12', { nonNullable: true });
}

describe('CaeInputOtp — reactive-forms integration', () => {
  it('round-trips the value through a FormControl', async () => {
    const fixture = TestBed.createComponent(OtpHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();

    const cells = (): HTMLInputElement[] =>
      Array.from(fixture.nativeElement.querySelectorAll('input'));

    // model → view
    expect(cells().map((c) => c.value)).toEqual(['1', '2', '', '']);

    // view → model: type into cell 2
    const c2 = cells()[2];
    c2.value = '3';
    c2.dispatchEvent(new Event('input', { bubbles: true }));
    expect(fixture.componentInstance.code.value).toBe('123');

    // programmatic reset flows back to the cells
    fixture.componentInstance.code.setValue('9999');
    fixture.detectChanges();
    expect(cells().map((c) => c.value)).toEqual(['9', '9', '9', '9']);

    fixture.destroy();
    fixture.nativeElement.remove();
  });
});
