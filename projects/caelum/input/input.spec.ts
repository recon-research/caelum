import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatInput } from '@angular/material/input';
import { By } from '@angular/platform-browser';

import { CaeInput } from './input';

describe('CaeInput', () => {
  let component: CaeInput;
  let fixture: ComponentFixture<CaeInput>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeInput] }).compileComponents();
    fixture = TestBed.createComponent(CaeInput);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  const nativeInput = (): HTMLInputElement => fixture.nativeElement.querySelector('input');

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reflects a value written by the form model (writeValue)', () => {
    component.writeValue('hello');
    fixture.detectChanges();
    expect(nativeInput().value).toBe('hello');
  });

  it('propagates typing back to the form (registerOnChange)', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const el = nativeInput();
    el.value = 'typed';
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(latest).toBe('typed');
  });

  it('renders the floating label when provided', () => {
    fixture.componentRef.setInput('label', 'Email');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-label')?.textContent).toContain('Email');
  });

  it('forwards native attributes to the inner input (autocomplete)', () => {
    fixture.componentRef.setInput('autocomplete', 'email');
    fixture.detectChanges();
    expect(nativeInput().getAttribute('autocomplete')).toBe('email');
  });

  it('disables via the template input (merged with setDisabledState)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(nativeInput().disabled).toBe(true);
  });
});

// Validation-error forwarding (#29): the consumer binds their control to the OUTER
// <cae-input>, so this exercises the bridge that reflects that control's validity into the
// inner mat-form-field. A host component supplies a real reactive control + error map.
@Component({
  imports: [CaeInput, ReactiveFormsModule],
  template: `<cae-input [formControl]="ctrl" [errorMessages]="messages" label="Email" />`,
})
class InputErrorHost {
  readonly ctrl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  messages: Record<string, string> = { required: 'Email is required' };
}

describe('CaeInput — validation errors', () => {
  let fixture: ComponentFixture<InputErrorHost>;
  let host: InputErrorHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [InputErrorHost] }).compileComponents();
    fixture = TestBed.createComponent(InputErrorHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const matInputErrorState = (): boolean =>
    fixture.debugElement.query(By.directive(MatInput)).injector.get(MatInput).errorState;
  const errorText = (): string =>
    fixture.nativeElement.querySelector('mat-error')?.textContent?.trim() ?? '';

  it('stays silent while the control is untouched', () => {
    expect(host.ctrl.invalid).toBe(true);
    expect(matInputErrorState()).toBe(false);
    expect(errorText()).toBe('');
  });

  it('shows the mapped message once the control is invalid and touched', async () => {
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(matInputErrorState()).toBe(true);
    expect(errorText()).toContain('Email is required');
  });

  it('clears the error when the control becomes valid', async () => {
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    host.ctrl.setValue('owner@acme.dev');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(matInputErrorState()).toBe(false);
    expect(errorText()).toBe('');
  });

  it('marks the field invalid even when no message is mapped for the error', async () => {
    host.messages = {};
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // Error state (→ invalid styling + aria-invalid) still flips; there is just no text.
    expect(matInputErrorState()).toBe(true);
    expect(errorText()).toBe('');
  });
});
