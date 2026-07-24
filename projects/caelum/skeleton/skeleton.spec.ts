import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeSkeleton } from './skeleton';
import { expectNoA11yViolations } from '../testing/a11y';

describe('CaeSkeleton', () => {
  let fixture: ComponentFixture<CaeSkeleton>;
  let host: HTMLElement;

  const make = async (setup: () => void = () => {}): Promise<void> => {
    fixture = TestBed.createComponent(CaeSkeleton);
    host = fixture.nativeElement as HTMLElement;
    setup();
    await fixture.whenStable();
  };
  const set = (name: string, value: unknown): void => fixture.componentRef.setInput(name, value);

  it('has no axe violations (named busy status)', async () => {
    await make(() => set('ariaLabel', 'Loading profile'));
    await expectNoA11yViolations(host);
  });

  it('is decorative by default — aria-hidden, no role/label', async () => {
    await make();
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.getAttribute('role')).toBeNull();
    expect(host.getAttribute('aria-label')).toBeNull();
    expect(host.getAttribute('aria-busy')).toBeNull();
  });

  it('becomes a named busy status region when [ariaLabel] is set', async () => {
    await make(() => set('ariaLabel', 'Loading profile'));
    // The flip is the load-bearing behaviour: it must LEAVE the a11y tree by default and only
    // enter it (as a live region) when named.
    expect(host.getAttribute('aria-hidden')).toBeNull();
    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-busy')).toBe('true');
    expect(host.getAttribute('aria-label')).toBe('Loading profile');
  });

  it('stays decorative for an empty-string [ariaLabel] (truthy gate, not a defined-check)', async () => {
    // Boundary: `''` must be treated like `undefined` (decorative), not promote the host to a
    // nameless live region. A `!== undefined` mutation would break exactly here.
    await make(() => set('ariaLabel', ''));
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.getAttribute('role')).toBeNull();
    expect(host.getAttribute('aria-label')).toBeNull();
  });

  it('defaults to rect with the shimmer animation', async () => {
    await make();
    expect(host.classList.contains('cae-skeleton')).toBe(true);
    expect(host.classList.contains('cae-skeleton--circle')).toBe(false);
    expect(host.classList.contains('cae-skeleton--shimmer')).toBe(true);
    expect(host.classList.contains('cae-skeleton--pulse')).toBe(false);
  });

  it('reflects [shape]="circle"', async () => {
    await make(() => set('shape', 'circle'));
    expect(host.classList.contains('cae-skeleton--circle')).toBe(true);
  });

  it('reflects [animation] pulse and none', async () => {
    await make(() => set('animation', 'pulse'));
    expect(host.classList.contains('cae-skeleton--pulse')).toBe(true);
    expect(host.classList.contains('cae-skeleton--shimmer')).toBe(false);

    await make(() => set('animation', 'none'));
    expect(host.classList.contains('cae-skeleton--shimmer')).toBe(false);
    expect(host.classList.contains('cae-skeleton--pulse')).toBe(false);
  });

  it('applies [width]/[height] as inline styles only when provided', async () => {
    await make();
    // No inline dimension by default — the stylesheet default (100% / 1rem) governs.
    expect(host.style.inlineSize).toBe('');
    expect(host.style.blockSize).toBe('');

    await make(() => {
      set('width', '3rem');
      set('height', '3rem');
    });
    expect(host.style.inlineSize).toBe('3rem');
    expect(host.style.blockSize).toBe('3rem');
  });

  it('applies [borderRadius] inline for a rect but not a circle', async () => {
    await make(() => set('borderRadius', '2px'));
    expect(host.style.borderRadius).toBe('2px');

    // A circle rounds fully via CSS; a caller radius must NOT override it inline.
    await make(() => {
      set('shape', 'circle');
      set('borderRadius', '2px');
    });
    expect(host.style.borderRadius).toBe('');
  });

  it('drops BOTH shimmer and pulse animation under prefers-reduced-motion', async () => {
    // jsdom does not evaluate @media, so assert the guard SHIPS and covers both paths (the a11y
    // behaviour itself is verified in the real-browser pass, #240). Scoping to the media-query BODY
    // gives it teeth: an empty guard, or one that drops shimmer but not pulse, now fails here.
    const styles = (CaeSkeleton as { ɵcmp?: { styles?: string[] } }).ɵcmp?.styles?.join('\n') ?? '';
    const idx = styles.indexOf('prefers-reduced-motion: reduce');
    expect(idx).toBeGreaterThan(-1);
    const guard = styles.slice(idx);
    expect(guard).toMatch(/cae-skeleton--shimmer/);
    expect(guard).toMatch(/cae-skeleton--pulse/);
    expect(guard).toMatch(/animation:\s*none/);
  });
});
