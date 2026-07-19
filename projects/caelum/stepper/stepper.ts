import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  contentChildren,
  input,
  output,
  TemplateRef,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { AbstractControl } from '@angular/forms';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';

/**
 * Clamp a consumer step index into `[0, last]` (same shape as carousel's `clampPage` / galleria's
 * `clampIndex`). Truncate FIRST, collapse only `NaN` — an up-front `Number.isFinite` gate would
 * send `Infinity` to step 0 while a merely huge `1e21` landed on the last. Why it must exist at
 * all: #592 + stepper.spec.ts.
 */
const clampStepIndex = (v: number, last: number): number => {
  const n = Math.trunc(v);
  return Math.max(0, Math.min(Number.isNaN(n) ? 0 : n, last));
};

/**
 * `cae-step` — a single step inside a `cae-stepper`. Like `cae-tab`, its projected content
 * is captured as a `TemplateRef` (via an internal `<ng-template>`) so `cae-stepper` can
 * stamp it into a Material `mat-step`. Content-projection + a plain-text `label`; no logic.
 * Used exclusively as a child of `cae-stepper`.
 */
@Component({
  selector: 'cae-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-template #content><ng-content /></ng-template>`,
})
export class CaeStep {
  /** Plain-text step label shown in the header. */
  readonly label = input('');
  /** Marks the step optional (Material renders an "Optional" caption). */
  readonly optional = input(false, { transform: booleanAttribute });
  /** Whether the user may return to this step after leaving it. Matches Material's default. */
  readonly editable = input(true, { transform: booleanAttribute });
  /**
   * The form control (or group) whose validity gates advancing PAST this step when the parent
   * `cae-stepper` is `[linear]` (Book 05 §3.5). Point it at the step's `FormGroup` for a
   * multi-field step. Omit for a step with no form — Material then completes it once visited
   * (an explicit `completed`/`hasError` override for a form-less gated step is TODO(#61)).
   */
  readonly stepControl = input<AbstractControl>();
  /** The step body, captured for `cae-stepper` to project into its `mat-step`. */
  readonly content = viewChild.required<TemplateRef<unknown>>('content');
}

/**
 * `cae-stepper` — the Direct (1:1) wrapper over Material's `mat-stepper`
 * (`reference/COMPARISON.md`: `p-stepper`/`p-steps` → `cae-stepper`). Steps are declared as
 * projected `cae-step` children (label + content), mirroring the `p-step` authoring model,
 * and rendered through `mat-stepper`. `selectedIndex` is two-way bindable
 * (`[(selectedIndex)]`), so drive navigation from a signal and/or let users click headers.
 * Theme comes free through the token bridge. Zoneless-compatible: `OnPush` + signal state
 * (provisional on #9; Book 01 §3.2).
 *
 * NOTE: unlike `cae-tabs`, Material stamps every step body eagerly (they are all in the DOM,
 * shown/hidden by selection) — a lazy step body is a later enhancement if needed.
 *
 * **Linear (validity-gated) stepping (#40).** Set `[linear]` and give each `cae-step` a
 * `stepControl` (Book 05 §3.5): Material then refuses to advance PAST a step until its
 * `stepControl` is valid, disabling the unreachable headers. A subtlety this wrapper handles:
 * on a *refused* move Material silently leaves its index put and emits nothing, so a naive
 * `[(selectedIndex)]` would leave the parent's signal ahead of the rendered step. The stepper
 * drives Material imperatively and, after each attempted move, reads the ACTUAL index back and
 * emits it on a refusal — so the two-way binding never diverges from what's on screen. With
 * `linear` off, moves are gated only by each step's `editable` flag (default `true` = all moves
 * allowed); the same read-back reconciliation applies on the rare refused (`editable=false`)
 * backward move, so a two-way binding never diverges.
 */
@Component({
  selector: 'cae-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatStepperModule, NgTemplateOutlet],
  template: `
    <mat-stepper
      [linear]="linear()"
      [orientation]="orientation()"
      [aria-label]="ariaLabel() || null"
      (selectedIndexChange)="report($event)"
    >
      @for (step of steps(); track step) {
        <mat-step
          [label]="step.label()"
          [optional]="step.optional()"
          [editable]="step.editable()"
          [stepControl]="$any(step.stepControl() || null)"
        >
          <ng-container [ngTemplateOutlet]="step.content()" />
        </mat-step>
      }
    </mat-stepper>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class CaeStepper {
  /** The declared steps, collected from projected `cae-step` children. */
  protected readonly steps = contentChildren(CaeStep);
  /**
   * Active step index. Two-way bindable via `[(selectedIndex)]`.
   *
   * Out-of-contract values are absorbed rather than thrown (CDK's own setter throws on all of
   * them): out-of-range clamps to the last step, negative and `NaN` collapse to 0, a fraction
   * truncates. With **no steps** the request is held pending and applied when they arrive.
   *
   * When the step LIST changes structurally, the stepper re-clamps **where the user currently is**
   * rather than re-asserting this value — so a shrink that orphans the index repairs itself
   * without throwing a user off a step they navigated to. That repair is reported through
   * `selectedIndexChange`, so a two-way binding stays in step with what is rendered.
   */
  readonly selectedIndex = input(0);
  /**
   * Emits the active step index. Fires on a genuine change (header click or accepted move); for
   * `[(selectedIndex)]` correctness it also re-emits the UNCHANGED current index when a linear
   * move is refused, and reports the new index when a structural step-list change forced an
   * automatic repair — neither of which the consumer initiated. So a pure `(selectedIndexChange)`
   * listener (e.g. analytics) may observe an event nobody asked for; treat every emission as
   * "this is the live index", not "the user changed step".
   */
  readonly selectedIndexChange = output<number>();
  /** Require each step's `stepControl` to be valid before advancing past it. */
  readonly linear = input(false, { transform: booleanAttribute });
  /** Layout axis. */
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  /** Accessible name for the stepper. */
  readonly ariaLabel = input('');

  private readonly matStepper = viewChild(MatStepper);

  /** Last index reflected into CDK — distinguishes a new consumer request from a mere step-list
   *  change. `null` re-arms. `Object.is` so a bound `NaN` counts as unchanged (#598). */
  private lastRequested: number | null = null;
  /** Last index the CONSUMER was told about, by either route — CDK's own output or the
   *  reconciler's. Must count both, or a repair re-announces an index CDK already reported. */
  private lastEmitted: number | null = null;

  /** Single exit for `selectedIndexChange`, so `lastEmitted` sees every emission. */
  protected report(index: number): void {
    this.lastEmitted = index;
    this.selectedIndexChange.emit(index);
  }

  constructor() {
    // Reflects `selectedIndex` into Material and reconciles back: on a REFUSED linear move Material
    // stays put and emits nothing, which would leave `[(selectedIndex)]` ahead of the rendered step.
    //
    // Runs after render because a plain `effect` sees CDK's PREVIOUS step list (measured on a 3->1
    // shrink: our count 1, CDK's still 3), so assigning against our count throws out of change
    // detection when the list grows and the index moves in one tick (#598). Render hooks don't run
    // on the server, which this accepts for now — #602 carries that trade-off.
    afterRenderEffect(() => {
      const requested = this.selectedIndex();
      const stepper = this.matStepper();
      // Tracked: a structural change is exactly when an index falls out of range. `changed` guards it.
      const count = this.steps().length;
      if (!stepper) return;
      untracked(() => {
        const last = count - 1;
        // Zero steps: `_isValidIndex` rejects EVERY index including 0, so nothing is safe to
        // assign. Skip and re-arm so a late-arriving list still gets the pending index (#597).
        if (last < 0) {
          this.lastRequested = null;
          return;
        }
        const changed = !Object.is(requested, this.lastRequested);
        this.lastRequested = requested;
        const before = stepper.selectedIndex;
        // CDK focuses the newly-selected header whenever focus is inside the stepper. On a REPAIR
        // that is a focus steal — the consumer's data changed, not the user's intent (WCAG 3.2.5) —
        // so remember where they were and put them back below if that element survived.
        const held = document.activeElement as HTMLElement | null;
        // When only the list moved, re-clamp where the user ACTUALLY is rather than re-asserting
        // the declared index. One choice, both jobs: repairs an index a shrink orphaned (CDK
        // decrements by exactly one regardless of the new length — #598) without yanking a user off
        // a header they clicked. A valid index re-clamps to itself, so CDK no-ops on it.
        stepper.selectedIndex = clampStepIndex(changed ? requested : before, last);
        const actual = stepper.selectedIndex;
        if (!changed && held?.isConnected && document.activeElement !== held) held.focus();
        // Compare against the CONSUMER's value, not the clamped one. `actual === before` matters:
        // when CDK DID move it already emitted through the template forward, so emitting again
        // double-fires (measured: [2, 2]). A repair must still report itself — CDK's shrink handler
        // writes its index signal DIRECTLY and emits nothing, so without this a shrink-by-one
        // leaves `[(selectedIndex)]` silently ahead of the rendered step. Deduped on the repair
        // path only, so one repair reports once; a new consumer request always re-reports.
        // `changed ||` matters on its own: a consumer re-requesting an index CDK keeps refusing
        // (linear, invalid prerequisite) must be told every time, even though the reported value
        // hasn't moved — otherwise their signal sits on the refused step. The dedupe applies only
        // to the repair path, where nothing new was asked for.
        if (actual !== requested && actual === before && (changed || actual !== this.lastEmitted))
          this.report(actual);
      });
    });
  }
}
