import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CaeButton } from 'caelum/button';
import { CaeInput, type CaeErrorMessages } from 'caelum/input';
import {
  CAE_DIALOG_DATA,
  CaeDialogActions,
  CaeDialogClose,
  CaeDialogContent,
  CaeDialogTitle,
  injectCaeDialogRef,
} from 'caelum/dialog';

/** The payload `CaeDialog.open` passes in, read back via {@link CAE_DIALOG_DATA}. */
export interface RenameWorkspaceData {
  name: string;
}

/**
 * A dialog body authored as a PURE `cae-*` component — the liveness proof for #100. It reads the
 * current name via `CAE_DIALOG_DATA`, lays its content out with the `caeDialog*` directives (no
 * `@angular/material` import), validates through a `cae-input` CVA, and returns the new name two
 * ways: Cancel closes declaratively via `caeDialogClose`; Save closes programmatically through the
 * `injectCaeDialogRef` handle (so it can validate + trim first). `CaeDialog.open`'s `afterClosed()`
 * delivers whichever result to the caller (App.renameWorkspace).
 */
@Component({
  selector: 'app-rename-workspace-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    CaeInput,
    CaeButton,
    CaeDialogTitle,
    CaeDialogContent,
    CaeDialogActions,
    CaeDialogClose,
  ],
  template: `
    <h2 caeDialogTitle>Rename workspace</h2>
    <div caeDialogContent>
      <cae-input
        label="Workspace name"
        autocomplete="off"
        [formControl]="name"
        [errorMessages]="nameErrors"
      />
    </div>
    <div caeDialogActions align="end">
      <cae-button variant="text" caeDialogClose>Cancel</cae-button>
      <cae-button variant="filled" [disabled]="name.invalid" (click)="save()">Save</cae-button>
    </div>
  `,
})
export class RenameWorkspaceDialog {
  private readonly data = inject(CAE_DIALOG_DATA) as RenameWorkspaceData;
  private readonly ref = injectCaeDialogRef<string>();

  protected readonly name = new FormControl(this.data.name, {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly nameErrors: CaeErrorMessages = { required: 'A workspace name is required' };

  protected save(): void {
    if (this.name.invalid) return;
    this.ref.close(this.name.value.trim());
  }
}
