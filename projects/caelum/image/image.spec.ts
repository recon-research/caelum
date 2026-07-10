import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';

import { CaeDialog } from 'caelum/dialog';
import { CaeImage } from './image';

describe('CaeImage', () => {
  let fixture: ComponentFixture<CaeImage>;
  let component: CaeImage;
  let el: HTMLElement;
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /** Create the image, apply inputs, attach to the document (focus/overlay tests need a live tree), render. */
  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(CaeImage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('src', 'photo.jpg');
    fixture.componentRef.setInput('alt', 'A wide star field');
    fixture.componentRef.setInput('preview', true); // preview defaults OFF (p-image parity); most tests need it on
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await settle();
  }

  const img = (): HTMLImageElement | null => el.querySelector('.cae-image__img');
  const trigger = (): HTMLButtonElement | null => el.querySelector('.cae-image__preview');

  // Preview (overlay) helpers.
  const preview = (): HTMLElement | null => containerEl.querySelector('.cae-image-preview');
  const previewImg = (): HTMLImageElement | null =>
    containerEl.querySelector('.cae-image-preview__image');
  const previewStatus = (): HTMLElement | null =>
    containerEl.querySelector('.cae-image-preview__sr-status');
  const btn = (label: string): HTMLButtonElement | null =>
    containerEl.querySelector(`.cae-image-preview__btn[aria-label="${label}"]`);
  const closeBtn = (): HTMLButtonElement | null =>
    containerEl.querySelector('.cae-image-preview__btn--close');
  // The bound CSS transform is the observable output of zoom/rotate/pan — assert it, not internal signals.
  const previewTransform = (): string => previewImg()!.style.transform;

  beforeEach(() => {
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    overlayContainer.ngOnDestroy();
    fixture?.nativeElement.remove();
  });

  // --- The inline image + trigger ---

  it('renders the image with its src and alt', async () => {
    await render();
    expect(img()!.getAttribute('src')).toBe('photo.jpg');
    expect(img()!.getAttribute('alt')).toBe('A wide star field');
  });

  it('is opt-in: no preview trigger by default (p-image parity — a bare image is inert)', async () => {
    fixture = TestBed.createComponent(CaeImage);
    fixture.componentRef.setInput('src', 'photo.jpg');
    fixture.componentRef.setInput('alt', 'A wide star field'); // no [preview] → default false
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await settle();
    expect(trigger()).toBeNull();
    expect(img()).not.toBeNull();
  });

  it('shows a labeled preview trigger when [preview] is set', async () => {
    await render();
    expect(trigger()).not.toBeNull();
    expect(trigger()!.getAttribute('aria-label')).toBe('View full-size image');
    expect(trigger()!.getAttribute('type')).toBe('button');
  });

  it('omits the trigger when [preview] is explicitly false (a plain token-styled image)', async () => {
    await render({ preview: false });
    expect(trigger()).toBeNull();
    expect(img()).not.toBeNull();
  });

  it('passes width/height through to the <img> when set', async () => {
    await render({ width: '200px', height: '120px' });
    expect(img()!.style.width).toBe('200px');
    expect(img()!.style.height).toBe('120px');
  });

  it('renders a valid empty alt for a decorative image (no alt set) without noise', async () => {
    // alt defaults to '' → a valid decorative <img alt="">. No dev-warn: intent (decorative vs forgotten)
    // is undetectable, so a heuristic warn could only false-positive; axe covers the rendered result.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fixture = TestBed.createComponent(CaeImage);
    fixture.componentRef.setInput('src', 'x.jpg'); // no alt
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(img()!.getAttribute('alt')).toBe('');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  // --- openPreview config seam (spied CaeDialog.open, no overlay) ---

  it('opens the preview centered with the image, zoom bounds, and control labels', async () => {
    await render({ caption: 'A caption', minZoom: 0.25, maxZoom: 3, zoomStep: 0.75 });
    const spy = vi
      .spyOn(TestBed.inject(CaeDialog), 'open')
      .mockReturnValue({ afterClosed: () => ({ subscribe: () => {} }) } as never);
    component.openPreview();
    const [comp, config] = spy.mock.calls[0] as [
      unknown,
      {
        maxWidth: string;
        panelClass: string;
        ariaLabel: string;
        data: {
          src: string;
          alt: string;
          caption?: string;
          minZoom: number;
          maxZoom: number;
          zoomStep: number;
          labels: { controls: string; zoomIn: string; close: string };
        };
      },
    ];
    expect(comp).toBeTruthy();
    expect(config.maxWidth).toBe('96vw');
    expect(config.panelClass).toBe('cae-image__preview-panel');
    expect(config.ariaLabel).toBe('A wide star field'); // alt becomes the surface name
    const data = config.data;
    expect(data.src).toBe('photo.jpg');
    expect(data.alt).toBe('A wide star field');
    expect(data.caption).toBe('A caption');
    expect(data.minZoom).toBe(0.25);
    expect(data.maxZoom).toBe(3);
    expect(data.zoomStep).toBe(0.75);
    expect(data.labels.controls).toBe('Image controls');
    expect(data.labels.zoomIn).toBe('Zoom in');
    expect(data.labels.close).toBe('Close');
  });

  it('falls back to "Image preview" as the surface name when alt is empty', async () => {
    await render({ alt: '' });
    const spy = vi
      .spyOn(TestBed.inject(CaeDialog), 'open')
      .mockReturnValue({ afterClosed: () => ({ subscribe: () => {} }) } as never);
    component.openPreview();
    const config = spy.mock.calls[0][1] as { ariaLabel: string; data: { caption?: string } };
    expect(config.ariaLabel).toBe('Image preview');
    expect(config.data.caption).toBeUndefined(); // empty caption is dropped, not passed as ''
  });

  // --- The fullscreen preview (real overlay) ---

  it('opens the preview from a trigger click, showing the image and a labeled toolbar', async () => {
    await render();
    trigger()!.click();
    await settle();
    expect(containerEl.querySelector('mat-dialog-container')).not.toBeNull();
    expect(previewImg()!.getAttribute('alt')).toBe('A wide star field');
    expect(previewImg()!.getAttribute('src')).toBe('photo.jpg');
    expect(
      containerEl.querySelector('.cae-image-preview__toolbar')!.getAttribute('aria-label'),
    ).toBe('Image controls');
  });

  it('does not stack a second preview on a double open', async () => {
    await render();
    const dialog = TestBed.inject(MatDialog);
    component.openPreview();
    component.openPreview();
    await settle();
    expect(dialog.openDialogs).toHaveLength(1);
  });

  it('zooms in: scale grows, the transform reflects it, and the polite live region announces %', async () => {
    await render();
    component.openPreview();
    await settle();
    expect(previewStatus()!.getAttribute('aria-live')).toBe('polite');
    btn('Zoom in')!.click();
    await settle();
    expect(previewTransform()).toContain('scale(1.5)');
    expect(previewStatus()!.textContent!.trim()).toBe('Zoom 150%');
  });

  it('goes aria-disabled at the zoom ceiling and floor, keeping focus (not the disabled property)', async () => {
    // Bounds chosen so the start (1) is already the floor and one step hits the ceiling.
    await render({ minZoom: 1, maxZoom: 1.5, zoomStep: 0.5 });
    component.openPreview();
    await settle();
    expect(btn('Zoom out')!.getAttribute('aria-disabled')).toBe('true'); // at floor
    expect(btn('Zoom in')!.getAttribute('aria-disabled')).toBeNull();
    // The dimmed control is aria-disabled, NOT [disabled] — so it stays a focusable element.
    expect(btn('Zoom out')!.hasAttribute('disabled')).toBe(false);

    // Focus the zoom-in button, then drive it to the ceiling where it dims — focus must NOT strand to
    // <body> (the exact focus-strand bug the carousel/galleria reviews caught).
    btn('Zoom in')!.focus();
    btn('Zoom in')!.click();
    await settle();
    expect(previewStatus()!.textContent!.trim()).toBe('Zoom 150%');
    expect(btn('Zoom in')!.getAttribute('aria-disabled')).toBe('true'); // at ceiling
    expect(btn('Zoom out')!.getAttribute('aria-disabled')).toBeNull();
    expect(document.activeElement).toBe(btn('Zoom in')); // focus retained on the now-dimmed button
  });

  it('rotates right and left (90° steps reflected in the transform)', async () => {
    await render();
    component.openPreview();
    await settle();
    btn('Rotate right')!.click();
    await settle();
    expect(previewTransform()).toContain('rotate(90deg)');
    btn('Rotate left')!.click();
    btn('Rotate left')!.click();
    await settle();
    expect(previewTransform()).toContain('rotate(-90deg)');
  });

  it('resets zoom/rotation/pan back to identity (and dims the reset control there)', async () => {
    await render();
    component.openPreview();
    await settle();
    // The reset control clears rotation + pan too, so it's named "Reset view", not "Reset zoom".
    expect(btn('Reset view')!.getAttribute('aria-disabled')).toBe('true'); // starts at identity
    btn('Zoom in')!.click();
    btn('Rotate right')!.click();
    await settle();
    expect(btn('Reset view')!.getAttribute('aria-disabled')).toBeNull();
    btn('Reset view')!.click();
    await settle();
    expect(previewTransform()).toContain('scale(1)');
    expect(previewTransform()).toContain('rotate(0deg)');
    expect(previewTransform()).toContain('translate(0px, 0px)');
    expect(previewStatus()!.textContent!.trim()).toBe('Zoom 100%');
    expect(btn('Reset view')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('keyboard: +/- zoom and 0 resets (the accessible zoom path)', async () => {
    await render();
    component.openPreview();
    await settle();
    const host = preview()!;
    host.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    await settle();
    expect(previewStatus()!.textContent!.trim()).toBe('Zoom 150%');
    host.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));
    host.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));
    await settle();
    expect(previewStatus()!.textContent!.trim()).toBe('Zoom 50%');
    host.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    await settle();
    expect(previewStatus()!.textContent!.trim()).toBe('Zoom 100%');
  });

  it('keyboard: arrow keys pan the image (the accessible pan path — pan is not drag-only)', async () => {
    await render();
    component.openPreview();
    await settle();
    const host = preview()!;
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await settle();
    // One step right (+32px x) and one step down (+32px y).
    expect(previewTransform()).toContain('translate(32px, 32px)');
  });

  it('pointer drag pans the image (progressive enhancement over the keyboard path)', async () => {
    await render();
    component.openPreview();
    await settle();
    const viewport = containerEl.querySelector('.cae-image-preview__viewport')!;
    // A MouseEvent dispatched as 'pointerdown'/'pointermove' fires the pointer handlers (DOM dispatches by
    // type) and carries clientX/clientY; pointerId is undefined so setPointerCapture is skipped.
    viewport.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }),
    );
    viewport.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 130, clientY: 110, bubbles: true }),
    );
    await settle();
    expect(previewTransform()).toContain('translate(30px, 10px)');
  });

  it('shows a caption in the preview when provided', async () => {
    await render({ caption: 'Deep field, long exposure' });
    component.openPreview();
    await settle();
    expect(containerEl.querySelector('.cae-image-preview__caption')!.textContent!.trim()).toBe(
      'Deep field, long exposure',
    );
  });

  it('closes on the close button (dialog gone after the close animation)', async () => {
    await render();
    const dialog = TestBed.inject(MatDialog);
    component.openPreview();
    await settle();
    expect(preview()).not.toBeNull();
    expect(dialog.openDialogs).toHaveLength(1);
    // Await afterClosed — close() finishes only after the close animation, so the DOM container and
    // openDialogs linger until then (as confirm.spec awaits its ref).
    const closed = new Promise<void>((resolve) =>
      dialog.openDialogs[0].afterClosed().subscribe(() => resolve()),
    );
    closeBtn()!.click();
    await closed;
    await settle();
    expect(dialog.openDialogs).toHaveLength(0);
  });
});
