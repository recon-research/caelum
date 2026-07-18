import { Dir, Direction } from '@angular/cdk/bidi';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

import { CaeCarousel, CaeCarouselResponsiveOption } from './carousel';
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

  // #580 — [(page)] is a plain model(0) and model() takes no `transform`, so a consumer can write any
  // number into it. NaN (a parseInt on empty input, an undefined async field) and fractions (a computed
  // ratio) both survive a bare min/max clamp, and neither is `===` any indicator index — so every
  // `i === clampedPage()` goes false at once and the group is left with ZERO tab stops: the carousel is
  // keyboard-unreachable before a key is pressed (WCAG 2.1.1), which a functional nav test sails past.
  // `.set()` is the same signal a `[(page)]` binding writes.
  it('normalises a NaN page instead of emptying the tab order', async () => {
    // Seed a NON-zero page first: starting from the default 0 and asserting 0 cannot distinguish
    // "the bad value was healed" from "the bad value was silently ignored" — both leave page 0.
    carousel.page.set(3);
    await sync();
    carousel.page.set(NaN);
    await sync();
    const tabbable = indicators().filter((b) => b.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(indicators()[0]);
    expect(activePage()).toBe(0);
    // and the model is healed rather than leaving NaN latched in the consumer's binding
    expect(carousel.page()).toBe(0);
  });

  it('truncates a fractional page instead of emptying the tab order', async () => {
    carousel.page.set(2.5);
    await sync();
    const tabbable = indicators().filter((b) => b.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(indicators()[2]);
    expect(activePage()).toBe(2);
    expect(carousel.page()).toBe(2);
  });

  it('never emits a non-finite page to the consumer when goTo() is handed a NaN', async () => {
    const emitted: number[] = [];
    carousel.page.subscribe((p: number) => emitted.push(p));
    carousel.goTo(2);
    await sync();
    carousel.goTo(NaN);
    await sync();
    // Asserting page() alone here would have NO teeth: the reconcile effect launders a NaN write back
    // to 0 before the assertion runs, so the test passes with the goTo guard deleted. What the guard
    // actually prevents is the spurious pageChange(NaN) the consumer observes in between.
    expect(emitted.every(Number.isFinite)).toBe(true);
    expect(carousel.page()).toBe(0);
  });

  // The index guard clamps against `totalPages() - 1` — but that BOUND is itself derived from two
  // un-coerced consumer numbers, and `Math.max(1, NaN)` is NaN. A NaN window size therefore poisons the
  // bound, which no amount of index clamping can rescue, and the failure is strictly worse than #580's:
  // the control bar renders not at all and EVERY slide goes inert + aria-hidden, so the carousel leaves
  // the tab order and the a11y tree together. `responsiveOptions` overrides reach the same path
  // completely uncoerced (a plain interface, no numberAttribute).
  it('survives a NaN [numVisible] — the clamp bound, not just the clamped value', async () => {
    await setInput({ numVisible: NaN });
    expect(Number.isNaN(carousel.page())).toBe(false);
    expect(indicators().length).toBeGreaterThan(0);
    expect(visibleSlides().length).toBeGreaterThan(0);
    expect(nextBtn()).not.toBeNull();
  });

  it('survives a NaN [numScroll] (the other half of the poisoned bound)', async () => {
    await setInput({ numScroll: NaN });
    expect(Number.isNaN(carousel.page())).toBe(false);
    expect(indicators().length).toBeGreaterThan(0);
    expect(visibleSlides().length).toBeGreaterThan(0);
  });

  // ±Infinity must keep clamping to the ends exactly as it did before #580 — this is what separates
  // "truncate, then reject only NaN" from an up-front `Number.isFinite` gate, which would send
  // +Infinity to page 0 while a merely huge 1e21 still landed on the last page. Nothing else pins it.
  it('still clamps +/-Infinity and huge finite values to the ends', async () => {
    carousel.page.set(Infinity);
    await sync();
    expect(carousel.page()).toBe(4); // 5 items, numVisible 1 -> pages 0..4

    carousel.page.set(1e21);
    await sync();
    expect(carousel.page()).toBe(4);

    carousel.page.set(-Infinity);
    await sync();
    expect(carousel.page()).toBe(0);
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

  // #560 — the relative arrow cases step from clampedPage(), not the pressed dot's index. The two only
  // diverge when the page moves without focus following it (a swipe, or a consumer [(page)] write), so
  // every test above — which drives from the active dot — passes under either rule and can't catch this.
  it('steps arrows from the ACTIVE page, not the focused dot (#560)', async () => {
    document.body.appendChild(fixture.nativeElement);
    indicators()[0].focus();

    carousel.page.set(1); // external page change; focus stays on the now-stale dot 0
    await sync();
    expect(document.activeElement).toBe(indicators()[0]);
    expect(activePage()).toBe(1);

    key(indicators()[0], 'ArrowRight');

    // Old rule: target = pressed 0 + 1 = 1 → goTo(1) no-ops on the current page → the press is
    // swallowed and focus lands on dot 1, so the user must press twice to advance once.
    expect(carousel.page()).toBe(2);
    expect(document.activeElement).toBe(indicators()[2]);
    expect(activePage()).toBe(2); // render tracks the model — the assertions above aren't taking it on faith
  });

  it('re-syncs focus to the active dot when an arrow clamps at a bound (#560)', async () => {
    document.body.appendChild(fixture.nativeElement);

    // Reach the stale-focus state the way a user actually can: keyboard to the last page (focus
    // follows), THEN an external write moves the page back. Seeding it by focusing a tabindex="-1"
    // dot directly would test a state no route produces — clicking a dot calls goTo() and syncs it.
    indicators()[0].focus();
    key(indicators()[0], 'End');
    expect(carousel.page()).toBe(4);

    carousel.page.set(0); // external change; focus stays stranded on dot 4
    await sync();
    expect(document.activeElement).toBe(indicators()[4]);
    expect(activePage()).toBe(0);

    key(indicators()[4], 'ArrowLeft'); // from = 0 → target -1 → clamped to 0

    expect(carousel.page()).toBe(0);
    // goTo no-ops, but focus must still come home to the real tab stop: dot 0 holds tabindex 0 and
    // dot 4 holds -1, so leaving focus on 4 keeps the user on an element Tab order excludes.
    expect(document.activeElement).toBe(indicators()[0]);
  });

  it('indicator arrows wrap under [circular], matching the nav buttons (#573)', async () => {
    document.body.appendChild(fixture.nativeElement);
    await setInput({ circular: true });
    indicators()[0].focus();

    key(indicators()[0], 'End');
    expect(carousel.page()).toBe(4); // the last page

    key(indicators()[4], 'ArrowRight');
    // Before #573 this clamped, so a keyboard user dead-ended on a carousel where the nav button,
    // autoplay and touch swipe all wrap — an operable-parity gap between input modalities.
    expect(carousel.page()).toBe(0);
    expect(document.activeElement).toBe(indicators()[0]);

    key(indicators()[0], 'ArrowLeft');
    expect(carousel.page()).toBe(4); // and backwards past the start

    // Home/End are destinations, not steps: no wrap even here. The implementation leans on their targets
    // already being in range rather than on a branch, so pin BOTH ends — End alone only covers the
    // positive-overshoot side, and it's Home (target 0) the modulo would silently send to the last page
    // if the target ever went negative.
    key(indicators()[4], 'End');
    expect(carousel.page()).toBe(4);

    key(indicators()[4], 'Home');
    expect(carousel.page()).toBe(0);
  });

  it('leaves Alt+Arrow to the browser (#581)', () => {
    document.body.appendChild(fixture.nativeElement);
    indicators()[0].focus();
    const ev = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    indicators()[0].dispatchEvent(ev);
    expect(carousel.page()).toBe(0); // did not advance
    expect(ev.defaultPrevented).toBe(false);
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

// ---- Responsive numVisible/numScroll by viewport (#276) ----

@Component({
  imports: [CaeCarousel, CaeCarouselItem],
  template: `
    <cae-carousel
      [value]="items()"
      [numVisible]="numVisible()"
      [numScroll]="numScroll()"
      [responsiveOptions]="responsive()"
      ariaLabel="Responsive carousel"
    >
      <ng-template caeCarouselItem let-item>{{ item }}</ng-template>
    </cae-carousel>
  `,
})
class ResponsiveHost {
  readonly items = signal<string[]>(['a', 'b', 'c', 'd', 'e', 'f']); // 6 items
  readonly numVisible = signal(1);
  readonly numScroll = signal(1);
  readonly responsive = signal<CaeCarouselResponsiveOption[]>([]);
}

describe('CaeCarousel responsive (#276)', () => {
  const q = (bp: string): string => `(max-width: ${bp})`;
  let realMatchMedia: typeof window.matchMedia;
  let fixture: ComponentFixture<ResponsiveHost>;
  let host: ResponsiveHost;

  // A controllable matchMedia fake: `matching` is the set of query strings that currently match, and
  // `fire()` flips one and notifies its listeners exactly as a real MediaQueryList change does.
  // `listenerCount()` reports the live `change` listeners registered for a query — so a leak (an onCleanup
  // that removed the wrong reference, leaving the real listener attached) is caught, not just "removeEventListener
  // was called at all".
  function installMatchMedia(matching: Set<string>): {
    fire: (query: string, matches: boolean) => void;
    listenerCount: (query: string) => number;
  } {
    const registry = new Map<string, Set<() => void>>();
    const mm = (query: string) => ({
      media: query,
      get matches(): boolean {
        return matching.has(query);
      },
      addEventListener: (_type: 'change', cb: () => void): void => {
        let set = registry.get(query);
        if (!set) registry.set(query, (set = new Set()));
        set.add(cb);
      },
      removeEventListener: (_type: 'change', cb: () => void): void => {
        registry.get(query)?.delete(cb);
      },
    });
    (window as unknown as { matchMedia: (query: string) => unknown }).matchMedia = mm;
    const fire = (query: string, matches: boolean): void => {
      if (matches) matching.add(query);
      else matching.delete(query);
      registry.get(query)?.forEach((cb) => cb());
    };
    const listenerCount = (query: string): number => registry.get(query)?.size ?? 0;
    return { fire, listenerCount };
  }

  async function mount(responsive: CaeCarouselResponsiveOption[]): Promise<void> {
    await TestBed.configureTestingModule({ imports: [ResponsiveHost] }).compileComponents();
    fixture = TestBed.createComponent(ResponsiveHost);
    host = fixture.componentInstance;
    host.responsive.set(responsive);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges(); // the responsive effect sets `matches`; a second pass renders the resolved window
    await fixture.whenStable();
  }

  const visibleCount = (): number =>
    Array.from(fixture.nativeElement.querySelectorAll('.cae-carousel__item')).filter(
      (s) => !(s as HTMLElement).hasAttribute('inert'),
    ).length;
  const indicatorCount = (): number =>
    fixture.nativeElement.querySelectorAll('.cae-carousel__indicator').length; // = totalPages when > 1

  beforeEach(() => {
    realMatchMedia = window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    fixture?.nativeElement.remove();
  });

  it('applies a matching breakpoint override (numVisible 3 → 3 slides, 2 pages)', async () => {
    installMatchMedia(new Set([q('1024px')]));
    await mount([{ breakpoint: '1024px', numVisible: 3, numScroll: 3 }]);
    expect(visibleCount()).toBe(3);
    expect(indicatorCount()).toBe(2); // ceil((6-3)/3)+1
  });

  it('picks the NARROWEST matching rule when several match', async () => {
    // A viewport ≤ 560 matches both max-width rules; the 560 rule (numVisible 1) must win over 1024's 3.
    installMatchMedia(new Set([q('1024px'), q('560px')]));
    await mount([
      { breakpoint: '1024px', numVisible: 3, numScroll: 3 },
      { breakpoint: '560px', numVisible: 1, numScroll: 1 },
    ]);
    expect(visibleCount()).toBe(1);
    expect(indicatorCount()).toBe(6);
  });

  it('falls back to the base window when no rule matches', async () => {
    installMatchMedia(new Set()); // a wide viewport: nothing matches
    await mount([{ breakpoint: '1024px', numVisible: 3, numScroll: 3 }]);
    expect(visibleCount()).toBe(1); // base numVisible
    expect(indicatorCount()).toBe(6);
  });

  it('re-resolves live when the viewport crosses a breakpoint, and removes listeners on destroy', async () => {
    const { fire, listenerCount } = installMatchMedia(new Set([q('1024px')]));
    await mount([{ breakpoint: '1024px', numVisible: 3, numScroll: 3 }]);
    expect(visibleCount()).toBe(3); // starts matched
    expect(listenerCount(q('1024px'))).toBe(1); // one live change listener while mounted

    fire(q('1024px'), false); // viewport grows past 1024 → the rule stops matching
    fixture.detectChanges();
    await fixture.whenStable();
    expect(visibleCount()).toBe(1); // re-resolved to the base window live, no re-mount

    fixture.destroy();
    expect(listenerCount(q('1024px'))).toBe(0); // onCleanup removed the ACTUAL listener (no leak)
  });
});

// ---- RTL: inline-axis mirroring under a born-rtl [dir] (#276) ----

// Wraps the carousel under a REAL CDK `Dir` ancestor bound rtl BEFORE the first paint — a seeded
// FakeDirectionality would report 'rtl' from construction and so pass under both the correct value-read and
// the buggy toSignal(change,{initialValue}) idiom (no teeth). Only the born-rtl property binding exercises
// the first-paint read (mirrors the cae-splitter / cae-image-compare #364 guard).
@Component({
  selector: 'cae-carousel-rtl-host',
  imports: [CaeCarousel, CaeCarouselItem, Dir],
  template: `
    <div [dir]="direction()">
      <cae-carousel [value]="items()" [numVisible]="1" ariaLabel="RTL carousel">
        <ng-template caeCarouselItem let-item>{{ item }}</ng-template>
      </cae-carousel>
    </div>
  `,
})
class CarouselRtlHost {
  readonly direction = signal<Direction>('rtl');
  readonly items = signal<string[]>(['a', 'b', 'c', 'd', 'e', 'f']); // 6 items, numVisible 1 → 6 pages
}

describe('CaeCarousel RTL (#276)', () => {
  let fixture: ComponentFixture<CarouselRtlHost>;

  async function mount(direction: Direction): Promise<CaeCarousel<string>> {
    await TestBed.configureTestingModule({ imports: [CarouselRtlHost] }).compileComponents();
    fixture = TestBed.createComponent(CarouselRtlHost);
    fixture.componentInstance.direction.set(direction); // set before first CD → born-rtl
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.debugElement.query(By.directive(CaeCarousel)).componentInstance;
  }

  const transform = (): string =>
    (fixture.nativeElement.querySelector('.cae-carousel__track') as HTMLElement).style.transform;
  const activeIndicator = (): HTMLElement =>
    fixture.nativeElement.querySelector('.cae-carousel__indicator[aria-current="true"]');
  const arrow = (el: HTMLElement, k: string): void => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };

  afterEach(() => fixture?.nativeElement.remove());

  it('mirrors the sliding-window transform toward the inline-start under a born-rtl [dir]', async () => {
    const carousel = await mount('rtl');
    carousel.goTo(1); // windowStart 1, itemBasis 100% → offset 100%
    fixture.detectChanges();
    await fixture.whenStable();
    expect(transform()).toBe('translateX(100%)'); // RTL: positive (inline-start); the LTR form is -100%
    // the chevron RTL CSS hinges on this host class — assert it tracks isRtl() (the transform reads
    // isRtl() directly, so a class-name typo would otherwise ship silently until the #240 browser pass).
    const el = fixture.nativeElement.querySelector('.cae-carousel') as HTMLElement;
    expect(el.classList.contains('cae-carousel--rtl')).toBe(true);
  });

  it('keeps the LTR transform negative — the flip is conditional, not always-positive', async () => {
    const carousel = await mount('ltr');
    carousel.goTo(1);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(transform()).toBe('translateX(-100%)');
  });

  it('flips the indicator Left/Right arrows to follow visual order under RTL', async () => {
    const carousel = await mount('rtl');
    activeIndicator().focus();
    arrow(activeIndicator(), 'ArrowLeft'); // physically left = the later page in RTL → advance
    expect(carousel.page()).toBe(1); // LTR would treat ArrowLeft as prev and clamp at 0
  });

  it('does NOT flip Up/Down under RTL (the block axis is direction-independent)', async () => {
    const carousel = await mount('rtl');
    activeIndicator().focus();
    arrow(activeIndicator(), 'ArrowDown'); // Down = next regardless of direction
    expect(carousel.page()).toBe(1);
  });
});

// ---- Vertical orientation (#276) ----

// Fixed orientation="vertical", wrapped in a REAL CDK Dir so the block-axis-is-direction-independent claim
// can be exercised born-rtl (a seeded FakeDirectionality would pass under both idioms — no teeth, per #364).
@Component({
  selector: 'cae-carousel-vertical-host',
  imports: [CaeCarousel, CaeCarouselItem, Dir],
  template: `
    <div [dir]="direction()">
      <cae-carousel
        [value]="items()"
        [orientation]="'vertical'"
        [verticalViewportHeight]="height()"
        ariaLabel="Vertical carousel"
      >
        <ng-template caeCarouselItem let-item>{{ item }}</ng-template>
      </cae-carousel>
    </div>
  `,
})
class CarouselVerticalHost {
  readonly direction = signal<Direction>('ltr');
  readonly items = signal<string[]>(['a', 'b', 'c', 'd', 'e', 'f']); // 6 items, numVisible 1 → 6 pages
  readonly height = signal('20rem');
}

describe('CaeCarousel vertical (#276)', () => {
  let fixture: ComponentFixture<CarouselVerticalHost>;

  async function mount(direction: Direction): Promise<CaeCarousel<string>> {
    await TestBed.configureTestingModule({ imports: [CarouselVerticalHost] }).compileComponents();
    fixture = TestBed.createComponent(CarouselVerticalHost);
    fixture.componentInstance.direction.set(direction); // set before first CD → born-rtl for the RTL case
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.debugElement.query(By.directive(CaeCarousel)).componentInstance;
  }

  const carouselEl = (): HTMLElement =>
    fixture.nativeElement.querySelector('.cae-carousel') as HTMLElement;
  const viewportVar = (): string =>
    (
      fixture.nativeElement.querySelector('.cae-carousel__viewport') as HTMLElement
    ).style.getPropertyValue('--cae-carousel-viewport-block-size');
  const transform = (): string =>
    (fixture.nativeElement.querySelector('.cae-carousel__track') as HTMLElement).style.transform;

  afterEach(() => fixture?.nativeElement.remove());

  it('stacks the window on the block axis (translateY) and sizes the viewport from verticalViewportHeight', async () => {
    const carousel = await mount('ltr');
    expect(carouselEl().classList.contains('cae-carousel--vertical')).toBe(true);
    // The bound height flows to the CSS custom property the vertical viewport reads its block-size from.
    expect(viewportVar()).toBe('20rem');

    carousel.goTo(1); // windowStart 1, itemBasis 100% → offset 100%, on the block axis
    fixture.detectChanges();
    expect(transform()).toBe('translateY(-100%)'); // Y, not X — the vertical branch

    // A custom height flows through too (guards against a hardcoded viewport size).
    fixture.componentInstance.height.set('400px');
    fixture.detectChanges();
    expect(viewportVar()).toBe('400px');
  });

  it('keeps the vertical transform on the block axis under a born-rtl [dir] (no inline mirror)', async () => {
    const carousel = await mount('rtl'); // the block axis is direction-independent
    expect(carouselEl().classList.contains('cae-carousel--rtl')).toBe(true);
    carousel.goTo(1);
    fixture.detectChanges();
    await fixture.whenStable();
    // Still translateY(-100%): NOT translateX, and NOT the positive RTL flip a horizontal carousel would use.
    expect(transform()).toBe('translateY(-100%)');
  });
});

// ---- Touch swipe-to-advance (#276) ----

// Its own host so `swipe` and `orientation` can both be varied, wrapped in a REAL CDK Dir so the RTL arm
// exercises a born-rtl read rather than a seeded fake (#364, as the RTL/vertical hosts above do).
@Component({
  selector: 'cae-carousel-swipe-host',
  imports: [CaeCarousel, CaeCarouselItem, Dir],
  template: `
    <div [dir]="direction()">
      <cae-carousel
        [value]="items()"
        [numVisible]="1"
        [swipe]="swipe()"
        [orientation]="orientation()"
        [autoplayInterval]="autoplay()"
        ariaLabel="Swipe carousel"
      >
        <ng-template caeCarouselItem let-item>{{ item }}</ng-template>
      </cae-carousel>
    </div>
  `,
})
class CarouselSwipeHost {
  readonly direction = signal<Direction>('ltr');
  readonly orientation = signal<'horizontal' | 'vertical'>('horizontal');
  readonly swipe = signal(true);
  readonly autoplay = signal(0); // 0 = off; tests that need it use an interval long enough never to fire
  readonly items = signal<string[]>(['a', 'b', 'c', 'd', 'e', 'f']); // 6 items, numVisible 1 → 6 pages
}

describe('CaeCarousel swipe (#276)', () => {
  let fixture: ComponentFixture<CarouselSwipeHost>;

  async function mount(
    setup: (h: CarouselSwipeHost) => void = () => {},
  ): Promise<CaeCarousel<string>> {
    await TestBed.configureTestingModule({ imports: [CarouselSwipeHost] }).compileComponents();
    fixture = TestBed.createComponent(CarouselSwipeHost);
    setup(fixture.componentInstance); // before first CD → born-rtl / born-vertical
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.debugElement.query(By.directive(CaeCarousel)).componentInstance;
  }

  afterEach(() => fixture.nativeElement.remove());

  const viewport = (): HTMLElement =>
    fixture.nativeElement.querySelector('.cae-carousel__viewport') as HTMLElement;
  const page = (): number =>
    Array.from(
      fixture.nativeElement.querySelectorAll('.cae-carousel__indicator') as NodeListOf<HTMLElement>,
    ).findIndex((b) => b.getAttribute('aria-current') === 'true');

  /** Drag from (x,y) by (dx,dy) and release. `pointerType` 'mouse' exercises the text-selection carve-out. */
  async function drag(
    dx: number,
    dy: number,
    { pointerType = 'touch', release = true } = {},
  ): Promise<void> {
    const el = viewport();
    const opts = { bubbles: true, cancelable: true, pointerType, pointerId: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: 200, clientY: 200 }));
    if (release) {
      el.dispatchEvent(
        new PointerEvent('pointerup', { ...opts, clientX: 200 + dx, clientY: 200 + dy }),
      );
    } else {
      el.dispatchEvent(new PointerEvent('pointercancel', opts));
    }
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('advances a page on a swipe toward the start of the inline axis', async () => {
    // The content follows the finger, so dragging LEFT in LTR pulls the next page into view. Also pins the
    // horizontal touch-action claim: the movement axis is denied, the perpendicular one and zoom survive.
    await mount();
    expect(page()).toBe(0);
    expect(viewport().style.touchAction).toBe('pan-y pinch-zoom');
    await drag(-80, 0);
    expect(page()).toBe(1);
  });

  it('goes back a page on a swipe the other way', async () => {
    const c = await mount();
    c.goTo(2);
    fixture.detectChanges();
    await drag(80, 0);
    expect(page()).toBe(1);
  });

  it('ignores travel below the threshold, so a tap on slide content is not a page change', async () => {
    // The guard that keeps interactive slide content usable — a tap (and any incidental few-px drag) must
    // leave the page alone. Without it every press inside a slide would flip the carousel.
    await mount();
    await drag(-40, 0); // under SWIPE_THRESHOLD_PX (50)
    expect(page()).toBe(0);
  });

  it('ignores MOUSE drags so text selection still works', async () => {
    // Deliberate carve-out, not an oversight: on a pointer device press-and-move selects text. Well past the
    // threshold, and still no page change.
    await mount();
    await drag(-300, 0, { pointerType: 'mouse' });
    expect(page()).toBe(0);
  });

  it('mirrors direction in RTL (inline axis follows visual order)', async () => {
    // Follow-the-finger, NOT the arrow-key rule (arrows are the opposite — ArrowLeft advances in RTL).
    // trackTransform renders translateX(+offset%) in RTL, so the next page sits to the LEFT and you drag
    // RIGHT to pull it in; a leftward drag — which advances in LTR — therefore goes BACK here.
    const c = await mount((h) => h.direction.set('rtl'));
    c.goTo(2);
    fixture.detectChanges();
    await drag(-80, 0);
    expect(page()).toBe(1);
  });

  it('uses the BLOCK axis when vertical, and does not mirror it in RTL', async () => {
    // A vertical carousel moves on the block axis, which is direction-independent — so an upward swipe
    // advances in both directions. Born-rtl via a real CDK Dir, so a mistaken isRtl() flip here would show.
    const c = await mount((h) => {
      h.orientation.set('vertical');
      h.direction.set('rtl');
    });
    await drag(0, -80);
    expect(page()).toBe(1);
    // ...and a horizontal drag on a vertical carousel does nothing at all.
    c.goTo(1);
    fixture.detectChanges();
    await drag(-300, 0);
    expect(page()).toBe(1);
  });

  it('claims only the block axis via touch-action when vertical, and keeps pinch-zoom', async () => {
    // The mirror of the horizontal claim asserted in the first test. `pinch-zoom` must be listed explicitly:
    // a bare `pan-x` REVOKES pinch- and double-tap-zoom, and touch-action intersects down the ancestor
    // chain, so that would strip zoom from projected slide content (a low-vision user pinching an image
    // slide gets nothing). Separate `it` because mount() reconfigures the TestBed.
    await mount((h) => h.orientation.set('vertical'));
    expect(viewport().style.touchAction).toBe('pan-x pinch-zoom');
  });

  it('does nothing, and claims no axis, when [swipe] is off', async () => {
    // The opt-out for slides with their own scrollable region on the carousel's axis — the touch-action
    // claim must lift too, or the escape hatch would not actually give the axis back.
    await mount((h) => h.swipe.set(false));
    await drag(-300, 0);
    expect(page()).toBe(0);
    expect(viewport().style.touchAction).toBe('');
  });

  // Raw dispatch helpers for the gestures the `drag` shorthand cannot express (multi-finger, a nested
  // control's preventDefault, a mid-gesture input change).
  const opts = { bubbles: true, cancelable: true, pointerType: 'touch' } as const;
  const down = (id: number, x: number, y = 200): PointerEvent =>
    new PointerEvent('pointerdown', { ...opts, pointerId: id, clientX: x, clientY: y });
  const up = (id: number, x: number, y = 200): PointerEvent =>
    new PointerEvent('pointerup', { ...opts, pointerId: id, clientX: x, clientY: y });
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  it('ignores a second finger, so a pinch is not a page change', async () => {
    // The slot is keyed by pointerId. Unkeyed, finger B's pointerdown overwrites the origin and finger A's
    // release is measured against it — a stationary finger A yields delta 200-500 = -300, well past the
    // threshold, so an attempted pinch-zoom on an image slide would page the carousel.
    await mount();
    const el = viewport();
    el.dispatchEvent(down(1, 200));
    el.dispatchEvent(down(2, 500));
    el.dispatchEvent(up(1, 200)); // finger A lifts exactly where it landed
    await settle();
    expect(page()).toBe(0);
  });

  it('does not let a second finger resolve the first finger’s gesture', async () => {
    // Isolates BOTH halves of the pointerId keying, which the test above cannot: it passes if either half
    // survives. Here finger B travels far and releases. Drop the re-entrancy guard and B's origin replaces
    // A's (500→100 = -400, commits); drop the id match and B's release resolves A's origin
    // (200→100 = -100, commits). Only both together keep the page still.
    await mount();
    const el = viewport();
    el.dispatchEvent(down(1, 200));
    el.dispatchEvent(down(2, 500));
    el.dispatchEvent(up(2, 100));
    await settle();
    expect(page()).toBe(0);
  });

  it('yields to a nested control that already claimed the gesture', async () => {
    // cae-splitter / cae-image-compare / cae-image-preview preventDefault() on pointerdown AND set
    // touch-action:none, so the browser never pans and never sends pointercancel to disarm us. Without the
    // defaultPrevented check, dragging a splitter divider inside a slide resizes the pane AND pages.
    await mount();
    const slide = fixture.nativeElement.querySelector('.cae-carousel__item') as HTMLElement;
    slide.addEventListener('pointerdown', (e) => e.preventDefault()); // stand-in for the nested control
    slide.dispatchEvent(down(1, 200)); // bubbles to the viewport already default-prevented
    viewport().dispatchEvent(up(1, 100)); // a 100px drag: well past the threshold
    await settle();
    expect(page()).toBe(0);
  });

  it('ignores a diagonal flick dominated by the cross axis', async () => {
    // A scroll attempt, not a page change. The browser usually claims it and fires pointercancel — but not
    // when the page has nothing to scroll, which is when this guard is the only thing standing.
    await mount();
    await drag(-55, -300); // past the threshold on X, but overwhelmingly a Y gesture
    expect(page()).toBe(0);
  });

  it('does not commit when [swipe] is turned off mid-gesture', async () => {
    // onSwipeStart armed under swipe=true; only onSwipeEnd's own guard can catch the flip. The axis claim
    // has already been released by then, so committing would page against a viewport that no longer owns
    // the gesture.
    await mount();
    viewport().dispatchEvent(down(1, 200));
    fixture.componentInstance.swipe.set(false);
    await settle();
    viewport().dispatchEvent(up(1, 100));
    await settle();
    expect(page()).toBe(0);
  });

  it('stops autoplay on a committed swipe, and wakes the live region', async () => {
    // A swipe fires neither mouseenter nor focusin, so the hover/focus pause never engages: the timer keeps
    // running and can advance the page moments after the user's own gesture, landing them a page past where
    // they aimed. The button paths are immune only by accident (clicking focuses, which pauses).
    await mount((h) => h.autoplay.set(100_000)); // long enough that only the STATE is under test
    const playBtn = (): HTMLElement =>
      fixture.nativeElement.querySelector('.cae-carousel__play') as HTMLElement;
    const track = (): HTMLElement =>
      fixture.nativeElement.querySelector('.cae-carousel__track') as HTMLElement;
    expect(playBtn().getAttribute('aria-label')).toBe('Pause autoplay');
    expect(track().getAttribute('aria-live')).toBe('off'); // silent while rotating
    await drag(-80, 0);
    expect(page()).toBe(1);
    expect(playBtn().getAttribute('aria-label')).toBe('Start autoplay');
    // ...and with rotation stopped the region goes polite, so the revealed slide is announced.
    expect(track().getAttribute('aria-live')).toBe('polite');
  });

  it('leaves autoplay running when the swipe does not commit', async () => {
    // The stop belongs to a committed page change, not to every touch that lands on the viewport.
    await mount((h) => h.autoplay.set(100_000));
    await drag(-10, 0);
    expect(page()).toBe(0);
    expect(
      (fixture.nativeElement.querySelector('.cae-carousel__play') as HTMLElement).getAttribute(
        'aria-label',
      ),
    ).toBe('Pause autoplay');
  });

  it('abandons the gesture on pointercancel', async () => {
    // A system gesture / interrupted touch must not leave the origin armed, or the NEXT unrelated release
    // would be measured against a stale start point and flip the page.
    await mount();
    await drag(-300, 0, { release: false }); // cancelled, not released
    expect(page()).toBe(0);
    // A later release with no press of its own must be inert, not resolved against the abandoned origin.
    viewport().dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerType: 'touch',
        pointerId: 1,
        clientX: -500,
        clientY: 200,
      }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(page()).toBe(0);
  });
});
