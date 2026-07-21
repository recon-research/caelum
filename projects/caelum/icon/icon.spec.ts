import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CAE_ICON_GLYPHS, CaeIcon } from './icon';

describe('CaeIcon', () => {
  let fixture: ComponentFixture<CaeIcon>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeIcon] }).compileComponents();
    fixture = TestBed.createComponent(CaeIcon);
  });

  const svg = (): SVGSVGElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector('svg');

  it('renders the named glyph as decorative inline SVG', () => {
    fixture.componentRef.setInput('name', 'home');
    fixture.detectChanges();
    const glyph = svg();
    expect(glyph).not.toBeNull();
    expect(glyph!.querySelector('path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.home);
    // Decorative by contract (D-596): hidden from AT and unfocusable — the accessible name
    // belongs to the neighbouring interactive element, never the glyph.
    expect(glyph!.getAttribute('aria-hidden')).toBe('true');
    expect(glyph!.getAttribute('focusable')).toBe('false');
  });

  it('follows a runtime name change', () => {
    fixture.componentRef.setInput('name', 'home');
    fixture.detectChanges();
    fixture.componentRef.setInput('name', 'folder');
    fixture.detectChanges();
    expect(svg()!.querySelector('path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.folder);
  });

  it('renders nothing and dev-warns for an unknown name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      fixture.componentRef.setInput('name', 'no-such-glyph');
      fixture.detectChanges();
      expect(svg()).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no-such-glyph'));
    } finally {
      warn.mockRestore();
    }
  });

  it('treats Object.prototype names as unknown (renders nothing, dev-warns)', () => {
    // 'toString' is inherited by every object literal: a bare index returns the inherited
    // FUNCTION (truthy → a garbage-d svg) and `in` walks the prototype chain (→ no warn).
    // Both sites must gate on OWN keys. Realistic input: server-driven item data.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      fixture.componentRef.setInput('name', 'toString');
      fixture.detectChanges();
      expect(svg()).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('toString'));
    } finally {
      warn.mockRestore();
    }
  });

  it('is silent for a known name (the guard fires only on real misses)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      fixture.componentRef.setInput('name', 'chevron-right');
      fixture.detectChanges();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
