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

// Signal-backed twin of LinearHost. The reconciler dedupes what it tells the consumer, so a
// REPEATED attempt at the same refused step is the case most at risk of being swallowed — and it
// can only be observed through a host whose binding actually propagates the intermediate snap-back.
@Component({
  imports: [CaeStepper, CaeStep, ReactiveFormsModule],
  template: `
    <cae-stepper
      linear
      [selectedIndex]="idx()"
      (selectedIndexChange)="idx.set($event); seen.push($event)"
    >
      <cae-step label="One" [stepControl]="one"><input [formControl]="one" /></cae-step>
      <cae-step label="Two" [stepControl]="two"><input [formControl]="two" /></cae-step>
    </cae-stepper>
  `,
})
class SignalLinearHost {
  one = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  two = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly idx = signal(0);
  readonly seen: number[] = [];
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

  // Guards the `changed ||` half of the emit rule. Without it the dedupe swallows the second
  // refusal (same value reported twice) and the consumer's signal sits on a step that isn't shown.
  // Residual, verified identical against the pre-slice rule so it is NOT a regression: a
  // plain-property host misses this because its input goes 1 -> 0 -> 1 between change-detection
  // runs, so the reconciler never re-runs at all — see #607.
  it('snaps back on every repeated attempt at a refused step (signal-backed host)', async () => {
    const f = TestBed.createComponent(SignalLinearHost);
    const sig = f.componentInstance;
    f.detectChanges();
    await f.whenStable();

    sig.idx.set(1); // step 0 is required and empty → refused
    f.detectChanges();
    await f.whenStable();
    expect(sig.idx()).toBe(0);

    sig.idx.set(1); // tries again, still invalid
    f.detectChanges();
    await f.whenStable();
    expect(sig.idx()).toBe(0); // told again, not left sitting on 1
    expect(sig.seen).toEqual([0, 0]);
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

// A real two-way `[(selectedIndex)]` consumer. The one-way BoundsHost cannot see a divergence:
// its signal never tracks what the stepper reports, so "parent ahead of the rendered step" is
// invisible there. CDK's shrink handler writes its index signal DIRECTLY and emits nothing, so
// only a host that feeds emissions back can prove the wrapper closes that gap.
@Component({
  imports: [CaeStepper, CaeStep],
  template: `
    <cae-stepper [selectedIndex]="idx()" (selectedIndexChange)="idx.set($event); seen.push($event)">
      @for (s of steps(); track s) {
        <cae-step [label]="s"
          ><p>{{ s }}</p></cae-step
        >
      }
    </cae-stepper>
  `,
})
class TwoWayHost {
  readonly idx = signal(0);
  readonly steps = signal(['One', 'Two', 'Three', 'Four']);
  readonly seen: number[] = [];
}

describe('CaeStepper (index bounds, #592)', () => {
  let fixture: ComponentFixture<BoundsHost>;
  let host: BoundsHost;

  // The assignment now happens in an `afterRenderEffect` (#598), so an out-of-bounds throw is
  // REPORTED to the ErrorHandler rather than propagating out of detectChanges — which is why the
  // cases below assert `outOfBounds()` alongside the rendered result. Being precise about which
  // assertion carries which case, since a vague claim here is what a later mutation check trusts:
  // for `99` / `-1` / `NaN` the `selectedHeader()` and `seen` assertions already fail without the
  // clamp (CDK throws before moving, so it stays on 0 and emits nothing) and `outOfBounds()` is
  // belt-and-braces; for the fractional case it is genuinely vacuous, because `_isValidIndex(1.5)`
  // is true and CDK never throws — that test's teeth are entirely `selectedHeader()` + `seen`.
  // Where `outOfBounds()` is the ONLY thing that catches a regression is the structural cases
  // (born-empty, grow-in-one-tick), where a swallowed throw leaves the stepper looking correct.
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
    expect(outOfBounds()).toEqual([]);
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
    // CDK's own steps.changes handler decrements the index by exactly one (2 -> 1) regardless of
    // the new length, so against a 1-step list it lands out of range and leaves NO step selected.
    // The reconciler now repairs that (#598) — it can take the step count as a dependency because
    // running after render is what makes CDK's own list agree with ours.
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(0);
    expect(host.seen).toEqual([2, 0]); // the move to 2, then the repair reporting itself
  });

  // The no-yank principle applied to the repair path. When a shrink orphans the index, the
  // reconciler clamps the index the user is ACTUALLY on, not the one the consumer last declared —
  // otherwise repairing a shrink doubles as a yank back to the declared step. Nothing else
  // separates the two: in the test above the declared and actual indices happen to clamp alike.
  it('repairs a shrink toward the user’s step, not the declared one', async () => {
    host.steps.set(['One', 'Two', 'Three', 'Four']);
    await settle();
    const headers = (): HTMLElement[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    headers()[3].click(); // user navigates to step 4; host.idx stays 0
    await settle();
    expect(selectedHeader()).toBe(3);

    host.steps.set(['One', 'Two']); // orphans the index — CDK decrements 3 -> 2, still out of range
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(1); // clamped from where the USER was, not back to the declared 0
  });

  // The other direction, and the most ordinary trigger of the three: a step list arriving from the
  // server together with a restored index. Both signals move in ONE tick, so a reconciler running
  // during change detection reads our 4 steps while CDK still reads 1 and assigns an index CDK
  // rejects — measured as a propagated `cdkStepper: Cannot assign out-of-bounds value` on main.
  it('survives the step list growing and the index moving in the same tick', async () => {
    host.steps.set(['One']);
    host.idx.set(0);
    await settle();

    host.steps.set(['One', 'Two', 'Three', 'Four']);
    host.idx.set(3); // both at once — the "load steps, restore persisted index" case
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(3);
    expect(host.seen).toEqual([3]);
  });

  // #597: distinct from the late-arrival case below, which is why this builds its OWN fixture —
  // the list must be empty at content-init, not emptied afterwards. Once CDK's ContentChildren
  // exists and is EMPTY, `_isValidIndex` is false for every index including 0, so there is nothing
  // safe to assign at all — the reconciler must skip rather than clamp.
  it('does not crash when the stepper is born with no steps and a non-zero index', async () => {
    const born = TestBed.createComponent(BoundsHost);
    born.componentInstance.steps.set([]);
    born.componentInstance.idx.set(3);
    born.detectChanges();
    await born.whenStable();

    expect(outOfBounds()).toEqual([]);
    // Nothing to select — but nothing thrown, and nothing emitted, either.
    expect(
      Array.from((born.nativeElement as HTMLElement).querySelectorAll('mat-step-header')),
    ).toEqual([]);
    expect(born.componentInstance.seen).toEqual([]);
  });

  // The counterweight to every repair above. The step count IS a dependency now, so the reconciler
  // wakes on any structural change — and must not re-assert the DECLARED index when it does, or it
  // throws a user off a step they navigated to themselves (measured during #592: click step 3, add
  // a step, snapped back to step 1). Both review lenses reached this independently. One-way binding
  // is the exposed case; a two-way binding hides it because the parent's signal tracks the move.
  // This is what the `changed` guard buys, and it must stay green alongside the shrink repair.
  it('does not yank a user off their step when the step list changes (one-way binding)', async () => {
    const headers = (): HTMLElement[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    headers()[2].click(); // user navigates to step 3 themselves; host.idx stays 0
    await settle();
    expect(selectedHeader()).toBe(2);

    host.steps.set(['One', 'Two', 'Three', 'Four']); // structural change, unrelated to navigation
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(2); // still where the user left it
    expect(host.seen).toEqual([2]); // the user's own click only — no repair, so nothing re-reported
  });

  // A NaN request that never changes must not be treated as a NEW request on every structural
  // change — that is what `Object.is` buys over `!==` (Object.is(NaN, NaN) is true). With `!==`
  // the reconciler would re-clamp to 0 on each list change and yank the user off their step.
  it('does not re-assert a permanently-bound NaN when the step list changes', async () => {
    host.idx.set(NaN);
    await settle();
    expect(selectedHeader()).toBe(0);
    const headers = (): HTMLElement[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    headers()[2].click(); // user navigates away; the bound value is still NaN
    await settle();
    expect(selectedHeader()).toBe(2);

    host.steps.set(['One', 'Two', 'Three', 'Four']);
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(2); // NaN did not re-assert
    expect(host.seen).toEqual([0, 2]); // the initial NaN snap-back, then the user's own click
  });

  // Both review lenses found this independently, and it was confirmed by measurement: a repair
  // that reports nothing leaves a two-way binding permanently ahead of what is rendered. CDK's
  // shrink handler sets its index signal directly (no emit), and when its `-1` decrement lands on
  // a VALID index the wrapper's clamp is a no-op — so without an explicit report nobody tells the
  // consumer. Shrink-by-one from the end is the most ordinary shrink there is.
  it('reports a repaired index so a two-way binding cannot silently diverge', async () => {
    const f = TestBed.createComponent(TwoWayHost);
    const twoWay = f.componentInstance;
    f.detectChanges();
    await f.whenStable();

    twoWay.idx.set(3);
    f.detectChanges();
    await f.whenStable();

    twoWay.steps.set(['One', 'Two', 'Three']); // 4 -> 3: CDK decrements to 2, which is IN range
    f.detectChanges();
    await f.whenStable();

    const rendered = Array.from(
      (f.nativeElement as HTMLElement).querySelectorAll('mat-step-header'),
    ).findIndex((h) => h.getAttribute('aria-selected') === 'true');
    expect(rendered).toBe(2);
    expect(twoWay.idx()).toBe(2); // parent agrees with the screen
    expect(twoWay.seen).toEqual([3, 2]); // the move, then the repair — reported exactly once
  });

  // The counterweight to the repair. CDK focuses the newly-selected header whenever focus is inside
  // the stepper, so repairing an orphaned index moved the user's focus to a step they never chose
  // (WCAG 3.2.5) — measured as focus jumping header 0 -> header 1. Focus and selection legitimately
  // diverge in a stepper: arrows move focus only, Enter selects.
  it('leaves focus where the user put it when a repair moves the selection', async () => {
    const f = TestBed.createComponent(TwoWayHost);
    const twoWay = f.componentInstance;
    document.body.appendChild(f.nativeElement); // focus is only real on an attached fixture
    f.detectChanges();
    await f.whenStable();

    twoWay.idx.set(3); // selection on the last step
    f.detectChanges();
    await f.whenStable();

    const headers = (): HTMLElement[] =>
      Array.from((f.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    headers()[0].focus(); // focus diverges from selection; jsdom click() does NOT focus
    expect(headers().indexOf(document.activeElement as HTMLElement)).toBe(0);

    twoWay.steps.set(['One', 'Two']); // orphans the index; header 0 SURVIVES holding focus
    f.detectChanges();
    await f.whenStable();

    expect(headers().indexOf(document.activeElement as HTMLElement)).toBe(0); // not stolen
    const rendered = headers().findIndex((h) => h.getAttribute('aria-selected') === 'true');
    expect(rendered).toBe(1); // ...and the repair still happened
  });

  it('keeps a pending index when the step list arrives late (async step list)', async () => {
    host.steps.set([]);
    host.idx.set(2);
    await settle();
    expect(outOfBounds()).toEqual([]);
    // With zero steps CDK rejects even 0, so the reconciler skips and RE-ARMS. Because it takes the
    // step count as a dependency it re-runs when the steps land, and applies the pending index then
    // — the request is no longer smuggled into CDK's pre-init `else` branch to be clamped later.
    host.steps.set(['One', 'Two']);
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(1);
  });
});
