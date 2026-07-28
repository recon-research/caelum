/**
 * Real-browser verification for `cae-confirm` (#405, was #107).
 *
 * **The claim under test is safety-critical.** `confirm.ts` promises initial focus lands on the
 * **non-destructive** action — *"so an accidental keypress can't fire a destructive accept"*. The
 * centered `confirm()` implements that through Material's **CSS-selector `autoFocus`**, which
 * `confirm.spec.ts` records as *"a no-op in jsdom (`document.activeElement` stays on `<body>`)"*.
 * So the one property that protects a user from deleting their workspace by pressing Space had
 * never actually been observed to hold. jsdom guards it *structurally* instead — template class and
 * focus selector derive from one shared constant — which proves they cannot desync, not that the
 * selector focuses anything.
 *
 * **What the `defaultFocus: 'accept'` arms actually buy.** Reject is the **first button in DOM
 * order** in both templates, so the suspicion was that "focus landed on reject" would also pass on a
 * broken selector, via some generic first-tabbable fallback. **Measured by mutation — that suspicion
 * is wrong**, and the real table is more useful:
 *
 * | mutation | kills |
 * |---|---|
 * | selector matches nothing (`.cae-confirm__nope button`) | **all 7** — Material's CSS-selector `autoFocus` genuinely no-ops on a miss, focusing *nothing*, so the whole contract collapses rather than degrading to first-tabbable |
 * | `defaultFocus` ignored (always the reject selector) | **exactly the 2 accept arms**, one per presentation |
 *
 * So the reject arms have teeth on their own, and the accept arms are the ones that pin the *option*
 * — the realistic desync, where the config seam quietly stops steering anything. Both are needed;
 * neither is redundant.
 *
 * **Why the wait is `vi.waitFor` and not a flush.** Historically, sampling `document.activeElement`
 * after `confirm()` opened gave `sync=BODY | stable=BODY | task=BODY | raf=BODY | +50=BODY |
 * +100=BUTTON`: Material deferred `_trapFocus()` until the **open animation finished**
 * (`delayFocusTrap`), so no amount of CD flushing or microtask draining reached it — the first
 * version of this file failed on exactly that.
 *
 * **That gap is now closed (#765, fork #791).** `CaeDialog` passes `delayFocusTrap: false`, so the
 * centered confirm traps focus at content-attach and the timeline reads `sync=DIALOG` at every
 * sample. The consequence that made it worth fixing was never the timing: during the gap the modal
 * did not contain focus at all, and a Tab pressed 10 ms after open walked into the page *behind* the
 * alertdialog. That containment is pinned in `dialog/dialog.browser.spec.ts`, at the layer that owns
 * the flag.
 *
 * `focusSettled()` stays anyway, and not out of inertia: the anchored popup focuses from
 * `afterNextRender`, so this file still spans two timelines, and waiting on the *settled* state
 * rather than a tick count is what keeps a failure here reading as "focused the wrong button".
 *
 * **Focus settled ≠ render settled (#779).** `focusSettled()` is the right wait for the focus
 * assertions and the wrong one for the axe assertion. Material fires focus on the open animation's
 * *done* event, but at that instant the `.cdk-overlay-backdrop` transition is still running — and on
 * a slower runner the container and surface transitions are too. axe judges `color-contrast` from
 * composited colours, so it graded this dialog's settled **5.746:1** as **4.408** and failed CI on a
 * palette that is fine. That wait now lives inside `expectNoA11yViolations` itself
 * (`testing/animation.ts`), so this file needs no extra step and neither does the next overlay spec.
 *
 * **Why a browser.** Every assertion reads `document.activeElement` after a real overlay attach —
 * what the browser actually focused, which is the single thing jsdom cannot answer.
 *
 * Run it: `npm run test:browser`.
 */
import { Component, DestroyRef, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { vi } from 'vitest';

import { CaeConfirmService } from './confirm';
import { expectNoA11yViolations } from '../testing/a11y';
import { loadCaelumTheme } from '../testing/theme';

@Component({
  template: `<button type="button" id="trigger">Delete</button>`,
})
class ConfirmHost {
  readonly confirm = inject(CaeConfirmService);
  /** `confirmAt` requires the caller's own DestroyRef (D-831) — the compiler enforces it. */
  readonly destroyRef = inject(DestroyRef);
}

describe('CaeConfirmService (real browser)', () => {
  let fixture: ComponentFixture<ConfirmHost>;
  let confirm: CaeConfirmService;
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;

  const acceptBtn = (): HTMLButtonElement | null =>
    containerEl.querySelector('.cae-confirm__accept button');
  const rejectBtn = (): HTMLButtonElement | null =>
    containerEl.querySelector('.cae-confirm__reject button');
  const trigger = (): HTMLButtonElement =>
    (fixture.nativeElement as HTMLElement).querySelector('#trigger')!;
  const hostDestroyRef = (): DestroyRef => fixture.componentInstance.destroyRef;

  /**
   * Wait until the confirm surface owns focus, then let each test assert *which* control has it.
   * Split deliberately: this helper absorbs the timing (see the header), so a failure below reads as
   * "focused the wrong button", never as "focused nothing yet".
   */
  async function focusSettled(): Promise<void> {
    fixture.detectChanges();
    await vi.waitFor(() => expect(containerEl.contains(document.activeElement)).toBe(true));
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [ConfirmHost] }).compileComponents();
    loadCaelumTheme();
    fixture = TestBed.createComponent(ConfirmHost);
    confirm = fixture.componentInstance.confirm;
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
    fixture.detectChanges();
  });

  afterEach(() => {
    overlayContainer.ngOnDestroy();
  });

  describe('centered confirm() — Material autoFocus', () => {
    it('lands initial focus on the reject button, the safe default', async () => {
      const result = confirm.confirm({ message: 'Delete workspace?' });
      await focusSettled();

      expect(rejectBtn()).not.toBeNull();
      expect(document.activeElement).toBe(rejectBtn());

      rejectBtn()!.click();
      expect(await result).toBe(false);
    });

    it('steers focus to accept when asked, proving the selector — not DOM order — placed it', async () => {
      const result = confirm.confirm({ message: 'Delete workspace?', defaultFocus: 'accept' });
      await focusSettled();

      // The discriminating assertion of this file: accept is the SECOND button, so nothing generic
      // reaches it. If this passes, the selector is genuinely driving focus in the arm above too.
      expect(document.activeElement).toBe(acceptBtn());
      expect(document.activeElement).not.toBe(rejectBtn());

      acceptBtn()!.click();
      expect(await result).toBe(true);
    });

    it('keeps a destructive accept off the Space/Enter path from the focused default', async () => {
      // The stated threat model, end to end: focus lands somewhere, the user hits Space without
      // reading. That must resolve false. This asserts the *consequence* of the focus contract
      // rather than its mechanism, so it stays true however the focus comes to be placed.
      const result = confirm.confirm({ message: 'Delete workspace?' });
      await focusSettled();

      (document.activeElement as HTMLElement).click();
      expect(await result).toBe(false);
    });
  });

  describe('anchored confirmAt() — the panel focuses itself', () => {
    it('honours the same reject-first contract as the centered dialog', async () => {
      const result = confirm.confirmAt(
        trigger(),
        { message: 'Delete workspace?' },
        hostDestroyRef(),
      );
      await focusSettled();

      expect(document.activeElement).toBe(rejectBtn());

      rejectBtn()!.click();
      expect(await result).toBe(false);
    });

    it('steers to accept through its own selector', async () => {
      const result = confirm.confirmAt(
        trigger(),
        { message: 'Delete workspace?', defaultFocus: 'accept' },
        hostDestroyRef(),
      );
      await focusSettled();

      expect(document.activeElement).toBe(acceptBtn());

      acceptBtn()!.click();
      expect(await result).toBe(true);
    });

    it('restores focus to the trigger when it closes', async () => {
      trigger().focus();
      const result = confirm.confirmAt(
        trigger(),
        { message: 'Delete workspace?' },
        hostDestroyRef(),
      );
      await focusSettled();
      expect(document.activeElement).not.toBe(trigger());

      rejectBtn()!.click();
      await result;
      fixture.detectChanges();
      await vi.waitFor(() => expect(document.activeElement).toBe(trigger()));

      // `CaeConfirmOrigin`'s doc: "The panel positions against it AND focus restores to it on close."
      // A restore that lands on <body> instead strands a keyboard user at the top of the document.
      expect(document.activeElement).toBe(trigger());
    });
  });

  it('has no axe violations in the open confirm dialog', async () => {
    const result = confirm.confirm({
      header: 'Delete workspace?',
      message: 'This cannot be undone.',
    });
    await focusSettled();
    await expectNoA11yViolations(containerEl);

    rejectBtn()!.click();
    await result;
  });
});
