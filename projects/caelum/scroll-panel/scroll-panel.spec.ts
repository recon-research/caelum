import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

import { CaeScrollPanel } from './scroll-panel';

/** Host that projects signal-driven content + name so a test can flip the name/content at runtime. */
@Component({
  selector: 'cae-scroll-panel-host',
  imports: [CaeScrollPanel],
  template: `
    <cae-scroll-panel [ariaLabel]="label()">
      <div class="content-inner">{{ text() }}</div>
    </cae-scroll-panel>
  `,
})
class ScrollHost {
  readonly label = signal('');
  readonly text = signal('short');
}

/** Force the layout metrics jsdom otherwise reports as 0, so overflow can be driven deterministically. */
function mockMetrics(
  el: HTMLElement,
  m: { scrollHeight?: number; clientHeight?: number; scrollWidth?: number; clientWidth?: number },
): void {
  for (const [k, v] of Object.entries({
    scrollHeight: 0,
    clientHeight: 0,
    scrollWidth: 0,
    clientWidth: 0,
    ...m,
  })) {
    Object.defineProperty(el, k, { value: v, configurable: true });
  }
}

describe('CaeScrollPanel', () => {
  let fixture: ComponentFixture<ScrollHost>;
  let host: ScrollHost;
  let panel: HTMLElement;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Silence the dev-only accessible-name warning by default (it's asserted explicitly in its own test),
    // so the overflow-without-name cases don't spam the reporter — and stay green under a future
    // console-failing guard.
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  function render(opts: { label?: string; text?: string } = {}): void {
    fixture = TestBed.createComponent(ScrollHost);
    host = fixture.componentInstance;
    if (opts.label !== undefined) host.label.set(opts.label);
    if (opts.text !== undefined) host.text.set(opts.text);
    fixture.detectChanges();
    panel = fixture.nativeElement.querySelector('cae-scroll-panel') as HTMLElement;
  }

  /** The component instance driving `panel`. */
  function instance(): CaeScrollPanel {
    return fixture.debugElement.query(By.directive(CaeScrollPanel)).componentInstance;
  }

  /** Mock overflow metrics on the panel, run the (protected) measure, then flush host bindings. */
  function measureWith(m: Parameters<typeof mockMetrics>[1]): void {
    mockMetrics(panel, m);
    (instance() as unknown as { measureOverflow(): void }).measureOverflow();
    fixture.detectChanges();
  }

  it('projects content into the token scroll container', () => {
    render();
    expect(panel.classList.contains('cae-scroll-panel')).toBe(true);
    const inner = panel.querySelector('.cae-scroll-panel__content .content-inner');
    expect(inner?.textContent).toContain('short');
  });

  it('applies the CdkScrollable host directive (registers with the ScrollDispatcher)', () => {
    render();
    // The host directive is resolvable on the element injector, proving it is applied to the container.
    const scrollable = fixture.debugElement
      .query(By.directive(CaeScrollPanel))
      .injector.get(CdkScrollable);
    expect(scrollable).toBeTruthy();
    expect(scrollable.getElementRef().nativeElement).toBe(panel);
  });

  it('exposes no tab stop and no landmark while the content fits', () => {
    render({ label: 'Notes' });
    measureWith({ scrollHeight: 100, clientHeight: 100, scrollWidth: 100, clientWidth: 100 });
    expect(panel.getAttribute('tabindex')).toBeNull();
    expect(panel.getAttribute('role')).toBeNull();
    expect(panel.getAttribute('aria-label')).toBeNull();
  });

  it('becomes keyboard-focusable when the content overflows vertically', () => {
    render();
    measureWith({ scrollHeight: 300, clientHeight: 100 });
    expect(panel.getAttribute('tabindex')).toBe('0');
  });

  it('becomes keyboard-focusable when the content overflows horizontally', () => {
    render();
    measureWith({ scrollWidth: 300, clientWidth: 100 });
    expect(panel.getAttribute('tabindex')).toBe('0');
  });

  it('exposes a named region only when it overflows AND is named', () => {
    render({ label: 'Release notes' });
    measureWith({ scrollHeight: 300, clientHeight: 100 });
    expect(panel.getAttribute('tabindex')).toBe('0');
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-label')).toBe('Release notes');
  });

  it('is keyboard-scrollable but not a landmark when overflowing without a name', () => {
    render();
    measureWith({ scrollHeight: 300, clientHeight: 100 });
    expect(panel.getAttribute('tabindex')).toBe('0'); // still scrollable by keyboard
    expect(panel.getAttribute('role')).toBeNull(); // but no unnamed landmark
    expect(panel.getAttribute('aria-label')).toBeNull();
  });

  it('exposes no region for a named panel whose content fits', () => {
    render({ label: 'Notes' });
    measureWith({ scrollHeight: 80, clientHeight: 100 });
    expect(panel.getAttribute('tabindex')).toBeNull();
    expect(panel.getAttribute('role')).toBeNull();
  });

  it('tolerates a 1px sub-pixel difference (not treated as overflow)', () => {
    render();
    measureWith({ scrollHeight: 101, clientHeight: 100 });
    expect(panel.getAttribute('tabindex')).toBeNull();
    measureWith({ scrollHeight: 102, clientHeight: 100 });
    expect(panel.getAttribute('tabindex')).toBe('0');
  });

  it('reacts to a name applied after it is already overflowing', () => {
    render();
    measureWith({ scrollHeight: 300, clientHeight: 100 });
    expect(panel.getAttribute('role')).toBeNull();
    host.label.set('Log output');
    fixture.detectChanges();
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-label')).toBe('Log output');
  });

  it('dev-warns when an overflowing panel has no accessible name (and not when named)', () => {
    render();
    measureWith({ scrollHeight: 300, clientHeight: 100 });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no accessible name'));

    warnSpy.mockClear();
    render({ label: 'Named' });
    measureWith({ scrollHeight: 300, clientHeight: 100 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('retains focus instead of dumping to <body> when overflow clears while focused (WCAG 2.4.3)', () => {
    render();
    document.body.appendChild(fixture.nativeElement); // attached, so focus() genuinely focuses
    measureWith({ scrollHeight: 300, clientHeight: 100 }); // overflowing → tabindex 0
    panel.focus();
    expect(document.activeElement).toBe(panel);
    measureWith({ scrollHeight: 80, clientHeight: 100 }); // now fits, while still focused
    expect(document.activeElement).toBe(panel); // focus retained, NOT lost to <body>
    expect(panel.getAttribute('tabindex')).toBe('-1'); // focusable, but out of the tab order
    fixture.destroy();
  });

  it('observes the host + content via ResizeObserver and disconnects on destroy', async () => {
    const observed: Element[] = [];
    let disconnects = 0;
    class FakeResizeObserver {
      constructor(readonly cb: ResizeObserverCallback) {}
      observe(el: Element): void {
        observed.push(el);
      }
      unobserve(): void {}
      disconnect(): void {
        disconnects++;
      }
    }
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      render();
      await fixture.whenStable(); // flush afterNextRender, where the observer is wired
      const content = panel.querySelector('.cae-scroll-panel__content');
      expect(observed).toContain(panel);
      expect(observed).toContain(content);
      fixture.destroy();
      expect(disconnects).toBe(1);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
