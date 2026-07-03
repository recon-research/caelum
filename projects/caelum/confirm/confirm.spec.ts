import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { CaeDialog } from 'caelum/dialog';
import { CaeConfirmService } from './confirm';

@Component({ template: '' })
class ConfirmHost {
  readonly confirm = inject(CaeConfirmService);
}

describe('CaeConfirmService', () => {
  let fixture: ComponentFixture<ConfirmHost>;
  let confirm: CaeConfirmService;
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;

  const surface = (): HTMLElement | null => containerEl.querySelector('mat-dialog-container');
  const acceptBtn = (): HTMLButtonElement | null =>
    containerEl.querySelector('.cae-confirm__accept button');
  const rejectBtn = (): HTMLButtonElement | null =>
    containerEl.querySelector('.cae-confirm__reject button');

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConfirmHost] }).compileComponents();
    fixture = TestBed.createComponent(ConfirmHost);
    confirm = fixture.componentInstance.confirm;
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
    fixture.detectChanges();
  });

  afterEach(() => {
    overlayContainer.ngOnDestroy();
  });

  it('opens an alertdialog rendering the header, message, and defaulted labels', async () => {
    const result = confirm.confirm({
      header: 'Delete workspace?',
      message: 'This cannot be undone.',
    });
    await settle();

    expect(surface()).not.toBeNull();
    expect(surface()!.getAttribute('role')).toBe('alertdialog');
    expect(surface()!.textContent).toContain('Delete workspace?');
    expect(surface()!.textContent).toContain('This cannot be undone.');
    // Defaults applied by the service (options carried only message + header).
    expect(acceptBtn()!.textContent).toContain('Confirm');
    expect(rejectBtn()!.textContent).toContain('Cancel');

    rejectBtn()!.click();
    await result;
  });

  it('resolves true when the accept button is clicked', async () => {
    const result = confirm.confirm({ message: 'Proceed?', acceptLabel: 'Yes' });
    await settle();
    expect(acceptBtn()!.textContent).toContain('Yes');

    acceptBtn()!.click();
    expect(await result).toBe(true);
    await settle();
    expect(surface()).toBeNull();
  });

  it('resolves false when the reject button is clicked', async () => {
    const result = confirm.confirm({ message: 'Proceed?', rejectLabel: 'No' });
    await settle();
    expect(rejectBtn()!.textContent).toContain('No');

    rejectBtn()!.click();
    expect(await result).toBe(false);
    await settle();
    expect(surface()).toBeNull();
  });

  it('resolves false when dismissed without a choice (Escape / backdrop → close(undefined))', async () => {
    const result = confirm.confirm({ message: 'Proceed?' });
    await settle();
    // Escape/backdrop routing isn't reproducible in jsdom (the #100 overlay gotcha); closeAll() closes
    // with no result — the same undefined afterClosed a dismissal produces — which must map to reject.
    TestBed.inject(MatDialog).closeAll();
    expect(await result).toBe(false);
  });

  it('wires the alertdialog aria-describedby to the message element when a header is present', async () => {
    const result = confirm.confirm({ header: 'Confirm', message: 'Are you sure?' });
    await settle();
    await settle();

    const describedBy = surface()!.getAttribute('aria-describedby');
    const message = surface()!.querySelector('.cae-confirm__message');
    expect(describedBy).toBeTruthy();
    expect(message!.id).toBe(describedBy);
    expect(message!.textContent).toContain('Are you sure?');

    rejectBtn()!.click();
    await result;
  });

  describe('config seam (spied CaeDialog.open — pure, no overlay)', () => {
    // CaeConfirmService injects the root CaeDialog singleton; spying on its `open` inspects the exact
    // CaeDialogConfig the service builds, deterministically and without opening an overlay.
    function spyOpen() {
      return vi
        .spyOn(TestBed.inject(CaeDialog), 'open')
        .mockReturnValue({ afterClosed: () => of(true) } as never);
    }

    it('focuses the reject action by default (safe default) and sets role=alertdialog', () => {
      const spy = spyOpen();
      confirm.confirm({ message: 'Delete?' });
      const config = spy.mock.calls[0][1]!;
      expect(config.role).toBe('alertdialog');
      expect(config.autoFocus).toBe('.cae-confirm__reject button');
    });

    it("focuses the accept action when defaultFocus is 'accept'", () => {
      const spy = spyOpen();
      confirm.confirm({ message: 'Delete?', defaultFocus: 'accept' });
      expect(spy.mock.calls[0][1]!.autoFocus).toBe('.cae-confirm__accept button');
    });

    it('names the dialog by its message (aria-label) when there is no header', () => {
      const spy = spyOpen();
      confirm.confirm({ message: 'Discard changes?' });
      const config = spy.mock.calls[0][1]!;
      expect(config.ariaLabel).toBe('Discard changes?');
      expect(config.ariaDescribedBy).toBeUndefined();
    });

    it('describes (not names) by the message when a header is present', () => {
      const spy = spyOpen();
      confirm.confirm({ header: 'Discard?', message: 'You have unsaved edits.' });
      const config = spy.mock.calls[0][1]!;
      expect(config.ariaLabel).toBeUndefined();
      expect(config.ariaDescribedBy).toBeTruthy();
    });

    it('forwards custom labels and appearances into the payload', () => {
      const spy = spyOpen();
      confirm.confirm({
        message: 'Delete?',
        acceptLabel: 'Delete',
        rejectLabel: 'Keep',
        acceptAppearance: 'outlined',
        rejectAppearance: 'elevated',
      });
      const data = spy.mock.calls[0][1]!.data as {
        acceptLabel: string;
        rejectLabel: string;
        acceptAppearance: string;
        rejectAppearance: string;
      };
      expect(data.acceptLabel).toBe('Delete');
      expect(data.rejectLabel).toBe('Keep');
      expect(data.acceptAppearance).toBe('outlined');
      expect(data.rejectAppearance).toBe('elevated');
    });
  });
});
