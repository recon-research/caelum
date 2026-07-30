import { Component, DestroyRef, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Overlay, OverlayContainer, type OverlayRef } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { CaeDialog } from '@recon-research/caelum/dialog';
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
  // above asserts the selector value. The focus landing itself is now verified in a real browser —
  // `confirm.browser.spec.ts` (#107), which also measured that the selector no-ops on a MISS rather
  // than falling back to first-tabbable, and that focus arrives only after the open animation (#765).

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
  /** `confirmAt` requires the caller's own DestroyRef (D-831) — the compiler enforces it. */
  readonly destroyRef = inject(DestroyRef);
}

describe('CaeConfirmService.confirmAt (anchored popup — the SAME service, #664)', () => {
  let fixture: ComponentFixture<ConfirmAtHost>;
  let confirm: CaeConfirmService;
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;
  let triggerEl: HTMLButtonElement;
  let hostDestroyRef: DestroyRef;

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
    hostDestroyRef = fixture.componentInstance.destroyRef;
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
    const result = confirm.confirmAt(
      triggerEl,
      { header: 'Delete row?', message: 'This cannot be undone.' },
      hostDestroyRef,
    );
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
    const result = confirm.confirmAt(
      triggerEl,
      { message: 'Proceed?', acceptLabel: 'Yes' },
      hostDestroyRef,
    );
    await settle();
    expect(acceptBtn()!.textContent).toContain('Yes');

    acceptBtn()!.click();
    expect(await result).toBe(true);
    await settle();
    expect(popup()).toBeNull();
  });

  it('resolves false on reject and removes the panel', async () => {
    const result = confirm.confirmAt(
      triggerEl,
      { message: 'Proceed?', rejectLabel: 'No' },
      hostDestroyRef,
    );
    await settle();
    expect(rejectBtn()!.textContent).toContain('No');

    rejectBtn()!.click();
    expect(await result).toBe(false);
    await settle();
    expect(popup()).toBeNull();
  });

  it('dismisses as a rejection on Escape', async () => {
    const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' }, hostDestroyRef);
    await settle();

    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await result).toBe(false);
    await settle();
    expect(popup()).toBeNull();
  });

  it('dismisses as a rejection on outside (backdrop) click', async () => {
    const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' }, hostDestroyRef);
    await settle();
    expect(backdrop()).not.toBeNull();

    backdrop()!.click();
    expect(await result).toBe(false);
    await settle();
    expect(popup()).toBeNull();
  });

  it('lands initial focus on the safe (reject) action by default', async () => {
    const result = confirm.confirmAt(triggerEl, { message: 'Delete?' }, hostDestroyRef);
    await settle();
    expect(document.activeElement).toBe(rejectBtn());
    rejectBtn()!.click();
    await result;
  });

  it("lands initial focus on accept when defaultFocus is 'accept'", async () => {
    const result = confirm.confirmAt(
      triggerEl,
      { message: 'Delete?', defaultFocus: 'accept' },
      hostDestroyRef,
    );
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
    const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' }, hostDestroyRef);
    await settle();
    expect(document.activeElement).not.toBe(triggerEl); // focus moved into the panel

    await closeAction();
    await result;
    await settle();
    expect(document.activeElement).toBe(triggerEl);
  });

  it('names the popup by its message (aria-label) when there is no header', async () => {
    const result = confirm.confirmAt(triggerEl, { message: 'Discard changes?' }, hostDestroyRef);
    await settle();
    expect(panel()!.getAttribute('aria-label')).toBe('Discard changes?');
    expect(panel()!.getAttribute('aria-labelledby')).toBeNull();
    rejectBtn()!.click();
    await result;
  });

  it('labels the popup by its header (aria-labelledby) and describes it by the message', async () => {
    const result = confirm.confirmAt(
      triggerEl,
      { header: 'Discard?', message: 'Unsaved edits.' },
      hostDestroyRef,
    );
    await settle();
    const labelledby = panel()!.getAttribute('aria-labelledby');
    const describedby = panel()!.getAttribute('aria-describedby');
    expect(panel()!.getAttribute('aria-label')).toBeNull();
    expect(popup()!.querySelector('.cae-confirm-popup__header')!.id).toBe(labelledby);
    expect(popup()!.querySelector('.cae-confirm-popup__message')!.id).toBe(describedby);
    rejectBtn()!.click();
    await result;
  });

  // #825 / D-831 — the disposal paths. Before this slice the ONLY way out of an anchored confirm was a
  // user response: the OverlayRef lived in the promise closure, the portal was attached with
  // `viewContainerRef = null` (so ApplicationRef owned the panel, not the caller), and the service is
  // providedIn:'root'. Caller teardown or navigation therefore left the panel AND its full-screen
  // backdrop over whatever came next, with the promise pending forever.
  describe('disposal paths (#825)', () => {
    // Vitest's spyOn RETURNS THE EXISTING SPY (with its accumulated history) when the target is already
    // mocked, and this project configures no global restore. Without this, a test that throws before its
    // own `mockRestore()` leaves the spy installed, and the next test's `mock.calls[0]` silently reads
    // the PREVIOUS test's call — passing while measuring nothing.
    afterEach(() => vi.restoreAllMocks());

    it('disposes the panel and backdrop when the caller is destroyed, resolving false', async () => {
      const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' }, hostDestroyRef);
      await settle();
      expect(popup()).not.toBeNull();
      expect(backdrop()).not.toBeNull();

      fixture.destroy();
      // Both assertions failed before the fix — the backdrop is what makes this app-breaking rather
      // than merely untidy: it is full-screen with pointer-events:auto, so the next route is unclickable.
      expect(popup()).toBeNull();
      expect(backdrop()).toBeNull();
      expect(await result).toBe(false);
    });

    it('resolves false — not a hang — when the overlay is detached by anything else', async () => {
      // The OverlayRef lives only in the promise closure, so capture it through the factory. `vi.spyOn`
      // calls through by default, so this observes the real ref rather than replacing it.
      const spy = vi.spyOn(TestBed.inject(Overlay), 'create');
      const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' }, hostDestroyRef);
      await settle();
      const overlayRef = spy.mock.results[0].value as OverlayRef;
      spy.mockRestore();

      // Stands in for a detach we didn't initiate (ApplicationRef tearing down the portal's host view).
      // Without the detachments() net this left the `await` pending forever.
      overlayRef.detach();

      expect(await result).toBe(false);
      await settle();
      expect(popup()).toBeNull();
      // The load-bearing assertion. `detach()` ALONE removes the panel and host, so `popup()` is null
      // whether or not we routed through the funnel — a bare `resolve(false)` on detachments would pass
      // both assertions above while never disposing the ref (position strategy, keyboard-dispatcher
      // registration and the teardown closure all left live: exactly #825's leak class). Only `respond`
      // restores focus, so this is what discriminates the funnel from a shortcut.
      expect(document.activeElement).toBe(triggerEl);
    });

    it('disposes on a Back/Forward navigation, which the backdrop cannot itself prevent', async () => {
      // Asserting the config we pass would be a proxy for the behaviour; the behaviour itself is
      // reachable here. The CDK subscribes `Location`, whose subject is fed from `onPopState`, which
      // BrowserPlatformLocation wires to a real `popstate` listener — and this TestBed uses the live
      // path (no provideLocationMocks). So dispatching popstate drives the whole chain end to end.
      const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' }, hostDestroyRef);
      await settle();
      expect(popup()).not.toBeNull();

      window.dispatchEvent(new PopStateEvent('popstate'));

      expect(await result).toBe(false);
      await settle();
      expect(popup()).toBeNull();
      expect(backdrop()).toBeNull();
    });

    it('refuses to open for an already-destroyed caller instead of stranding an overlay', async () => {
      // An async continuation that outlived its component. `onDestroy` on a destroyed view throws
      // NG0911, and a throw after overlay.create() would strand exactly what D-831 exists to prevent.
      fixture.destroy();
      const result = await confirm.confirmAt(triggerEl, { message: 'Proceed?' }, hostDestroyRef);
      expect(result).toBe(false);
      expect(popup()).toBeNull();
      expect(backdrop()).toBeNull();
      // The one that has teeth: `overlay.create()` appends its host to the container SYNCHRONOUSLY,
      // while the panel and backdrop only appear on `attach()`. So moving the guard below the factory
      // call would leave an orphaned host (plus live position/scroll strategies) on every call while
      // the three assertions above still passed.
      expect(containerEl.children.length).toBe(0);
    });

    it('unregisters the caller-teardown hook once the confirm settles', async () => {
      const unregister = vi.fn();
      const onDestroy = vi.spyOn(hostDestroyRef, 'onDestroy').mockReturnValue(unregister);

      const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' }, hostDestroyRef);
      await settle();
      expect(onDestroy).toHaveBeenCalledTimes(1);
      expect(unregister).not.toHaveBeenCalled();

      rejectBtn()!.click();
      await result;
      // Otherwise a long-lived component that opens many confirms accumulates one dead closure per
      // confirm, each retaining its (disposed) OverlayRef and resolver.
      expect(unregister).toHaveBeenCalledTimes(1);
      onDestroy.mockRestore();
    });
  });

  it('restores focus to the element that HELD it, not merely to the anchor', async () => {
    // Anti-vacuity guard for the `document.activeElement` preference at the top of confirmAt. Every
    // other restore test focuses the anchor itself, so `restoreTarget` and `triggerEl` coincide and
    // `const restoreTarget = triggerEl` would pass the whole suite. Here they differ while BOTH are
    // connected, which is the real shape: `confirmAt($event, …)` resolves the origin to `currentTarget`
    // — for `<cae-button>` the non-focusable host — while focus sits on its inner native control.
    const inner = document.createElement('button');
    triggerEl.appendChild(inner);
    inner.focus();
    expect(document.activeElement).toBe(inner);

    const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' }, hostDestroyRef);
    await settle();

    rejectBtn()!.click();
    await result;
    await settle();
    expect(document.activeElement).toBe(inner);
  });

  it('skips a restore target that cannot actually take focus, falling through to the anchor', async () => {
    // `isConnected` is not the same question as "can this take focus" — `.focus()` also no-ops on a
    // connected element that is disabled, hidden or `inert`. Optimistic UI is the everyday case: the
    // control that opened the confirm goes disabled while it is open (a poll tick, a websocket push).
    // jsdom models this faithfully, so the fall-through is observable here.
    const opener = document.createElement('button');
    fixture.nativeElement.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' }, hostDestroyRef);
    await settle();
    opener.disabled = true; // still connected — an isConnected-only guard would restore to it and no-op

    rejectBtn()!.click();
    await result;
    await settle();
    // Fell through to the anchor rather than stranding the user on <body>.
    expect(document.activeElement).toBe(triggerEl);
  });

  it('restores focus to the anchor when the previously-focused element was removed while open', async () => {
    // The captured restore target can be torn out mid-confirm (a list re-render, an optimistic row
    // removal). `.focus()` on a detached node silently no-ops, which would leave a keyboard user on
    // <body> at the top of the document rather than back at the anchor.
    const transient = document.createElement('button');
    fixture.nativeElement.appendChild(transient);
    transient.focus();
    expect(document.activeElement).toBe(transient);

    const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' }, hostDestroyRef);
    await settle();
    transient.remove();

    rejectBtn()!.click();
    await result;
    await settle();
    expect(document.activeElement).toBe(triggerEl);
  });

  it('declares itself modal and focusable (D-826, widened to the confirm panel in #825)', async () => {
    const result = confirm.confirmAt(triggerEl, { message: 'Proceed?' }, hostDestroyRef);
    await settle();

    // The panel ships role=alertdialog + cdkTrapFocus + a click-blocking backdrop; aria-modal is what
    // makes the a11y tree agree with that, instead of a screen-reader user reading straight past it.
    expect(panel()!.getAttribute('aria-modal')).toBe('true');
    expect(panel()!.getAttribute('tabindex')).toBe('-1');
    // Assert the PROPERTY the attribute buys, not just the attribute: tabindex exists so a click on the
    // message text or padding lands on the panel (inside the trap) instead of dropping to <body>.
    // Reading the attribute alone would pass against a panel that is still unfocusable.
    panel()!.focus();
    expect(document.activeElement).toBe(panel());

    // The new aria ships on the anchored panel, and every existing axe sweep in this file runs against
    // the CENTERED dialog — so without this the attributes go out ungraded. Scoped to the popup, since a
    // lingering panel from another test must not satisfy it.
    await expectNoA11yViolations(popup()!);

    rejectBtn()!.click();
    await result;
  });

  it('accepts a MouseEvent origin, anchoring to and restoring focus to its target', async () => {
    triggerEl.focus();
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', { value: triggerEl });
    const result = confirm.confirmAt(event, { message: 'Proceed?' }, hostDestroyRef);
    await settle();
    expect(panel()).not.toBeNull();

    rejectBtn()!.click();
    await result;
    await settle();
    expect(document.activeElement).toBe(triggerEl);
  });
});
