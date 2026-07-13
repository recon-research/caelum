import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BreadcrumbDemo } from './breadcrumb-demo';

// Forge-side liveness for #333: the demo's (itemSelect) handler must intercept a link crumb's native
// navigation (originalEvent.preventDefault) so this router-less SPA survives an activation, must fire a
// url-less command crumb as a button, and must re-announce a repeat activation. This is exactly the
// interception path the second-trail regression (both review lenses) would have broken silently.
describe('BreadcrumbDemo', () => {
  let fixture: ComponentFixture<BreadcrumbDemo>;
  let el: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [BreadcrumbDemo] });
    fixture = TestBed.createComponent(BreadcrumbDemo);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const echo = (): string => el.querySelector('.forge-breadcrumb-echo')!.textContent!.trim();

  it('intercepts a link crumb activation so navigation is suppressed (SPA survives) and echoes the label', () => {
    const link = el.querySelector('a') as HTMLAnchorElement; // first link = the home crumb
    const ev = new MouseEvent('click', { cancelable: true });
    link.dispatchEvent(ev);
    fixture.detectChanges();
    expect(ev.defaultPrevented).toBe(true); // onSelect preventDefaulted — no full-page navigation
    expect(echo()).toContain('Home');
  });

  it('every trail wires interception — no link performs an un-prevented navigation', () => {
    // Guards the row-2 regression: each rendered link, when clicked, must be preventDefaulted by the demo.
    const links = Array.from(el.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const ev = new MouseEvent('click', { cancelable: true });
      link.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
    }
  });

  it('activates the url-less command crumb (a real button) without navigation and echoes it', () => {
    const button = el.querySelector('.cae-breadcrumb__button') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.tagName.toLowerCase()).toBe('button');
    expect(button.textContent!.trim()).toBe('Reindex');
    button.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    fixture.detectChanges();
    expect(echo()).toContain('Reindex');
    // Activation never navigates, so the button stays mounted (a link would have torn the page down).
    expect(el.querySelector('.cae-breadcrumb__button')).toBe(button);
  });

  it('re-announces the command crumb on repeat activation (count changes the live-region text)', () => {
    const button = el.querySelector('.cae-breadcrumb__button') as HTMLButtonElement;
    button.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    fixture.detectChanges();
    expect(echo()).not.toContain('×'); // first activation: no count suffix
    button.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    fixture.detectChanges();
    expect(echo()).toContain('×2'); // second: text changes so aria-live re-announces
  });
});
