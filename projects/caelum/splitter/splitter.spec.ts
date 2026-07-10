import { Component, EventEmitter, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Direction, Directionality } from '@angular/cdk/bidi';
import { vi } from 'vitest';

import { CaeSplitter, CaeSplitterPanel } from './splitter';

/** A Directionality double we can seed to a fixed direction (root Directionality defaults to 'ltr'). */
class FakeDirectionality {
  readonly change = new EventEmitter<Direction>();
  constructor(public value: Direction = 'ltr') {}
}

interface PanelSpec {
  size?: number;
  min?: number;
  label?: string;
}

/** Host that projects a signal-driven set of panels — lets a test add/remove panes and read them back. */
@Component({
  selector: 'cae-splitter-host',
  imports: [CaeSplitter, CaeSplitterPanel],
  template: `
    <cae-splitter
      [layout]="layout()"
      [step]="step()"
      [ariaLabel]="ariaLabel()"
      (resizeEnd)="onResize($event)"
    >
      @for (p of panels(); track $index) {
        <cae-splitter-panel [size]="p.size" [minSize]="p.min ?? 0">{{
          p.label
        }}</cae-splitter-panel>
      }
    </cae-splitter>
  `,
})
class SplitterHost {
  readonly layout = signal<'horizontal' | 'vertical'>('horizontal');
  readonly step = signal(10);
  readonly ariaLabel = signal('Resize panels');
  readonly panels = signal<PanelSpec[]>([
    { size: 30, label: 'A' },
    { size: 70, label: 'B' },
  ]);
  lastResize: number[] | null = null;
  onResize(sizes: number[]): void {
    this.lastResize = sizes;
  }
}

describe('CaeSplitter', () => {
  let fixture: ComponentFixture<SplitterHost>;
  let host: SplitterHost;
  let el: HTMLElement;

  async function render(
    opts: {
      layout?: 'horizontal' | 'vertical';
      step?: number;
      ariaLabel?: string;
      panels?: PanelSpec[];
      dir?: Direction;
    } = {},
  ): Promise<void> {
    if (opts.dir === 'rtl') {
      TestBed.overrideProvider(Directionality, { useValue: new FakeDirectionality('rtl') });
    }
    fixture = TestBed.createComponent(SplitterHost);
    host = fixture.componentInstance;
    if (opts.layout) host.layout.set(opts.layout);
    if (opts.step != null) host.step.set(opts.step);
    if (opts.ariaLabel != null) host.ariaLabel.set(opts.ariaLabel);
    if (opts.panels) host.panels.set(opts.panels);
    // Pointer geometry needs a live tree.
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => {
    fixture?.nativeElement.remove();
    vi.restoreAllMocks();
  });

  const dividers = (): HTMLElement[] =>
    Array.from(el.querySelectorAll<HTMLElement>('[role="separator"]'));
  const panelEls = (): HTMLElement[] =>
    Array.from(el.querySelectorAll<HTMLElement>('.cae-splitter__panel'));
  const containerEl = (): HTMLElement => el.querySelector<HTMLElement>('.cae-splitter__container')!;
  const valueNow = (i: number): string | null => dividers()[i].getAttribute('aria-valuenow');
  const basis = (i: number): string => panelEls()[i].style.getPropertyValue('flex-basis');

  function key(i: number, k: string): KeyboardEvent {
    const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    dividers()[i].dispatchEvent(ev);
    fixture.detectChanges();
    return ev;
  }

  /** jsdom returns an all-zero rect; seed the container so pointer→% math has real geometry. */
  function mockRect(
    opts: { left?: number; top?: number; width?: number; height?: number } = {},
  ): void {
    const { left = 0, top = 0, width = 200, height = 200 } = opts;
    vi.spyOn(containerEl(), 'getBoundingClientRect').mockReturnValue({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect);
  }

  // jsdom has no PointerEvent constructor → MouseEvent (no pointerId) exercises the setPointerCapture guard.
  function pointerDown(i: number, coord: { x?: number; y?: number }, button = 0): void {
    dividers()[i].dispatchEvent(
      new MouseEvent('pointerdown', {
        clientX: coord.x ?? 0,
        clientY: coord.y ?? 0,
        button,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    fixture.detectChanges();
  }
  function pointerMove(i: number, coord: { x?: number; y?: number }, buttons = 1): void {
    dividers()[i].dispatchEvent(
      new MouseEvent('pointermove', {
        clientX: coord.x ?? 0,
        clientY: coord.y ?? 0,
        buttons,
        bubbles: true,
      }),
    );
    fixture.detectChanges();
  }
  function pointerUp(i: number): void {
    dividers()[i].dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    fixture.detectChanges();
  }

  // --- Structure, projection & size seeding ---

  it('renders N panels and N-1 dividers, projecting each panel body', async () => {
    await render({
      panels: [
        { size: 25, label: 'A' },
        { size: 25, label: 'B' },
        { size: 50, label: 'C' },
      ],
    });
    expect(panelEls().length).toBe(3);
    expect(dividers().length).toBe(2);
    // The projected content is stamped into the flex panes (proves the TemplateRef-capture projection).
    expect(panelEls()[0].textContent).toContain('A');
    expect(panelEls()[2].textContent).toContain('C');
  });

  it('seeds flex-basis from each panel [size]', async () => {
    await render();
    expect(basis(0)).toBe('30%');
    expect(basis(1)).toBe('70%');
  });

  it('splits the remaining space equally among unsized panels', async () => {
    await render({ panels: [{ size: 40, label: 'A' }, { label: 'B' }, { label: 'C' }] });
    expect(basis(0)).toBe('40%');
    expect(basis(1)).toBe('30%');
    expect(basis(2)).toBe('30%');
  });

  it('falls back to an equal split when no panel is sized', async () => {
    await render({ panels: [{ label: 'A' }, { label: 'B' }] });
    expect(basis(0)).toBe('50%');
    expect(basis(1)).toBe('50%');
  });

  it('normalizes sizes that do not sum to 100', async () => {
    await render({
      panels: [
        { size: 1, label: 'A' },
        { size: 3, label: 'B' },
      ],
    });
    expect(basis(0)).toBe('25%');
    expect(basis(1)).toBe('75%');
  });

  // --- Separator a11y contract (APG window splitter) ---

  it('exposes each divider as a keyboard-focusable window-splitter separator', async () => {
    await render();
    const d = dividers()[0];
    expect(d.getAttribute('role')).toBe('separator');
    expect(d.getAttribute('tabindex')).toBe('0');
    // horizontal layout → side-by-side panes → the separator LINE is vertical (the #293-confirmed convention)
    expect(d.getAttribute('aria-orientation')).toBe('vertical');
    expect(d.getAttribute('aria-valuemin')).toBe('0');
    expect(d.getAttribute('aria-valuemax')).toBe('100');
    expect(d.getAttribute('aria-valuenow')).toBe('30'); // the leading pane's size
    expect(d.getAttribute('aria-valuetext')).toBe('30%'); // locale-neutral
    expect(d.getAttribute('aria-label')).toBe('Resize panels');
  });

  it('flips aria-orientation to horizontal for a vertical layout', async () => {
    await render({ layout: 'vertical' });
    expect(dividers()[0].getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('reflects the per-pair reachable range in aria-valuemin/valuemax', async () => {
    // Leading min 15 → valuemin 15; trailing min 60 → the leading pane can grow only to 100-60 = 40.
    await render({
      panels: [
        { size: 30, min: 15, label: 'A' },
        { size: 70, min: 60, label: 'B' },
      ],
    });
    const d = dividers()[0];
    expect(d.getAttribute('aria-valuemin')).toBe('15');
    expect(d.getAttribute('aria-valuemax')).toBe('40');
  });

  // --- Keyboard resize (horizontal, Book 11 §3.5 #1) ---

  it('resizes the pair with the axis arrows, conserving the pair total', async () => {
    await render();
    key(0, 'ArrowRight');
    expect(valueNow(0)).toBe('40');
    expect(basis(0)).toBe('40%');
    expect(basis(1)).toBe('60%'); // trailing pane gives up exactly what the leading pane took
    key(0, 'ArrowLeft');
    expect(valueNow(0)).toBe('30');
  });

  it('snaps the leading pane to its min/max with Home/End', async () => {
    await render({
      panels: [
        { size: 30, min: 15, label: 'A' },
        { size: 70, min: 20, label: 'B' },
      ],
    });
    key(0, 'Home');
    expect(valueNow(0)).toBe('15'); // leading → its own min
    key(0, 'End');
    expect(valueNow(0)).toBe('80'); // leading → 100 - trailing min (20)
  });

  it('steps coarsely with PageUp/PageDown', async () => {
    await render({ step: 3 });
    key(0, 'PageUp');
    expect(valueNow(0)).toBe('40'); // PageUp is a fixed 10, independent of [step]
    key(0, 'PageDown');
    key(0, 'PageDown');
    expect(valueNow(0)).toBe('20');
  });

  it('honors a custom [step]', async () => {
    await render({ step: 5 });
    key(0, 'ArrowRight');
    expect(valueNow(0)).toBe('35');
  });

  it('emits (resizeEnd) with the live sizes after a keyboard resize', async () => {
    await render();
    expect(host.lastResize).toBeNull();
    key(0, 'ArrowRight');
    expect(host.lastResize).toEqual([40, 60]);
  });

  it('ignores the cross-axis arrows in a horizontal layout (leaves them for the browser)', async () => {
    await render();
    const up = key(0, 'ArrowUp');
    const down = key(0, 'ArrowDown');
    expect(valueNow(0)).toBe('30');
    expect(up.defaultPrevented).toBe(false);
    expect(down.defaultPrevented).toBe(false);
  });

  it('leaves unrelated keys (Tab) alone', async () => {
    await render();
    const ev = key(0, 'Tab');
    expect(valueNow(0)).toBe('30');
    expect(ev.defaultPrevented).toBe(false);
  });

  // --- Keyboard resize (vertical) ---

  it('uses Up/Down as the axis for a vertical layout', async () => {
    await render({ layout: 'vertical' });
    key(0, 'ArrowDown');
    expect(valueNow(0)).toBe('40'); // down grows the leading (top) pane
    key(0, 'ArrowUp');
    expect(valueNow(0)).toBe('30');
    // Left/Right are not the axis for a vertical splitter.
    const right = key(0, 'ArrowRight');
    expect(valueNow(0)).toBe('30');
    expect(right.defaultPrevented).toBe(false);
  });

  // --- minSize clamping ---

  it('clamps resizing so neither pane drops below its minSize', async () => {
    await render({
      panels: [
        { size: 30, min: 15, label: 'A' },
        { size: 70, min: 60, label: 'B' },
      ],
    });
    // Try to shrink the leading pane past its own min (30 → 20 → clamps at 15, not 10).
    key(0, 'PageDown');
    key(0, 'PageDown');
    expect(valueNow(0)).toBe('15');
    // Try to grow it past the point the trailing pane hits its min (100 - 60 = 40).
    key(0, 'End');
    key(0, 'PageUp');
    expect(valueNow(0)).toBe('40');
  });

  it('is a no-op when a pair cannot satisfy both minimums', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); // infeasible config dev-warns
    await render({
      panels: [
        { size: 50, min: 60, label: 'A' },
        { size: 50, min: 60, label: 'B' },
      ],
    });
    key(0, 'ArrowRight');
    key(0, 'Home');
    // The layout is unchanged (60 + 60 > 100 is infeasible); aria-valuenow is still clamped into the
    // degenerate announced range so the ARIA triple stays coherent, but flex-basis proves the no-op.
    expect(basis(0)).toBe('50%');
    expect(warn).toHaveBeenCalled();
  });

  // --- Multi-panel: a divider only moves its own pair ---

  it('resizes only its own pair, leaving other panes untouched', async () => {
    await render({
      panels: [
        { size: 25, label: 'A' },
        { size: 25, label: 'B' },
        { size: 50, label: 'C' },
      ],
    });
    key(1, 'ArrowRight'); // divider between B and C
    expect(basis(0)).toBe('25%'); // A untouched
    expect(valueNow(1)).toBe('35'); // B grew
    expect(basis(2)).toBe('40%'); // C shrank by the same 10
  });

  // --- RTL (Book 04 §3.5) ---

  it('inverts the horizontal axis arrows under RTL', async () => {
    await render({ dir: 'rtl' });
    key(0, 'ArrowRight'); // toward the (RTL) start=right edge → leading shrinks
    expect(valueNow(0)).toBe('20');
    key(0, 'ArrowLeft');
    key(0, 'ArrowLeft');
    expect(valueNow(0)).toBe('40');
  });

  it('does not invert a vertical layout under RTL', async () => {
    await render({ layout: 'vertical', dir: 'rtl' });
    key(0, 'ArrowDown');
    expect(valueNow(0)).toBe('40'); // same as LTR — vertical is direction-independent
  });

  // --- Pointer drag (native Pointer Events + capture) ---

  it('maps a pointer drag to the leading pane size, from the start edge (LTR)', async () => {
    await render();
    mockRect({ width: 200 });
    pointerDown(0, { x: 120 }); // 120/200 = 60%
    expect(valueNow(0)).toBe('60');
    pointerMove(0, { x: 80 }); // 80/200 = 40%
    expect(valueNow(0)).toBe('40');
  });

  it('offsets by the preceding panes for a later divider', async () => {
    await render({
      panels: [
        { size: 25, label: 'A' },
        { size: 25, label: 'B' },
        { size: 50, label: 'C' },
      ],
    });
    mockRect({ width: 200 });
    pointerDown(1, { x: 150 }); // 75% of the whole; pane A occupies 25 → leading (B) target = 50
    expect(valueNow(1)).toBe('50');
    expect(basis(0)).toBe('25%'); // A still untouched
  });

  it('uses the vertical axis (clientY) for a vertical layout', async () => {
    await render({ layout: 'vertical' });
    mockRect({ height: 200 });
    pointerDown(0, { y: 120 }); // 120/200 = 60%
    expect(valueNow(0)).toBe('60');
  });

  it('measures the pointer from the right edge under RTL', async () => {
    await render({ dir: 'rtl' });
    mockRect({ width: 200 });
    pointerDown(0, { x: 60 }); // (200 - 60) / 200 = 70%
    expect(valueNow(0)).toBe('70');
  });

  it('ignores a move with no active drag (a hover, or a cross-element drag passing over)', async () => {
    await render();
    mockRect({ width: 200 });
    pointerMove(0, { x: 10 }, 0); // hover, no button
    expect(valueNow(0)).toBe('30');
    pointerMove(0, { x: 10 }, 1); // a button is held, but no pointerdown started HERE → ignored
    expect(valueNow(0)).toBe('30');
  });

  it('ignores a non-primary (right) button press', async () => {
    await render();
    mockRect({ width: 200 });
    pointerDown(0, { x: 150 }, 2); // right button
    expect(valueNow(0)).toBe('30');
  });

  it('stops tracking once the drag ends, and emits (resizeEnd) on pointerup', async () => {
    await render();
    mockRect({ width: 200 });
    pointerDown(0, { x: 120 });
    expect(valueNow(0)).toBe('60');
    pointerUp(0);
    expect(host.lastResize).toEqual([60, 40]);
    pointerMove(0, { x: 20 }); // a stray move after release must not move the divider
    expect(valueNow(0)).toBe('60');
  });

  // --- contentChildren reactivity ---

  it('re-seeds the sizes when the panel set changes', async () => {
    await render();
    expect(dividers().length).toBe(1);
    host.panels.set([
      { size: 20, label: 'A' },
      { size: 30, label: 'B' },
      { size: 50, label: 'C' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dividers().length).toBe(2);
    expect(basis(0)).toBe('20%');
    expect(basis(1)).toBe('30%');
    expect(basis(2)).toBe('50%');
  });

  it('discards a stale resize override when the panel set changes (the two-layer claim)', async () => {
    await render();
    key(0, 'ArrowRight'); // sets an override → [40, 60]
    expect(basis(0)).toBe('40%');
    host.panels.set([
      { size: 20, label: 'A' },
      { size: 30, label: 'B' },
      { size: 50, label: 'C' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(basis(0)).toBe('20%'); // the stale (length-2) override is dropped; the fresh seed wins
  });

  // --- Seed respects minSize (both-lens MAJOR: the ARIA triple must stay coherent) ---

  it('raises a seeded pane to its minSize so aria-valuenow stays within [valuemin, valuemax]', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // silence the contradictory-[size] dev-warn
    // Declared [60, 40] but pane B needs min 50 — the seed must honour the minimum, not the bare size.
    await render({
      panels: [
        { size: 60, label: 'A' },
        { size: 40, min: 50, label: 'B' },
      ],
    });
    const d = dividers()[0];
    const now = Number(d.getAttribute('aria-valuenow'));
    const min = Number(d.getAttribute('aria-valuemin'));
    const max = Number(d.getAttribute('aria-valuemax'));
    expect(now).toBeGreaterThanOrEqual(min); // no out-of-range announce (WCAG 4.1.2)
    expect(now).toBeLessThanOrEqual(max);
    expect(parseFloat(basis(1))).toBeGreaterThanOrEqual(50); // pane B rendered at ≥ its minimum
  });

  it('scales down sizes that sum to more than 100', async () => {
    await render({
      panels: [
        { size: 80, label: 'A' },
        { size: 80, label: 'B' },
      ],
    });
    expect(basis(0)).toBe('50%');
    expect(basis(1)).toBe('50%');
  });

  it('seeds an unsized panel to 0% when the sized panels already claim 100', async () => {
    await render({ panels: [{ size: 100, label: 'A' }, { label: 'B' }] });
    expect(basis(0)).toBe('100%');
    expect(basis(1)).toBe('0%'); // preserved as 0 (?? null), not dropped by a truthiness bug
  });

  // --- resizeEnd is only a real "end" ---

  it('does not emit (resizeEnd) on a clamped no-op keystroke', async () => {
    await render();
    key(0, 'Home'); // 30 → 0 (a real change) emits
    expect(host.lastResize).toEqual([0, 100]);
    host.lastResize = null;
    key(0, 'Home'); // already at the min → no change → no emit
    expect(host.lastResize).toBeNull();
  });

  // --- PageUp/PageDown track the layout axis (a11y MINOR: no vertical clash) ---

  it('moves PageUp/PageDown along the same axis as the arrows in a vertical layout', async () => {
    await render({ layout: 'vertical' });
    key(0, 'ArrowUp'); // shrinks the leading (top) pane: 30 → 20
    expect(valueNow(0)).toBe('20');
    key(0, 'PageUp'); // a coarse ArrowUp (same direction, not the reverse): 20 → 10
    expect(valueNow(0)).toBe('10');
    key(0, 'PageDown');
    key(0, 'PageDown'); // coarse ArrowDown ×2: 10 → 30
    expect(valueNow(0)).toBe('30');
  });

  it('offsets by the preceding panes for a later divider under RTL', async () => {
    await render({
      panels: [
        { size: 25, label: 'A' },
        { size: 25, label: 'B' },
        { size: 50, label: 'C' },
      ],
      dir: 'rtl',
    });
    mockRect({ width: 200 });
    pointerDown(1, { x: 50 }); // RTL: (200-50)/200 = 75% of the whole; pane A is 25 → leading (B) = 50
    expect(valueNow(1)).toBe('50');
    expect(basis(0)).toBe('25%'); // A untouched
  });

  // --- Dev-only config guards ---

  it('dev-warns when there are fewer than two panels', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render({ panels: [{ size: 100, label: 'A' }] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('at least two'));
  });

  it('dev-warns when the panel minimums cannot be satisfied', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render({
      panels: [
        { size: 50, min: 60, label: 'A' },
        { size: 50, min: 60, label: 'B' },
      ],
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('minSize'));
  });

  it('dev-warns when a panel [size] is below its own [minSize]', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render({
      panels: [
        { size: 60, label: 'A' },
        { size: 40, min: 50, label: 'B' },
      ],
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('below its [minSize]'));
  });

  it('dev-warns and drops the attribute when [ariaLabel] is blank', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render({ ariaLabel: '' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('accessible name'));
    expect(dividers()[0].hasAttribute('aria-label')).toBe(false); // '' || null → no empty-string name
  });

  it('dev-warns on a non-positive [step]', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render({ step: 0 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[step]'));
  });

  it('does not warn for a valid two-panel configuration', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render();
    expect(warn).not.toHaveBeenCalled();
  });
});
