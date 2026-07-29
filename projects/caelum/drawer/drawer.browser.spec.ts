/**
 * Real-browser verification for `cae-drawer` (#709, via the #240 harness).
 *
 * **Why this file has to exist.** `cae-drawer`'s modal claim is that in any mode but `side` the
 * drawer is genuinely modal — Material traps focus inside it, Escape dismisses it, and focus comes
 * back to whatever opened it. None of that is verifiable in jsdom, and not for the usual "jsdom
 * doesn't do focus" reason:
 *
 * CDK's `InteractivityChecker.isVisible` is `hasGeometry(el) && …`, and `hasGeometry` reads
 * `offsetWidth || offsetHeight || getClientRects().length`. jsdom returns `0/0/0` for **every**
 * element, so `isFocusable` is false universally, `FocusTrap` has nothing to return focus to, and
 * both anchor listeners no-op. A jsdom test of "Tab wraps back into the drawer" therefore passes
 * identically against a working trap and a broken one (#824 measured exactly this).
 *
 * So `drawer.spec.ts` pins what jsdom can see — the projection wiring, the passthroughs, the
 * `role`/`aria-modal` rules — and the behaviour is pinned here.
 *
 * These also cover the two bindings that a jsdom-only suite left as *surviving* mutations:
 * `[disableClose]` and the trap itself. Both are inert in jsdom by construction.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { userEvent } from 'vitest/browser';
import { MatDrawer } from '@angular/material/sidenav';

import { CaeDrawer, CaeDrawerContainer, CaeDrawerMode } from './drawer';
import { loadCaelumTheme } from '../testing/theme';
import { animationsSettled } from '../testing/animation';

@Component({
  imports: [CaeDrawer, CaeDrawerContainer],
  template: `
    <button id="opener" type="button" (click)="opened.set(true)">Open</button>
    <button id="outside" type="button">Outside</button>
    <cae-drawer-container style="height: 300px">
      <cae-drawer
        [(opened)]="opened"
        [mode]="mode()"
        [disableClose]="disableClose()"
        ariaLabel="Main navigation"
      >
        @if (informational()) {
          <p>Nothing focusable in here at all.</p>
        } @else {
          <a id="nav-link" href="#target">Nav link</a>
        }
      </cae-drawer>
      <main id="main-content">
        <button id="inside-content" type="button">Content button</button>
      </main>
    </cae-drawer-container>
  `,
})
class DrawerHost {
  readonly opened = signal(false);
  readonly mode = signal<CaeDrawerMode>('over');
  readonly disableClose = signal(false);
  readonly informational = signal(false);
}

describe('CaeDrawer (real browser)', () => {
  let fixture: ComponentFixture<DrawerHost>;
  let host: DrawerHost;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [DrawerHost] }).compileComponents();
    // AFTER configureTestingModule — it creates a probe component, which instantiates the module.
    loadCaelumTheme();
    fixture = TestBed.createComponent(DrawerHost);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => fixture.nativeElement.remove());

  const el = (): HTMLElement => fixture.nativeElement;
  const drawer = (): HTMLElement => el().querySelector('mat-drawer')!;
  const anchors = (): HTMLElement[] =>
    Array.from(el().querySelectorAll<HTMLElement>('.cdk-focus-trap-anchor'));

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /**
   * Wait for the open/close transition to actually finish.
   *
   * Uses the repo's own `animationsSettled` rather than a fixed sleep: Material's drawer transition
   * is `transform 400ms`, so a hardcoded 450ms leaves ~12% margin, and the arm that suffers is the
   * one asserting a drawer did NOT close — under a loaded runner it goes green for the wrong
   * reason. (`MatDrawer` emits `openedChange` from `_animationEnd`, so an early assertion reads the
   * pre-change value in both worlds.)
   */
  async function flushAnimation(): Promise<void> {
    await animationsSettled(el());
    await settle();
  }

  async function open(): Promise<void> {
    el().querySelector<HTMLButtonElement>('#opener')!.click();
    await settle();
    await flushAnimation();
  }

  it('lays the drawer out, which is the precondition every focus claim rests on', async () => {
    await open();
    expect(drawer().getClientRects().length).toBeGreaterThan(0);
    expect(drawer().getAttribute('aria-modal')).toBe('true');
  });

  it('moves focus into the drawer when it opens', async () => {
    await open();
    expect(drawer().contains(document.activeElement)).toBe(true);
  });

  it('wraps focus back into the drawer when Tab reaches the end anchor', async () => {
    await open();
    const trapAnchors = anchors();
    expect(trapAnchors.length).toBeGreaterThan(0);

    // Park focus OUTSIDE first. Without this the test is inert twice over: `open()` already leaves
    // focus inside the drawer, so the post-state equals the pre-state; and a disabled trap removes
    // the anchors' `tabindex` entirely, making `.focus()` on one a silent no-op that leaves focus
    // exactly where it was — i.e. still inside. It passed with the trap switched off.
    const outside = el().querySelector<HTMLButtonElement>('#outside')!;
    outside.focus();
    expect(document.activeElement).toBe(outside);

    trapAnchors[trapAnchors.length - 1].focus();
    await settle();

    // Without a live trap focus stays on #outside and the next Tab walks the page behind an open
    // modal drawer — the #824 failure shape.
    expect(drawer().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(outside);
  });

  it('holds focus even when the drawer has NO focusable content', async () => {
    // The #824 shape exactly. Material's host binding puts tabindex="-1" on <mat-drawer>, so CDK's
    // isTabbable (tabIndex >= 0) rejects it and _getFirstTabbableElement returns null when the
    // content has nothing tabbable — an ordinary informational drawer. Both anchor listeners then
    // no-op. The container's focusable panel wrapper is what gives the trap a target.
    host.informational.set(true);
    await settle();
    await open();

    const outside = el().querySelector<HTMLButtonElement>('#outside')!;
    outside.focus();
    anchors()[anchors().length - 1].focus();
    await settle();

    expect(drawer().contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape and writes the close back through the model', async () => {
    await open();
    expect(host.opened()).toBe(true);

    await userEvent.keyboard('{Escape}');
    await flushAnimation();

    expect(host.opened()).toBe(false);
  });

  it('does not close on Escape when disableClose is set', async () => {
    host.disableClose.set(true);
    await settle();
    await open();

    await userEvent.keyboard('{Escape}');
    // Must flush: the sibling test above proves a NON-disabled drawer has reported closed by this
    // point, so waiting is what makes "still open" mean something. Asserting immediately after the
    // keypress passes in both worlds.
    await flushAnimation();

    // The [disableClose] passthrough is a mutation that SURVIVES the jsdom suite entirely — Escape
    // handling never runs there. This is the arm that gives it teeth.
    expect(host.opened()).toBe(true);
    expect(drawer().classList.contains('mat-drawer-opened')).toBe(true);
    expect(drawer().contains(document.activeElement)).toBe(true);
  });

  it('has already written the close back by the time the close animation STARTS', async () => {
    // Why an ordering oracle rather than a timing one. The defect is that `openedChange` fires from
    // `_animationEnd` (~400ms), leaving `opened` stale — so `aria-modal="true"` lingers on a
    // still-visible closing drawer, and a toggle computed from the stale value swallows the user's
    // next click. But NEITHER harness can observe that window: measured here, right after
    // {Escape} + settle() the drawer is already `mat-drawer mat-drawer-over` with no
    // `mat-drawer-animating` at all, so a wall-clock assertion passes identically with the fix
    // reverted. (Verified by mutation — it survived.)
    //
    // What IS deterministic is the ORDER. The container subscribes `(closedStart)` when its view is
    // created, before this test can subscribe, and an EventEmitter delivers in subscription order.
    // So if the write-back is wired, `opened` is already false when our handler runs; if it is not,
    // our handler sees the stale `true`.
    const matDrawer = fixture.debugElement.query(By.directive(MatDrawer))
      .componentInstance as MatDrawer;
    let openedWhenCloseStarted: boolean | null = null;
    matDrawer.closedStart.subscribe(() => (openedWhenCloseStarted = host.opened()));

    await open();
    await userEvent.keyboard('{Escape}');
    await settle();

    expect(openedWhenCloseStarted).toBe(false);
  });

  it('closes on a backdrop click and reports it, and still reports it when disableClose blocks', async () => {
    let clicks = 0;
    const container = fixture.debugElement.query(By.directive(CaeDrawerContainer));
    (container.componentInstance as CaeDrawerContainer).backdropClick.subscribe(() => clicks++);

    await open();
    el().querySelector<HTMLElement>('.mat-drawer-backdrop')!.click();
    await flushAnimation();
    expect(clicks).toBe(1);
    expect(host.opened()).toBe(false);

    // Documented contract: backdropClick fires whether or not disableClose blocked the close
    // (Material emits from _onBackdropClicked BEFORE filtering on disableClose).
    host.disableClose.set(true);
    await open();
    el().querySelector<HTMLElement>('.mat-drawer-backdrop')!.click();
    await flushAnimation();
    expect(clicks).toBe(2);
    expect(host.opened()).toBe(true);
  });

  it('restores focus to the opener when the drawer closes', async () => {
    const opener = el().querySelector<HTMLButtonElement>('#opener')!;
    opener.focus();
    await open();
    expect(drawer().contains(document.activeElement)).toBe(true);

    await userEvent.keyboard('{Escape}');
    await flushAnimation();

    expect(document.activeElement).toBe(opener);
  });

  it('does not trap focus in side mode, which is deliberately non-modal', async () => {
    host.mode.set('side');
    await settle();
    await open();

    expect(drawer().getAttribute('aria-modal')).toBeNull();
    // Named but non-modal => a region landmark, not a dialog (see roleFor).
    expect(drawer().getAttribute('role')).toBe('region');

    // A side drawer is part of the layout, so content beside it must stay reachable.
    const contentButton = el().querySelector<HTMLButtonElement>('#inside-content')!;
    contentButton.focus();
    expect(document.activeElement).toBe(contentButton);
  });
});
