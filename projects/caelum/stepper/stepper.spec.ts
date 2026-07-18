import { Component, ErrorHandler, signal } from '@angular/core';
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

// #592 — `[selectedIndex]` is a bare `input(0)` with no transform, and this wrapper assigns it
// straight into CDK's setter from inside an `effect`. That setter THROWS on any index failing
// `index > -1 && index < steps.length` — NaN, negatives, and out-of-range alike — so an unguarded
// value doesn't degrade the stepper, it takes down change detection. The realistic trigger isn't
// exotic: restoring a persisted index after a conditional step list shrank.
@Component({
  imports: [CaeStepper, CaeStep],
  template: `
    <cae-stepper
      ariaLabel="Setup"
      [selectedIndex]="idx()"
      (selectedIndexChange)="seen.push($event)"
    >
      @for (s of steps(); track s) {
        <cae-step [label]="s"
          ><p class="body">{{ s }}</p></cae-step
        >
      }
    </cae-stepper>
  `,
})
class BoundsHost {
  readonly idx = signal(0);
  readonly steps = signal(['One', 'Two', 'Three']);
  readonly seen: number[] = [];
}

describe('CaeStepper (index bounds, #592)', () => {
  let fixture: ComponentFixture<BoundsHost>;
  let host: BoundsHost;

  // Today the assignment happens in a plain `effect`, so an out-of-bounds throw propagates out of
  // detectChanges and these tests fail on the throw itself. The ErrorHandler capture is deliberate
  // insurance rather than dead weight: if the assignment is ever moved past render to fix #597,
  // the throw becomes a REPORTED error instead of a propagated one — and asserting rendered state
  // alone would then have no teeth, because a swallowed failure leaves the stepper on exactly the
  // step a successful clamp would. Verified: with the clamp removed, these fail either way.
  let errors: string[];

  beforeEach(async () => {
    errors = [];
    await TestBed.configureTestingModule({
      imports: [BoundsHost],
      providers: [
        {
          provide: ErrorHandler,
          useValue: {
            handleError: (e: unknown) => errors.push(String((e as Error)?.message ?? e)),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BoundsHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const outOfBounds = (): string[] => errors.filter((e) => e.includes('out-of-bounds'));

  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const selectedHeader = (): number =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('mat-step-header'),
    ).findIndex((h) => h.getAttribute('aria-selected') === 'true');

  // Each of these throws `cdkStepper: Cannot assign out-of-bounds value to selectedIndex` without
  // the clamp — an unhandled error inside change detection, not a wrong-looking step.
  it('does not crash change detection on an out-of-range index, and reports the real one', async () => {
    host.idx.set(99);
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(2); // clamped to the last step
    // Exact array, not toContain: a loose assertion hid a duplicate emit here ([2, 2]).
    expect(host.seen).toEqual([2]);
  });

  it('does not crash change detection on a negative index', async () => {
    host.idx.set(-1);
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(0);
    // CDK doesn't move (already on 0), so the wrapper's reconciliation tells the consumer once
    // that their -1 resolved to 0 — same single snap-back as the NaN case, never a duplicate.
    expect(host.seen).toEqual([0]);
  });

  it('does not crash change detection on a NaN index, and never emits one', async () => {
    host.idx.set(NaN);
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(0);
    // The emit-back compares against the CONSUMER's value, so a NaN request snaps the parent to
    // the real index exactly once — and never emits a NaN.
    expect(host.seen).toEqual([0]);
  });

  it('truncates a fractional index instead of indexing the step array at a fraction', async () => {
    host.idx.set(1.5);
    await settle();
    expect(selectedHeader()).toBe(1);
    expect(host.seen).toEqual([1]);
  });

  // The motivating case named at the top of this describe: a persisted index restored against a
  // step list that has since shrunk. Distinct from the static out-of-range test — CDK's own
  // steps.changes handler decrements by exactly one, so it can leave an index out of range against
  // the NEW list until the wrapper re-clamps.
  it('survives the step list shrinking under a now-out-of-range index', async () => {
    host.idx.set(2);
    await settle();
    expect(selectedHeader()).toBe(2);
    host.steps.set(['One']); // index 2 no longer exists
    await settle();
    // What THIS slice guarantees: no crash. CDK's own steps.changes handler decrements the index by
    // exactly one (2 -> 1) regardless of the new length, so against a 1-step list it lands out of
    // range and NO header is selected. That orphan-index state is pre-existing — verified against
    // main, where this same assertion fails identically — and the wrapper can't currently re-clamp
    // it without taking `steps()` as a dependency, which reintroduces the yank below. See #598.
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(-1); // documents the residual; tighten to 0 when #598 lands
  });

  // Locks the reason `steps()` is read UNTRACKED. Taking it as a dependency re-asserts the declared
  // index whenever the step list changes structurally — which silently threw a user off a step they
  // had navigated to themselves (measured during this slice: click step 3, add a step, snapped back
  // to step 1). Both review lenses reached this independently. One-way binding is the exposed case;
  // a two-way binding hides it because the parent's signal tracks the user's move.
  it('does not yank a user off their step when the step list changes (one-way binding)', async () => {
    const headers = (): HTMLElement[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    headers()[2].click(); // user navigates to step 3 themselves; host.idx stays 0
    await settle();
    expect(selectedHeader()).toBe(2);

    host.steps.set(['One', 'Two', 'Three', 'Four']); // structural change, unrelated to navigation
    await settle();
    expect(selectedHeader()).toBe(2); // still where the user left it
  });

  it('keeps a pending index when the step list arrives late (async step list)', async () => {
    host.steps.set([]);
    host.idx.set(2);
    await settle();
    // With zero steps CDK would reject even 0, so the wrapper must not assign at all. Once the
    // steps arrive the effect re-runs and the index clamps into the real range.
    host.steps.set(['One', 'Two']);
    await settle();
    expect(selectedHeader()).toBe(1);
  });
});
