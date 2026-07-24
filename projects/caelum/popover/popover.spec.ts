import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';

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
      <button type="button" class="inner-btn" [attr.cdkFocusInitial]="focusInner() ? '' : null">
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
}

describe('CaePopover + caePopoverTriggerFor', () => {
  let fixture: ComponentFixture<PopoverHost>;
  let host: PopoverHost;
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;

  const trigger = (): HTMLButtonElement =>
    fixture.debugElement.query(By.directive(CaePopoverTrigger)).nativeElement;

  // Resolve the panel through the trigger's aria-controls — NEVER a document-wide query (a closed
  // Material panel can linger and make an assertion vacuous; the #664 acceptance criterion).
  const panel = (): HTMLElement | null => {
    const id = trigger().getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  };
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
  });

  it('does not dismiss on outside click when [dismissable]=false, but Escape still closes', async () => {
    host.dismissable.set(false);
    await settle();
    trigger().focus();
    await open();

    backdrop()!.click();
    await settle();
    expect(panel()).not.toBeNull(); // outside click ignored

    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(panel()).toBeNull(); // Escape always closes
    expect(document.activeElement).toBe(trigger());
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
});
