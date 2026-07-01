import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  // The theme toggle re-binds the token layer on the document root, so reset it
  // between tests to keep the shared document clean.
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the Forge shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.forge-bar__title')?.textContent).toContain('Forge');
    expect(el.querySelector('h1')?.textContent).toContain('Direct components');
  });

  it('builds the form entirely from cae-* components', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('cae-input').length).toBe(3);
    expect(el.querySelectorAll('cae-checkbox').length).toBe(1);
    // 3 form fields + a checkbox + a submit button all rendered.
    expect(el.querySelector('form cae-button button[type="submit"]')).toBeTruthy();
  });

  it('announces success in a persistent polite live region on submit', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp['form'].setValue({ name: 'Acme', email: 'a@b.co', password: 'password1', agree: true });
    cmp['submit']();
    fixture.detectChanges();
    await fixture.whenStable();
    const region = (fixture.nativeElement as HTMLElement).querySelector('.forge-form__status');
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.textContent).toContain('Acme');
  });

  it('surfaces every semantic swatch token', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const chips = (fixture.nativeElement as HTMLElement).querySelectorAll('.forge-swatch');
    expect(chips.length).toBe(fixture.componentInstance['swatches'].length);
  });

  it('cycles auto → light → dark → auto and re-binds the document root', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = document.documentElement;
    const toggle = (fixture.nativeElement as HTMLElement).querySelector(
      '.forge-bar button',
    ) as HTMLButtonElement;

    // `auto` — no explicit binding, follows the OS via `color-scheme: light dark`.
    expect(root.hasAttribute('data-theme')).toBe(false);

    toggle.click();
    await fixture.whenStable();
    expect(root.getAttribute('data-theme')).toBe('light');

    toggle.click();
    await fixture.whenStable();
    expect(root.getAttribute('data-theme')).toBe('dark');

    toggle.click();
    await fixture.whenStable();
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});
