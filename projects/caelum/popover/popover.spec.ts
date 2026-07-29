import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer, OverlayRef } from '@angular/cdk/overlay';

import {
  CAE_POPOVER_POSITIONS,
  CaePopover,
  CaePopoverTrigger,
  type CaePopoverPosition,
} from './popover';
import { expectNoA11yViolations } from '../testing/a11y';

@Component({
  imports: [CaePopover, CaePopoverTrigger],
  template: `
    <button #trigger [caePopoverTriggerFor]="pop" type="button">Open</button>
    <cae-popover
      #pop="caePopover"
      [ariaLabel]="label()"
      [position]="position()"
      [dismissable]="dismissable()"
    >
      <button
        type="button"
        class="inner-btn"
        [disabled]="disableInner()"
        [attr.cdkFocusInitial]="focusInner() ? '' : null"
      >
        Inner
      </button>
      <span class="content-marker">projected</span>
    </cae-popover>
  `,
})
class PopoverHost {
  readonly label = signal('Help panel');
  readonly position = signal<CaePopoverPosition>('bottom');
  readonly dismissable = signal(true);
  readonly focusInner = signal(false);
  readonly disableInner = signal(false);
}

describe('CaePopover + caePopoverTriggerFor', () => {
  let fixture: ComponentFixture<PopoverHost>;
  let host: PopoverHost;
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;

  const trigger = (): HTMLButtonElement =>
    fixture.debugElement.query(By.directive(CaePopoverTrigger)).nativeElement;

  // Resolve the panel from the DOM, scoped to the overlay container (not document-wide — the #664
  // criterion that a lingering panel must not satisfy an assertion).
  //
  // It must NOT be derived from `aria-controls`, as it was until #824: that attribute is rendered from
  // the component's own open state, so the oracle returned null whenever the component *believed* it was
  // closed, regardless of what was actually in the DOM. Every `expect(panel()).toBeNull()` was therefore
  // vacuous — deleting `overlayRef.dispose()` from `close()` left the pane AND its click-swallowing
  // backdrop in the container on every close, and the whole suite still passed.
  const panel = (): HTMLElement | null =>
    containerEl.querySelector<HTMLElement>('.cae-popover__panel');
  /** The id the trigger claims to control — cross-checked against the real panel, never used AS the oracle. */
  const controlledId = (): string | null => trigger().getAttribute('aria-controls');
  const backdrop = (): HTMLElement | null =>
    containerEl.querySelector<HTMLElement>('.cdk-overlay-backdrop');

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  async function open(): Promise<void> {
    trigger().click();
    await settle();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PopoverHost] }).compileComponents();
    fixture = TestBed.createComponent(PopoverHost);
    host = fixture.componentInstance;
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
    // Attach so focus() targets a live element (the real focus-restore assertions need this).
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    overlayContainer.ngOnDestroy();
  });

  it('cross-checks aria-controls against the REAL panel id, in both states', async () => {
    expect(controlledId()).toBeNull();
    await open();
    expect(controlledId()).toBe(panel()!.id);
  });

  it('marks the trigger as a collapsed dialog haspopup before opening', () => {
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-controls')).toBeNull();
    expect(panel()).toBeNull();
  });

  it('has no axe violations in the open popover panel', async () => {
    await open();
    expect(panel()).not.toBeNull();
    await expectNoA11yViolations(containerEl);
  });

  it('opens on click as a named role=dialog the trigger controls', async () => {
    await open();
    const p = panel();
    expect(p).not.toBeNull();
    expect(p!.getAttribute('role')).toBe('dialog');
    expect(p!.getAttribute('aria-label')).toBe('Help panel');
    expect(p!.textContent).toContain('projected');
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    // aria-controls is the panel's own id — the two are wired together.
    expect(trigger().getAttribute('aria-controls')).toBe(p!.id);
  });

  it('moves focus into the panel container on open (APG dialog default)', async () => {
    trigger().focus();
    await open();
    // No [cdkFocusInitial] set → focus lands on the panel container, so the trap holds and Escape works.
    expect(document.activeElement).toBe(panel());
  });

  it('honors [cdkFocusInitial] to focus a specific element on open', async () => {
    host.focusInner.set(true);
    fixture.detectChanges(); // apply the attribute before opening (a real consumer uses a static attr)
    await open();
    expect(document.activeElement).toBe(panel()!.querySelector('.inner-btn'));
  });

  it('falls back to the panel when [cdkFocusInitial] marks something that cannot take focus', async () => {
    host.focusInner.set(true);
    host.disableInner.set(true); // marked, matches the selector, but .focus() is a no-op
    fixture.detectChanges();
    await open();

    // The fallback used to be keyed on whether the QUERY matched, so a disabled button (or a <div>)
    // consumed it and focus never entered the overlay at all — where, per D-791, the CDK anchors can
    // never retrieve it. It is keyed on the OUTCOME now.
    expect(panel()!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(panel());
  });

  it('leaves the trigger closed when attach() throws, so the next click still opens', async () => {
    // `popover._template()` is a required viewChild and throws NG0951 if read before the popover's view
    // exists. Assigning `this.overlayRef` before attach() left a non-null ref with nothing attached, so
    // the next click ran close() instead of opening and the popover was wedged shut.
    const spy = vi.spyOn(OverlayRef.prototype, 'attach').mockImplementationOnce(() => {
      throw new Error('NG0951');
    });
    // Invoked directly rather than through a click: Angular routes a listener throw to its ErrorHandler,
    // so it never propagates out of dispatchEvent and the assertion could not see it.
    const dir = fixture.debugElement
      .query(By.directive(CaePopoverTrigger))
      .injector.get(CaePopoverTrigger);
    expect(() => dir.open()).toThrow('NG0951');
    spy.mockRestore();
    await settle();

    trigger().click();
    await settle();
    expect(panel()).not.toBeNull();
  });

  it('restores focus to the trigger on Escape', async () => {
    trigger().focus();
    await open();
    expect(document.activeElement).toBe(panel());

    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();

    expect(panel()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('restores focus to the trigger on outside (backdrop) click — the usually-missed path', async () => {
    trigger().focus();
    await open();
    expect(backdrop()).not.toBeNull();

    backdrop()!.click();
    await settle();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('restores focus to the trigger when re-activating the trigger closes it', async () => {
    trigger().focus();
    await open();
    // Second activation of the trigger (toggle → close).
    trigger().click();
    await settle();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('disposes the overlay when the trigger is destroyed while open (no leak)', async () => {
    await open();
    expect(panel()).not.toBeNull();

    fixture.destroy();
    // The trigger's DestroyRef must tear the imperative overlay down with it — nothing left in the container.
    expect(containerEl.querySelector('.cae-popover__panel')).toBeNull();
    // dispose(), not detach(): detach() leaves the host in the container and defers the backdrop's
    // removal to a transitionend plus a 500ms fallback, so asserting only the panel misses a real leak.
    expect(containerEl.querySelector('.cdk-overlay-backdrop')).toBeNull();
    expect(containerEl.children.length).toBe(0);
  });

  it('disposes the overlay on the CLOSE path too — the leak the old oracle could not see', async () => {
    await open();
    expect(containerEl.children.length).toBeGreaterThan(0);

    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();

    // The suite used to resolve the panel through aria-controls, which the component nulls on close —
    // so removing `overlayRef.dispose()` from close() left the pane and backdrop in the DOM on every
    // close and shipped green. These assertions read the container directly.
    expect(containerEl.querySelector('.cae-popover__panel')).toBeNull();
    expect(containerEl.querySelector('.cdk-overlay-backdrop')).toBeNull();
    expect(containerEl.children.length).toBe(0);
  });

  describe('focus trap (D-826: the panel is modal, so the trap must HOLD)', () => {
    it('declares modality and is itself tabbable, so the wrap-around anchors have a target', async () => {
      await open();
      expect(panel()!.getAttribute('aria-modal')).toBe('true');
      // The crux of HIGH 1. With tabindex="-1" the panel is not TABBABLE, so CDK's
      // _getFirstTabbableElement returned null for informational content (no focusable child) and both
      // anchor listeners no-oped — Tab walked straight out of an open role="dialog" into the page.
      expect(panel()!.getAttribute('tabindex')).toBe('0');
    });

    it('installs the CDK trap anchors around the panel', async () => {
      await open();
      // cdkTrapFocus contributes exactly ONE thing here — Tab containment — because focus entry is
      // explicit in moveFocusIn. Deleting the directive (and A11yModule) compiled cleanly and killed
      // zero tests before #824: a bare unmatched attribute on a native <div> is not a template error.
      const anchors = containerEl.querySelectorAll<HTMLElement>('.cdk-focus-trap-anchor');
      expect(anchors.length).toBe(2);
      expect(
        anchors[0].compareDocumentPosition(panel()!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    // The WRAP itself — focusing an anchor and landing back inside — is deliberately NOT asserted here.
    // Measured, not assumed: jsdom gives every element zero geometry (`offsetWidth/offsetHeight/
    // getClientRects()` all empty), so CDK's `InteractivityChecker.isVisible` is false for the panel and
    // `_getFirstTabbableElement` returns null REGARDLESS of tabindex. The anchor listener therefore
    // no-ops in jsdom whether the fix is present or not, so any such test would pass for the wrong
    // reason and pin nothing. It lives in `popover.browser.spec.ts` instead.
  });

  it('[dismissable]=false ships NO backdrop, so the trigger stays clickable; Escape still closes', async () => {
    host.dismissable.set(false);
    await settle();
    trigger().focus();
    await open();
    expect(panel()).not.toBeNull();

    // The backdrop used to be unconditional and only *subscribed* when dismissable. It is full-viewport
    // with pointer-events:auto, so it covered the trigger too: a mouse-only user had no way to close the
    // panel at all — every click was eaten, including the one on the trigger (#824).
    expect(backdrop()).toBeNull();
    // ...and with no blocking backdrop the panel is not modal, so it must not claim to be (D-826).
    expect(panel()!.getAttribute('aria-modal')).toBeNull();

    // The pointer affordance a user can actually see: click the trigger again.
    trigger().click();
    await settle();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('[dismissable]=false still ignores an outside click', async () => {
    host.dismissable.set(false);
    await settle();
    await open();

    // No backdrop to click, so an outside click lands on the page. The panel must stay open.
    document.body.click();
    await settle();
    expect(panel()).not.toBeNull();

    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(panel()).toBeNull(); // Escape always closes, independent of [dismissable]
  });

  it('opens on ArrowDown from the trigger', async () => {
    trigger().focus();
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await settle();
    expect(panel()).not.toBeNull();
  });

  it('a modifier chord is not a bare Escape — the panel stays open', async () => {
    await open();
    panel()!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true, bubbles: true }),
    );
    await settle();
    expect(panel()).not.toBeNull();
  });

  it('threads the [position] input through for every side (open succeeds)', async () => {
    for (const side of ['bottom', 'top', 'left', 'right'] as CaePopoverPosition[]) {
      host.position.set(side);
      await settle();
      await open();
      expect(panel()).not.toBeNull();
      // close for the next iteration
      panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();
    }
  });

  it('dev-warns when the panel opens without an accessible name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.label.set('');
    await settle();
    await open();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cae-popover'));
    warn.mockRestore();
  });

  it('the panel draws its chrome from tokens (no hardcoded design values)', () => {
    const styles = (CaePopover as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join('\n');
    expect(styles).toMatch(/background:\s*var\(--cae-surface-raised\)/);
    expect(styles).toMatch(/box-shadow:\s*var\(--cae-elevation-3\)/);
    expect(styles).toMatch(/border:\s*1px solid var\(--cae-color-border\)/);
  });

  describe('CAE_POPOVER_POSITIONS', () => {
    it('gives every side a primary plus a flipped fallback', () => {
      // bottom: below-start primary, then above-start fallback.
      expect(CAE_POPOVER_POSITIONS.bottom[0]).toMatchObject({ originY: 'bottom', overlayY: 'top' });
      expect(CAE_POPOVER_POSITIONS.bottom[1]).toMatchObject({ originY: 'top', overlayY: 'bottom' });
      // top is the mirror of bottom.
      expect(CAE_POPOVER_POSITIONS.top[0]).toMatchObject({ originY: 'top', overlayY: 'bottom' });
      expect(CAE_POPOVER_POSITIONS.top[1]).toMatchObject({ originY: 'bottom', overlayY: 'top' });
      // right: end-origin primary, start-origin (flipped) fallback.
      expect(CAE_POPOVER_POSITIONS.right[0]).toMatchObject({ originX: 'end', overlayX: 'start' });
      expect(CAE_POPOVER_POSITIONS.right[1]).toMatchObject({ originX: 'start', overlayX: 'end' });
      // left is the mirror of right.
      expect(CAE_POPOVER_POSITIONS.left[0]).toMatchObject({ originX: 'start', overlayX: 'end' });
      expect(CAE_POPOVER_POSITIONS.left[1]).toMatchObject({ originX: 'end', overlayX: 'start' });
      // Each side offers exactly the primary + one fallback.
      for (const side of ['bottom', 'top', 'left', 'right'] as CaePopoverPosition[]) {
        expect(CAE_POPOVER_POSITIONS[side]).toHaveLength(2);
      }
    });
  });

  describe('two triggers, one popover (#824)', () => {
    @Component({
      imports: [CaePopover, CaePopoverTrigger],
      template: `
        <button id="a" [caePopoverTriggerFor]="pop" type="button">A</button>
        <button id="b" [caePopoverTriggerFor]="pop" type="button">B</button>
        <cae-popover #pop="caePopover" ariaLabel="Shared">
          <p>shared content</p>
        </cae-popover>
      `,
    })
    class TwoTriggerHost {}

    let two: ComponentFixture<TwoTriggerHost>;
    const btn = (id: string): HTMLButtonElement => two.nativeElement.querySelector(`#${id}`);
    const panels = (): HTMLElement[] =>
      Array.from(containerEl.querySelectorAll<HTMLElement>('.cae-popover__panel'));

    beforeEach(async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({ imports: [TwoTriggerHost] }).compileComponents();
      two = TestBed.createComponent(TwoTriggerHost);
      overlayContainer = TestBed.inject(OverlayContainer);
      containerEl = overlayContainer.getContainerElement();
      document.body.appendChild(two.nativeElement);
      two.detectChanges();
    });
    afterEach(() => {
      two.nativeElement.remove();
      overlayContainer.ngOnDestroy();
    });

    it('only the OWNING trigger reports expanded and claims aria-controls', async () => {
      btn('a').click();
      two.detectChanges();
      await two.whenStable();

      expect(btn('a').getAttribute('aria-expanded')).toBe('true');
      expect(btn('a').getAttribute('aria-controls')).toBe(panels()[0].id);
      // B controls nothing. It used to read the popover's bare open flag, so it advertised
      // aria-expanded="true" and an aria-controls idref for a panel it did not own.
      expect(btn('b').getAttribute('aria-expanded')).toBe('false');
      expect(btn('b').getAttribute('aria-controls')).toBeNull();
    });

    it('opening the second trigger closes the first — never two panels sharing one id', async () => {
      btn('a').click();
      two.detectChanges();
      await two.whenStable();
      btn('b').click();
      two.detectChanges();
      await two.whenStable();

      // Two live <div id="cae-popover-N" role="dialog"> is a duplicate idref target: axe
      // `duplicate-id-aria` (serious, WCAG 4.1.2). B's open() used to pass its own null-overlayRef
      // guard and attach a SECOND overlay rendering the same template.
      expect(panels().length).toBe(1);
      expect(btn('b').getAttribute('aria-expanded')).toBe('true');
      expect(btn('a').getAttribute('aria-expanded')).toBe('false');
      expect(btn('a').getAttribute('aria-controls')).toBeNull();
    });
  });

  describe('swapping [caePopoverTriggerFor] while open (#824)', () => {
    @Component({
      imports: [CaePopover, CaePopoverTrigger],
      template: `
        <button id="t" [caePopoverTriggerFor]="useA() ? popA : popB" type="button">T</button>
        <cae-popover #popA="caePopover" ariaLabel="A"><p>A</p></cae-popover>
        <cae-popover #popB="caePopover" ariaLabel="B"><p>B</p></cae-popover>
      `,
    })
    class SwapHost {
      readonly useA = signal(true);
    }

    let swap: ComponentFixture<SwapHost>;
    const t = (): HTMLButtonElement => swap.nativeElement.querySelector('#t');

    beforeEach(async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({ imports: [SwapHost] }).compileComponents();
      swap = TestBed.createComponent(SwapHost);
      overlayContainer = TestBed.inject(OverlayContainer);
      containerEl = overlayContainer.getContainerElement();
      document.body.appendChild(swap.nativeElement);
      swap.detectChanges();
    });
    afterEach(() => {
      swap.nativeElement.remove();
      overlayContainer.ngOnDestroy();
    });

    it('closes the popover it ACTUALLY opened, not whatever the binding now points at', async () => {
      t().click();
      swap.detectChanges();
      await swap.whenStable();
      expect(containerEl.querySelectorAll('.cae-popover__panel').length).toBe(1);

      swap.componentInstance.useA.set(false); // binding now resolves to popB while popA is open
      swap.detectChanges();

      t().click(); // toggle → close
      swap.detectChanges();
      await swap.whenStable();

      // close() used to clear `this.popover()` — popB — leaving popA stranded at open forever, so any
      // later trigger bound to popA advertised aria-expanded="true" and a dangling aria-controls idref.
      expect(containerEl.querySelectorAll('.cae-popover__panel').length).toBe(0);
      expect(t().getAttribute('aria-expanded')).toBe('false');
      expect(t().getAttribute('aria-controls')).toBeNull();

      // The load-bearing assertion: point the binding BACK at popA. If close() cleared popB (the
      // binding's current value) instead of the popover it actually opened, popA is still stranded at
      // open, and this trigger now advertises aria-expanded="true" plus a dangling aria-controls idref
      // for a dialog that is not in the DOM.
      swap.componentInstance.useA.set(true);
      swap.detectChanges();
      expect(t().getAttribute('aria-expanded')).toBe('false');
      expect(t().getAttribute('aria-controls')).toBeNull();
    });
  });
});
