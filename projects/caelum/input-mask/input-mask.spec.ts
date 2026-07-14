import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { CaeInputMask, caeMaskComplete } from './input-mask';

const PHONE = '(999) 999-9999';

describe('CaeInputMask', () => {
  let fixture: ComponentFixture<CaeInputMask>;
  let component: CaeInputMask;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CaeInputMask] });
    fixture = TestBed.createComponent(CaeInputMask);
    component = fixture.componentInstance;
    // Attached so focus/selection APIs behave (jsdom only selects connected elements).
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('mask', PHONE);
    fixture.componentRef.setInput('label', 'Phone'); // accessible name (silences the dev-warn)
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  function input(): HTMLInputElement {
    return fixture.debugElement.query(By.css('input')).nativeElement;
  }

  /** Model the browser having produced `value` with the caret at `caret` (default: end), then edit. */
  function edit(value: string, caret = value.length): void {
    const el = input();
    el.value = value;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Dispatch a collapsed Backspace/Delete (via `beforeinput`) with the caret at `caret`. */
  function keyDelete(type: 'deleteContentBackward' | 'deleteContentForward', caret: number): void {
    const el = input();
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(
      new InputEvent('beforeinput', { inputType: type, cancelable: true, bubbles: true }),
    );
    fixture.detectChanges();
  }

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('renders the label', () => {
    expect(fixture.nativeElement.textContent).toContain('Phone');
  });

  it('masks progressively as data is entered (empty stays truly empty)', () => {
    edit('');
    expect(input().value).toBe('');
    edit('2');
    expect(input().value).toBe('(2');
    edit('(212'); // typed-through literal consumed
    expect(input().value).toBe('(212');
  });

  it('renders the full masked view for a complete value', () => {
    edit('2125550142');
    expect(input().value).toBe('(212) 555-0142');
  });

  it('commits the UNMASKED value through the CVA (Book 08 §2.2)', () => {
    const seen: (string | null)[] = [];
    component.registerOnChange((v) => seen.push(v));
    edit('2125550142');
    expect(seen.at(-1)).toBe('2125550142');
  });

  it('spreads a pasted decorated string through the template', () => {
    const seen: string[] = [];
    component.registerOnChange((v) => seen.push(v));
    edit('(212) 555-0142'); // paste of an already-formatted number
    expect(input().value).toBe('(212) 555-0142');
    expect(seen.at(-1)).toBe('2125550142');
  });

  it('ignores characters that no slot accepts', () => {
    edit('abc212def555xyz0142');
    expect(input().value).toBe('(212) 555-0142');
  });

  it('keeps the caret after the next editable slot on insertion', () => {
    edit('212'); // view "(212", caret at end (4)
    expect(input().selectionStart).toBe(4);
    edit('2125'); // view "(212) 5" — caret jumps past ") " to sit after the 5
    expect(input().value).toBe('(212) 5');
    expect(input().selectionStart).toBe(7);
  });

  it('Backspace over a literal deletes the preceding data character (not a no-op)', () => {
    fixture.componentRef.setInput('mask', '99/99/9999');
    fixture.detectChanges();
    const seen: string[] = [];
    component.registerOnChange((v) => seen.push(v));
    edit('1234'); // view "12/34"
    expect(input().value).toBe('12/34');
    keyDelete('deleteContentBackward', 3); // caret just past the "/", targeting the literal
    expect(input().value).toBe('13/4'); // the "2" before the literal is removed, digits shift left
    expect(seen.at(-1)).toBe('134');
  });

  it('Backspace at the end removes the last data character, repeatably down to empty', () => {
    edit('212'); // "(212"
    keyDelete('deleteContentBackward', input().value.length);
    expect(input().value).toBe('(21');
    keyDelete('deleteContentBackward', input().value.length);
    keyDelete('deleteContentBackward', input().value.length);
    expect(input().value).toBe('');
  });

  it('Delete removes the following data character, skipping a literal', () => {
    fixture.componentRef.setInput('mask', '99/99/9999');
    fixture.detectChanges();
    edit('1234'); // "12/34"
    keyDelete('deleteContentForward', 2); // caret before the "/", removes the next data char "3"
    expect(input().value).toBe('12/4');
  });

  it('drops overflow when more data than the template has slots is pasted', () => {
    const seen: string[] = [];
    component.registerOnChange((v) => seen.push(v));
    edit('212555014299999'); // 15 digits into a 10-digit mask
    expect(input().value).toBe('(212) 555-0142');
    expect(seen.at(-1)).toBe('2125550142');
  });

  it('renders empty for an all-literal mask (no editable slots)', () => {
    fixture.componentRef.setInput('mask', '---');
    fixture.detectChanges();
    const seen: string[] = [];
    component.registerOnChange((v) => seen.push(v));
    edit('abc123');
    expect(input().value).toBe('');
    expect(seen.at(-1)).toBe('');
  });

  it('round-trips a masked model under [keepLiteral] via writeValue', () => {
    fixture.componentRef.setInput('keepLiteral', true);
    fixture.detectChanges();
    const seen: string[] = [];
    component.registerOnChange((v) => seen.push(v));
    component.writeValue('(212) 555-0142'); // the model IS the decorated form under keepLiteral
    fixture.detectChanges();
    expect(input().value).toBe('(212) 555-0142');
    expect(seen).toEqual([]); // writeValue never emits
  });

  it('ignores an input event flagged isComposing (defensive IME guard)', () => {
    fixture.componentRef.setInput('mask', 'aaaa');
    fixture.detectChanges();
    const seen: string[] = [];
    component.registerOnChange((v) => seen.push(v));
    const el = input();
    el.value = 'ni';
    el.dispatchEvent(new InputEvent('input', { isComposing: true, bubbles: true }));
    fixture.detectChanges();
    expect(seen).toEqual([]);
  });

  it('warns in dev when a mask literal is also valid token data', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = TestBed.createComponent(CaeInputMask);
    f.componentRef.setInput('mask', 'aaXaa'); // "X" is a literal, but the "a" token also accepts letters
    f.componentRef.setInput('label', 'Code');
    f.detectChanges();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('also valid token data'));
    warn.mockRestore();
    f.destroy();
  });

  it('emits the masked/literal value when [keepLiteral] is set', () => {
    fixture.componentRef.setInput('keepLiteral', true);
    fixture.detectChanges();
    const seen: string[] = [];
    component.registerOnChange((v) => seen.push(v));
    edit('2125550142');
    expect(seen.at(-1)).toBe('(212) 555-0142');
  });

  it('writeValue displays the mask without re-emitting (CVA contract)', () => {
    const seen: string[] = [];
    component.registerOnChange((v) => seen.push(v));
    component.writeValue('2125550142');
    fixture.detectChanges();
    expect(input().value).toBe('(212) 555-0142');
    expect(seen).toEqual([]); // writeValue must never call onChange (Book 07 §3.1)
  });

  it('re-masks the held model when the mask changes at runtime', () => {
    component.writeValue('12312024');
    fixture.detectChanges();
    expect(input().value).toBe('(123) 120-24'); // 8 digits under the phone mask
    fixture.componentRef.setInput('mask', '99/99/9999');
    fixture.detectChanges();
    expect(input().value).toBe('12/31/2024'); // same 8 digits, re-masked as a date
  });

  it('coerces a null model to an empty view', () => {
    component.writeValue(null as unknown as string);
    fixture.detectChanges();
    expect(input().value).toBe('');
  });

  it('buffers IME composition — no commit mid-composition, one commit on end', () => {
    fixture.componentRef.setInput('mask', 'aaaa'); // alpha mask so composition is meaningful
    fixture.detectChanges();
    const seen: string[] = [];
    component.registerOnChange((v) => seen.push(v));
    const el = input();

    el.dispatchEvent(new CompositionEvent('compositionstart'));
    el.value = 'ni';
    el.dispatchEvent(new Event('input')); // mid-composition — must be ignored
    fixture.detectChanges();
    expect(seen).toEqual([]);

    el.value = 'hao';
    el.dispatchEvent(new CompositionEvent('compositionend'));
    fixture.detectChanges();
    expect(seen).toEqual(['hao']); // exactly one commit, on end
  });

  it('marks the control touched on blur', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    input().dispatchEvent(new Event('blur'));
    expect(touched).toBe(true);
  });

  it('reflects required as aria-required on the inner input', () => {
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();
    expect(input().getAttribute('aria-required')).toBe('true');
  });

  it('disables the inner input via setDisabledState', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(input().disabled).toBe(true);
  });

  it('auto-sets inputmode="numeric" for an all-digit mask', () => {
    expect(input().getAttribute('inputmode')).toBe('numeric');
  });

  it('does not force numeric inputmode for a mask with alpha tokens', () => {
    fixture.componentRef.setInput('mask', 'aa-9999');
    fixture.detectChanges();
    expect(input().getAttribute('inputmode')).toBeNull();
  });

  it('lets inputMode be overridden', () => {
    fixture.componentRef.setInput('inputMode', 'tel');
    fixture.detectChanges();
    expect(input().getAttribute('inputmode')).toBe('tel');
  });

  it('supports alpha and alphanumeric tokens', () => {
    fixture.componentRef.setInput('mask', 'aa-9999');
    fixture.detectChanges();
    const seen: string[] = [];
    component.registerOnChange((v) => seen.push(v));
    edit('AB1234'); // A,B fill the two `a` slots; 1,2,3,4 fill the four `9` slots
    expect(input().value).toBe('AB-1234');
    expect(seen.at(-1)).toBe('AB1234');
  });

  it('warns in dev when the field has no accessible name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = TestBed.createComponent(CaeInputMask);
    f.componentRef.setInput('mask', PHONE); // no label, no ariaLabel
    f.detectChanges();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no accessible name'));
    warn.mockRestore();
    f.destroy();
  });

  it('does not warn when an ariaLabel is provided instead of a label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = TestBed.createComponent(CaeInputMask);
    f.componentRef.setInput('mask', PHONE);
    f.componentRef.setInput('ariaLabel', 'Phone number');
    f.detectChanges();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    f.destroy();
  });
});

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, CaeInputMask],
  template: `
    <cae-input-mask
      mask="(999) 999-9999"
      label="Phone"
      [required]="true"
      [formControl]="phone"
      [errorMessages]="errorMessages"
    />
  `,
})
class MaskHost {
  readonly phone = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(10)],
  });
  readonly errorMessages = {
    required: 'A phone number is required',
    minlength: 'Enter all 10 digits',
  };
}

describe('CaeInputMask — forms integration', () => {
  let fixture: ComponentFixture<MaskHost>;
  let host: MaskHost;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MaskHost] });
    fixture = TestBed.createComponent(MaskHost);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  function input(): HTMLInputElement {
    return fixture.debugElement.query(By.css('input')).nativeElement;
  }

  it('round-trips a reactive value (model unmasked, view masked)', () => {
    host.phone.setValue('2125550142');
    fixture.detectChanges();
    expect(input().value).toBe('(212) 555-0142');
    expect(host.phone.value).toBe('2125550142');
  });

  it('surfaces the minlength error for a partial number', () => {
    const el = input();
    el.value = '212';
    el.setSelectionRange(4, 4);
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(host.phone.value).toBe('212');
    expect(host.phone.hasError('minlength')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Enter all 10 digits');
  });
});

// The *offered* structural-completeness validator (Book 07 §3.2) — a pure `ValidatorFn`, so it needs
// no fixture. Complements the consumer-side `Validators.minLength(N)` shown above by deriving the
// editable-slot count from the template itself.
describe('caeMaskComplete (offered structural validator, #315)', () => {
  const validate = (mask: string, value: unknown) => caeMaskComplete(mask)(new FormControl(value));

  it('treats empty as valid so it composes with required (empty-skips)', () => {
    expect(validate(PHONE, '')).toBeNull();
    expect(validate(PHONE, null)).toBeNull();
    // Registered alongside `required`: an empty value fires `required`, never `maskIncomplete`.
    const control = new FormControl('', [Validators.required, caeMaskComplete(PHONE)]);
    expect(control.hasError('required')).toBe(true);
    expect(control.hasError('maskIncomplete')).toBe(false);
  });

  it('passes a fully-filled value', () => {
    expect(validate(PHONE, '2125550142')).toBeNull();
  });

  it('fails a partial value with a minlength-shaped { requiredLength, actualLength }', () => {
    expect(validate(PHONE, '212')).toEqual({
      maskIncomplete: { requiredLength: 10, actualLength: 3 },
    });
  });

  it('counts a masked/keepLiteral view value identically to the unmasked model', () => {
    // Same 8 data characters whether the control holds the raw model or the decorated view.
    expect(validate(PHONE, '21255501')).toEqual({
      maskIncomplete: { requiredLength: 10, actualLength: 8 },
    });
    expect(validate(PHONE, '(212) 555-01')).toEqual({
      maskIncomplete: { requiredLength: 10, actualLength: 8 },
    });
    expect(validate(PHONE, '(212) 555-0142')).toBeNull(); // a complete view is valid
  });

  it('derives requiredLength from the template tokens, excluding literals', () => {
    // `aa-9999` = 6 editable slots (2 letters + 4 digits); the `-` literal is not counted.
    expect(validate('aa-9999', 'ab99')).toEqual({
      maskIncomplete: { requiredLength: 6, actualLength: 4 },
    });
    expect(validate('99/99/9999', '12312025')).toBeNull(); // 8 digits fill the 8 token slots
  });
});
