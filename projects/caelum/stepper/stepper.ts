import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  contentChildren,
  effect,
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
      (selectedIndexChange)="selectedIndexChange.emit($event)"
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
  /** Active step index. Two-way bindable via `[(selectedIndex)]`. */
  readonly selectedIndex = input(0);
  /**
   * Emits the active step index. Fires on a genuine change (header click or accepted move) AND,
   * for `[(selectedIndex)]` correctness, re-emits the UNCHANGED current index when a linear move
   * is refused — so a pure `(selectedIndexChange)` listener (e.g. analytics) may observe a
   * reverted-index event on a refused advance; treat it as "this is the live index", not "the
   * step changed".
   */
  readonly selectedIndexChange = output<number>();
  /** Require each step's `stepControl` to be valid before advancing past it. */
  readonly linear = input(false, { transform: booleanAttribute });
  /** Layout axis. */
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  /** Accessible name for the stepper. */
  readonly ariaLabel = input('');

  private readonly matStepper = viewChild(MatStepper);

  constructor() {
    // Reflect the requested selectedIndex into Material, then reconcile. In linear mode Material
    // REFUSES a move onto a step whose prerequisites aren't met (and emits nothing), which would
    // leave a two-way `[(selectedIndex)]` ahead of the rendered step. Read the ACTUAL index back
    // and, on a refusal (actual !== requested), emit it so the parent's signal snaps to reality.
    // The imperative set is read/written `untracked` so the effect depends only on the input +
    // the viewChild, not on Material's own index signal (which would fight user header clicks).
    effect(() => {
      const requested = this.selectedIndex();
      const stepper = this.matStepper();
      if (!stepper) return;
      untracked(() => {
        stepper.selectedIndex = requested;
        const actual = stepper.selectedIndex;
        if (actual !== requested) this.selectedIndexChange.emit(actual);
      });
    });
  }
}
