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
    // Scope to the create-workspace card — a second, linear stepper demo (#40) lives lower on
    // the page and would otherwise inflate these global control/header counts.
    const card = el.querySelector('.forge-form-card') as HTMLElement;
    // Three projected cae-step headers (the stepper uses role=tab for its headers).
    const stepHeaders = card.querySelectorAll('form [role="tab"]');
    expect(stepHeaders.length).toBe(3);
    expect(card.querySelector('form')?.textContent).toContain('Identity');
    // Every control is a cae-* wrapper; steps stamp eagerly, so all are in the DOM at once.
    expect(card.querySelectorAll('cae-input').length).toBe(3);
    expect(card.querySelectorAll('cae-checkbox').length).toBe(1);
    expect(card.querySelectorAll('cae-radio').length).toBe(1);
    expect(card.querySelectorAll('cae-select').length).toBe(1);
    expect(card.querySelectorAll('cae-textarea').length).toBe(1);
    // On the first step, Next is shown — not the submit button.
    expect(card.querySelector('form cae-button button[type="submit"]')).toBeNull();
    expect(card.querySelector('form')?.textContent).toContain('Next');
  });

  it('reveals the submit button on the last wizard step', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.componentInstance['step'].set(2);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.forge-form-card form cae-button button[type="submit"]')).toBeTruthy();
  });

  it('drives the wizard from a functional header cae-menu (Fill with sample data)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // The menu panel + its cae-button trigger are present; #57 forwards MatMenuTrigger to the
    // cae-button's inner focusable <button>, so aria-haspopup lands on the real control.
    expect(el.querySelector('cae-menu')).toBeTruthy();
    expect(
      el.querySelector('cae-button button[aria-haspopup="menu"][aria-label="Workspace actions"]'),
    ).toBeTruthy();
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

  it('announces an error and jumps to the first invalid step on a bad submit', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    // Steps 0 (name/email) valid, step 1 (plan/region) invalid — the jump target must be 1,
    // not a hardcoded 0, and the failure must be announced (not silent focus loss).
    cmp['form'].patchValue({ name: 'Acme', email: 'a@b.co' });
    cmp['submit']();
    fixture.detectChanges();
    await fixture.whenStable();
    const region = (fixture.nativeElement as HTMLElement).querySelector('.forge-form__status');
    expect(region?.textContent).toContain('missing');
    expect(cmp['step']()).toBe(1);
  });

  it('surfaces a per-field error on every required control on a bad submit — no silent-invalid (#47)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const firstRadio = (): Element | null => el.querySelector('cae-radio input[type="radio"]');
    const agreeBox = (): Element | null => el.querySelector('cae-checkbox input[type="checkbox"]');

    // Before submit: no consumer errors, and no dangling describedby references.
    expect(el.querySelector('#plan-error')).toBeNull();
    expect(el.querySelector('#agree-error')).toBeNull();
    expect(firstRadio()?.getAttribute('aria-describedby')).toBeNull();
    expect(agreeBox()?.getAttribute('aria-describedby')).toBeNull();

    // Submit the empty form through the real form event so FormGroupDirective.submitted is set.
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // region (cae-select) forwards into its mat-form-field — a real <mat-error>, not silent-invalid.
    // Scope to the create-workspace card: the invite demo has its own cae-select lower on the page.
    const card = el.querySelector('.forge-form-card') as HTMLElement;
    const regionField = card.querySelector('cae-select mat-form-field');
    expect(regionField?.className).toContain('invalid');
    expect(card.querySelector('cae-select mat-error')?.textContent).toContain(
      'A region is required',
    );

    // plan (cae-radio) + agree (cae-checkbox) aren't mat-form-fields: consumer messages, linked
    // via ariaDescribedby ON THE FOCUSABLE INPUTS (a radiogroup container never receives focus).
    expect(el.querySelector('#plan-error')?.textContent).toContain('Choose a plan');
    expect(firstRadio()?.getAttribute('aria-describedby')).toBe('plan-error');
    expect(el.querySelector('#agree-error')?.textContent).toContain('accept the terms');
    expect(agreeBox()?.getAttribute('aria-describedby')).toBe('agree-error');
  });

  it('reset clears the errors and the submitted flag so a fresh form is not a wall of errors (#29)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    // mat-form-field carries a *-invalid class only while it is actually showing errors
    // (driven by errorState). The <mat-error> node persists in the DOM even when hidden, so
    // count invalid FIELDS, not mat-error elements.
    // Scope to the create-workspace card so the invite demo's fields don't skew the count.
    const card = el.querySelector('.forge-form-card') as HTMLElement;
    const invalidFieldCount = (): number =>
      Array.from(card.querySelectorAll('mat-form-field')).filter((f) =>
        f.className.includes('invalid'),
      ).length;

    // Submit the empty form through the real form event so FormGroupDirective.submitted is set
    // (calling submit() alone wouldn't). It's invalid → required cae-inputs light up.
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cmp['formDir']()?.submitted).toBe(true);
    expect(invalidFieldCount()).toBeGreaterThan(0);

    // Reset must clear BOTH the model and the directive's submitted flag; otherwise the
    // pristine, untouched blank form keeps showing those errors (the regression #29's fix guards).
    cmp['reset']();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cmp['formDir']()?.submitted).toBe(false);
    expect(invalidFieldCount()).toBe(0);
  });

  it('gates the linear invite stepper until the step is valid, surfacing a prompt (#40)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    // The demo renders a second, linear stepper (2 steps) below the create-workspace wizard.
    const invite = (fixture.nativeElement as HTMLElement).querySelector(
      '.forge-invite-card',
    ) as HTMLElement;
    expect(invite.querySelectorAll('[role="tab"]').length).toBe(2);
    // Empty email → step 0 invalid. A premature "Next" doesn't advance and surfaces a prompt in
    // the persistent live region (not a silent no-op). The library's selectedIndex reconciliation
    // for a *blind* index push is covered separately in stepper.spec.ts ("CaeStepper (linear)").
    cmp['inviteNext']();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cmp['inviteStep']()).toBe(0);
    expect(invite.querySelector('.forge-form__status')?.textContent).toContain(
      'Complete this step',
    );
  });

  it('wires a control through nested formGroupName inside a projected linear step (#40)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    // Type into the RENDERED invite email input (step 0 stamps eagerly): the value only reaches
    // `invite.contact.email` if formGroupName="contact" + formControlName="email" resolved through
    // cae-step's double projection to the ancestor [formGroup]. The model-only tests below would
    // pass even if that template wiring were broken — this exercises it end-to-end.
    const email = (fixture.nativeElement as HTMLElement).querySelector(
      '.forge-invite-card input[type="email"]',
    ) as HTMLInputElement;
    expect(email).toBeTruthy();
    email.value = 'wired@acme.dev';
    email.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(cmp['inviteContact'].controls.email.value).toBe('wired@acme.dev');
  });

  it('advances the linear invite stepper once valid and sends the invitation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp['inviteContact'].controls.email.setValue('teammate@acme.dev');
    cmp['inviteNext']();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cmp['inviteStep']()).toBe(1);

    cmp['inviteAccess'].controls.role.setValue('member');
    cmp['sendInvite']();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(cmp['inviteSent']()).toBe('teammate@acme.dev');
  });

  it('keeps the invite submit interactive-disabled with an explanatory tooltip until a role is chosen (#58)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    // Reach the Access step with a valid contact but no role → invite.invalid.
    cmp['inviteContact'].controls.email.setValue('teammate@acme.dev');
    cmp['inviteNext']();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    const submit = (): HTMLButtonElement =>
      (fixture.nativeElement as HTMLElement).querySelector(
        '.forge-invite-card cae-button button[type="submit"]',
      ) as HTMLButtonElement;
    // Interactive-disabled: no native `disabled` attr (so it stays focusable/hoverable), but
    // aria-disabled announces the state, and the explanatory tooltip's description is attached.
    expect(submit().hasAttribute('disabled')).toBe(false);
    expect(submit().getAttribute('aria-disabled')).toBe('true');
    expect(submit().getAttribute('aria-describedby')).toBeTruthy();

    // Once a role is chosen the button enables and the tooltip (and its describedby) drop away.
    cmp['inviteAccess'].controls.role.setValue('member');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(submit().getAttribute('aria-disabled')).toBeNull();
    expect(submit().hasAttribute('aria-describedby')).toBe(false);
  });

  it('announces the invite result in a persistent live region (#40 a11y)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    const invite = (): HTMLElement =>
      (fixture.nativeElement as HTMLElement).querySelector('.forge-invite-card') as HTMLElement;
    // The region is mounted BEFORE any result (persistent, so a screen reader observes the
    // later mutation) with the right live-region semantics.
    const region = invite().querySelector('.forge-form__status');
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    // On success it carries the announcement — the form (and its focused button) is swapped out,
    // but the region persists so focus/announcement aren't lost (mirrors the wizard's pattern).
    cmp['inviteContact'].controls.email.setValue('teammate@acme.dev');
    cmp['inviteAccess'].controls.role.setValue('member');
    cmp['sendInvite']();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(invite().querySelector('.forge-form__status')?.textContent).toContain(
      'teammate@acme.dev',
    );
  });

  it('“Create another” resets the create-workspace form, not the invite form (#40)', async () => {
    // Regression guard: a second [formGroup] (the invite demo) made viewChild(FormGroupDirective)
    // ambiguous — once the wizard form was swapped for "Create another", the query flipped to the
    // invite form and reset() wiped the wrong one. The fix queries the wizard form by template ref.
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    // An in-progress invite that must survive, and a successful workspace submit.
    cmp['inviteContact'].controls.email.setValue('keep@acme.dev');
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
    expect(cmp['created']()).toBe('Acme');
    // "Create another" → reset(): must clear the WORKSPACE form and leave the invite untouched.
    cmp['reset']();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(cmp['form'].getRawValue().name).toBe('');
    expect(cmp['inviteContact'].controls.email.value).toBe('keep@acme.dev');
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
    // The header now holds two cae-buttons (actions menu + theme), so target the theme one by
    // its accessible name to click the right control.
    const toggle = (fixture.nativeElement as HTMLElement).querySelector(
      '.forge-bar cae-button button[aria-label="Switch colour theme"]',
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
