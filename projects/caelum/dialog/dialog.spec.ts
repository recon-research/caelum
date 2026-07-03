import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import {
  CAE_DIALOG_DATA,
  CaeDialog,
  CaeDialogActions,
  CaeDialogClose,
  CaeDialogConfig,
  CaeDialogContent,
  CaeDialogRef,
  CaeDialogTitle,
  injectCaeDialogRef,
} from './dialog';

interface RenameData {
  name: string;
}

/** A pure `cae-*` dialog body: title/content/actions + both declarative and programmatic close. */
@Component({
  selector: 'cae-test-dialog',
  imports: [CaeDialogTitle, CaeDialogContent, CaeDialogActions, CaeDialogClose],
  template: `
    <h2 caeDialogTitle>Rename workspace</h2>
    <div caeDialogContent>Current: {{ data.name }}</div>
    <div caeDialogActions>
      <button class="cancel" caeDialogClose>Cancel</button>
      <button class="save" [caeDialogClose]="'Renamed'">Save</button>
      <button class="async" (click)="closeLater()">Async</button>
    </div>
  `,
})
class TestDialog {
  readonly data = inject(CAE_DIALOG_DATA) as RenameData;
  readonly ref = injectCaeDialogRef<string>();
  closeLater(): void {
    this.ref.close('async-result');
  }
}

@Component({ template: '' })
class DialogHost {
  readonly dialog = inject(CaeDialog);
}

describe('CaeDialog', () => {
  let fixture: ComponentFixture<DialogHost>;
  let dialog: CaeDialog;
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;

  /** The rendered dialog surface (MatDialog attaches into the CDK overlay), or null. */
  const surface = (): HTMLElement | null => containerEl.querySelector('mat-dialog-container');
  const button = (cls: string): HTMLButtonElement | null =>
    containerEl.querySelector(`button.${cls}`);

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  const opened = (ref: CaeDialogRef): Promise<void> => firstValueFrom(ref.afterOpened());
  const closed = <R>(ref: CaeDialogRef<R>): Promise<R | undefined> =>
    firstValueFrom(ref.afterClosed());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DialogHost] }).compileComponents();
    fixture = TestBed.createComponent(DialogHost);
    dialog = fixture.componentInstance.dialog;
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
    fixture.detectChanges();
  });

  afterEach(() => {
    // Clears the overlay container outright, so cleanup doesn't depend on an async close settling.
    overlayContainer.ngOnDestroy();
  });

  it('opens a component in a dialog, rendering its body with the injected data', async () => {
    const ref = dialog.open<TestDialog, string, RenameData>(TestDialog, { data: { name: 'Acme' } });
    await opened(ref);
    await settle();
    expect(surface()).not.toBeNull();
    expect(surface()!.textContent).toContain('Rename workspace');
    expect(surface()!.textContent).toContain('Current: Acme');
  });

  it('delivers a bound caeDialogClose value to afterClosed', async () => {
    const ref = dialog.open<TestDialog, string, RenameData>(TestDialog, { data: { name: 'Acme' } });
    await opened(ref);
    await settle();

    const result = closed(ref);
    button('save')!.click();
    expect(await result).toBe('Renamed');
    await settle();
    expect(surface()).toBeNull();
  });

  it('closes with an empty-string result for a bare caeDialogClose (Material behavior — falsy)', async () => {
    const ref = dialog.open<TestDialog, string, RenameData>(TestDialog, { data: { name: 'Acme' } });
    await opened(ref);
    await settle();

    const result = closed(ref);
    button('cancel')!.click();
    // A static `caeDialogClose` attribute binds the result input to '' (not undefined) — falsy, so a
    // `result ? save : dismiss` guard still treats Cancel as a dismissal. Documented on the directive.
    expect(await result).toBe('');
  });

  it('closes programmatically via injectCaeDialogRef', async () => {
    const ref = dialog.open<TestDialog, string, RenameData>(TestDialog, { data: { name: 'Acme' } });
    await opened(ref);
    await settle();

    const result = closed(ref);
    button('async')!.click();
    expect(await result).toBe('async-result');
  });

  it('wires the surface aria-labelledby to the caeDialogTitle element', async () => {
    const ref = dialog.open<TestDialog, string, RenameData>(TestDialog, { data: { name: 'Acme' } });
    await opened(ref);
    await settle();
    // MatDialogTitle registers the label id on a microtask; a second settle guarantees it applied.
    await settle();

    const labelledBy = surface()!.getAttribute('aria-labelledby');
    const title = surface()!.querySelector('[caeDialogTitle]');
    expect(labelledBy).toBeTruthy();
    expect(title!.id).toBe(labelledBy);
  });

  it('reaches an open dialog by id and closes all', async () => {
    const ref = dialog.open<TestDialog, string, RenameData>(TestDialog, {
      id: 'rename',
      data: { name: 'Acme' },
    });
    await opened(ref);
    await settle();

    expect(dialog.getById('rename')).toBe(ref);
    expect(dialog.getById('nope')).toBeUndefined();

    const result = closed(ref);
    dialog.closeAll();
    await result;
    await settle();
    expect(surface()).toBeNull();
  });

  it('passes the full CaeDialogConfig straight through to MatDialog.open (structural subset)', () => {
    // Proves role=alertdialog and every field reach Material unchanged — the structural-subset seam.
    // CaeDialog + MatDialog are both providedIn root, so this spy sits on the exact singleton
    // CaeDialog delegates to; mockReturnValue keeps it a pure seam test (no real overlay opened).
    const spy = vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({} as never);
    const config: CaeDialogConfig<RenameData> = {
      id: 'x',
      role: 'alertdialog',
      data: { name: 'Acme' },
      disableClose: true,
      hasBackdrop: false,
      width: '400px',
      ariaLabel: 'Rename',
      autoFocus: 'dialog',
      restoreFocus: false,
      panelClass: 'cae-rename',
      closeOnNavigation: false,
    };
    dialog.open(TestDialog, config);
    expect(spy).toHaveBeenCalledWith(TestDialog, config);
  });

  it('exposes disableClose as a mutable CaeDialogRef flag; close() works regardless', async () => {
    // disableClose gates Escape/backdrop dismissal (Material's own behavior — its passthrough is
    // covered by the seam test above; the CDK keyboard routing isn't reliably reproducible in jsdom).
    // Here we cover the CaeDialogRef surface: the flag reflects the config, is mutable at runtime,
    // and programmatic close() always works.
    const ref = dialog.open<TestDialog, string, RenameData>(TestDialog, {
      data: { name: 'Acme' },
      disableClose: true,
    });
    await opened(ref);
    await settle();
    expect(ref.disableClose).toBe(true);

    ref.disableClose = false;
    expect(ref.disableClose).toBe(false);

    const result = closed(ref);
    ref.close('done');
    expect(await result).toBe('done');
    await settle();
    expect(surface()).toBeNull();
  });
});
