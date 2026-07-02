import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CaeStep, CaeStepper } from './stepper';

@Component({
  imports: [CaeStepper, CaeStep, ReactiveFormsModule],
  template: `
    <form [formGroup]="form">
      <cae-stepper ariaLabel="Setup" [selectedIndex]="index" (selectedIndexChange)="index = $event">
        <cae-step label="Identity">
          <input class="step-name" formControlName="name" />
        </cae-step>
        <cae-step label="Details" optional>
          <p class="panel-2">Second step body</p>
        </cae-step>
      </cae-stepper>
    </form>
  `,
})
class StepperHost {
  form = new FormGroup({ name: new FormControl('', { nonNullable: true }) });
  index = 0;
}

describe('CaeStepper', () => {
  let fixture: ComponentFixture<StepperHost>;
  let host: StepperHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StepperHost] }).compileComponents();
    fixture = TestBed.createComponent(StepperHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('renders one step header per projected cae-step, with its label', () => {
    const headers = el().querySelectorAll('[role="tab"], .mat-step-label, mat-step-header');
    // Material renders a header per step; assert both labels are present.
    expect(el().textContent).toContain('Identity');
    expect(el().textContent).toContain('Details');
    expect(headers.length).toBeGreaterThanOrEqual(2);
  });

  it('labels the stepper for assistive tech', () => {
    // Material applies aria-label to its internal header region (not the host element),
    // as MatTabGroup does — assert it reached the DOM without pinning the exact element.
    expect(el().querySelector('[aria-label="Setup"]')).toBeTruthy();
  });

  it('binds a form control declared inside a projected step (ControlContainer resolves)', async () => {
    // The step body is projected through cae-step's <ng-content> and stamped into mat-step;
    // formControlName must still find the ancestor <form [formGroup]>. This guards the
    // Forge stepper-wizard: a control inside a step is a real reactive-forms control.
    host.form.controls.name.setValue('Acme');
    fixture.detectChanges();
    await fixture.whenStable();
    const input = el().querySelector('.step-name') as HTMLInputElement;
    expect(input.value).toBe('Acme');

    // …and the reverse: typing updates the form model.
    input.value = 'Beta';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.form.controls.name.value).toBe('Beta');
  });

  it('drives selection through the two-way selectedIndex seam', async () => {
    host.index = 1;
    fixture.detectChanges();
    await fixture.whenStable();
    // The second step body is rendered (steps stamp eagerly) and now the selected one.
    expect(el().querySelector('.panel-2')?.textContent).toContain('Second step body');
  });
});

@Component({
  imports: [CaeStepper, CaeStep, ReactiveFormsModule],
  template: `
    <cae-stepper linear [selectedIndex]="index" (selectedIndexChange)="index = $event">
      <cae-step label="One" [stepControl]="one">
        <input class="one" [formControl]="one" />
      </cae-step>
      <cae-step label="Two" [stepControl]="two">
        <input class="two" [formControl]="two" />
      </cae-step>
    </cae-stepper>
  `,
})
class LinearHost {
  one = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  two = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  index = 0;
}

describe('CaeStepper (linear)', () => {
  let fixture: ComponentFixture<LinearHost>;
  let host: LinearHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LinearHost] }).compileComponents();
    fixture = TestBed.createComponent(LinearHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('refuses to advance past an invalid step and snaps the two-way selectedIndex back (#40)', async () => {
    // Step 0's control is required and empty → invalid. Request a jump to step 1.
    host.index = 1;
    await settle();
    // Material refuses the linear move (and emits nothing); the wrapper reads the actual index
    // back and reconciles, so the parent signal never diverges from the rendered step.
    expect(host.index).toBe(0);
  });

  it('disables the header of an unreachable step for assistive tech (linear a11y)', async () => {
    // With step 0 invalid, step 1 is unreachable — Material marks its header aria-disabled so
    // keyboard / SR users can't tab-jump into a gated step.
    const disabledHeaders = el().querySelectorAll('mat-step-header[aria-disabled="true"]');
    expect(disabledHeaders.length).toBeGreaterThanOrEqual(1);
  });

  it('advances once the step control is valid', async () => {
    host.one.setValue('filled'); // step 0 now valid
    host.index = 1;
    await settle();
    expect(host.index).toBe(1);
    expect(el().querySelector('.two')).toBeTruthy();
  });

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
});
