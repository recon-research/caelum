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

  it('builds the form entirely from cae-* components (batch 1 + batch 2)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('cae-input').length).toBe(3);
    expect(el.querySelectorAll('cae-checkbox').length).toBe(1);
    expect(el.querySelectorAll('cae-radio').length).toBe(1);
    expect(el.querySelectorAll('cae-select').length).toBe(1);
    expect(el.querySelectorAll('cae-textarea').length).toBe(1);
    // The whole form + a submit button all rendered in the active tab.
    expect(el.querySelector('form cae-button button[type="submit"]')).toBeTruthy();
  });

  it('organises the reference panels into cae-tabs', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent).toContain('Design tokens');
    expect(tabs[1].textContent).toContain('In this batch');
  });

  it('announces success in a persistent polite live region on submit', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp['form'].setValue({
      name: 'Acme',
      email: 'a@b.co',
      plan: 'pro',
      region: 'us-east',
      description: '',
      password: 'password1',
      agree: true,
    });
    cmp['submit']();
    fixture.detectChanges();
    await fixture.whenStable();
    const region = (fixture.nativeElement as HTMLElement).querySelector('.forge-form__status');
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.textContent).toContain('Acme');
  });

  it('surfaces every semantic swatch token in the first reference tab', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    // Swatches live in the first (default-active) cae-tab — proof cae-tab projects its
    // content into the Material tab body.
    const chips = (fixture.nativeElement as HTMLElement).querySelectorAll('.forge-swatch');
    expect(chips.length).toBe(fixture.componentInstance['swatches'].length);
  });

  it('cycles auto → light → dark → auto and re-binds the document root', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = document.documentElement;
    // The header also holds a native help button, so target the theme cae-button's button.
    const toggle = (fixture.nativeElement as HTMLElement).querySelector(
      '.forge-bar cae-button button',
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
