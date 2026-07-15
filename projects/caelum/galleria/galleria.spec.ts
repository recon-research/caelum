import { Component, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { of, Subject } from 'rxjs';

import { CaeDialog } from 'caelum/dialog';
import { CaeGalleria, type CaeGalleriaItem } from './galleria';
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
});
