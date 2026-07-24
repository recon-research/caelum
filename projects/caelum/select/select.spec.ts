import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatSelect } from '@angular/material/select';

import { CaeSelect, CaeSelectOption } from './select';
import { expectNoA11yViolations } from '../testing/a11y';

const OPTIONS: CaeSelectOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('CaeSelect', () => {
  let component: CaeSelect;
  let fixture: ComponentFixture<CaeSelect>;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeSelect] }).compileComponents();
    fixture = TestBed.createComponent(CaeSelect);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    overlayContainer = TestBed.inject(OverlayContainer);
    await fixture.whenStable();
  });

  afterEach(() => overlayContainer?.ngOnDestroy());

  const matSelect = (): MatSelect =>
    fixture.debugElement.query(By.directive(MatSelect)).componentInstance;

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('has no axe violations in the open panel (named via ariaLabel)', async () => {
    fixture.componentRef.setInput('ariaLabel', 'Region');
    matSelect().open();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.querySelectorAll('mat-option').length).toBe(OPTIONS.length);
    await expectNoA11yViolations(overlayContainer.getContainerElement());
  });

  it('reflects a value written by the form model (writeValue)', () => {
    component.writeValue('b');
    fixture.detectChanges();
    expect(matSelect().value).toBe('b');
  });

  it('propagates a user choice back to the form (registerOnChange)', async () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    matSelect().open();
    fixture.detectChanges();
    await fixture.whenStable();
    // Options live in the CDK overlay (document body) only while the panel is open.
    const options = document.querySelectorAll<HTMLElement>('mat-option');
    expect(options.length).toBe(OPTIONS.length);
    options[1].click();
    fixture.detectChanges();
    expect(latest).toBe('b');
  });

  it('renders the floating label when provided', () => {
    fixture.componentRef.setInput('label', 'Region');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-label')?.textContent).toContain('Region');
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

// Validation-error forwarding (#47, extending #29): the consumer binds their control to the
// OUTER <cae-select>, so this exercises the bridge that reflects that control's validity into
// the inner mat-select's error state. A host component supplies a real reactive control + map.
@Component({
  imports: [CaeSelect, ReactiveFormsModule],
  template: `
    <cae-select [formControl]="ctrl" [errorMessages]="messages" label="Region" [options]="opts" />
  `,
})
class SelectErrorHost {
  readonly opts: CaeSelectOption[] = OPTIONS;
  readonly ctrl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  messages: Record<string, string> = { required: 'A region is required' };
}

describe('CaeSelect — validation errors', () => {
  let fixture: ComponentFixture<SelectErrorHost>;
  let host: SelectErrorHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SelectErrorHost] }).compileComponents();
    fixture = TestBed.createComponent(SelectErrorHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const selectErrorState = (): boolean =>
    fixture.debugElement.query(By.directive(MatSelect)).injector.get(MatSelect).errorState;
  const errorText = (): string =>
    fixture.nativeElement.querySelector('mat-error')?.textContent?.trim() ?? '';
  const ariaInvalid = (): string | null =>
    fixture.nativeElement.querySelector('mat-select')?.getAttribute('aria-invalid') ?? null;

  it('stays silent while the control is untouched', () => {
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
    expect(errorText()).toContain('A region is required');
  });

  it('clears the error when the control becomes valid', async () => {
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    host.ctrl.setValue('b');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(selectErrorState()).toBe(false);
    expect(errorText()).toBe('');
  });

  it('marks the field invalid even when no message is mapped for the error', async () => {
    host.messages = {};
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // Error state (→ invalid styling) still flips; there is just no text. Unlike matInput,
    // mat-select reflects errorState into aria-invalid unconditionally (no empty-required
    // suppression), so aria-invalid is present here regardless of the `required` input.
    expect(selectErrorState()).toBe(true);
    expect(errorText()).toBe('');
    expect(ariaInvalid()).toBe('true');
  });
});
