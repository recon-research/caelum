import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';

import { CaeDialog } from 'caelum/dialog';
import { CaeGalleria, type CaeGalleriaItem } from './galleria';

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

  describe('fullscreen (openFullscreen config seam — spied CaeDialog.open, no overlay)', () => {
    it('opens the lightbox centered with the current index and the sync + circular seams', async () => {
      await render({ activeIndex: 1, circular: true });
      const spy = vi
        .spyOn(TestBed.inject(CaeDialog), 'open')
        .mockReturnValue({ afterClosed: () => ({ subscribe: () => {} }) } as never);
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
});
