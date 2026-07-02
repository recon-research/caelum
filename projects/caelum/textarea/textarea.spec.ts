import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatInput } from '@angular/material/input';
import { By } from '@angular/platform-browser';

import { CaeTextarea } from './textarea';

describe('CaeTextarea', () => {
  let component: CaeTextarea;
  let fixture: ComponentFixture<CaeTextarea>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeTextarea] }).compileComponents();
    fixture = TestBed.createComponent(CaeTextarea);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  const nativeArea = (): HTMLTextAreaElement => fixture.nativeElement.querySelector('textarea');

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reflects a value written by the form model (writeValue)', () => {
    component.writeValue('multi\nline');
    fixture.detectChanges();
    expect(nativeArea().value).toBe('multi\nline');
  });

  it('propagates typing back to the form (registerOnChange)', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const el = nativeArea();
    el.value = 'typed';
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(latest).toBe('typed');
  });

  it('forwards rows to the inner textarea', () => {
    fixture.componentRef.setInput('rows', 6);
    fixture.detectChanges();
    expect(nativeArea().rows).toBe(6);
  });

  it('renders the floating label when provided', () => {
    fixture.componentRef.setInput('label', 'Notes');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-label')?.textContent).toContain('Notes');
  });

  it('disables via the template input (merged with setDisabledState)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(nativeArea().disabled).toBe(true);
  });
});

// Validation-error forwarding (#29) — same bridge as cae-input, over a <textarea>.
@Component({
  imports: [CaeTextarea, ReactiveFormsModule],
  template: `<cae-textarea [formControl]="ctrl" [errorMessages]="messages" label="Bio" />`,
})
class TextareaErrorHost {
  readonly ctrl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  messages: Record<string, string> = { required: 'A description is required' };
}

describe('CaeTextarea — validation errors', () => {
  let fixture: ComponentFixture<TextareaErrorHost>;
  let host: TextareaErrorHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TextareaErrorHost] }).compileComponents();
    fixture = TestBed.createComponent(TextareaErrorHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const matInputErrorState = (): boolean =>
    fixture.debugElement.query(By.directive(MatInput)).injector.get(MatInput).errorState;
  const errorText = (): string =>
    fixture.nativeElement.querySelector('mat-error')?.textContent?.trim() ?? '';

  it('stays silent while the control is untouched', () => {
    expect(matInputErrorState()).toBe(false);
    expect(errorText()).toBe('');
  });

  it('shows the mapped message once the control is invalid and touched', async () => {
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(matInputErrorState()).toBe(true);
    expect(errorText()).toContain('A description is required');
  });

  it('clears the error when the control becomes valid', async () => {
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    host.ctrl.setValue('All about this workspace.');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(matInputErrorState()).toBe(false);
    expect(errorText()).toBe('');
  });
});
