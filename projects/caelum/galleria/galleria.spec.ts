import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dir, type Direction } from '@angular/cdk/bidi';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { of, Subject } from 'rxjs';

import { CaeDialog } from 'caelum/dialog';
import { CaeGalleria, type CaeGalleriaItem, type CaeGalleriaResponsiveOption } from './galleria';
import { CaeGalleriaItemDef, CaeGalleriaThumbnailDef } from './galleria-item';

const ITEMS: readonly CaeGalleriaItem[] = [
  { src: 'a.jpg', alt: 'Alpha' },
  { src: 'b.jpg', alt: 'Bravo', thumbnailSrc: 'b-thumb.jpg', caption: 'The bravo shot' },
  { src: 'c.jpg', alt: 'Charlie' },
];

describe('CaeGalleria', () => {
  let fixture: ComponentFixture<CaeGalleria>;
  let component: CaeGalleria;
  let el: HTMLElement;
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /** Create the galleria, apply inputs, attach to the document (focus tests need a live tree), render. */
  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(CaeGalleria);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('items', ITEMS);
    fixture.componentRef.setInput('ariaLabel', 'Product photos');
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await settle();
  }

  const tabs = (): HTMLButtonElement[] =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const tabpanel = (): HTMLElement | null => el.querySelector('[role="tabpanel"]');
  const navPrev = (): HTMLButtonElement | null => el.querySelector('.cae-galleria__nav--prev');
  const navNext = (): HTMLButtonElement | null => el.querySelector('.cae-galleria__nav--next');
  const status = (): HTMLElement | null => el.querySelector('.cae-galleria__sr-status');
  const mainImg = (): HTMLImageElement | null => el.querySelector('.cae-galleria__image');

  beforeEach(() => {
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
  });

  afterEach(() => {
    overlayContainer.ngOnDestroy();
    fixture?.nativeElement.remove();
  });

  it('labels the gallery as a group (role=group, not a region landmark) with a roledescription', async () => {
    await render();
    const region = el.querySelector('.cae-galleria')!;
    // role="group" (not a bare labelled section → region landmark) avoids landmark spam for N galleries.
    expect(region.getAttribute('role')).toBe('group');
    expect(region.getAttribute('aria-roledescription')).toBe('gallery');
    expect(region.getAttribute('aria-label')).toBe('Product photos');
  });

  it('drops aria-roledescription when unlabeled (invalid on an unnamed group)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fixture = TestBed.createComponent(CaeGalleria);
    fixture.componentRef.setInput('items', ITEMS); // no ariaLabel
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await settle();
    const region = el.querySelector('.cae-galleria')!;
    expect(region.getAttribute('aria-roledescription')).toBeNull();
    expect(region.getAttribute('aria-label')).toBeNull();
    warn.mockRestore();
  });

  it('shows the active image and a tabpanel labelled by the active thumbnail tab', async () => {
    await render();
    expect(mainImg()!.getAttribute('src')).toBe('a.jpg');
    expect(mainImg()!.getAttribute('alt')).toBe('Alpha');
    const panel = tabpanel()!;
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[0].id);
  });

  it('renders a thumbnail tablist: role=tab, aria-selected only on the active, aria-controls→panel', async () => {
    await render();
    expect(el.querySelector('[role="tablist"]')!.getAttribute('aria-label')).toBe(
      'Image thumbnails',
    );
    const t = tabs();
    expect(t).toHaveLength(3);
    expect(t.map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    const panelId = tabpanel()!.id;
    expect(t.every((b) => b.getAttribute('aria-controls') === panelId)).toBe(true);
  });

  it('uses a roving tabindex — only the active thumbnail is a tab stop', async () => {
    await render({ activeIndex: 1 });
    expect(tabs().map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('falls back to src when a thumbnail has no thumbnailSrc, and uses thumbnailSrc when present', async () => {
    await render();
    const thumbImgs = el.querySelectorAll<HTMLImageElement>('.cae-galleria__thumb-image');
    expect(thumbImgs[0].getAttribute('src')).toBe('a.jpg'); // no thumbnailSrc → src
    expect(thumbImgs[1].getAttribute('src')).toBe('b-thumb.jpg'); // has thumbnailSrc
    // Thumbnail <img> is alt="" (decorative) — the tab button carries the accessible name instead.
    expect(thumbImgs[0].getAttribute('alt')).toBe('');
    expect(tabs()[0].getAttribute('aria-label')).toBe('Alpha (1 of 3)');
  });

  it('selects an image on thumbnail click (value = index; tabpanel label follows)', async () => {
    await render();
    tabs()[2].click();
    await settle();
    expect(component.activeIndex()).toBe(2);
    expect(mainImg()!.getAttribute('alt')).toBe('Charlie');
    expect(tabpanel()!.getAttribute('aria-labelledby')).toBe(tabs()[2].id);
  });

  it('roving keyboard: ArrowRight selects + moves focus to the next thumbnail', async () => {
    await render();
    tabs()[0].focus();
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(component.activeIndex()).toBe(1);
    expect(document.activeElement).toBe(tabs()[1]);
  });

  it('roving keyboard: Home and End jump to the first and last image', async () => {
    await render({ activeIndex: 1 });
    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await settle();
    expect(component.activeIndex()).toBe(2);
    tabs()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await settle();
    expect(component.activeIndex()).toBe(0);
  });

  it('clamps at the ends when not circular (ArrowLeft at 0 stays at 0)', async () => {
    await render();
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await settle();
    expect(component.activeIndex()).toBe(0);
  });

  it('thumbnail tablist arrows also wrap under [circular] (#573)', async () => {
    // The dots and the strip share arrowTarget(), so this is the same logic — but the strip is a
    // role="tablist" (APG Tabs, where wrap is the explicit optional variant) and the dots are a plain
    // role="group". Pin the tablist contract directly so a future re-split of the handlers can't drop it.
    await render({ circular: true, activeIndex: 2 });
    tabs()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(component.activeIndex()).toBe(0);
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('thumbnail arrows step from the ACTIVE image, not the pressed thumb (#572)', async () => {
    await render();
    tabs()[0].focus();
    // A consumer [(activeIndex)] write moves the selection without moving focus, so the focused thumb (0)
    // and the active thumb (1) diverge. That divergence is the whole bug.
    fixture.componentRef.setInput('activeIndex', 1);
    await settle();
    expect(document.activeElement).toBe(tabs()[0]);
    expect(component.activeIndex()).toBe(1);

    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    // Pre-fix the target came from the PRESSED index (0 + 1 = 1) — already the active image, so goTo
    // no-oped and the keypress was silently swallowed. Asserting focus too kills a page-only fix.
    expect(component.activeIndex()).toBe(2);
    expect(document.activeElement).toBe(tabs()[2]);
  });

  it('prev/next navigators move the view and go aria-disabled at the ends (non-circular)', async () => {
    await render();
    expect(navPrev()!.getAttribute('aria-disabled')).toBe('true'); // at start
    expect(navNext()!.getAttribute('aria-disabled')).toBeNull();

    navNext()!.click();
    navNext()!.click();
    await settle();
    expect(component.activeIndex()).toBe(2);
    expect(navNext()!.getAttribute('aria-disabled')).toBe('true'); // at end
    expect(navPrev()!.getAttribute('aria-disabled')).toBeNull();
  });

  it('wraps past the ends when circular', async () => {
    await render({ circular: true, activeIndex: 2 });
    expect(navNext()!.getAttribute('aria-disabled')).toBeNull(); // never disabled when circular
    navNext()!.click();
    await settle();
    expect(component.activeIndex()).toBe(0);
  });

  it('announces position through a polite live region that updates on navigation', async () => {
    await render();
    expect(status()!.getAttribute('aria-live')).toBe('polite');
    expect(status()!.textContent!.trim()).toBe('Image 1 of 3');
    navNext()!.click();
    await settle();
    expect(status()!.textContent!.trim()).toBe('Image 2 of 3');
  });

  it('clamps an out-of-range activeIndex back into the set (reconcile effect)', async () => {
    await render({ activeIndex: 99 });
    expect(component.activeIndex()).toBe(2); // last valid index
    expect(mainImg()!.getAttribute('alt')).toBe('Charlie');
  });

  it('hides navigators and the thumbnail strip for a single image', async () => {
    fixture = TestBed.createComponent(CaeGalleria);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('items', [{ src: 'solo.jpg', alt: 'Solo' }]);
    fixture.componentRef.setInput('ariaLabel', 'One photo');
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await settle();
    expect(mainImg()!.getAttribute('alt')).toBe('Solo');
    expect(navNext()).toBeNull();
    expect(el.querySelector('[role="tablist"]')).toBeNull();
    // No tablist → the main view must NOT be an orphan tabpanel with a dangling aria-labelledby.
    const stage = el.querySelector('.cae-galleria__stage')!;
    expect(stage.getAttribute('role')).toBeNull();
    expect(stage.getAttribute('aria-labelledby')).toBeNull();
  });

  it('drops the tab semantics when showThumbnails is false (no orphan tabpanel)', async () => {
    await render({ showThumbnails: false });
    expect(el.querySelector('[role="tablist"]')).toBeNull();
    const stage = el.querySelector('.cae-galleria__stage')!;
    expect(stage.getAttribute('role')).toBeNull();
    expect(stage.getAttribute('aria-labelledby')).toBeNull();
    // The main image and navigators still work without the strip.
    expect(mainImg()!.getAttribute('alt')).toBe('Alpha');
    expect(navNext()).not.toBeNull();
  });

  it('renders no stage for an empty gallery and openFullscreen is a no-op', async () => {
    fixture = TestBed.createComponent(CaeGalleria);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('items', []);
    fixture.componentRef.setInput('ariaLabel', 'Empty');
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await settle();
    expect(el.querySelector('[role="tabpanel"]')).toBeNull();
    const spy = vi.spyOn(TestBed.inject(CaeDialog), 'open');
    component.openFullscreen();
    expect(spy).not.toHaveBeenCalled();
  });

  it('warns in dev when the gallery is unlabeled or an item is missing alt text', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fixture = TestBed.createComponent(CaeGalleria);
    fixture.componentRef.setInput('items', [{ src: 'x.jpg', alt: '' }]); // missing alt
    // no ariaLabel set
    fixture.detectChanges();
    await fixture.whenStable();
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('no [ariaLabel]'))).toBe(true);
    expect(messages.some((m) => m.includes('no `alt`'))).toBe(true);
    warn.mockRestore();
    fixture.nativeElement.remove();
  });

  describe('indicator dots ([showIndicators], #288)', () => {
    const dots = (): HTMLButtonElement[] =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('.cae-galleria__indicator'));
    const dotGroup = (): HTMLElement | null => el.querySelector('.cae-galleria__indicators');

    it('renders no indicator dots by default (opt-in, p-galleria parity)', async () => {
      await render();
      expect(dotGroup()).toBeNull();
    });

    it('renders a role=group of one dot per image when [showIndicators]', async () => {
      await render({ showIndicators: true });
      const group = dotGroup()!;
      expect(group.getAttribute('role')).toBe('group');
      expect(group.getAttribute('aria-label')).toBe('Choose image to display');
      expect(dots()).toHaveLength(3);
      // Indicators are a plain button group, NOT a second tablist driving the one tabpanel.
      expect(group.getAttribute('role')).not.toBe('tablist');
    });

    it('marks only the active dot with aria-current + the roving tab stop (tabindex 0)', async () => {
      await render({ showIndicators: true, activeIndex: 1 });
      const d = dots();
      expect(d[1].getAttribute('aria-current')).toBe('true');
      expect(d[1].getAttribute('tabindex')).toBe('0');
      expect(d[1].classList.contains('cae-galleria__indicator--active')).toBe(true);
      expect(d[0].getAttribute('aria-current')).toBeNull();
      expect(d[0].getAttribute('tabindex')).toBe('-1');
      // The dot label surfaces the image's alt (like the thumbnail tab), not a bare ordinal.
      expect(d[0].getAttribute('aria-label')).toBe('Alpha (1 of 3)');
    });

    it('clicking a dot navigates to that image', async () => {
      await render({ showIndicators: true });
      dots()[2].click();
      await settle();
      expect(component.activeIndex()).toBe(2);
      expect(mainImg()!.getAttribute('alt')).toBe('Charlie');
      expect(dots()[2].getAttribute('aria-current')).toBe('true');
    });

    it('roving keyboard: ArrowRight selects + moves focus to the next dot', async () => {
      await render({ showIndicators: true });
      dots()[0].focus();
      dots()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(1);
      expect(document.activeElement).toBe(dots()[1]);
    });

    it('roving keyboard: ArrowLeft steps back one dot with focus, then clamps at the first', async () => {
      await render({ showIndicators: true, activeIndex: 2 });
      dots()[2].focus();
      dots()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(1); // a real single-step decrement, not a boundary no-op
      expect(document.activeElement).toBe(dots()[1]);
      dots()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await settle();
      dots()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(0); // clamps at the start (no wrap when non-circular)
    });

    it('roving keyboard: ArrowDown/ArrowUp alias to next/previous (vertical-arrow support)', async () => {
      await render({ showIndicators: true });
      dots()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(1); // Down → next
      dots()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(0); // Up → previous
    });

    it('roving keyboard: Home and End jump to the first and last dot', async () => {
      await render({ showIndicators: true, activeIndex: 1 });
      dots()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(2);
      dots()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(0);
    });

    it('indicator arrows step from the ACTIVE dot, not the pressed one (#572)', async () => {
      await render({ showIndicators: true });
      dots()[0].focus();
      fixture.componentRef.setInput('activeIndex', 1); // consumer write; focus stays on the stale dot 0
      await settle();
      expect(document.activeElement).toBe(dots()[0]);

      dots()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(2); // pre-fix: 0 + 1 = 1, an unmoved no-op
      expect(document.activeElement).toBe(dots()[2]);
    });

    it('arrows wrap under [circular], matching the nav buttons; Home/End stay absolute (#573)', async () => {
      await render({ showIndicators: true, circular: true, activeIndex: 2 });
      dots()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(0); // wrapped past the end, as navNext() already did
      expect(document.activeElement).toBe(dots()[0]);

      dots()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(2); // and backwards past the start

      // Home/End are destinations, not steps: they must not wrap even here. The implementation relies on
      // their targets already being in range rather than on a branch, so pin BOTH ends — End alone only
      // covers the positive-overshoot side, and it's Home (target 0) the modulo would silently send to
      // the last item if the target ever went negative.
      dots()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(2);
      dots()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(0);
    });

    it('hides the dots for a single image', async () => {
      await render({ showIndicators: true, items: [{ src: 'solo.jpg', alt: 'Solo' }] });
      expect(dotGroup()).toBeNull();
    });
  });

  describe('caption placement ([captionPosition], #288)', () => {
    const caption = (): HTMLElement | null => el.querySelector('.cae-galleria__caption');

    it('defaults to the below layout — the caption is not the overlay variant', async () => {
      await render({ activeIndex: 1 }); // Bravo carries a caption
      expect(caption()).not.toBeNull();
      expect(caption()!.classList.contains('cae-galleria__caption--overlay')).toBe(false);
    });

    it('[captionPosition="overlay"] floats the caption over the image', async () => {
      await render({ activeIndex: 1, captionPosition: 'overlay' });
      expect(caption()!.classList.contains('cae-galleria__caption--overlay')).toBe(true);
    });

    it('honors overlay placement in the fullscreen lightbox (threaded through the payload)', async () => {
      await render({ activeIndex: 1, captionPosition: 'overlay' });
      component.openFullscreen();
      await settle();
      const lbCaption = containerEl.querySelector('.cae-galleria-lightbox__caption');
      expect(lbCaption).not.toBeNull();
      expect(lbCaption!.classList.contains('cae-galleria-lightbox__caption--overlay')).toBe(true);
      TestBed.inject(MatDialog).closeAll();
    });
  });

  describe('thumbnail position ([thumbnailsPosition], #288)', () => {
    const layout = (): HTMLElement | null => el.querySelector('.cae-galleria__layout');
    const tablist = (): HTMLElement | null => el.querySelector('[role="tablist"]');
    const stage = (): HTMLElement | null => el.querySelector('.cae-galleria__stage');

    it('defaults to bottom — horizontal strip (no vertical/before classes, no aria-orientation)', async () => {
      await render();
      expect(layout()!.classList.contains('cae-galleria__layout--vertical')).toBe(false);
      expect(layout()!.classList.contains('cae-galleria__layout--before')).toBe(false);
      // horizontal is the ARIA default for a tablist, so the attribute is omitted (not "horizontal").
      expect(tablist()!.getAttribute('aria-orientation')).toBeNull();
    });

    it('[thumbnailsPosition="top"] reverses the main axis but stays horizontal (no aria-orientation)', async () => {
      await render({ thumbnailsPosition: 'top' });
      expect(layout()!.classList.contains('cae-galleria__layout--before')).toBe(true);
      expect(layout()!.classList.contains('cae-galleria__layout--vertical')).toBe(false);
      expect(tablist()!.getAttribute('aria-orientation')).toBeNull();
    });

    it('[thumbnailsPosition="left"] is a vertical strip placed before the stage', async () => {
      await render({ thumbnailsPosition: 'left' });
      expect(layout()!.classList.contains('cae-galleria__layout--vertical')).toBe(true);
      expect(layout()!.classList.contains('cae-galleria__layout--before')).toBe(true);
      expect(tablist()!.getAttribute('aria-orientation')).toBe('vertical');
    });

    it('[thumbnailsPosition="right"] is a vertical strip placed after the stage', async () => {
      await render({ thumbnailsPosition: 'right' });
      expect(layout()!.classList.contains('cae-galleria__layout--vertical')).toBe(true);
      expect(layout()!.classList.contains('cae-galleria__layout--before')).toBe(false);
      expect(tablist()!.getAttribute('aria-orientation')).toBe('vertical');
    });

    it('keeps the strip AFTER the main view in DOM order in every position (reading/focus order, WCAG 2.4.3)', async () => {
      for (const pos of ['top', 'bottom', 'left', 'right'] as const) {
        await render({ thumbnailsPosition: pos });
        // FOLLOWING means the tablist comes after the stage in document order regardless of visual side.
        const rel = stage()!.compareDocumentPosition(tablist()!);
        expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });

    // The thumbnail keymap is orientation-INDEPENDENT (Down and Right both advance regardless of position),
    // so a vertical strip stays fully navigable. Also the only Down-on-a-thumbnail coverage (the other
    // thumbnail keyboard tests exercise Left/Right/Home/End; Up/Down were only covered on the indicators).
    it('ArrowDown and ArrowRight both advance the thumbnail roving focus (orientation-independent keymap)', async () => {
      await render({ thumbnailsPosition: 'left', activeIndex: 0 });
      const active = () => el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!;
      active().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(1);
      active().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      expect(component.activeIndex()).toBe(2);
    });

    it('renders no tablist (position moot) for a single image', async () => {
      fixture = TestBed.createComponent(CaeGalleria);
      fixture.componentRef.setInput('items', [ITEMS[0]]);
      fixture.componentRef.setInput('ariaLabel', 'Solo');
      fixture.componentRef.setInput('thumbnailsPosition', 'left');
      document.body.appendChild(fixture.nativeElement);
      el = fixture.nativeElement;
      await settle();
      expect(tablist()).toBeNull();
    });
  });

  describe('thumbnail windowing ([numVisible], #481)', () => {
    const SIX: readonly CaeGalleriaItem[] = [
      { src: 'a.jpg', alt: 'Alpha' },
      { src: 'b.jpg', alt: 'Bravo' },
      { src: 'c.jpg', alt: 'Charlie' },
      { src: 'd.jpg', alt: 'Delta' },
      { src: 'e.jpg', alt: 'Echo' },
      { src: 'f.jpg', alt: 'Foxtrot' },
    ];
    const strip = (): HTMLElement | null => el.querySelector('[role="tablist"]');
    const isWindowed = (): boolean => strip()!.classList.contains('cae-galleria__thumbs--windowed');
    const numVisibleVar = (): string =>
      strip()!.style.getPropertyValue('--cae-galleria-num-visible').trim();

    // Assert through the DOM the windowed()/visibleCount() computeds drive (the --windowed class + the
    // --cae-galleria-num-visible cap var) rather than widening those protected computeds to public.
    it('does not window by default (numVisible 0): no --windowed class, no cap var, every thumb present', async () => {
      await render({ items: SIX });
      expect(isWindowed()).toBe(false);
      expect(numVisibleVar()).toBe('');
      expect(tabs()).toHaveLength(6); // all thumbnails stay in the DOM / a11y tree
    });

    it('[numVisible]=3 over 6 images windows the strip: --windowed class + --cae-galleria-num-visible=3', async () => {
      await render({ items: SIX, numVisible: 3 });
      expect(isWindowed()).toBe(true);
      expect(numVisibleVar()).toBe('3');
      // Only the VISIBLE count is capped (a CSS viewport size, whose paint is deferred to the #240 browser
      // pass) — here we assert the a11y invariant that matters in jsdom: all 6 tabs stay in the DOM tree.
      expect(tabs()).toHaveLength(6);
    });

    it('coerces a string [numVisible] to a number (numberAttribute)', async () => {
      await render({ items: SIX, numVisible: '3' });
      expect(isWindowed()).toBe(true);
      expect(numVisibleVar()).toBe('3');
    });

    it('floors a fractional [numVisible] to a whole thumbnail count', async () => {
      await render({ items: SIX, numVisible: 3.9 });
      expect(numVisibleVar()).toBe('3'); // visibleCount() floored 3.9 → 3
    });

    it('does not window when numVisible >= the image count (shows them all, like 0)', async () => {
      await render({ items: SIX, numVisible: 6 });
      expect(isWindowed()).toBe(false);
      expect(numVisibleVar()).toBe('');
    });

    it('is inert with the strip hidden ([showThumbnails]=false)', async () => {
      await render({ items: SIX, numVisible: 3, showThumbnails: false });
      expect(strip()).toBeNull();
    });

    it('scrolls the selected thumbnail into view on nav when windowed', async () => {
      await render({ items: SIX, numVisible: 3, activeIndex: 0 });
      // jsdom doesn't implement scrollIntoView (the component calls it optionally), so plant a mock to observe.
      const scrollSpy = vi.fn();
      tabs()[4].scrollIntoView = scrollSpy;
      // Jump past the visible window by a NON-keyboard path (setInput, like a consumer / lightbox sync) — the
      // roving keyboard already scrolls via focusThumb(), so this proves the separate follow-scroll effect.
      fixture.componentRef.setInput('activeIndex', 4);
      await settle();
      expect(scrollSpy).toHaveBeenCalled();
    });

    it('does NOT auto-scroll the strip on the same nav when un-windowed (byte-identical default)', async () => {
      await render({ items: SIX, activeIndex: 0 }); // numVisible 0
      const scrollSpy = vi.fn();
      tabs()[4].scrollIntoView = scrollSpy;
      fixture.componentRef.setInput('activeIndex', 4);
      await settle();
      expect(scrollSpy).not.toHaveBeenCalled(); // the follow-scroll effect is gated on windowed()
    });

    it('composes with a vertical strip ([thumbnailsPosition="left"])', async () => {
      await render({ items: SIX, numVisible: 3, thumbnailsPosition: 'left' });
      const layout = el.querySelector('.cae-galleria__layout')!;
      expect(layout.classList.contains('cae-galleria__layout--vertical')).toBe(true);
      expect(isWindowed()).toBe(true);
      expect(numVisibleVar()).toBe('3');
    });
  });

  describe('thumbnail paging navigators ([showThumbnailNavigators], #288)', () => {
    const SIX: readonly CaeGalleriaItem[] = [
      { src: 'a.jpg', alt: 'Alpha' },
      { src: 'b.jpg', alt: 'Bravo' },
      { src: 'c.jpg', alt: 'Charlie' },
      { src: 'd.jpg', alt: 'Delta' },
      { src: 'e.jpg', alt: 'Echo' },
      { src: 'f.jpg', alt: 'Foxtrot' },
    ];
    const navPrevThumb = (): HTMLButtonElement | null =>
      el.querySelector('.cae-galleria__thumb-nav--prev');
    const navNextThumb = (): HTMLButtonElement | null =>
      el.querySelector('.cae-galleria__thumb-nav--next');
    const wrap = (): HTMLElement | null => el.querySelector('.cae-galleria__thumbs-wrap');
    const dis = (b: HTMLButtonElement | null): string | null => b!.getAttribute('aria-disabled');
    // The window position is otherwise unobservable in jsdom (native scroll; all thumbs always in the DOM,
    // and the bounds computeds use <=/>= so aria-disabled can't reveal an OUT-OF-RANGE window). We read it
    // off WHICH thumbnail the window-start scroll targets — a dropped clamp corrupts the index and the NEXT
    // page lands the wrong thumb. Spy AFTER render so the initial-render scroll isn't captured.
    const spyScrolls = (): number[] => {
      const hit: number[] = [];
      tabs().forEach((t, i) => {
        t.scrollIntoView = (() => hit.push(i)) as typeof t.scrollIntoView;
      });
      return hit;
    };

    it('are hidden by default even when the strip is windowed (opt-in)', async () => {
      await render({ items: SIX, numVisible: 2 });
      expect(navPrevThumb()).toBeNull();
      expect(navNextThumb()).toBeNull();
      expect(wrap()).toBeNull(); // the strip renders bare (byte-identical to the un-paged path)
    });

    it('stay hidden when opted in but the strip is NOT windowed (nothing to page)', async () => {
      await render({ items: SIX, showThumbnailNavigators: true }); // numVisible 0 → not windowed
      expect(navPrevThumb()).toBeNull();
      expect(navNextThumb()).toBeNull();
      // …and when numVisible covers every thumbnail.
      fixture.componentRef.setInput('numVisible', 6);
      await settle();
      expect(navPrevThumb()).toBeNull();
    });

    it('render when windowed + opted in — labelled buttons OUTSIDE the tablist (not tabs)', async () => {
      await render({ items: SIX, numVisible: 2, showThumbnailNavigators: true });
      expect(navPrevThumb()!.getAttribute('aria-label')).toBe('Previous thumbnails');
      expect(navNextThumb()!.getAttribute('aria-label')).toBe('Next thumbnails');
      // The pagers are not tabs and don't join the roving tablist — all 6 tabs stay, none is a pager.
      expect(tabs()).toHaveLength(6);
      expect(navPrevThumb()!.getAttribute('role')).toBeNull();
      expect(navNextThumb()!.getAttribute('role')).toBeNull();
      // aria-controls points both pagers at the tablist they window.
      const tablistId = el.querySelector('[role="tablist"]')!.id;
      expect(tablistId).toBeTruthy();
      expect(navPrevThumb()!.getAttribute('aria-controls')).toBe(tablistId);
      expect(navNextThumb()!.getAttribute('aria-controls')).toBe(tablistId);
    });

    it('dim at the window bounds via aria-disabled and page by one window (visibleCount) on click', async () => {
      await render({ items: SIX, numVisible: 2, activeIndex: 0, showThumbnailNavigators: true });
      // Start window [0,2): prev dimmed, next live. maxThumbStart = 6 - 2 = 4.
      expect(dis(navPrevThumb())).toBe('true');
      expect(dis(navNextThumb())).toBeNull();

      navNextThumb()!.click();
      await settle();
      // windowStart 0 → 2: both live now.
      expect(dis(navPrevThumb())).toBeNull();
      expect(dis(navNextThumb())).toBeNull();

      navNextThumb()!.click();
      await settle();
      // windowStart 2 → 4 (= maxThumbStart): next dims, prev live.
      expect(dis(navPrevThumb())).toBeNull();
      expect(dis(navNextThumb())).toBe('true');
    });

    it('lower clamp has teeth: a prev-click at the start is a true no-op — the next page still lands window 2', async () => {
      await render({ items: SIX, numVisible: 2, activeIndex: 0, showThumbnailNavigators: true });
      const hit = spyScrolls();
      navPrevThumb()!.click(); // at the start bound → the Math.max(0, …) clamp makes it a no-op
      await settle();
      navNextThumb()!.click(); // window 0 → 2
      await settle();
      // Correct: prev no-op (no window change → no scroll), next → thumb 2. If Math.max(0, …) were dropped,
      // prev would set windowStart -2 (scroll no-ops on the missing thumb) and the next page → 0, landing
      // thumb 0 — never thumb 2. aria-disabled alone can't catch this (−2 <= 0 still reads "at start").
      expect(hit).toContain(2);
      expect(hit).not.toContain(0);
    });

    it('upper clamp has teeth: a next-click at the end is a true no-op — the next prev still lands window 2', async () => {
      await render({ items: SIX, numVisible: 2, activeIndex: 0, showThumbnailNavigators: true });
      navNextThumb()!.click(); // 0 → 2
      await settle();
      navNextThumb()!.click(); // 2 → 4 (= maxThumbStart)
      await settle();
      const hit = spyScrolls();
      navNextThumb()!.click(); // at the end bound → the Math.min(…, maxThumbStart) clamp no-ops
      await settle();
      navPrevThumb()!.click(); // window 4 → 2
      await settle();
      // Correct: next no-op, prev → thumb 2. If Math.min were dropped, next would set windowStart 6 and prev
      // → 4, landing thumb 4 — never thumb 2 (and 6 >= maxThumbStart still reads "at end", so aria misses it).
      expect(hit).toContain(2);
      expect(hit).not.toContain(4);
    });

    it('aligns the window-start thumbnail to the strip start edge on page (scrollIntoView inline:start)', async () => {
      await render({ items: SIX, numVisible: 2, activeIndex: 0, showThumbnailNavigators: true });
      const scrollSpy = vi.fn();
      tabs()[2].scrollIntoView = scrollSpy; // the thumb that becomes windowStart after one page
      navNextThumb()!.click(); // windowStart 0 → 2
      await settle();
      expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ inline: 'start' }));
    });

    it('reconciles the window to keep the active thumbnail in view when selection jumps out', async () => {
      await render({ items: SIX, numVisible: 2, activeIndex: 0, showThumbnailNavigators: true });
      expect(dis(navNextThumb())).toBeNull(); // windowStart 0, not at end
      // Select image 5 (a non-keyboard path, e.g. lightbox sync) — out of the [0,2) window: reconcile snaps
      // windowStart to 5 - 2 + 1 = 4 (= maxThumbStart), so the active thumb sits in the last window.
      fixture.componentRef.setInput('activeIndex', 5);
      await settle();
      expect(dis(navNextThumb())).toBe('true'); // now at the end window
      expect(dis(navPrevThumb())).toBeNull();
    });

    it('reconciles BACKWARD too — selecting a low image pulls the window down to reveal it', async () => {
      await render({ items: SIX, numVisible: 2, activeIndex: 5, showThumbnailNavigators: true });
      expect(dis(navNextThumb())).toBe('true'); // window reconciled to [4,6) at the end
      const hit = spyScrolls();
      fixture.componentRef.setInput('activeIndex', 0); // jump below the window (the sel < start branch)
      await settle();
      // reconcile: sel 0 < start 4 → windowStart 0 → prev dims, and the window-start scroll targets thumb 0.
      expect(dis(navPrevThumb())).toBe('true');
      expect(hit).toContain(0);
    });

    it('survives a runtime numVisible increase — the window reconciles to stay in range (no out-of-range thumb)', async () => {
      await render({ items: SIX, numVisible: 2, activeIndex: 4, showThumbnailNavigators: true });
      navNextThumb()!.click(); // page toward the end (window ≥ [3,5))
      await settle();
      // Grow numVisible to 4: maxThumbStart shrinks 4 → 2, so a window ≥ 3 is now out of range. The reconcile
      // must pull it back; the bounds stay coherent and paging targets only real thumbnails.
      const hit = spyScrolls();
      fixture.componentRef.setInput('numVisible', 4);
      await settle();
      expect(dis(navNextThumb())).toBe('true'); // window at the (new) end, maxThumbStart = 6 - 4 = 2
      navPrevThumb()!.click(); // → window 0
      await settle();
      expect(hit.every((i) => i >= 0 && i < 6)).toBe(true); // never scrolls a non-existent thumbnail
      expect(hit).toContain(0);
    });

    it('flanks a vertical strip — the wrap flips to a column ([thumbnailsPosition="left"])', async () => {
      await render({
        items: SIX,
        numVisible: 2,
        thumbnailsPosition: 'left',
        showThumbnailNavigators: true,
      });
      expect(wrap()!.classList.contains('cae-galleria__thumbs-wrap--vertical')).toBe(true);
      expect(navPrevThumb()).not.toBeNull();
      expect(navNextThumb()).not.toBeNull();
    });

    it('toggling paging on/off keeps the strip and its roving tabs intact (template re-stamp)', async () => {
      await render({ items: SIX, numVisible: 2, showThumbnailNavigators: true });
      expect(tabs()).toHaveLength(6);
      fixture.componentRef.setInput('showThumbnailNavigators', false);
      await settle();
      expect(wrap()).toBeNull(); // back to the bare strip
      expect(tabs()).toHaveLength(6); // thumbnails survive the re-stamp
      expect(el.querySelector('[role="tablist"]')).not.toBeNull();
    });
  });

  describe('responsive numVisible ([responsiveOptions], #288)', () => {
    // 6 items so a windowed strip (numVisible < 6) has thumbnails beyond the window.
    const SIX: readonly CaeGalleriaItem[] = Array.from({ length: 6 }, (_, i) => ({
      src: `img-${i}.jpg`,
      alt: `Image ${i + 1}`,
    }));
    const q = (bp: string): string => `(max-width: ${bp})`;
    let realMatchMedia: typeof window.matchMedia;

    // A controllable matchMedia fake (mirrors cae-carousel #276): `matching` is the set of query strings
    // currently matching; `fire()` flips one and notifies its listeners exactly as a real MediaQueryList
    // change does; `listenerCount()` reports live `change` listeners so a cleanup leak is caught, not merely
    // "removeEventListener was called".
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

    // `--cae-galleria-num-visible` is bound to visibleCount() only while windowed, so it is a direct read of
    // the resolved window ('' = not windowed / property removed).
    const windowVar = (): string =>
      (el.querySelector('.cae-galleria__thumbs') as HTMLElement | null)?.style
        .getPropertyValue('--cae-galleria-num-visible')
        .trim() ?? '';

    // render() runs one settle; the responsive effect writes `matches` during that CD, so a second settle
    // renders the resolved window (mirrors the carousel spec's double pass).
    async function mount(base: number, options: CaeGalleriaResponsiveOption[]): Promise<void> {
      await render({ items: SIX, numVisible: base, responsiveOptions: options });
      await settle();
    }

    beforeEach(() => {
      realMatchMedia = window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = realMatchMedia;
    });

    it('windows the strip to a matching breakpoint override (base 4 → 3)', async () => {
      installMatchMedia(new Set([q('1024px')]));
      await mount(4, [{ breakpoint: '1024px', numVisible: 3 }]);
      expect(windowVar()).toBe('3'); // the override, not the base 4
    });

    it('picks the NARROWEST matching rule when several match', async () => {
      installMatchMedia(new Set([q('1024px'), q('560px')]));
      await mount(4, [
        { breakpoint: '1024px', numVisible: 3 },
        { breakpoint: '560px', numVisible: 2 },
      ]);
      expect(windowVar()).toBe('2'); // 560 (narrowest) wins over 1024
    });

    it('falls back to the base numVisible when no rule matches', async () => {
      installMatchMedia(new Set()); // a wide viewport: nothing matches
      await mount(4, [{ breakpoint: '1024px', numVisible: 3 }]);
      expect(windowVar()).toBe('4'); // base window
    });

    it('turns windowing OFF at a breakpoint whose numVisible is 0 (show-all override)', async () => {
      installMatchMedia(new Set([q('1024px')]));
      await mount(4, [{ breakpoint: '1024px', numVisible: 0 }]);
      // 0 = show every thumbnail → not windowed → the custom property is removed; base 4 fully replaced.
      expect(windowVar()).toBe('');
    });

    it('re-resolves live on a viewport crossing, and removes listeners on destroy', async () => {
      const { fire, listenerCount } = installMatchMedia(new Set([q('1024px')]));
      await mount(4, [{ breakpoint: '1024px', numVisible: 3 }]);
      expect(windowVar()).toBe('3'); // starts matched
      expect(listenerCount(q('1024px'))).toBe(1); // one live change listener while mounted

      fire(q('1024px'), false); // viewport grows past 1024 → the rule stops matching
      await settle();
      expect(windowVar()).toBe('4'); // re-resolved to the base window live, no re-mount

      fixture.destroy();
      expect(listenerCount(q('1024px'))).toBe(0); // onCleanup removed the ACTUAL listener (no leak)
    });

    it('re-scrolls the selected thumb when a live crossing only tightens the window (non-nav)', async () => {
      const { fire } = installMatchMedia(new Set()); // wide viewport: the base window applies first
      await mount(4, [{ breakpoint: '768px', numVisible: 2 }]); // base 4 windowed (4 < 6); rule not yet matching
      fixture.componentRef.setInput('activeIndex', 3);
      await settle();
      // Spy the selected thumb's scrollIntoView. showThumbnailNavigators is off, so the strip never re-stamps
      // and this element stays stable across the crossing (a re-stamp would swap it out — see #535).
      const scrollSpy = vi.fn();
      tabs()[3].scrollIntoView = scrollSpy;

      fire(q('768px'), true); // viewport shrinks past 768 → visibleCount 4→2, still windowed (both < 6)
      await settle();

      expect(windowVar()).toBe('2'); // the tighten resolved
      // Teeth for the visibleCount() dep read: without it, windowed()/clampedIndex() are unchanged by a
      // both-windowed tighten, so the follow-scroll effect would NOT re-run and the spy would stay uncalled.
      expect(scrollSpy).toHaveBeenCalled();
    });
  });

  describe('fullscreen (openFullscreen config seam — spied CaeDialog.open, no overlay)', () => {
    it('opens the lightbox centered with the current index and the sync + circular seams', async () => {
      await render({ activeIndex: 1, circular: true });
      const spy = vi
        .spyOn(TestBed.inject(CaeDialog), 'open')
        .mockReturnValue({ afterClosed: () => of(undefined) } as never);
      component.openFullscreen();
      const [comp, config] = spy.mock.calls[0] as [
        unknown,
        {
          maxWidth: string;
          panelClass: string;
          ariaLabel: string;
          data: { index: number; circular: boolean; onNavigate: (i: number) => void };
        },
      ];
      expect(comp).toBeTruthy();
      expect(config.maxWidth).toBe('96vw');
      expect(config.panelClass).toBe('cae-galleria__lightbox-panel');
      expect(config.ariaLabel).toBe('Product photos');
      const data = config.data;
      expect(data.index).toBe(1);
      expect(data.circular).toBe(true);
      // onNavigate is the live seam: calling it (as the lightbox does on nav) updates the inline view.
      data.onNavigate(2);
      expect(component.activeIndex()).toBe(2);
    });

    it('closes an open lightbox when the host is destroyed mid-lightbox (#294)', async () => {
      await render();
      // A Subject (unlike of()) doesn't emit on subscribe, so lightboxRef stays set until we destroy — the
      // realistic "host torn down while the modal is still open" case the DestroyRef hook exists for.
      const afterClosed$ = new Subject<void>();
      const close = vi.fn();
      vi.spyOn(TestBed.inject(CaeDialog), 'open').mockReturnValue({
        afterClosed: () => afterClosed$,
        close,
      } as never);
      component.openFullscreen();
      expect(close).not.toHaveBeenCalled();
      fixture.destroy();
      expect(close).toHaveBeenCalledTimes(1); // destroying the host tears down its lightbox
    });
  });

  describe('fullscreen lightbox (real overlay)', () => {
    const lightbox = (): HTMLElement | null => containerEl.querySelector('.cae-galleria-lightbox');
    const counter = (): HTMLElement | null =>
      containerEl.querySelector('.cae-galleria-lightbox__counter');
    const lbPrev = (): HTMLButtonElement | null =>
      containerEl.querySelector('.cae-galleria-lightbox__nav--prev');
    const lbNext = (): HTMLButtonElement | null =>
      containerEl.querySelector('.cae-galleria-lightbox__nav--next');
    const lbClose = (): HTMLButtonElement | null =>
      containerEl.querySelector('.cae-galleria-lightbox__close');

    it('opens a modal showing the active image and its position counter', async () => {
      await render({ activeIndex: 1 });
      component.openFullscreen();
      await settle();
      expect(containerEl.querySelector('mat-dialog-container')).not.toBeNull();
      expect(lightbox()!.querySelector('img')!.getAttribute('alt')).toBe('Bravo');
      expect(counter()!.textContent!.trim()).toBe('Image 2 of 3');
      TestBed.inject(MatDialog).closeAll();
    });

    it('navigates in the lightbox and syncs the index back to the inline gallery', async () => {
      await render({ activeIndex: 0 });
      component.openFullscreen();
      await settle();
      expect(lbPrev()!.getAttribute('aria-disabled')).toBe('true'); // at start

      lbNext()!.click();
      await settle();
      expect(counter()!.textContent!.trim()).toBe('Image 2 of 3');
      expect(component.activeIndex()).toBe(1); // live-synced via onNavigate
      TestBed.inject(MatDialog).closeAll();
    });

    it('navigates with the Left/Right arrow keys', async () => {
      await render({ activeIndex: 0 });
      component.openFullscreen();
      await settle();
      lightbox()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      expect(counter()!.textContent!.trim()).toBe('Image 2 of 3');
      TestBed.inject(MatDialog).closeAll();
    });

    it('jumps to first/last with the Home/End keys', async () => {
      await render({ activeIndex: 0 });
      component.openFullscreen();
      await settle();
      lightbox()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await settle();
      expect(counter()!.textContent!.trim()).toBe('Image 3 of 3');
      lightbox()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await settle();
      expect(counter()!.textContent!.trim()).toBe('Image 1 of 3');
      TestBed.inject(MatDialog).closeAll();
    });

    it('does not stack a second lightbox on a double open', async () => {
      await render();
      const dialog = TestBed.inject(MatDialog);
      component.openFullscreen();
      component.openFullscreen();
      await settle();
      expect(dialog.openDialogs).toHaveLength(1);
      dialog.closeAll();
    });

    it('closes on the close button', async () => {
      await render();
      const dialog = TestBed.inject(MatDialog);
      component.openFullscreen();
      await settle();
      expect(lightbox()).not.toBeNull();
      expect(dialog.openDialogs).toHaveLength(1);
      // Await afterClosed (as confirm.spec awaits its promise) — close() finishes only after the close
      // animation, so both the DOM container and openDialogs linger until then.
      const closed = new Promise<void>((resolve) =>
        dialog.openDialogs[0].afterClosed().subscribe(() => resolve()),
      );
      lbClose()!.click();
      await closed;
      await settle();
      expect(dialog.openDialogs).toHaveLength(0);
    });
  });

  describe('projected templates (#287)', () => {
    // A host projecting BOTH templates — the typed image model is the first-class default, so these are
    // optional overrides for non-image content. The galleria keeps its figure/tab wrappers; the templates
    // replace only the inner content.
    @Component({
      imports: [CaeGalleria, CaeGalleriaItemDef, CaeGalleriaThumbnailDef],
      template: `
        <cae-galleria [items]="items" ariaLabel="Clips">
          <ng-template caeGalleriaItem let-item let-i="index">
            <div class="custom-item" [attr.data-idx]="i">{{ item.alt }} clip</div>
          </ng-template>
          <ng-template caeGalleriaThumbnail let-item>
            <span class="custom-thumb">{{ item.alt }}</span>
          </ng-template>
        </cae-galleria>
      `,
    })
    class TemplateHost {
      readonly items = ITEMS;
      readonly galleria = viewChild.required(CaeGalleria);
    }

    let hostFixture: ComponentFixture<TemplateHost>;
    let hostEl: HTMLElement;

    async function renderHost(): Promise<TemplateHost> {
      hostFixture = TestBed.createComponent(TemplateHost);
      document.body.appendChild(hostFixture.nativeElement);
      hostEl = hostFixture.nativeElement;
      hostFixture.detectChanges();
      await hostFixture.whenStable();
      return hostFixture.componentInstance;
    }

    afterEach(() => {
      TestBed.inject(MatDialog).closeAll();
      hostFixture?.nativeElement.remove();
    });

    it('renders a projected caeGalleriaItem in the main view (overriding the typed <img>) with reactive context', async () => {
      const host = await renderHost();
      // The typed fallback <img> is gone; the custom renderer shows the active item + its index.
      expect(hostEl.querySelector('.cae-galleria__image')).toBeNull();
      const custom = hostEl.querySelector('.cae-galleria__figure .custom-item')!;
      expect(custom.textContent!.trim()).toBe('Alpha clip');
      expect(custom.getAttribute('data-idx')).toBe('0');
      // Context is reactive — navigating re-stamps the template with the new item/index.
      host.galleria().next();
      hostFixture.detectChanges();
      await hostFixture.whenStable();
      const custom2 = hostEl.querySelector('.cae-galleria__figure .custom-item')!;
      expect(custom2.textContent!.trim()).toBe('Bravo clip');
      expect(custom2.getAttribute('data-idx')).toBe('1');
    });

    it('renders a projected caeGalleriaThumbnail inside each role=tab button (a11y wrapper retained)', async () => {
      await renderHost();
      // Fallback thumbnail <img> gone; custom content inside every tab; the roving-tab semantics stay.
      expect(hostEl.querySelector('.cae-galleria__thumb-image')).toBeNull();
      const tabButtons = Array.from(hostEl.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      expect(tabButtons).toHaveLength(3);
      expect(tabButtons.map((b) => b.querySelector('.custom-thumb')?.textContent?.trim())).toEqual([
        'Alpha',
        'Bravo',
        'Charlie',
      ]);
      expect(tabButtons[0].getAttribute('aria-selected')).toBe('true'); // button still owns selection
    });

    it('drives the fullscreen lightbox with the same projected item template', async () => {
      const host = await renderHost();
      host.galleria().openFullscreen();
      hostFixture.detectChanges();
      await hostFixture.whenStable();
      // Fullscreen renders the projected content (threaded through the dialog data), not the bare <img>.
      expect(containerEl.querySelector('.cae-galleria-lightbox__image')).toBeNull();
      const lbCustom = containerEl.querySelector('.cae-galleria-lightbox__figure .custom-item');
      expect(lbCustom).not.toBeNull();
      expect(lbCustom!.textContent!.trim()).toBe('Alpha clip');
    });

    it('re-stamps the projected item template on fullscreen navigation (transplanted-view reactivity)', async () => {
      const host = await renderHost();
      host.galleria().openFullscreen();
      hostFixture.detectChanges();
      await hostFixture.whenStable();
      const lbItem = () =>
        containerEl
          .querySelector('.cae-galleria-lightbox__figure .custom-item')!
          .textContent!.trim();
      expect(lbItem()).toBe('Alpha clip');
      // Navigate inside the overlay: the template is declared in the galleria but stamped in the lightbox
      // (a separate overlay component), so this proves the transplanted view re-binds on the lightbox's
      // own index signal — the one reactive path the inline tests don't cover.
      containerEl.querySelector<HTMLButtonElement>('.cae-galleria-lightbox__nav--next')!.click();
      hostFixture.detectChanges();
      await hostFixture.whenStable();
      expect(lbItem()).toBe('Bravo clip');
    });

    it('closes the lightbox without error when the host is destroyed mid-fullscreen (#294 + projected template)', async () => {
      const host = await renderHost();
      const dialog = TestBed.inject(MatDialog);
      host.galleria().openFullscreen();
      hostFixture.detectChanges();
      await hostFixture.whenStable();
      expect(dialog.openDialogs).toHaveLength(1);
      expect(
        containerEl.querySelector('.cae-galleria-lightbox__figure .custom-item'),
      ).not.toBeNull();
      // Destroying the host tears down the projected template's declaration view while the overlay still
      // holds it. The #294 teardown must close the lightbox and NOT throw on the orphaned transplanted view.
      const closed = new Promise<void>((resolve) =>
        dialog.openDialogs[0].afterClosed().subscribe(() => resolve()),
      );
      expect(() => hostFixture.destroy()).not.toThrow();
      await closed;
      expect(dialog.openDialogs).toHaveLength(0);
    });
  });

  describe('fullScreen overlay mode ([fullScreen] + [(visible)], #488)', () => {
    const lightbox = (): HTMLElement | null => containerEl.querySelector('.cae-galleria-lightbox');
    const layout = (): HTMLElement | null => el.querySelector('.cae-galleria__layout');
    const dialogs = () => TestBed.inject(MatDialog).openDialogs;
    // afterClosed is async — capture the open dialog's close promise, fire the trigger, flush the effect
    // that may initiate the close, then drain. Asserting right after closeAll()+settle() races the chain.
    async function awaitClose(trigger: () => void): Promise<void> {
      const ref = dialogs()[0];
      const closed = ref
        ? new Promise<void>((resolve) => ref.afterClosed().subscribe(() => resolve()))
        : Promise.resolve();
      trigger();
      fixture.detectChanges();
      await closed;
      await settle();
    }

    // Host that binds [(visible)] and records each visibleChange emission — to prove exactly-once semantics.
    @Component({
      imports: [CaeGalleria],
      template: `<cae-galleria
        [items]="items"
        ariaLabel="Emit host"
        [(visible)]="v"
        (visibleChange)="emits.push($event)"
      />`,
    })
    class VisibleEmitHost {
      readonly items = ITEMS;
      readonly v = signal(false);
      readonly emits: boolean[] = [];
      readonly galleria = viewChild.required(CaeGalleria);
    }

    it('renders the inline layout by default (fullScreen off) — byte-identical', async () => {
      await render();
      expect(el.querySelector('.cae-galleria')).not.toBeNull();
      expect(layout()).not.toBeNull();
      expect(tabs()).toHaveLength(3);
      expect(lightbox()).toBeNull();
    });

    it('[fullScreen]=true renders NO inline UI and drops the empty group semantics', async () => {
      await render({ fullScreen: true });
      const section = el.querySelector('.cae-galleria')!;
      // The section element persists, but with no inline stage/strip/tabs...
      expect(section).not.toBeNull();
      expect(layout()).toBeNull();
      expect(el.querySelector('.cae-galleria__stage')).toBeNull();
      expect(tabs()).toHaveLength(0);
      // ...and it is NOT an empty labelled role=group (an AT user must not hit an empty "gallery" group;
      // the name lives on the lightbox instead). Inline mode keeps role=group — see the group test above.
      expect(section.getAttribute('role')).toBeNull();
      expect(section.getAttribute('aria-roledescription')).toBeNull();
      expect(section.getAttribute('aria-label')).toBeNull();
      // visible defaults false → nothing auto-opens.
      expect(lightbox()).toBeNull();
      expect(component.visible()).toBe(false);
    });

    it('opens the lightbox when [(visible)] is set true in fullScreen mode', async () => {
      await render({ fullScreen: true });
      component.visible.set(true);
      await settle();
      expect(lightbox()).not.toBeNull();
      expect(dialogs()).toHaveLength(1);
      TestBed.inject(MatDialog).closeAll();
    });

    it('reflects a lightbox close back into [(visible)] (two-way sync)', async () => {
      await render({ fullScreen: true });
      component.visible.set(true);
      await settle();
      expect(lightbox()).not.toBeNull();
      await awaitClose(() => TestBed.inject(MatDialog).closeAll());
      expect(lightbox()).toBeNull();
      expect(component.visible()).toBe(false);
    });

    it('closes an open lightbox when [(visible)] is set false', async () => {
      await render({ fullScreen: true });
      component.visible.set(true);
      await settle();
      expect(dialogs()).toHaveLength(1);
      await awaitClose(() => component.visible.set(false));
      expect(dialogs()).toHaveLength(0);
      expect(lightbox()).toBeNull();
    });

    it('mirrors open-state in INLINE mode too: openFullscreen() sets visible, close clears it', async () => {
      await render(); // inline mode (fullScreen off)
      expect(component.visible()).toBe(false);
      component.openFullscreen();
      await settle();
      expect(component.visible()).toBe(true);
      await awaitClose(() => TestBed.inject(MatDialog).closeAll());
      expect(component.visible()).toBe(false);
    });

    it('honors a born-visible set on an empty gallery only once items arrive (empty-async guard)', async () => {
      fixture = TestBed.createComponent(CaeGalleria);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('items', []);
      fixture.componentRef.setInput('ariaLabel', 'Late gallery');
      fixture.componentRef.setInput('fullScreen', true);
      fixture.componentRef.setInput('visible', true);
      document.body.appendChild(fixture.nativeElement);
      el = fixture.nativeElement;
      await settle();
      // No items yet → nothing forced open, even though visible is true.
      expect(lightbox()).toBeNull();
      // Items arrive: the still-true visible now opens the viewer (count() is an effect dep).
      fixture.componentRef.setInput('items', ITEMS);
      await settle();
      expect(lightbox()).not.toBeNull();
      expect(component.visible()).toBe(true);
      TestBed.inject(MatDialog).closeAll();
    });

    it('does NOT auto-close an open lightbox when items transiently empty (no count===0 close branch)', async () => {
      await render({ fullScreen: true });
      component.visible.set(true);
      await settle();
      expect(lightbox()).not.toBeNull();
      // CaeDialog.open returns the live MatDialogRef, so this IS the galleria's lightboxRef — spying its
      // close() catches the effect's synchronous close() call directly (afterClosed/DOM removal is async
      // and would race a bare "still in the DOM" assertion).
      const closeSpy = vi.spyOn(dialogs()[0], 'close');
      // A transient reload emptying items must not dismiss the open viewer (only !visible closes it).
      fixture.componentRef.setInput('items', []);
      await settle();
      expect(closeSpy).not.toHaveBeenCalled();
      expect(component.visible()).toBe(true);
      closeSpy.mockRestore();
      TestBed.inject(MatDialog).closeAll();
    });

    it('opens the lightbox from [(visible)] in INLINE mode too (mode-agnostic)', async () => {
      await render(); // inline mode, fullScreen off
      expect(lightbox()).toBeNull();
      component.visible.set(true);
      await settle();
      expect(lightbox()).not.toBeNull();
      expect(dialogs()).toHaveLength(1);
      TestBed.inject(MatDialog).closeAll();
    });

    it('reopens after a full close (open → close → visible=true again releases the ref)', async () => {
      await render({ fullScreen: true });
      component.visible.set(true);
      await settle();
      expect(dialogs()).toHaveLength(1);
      await awaitClose(() => TestBed.inject(MatDialog).closeAll());
      expect(dialogs()).toHaveLength(0);
      expect(component.visible()).toBe(false);
      // A fresh open after the previous fully closed must mount a NEW lightbox — proves afterClosed released
      // lightboxRef (a dropped `lightboxRef = null` would leave the guard set and this second open inert).
      component.visible.set(true);
      await settle();
      expect(dialogs()).toHaveLength(1);
      expect(lightbox()).not.toBeNull();
      TestBed.inject(MatDialog).closeAll();
    });

    it('emits visibleChange exactly once on open and once on close (no spurious re-emit)', async () => {
      const hf = TestBed.createComponent(VisibleEmitHost);
      const host = hf.componentInstance;
      document.body.appendChild(hf.nativeElement);
      hf.detectChanges();
      await hf.whenStable();
      // Open via the button path (false→true once). openLightbox's own visible.set(true) is a same-value
      // no-op and the effect's re-run early-returns, so neither double-fires the output.
      host.galleria().openFullscreen();
      hf.detectChanges();
      await hf.whenStable();
      expect(host.emits).toEqual([true]);
      // Close (Escape/backdrop path): afterClosed sets visible false exactly once.
      const dialog = TestBed.inject(MatDialog);
      const closed = new Promise<void>((r) =>
        dialog.openDialogs[0].afterClosed().subscribe(() => r()),
      );
      dialog.closeAll();
      hf.detectChanges();
      await closed;
      hf.detectChanges();
      await hf.whenStable();
      expect(host.emits).toEqual([true, false]);
      hf.nativeElement.remove();
    });
  });
});

// ---- RTL: thumbnail + indicator arrow keys mirror visual order under a born-rtl [dir] (#288) ----

// Wraps the galleria under a REAL CDK Dir ancestor bound rtl BEFORE first paint — a seeded
// FakeDirectionality would report 'rtl' from construction and pass under both the correct value-read and the
// buggy toSignal(change,{initialValue}) idiom (no teeth, per #364). Only the born-rtl [dir] binding exercises
// the first-paint read the Left/Right keymap depends on.
@Component({
  selector: 'cae-galleria-rtl-host',
  imports: [CaeGalleria, Dir],
  template: `
    <div [dir]="direction()">
      <cae-galleria
        [items]="items()"
        ariaLabel="RTL gallery"
        [showIndicators]="true"
        [(activeIndex)]="index"
      />
    </div>
  `,
})
class GalleriaRtlHost {
  readonly direction = signal<Direction>('rtl');
  readonly items = signal<readonly CaeGalleriaItem[]>([
    { src: 'a.jpg', alt: 'Alpha' },
    { src: 'b.jpg', alt: 'Bravo' },
    { src: 'c.jpg', alt: 'Charlie' },
    { src: 'd.jpg', alt: 'Delta' },
    { src: 'e.jpg', alt: 'Echo' },
  ]);
  // Start mid-strip so both arrows have room — a boundary start could clamp and mask an un-inverted keymap.
  readonly index = signal(2);
}

describe('CaeGalleria RTL arrow keys (#288)', () => {
  let fixture: ComponentFixture<GalleriaRtlHost>;

  async function mount(direction: Direction): Promise<CaeGalleria> {
    await TestBed.configureTestingModule({ imports: [GalleriaRtlHost] }).compileComponents();
    fixture = TestBed.createComponent(GalleriaRtlHost);
    fixture.componentInstance.direction.set(direction); // set before first CD → born-rtl
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.debugElement.query(By.directive(CaeGalleria)).componentInstance;
  }

  const activeTab = (): HTMLElement =>
    fixture.nativeElement.querySelector('[role="tab"][aria-selected="true"]');
  const activeDot = (): HTMLElement =>
    fixture.nativeElement.querySelector('.cae-galleria__indicator--active');
  const arrow = (elm: HTMLElement, key: string): void => {
    elm.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };

  afterEach(() => fixture?.nativeElement.remove());

  it('thumbnails: ArrowRight steps to the lower index (visually-right thumb) under born-rtl', async () => {
    const g = await mount('rtl');
    arrow(activeTab(), 'ArrowRight'); // physical-right = lower index in an RTL strip
    expect(g.activeIndex()).toBe(1); // LTR would advance to 3
  });

  it('thumbnails: ArrowLeft steps to the higher index under born-rtl', async () => {
    const g = await mount('rtl');
    arrow(activeTab(), 'ArrowLeft');
    expect(g.activeIndex()).toBe(3);
  });

  it('thumbnails: LTR keeps ArrowRight → next (the flip is conditional, not always-inverted)', async () => {
    const g = await mount('ltr');
    arrow(activeTab(), 'ArrowRight');
    expect(g.activeIndex()).toBe(3);
  });

  it('thumbnails: Up/Down do NOT flip under RTL (block axis is direction-independent)', async () => {
    const g = await mount('rtl');
    arrow(activeTab(), 'ArrowDown'); // Down = next regardless of direction
    expect(g.activeIndex()).toBe(3);
  });

  it('indicators: ArrowRight/ArrowLeft mirror visual order under born-rtl', async () => {
    const g = await mount('rtl');
    arrow(activeDot(), 'ArrowRight'); // physical-right = lower index
    expect(g.activeIndex()).toBe(1);
    arrow(activeDot(), 'ArrowLeft'); // physical-left = higher index; back up to 2
    expect(g.activeIndex()).toBe(2);
  });

  // The chevron glyphs re-aim under RTL via a host flag (the pixel rotation is #240-verified; here we assert
  // only that the flag tracks isRtl() — a class-name typo would otherwise ship silently until that pass).
  it('sets the --rtl host flag under born-rtl (drives the chevron re-aim)', async () => {
    await mount('rtl');
    const host = fixture.nativeElement.querySelector('cae-galleria') as HTMLElement;
    expect(host.classList.contains('cae-galleria--rtl')).toBe(true);
  });

  it('clears the --rtl host flag under LTR (the flag is conditional, not always-on)', async () => {
    await mount('ltr');
    const host = fixture.nativeElement.querySelector('cae-galleria') as HTMLElement;
    expect(host.classList.contains('cae-galleria--rtl')).toBe(false);
  });
});
