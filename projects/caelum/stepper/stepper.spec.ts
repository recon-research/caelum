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

  // The BOUNDARY of the snap-back contract, pinned deliberately (#607) — the counterpart to the
  // signal-backed test above, on the same refusal.
  //
  // Measured cause, which corrects the one #607 was filed with. It is NOT that the input round-trips
  // 1 -> 0 -> 1 and is deduped: instrumenting both the binding expression and the reconciler shows
  // the expression is evaluated exactly three times (0, 1, 0) — all during the FIRST attempt, which
  // settles the input back to 0 — and then never again. The second `host.index = 1` is a plain
  // property write in a zoneless app: nothing marks the view dirty, so Angular never re-evaluates
  // the binding and never pushes the value. `markForCheck()` before `detectChanges()` does not
  // change it either (measured).
  //
  // So the request never reaches the component, and no emit rule can report a value it was never
  // given — the reconciler does not run at all. This is a host-side change-detection contract, not
  // a stepper defect; the supported shape is the signal-backed host above. Asserting what Angular
  // actually does, not what we want. If a future Angular pushes the second write this SHOULD fail;
  // update it then, do not delete it.
  it('cannot report a repeated refused request to a plain-property host (#607)', async () => {
    host.index = 1; // step 0 is required and empty → refused
    await settle();
    expect(host.index).toBe(0); // first attempt: refused AND reported

    host.index = 1; // asked again, with no signal and nothing marking the view dirty
    await settle();
    expect(host.index).toBe(1); // never re-pushed, so never re-reported
    // Step bodies stamp eagerly, so presence in the DOM says nothing about selection — the header's
    // aria-selected is the real signal. The consumer's property now sits on a step that is NOT
    // shown, which is the whole cost of the boundary.
    const selected = Array.from(el().querySelectorAll('mat-step-header')).findIndex(
      (h) => h.getAttribute('aria-selected') === 'true',
    );
    expect(selected).toBe(0);
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

// A step list where the step the user sits on is marked NON-editable — ordinary wizard authoring
// ("you can't come back to this one"). CDK gates every BACKWARD assignment on
// `index >= selectedIndex || steps[index].editable`, and that clause is NOT limited to linear
// steppers, so it applies to the identity repair too (#608 / #605).
@Component({
  imports: [CaeStepper, CaeStep],
  template: `
    <cae-stepper [selectedIndex]="idx()" (selectedIndexChange)="idx.set($event); seen.push($event)">
      @for (s of steps(); track s) {
        <cae-step [label]="s" [editable]="s !== 'Four'"
          ><p>{{ s }}</p></cae-step
        >
      }
    </cae-stepper>
  `,
})
class NonEditableHost {
  readonly idx = signal(0);
  readonly steps = signal(['One', 'Two', 'Three', 'Four', 'Five', 'Six']);
  readonly seen: number[] = [];
}

// Outer stepper whose step bodies each contain a nested cae-stepper. VERTICAL, because that is
// the arrangement where Material interleaves header/body pairs and a positional header lookup can
// land on an inner stepper's header (#604).
@Component({
  imports: [CaeStepper, CaeStep],
  template: `
    <cae-stepper
      class="outer"
      orientation="vertical"
      [selectedIndex]="idx()"
      (selectedIndexChange)="idx.set($event)"
    >
      @for (s of steps(); track s) {
        <cae-step [label]="s">
          <cae-stepper orientation="vertical">
            <cae-step label="Inner A"><p>a</p></cae-step>
            <cae-step label="Inner B"><p>b</p></cae-step>
          </cae-stepper>
        </cae-step>
      }
    </cae-stepper>
  `,
})
class NestedHost {
  readonly idx = signal(0);
  readonly steps = signal(['One', 'Two', 'Three', 'Four']);
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

  // #608 needs to assert WHICH step is showing, not which index — the whole bug is that the index
  // is preserved while the step under it changes, so an index-only assertion cannot see it.
  const selectedLabel = (): string | null =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-step-header'))
      .find((h) => h.getAttribute('aria-selected') === 'true')
      ?.querySelector('.mat-step-text-label')
      ?.textContent?.trim() ?? null;

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

  // #608: the shrink repair above is index-POSITIONAL, which is only equivalent to "the user's step"
  // when the removal happens at or after their index. Remove steps BEFORE it and every surviving
  // index shifts down, so preserving the number silently swaps the content underneath the user —
  // and because the index never falls out of range, neither CDK's decrement handler nor the clamp
  // fires, so nothing is emitted either. The template tracks by step identity, so the reconciler
  // can re-derive the index from the step the user was actually on.
  it('follows the user’s STEP when a removal before it shifts the indices (#608)', async () => {
    host.steps.set(['One', 'Two', 'Three', 'Four', 'Five', 'Six']);
    await settle();
    const headers = (): HTMLElement[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    headers()[3].click(); // user navigates to 'Four'; host.idx stays 0
    await settle();
    expect(selectedLabel()).toBe('Four');

    host.steps.set(['Three', 'Four', 'Five', 'Six']); // drop the two LEADING steps
    await settle();
    // Without the identity repair index 3 survives and now points at 'Six'.
    expect(selectedLabel()).toBe('Four');
    expect(selectedHeader()).toBe(1);
    expect(outOfBounds()).toEqual([]);
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

  // The converse of the steal test above (#604). When the header the user was actually ON is
  // destroyed by the list change, the browser parks focus on <body> and neither CDK nor Material
  // moves it: `_updateSelectedItemIndex` only focuses via `setActiveItem` when `_containsFocus()`
  // is true, and by then focus has already left the stepper. WCAG 2.4.3 — the next Tab restarts
  // from the top of the document.
  it('restores focus to the live step when the focused header is destroyed', async () => {
    const f = TestBed.createComponent(TwoWayHost);
    const twoWay = f.componentInstance;
    document.body.appendChild(f.nativeElement);
    f.detectChanges();
    await f.whenStable();

    const headers = (): HTMLElement[] =>
      Array.from((f.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    headers()[3].focus(); // user is ON the last header
    expect(headers().indexOf(document.activeElement as HTMLElement)).toBe(0 + 3);

    twoWay.steps.set(['One', 'Two']); // destroys the header holding focus
    f.detectChanges();
    await f.whenStable();

    // Pinned, not just "some header": a loose assertion cannot tell a correct restore from an
    // arbitrary survivor. Selection stays 0 here, so header 0 is CDK's tab stop.
    expect(document.activeElement).not.toBe(document.body);
    expect(headers().indexOf(document.activeElement as HTMLElement)).toBe(0);
  });

  // The restore must not fire when something else legitimately holds focus. A user who tabbed out
  // of the stepper before the list changed keeps their place — the remembered header is destroyed,
  // but nothing was stranded, so moving focus back would be a 3.2.5 steal in the opposite
  // direction. `activeElement === body` is what separates "nothing has focus" from "someone does".
  it('does not pull focus back from another widget when the remembered header is destroyed', async () => {
    const f = TestBed.createComponent(TwoWayHost);
    const twoWay = f.componentInstance;
    document.body.appendChild(f.nativeElement);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    f.detectChanges();
    await f.whenStable();

    const headers = (): HTMLElement[] =>
      Array.from((f.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    headers()[3].focus(); // user was in the stepper…
    outside.focus(); // …then tabbed away to something else entirely

    twoWay.steps.set(['One', 'Two']); // destroys the header they had been on
    f.detectChanges();
    await f.whenStable();

    expect(document.activeElement).toBe(outside); // still theirs
    outside.remove();
  });

  // The other half of `isConnected`: a user who deliberately parked focus (blurred to the page)
  // must not be pulled back into the stepper by an unrelated list change. A parked element is
  // still CONNECTED, whereas a destroyed one is not — `activeElement === body` is true in both
  // cases, so it cannot tell them apart on its own.
  it('does not grab focus when the user parked it and the list merely changes', async () => {
    const f = TestBed.createComponent(TwoWayHost);
    const twoWay = f.componentInstance;
    document.body.appendChild(f.nativeElement);
    f.detectChanges();
    await f.whenStable();

    const headers = (): HTMLElement[] =>
      Array.from((f.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    headers()[0].focus();
    (document.activeElement as HTMLElement).blur(); // deliberate park; header 0 still exists
    expect(document.activeElement).toBe(document.body);

    twoWay.steps.set(['One', 'Two', 'Three', 'Four', 'Five']); // grow — nothing destroyed
    f.detectChanges();
    await f.whenStable();

    expect(document.activeElement).toBe(document.body); // stayed parked
  });

  // A nested cae-stepper's headers live in the OUTER host's subtree (measured: 12 matches for a
  // 4-step outer stepper), so a positional lookup has to be scoped to our own mat-stepper. This is
  // VERTICAL on purpose: horizontal emits every outer header before any body, which makes a bare
  // lookup accidentally correct, while vertical interleaves header/body pairs and exposes it.
  it('restores focus to its OWN header, not a nested stepper’s (vertical)', async () => {
    const f = TestBed.createComponent(NestedHost);
    const nested = f.componentInstance;
    document.body.appendChild(f.nativeElement);
    f.detectChanges();
    await f.whenStable();

    const outerHost = (f.nativeElement as HTMLElement).querySelector('.outer') as HTMLElement;
    const ownStepper = outerHost.querySelector('mat-stepper');
    const ownHeaders = (): HTMLElement[] =>
      Array.from(outerHost.querySelectorAll<HTMLElement>('mat-step-header')).filter(
        (h) => h.closest('mat-stepper') === ownStepper,
      );

    // The restore target must be index >= 1, or the lookup lands on our header 0 either way and
    // the scoping has nothing to prove: DOM order here is outer0, inner0a, inner0b, outer1, …
    // so an UNSCOPED headers[2] is an inner stepper's header, while a scoped one is outer step 3.
    nested.idx.set(2);
    f.detectChanges();
    await f.whenStable();
    expect(ownHeaders().indexOf(document.activeElement as HTMLElement)).toBe(-1);

    ownHeaders()[3].focus(); // user on the outer stepper's last header
    nested.steps.set(['One', 'Two', 'Three']); // destroys it; selection 2 stays valid
    f.detectChanges();
    await f.whenStable();

    const active = document.activeElement as HTMLElement;
    expect(active).not.toBe(document.body);
    // The focused header must be one of OURS, not an inner stepper's.
    expect(ownHeaders()).toContain(active);
    expect(ownHeaders().indexOf(active)).toBe(2);
  });

  // The safety property of the restore, and the reason it targets `tabindex="0"` rather than the
  // selected index. Arrow keys move CDK's FocusKeyManager WITHOUT changing selection, so arrowing
  // to the last header and then shrinking destroys the key manager's active item while leaving the
  // selection valid — a no-op repair. CDK never re-syncs (`_itemsChanged` only remaps when the
  // active item survives), and `_onKeydown` does `selectedIndex = activeItemIndex`, so handing the
  // user any header there makes Enter re-throw the out-of-bounds error #592 exists to prevent
  // (measured before this guard: `oob: 1`). No header carries `tabindex="0"` in that state, so the
  // restore finds nothing and declines. The residual strand is #611.
  it('declines to restore into a desynced key manager rather than arming an Enter crash', async () => {
    const f = TestBed.createComponent(TwoWayHost);
    const twoWay = f.componentInstance;
    document.body.appendChild(f.nativeElement);
    f.detectChanges();
    await f.whenStable();

    const headers = (): HTMLElement[] =>
      Array.from((f.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    headers()[0].focus();
    for (let i = 0; i < 3; i++) {
      // ArrowRight: CDK reads keyCode, not key.
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }),
      );
      f.detectChanges();
      await f.whenStable();
    }
    expect(headers().indexOf(document.activeElement as HTMLElement)).toBe(3);

    twoWay.steps.set(['One', 'Two']); // destroys the key manager's active header; selection 0 holds
    f.detectChanges();
    await f.whenStable();
    expect(headers().every((h) => h.getAttribute('tabindex') === '-1')).toBe(true); // desynced (#611)
    expect(headers().indexOf(document.activeElement as HTMLElement)).toBe(-1); // declined

    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }),
    );
    f.detectChanges();
    await f.whenStable();
    expect(outOfBounds()).toEqual([]); // the crash stays unreachable
  });

  // The marker is single-slot: once the element it points at is detached, it is spent whether or
  // not the restore fired. Leaving it armed lets a LATER, unrelated change yank focus into the
  // stepper long after the destruction — the user tabbed away, clicked the page background, and
  // then a poll refreshed the steps. That is a WCAG 3.2.5 steal with no user action at all.
  it('does not yank focus in on a later change after declining an earlier restore', async () => {
    const f = TestBed.createComponent(TwoWayHost);
    const twoWay = f.componentInstance;
    document.body.appendChild(f.nativeElement);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    f.detectChanges();
    await f.whenStable();

    const headers = (): HTMLElement[] =>
      Array.from((f.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    headers()[3].focus();
    outside.focus(); // tabbed away…

    twoWay.steps.set(['One', 'Two']); // …destroys the remembered header; restore declines
    f.detectChanges();
    await f.whenStable();
    expect(document.activeElement).toBe(outside);

    outside.blur(); // user clicks the page background
    expect(document.activeElement).toBe(document.body);

    twoWay.steps.set(['One', 'Two', 'Three']); // an unrelated later change
    f.detectChanges();
    await f.whenStable();

    expect(document.activeElement).toBe(document.body); // stepper did NOT grab focus
    outside.remove();
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

  // #606: `lastRequested` records what was ASKED, not whether it was MET, so a request the list was
  // too short to satisfy was consumed by the clamp and never re-applied — the growth that made it
  // valid found `Object.is(5, 5)` and followed the current step instead. The list never passes
  // through empty here, which is what separates this from the async-list test above: that one is
  // re-armed by the zero-step branch, this one had no re-arm at all.
  it('applies a clamped index once the step list grows into it (#606)', async () => {
    host.steps.set(['One']);
    host.idx.set(5);
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(0); // clamped: there is no step 5 yet

    host.steps.set(['One', 'Two', 'Three', 'Four', 'Five', 'Six']);
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(5); // the ask stood, and the list grew into it
    expect(selectedLabel()).toBe('Six');
    expect(host.seen).toEqual([0, 5]); // the clamp, then the satisfied request
  });

  // A two-chunk async load, the shape the ticket calls out: the pending 5 is consumed by the
  // 3-step chunk (clamped to 2) and must survive to be re-applied by the 6-step one. Chasing has
  // to persist across an ARBITRARY number of partial satisfactions, not just re-arm once.
  it('keeps chasing a clamped index across a chunked load (#606)', async () => {
    host.steps.set([]);
    host.idx.set(5);
    await settle();
    host.steps.set(['One', 'Two', 'Three']);
    await settle();
    expect(selectedHeader()).toBe(2); // still short — clamped again, still unmet

    host.steps.set(['One', 'Two', 'Three', 'Four', 'Five', 'Six']);
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(5);
  });

  // The counterweight, and the reason the ticket's obvious one-liner was NOT taken. Re-arming on
  // every clamp re-asserts the declared index forever, so a consumer using `[selectedIndex]="99"`
  // as "last step" yanks the user back on every later growth — exactly what #598 locked out. The
  // landing step is the discriminator: while the selection sits where the clamp put it the request
  // still stands, and the moment the user navigates it is stale. Without that guard this test fails
  // and the one above passes, which is the whole difficulty of #606 in one pair.
  it('drops a clamped index once the user navigates away from where it landed (#606)', async () => {
    const headers = (): HTMLElement[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    host.steps.set(['One', 'Two', 'Three']);
    host.idx.set(99); // "last step", clamped to 2
    await settle();
    expect(selectedHeader()).toBe(2);

    headers()[0].click(); // the user has their own opinion now
    await settle();
    expect(selectedHeader()).toBe(0);

    host.steps.set(['One', 'Two', 'Three', 'Four', 'Five', 'Six']);
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(0); // NOT yanked to the new last step
  });

  // The other half of the arming condition: only an aim taken from the CONSUMER's request may
  // latch. On a multi-step shrink that removes the selected step, CDK decrements its own index by
  // exactly one regardless of the new length, so the fallback aim is itself out of range — and
  // arming from that would hold CDK's stale position as if the consumer had asked for it, then
  // teleport the user there when the list grew back. A filter collapsing and clearing is the
  // ordinary shape. Without the `changed || unmet` guard this is the only failing test (measured).
  it('does not latch CDK’s stale index when a shrink removes the selected step (#606)', async () => {
    const headers = (): HTMLElement[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    const six = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];
    host.steps.set(six);
    await settle();
    headers()[5].click(); // the user is on 'Six'; the bound index stays 0 (one-way)
    await settle();
    expect(selectedLabel()).toBe('Six');

    host.steps.set(['One', 'Two']); // filter collapses the list; 'Six' is gone
    await settle();
    expect(selectedLabel()).toBe('Two'); // positional repair, the pre-existing behaviour

    host.steps.set(six); // filter cleared
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedLabel()).toBe('Two'); // followed their step, not CDK's stale 4
  });

  // `Infinity` can never be SATISFIED — it clamps to the last step at every length — so it is not
  // a pending request, just a permanently out-of-contract one, and it must not re-assert on a
  // structural change. Same principle the NaN test above locks, and the reason the arming condition
  // carries `Number.isFinite`. Deliberately no navigation here: once the user moves, the landing-step
  // guard drops the request on its own and this would pass with or without the finite check — the
  // mutant survives that version (measured). The teeth are in staying put.
  it('does not latch a permanently-bound Infinity onto a growing step list (#606)', async () => {
    host.idx.set(Infinity);
    await settle();
    expect(selectedHeader()).toBe(2); // 3 steps: clamped to the last

    host.steps.set(['One', 'Two', 'Three', 'Four']);
    await settle();
    expect(outOfBounds()).toEqual([]);
    expect(selectedHeader()).toBe(2); // followed their step, NOT dragged to the new last
    expect(selectedLabel()).toBe('Three');
  });
});

// The BOUNDARY of the #608 fix, pinned deliberately. CDK gates every backward assignment on
// `index >= selectedIndex || steps[index].editable` (cdk/fesm2022/stepper.mjs:411) and that clause
// is NOT limited to linear steppers — so when the step the user sits on is `[editable]="false"`,
// the identity repair is refused and #608's symptom survives. There is no public seam that reaches
// past the gate (`_updateSelectedItemIndex` is private), so this asserts what CDK actually does
// rather than what we want. It is the CONFIRMED repro for #605, which was filed as plausible and
// unverified — and confirms it is reachable without `linear`, which that ticket did not expect.
// If #605 is ever fixed this test SHOULD fail; update it then, do not delete it.
describe('CaeStepper (identity repair refused by CDK — #605 residual)', () => {
  it('cannot follow the user’s step when that step is [editable]="false"', async () => {
    await TestBed.configureTestingModule({ imports: [NonEditableHost] }).compileComponents();
    const fixture = TestBed.createComponent(NonEditableHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    const headers = (): HTMLElement[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-step-header'));
    const label = (): string | null =>
      headers()
        .find((h) => h.getAttribute('aria-selected') === 'true')
        ?.querySelector('.mat-step-text-label')
        ?.textContent?.trim() ?? null;

    headers()[3].click(); // user navigates to the non-editable 'Four'
    fixture.detectChanges();
    await fixture.whenStable();
    expect(label()).toBe('Four');

    host.steps.set(['Three', 'Four', 'Five', 'Six']); // drop the two LEADING steps
    fixture.detectChanges();
    await fixture.whenStable();

    // Wanted: 'Four'. Actual: CDK refuses the backward move to index 1 and stays on 3 — and emits
    // nothing, so the consumer is not even told the content changed underneath them (#605).
    expect(label()).toBe('Six');
    expect(host.seen).toEqual([3]);
  });
});
