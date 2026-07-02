import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { By } from '@angular/platform-browser';

import { CaeFormFieldControlBase } from './public-api';

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
