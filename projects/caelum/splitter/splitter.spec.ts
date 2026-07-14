import { Component, EventEmitter, PLATFORM_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dir, Direction, Directionality } from '@angular/cdk/bidi';
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
      [gutterSize]="gutterSize()"
      [ariaLabel]="ariaLabel()"
      [collapsible]="collapsible()"
      [stateKey]="stateKey()"
      [stateStorage]="stateStorage()"
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
  readonly gutterSize = signal<number | undefined>(undefined);
  readonly ariaLabel = signal('Resize panels');
  readonly collapsible = signal(false);
  readonly stateKey = signal('');
  readonly stateStorage = signal<'local' | 'session'>('session');
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
      gutterSize?: number;
      ariaLabel?: string;
      collapsible?: boolean;
      panels?: PanelSpec[];
      dir?: Direction;
      stateKey?: string;
      stateStorage?: 'local' | 'session';
      platform?: object | string;
    } = {},
  ): Promise<void> {
    if (opts.dir === 'rtl') {
      TestBed.overrideProvider(Directionality, { useValue: new FakeDirectionality('rtl') });
    }
    if (opts.platform != null) {
      TestBed.overrideProvider(PLATFORM_ID, { useValue: opts.platform });
    }
    fixture = TestBed.createComponent(SplitterHost);
    host = fixture.componentInstance;
    if (opts.layout) host.layout.set(opts.layout);
    if (opts.step != null) host.step.set(opts.step);
    if (opts.gutterSize != null) host.gutterSize.set(opts.gutterSize);
    if (opts.ariaLabel != null) host.ariaLabel.set(opts.ariaLabel);
    if (opts.collapsible != null) host.collapsible.set(opts.collapsible);
    // stateKey/stateStorage must be set BEFORE the first detectChanges so the one-shot restore effect
    // (which fires when the projected panels first resolve) sees them.
    if (opts.stateKey != null) host.stateKey.set(opts.stateKey);
    if (opts.stateStorage != null) host.stateStorage.set(opts.stateStorage);
    if (opts.panels) host.panels.set(opts.panels);
    // Pointer geometry needs a live tree.
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    // Each persistence test owns its keys; a shared jsdom Storage would otherwise leak across tests.
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    fixture?.nativeElement.remove();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
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
  const splitterEl = (): HTMLElement => el.querySelector<HTMLElement>('cae-splitter')!;
  const gutterSizeVar = (): string =>
    splitterEl().style.getPropertyValue('--cae-splitter-gutter-size').trim();
  function doubleClick(i: number): void {
    dividers()[i].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
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

  // --- State persistence (`p-splitter` stateKey/stateStorage parity, #325) ---

  it('does not touch storage on resize when [stateKey] is unset (persistence off by default)', async () => {
    const setSession = vi.spyOn(Storage.prototype, 'setItem');
    await render(); // no stateKey
    key(0, 'ArrowRight');
    expect(valueNow(0)).toBe('40'); // the resize still happens
    expect(setSession).not.toHaveBeenCalled(); // …but nothing is persisted
  });

  it('persists the live sizes to sessionStorage (the default) after a keyboard resize', async () => {
    await render({ stateKey: 'splitA' });
    expect(sessionStorage.getItem('splitA')).toBeNull(); // nothing until a resize commits
    key(0, 'ArrowRight');
    expect(JSON.parse(sessionStorage.getItem('splitA')!)).toEqual([40, 60]);
    expect(localStorage.getItem('splitA')).toBeNull(); // default backing is session, not local
  });

  it('persists to localStorage when [stateStorage]="local"', async () => {
    await render({ stateKey: 'splitB', stateStorage: 'local' });
    key(0, 'ArrowRight');
    expect(JSON.parse(localStorage.getItem('splitB')!)).toEqual([40, 60]);
    expect(sessionStorage.getItem('splitB')).toBeNull();
  });

  it('persists after a pointer drag too', async () => {
    await render({ stateKey: 'splitC' });
    mockRect({ width: 200 });
    pointerDown(0, { x: 120 }); // 60%
    pointerUp(0);
    expect(JSON.parse(sessionStorage.getItem('splitC')!)).toEqual([60, 40]);
  });

  it('restores a persisted layout on mount, overriding the declared [size] seed', async () => {
    sessionStorage.setItem('splitD', JSON.stringify([20, 80]));
    await render({
      stateKey: 'splitD',
      panels: [
        { size: 30, label: 'A' }, // declared seed is 30/70…
        { size: 70, label: 'B' },
      ],
    });
    expect(basis(0)).toBe('20%'); // …but the stored 20/80 wins
    expect(basis(1)).toBe('80%');
    expect(valueNow(0)).toBe('20'); // and the ARIA triple tracks the restored size
  });

  it('restores from localStorage when [stateStorage]="local"', async () => {
    localStorage.setItem('splitE', JSON.stringify([15, 85]));
    await render({ stateKey: 'splitE', stateStorage: 'local' });
    expect(basis(0)).toBe('15%');
  });

  it('does not emit (resizeEnd) on restore (a restore is not a user resize)', async () => {
    sessionStorage.setItem('splitF', JSON.stringify([20, 80]));
    await render({ stateKey: 'splitF' });
    expect(basis(0)).toBe('20%'); // it did restore…
    expect(host.lastResize).toBeNull(); // …without firing the output
  });

  it('ignores a corrupt stored entry, falling back to the declared seed', async () => {
    sessionStorage.setItem('splitG', 'not-json{');
    await render({ stateKey: 'splitG' });
    expect(basis(0)).toBe('30%'); // seed, not a thrown error
  });

  it('ignores a stored entry whose length no longer matches the panel set (structural change)', async () => {
    sessionStorage.setItem('splitH', JSON.stringify([50, 50])); // saved with 2 panes…
    await render({
      stateKey: 'splitH',
      panels: [
        { size: 20, label: 'A' }, // …restored under 3 → mismatch → ignored
        { size: 30, label: 'B' },
        { size: 50, label: 'C' },
      ],
    });
    expect(basis(0)).toBe('20%'); // the fresh 3-pane seed wins
    expect(basis(2)).toBe('50%');
  });

  it('ignores a stored entry with a non-numeric element', async () => {
    sessionStorage.setItem('splitI', JSON.stringify([20, 'oops']));
    await render({ stateKey: 'splitI' });
    expect(basis(0)).toBe('30%'); // seed
  });

  it('sanitizes a tampered stored entry whose values do not sum to 100', async () => {
    // A right-length numeric array is still untrusted (another origin script / a hand-edit) — [1000, 1000]
    // must not render a 1000%/1000% layout; it's re-normalized to the 50/50 it proportionally describes.
    sessionStorage.setItem('splitM', JSON.stringify([1000, 1000]));
    await render({ stateKey: 'splitM' });
    expect(basis(0)).toBe('50%');
    expect(basis(1)).toBe('50%');
  });

  it('clamps a tampered negative stored value up to 0 (aria stays in range)', async () => {
    sessionStorage.setItem('splitN', JSON.stringify([-50, 150]));
    await render({ stateKey: 'splitN' });
    // normalize keeps the sum at 100, then min-enforcement raises the negative pane to its 0 minimum.
    expect(parseFloat(basis(0))).toBeGreaterThanOrEqual(0);
    expect(Number(valueNow(0))).toBeGreaterThanOrEqual(
      Number(dividers()[0].getAttribute('aria-valuemin')),
    );
  });

  it('re-enforces minSize on a restored layout (an out-of-range stored value cannot be announced)', async () => {
    // Stored 90/10 but pane B now declares min 30 — the restore is corrected to [70, 30] so aria stays valid.
    sessionStorage.setItem('splitJ', JSON.stringify([90, 10]));
    await render({
      stateKey: 'splitJ',
      panels: [
        { size: 50, label: 'A' },
        { size: 50, min: 30, label: 'B' },
      ],
    });
    expect(parseFloat(basis(1))).toBeGreaterThanOrEqual(30);
    const now = Number(valueNow(0));
    expect(now).toBeLessThanOrEqual(Number(dividers()[0].getAttribute('aria-valuemax')));
  });

  it('is SSR-safe: no storage access and no throw under a server platform', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await render({ stateKey: 'splitK', platform: 'server' });
    key(0, 'ArrowRight');
    expect(valueNow(0)).toBe('40'); // the resize still works…
    expect(setItem).not.toHaveBeenCalled(); // …but persistence is a no-op off the browser
    expect(sessionStorage.getItem('splitK')).toBeNull();
  });

  it('is best-effort: a storage write that throws (quota/disabled) does not break the resize', async () => {
    await render({ stateKey: 'splitL' });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => key(0, 'ArrowRight')).not.toThrow();
    expect(valueNow(0)).toBe('40'); // the resize committed…
    expect(host.lastResize).toEqual([40, 60]); // …and resizeEnd still emitted
  });

  it('does not re-restore after a live [stateKey] change (the latch holds), but persists under the new key', async () => {
    sessionStorage.setItem('old-key', JSON.stringify([20, 80]));
    sessionStorage.setItem('new-key', JSON.stringify([55, 45])); // a DIFFERENT stored layout under the new key
    await render({ stateKey: 'old-key' });
    expect(basis(0)).toBe('20%'); // restored once from old-key
    host.stateKey.set('new-key'); // consumer swaps the key at runtime
    fixture.detectChanges();
    expect(basis(0)).toBe('20%'); // teeth: the latch holds — it must NOT jump to new-key's 55/45
    key(0, 'ArrowRight'); // a fresh resize persists under the NEW key (20→30)…
    expect(JSON.parse(sessionStorage.getItem('new-key')!)).toEqual([30, 70]); // …overwriting the seeded 55/45
    expect(JSON.parse(sessionStorage.getItem('old-key')!)).toEqual([20, 80]); // old key untouched
  });

  it('falls back to the seed when READING storage throws (private mode / sandboxed iframe)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    await render({ stateKey: 'splitO' });
    expect(basis(0)).toBe('30%'); // the read throw is swallowed → declared seed, not a page-breaking crash
  });

  it('ignores a stored value that parses to a non-array object', async () => {
    // An array-LIKE object must not be treated as an array (only `Array.isArray` passes the gate).
    sessionStorage.setItem('splitP', JSON.stringify({ 0: 50, 1: 50, length: 2 }));
    await render({ stateKey: 'splitP' });
    expect(basis(0)).toBe('30%'); // seed
  });

  it('does not pollute Object.prototype from a crafted __proto__ payload', async () => {
    sessionStorage.setItem('splitQ', '{"__proto__":{"polluted":123}}');
    await render({ stateKey: 'splitQ' });
    expect(basis(0)).toBe('30%'); // non-array → ignored
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined(); // JSON.parse doesn't walk the setter
  });

  it('is SSR-safe on the READ path too: a seeded entry is not restored under a server platform', async () => {
    sessionStorage.setItem('splitSSR', JSON.stringify([20, 80]));
    await render({ stateKey: 'splitSSR', platform: 'server' });
    expect(basis(0)).toBe('30%'); // storage is never read off the browser → declared seed
  });

  it('sanitizes a tampered entry whose values overflow the sum to Infinity (no all-zero collapse)', async () => {
    sessionStorage.setItem('splitInf', JSON.stringify([1e308, 1e308]));
    await render({ stateKey: 'splitInf' });
    // normalize treats the non-finite sum as the equal-split fallback, not the degenerate 0%/0% x/Infinity gives.
    expect(basis(0)).toBe('50%');
    expect(basis(1)).toBe('50%');
  });

  it('restores a saved layout even when the panel count grows across ticks (the latch waits for a match)', async () => {
    sessionStorage.setItem('splitGrow', JSON.stringify([25, 25, 50])); // saved with THREE panes
    await render({
      stateKey: 'splitGrow',
      panels: [
        { size: 30, label: 'A' }, // …but mounts with only TWO (a 3rd arrives async, e.g. behind an @if)
        { size: 70, label: 'B' },
      ],
    });
    expect(basis(0)).toBe('30%'); // stored length 3 ≠ 2 → not yet restored (the 2-pane seed shows)
    host.panels.set([
      { size: 40, label: 'A' },
      { size: 40, label: 'B' },
      { size: 20, label: 'C' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    // Now the counts match → the saved 25/25/50 restores, NOT the fresh 40/40/20 seed. Teeth vs an eager latch
    // (which would have closed on the 2-pane tick and dropped this legitimate restore forever).
    expect(basis(0)).toBe('25%');
    expect(basis(2)).toBe('50%');
  });

  it('restores after [stateKey] is set asynchronously (blank at content-init does not close the latch)', async () => {
    sessionStorage.setItem('late-key', JSON.stringify([20, 80]));
    await render({ stateKey: '' }); // no key at mount…
    expect(basis(0)).toBe('30%'); // …nothing restored yet
    host.stateKey.set('late-key'); // the key arrives after content-init
    fixture.detectChanges();
    await fixture.whenStable();
    expect(basis(0)).toBe('20%'); // teeth vs an eager latch: the async key still restores
  });

  // --- Collapse / expand ([collapsible], Enter — APG Window Splitter optional behaviour, #325) ---

  it('collapses the leading pane to its min on Enter and restores it on a second Enter', async () => {
    await render({
      collapsible: true,
      panels: [
        { size: 30, label: 'A' },
        { size: 70, label: 'B' },
      ],
    });
    const ev = key(0, 'Enter'); // collapse
    expect(ev.defaultPrevented).toBe(true); // we handled Enter — no browser default
    expect(basis(0)).toBe('0%'); // default minSize is 0 → a true collapse
    expect(valueNow(0)).toBe('0');
    expect(host.lastResize).toEqual([0, 100]);

    key(0, 'Enter'); // restore
    expect(basis(0)).toBe('30%'); // back to the pre-collapse size
    expect(valueNow(0)).toBe('30');
  });

  it('leaves Enter inert when [collapsible] is false (default) — no resize, no preventDefault', async () => {
    await render({
      panels: [
        { size: 30, label: 'A' },
        { size: 70, label: 'B' },
      ],
    }); // collapsible defaults false
    const ev = key(0, 'Enter');
    expect(ev.defaultPrevented).toBe(false); // untouched — the default keyboard path is byte-identical
    expect(basis(0)).toBe('30%');
    expect(host.lastResize).toBeNull();
  });

  it('collapses to minSize (never below), keeping aria-valuenow >= aria-valuemin', async () => {
    await render({
      collapsible: true,
      panels: [
        { size: 40, min: 15, label: 'A' },
        { size: 60, label: 'B' },
      ],
    });
    key(0, 'Enter'); // collapse to the pane's min, not to 0
    expect(basis(0)).toBe('15%');
    expect(valueNow(0)).toBe('15');
    expect(dividers()[0].getAttribute('aria-valuemin')).toBe('15'); // valuenow (15) >= valuemin (15): coherent
    key(0, 'Enter'); // restore
    expect(basis(0)).toBe('40%');
  });

  it('does nothing when the leading pane is already at its min (no restore point, no spurious emit)', async () => {
    await render({
      collapsible: true,
      panels: [
        { size: 20, min: 20, label: 'A' },
        { size: 80, label: 'B' },
      ],
    });
    host.lastResize = null;
    key(0, 'Enter'); // already at min → collapse is a no-op, stores no memory
    expect(basis(0)).toBe('20%');
    expect(host.lastResize).toBeNull();
    key(0, 'Enter'); // and a second Enter must not "restore-to-min" — still a clean no-op
    expect(basis(0)).toBe('20%');
    expect(host.lastResize).toBeNull();
  });

  it('emits resizeEnd and persists the collapsed layout when a [stateKey] is set', async () => {
    await render({
      collapsible: true,
      stateKey: 'collapse-persist',
      panels: [
        { size: 30, label: 'A' },
        { size: 70, label: 'B' },
      ],
    });
    key(0, 'Enter'); // collapse
    expect(host.lastResize).toEqual([0, 100]);
    expect(JSON.parse(sessionStorage.getItem('collapse-persist')!)).toEqual([0, 100]);
  });

  it('clears the restore point when the divider is manually resized (dragging a collapsed pane open un-collapses it)', async () => {
    await render({
      collapsible: true,
      panels: [
        { size: 30, label: 'A' },
        { size: 70, label: 'B' },
      ],
    });
    key(0, 'Enter'); // collapse (memory: restore → 30)
    expect(basis(0)).toBe('0%');
    key(0, 'ArrowRight'); // manual resize grows it to 10 — this must clear the restore point
    expect(basis(0)).toBe('10%');
    key(0, 'Enter'); // no memory → collapses AGAIN (does NOT restore to the stale 30)
    expect(basis(0)).toBe('0%');
    key(0, 'Enter'); // restore now returns to 10 (the re-based pre-collapse size), proving the memory re-based
    expect(basis(0)).toBe('10%');
  });

  it('collapses on Enter in a vertical splitter too (collapse is axis-independent)', async () => {
    await render({
      layout: 'vertical',
      collapsible: true,
      panels: [
        { size: 30, label: 'A' },
        { size: 70, label: 'B' },
      ],
    });
    key(0, 'Enter');
    expect(basis(0)).toBe('0%');
    expect(host.lastResize).toEqual([0, 100]);
  });

  it('drops a stale restore point when the panel set changes structurally (indices shift)', async () => {
    await render({
      collapsible: true,
      panels: [
        { size: 30, label: 'A' },
        { size: 70, label: 'B' },
      ],
    });
    key(0, 'Enter'); // collapse A → memory{0:30}
    expect(basis(0)).toBe('0%');
    // Insert a pane at the front: divider 0 now sits between the NEW pane and A. The stale memory{0} MUST be
    // dropped, or the next Enter "restores" the wrong divider to a stale size instead of collapsing.
    host.panels.set([
      { size: 20, label: 'X' },
      { size: 30, label: 'A' },
      { size: 50, label: 'B' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    key(0, 'Enter'); // memory cleared → a FRESH collapse of the new leading pane (0%), not a stale restore (30%)
    expect(basis(0)).toBe('0%');
  });

  it('keeps a restore point through a no-op restore so a later Enter recovers (adjacent double-collapse)', async () => {
    await render({
      collapsible: true,
      panels: [
        { size: 40, label: 'A' },
        { size: 40, label: 'B' },
        { size: 20, label: 'C' },
      ],
    });
    key(0, 'Enter'); // collapse A → [0,80,20], memory{0:40}
    expect(basis(0)).toBe('0%');
    key(1, 'Enter'); // collapse B → [0,0,100], memory{0:40,1:80}
    expect(basis(1)).toBe('0%');
    key(0, 'Enter'); // restoring A is a NO-OP now (the A/B pair is pinned at 0) — memory{0} must SURVIVE
    expect(basis(0)).toBe('0%');
    key(1, 'Enter'); // restore B → [0,80,20]
    expect(basis(1)).toBe('80%');
    key(0, 'Enter'); // NOW restore A succeeds → 40%, proving memory{0} survived the earlier no-op restore
    expect(basis(0)).toBe('40%');
  });

  it('clears the restore point on a pointer drag too (docstring: a drag un-collapses, not just arrows)', async () => {
    await render({
      collapsible: true,
      panels: [
        { size: 30, label: 'A' },
        { size: 70, label: 'B' },
      ],
    });
    mockRect({ width: 200, height: 200 });
    key(0, 'Enter'); // collapse A → 0, memory{0:30}
    expect(basis(0)).toBe('0%');
    pointerDown(0, { x: 50 }); // drag to 50/200 = 25% — a committed drag clears the restore point
    pointerUp(0);
    expect(basis(0)).toBe('25%');
    key(0, 'Enter'); // no memory → collapses AGAIN (does not restore the stale 30)
    expect(basis(0)).toBe('0%');
  });

  it('collapses on Enter under RTL identically (collapse never reads the direction)', async () => {
    await render({
      dir: 'rtl',
      collapsible: true,
      panels: [
        { size: 30, label: 'A' },
        { size: 70, label: 'B' },
      ],
    });
    key(0, 'Enter');
    expect(basis(0)).toBe('0%'); // same as LTR — toggleCollapse/setLeading never consult isRtl()
    expect(host.lastResize).toEqual([0, 100]);
    key(0, 'Enter');
    expect(basis(0)).toBe('30%');
  });

  it('an Enter-collapse before an async [stateKey] restore closes the restore window (no clobber)', async () => {
    // A previous session saved a 50/50 layout under the key.
    sessionStorage.setItem('late-collapse-key', JSON.stringify([50, 50]));
    await render({
      collapsible: true,
      panels: [
        { size: 30, label: 'A' },
        { size: 70, label: 'B' },
      ],
    }); // key blank at content-init
    key(0, 'Enter'); // user collapses A BEFORE the key arrives — this must close the restore latch
    expect(basis(0)).toBe('0%');
    host.stateKey.set('late-collapse-key'); // the key arrives late (async binding); the restore effect re-runs
    fixture.detectChanges();
    await fixture.whenStable();
    expect(basis(0)).toBe('0%'); // the stored 50/50 must NOT clobber the live collapse
  });

  // --- Parity extras: [gutterSize] + double-click reset (#325) ---

  it('[gutterSize] drives the --cae-splitter-gutter-size custom property; default leaves it unset', async () => {
    await render({ gutterSize: 24 });
    expect(gutterSizeVar()).toBe('24px');

    // Clearing the input removes the property → the gutter falls back to the --cae-space-2 token.
    host.gutterSize.set(undefined);
    fixture.detectChanges();
    expect(gutterSizeVar()).toBe('');
  });

  it('a non-positive [gutterSize] is ignored (property unset) and dev-warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render({ gutterSize: 0 });
    expect(gutterSizeVar()).toBe(''); // no px var → token thickness holds; the divider can't vanish
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[gutterSize]'));
  });

  it('double-click resets a divider’s pair to the seeded RATIO within its current span, leaving others untouched', async () => {
    await render({
      panels: [
        { size: 30, label: 'A' },
        { size: 30, label: 'B' },
        { size: 40, label: 'C' },
      ],
    });
    // Move the ADJACENT divider first, so the reset pair's combined span CHANGES — this is the teeth for
    // "seeded ratio within the CURRENT span" vs a naive reset-to-absolute-seed (which would land A at 30).
    // ArrowRight on divider 1 grows B 30 → 40 (C 40 → 30); the (A,B) pair span is now 70, and C sits at 30.
    key(1, 'ArrowRight');
    expect(valueNow(1)).toBe('40');
    expect(basis(2)).toBe('30%');

    // Double-click divider 0: restore the 30:30 seeded ratio across the 70 span → A = 70×30/60 = 35, B = 35;
    // pane C is untouched at 30. A reset to the ABSOLUTE seed would give A=30 — the '35' is what has teeth.
    doubleClick(0);
    expect(valueNow(0)).toBe('35');
    expect(valueNow(1)).toBe('35');
    expect(basis(2)).toBe('30%');
  });

  it('double-click emits resizeEnd when it changes the layout, and is a silent no-op at the seeded split', async () => {
    await render({
      panels: [
        { size: 40, label: 'A' },
        { size: 60, label: 'B' },
      ],
    });
    key(0, 'ArrowLeft'); // A 40 → 30
    host.lastResize = null;

    doubleClick(0); // resets A:B to the 40:60 seed → a real change → emits
    expect(valueNow(0)).toBe('40');
    expect(host.lastResize).not.toBeNull();

    // Already at the seeded split now → a second double-click commits nothing and emits nothing.
    host.lastResize = null;
    doubleClick(0);
    expect(host.lastResize).toBeNull();
  });
});

// --- Born-rtl [dir] (#364) ---
// The seeded-FakeDirectionality RTL tests above pass under BOTH the old toSignal(change,{initialValue})
// idiom and the direct value read — the double reports 'rtl' from construction. Only a real CDK `Dir`
// ancestor bound rtl by a *property* binding reproduces the born-rtl gap this slice closes, so it needs
// its own host. Mirrors the pick-list #342/#364 guard.

/** Wraps the splitter under a CDK `Dir` ancestor bound rtl before the first paint. */
@Component({
  selector: 'cae-splitter-rtl-host',
  imports: [CaeSplitter, CaeSplitterPanel, Dir],
  template: `
    <div [dir]="direction()">
      <cae-splitter ariaLabel="Resize panels">
        <cae-splitter-panel [size]="30">A</cae-splitter-panel>
        <cae-splitter-panel [size]="70">B</cae-splitter-panel>
      </cae-splitter>
    </div>
  `,
})
class SplitterRtlHost {
  readonly direction = signal<Direction>('rtl');
}

describe('CaeSplitter — born-rtl [dir] (#364)', () => {
  it('measures the horizontal axis as RTL on first paint under a born-rtl [dir] binding', async () => {
    // rtl is bound BEFORE the first detectChanges: the parent Dir applies rtl in the same update pass
    // but never emits `change` (it's pre-init), so the older toSignal(change,{initialValue}) idiom would
    // read 'ltr' and mis-measure the drag axis on first paint. Reading the signal-backed
    // Directionality.value catches it.
    const fixture = TestBed.createComponent(SplitterRtlHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();

    const divider = (fixture.nativeElement as HTMLElement).querySelector('[role="separator"]')!;
    // ArrowRight moves toward the RTL start edge (right) → the leading pane SHRINKS 30 → 20 (step 10).
    // Under the born-rtl bug isRtl() would be false and ArrowRight would GROW it to 40.
    divider.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(divider.getAttribute('aria-valuenow')).toBe('20');

    fixture.nativeElement.remove();
  });
});
