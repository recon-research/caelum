import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { CaeDialog } from 'caelum/dialog';
import { CaeConfirmService } from './confirm';
import { expectNoA11yViolations } from '../testing/a11y';

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

  it('has no axe violations in the open confirm dialog', async () => {
    const result = confirm.confirm({
      header: 'Delete workspace?',
      message: 'This cannot be undone.',
    });
    await settle();
    expect(surface()).not.toBeNull();
    // MatDialogTitle (behind caeDialogTitle) wires the container's aria-labelledby on a deferred
    // macrotask (it avoids an ExpressionChanged error); settle()'s whenStable does not flush a bare
    // setTimeout, so flush it here — otherwise the alertdialog is nameless only in the test, not to
    // a real user (aria-dialog-name).
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await expectNoA11yViolations(containerEl);

    rejectBtn()!.click();
    await result;
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

  // NOTE: the safety-critical "initial focus lands on reject" property can't be asserted in jsdom —
  // Material's CSS-selector autoFocus is a no-op there (document.activeElement stays on <body>). It's
  // guarded structurally instead: the template class and the service's autoFocus selector are derived
  // from ONE shared constant (REJECT_CLASS/ACCEPT_CLASS) so they can't desync, and the config-seam test
  // above asserts the selector value. Real-browser focus-landing verification is filed as M4 (#107).

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

    it('leaves the confirm dismissable — disableClose stays off so Escape/backdrop reject', () => {
      const spy = spyOpen();
      confirm.confirm({ message: 'Delete?' });
      // A disableClose:true regression (a plausible copy-paste from a modal dialog) would silently stop
      // Escape/backdrop from rejecting, breaking the documented dismiss=reject contract; assert it off.
      expect(spy.mock.calls[0][1]!.disableClose).toBeFalsy();
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

@Component({ template: `<button type="button" class="trigger-btn">Delete</button>` })
class ConfirmAtHost {
  readonly confirm = inject(CaeConfirmService);
}

describe('CaeConfirmService.confirmAt (anchored popup — the SAME service, #664)', () => {
  let fixture: ComponentFixture<ConfirmAtHost>;
  let confirm: CaeConfirmService;
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;
  let triggerEl: HTMLButtonElement;

  // Scope every query to the popup PANEL (its cae-confirm-popup host), never document-wide — a lingering
  // centered dialog from another test must not satisfy a `.cae-confirm__accept` assertion (#664 criterion).
  const popup = (): HTMLElement | null => containerEl.querySelector('cae-confirm-popup');
  const panel = (): HTMLElement | null => popup()?.querySelector('[role="alertdialog"]') ?? null;
  const acceptBtn = (): HTMLButtonElement | null =>
    popup()?.querySelector('.cae-confirm__accept button') ?? null;
  const rejectBtn = (): HTMLButtonElement | null =>
    popup()?.querySelector('.cae-confirm__reject button') ?? null;
  const backdrop = (): HTMLElement | null => containerEl.querySelector('.cdk-overlay-backdrop');

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConfirmAtHost] }).compileComponents();
    fixture = TestBed.createComponent(ConfirmAtHost);
    confirm = fixture.componentInstance.confirm;
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
    document.body.appendChild(fixture.nativeElement); // attach so focus()/restore target live elements
    fixture.detectChanges();
    triggerEl = fixture.nativeElement.querySelector('.trigger-btn');
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    overlayContainer.ngOnDestroy();
  });

  it('is a method on the SAME injected service as confirm() — one confirm service, two presentations', () => {
    expect(typeof confirm.confirmAt).toBe('function');
    expect(typeof confirm.confirm).toBe('function');
    expect(confirm).toBe(fixture.componentInstance.confirm);
  });

  it('opens an anchored alertdialog with the header, message, and defaulted labels', async () => {
    const result = confirm.confirmAt(triggerEl, {
      header: 'Delete row?',
      message: 'This cannot be undone.',
    });
    await settle();

    expect(panel()).not.toBeNull();
    expect(panel()!.getAttribute('role')).toBe('alertdialog');
    expect(popup()!.textContent).toContain('Delete row?');
    expect(popup()!.textContent).toContain('This cannot be undone.');
    expect(acceptBtn()!.textContent).toContain('Confirm');
    expect(rejectBtn()!.textContent).toContain('Cancel');

    rejectBtn()!.click();
    await result;
  });

  it('resolves true on accept and removes the panel', async () => {
    const result = confirm.confirmAt(triggerEl, { message: 'Proceed?', acceptLabel: 'Yes' });
    await settle();
    expect(acceptBtn()!.textContent).toContain('Yes');

    acceptBtn()!.click();
    expect(await result).toBe(true);
    await settle();
    expect(popup()).toBeNull();
  });

  it('resolves false on reject and removes the panel', async () => {
    const result = confirm.confirmAt(triggerEl, { message: 'Proceed?', rejectLabel: 'No' });
    await settle();
    expect(rejectBtn()!.textContent).toContain('No');

    rejectBtn()!.click();
    expect(await result).toBe(false);
    await settle();
    expect(popup()).toBeNull();
  });

  it('dismisses as a rejection on Escape', async () => {
    const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' });
    await settle();

    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await result).toBe(false);
    await settle();
    expect(popup()).toBeNull();
  });

  it('dismisses as a rejection on outside (backdrop) click', async () => {
    const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' });
    await settle();
    expect(backdrop()).not.toBeNull();

    backdrop()!.click();
    expect(await result).toBe(false);
    await settle();
    expect(popup()).toBeNull();
  });

  it('lands initial focus on the safe (reject) action by default', async () => {
    const result = confirm.confirmAt(triggerEl, { message: 'Delete?' });
    await settle();
    expect(document.activeElement).toBe(rejectBtn());
    rejectBtn()!.click();
    await result;
  });

  it("lands initial focus on accept when defaultFocus is 'accept'", async () => {
    const result = confirm.confirmAt(triggerEl, { message: 'Delete?', defaultFocus: 'accept' });
    await settle();
    expect(document.activeElement).toBe(acceptBtn());
    acceptBtn()!.click();
    await result;
  });

  // The load-bearing criterion: focus returns to the trigger on EVERY close path — including the two
  // dismiss paths that are usually missed.
  it.each([
    ['accept', async () => acceptBtn()!.click()],
    ['reject', async () => rejectBtn()!.click()],
    [
      'Escape',
      async () =>
        panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    ],
    ['backdrop', async () => backdrop()!.click()],
  ] as const)('restores focus to the trigger on the %s close path', async (_label, closeAction) => {
    triggerEl.focus();
    const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' });
    await settle();
    expect(document.activeElement).not.toBe(triggerEl); // focus moved into the panel

    await closeAction();
    await result;
    await settle();
    expect(document.activeElement).toBe(triggerEl);
  });

  it('names the popup by its message (aria-label) when there is no header', async () => {
    const result = confirm.confirmAt(triggerEl, { message: 'Discard changes?' });
    await settle();
    expect(panel()!.getAttribute('aria-label')).toBe('Discard changes?');
    expect(panel()!.getAttribute('aria-labelledby')).toBeNull();
    rejectBtn()!.click();
    await result;
  });

  it('labels the popup by its header (aria-labelledby) and describes it by the message', async () => {
    const result = confirm.confirmAt(triggerEl, { header: 'Discard?', message: 'Unsaved edits.' });
    await settle();
    const labelledby = panel()!.getAttribute('aria-labelledby');
    const describedby = panel()!.getAttribute('aria-describedby');
    expect(panel()!.getAttribute('aria-label')).toBeNull();
    expect(popup()!.querySelector('.cae-confirm-popup__header')!.id).toBe(labelledby);
    expect(popup()!.querySelector('.cae-confirm-popup__message')!.id).toBe(describedby);
    rejectBtn()!.click();
    await result;
  });

  it('accepts a MouseEvent origin, anchoring to and restoring focus to its target', async () => {
    triggerEl.focus();
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', { value: triggerEl });
    const result = confirm.confirmAt(event, { message: 'Proceed?' });
    await settle();
    expect(panel()).not.toBeNull();

    rejectBtn()!.click();
    await result;
    await settle();
    expect(document.activeElement).toBe(triggerEl);
  });
});
