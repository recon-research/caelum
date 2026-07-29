/**
 * Real-browser verification for `cae-popover` (#824, via the #240 harness).
 *
 * **Why this file has to exist.** The load-bearing claim of #824's HIGH 1 is that the focus trap
 * *holds* — that Tab off the end of an open `role="dialog"` wraps back into the panel instead of
 * walking into the page behind it. That claim is **structurally unverifiable in jsdom**, and not for
 * the usual "jsdom doesn't implement focus" reason:
 *
 * CDK's `InteractivityChecker.isVisible` is `hasGeometry(el) && getComputedStyle(el).visibility ===
 * 'visible'`, and `hasGeometry` reads `offsetWidth || offsetHeight || getClientRects().length`.
 * jsdom returns `0/0/0` for **every** element (measured: `panelGeom=0/0/0` on the open panel), so
 * `isFocusable` is false for everything, `FocusTrap._getFirstTabbableElement` returns `null`, and
 * both anchor listeners no-op — *whether or not the panel carries `tabindex="0"`*. A jsdom test of
 * the wrap would therefore pass identically against the bug and against the fix.
 *
 * So jsdom pins what it can see (the anchors exist, the panel is `tabindex="0"`, `aria-modal` is
 * set) and the behaviour is pinned here.
 *
 * **The bug this guards against.** With `tabindex="-1"` the panel was not *tabbable*, so for
 * informational content with no focusable child — the shipped example and the Forge demo — the trap
 * had no target to return to: Tab reached the end anchor, the listener found nothing, and the next
 * Tab left the overlay container (last child of `<body>`) and entered page content. The backdrop
 * blocks *pointer* hit-testing only; keyboard activation does not go through hit testing, so a user
 * could operate background controls while a modal dialog was open.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';

import { CaePopover, CaePopoverTrigger } from './popover';
import { loadCaelumTheme } from '../testing/theme';

@Component({
  imports: [CaePopover, CaePopoverTrigger],
  template: `
    <button id="before" type="button">Before</button>
    <button #trigger [caePopoverTriggerFor]="pop" type="button">Open</button>
    <button id="after" type="button">After</button>
    <cae-popover #pop="caePopover" ariaLabel="Help panel" [dismissable]="dismissable()">
      @if (withButton()) {
        <button type="button" class="inner-btn">Inner</button>
      } @else {
        <!-- The canonical informational case: no focusable child at all. This is the shape the trap
             failed to hold, and the shape the Forge demo ships. -->
        <p>Keyboard shortcuts are listed here.</p>
      }
    </cae-popover>
  `,
})
class PopoverHost {
  readonly withButton = signal(false);
  readonly dismissable = signal(true);
}

describe('CaePopover (real browser)', () => {
  let fixture: ComponentFixture<PopoverHost>;
  let host: PopoverHost;
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;

  const trigger = (): HTMLButtonElement =>
    fixture.debugElement.query(By.directive(CaePopoverTrigger)).nativeElement;
  const panel = (): HTMLElement | null =>
    containerEl.querySelector<HTMLElement>('.cae-popover__panel');
  const anchors = (): HTMLElement[] =>
    Array.from(containerEl.querySelectorAll<HTMLElement>('.cdk-focus-trap-anchor'));

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [PopoverHost] }).compileComponents();
    // AFTER configureTestingModule — it creates a probe component, which instantiates the module.
    loadCaelumTheme();
    fixture = TestBed.createComponent(PopoverHost);
    host = fixture.componentInstance;
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    overlayContainer.ngOnDestroy();
  });

  async function open(): Promise<void> {
    trigger().click();
    await settle();
  }

  it('the panel is genuinely tabbable, which is what gives the anchors a target', async () => {
    await open();
    // The precondition the whole trap rests on, asserted against the REAL InteractivityChecker
    // semantics rather than the attribute: a laid-out element with tabindex >= 0.
    const p = panel()!;
    expect(p.tabIndex).toBe(0);
    expect(p.getClientRects().length).toBeGreaterThan(0);
  });

  it('wraps focus back into the panel when Tab reaches the end anchor (no focusable child)', async () => {
    await open();
    expect(panel()!.contains(document.activeElement)).toBe(true);

    // Focusing the end anchor is exactly what Tab off the last element does.
    anchors()[1].focus();
    await settle();

    // Before #824 this landed on the anchor and the NEXT Tab escaped into the page behind an open
    // role="dialog"; the panel was not tabbable, so the listener had nothing to return focus to.
    expect(panel()!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('wraps in reverse too (Shift+Tab off the first element)', async () => {
    await open();
    anchors()[0].focus();
    await settle();
    expect(panel()!.contains(document.activeElement)).toBe(true);
  });

  it('still contains focus when the panel DOES have a focusable child', async () => {
    host.withButton.set(true);
    await settle();
    await open();

    anchors()[1].focus();
    await settle();
    // The inherited-from-MatDialog case that always worked; asserted so a future "simplification"
    // that reverts tabindex can't claim this arm as evidence.
    expect(panel()!.contains(document.activeElement)).toBe(true);
  });
});
