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

  it('lays the form out as a cae-stepper wizard, built from cae-* controls', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // Three projected cae-step headers (the stepper uses role=tab for its headers).
    const stepHeaders = el.querySelectorAll('form [role="tab"]');
    expect(stepHeaders.length).toBe(3);
    expect(el.querySelector('form')?.textContent).toContain('Identity');
    // Every control is a cae-* wrapper; steps stamp eagerly, so all are in the DOM at once.
    expect(el.querySelectorAll('cae-input').length).toBe(3);
    expect(el.querySelectorAll('cae-checkbox').length).toBe(1);
    expect(el.querySelectorAll('cae-radio').length).toBe(1);
    expect(el.querySelectorAll('cae-select').length).toBe(1);
    expect(el.querySelectorAll('cae-textarea').length).toBe(1);
    // On the first step, Next is shown — not the submit button.
    expect(el.querySelector('form cae-button button[type="submit"]')).toBeNull();
    expect(el.querySelector('form')?.textContent).toContain('Next');
  });

  it('reveals the submit button on the last wizard step', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.componentInstance['step'].set(2);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('form cae-button button[type="submit"]')).toBeTruthy();
  });

  it('drives the wizard from a functional header cae-menu (Fill with sample data)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // The menu panel + its focusable native trigger are present.
    expect(el.querySelector('cae-menu')).toBeTruthy();
    expect(el.querySelector('button.forge-action[aria-label="Workspace actions"]')).toBeTruthy();
    // Selecting the "sample" action fills the whole reactive form end-to-end.
    fixture.componentInstance['runAction']({ value: 'sample', label: 'Fill with sample data' });
    expect(fixture.componentInstance['form'].getRawValue().name).toBe('Acme Console');
    expect(fixture.componentInstance['form'].valid).toBe(true);
  });

  it('shows the workspace structure as a cae-tree and announces a selection', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const labels = Array.from(el.querySelectorAll('cae-tree .cae-tree__label')).map((n) =>
      n.textContent?.trim(),
    );
    expect(labels).toContain('Acme Console');
    expect(labels).toContain('Members');
    // Selecting a node announces it in the polite live region.
    fixture.componentInstance['pickNode']({ value: 'members', label: 'Members' });
    fixture.detectChanges();
    expect(el.querySelector('.forge-tree-status')?.textContent).toContain('Members');
  });

  it('organises the reference panels into cae-tabs', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    // Scope to the reference tabs — the stepper headers also carry role=tab.
    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.forge-reference [role="tab"]',
    );
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
    // The header also holds native buttons (help, actions), so target the theme cae-button.
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
