import {
  ChangeDetectionStrategy,
  Component,
  contentChildren,
  input,
  output,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';

/**
 * `cae-tab` — a single panel inside a `cae-tabs`. Its projected content is captured as a
 * `TemplateRef` (via an internal `<ng-template>`) so `cae-tabs` can hand it to Material's
 * lazily-instantiated tab body — the content isn't rendered until its tab is shown.
 * Content-projection only; no logic. Used exclusively as a child of `cae-tabs`.
 */
@Component({
  selector: 'cae-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-template #content><ng-content /></ng-template>`,
})
export class CaeTab {
  /** Plain-text tab label. */
  readonly label = input('');
  /** The panel body, captured for `cae-tabs` to project into the active `mat-tab`. */
  readonly content = viewChild.required<TemplateRef<unknown>>('content');
}

/**
 * `cae-tabs` — the Direct (1:1) wrapper over Material's `mat-tab-group`
 * (`reference/COMPARISON.md`: `p-tabs` → `cae-tabs`). Panels are declared as projected
 * `cae-tab` children (label + content), mirroring the `p-tabpanel` authoring model, and
 * rendered through `mat-tab-group`. `selectedIndex` is two-way bindable
 * (`[(selectedIndex)]`). Theme comes free through the token bridge. Zoneless-compatible:
 * `OnPush` + signal state (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTabsModule, NgTemplateOutlet],
  template: `
    <mat-tab-group
      [selectedIndex]="selectedIndex()"
      [aria-label]="ariaLabel()"
      (selectedIndexChange)="selectedIndexChange.emit($event)"
    >
      @for (tab of tabs(); track tab) {
        <mat-tab [label]="tab.label()">
          <ng-container [ngTemplateOutlet]="tab.content()" />
        </mat-tab>
      }
    </mat-tab-group>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class CaeTabs {
  /** The declared panels, collected from projected `cae-tab` children. */
  protected readonly tabs = contentChildren(CaeTab);
  /** Active tab index. Two-way bindable via `[(selectedIndex)]`. */
  readonly selectedIndex = input(0);
  /** Emits the new index when the active tab changes. */
  readonly selectedIndexChange = output<number>();
  /** Accessible name for the tab list. */
  readonly ariaLabel = input('');
}
