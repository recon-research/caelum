import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { RenameWorkspaceDialog } from './rename-workspace-dialog';

/**
 * Guards the rename dialog body's validation logic in its FAILURE state — the app.spec round-trip
 * only drives a valid name (the happy path), so without this a dropped `[disabled]` binding or a
 * removed `save()` guard (allowing an empty rename) would stay green. Instantiated directly with a
 * MAT_DIALOG_DATA payload + a MatDialogRef stub (no overlay needed).
 */
describe('RenameWorkspaceDialog', () => {
  let fixture: ComponentFixture<RenameWorkspaceDialog>;
  let el: HTMLElement;
  const close = vi.fn();

  beforeEach(async () => {
    close.mockReset();
    await TestBed.configureTestingModule({
      imports: [RenameWorkspaceDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { name: 'Acme' } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RenameWorkspaceDialog);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const input = (): HTMLInputElement => el.querySelector('input') as HTMLInputElement;
  const saveBtn = (): HTMLButtonElement =>
    Array.from(el.querySelectorAll('cae-button button')).find(
      (b) => b.textContent?.trim() === 'Save',
    ) as HTMLButtonElement;
  const cmp = (): { save(): void; name: { invalid: boolean } } =>
    fixture.componentInstance as unknown as { save(): void; name: { invalid: boolean } };

  async function setName(value: string): Promise<void> {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('pre-fills the current name and closes with the trimmed value on save', async () => {
    expect(input().value).toBe('Acme');
    await setName('  Acme Prod  ');
    cmp().save();
    expect(close).toHaveBeenCalledWith('Acme Prod');
  });

  it('disables Save, renders the required error, and no-ops save() when the name is cleared', async () => {
    await setName('');
    expect(cmp().name.invalid).toBe(true);

    // Blur touches the control so the required <mat-error> surfaces (#29 error-forwarding).
    input().dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.textContent).toContain('A workspace name is required');
    expect(saveBtn().disabled).toBe(true);

    // The guard makes save() a no-op even if the disabled button were bypassed.
    cmp().save();
    expect(close).not.toHaveBeenCalled();
  });
});
