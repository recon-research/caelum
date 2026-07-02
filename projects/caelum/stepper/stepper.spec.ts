import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

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
