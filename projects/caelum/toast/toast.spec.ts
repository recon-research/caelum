import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatSnackBar } from '@angular/material/snack-bar';

import { CaeToast, CaeToastRef } from './toast';

@Component({ template: '' })
class ToastHost {
  readonly toast = inject(CaeToast);
}

describe('CaeToast', () => {
  let fixture: ComponentFixture<ToastHost>;
  let toast: CaeToast;
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;

  /** The rendered snackbar container (MatSnackBar attaches into the CDK overlay), or null. */
  const snackBar = (): HTMLElement | null => containerEl.querySelector('mat-snack-bar-container');
  /** The snackbar's action button, if an `action` label was passed. */
  const actionButton = (): HTMLButtonElement | null =>
    containerEl.querySelector('.mat-mdc-snack-bar-action button, mat-snack-bar-container button');

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /**
   * Resolve when a toast is actually dismissed. Caelum ships without `@angular/animations` (an
   * optional peer), so MatSnackBar runs its no-animation path — but its overlay is still disposed
   * asynchronously, and `whenStable()` doesn't await that. `afterDismissed()` fires exactly when the
   * container has been removed, so it's the deterministic removal signal (animation mode aside).
   */
  function dismissed(ref: CaeToastRef): Promise<void> {
    return new Promise((resolve) => ref.afterDismissed().subscribe(() => resolve()));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ToastHost] }).compileComponents();
    fixture = TestBed.createComponent(ToastHost);
    toast = fixture.componentInstance.toast;
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
    fixture.detectChanges();
  });

  afterEach(() => {
    // ngOnDestroy clears the container element outright, so cleanup doesn't depend on a toast's
    // async dismissal completing between tests.
    overlayContainer.ngOnDestroy();
  });

  it('opens a toast rendering the message', async () => {
    toast.open('Workspace saved');
    await settle();
    expect(snackBar()).not.toBeNull();
    expect(snackBar()!.textContent).toContain('Workspace saved');
  });

  it('renders no action button for a message-only toast', async () => {
    toast.open('Just a message');
    await settle();
    expect(snackBar()).not.toBeNull();
    expect(actionButton()).toBeNull();
  });

  it('renders an action button when an action label is given', async () => {
    toast.open('Project archived', 'Undo');
    await settle();
    expect(actionButton()).not.toBeNull();
    expect(actionButton()!.textContent).toContain('Undo');
  });

  it('fires onAction when the action button is clicked', async () => {
    const ref: CaeToastRef = toast.open('Project archived', 'Undo');
    let acted = false;
    ref.onAction().subscribe(() => (acted = true));
    await settle();

    actionButton()!.click();
    await settle();
    expect(acted).toBe(true);
  });

  it('dismiss() closes the open toast', async () => {
    const ref = toast.open('Transient');
    await settle();
    expect(snackBar()).not.toBeNull();

    const done = dismissed(ref);
    toast.dismiss();
    await done;
    await settle();
    expect(snackBar()).toBeNull();
  });

  // The default-duration flip (D-15 / p-toast parity) and the explicit-override contract are
  // asserted against the passthrough config: CaeToast and MatSnackBar are both providedIn root,
  // so this spy sits on the exact singleton CaeToast injected.
  it('applies the default 5000 ms duration when no config is given', () => {
    const spy = vi.spyOn(TestBed.inject(MatSnackBar), 'open');
    toast.open('Saved');
    expect(spy).toHaveBeenCalledWith('Saved', undefined, { duration: 5000 });
  });

  it('lets an explicit duration (incl. 0 for a sticky toast) override the default', () => {
    const spy = vi.spyOn(TestBed.inject(MatSnackBar), 'open');
    toast.open('Sticky', 'Undo', { duration: 0, politeness: 'polite' });
    expect(spy).toHaveBeenCalledWith('Sticky', 'Undo', { duration: 0, politeness: 'polite' });
  });
});
