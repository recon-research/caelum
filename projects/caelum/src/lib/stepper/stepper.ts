import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  contentChildren,
  input,
  output,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatStepperModule } from '@angular/material/stepper';

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
  /** The step body, captured for `cae-stepper` to project into its `mat-step`. */
  readonly content = viewChild.required<TemplateRef<unknown>>('content');
}

/**
 * `cae-stepper` — the Direct (1:1) wrapper over Material's `mat-stepper`
 * (`reference/COMPARISON.md`: `p-stepper`/`p-steps` → `cae-stepper`). Steps are declared as
 * projected `cae-step` children (label + content), mirroring the `p-step` authoring model,
 * and rendered through `mat-stepper`. `selectedIndex` is two-way bindable
 * (`[(selectedIndex)]`), so drive navigation from a signal and/or let users click reachable
 * headers. `linear` gates forward motion (a linear stepper advances only once earlier steps
 * are complete). Theme comes free through the token bridge. Zoneless-compatible: `OnPush` +
 * signal state (provisional on #9; Book 01 §3.2).
 *
 * NOTE: unlike `cae-tabs`, Material stamps every step body eagerly (they are all in the DOM,
 * shown/hidden by selection) — a lazy step body is a later enhancement if needed.
 */
@Component({
  selector: 'cae-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatStepperModule, NgTemplateOutlet],
  template: `
    <mat-stepper
      [selectedIndex]="selectedIndex()"
      [linear]="linear()"
      [orientation]="orientation()"
      [aria-label]="ariaLabel()"
      (selectedIndexChange)="selectedIndexChange.emit($event)"
    >
      @for (step of steps(); track step) {
        <mat-step [label]="step.label()" [optional]="step.optional()" [editable]="step.editable()">
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
  /** Emits the new index when the active step changes. */
  readonly selectedIndexChange = output<number>();
  /** Layout axis. */
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  /** When true, a step can't be reached until earlier steps are complete. */
  readonly linear = input(false, { transform: booleanAttribute });
  /** Accessible name for the stepper. */
  readonly ariaLabel = input('');
}
