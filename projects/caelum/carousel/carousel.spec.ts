import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

import { CaeCarousel } from './carousel';
import { CaeCarouselItem } from './carousel-item';

// A projecting host — a carousel needs an item template, so every functional test drives it through one
// (mirrors cae-tree-table's TemplatedHost). Inputs are host properties so a test can vary numVisible /
// numScroll / circular / autoplay and re-render.
@Component({
  imports: [CaeCarousel, CaeCarouselItem],
  template: `
    <cae-carousel
      [value]="items()"
      [numVisible]="numVisible()"
      [numScroll]="numScroll()"
      [circular]="circular()"
      [autoplayInterval]="autoplay()"
      ariaLabel="Demo carousel"
    >
      <ng-template caeCarouselItem let-item let-i="index">
        <span class="slide">{{ i }}:{{ item }}</span>
      </ng-template>
    </cae-carousel>
  `,
})
class Host {
  // Signals (not plain fields): in zoneless CD a bound plain property mutation isn't propagated to the
  // child input by fixture.detectChanges(); a signal read in the template is, when .set() marks it.
  readonly items = signal<string[]>(['a', 'b', 'c', 'd', 'e']);
  readonly numVisible = signal(1);
  readonly numScroll = signal(1);
  readonly circular = signal(false);
  readonly autoplay = signal(0);
}

describe('CaeCarousel', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let carousel: CaeCarousel<string>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    carousel = fixture.debugElement.query(By.directive(CaeCarousel)).componentInstance;
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  const carouselEl = (): HTMLElement =>
    fixture.debugElement.query(By.directive(CaeCarousel)).nativeElement;
  const all = (sel: string): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll(sel));
  const one = (sel: string): HTMLElement | null => fixture.nativeElement.querySelector(sel);
  const slides = (): HTMLElement[] => all('.cae-carousel__item');
  const visibleSlides = (): HTMLElement[] => slides().filter((s) => !s.hasAttribute('inert'));
  const indicators = (): HTMLElement[] => all('.cae-carousel__indicator');
  const activePage = (): number =>
    indicators().findIndex((b) => b.getAttribute('aria-current') === 'true');
  const nextBtn = (): HTMLButtonElement | null => one('.cae-carousel__nav--next') as never;
  const prevBtn = (): HTMLButtonElement | null => one('.cae-carousel__nav--prev') as never;
  const sync = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const setInput = async (patch: Record<string, unknown>): Promise<void> => {
    for (const [k, v] of Object.entries(patch)) {
      (host as unknown as Record<string, { set(value: unknown): void }>)[k].set(v);
    }
    await sync();
  };
  const key = (el: HTMLElement, k: string): KeyboardEvent => {
    const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    fixture.detectChanges();
    return ev;
  };

  it('creates', () => {
    expect(carousel).toBeTruthy();
  });

  it('renders one slide per value item', () => {
    expect(slides()).toHaveLength(5);
    expect(slides()[0].textContent?.trim()).toBe('0:a');
    expect(slides()[4].textContent?.trim()).toBe('4:e');
  });

  it('names the carousel per the APG (group + roledescription + accessible name)', () => {
    const cx = carouselEl();
    expect(cx.getAttribute('role')).toBe('group');
    expect(cx.getAttribute('aria-roledescription')).toBe('carousel');
    expect(cx.getAttribute('aria-label')).toBe('Demo carousel');
  });

  it('marks each slide as a labelled slide group ("N of M")', () => {
    const s = slides();
    expect(s[0].getAttribute('role')).toBe('group');
    expect(s[0].getAttribute('aria-roledescription')).toBe('slide');
    expect(s[0].getAttribute('aria-label')).toBe('1 of 5');
    expect(s[4].getAttribute('aria-label')).toBe('5 of 5');
  });

  it('keeps only the current window non-inert; off-window slides are inert + aria-hidden', () => {
    expect(visibleSlides()).toHaveLength(1);
    expect(visibleSlides()[0].textContent?.trim()).toBe('0:a');
    // Off-window slides removed from tab order + a11y tree.
    expect(slides()[1].hasAttribute('inert')).toBe(true);
    expect(slides()[1].getAttribute('aria-hidden')).toBe('true');
  });

  it('renders one indicator per page (numVisible 1 → 5 pages)', () => {
    expect(indicators()).toHaveLength(5);
    expect(activePage()).toBe(0);
  });

  it('computes pages for a multi-item window (numVisible 2, numScroll 2, 5 items → 3 pages)', async () => {
    await setInput({ numVisible: 2, numScroll: 2 });
    // ceil((5 - 2) / 2) + 1 = ceil(1.5) + 1 = 3
    expect(indicators()).toHaveLength(3);
    expect(visibleSlides()).toHaveLength(2);
  });

  it('advances with the next button and moves the window + active page', () => {
    nextBtn()!.click();
    fixture.detectChanges();
    expect(carousel.page()).toBe(1);
    expect(activePage()).toBe(1);
    expect(visibleSlides()[0].textContent?.trim()).toBe('1:b');
  });

  it('marks prev aria-disabled at the start and next aria-disabled at the end (non-circular)', () => {
    // aria-disabled, NOT the disabled property — so the focused button keeps focus instead of blurring
    // to <body> when it dims at an end (WCAG 2.4.3). Native disabled must stay false.
    expect(prevBtn()!.getAttribute('aria-disabled')).toBe('true');
    expect(prevBtn()!.disabled).toBe(false);
    expect(nextBtn()!.getAttribute('aria-disabled')).toBeNull();
    carousel.goTo(4);
    fixture.detectChanges();
    expect(nextBtn()!.getAttribute('aria-disabled')).toBe('true');
    expect(nextBtn()!.disabled).toBe(false);
    expect(prevBtn()!.getAttribute('aria-disabled')).toBeNull();
  });

  it('keeps focus on the next button when it becomes aria-disabled at the end (no focus strand)', () => {
    document.body.appendChild(fixture.nativeElement);
    carousel.goTo(3);
    fixture.detectChanges();
    nextBtn()!.focus();
    expect(document.activeElement).toBe(nextBtn());
    // Advance to the last page → next dims (aria-disabled) but, being not natively disabled, keeps focus.
    nextBtn()!.click();
    fixture.detectChanges();
    expect(carousel.page()).toBe(4);
    expect(nextBtn()!.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(nextBtn());
  });

  it('wraps past the ends only when circular', async () => {
    // Non-circular: next() at the end stays put.
    carousel.goTo(4);
    fixture.detectChanges();
    carousel.next();
    fixture.detectChanges();
    expect(carousel.page()).toBe(4);

    await setInput({ circular: true });
    carousel.next();
    fixture.detectChanges();
    expect(carousel.page()).toBe(0);
    carousel.prev();
    fixture.detectChanges();
    expect(carousel.page()).toBe(4);
    // Navigators are never aria-disabled when circular.
    expect(prevBtn()!.getAttribute('aria-disabled')).toBeNull();
    expect(nextBtn()!.getAttribute('aria-disabled')).toBeNull();
  });

  it('clamps numScroll to numVisible so no interior slide is unreachable', async () => {
    // numScroll 3 > numVisible 1 would step over slides 1 and 3; clamped to 1 → every slide is a page.
    await setInput({ numVisible: 1, numScroll: 3 });
    expect(indicators()).toHaveLength(5);
    carousel.goTo(1);
    fixture.detectChanges();
    expect(visibleSlides()[0].textContent?.trim()).toBe('1:b'); // slide 1 is reachable
  });

  it('clamps an out-of-range page and corrects the two-way model', () => {
    carousel.goTo(99);
    fixture.detectChanges();
    expect(carousel.page()).toBe(4);
    expect(activePage()).toBe(4);
  });

  it('re-clamps the page when value shrinks below the current page', async () => {
    carousel.goTo(4);
    fixture.detectChanges();
    await setInput({ items: ['a', 'b'] });
    // 2 items, numVisible 1 → 2 pages (0,1); page 4 corrected to 1.
    expect(carousel.page()).toBe(1);
    expect(indicators()).toHaveLength(2);
  });

  it('hides the controls entirely when everything fits one page', async () => {
    await setInput({ numVisible: 5 });
    expect(indicators()).toHaveLength(0);
    expect(nextBtn()).toBeNull();
    expect(prevBtn()).toBeNull();
  });

  it('shows no play button when autoplay is off', () => {
    expect(one('.cae-carousel__play')).toBeNull();
    // …but the other controls are present.
    expect(nextBtn()).not.toBeNull();
    expect(indicators().length).toBeGreaterThan(0);
  });

  // ---- Indicator roving-tabindex keyboard ----

  it('makes only the active indicator tabbable (roving tabindex)', () => {
    const tabbable = indicators().filter((b) => b.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(indicators()[0]);
  });

  it('navigates indicators with Arrow/Home/End and moves focus + page', () => {
    document.body.appendChild(fixture.nativeElement);
    indicators()[0].focus();

    key(indicators()[0], 'ArrowRight');
    expect(carousel.page()).toBe(1);
    expect(activePage()).toBe(1);
    expect(document.activeElement).toBe(indicators()[1]);

    key(indicators()[1], 'End');
    expect(carousel.page()).toBe(4);
    expect(document.activeElement).toBe(indicators()[4]);

    key(indicators()[4], 'Home');
    expect(carousel.page()).toBe(0);
    expect(document.activeElement).toBe(indicators()[0]);

    key(indicators()[0], 'ArrowLeft'); // clamped — already at start
    expect(carousel.page()).toBe(0);
  });

  it('sets aria-live on the track (polite while idle so a page change is announced)', () => {
    const track = one('.cae-carousel__track')!;
    expect(track.getAttribute('aria-live')).toBe('polite');
  });
});

// ---- Autoplay (fake timers) ----

describe('CaeCarousel autoplay', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let carousel: CaeCarousel<string>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
    carousel = fixture.debugElement.query(By.directive(CaeCarousel)).componentInstance;
    // Switch to fake timers AFTER the real-timer compile/create, then arm autoplay so its interval
    // registers under the fake clock.
    vi.useFakeTimers();
    host.autoplay.set(1000);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    fixture.nativeElement.remove();
  });

  const carouselEl = (): HTMLElement =>
    fixture.debugElement.query(By.directive(CaeCarousel)).nativeElement;

  it('auto-advances on the interval and shows the play/pause control', () => {
    expect(fixture.nativeElement.querySelector('.cae-carousel__play')).not.toBeNull();
    expect(carousel.page()).toBe(0);
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(carousel.page()).toBe(1);
  });

  it('loops back to the start at the end (autoplay is inherently circular)', () => {
    // 5 pages: 0→1→2→3→4→0 over five ticks.
    vi.advanceTimersByTime(5000);
    fixture.detectChanges();
    expect(carousel.page()).toBe(0);
  });

  it('pauses on hover and resumes on leave (WCAG 2.2.2)', () => {
    carouselEl().dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    fixture.detectChanges();
    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(carousel.page()).toBe(0); // paused — no advance

    carouselEl().dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    fixture.detectChanges();
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(carousel.page()).toBe(1); // resumed
  });

  it('pauses on focus within the carousel', () => {
    carouselEl().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();
    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(carousel.page()).toBe(0);
  });

  it('stops for good when the play/pause control is toggled off', () => {
    carousel.togglePlay(); // pause
    fixture.detectChanges();
    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(carousel.page()).toBe(0);
    // Label reflects the paused intent.
    const play = fixture.nativeElement.querySelector('.cae-carousel__play') as HTMLElement;
    expect(play.getAttribute('aria-label')).toBe('Start autoplay');
  });

  it('sets aria-live off on the track while autoplaying', () => {
    const track = fixture.nativeElement.querySelector('.cae-carousel__track') as HTMLElement;
    expect(track.getAttribute('aria-live')).toBe('off');
  });
});

// ---- prefers-reduced-motion: no auto-start ----

describe('CaeCarousel reduced motion', () => {
  let realMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    realMatchMedia = window.matchMedia;
    (
      window as unknown as { matchMedia: (q: string) => { matches: boolean; media: string } }
    ).matchMedia = (q: string) => ({ matches: true, media: q });
  });

  afterEach(() => {
    window.matchMedia = realMatchMedia;
    vi.useRealTimers();
  });

  it('does not auto-start autoplay when the OS requests reduced motion', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.autoplay.set(1000);
    fixture.detectChanges();
    const carousel = fixture.debugElement.query(By.directive(CaeCarousel))
      .componentInstance as CaeCarousel<string>;

    vi.useFakeTimers();
    vi.advanceTimersByTime(5000);
    fixture.detectChanges();
    expect(carousel.page()).toBe(0); // no motion started

    // …but an explicit user request still starts it (reduced motion suppresses AUTO-start, not control).
    carousel.togglePlay();
    fixture.detectChanges();
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(carousel.page()).toBe(1);
    fixture.nativeElement.remove();
  });
});

// ---- Dev-warnings + text fallback (bare component) ----

describe('CaeCarousel dev-warnings', () => {
  let warnings: string[];
  let realWarn: typeof console.warn;

  beforeEach(() => {
    warnings = [];
    realWarn = console.warn;
    console.warn = (msg?: unknown) => warnings.push(String(msg));
  });

  afterEach(() => {
    console.warn = realWarn;
  });

  it('warns when no accessible name is given', async () => {
    await TestBed.configureTestingModule({ imports: [CaeCarousel] }).compileComponents();
    const fixture = TestBed.createComponent(CaeCarousel);
    fixture.componentRef.setInput('value', ['a', 'b']);
    fixture.detectChanges();
    expect(warnings.some((w) => w.includes('no [ariaLabel]'))).toBe(true);
    // Unnamed → no aria-roledescription (a nameless "carousel" announcement is worse than none).
    expect(fixture.nativeElement.getAttribute('aria-roledescription')).toBeNull();
    fixture.nativeElement.remove();
  });

  it('warns and falls back to the item string form when no item template is projected', async () => {
    await TestBed.configureTestingModule({ imports: [CaeCarousel] }).compileComponents();
    const fixture = TestBed.createComponent(CaeCarousel);
    fixture.componentRef.setInput('value', ['alpha', 'beta']);
    fixture.componentRef.setInput('ariaLabel', 'Bare');
    fixture.detectChanges();
    expect(warnings.some((w) => w.includes('no <ng-template caeCarouselItem>'))).toBe(true);
    const first = fixture.nativeElement.querySelector('.cae-carousel__item');
    expect(first?.textContent?.trim()).toBe('alpha');
    fixture.nativeElement.remove();
  });
});

// A host that binds a pre-set two-way [(page)] against an initially-empty (async-loaded) value — the
// case #290 guards. Uses the signal-safe explicit [page]/(pageChange) form (table.spec precedent). It is
// a separate host because the primary suite seeds a non-empty value, which can't reproduce the
// empty-value clobber the reconcile effect used to cause.
@Component({
  imports: [CaeCarousel, CaeCarouselItem],
  template: `
    <cae-carousel
      [value]="items()"
      [page]="page()"
      (pageChange)="page.set($event)"
      ariaLabel="Async carousel"
    >
      <ng-template caeCarouselItem let-item>{{ item }}</ng-template>
    </cae-carousel>
  `,
})
class AsyncHost {
  readonly items = signal<string[]>([]);
  readonly page = signal(3);
}

describe('CaeCarousel — async-loaded value with a pre-set page (#290)', () => {
  let fixture: ComponentFixture<AsyncHost>;
  let host: AsyncHost;

  async function mount(): Promise<void> {
    await TestBed.configureTestingModule({ imports: [AsyncHost] }).compileComponents();
    fixture = TestBed.createComponent(AsyncHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => fixture.nativeElement.remove());

  it('does not clobber a pre-set page to 0 while value is transiently empty', async () => {
    await mount();
    // value is [] here; without the guard the reconcile effect would have reset page to 0 (totalPages=1).
    expect(host.items()).toHaveLength(0);
    expect(host.page()).toBe(3);
  });

  it('preserves the pre-set page once the async items arrive (in range → no clamp), and renders it', async () => {
    await mount();
    host.items.set(['a', 'b', 'c', 'd', 'e', 'f']); // 6 items, numVisible 1 → pages 0..5
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.page()).toBe(3);
    // the render tracks the preserved page: the active indicator is the 4th of six.
    const indicators = Array.from(
      fixture.nativeElement.querySelectorAll('.cae-carousel__indicator'),
    ) as HTMLElement[];
    expect(indicators).toHaveLength(6);
    expect(indicators.findIndex((b) => b.getAttribute('aria-current') === 'true')).toBe(3);
  });

  it('still clamps a now-out-of-range page down once a shorter set loads (convergence preserved)', async () => {
    await mount(); // page pre-set to 3, value empty → guarded, page stays 3
    expect(host.page()).toBe(3);
    host.items.set(['a', 'b', 'c']); // 3 items, numVisible 1 → pages 0..2; page 3 is now out of range
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.page()).toBe(2); // reconciled down to the last valid page
  });
});
