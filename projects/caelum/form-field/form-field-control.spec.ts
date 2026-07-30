import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { By } from '@angular/platform-browser';

import { CaeInput } from '@recon-research/caelum/input';
import { CaeSelect } from '@recon-research/caelum/select';

import { CaeFormFieldControlBase } from './public-api';
import { expectNoA11yViolations } from '../testing/a11y';

// A minimal concrete control that exercises the abstract base WITHOUT a real Material inner
// control: `updateInnerErrorState` is a spy, and protected members are surfaced through public
// probes (a template can read inherited protected members, but the instance type cannot).
@Component({
  selector: 'cae-test-ffc',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="msgs">{{ activeErrorMessages().join('|') }}</span>`,
})
class TestFfc extends CaeFormFieldControlBase {
  innerPokes = 0;
  protected updateInnerErrorState(): void {
    this.innerPokes++;
  }
  probeValue(): string {
    return this.value();
  }
  probeDisabled(): boolean {
    return this.isDisabled();
  }
  // The bridge ignores the first arg and evaluates the bound outer control; `null` form means
  // only `touched` drives the timing here (submit-time timing is covered by the Forge specs).
  probeErrorState(): boolean {
    return this.errorStateMatcher.isErrorState(null, null);
  }
  commit(value: string): void {
    this.commitValue(value);
  }
}

@Component({
  imports: [TestFfc, ReactiveFormsModule],
  template: `<cae-test-ffc [formControl]="active()" [errorMessages]="messages()" />`,
})
class Host {
  readonly a = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3)],
  });
  readonly b = new FormControl('set', { nonNullable: true });
  readonly active = signal(this.a);
  // A signal so the test can flip the map with deterministic reactivity into the OnPush child.
  readonly messages = signal<Record<string, string | ((e: unknown) => string)>>({
    required: 'Required',
    minlength: (e) => `Min ${(e as { requiredLength: number }).requiredLength}`,
  });
}

describe('CaeFormFieldControlBase (shared base)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let ctrl: TestFfc;

  const control = (): TestFfc =>
    fixture.debugElement.query(By.directive(TestFfc)).componentInstance;
  const messagesText = (): string =>
    fixture.nativeElement.querySelector('.msgs')?.textContent?.trim() ?? '';

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    ctrl = control();
  });

  it('round-trips the value through the CVA (writeValue + commitValue → onChange)', () => {
    ctrl.writeValue('hello');
    expect(ctrl.probeValue()).toBe('hello');

    let latest: string | undefined;
    ctrl.registerOnChange((v: string) => (latest = v));
    ctrl.commit('typed');
    expect(latest).toBe('typed');
    expect(ctrl.probeValue()).toBe('typed');
  });

  it('normalizes a null value written by the model to empty string', () => {
    ctrl.writeValue(null as unknown as string);
    expect(ctrl.probeValue()).toBe('');
  });

  it('reflects the form-model disable through isDisabled (setDisabledState)', () => {
    expect(ctrl.probeDisabled()).toBe(false);
    ctrl.setDisabledState(true);
    expect(ctrl.probeDisabled()).toBe(true);
    ctrl.setDisabledState(false);
    expect(ctrl.probeDisabled()).toBe(false);
  });

  it('drives the abstract updateInnerErrorState() hook from ngDoCheck', () => {
    // The hook fired during the initial detectChanges (ngDoCheck runs on every CD of this
    // control) — proof the base drives the inner control's error recompute.
    expect(ctrl.innerPokes).toBeGreaterThan(0);
    // And a programmatic control change nudges CD through the wired subscription, so the hook
    // runs again — the live path that keeps the (bridged) error state fresh in a zoneless app.
    const before = ctrl.innerPokes;
    host.a.markAsTouched();
    fixture.detectChanges();
    expect(ctrl.innerPokes).toBeGreaterThan(before);
  });

  it('bridges the OUTER control validity through the error-state matcher (timing = touched)', () => {
    expect(host.a.invalid).toBe(true);
    expect(ctrl.probeErrorState()).toBe(false); // untouched → silent
    host.a.markAsTouched();
    expect(ctrl.probeErrorState()).toBe(true); // touched + invalid → error
  });

  it('renders only mapped error keys, static and interpolated, skipping unmapped ones', () => {
    host.a.markAsTouched();
    fixture.detectChanges();
    // Empty value → required active → its static message.
    expect(messagesText()).toBe('Required');

    // A value below minLength(3) → minlength active with detail → the interpolated message.
    host.a.setValue('ab');
    fixture.detectChanges();
    expect(messagesText()).toBe('Min 3');

    // An unmapped failing key shows no text (Material's "you supply the message" model).
    host.messages.set({});
    fixture.detectChanges();
    expect(messagesText()).toBe('');
  });

  it('re-wires onto a swapped [formControl] instance (no stale binding)', () => {
    host.a.markAsTouched();
    fixture.detectChanges();
    expect(ctrl.probeErrorState()).toBe(true);

    // Swap to a valid, untouched control — the bridge must now evaluate `b`, not the stale `a`.
    host.active.set(host.b);
    fixture.detectChanges();
    expect(ctrl.probeErrorState()).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The base's a11y contract, exercised through a REAL subclass (#773).
//
// Everything above drives `TestFfc`, which deliberately has no Material inner control — right for
// testing the CVA and error-forwarding seams in isolation, useless for axe: a bare <span> is not
// the DOM this base produces in practice. So this block binds `cae-input`, one of the five real
// subclasses, and scans the state the base actually owns.
//
// The state is chosen, not incidental. Measured across the library, no axe assertion anywhere ran
// against a control in its ERROR state — every one of the 55 swept components scans pristine. That
// leaves the base's own documented edge unverified: a required-empty `matInput` SUPPRESSES
// `aria-invalid`, so the linked <mat-error> text is the only thing that announces the failure. If
// that link breaks, the field is silently invalid to a screen-reader user while looking correct to
// everyone else — which is exactly the defect class axe can catch and a pristine-state scan cannot.
// ---------------------------------------------------------------------------------------------
@Component({
  imports: [CaeInput, ReactiveFormsModule],
  // Named via ariaLabel rather than the visible [label]: mat-form-field's MDC floating label is
  // CSS-positioned, so with no stylesheet applied axe judges it hidden and the `label` rule
  // false-fires (see input.spec.ts). The visible-label path is the real browser's job (#240).
  template: `
    <cae-input
      [formControl]="ctrl"
      ariaLabel="Email address"
      [required]="true"
      [errorMessages]="messages"
    />
  `,
})
class ErrorStateHost {
  readonly ctrl = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly messages = { required: 'Email is required' };
}

describe('CaeFormFieldControlBase — the error bridge, through cae-input (#773)', () => {
  let fixture: ComponentFixture<ErrorStateHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ErrorStateHost] }).compileComponents();
    fixture = TestBed.createComponent(ErrorStateHost);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders an a11y-clean error state, with the message linked rather than orphaned', async () => {
    fixture.componentInstance.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const error = fixture.nativeElement.querySelector('mat-error') as HTMLElement | null;

    // Guard the scan against vacuity in both directions: the message must be RENDERED (or the axe
    // call below grades a pristine field and proves nothing) and it must be REFERENCED (the whole
    // point — an unlinked <mat-error> is visually fine and inaudible).
    expect(error?.textContent?.trim()).toBe('Email is required');
    expect(input.getAttribute('aria-describedby') ?? '').toContain(error!.id);

    await expectNoA11yViolations(fixture.nativeElement);
  });
});

// ---------------------------------------------------------------------------------------------
// A control marked touched BEFORE [formControl] binds (#741).
//
// "Pre-touch the form so every error shows at once" is a normal consumer pattern — a validate-on-
// load screen, or a restored half-filled form. It used to render nothing: no red outline, no
// <mat-error>, and `aria-invalid="false"` on a field the model considered invalid. Invisible, not
// noisy, which is the worst shape for an a11y defect.
//
// The cause is an ordering seam, and it is worth naming because the symptom points at the wrong
// layer. `touched` is NOT lost — measured true on the control throughout. `ngDoCheck` is a hook of
// the PARENT view, so on the first pass it runs BEFORE the subclass template applies
// `[errorStateMatcher]` to the inner Material control; `updateErrorState()` then consults Material's
// DI-default matcher against the inner control's own (absent) NgControl and latches `false`. The
// hosts below differ ONLY in when they touch, which is what isolates the seam: touching later emits
// on `control.events`, and that emission is the CD nudge that repairs it by accident.
// ---------------------------------------------------------------------------------------------
@Component({
  imports: [CaeInput, ReactiveFormsModule],
  template: `
    <cae-input
      [formControl]="ctrl"
      ariaLabel="Email address"
      [required]="true"
      [errorMessages]="messages"
    />
  `,
})
class PreTouchedInputHost {
  readonly ctrl = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly messages = { required: 'Email is required' };
  constructor() {
    // In the constructor ON PURPOSE: before the view exists, so before FormControlDirective binds.
    this.ctrl.markAsTouched();
  }
}

@Component({
  imports: [CaeSelect, ReactiveFormsModule],
  template: `
    <cae-select
      [formControl]="ctrl"
      ariaLabel="Country"
      [required]="true"
      [options]="options"
      [errorMessages]="messages"
    />
  `,
})
class PreTouchedSelectHost {
  readonly ctrl = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly options = [{ value: 'us', label: 'United States' }];
  readonly messages = { required: 'Country is required' };
  constructor() {
    this.ctrl.markAsTouched();
  }
}

describe('CaeFormFieldControlBase — a control pre-touched before binding (#741)', () => {
  it('surfaces the error state on cae-input, with no repair emission to lean on', async () => {
    const fixture = TestBed.createComponent(PreTouchedInputHost);
    const ctrl = fixture.componentInstance.ctrl;

    // PREMISE, pinned so this test cannot quietly decay into a duplicate of the #773 one above.
    // It is only a #741 test while BOTH hold: the control is already touched before the first CD,
    // and it emits nothing afterwards. That second half is the actual mechanism — `wireErrorState`
    // turns a `control.events` emission into a CD nudge, so an emission here would repair the
    // state for reasons having nothing to do with the fix under test. Counting to zero is what
    // proves the recompute did the work.
    expect(ctrl.touched).toBe(true);
    let emissions = 0;
    const sub = ctrl.events.subscribe(() => emissions++);

    fixture.detectChanges();
    await fixture.whenStable();
    sub.unsubscribe();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const error = fixture.nativeElement.querySelector('mat-error') as HTMLElement | null;

    expect(emissions).toBe(0);
    expect(error?.textContent?.trim()).toBe('Email is required');
    expect(input.getAttribute('aria-describedby') ?? '').toContain(error!.id);
    // A required-empty matInput suppresses `aria-invalid` by design (Book 07 §3.3), so the visual
    // invalid state is what distinguishes "bridged" from "still pristine" on this control.
    expect(fixture.nativeElement.querySelector('.mat-form-field-invalid')).not.toBeNull();
  });

  it('reaches a second subclass with a different inner control (cae-select)', async () => {
    // The fix lives in the shared base, so it must hold for a control whose inner Material widget
    // is NOT matInput. mat-select also reflects `aria-invalid` unconditionally, which gives this
    // arm an assertion the input arm cannot make.
    const fixture = TestBed.createComponent(PreTouchedSelectHost);
    fixture.detectChanges();
    await fixture.whenStable();

    const trigger = fixture.nativeElement.querySelector('mat-select') as HTMLElement;
    const error = fixture.nativeElement.querySelector('mat-error') as HTMLElement | null;

    expect(error?.textContent?.trim()).toBe('Country is required');
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
  });
});
