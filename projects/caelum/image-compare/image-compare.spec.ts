import { Component, EventEmitter, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Direction, Directionality } from '@angular/cdk/bidi';
import { vi } from 'vitest';

import { CaeImageCompare } from './image-compare';

/** A Directionality double we can seed to a fixed direction (root Directionality defaults to 'ltr'). */
class FakeDirectionality {
  readonly change = new EventEmitter<Direction>();
  constructor(public value: Direction = 'ltr') {}
}

describe('CaeImageCompare', () => {
  let fixture: ComponentFixture<CaeImageCompare>;
  let component: CaeImageCompare;
  let el: HTMLElement;

  /** Create the slider, apply inputs, attach to the document (pointer geometry needs a live tree), render. */
  async function render(
    inputs: Record<string, unknown> = {},
    dir: Direction = 'ltr',
  ): Promise<void> {
    if (dir === 'rtl') {
      TestBed.overrideProvider(Directionality, { useValue: new FakeDirectionality('rtl') });
    }
    fixture = TestBed.createComponent(CaeImageCompare);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('beforeSrc', 'before.png');
    fixture.componentRef.setInput('afterSrc', 'after.png');
    // Non-empty defaults silence the two dev-warns (no accessible name / both-alts-empty) unless a test opts in.
    fixture.componentRef.setInput('ariaLabel', 'Reveal comparison');
    fixture.componentRef.setInput('beforeAlt', 'Before');
    fixture.componentRef.setInput('afterAlt', 'After');
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => {
    fixture?.nativeElement.remove();
    vi.restoreAllMocks();
  });

  const divider = (): HTMLElement => el.querySelector('[role="separator"]')!;
  const track = (): HTMLElement => el.querySelector('.cae-image-compare__track')!;
  const beforeImg = (): HTMLImageElement => el.querySelector('.cae-image-compare__img--before')!;
  const baseImg = (): HTMLImageElement =>
    el.querySelector('.cae-image-compare__img:not(.cae-image-compare__img--before)')!;
  const valueNow = (): string | null => divider().getAttribute('aria-valuenow');
  /** The reveal-clip logic (LTR hides right, RTL hides left); asserting the computed avoids CSSOM flakiness. */
  const clip = (): string => (component as unknown as { clipPath(): string }).clipPath();

  function key(k: string): void {
    divider().dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
  }

  /** jsdom returns an all-zero rect; seed the track so pointer→% math has real geometry. */
  function mockRect(left = 0, width = 200): void {
    vi.spyOn(track(), 'getBoundingClientRect').mockReturnValue({
      left,
      right: left + width,
      width,
      top: 0,
      bottom: 100,
      height: 100,
      x: left,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  }

  // jsdom has no PointerEvent constructor → MouseEvent (no pointerId) exercises the setPointerCapture guard.
  function pointerDown(clientX: number, button = 0): void {
    divider().dispatchEvent(
      new MouseEvent('pointerdown', {
        clientX,
        button,
        bubbles: true,
        cancelable: true,
        buttons: 1,
      }),
    );
    fixture.detectChanges();
  }
  function pointerMove(clientX: number, buttons = 1): void {
    divider().dispatchEvent(new MouseEvent('pointermove', { clientX, bubbles: true, buttons }));
    fixture.detectChanges();
  }
  function pointerUp(): void {
    divider().dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    fixture.detectChanges();
  }

  // --- Structure & default state ---

  it('renders both images with their alt text', async () => {
    await render({ beforeAlt: 'Retouched', afterAlt: 'Original' });
    expect(baseImg().getAttribute('src')).toBe('after.png');
    expect(baseImg().getAttribute('alt')).toBe('Original');
    expect(beforeImg().getAttribute('src')).toBe('before.png');
    expect(beforeImg().getAttribute('alt')).toBe('Retouched');
  });

  it('is a keyboard-focusable window-splitter separator at 50% by default', async () => {
    await render();
    const d = divider();
    expect(d.getAttribute('role')).toBe('separator');
    expect(d.getAttribute('tabindex')).toBe('0');
    expect(d.getAttribute('aria-orientation')).toBe('vertical');
    expect(d.getAttribute('aria-valuemin')).toBe('0');
    expect(d.getAttribute('aria-valuemax')).toBe('100');
    expect(valueNow()).toBe('50');
    expect(d.getAttribute('aria-valuetext')).toBe('50%'); // locale-neutral (no translated word)
    expect(d.getAttribute('aria-label')).toBe('Reveal comparison');
    // The divider is positioned by the rendered inline-start style, not just the computed.
    expect(d.style.getPropertyValue('inset-inline-start')).toBe('50%');
  });

  it('clips the "before" layer from the inline-start edge (LTR hides the trailing side)', async () => {
    await render();
    expect(clip()).toBe('inset(0 50% 0 0)');
    // The clip actually reaches the rendered <img> style (guards against a binding-target typo).
    expect(beforeImg().style.getPropertyValue('clip-path')).toBe('inset(0 50% 0 0)');
    fixture.componentRef.setInput('value', 30);
    fixture.detectChanges();
    expect(clip()).toBe('inset(0 70% 0 0)');
    expect(beforeImg().style.getPropertyValue('clip-path')).toBe('inset(0 70% 0 0)');
  });

  // --- Keyboard resize path (Book 11 §3.5 #1) ---

  it('nudges with arrow keys and snaps with Home/End', async () => {
    await render();
    key('ArrowRight');
    expect(valueNow()).toBe('51');
    key('ArrowLeft');
    expect(valueNow()).toBe('50');
    key('ArrowUp');
    expect(valueNow()).toBe('51');
    key('ArrowDown');
    expect(valueNow()).toBe('50');
    key('Home');
    expect(valueNow()).toBe('0');
    key('End');
    expect(valueNow()).toBe('100');
  });

  it('steps coarsely with PageUp/PageDown', async () => {
    await render();
    key('PageUp');
    expect(valueNow()).toBe('60');
    key('PageDown');
    key('PageDown');
    expect(valueNow()).toBe('40');
  });

  it('honors a custom [step]', async () => {
    await render({ step: 5 });
    key('ArrowRight');
    expect(valueNow()).toBe('55');
  });

  it('clamps at the [0, 100] bounds', async () => {
    await render();
    key('End');
    key('ArrowRight');
    expect(valueNow()).toBe('100');
    key('Home');
    key('ArrowLeft');
    key('PageDown');
    expect(valueNow()).toBe('0');
  });

  it('leaves unrelated keys (Tab) alone', async () => {
    await render();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    divider().dispatchEvent(ev);
    fixture.detectChanges();
    expect(valueNow()).toBe('50');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('normalizes an out-of-range two-way write back into [0, 100]', async () => {
    await render({ value: 150 });
    expect(valueNow()).toBe('100');
    expect(clip()).toBe('inset(0 0% 0 0)');
    expect(component.value()).toBe(100); // the model self-heals, not just the render
    fixture.componentRef.setInput('value', -20);
    fixture.detectChanges();
    expect(valueNow()).toBe('0');
    expect(clip()).toBe('inset(0 100% 0 0)');
    expect(component.value()).toBe(0);
  });

  it('coerces a NaN write to 0 instead of rendering aria-valuenow="NaN"', async () => {
    await render({ value: Number.NaN });
    expect(valueNow()).toBe('0');
    expect(component.value()).toBe(0);
  });

  // --- RTL (Book 04 §3.5) ---

  it('inverts the clip side and the horizontal arrows under RTL', async () => {
    await render({}, 'rtl');
    expect(clip()).toBe('inset(0 0 0 50%)'); // RTL hides the (physical) left — proves the dir is active
    expect(beforeImg().style.getPropertyValue('clip-path')).toBe('inset(0 0 0 50%)');
    key('ArrowRight'); // toward the trailing (start=right) edge → less reveal
    expect(valueNow()).toBe('49');
    key('ArrowLeft');
    key('ArrowLeft');
    expect(valueNow()).toBe('51');
  });

  // --- Pointer drag (native Pointer Events + capture) ---

  it('maps a pointer drag to a reveal %, measured from the start edge (LTR)', async () => {
    await render();
    mockRect(0, 200);
    pointerDown(150);
    expect(valueNow()).toBe('75');
    pointerMove(50);
    expect(valueNow()).toBe('25');
  });

  it('ignores a move with no active drag — a hover, or a cross-element drag passing over the divider', async () => {
    await render();
    mockRect(0, 200);
    pointerMove(10, 0); // a hover (no button)
    expect(valueNow()).toBe('50');
    pointerMove(10, 1); // a button IS held, but no pointerdown started HERE (an unrelated drag) → ignored
    expect(valueNow()).toBe('50');
  });

  it('ignores a non-primary (right) button press on the divider', async () => {
    await render();
    mockRect(0, 200);
    pointerDown(150, 2); // right button
    expect(valueNow()).toBe('50');
  });

  it('stops tracking once the drag ends (pointerup)', async () => {
    await render();
    mockRect(0, 200);
    pointerDown(150);
    expect(valueNow()).toBe('75');
    pointerUp();
    pointerMove(50); // a stray move after release must not move the divider
    expect(valueNow()).toBe('75');
  });

  it('measures the pointer from the right edge under RTL', async () => {
    await render({}, 'rtl');
    mockRect(0, 200);
    pointerDown(150); // (200 - 150) / 200 = 25%
    expect(valueNow()).toBe('25');
  });

  // --- Accessible-name dev-warn ---

  it('dev-warns when no accessible name is provided', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render({ ariaLabel: undefined });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('accessible name'));
  });

  it('does not warn when [ariaLabel] is provided', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render({ ariaLabel: 'Reveal comparison' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('dev-warns when both images are alt-less (invisible to AT)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render({ beforeAlt: '', afterAlt: '' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('empty alt'));
  });

  it('dev-warns on a non-positive [step]', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render({ step: 0 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[step]'));
  });
});

// --- Two-way [(value)] binding ---

@Component({
  selector: 'cae-compare-host',
  imports: [CaeImageCompare],
  template: `
    <cae-image-compare beforeSrc="b.png" afterSrc="a.png" ariaLabel="Reveal" [(value)]="pos" />
  `,
})
class CompareHost {
  readonly pos = signal(40);
}

describe('CaeImageCompare — two-way binding', () => {
  it('reflects an external write and emits back on keyboard resize', async () => {
    const fixture = TestBed.createComponent(CompareHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    const divider = el.querySelector('[role="separator"]')!;
    expect(divider.getAttribute('aria-valuenow')).toBe('40'); // host → component

    divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(divider.getAttribute('aria-valuenow')).toBe('41');
    expect(fixture.componentInstance.pos()).toBe(41); // component → host

    fixture.nativeElement.remove();
  });
});
