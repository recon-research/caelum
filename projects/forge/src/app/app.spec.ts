import {
  ComponentFixture,
  DeferBlockBehavior,
  DeferBlockState,
  TestBed,
} from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { App } from './app';

/**
 * Render every `@defer` block (#85) to its loaded state. The reference/demo sections below the
 * fold — the structure tree, reference tabs, FAQ accordion, and tag row — are `@defer (on idle)`
 * so their Material modules (MatTree/MatTabs/MatExpansion/MatChips) split off Forge's initial
 * bundle. Under `DeferBlockBehavior.Manual` they stay as placeholders until rendered, so any test
 * asserting on that content renders the blocks first (deterministic — no reliance on idle timing).
 */
async function renderDeferred(fixture: ComponentFixture<App>): Promise<void> {
  for (const block of await fixture.getDeferBlocks()) {
    await block.render(DeferBlockState.Complete);
  }
  fixture.detectChanges();
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // Deterministically control the @defer blocks (#85) — see renderDeferred above.
      deferBlockBehavior: DeferBlockBehavior.Manual,
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

  // Helper: the notifications-demo button whose label matches (each is an inner <button> of a
  // cae-button; clicking it bubbles to the host's (click), like the theme-toggle test).
  const notifyButton = (el: HTMLElement, label: string): HTMLButtonElement =>
    Array.from(el.querySelectorAll('.forge-notify__actions cae-button button')).find(
      (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement;

  it('fires a self-announcing cae-toast from the notifications demo (#96)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();

    // Fire-and-forget: the toast renders into the overlay carrying its OWN aria-live region, and no
    // echo shows (the ref isn't used) — so the toast, not the form status region, is the announcer.
    notifyButton(el, 'Save settings').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(overlay.querySelector('mat-snack-bar-container')?.textContent).toContain(
      'Workspace settings saved',
    );
    // The echo live region is persistently mounted but empty here — the toast's own aria-live region
    // is the announcer for the fire-and-forget case, not the echo.
    expect(el.querySelector('.forge-notify__echo')?.textContent?.trim()).toBe('');

    TestBed.inject(OverlayContainer).ngOnDestroy();
  });

  it('echoes the CaeToastRef action back when the toast Undo is clicked (#96)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();

    // The echo live region must ALREADY exist (empty) before the action fires, so a screen reader
    // announces the later text as a CHANGE to a persistent region — not a region stamped together with
    // its text (which is commonly not announced). This guards the a11y fix, which a textContent-only
    // assertion would miss.
    const echo = (): HTMLElement | null => el.querySelector('.forge-notify__echo');
    expect(echo()).not.toBeNull();
    expect(echo()!.textContent!.trim()).toBe('');

    // A fresh fixture means no prior toast — the action toast opens without MatSnackBar's flaky
    // replace-an-open-toast hop. Its Undo button fires the returned CaeToastRef's onAction(), which
    // sets the echo signal — proof the ref (not just fire-and-forget) round-trips end to end.
    notifyButton(el, 'Archive project').click();
    fixture.detectChanges();
    await fixture.whenStable();
    const container = overlay.querySelector('mat-snack-bar-container')!;
    expect(container.textContent).toContain('Project archived');
    const undo = container.querySelector('button') as HTMLButtonElement;
    expect(undo.textContent).toContain('Undo');

    undo.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(echo()?.textContent).toContain('Archive undone');

    TestBed.inject(OverlayContainer).ngOnDestroy();
  });

  it('renames the workspace through a lazily-loaded cae-dialog (#100)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const app = fixture.componentInstance as unknown as { renameWorkspace(): Promise<void> };

    const settle = async (): Promise<void> => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    // The rename echo region is persistently mounted (empty) BEFORE any rename — so a screen reader
    // announces the later text as a change, not a freshly-stamped region (mirrors the toast echo).
    const echo = (): HTMLElement | null => el.querySelector('.forge-workspace__echo');
    const name = (): string =>
      el.querySelector('.forge-workspace__name')?.textContent?.trim() ?? '';
    expect(echo()).not.toBeNull();
    expect(echo()!.textContent!.trim()).toBe('');
    expect(name()).toBe('Acme Console');

    // The Rename button is wired to renameWorkspace(); we invoke that directly and AWAIT it so the
    // lazy `import()` of the dialog service + body settles deterministically. A DOM click can't be
    // awaited, and the multi-tick import would race test teardown (NG0205); the (click) binding
    // itself is verified by the template compiler in the build.
    expect(
      Array.from(el.querySelectorAll('.forge-workspace cae-button button')).some((b) =>
        b.textContent?.includes('Rename'),
      ),
    ).toBe(true);
    await app.renameWorkspace();
    await settle();

    const surface = overlay.querySelector('mat-dialog-container');
    expect(surface).not.toBeNull();
    expect(surface!.textContent).toContain('Rename workspace');
    // The dialog body is a pure cae-* component pre-filled with the current name via CAE_DIALOG_DATA.
    const input = surface!.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Acme Console');

    // Edit the cae-input CVA and Save — Save closes programmatically via injectCaeDialogRef, so
    // afterClosed() delivers the trimmed new name back to App, which updates the signal + announces.
    input.value = '  Acme Prod  ';
    input.dispatchEvent(new Event('input'));
    await settle();

    // Await the dialog's own afterClosed (the deterministic close signal — the App fixture's CD
    // doesn't drive the separate overlay tree, so a plain settle() loop wouldn't see the disposal).
    const dialogRef = TestBed.inject(MatDialog).openDialogs[0];
    const closedResult = firstValueFrom(dialogRef.afterClosed());
    const save = Array.from(surface!.querySelectorAll('cae-button button')).find(
      (b) => b.textContent?.trim() === 'Save',
    ) as HTMLButtonElement;
    save.click();
    expect(await closedResult).toBe('Acme Prod'); // trimmed result from injectCaeDialogRef.close
    await settle();

    expect(name()).toBe('Acme Prod');
    expect(echo()?.textContent).toContain('Acme Prod');
    expect(overlay.querySelector('mat-dialog-container')).toBeNull();

    TestBed.inject(OverlayContainer).ngOnDestroy();
  });

  it('leaves the workspace name unchanged when the rename dialog is dismissed (#100)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const app = fixture.componentInstance as unknown as { renameWorkspace(): Promise<void> };
    const settle = async (): Promise<void> => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const echo = (): HTMLElement | null => el.querySelector('.forge-workspace__echo');
    const name = (): string =>
      el.querySelector('.forge-workspace__name')?.textContent?.trim() ?? '';

    await app.renameWorkspace();
    await settle();
    const surface = overlay.querySelector('mat-dialog-container');
    expect(surface).not.toBeNull();

    // Cancel is a bare caeDialogClose → '' (falsy). App's `if (name && name !== …)` guard must leave
    // the name unchanged and the echo empty; a dropped truthiness check would blank the name here.
    const dialogRef = TestBed.inject(MatDialog).openDialogs[0];
    const closedResult = firstValueFrom(dialogRef.afterClosed());
    const cancel = Array.from(surface!.querySelectorAll('cae-button button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    cancel.click();
    expect(await closedResult).toBe('');
    await settle();

    expect(name()).toBe('Acme Console');
    expect(echo()?.textContent?.trim()).toBe('');
    expect(overlay.querySelector('mat-dialog-container')).toBeNull();

    TestBed.inject(OverlayContainer).ngOnDestroy();
  });

  // deleteWorkspace() dynamic-`import()`s CaeConfirmService then AWAITS the confirm result, so — unlike
  // renameWorkspace(), whose subscribe is fire-and-forget — it can't be awaited-to-open. The lazy
  // import resolves on a macrotask that fixture.whenStable() doesn't track, so we drive a real-timer
  // poll until the alertdialog appears, choose, then await the method's completion.
  const flushTimer = async (fixture: ComponentFixture<App>): Promise<void> => {
    await new Promise<void>((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const waitForConfirm = async (
    fixture: ComponentFixture<App>,
    overlay: HTMLElement,
  ): Promise<HTMLElement> => {
    for (let i = 0; i < 25 && !overlay.querySelector('mat-dialog-container'); i++) {
      await flushTimer(fixture);
    }
    const surface = overlay.querySelector('mat-dialog-container') as HTMLElement | null;
    expect(surface).not.toBeNull();
    return surface!;
  };
  const confirmButton = (surface: HTMLElement, label: string): HTMLButtonElement =>
    Array.from(surface.querySelectorAll('cae-button button')).find(
      (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement;

  it('deletes the workspace only after confirming through a lazily-loaded cae-confirm (#101)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const app = fixture.componentInstance as unknown as { deleteWorkspace(): Promise<void> };
    // The delete echo (the 2nd persistent live region in the workspace card) starts mounted + empty.
    const deleteEcho = (): HTMLElement =>
      el.querySelectorAll('.forge-workspace__echo')[1] as HTMLElement;
    expect(deleteEcho()).toBeTruthy();
    expect(deleteEcho().textContent!.trim()).toBe('');

    const done = app.deleteWorkspace();
    const surface = await waitForConfirm(fixture, overlay);
    expect(surface.getAttribute('role')).toBe('alertdialog'); // announced as an interruption
    expect(surface.textContent).toContain('Delete workspace?');
    expect(surface.textContent).toContain('Acme Console');

    // Click Delete (the accept action) → confirm() resolves true → deleteWorkspace announces.
    confirmButton(surface, 'Delete').click();
    await done;
    await flushTimer(fixture);

    expect(deleteEcho().textContent).toContain('deleted');
    expect(overlay.querySelector('mat-dialog-container')).toBeNull();

    TestBed.inject(OverlayContainer).ngOnDestroy();
  });

  it('leaves the workspace intact when the delete confirm is rejected (#101)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const app = fixture.componentInstance as unknown as { deleteWorkspace(): Promise<void> };
    const deleteEcho = (): HTMLElement =>
      el.querySelectorAll('.forge-workspace__echo')[1] as HTMLElement;

    const done = app.deleteWorkspace();
    const surface = await waitForConfirm(fixture, overlay);

    // Cancel (the safe, default-focused reject) → confirm() resolves false → nothing announced.
    confirmButton(surface, 'Cancel').click();
    await done;
    await flushTimer(fixture);

    expect(deleteEcho().textContent!.trim()).toBe('');
    expect(overlay.querySelector('mat-dialog-container')).toBeNull();

    TestBed.inject(OverlayContainer).ngOnDestroy();
  });

  it('defers the below-the-fold demo sections off the initial bundle (#85)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // Exactly five @defer blocks — the capacity sliders, structure tree, reference tabs, FAQ
    // accordion, and tag row — each carrying a heavy Material module (MatSlider/MatTree/MatTabs/
    // MatExpansion/MatChips) off the initial bundle. This is the regression guard for the #85 bundle
    // win: deleting an @defer wrapper stays UNDER the 1mb budget error (so `ng build` wouldn't fail),
    // but drops a block here → red test. (The capacity slider card, #109, is the newest: MatSlider is
    // heavy, so it's deferred rather than raising the budget.)
    expect((await fixture.getDeferBlocks()).length).toBe(5);
    // The eager critical path (the create-workspace form) is present with NO defer block rendered...
    expect(el.querySelector('.forge-form-card')).not.toBeNull();
    // ...while the deferred demo sections are genuinely absent until rendered (proof they're lazy).
    expect(el.querySelector('.forge-capacity-card')).toBeNull();
    expect(el.querySelector('cae-tree')).toBeNull();
    expect(el.querySelector('.forge-reference')).toBeNull();
    expect(el.querySelector('.forge-faq')).toBeNull();
    expect(el.querySelector('.forge-tags')).toBeNull();
    // Rendering the blocks brings each section in — so the content isn't lost, only deferred.
    await renderDeferred(fixture);
    expect(el.querySelector('.forge-capacity-card')).not.toBeNull();
    expect(el.querySelector('cae-tree')).not.toBeNull();
    expect(el.querySelector('.forge-reference')).not.toBeNull();
    expect(el.querySelector('.forge-faq')).not.toBeNull();
    expect(el.querySelector('.forge-tags')).not.toBeNull();
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
    expect(card.querySelectorAll('cae-switch').length).toBe(1);
    expect(card.querySelectorAll('cae-radio').length).toBe(1);
    expect(card.querySelectorAll('cae-select').length).toBe(1);
    expect(card.querySelectorAll('cae-select-button').length).toBe(1);
    expect(card.querySelectorAll('cae-toggle-button').length).toBe(1);
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

  it('round-trips the notify preference through the bound cae-switch (#68)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.componentInstance['step'].set(2);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('cae-switch button[role="switch"]') as HTMLButtonElement;
    // The control seeds to true, so the switch renders checked (model → view).
    expect(fixture.componentInstance['form'].getRawValue().notify).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    // A user toggle flows back to the form (view → model).
    toggle.click();
    fixture.detectChanges();
    expect(fixture.componentInstance['form'].getRawValue().notify).toBe(false);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('round-trips visibility (cae-select-button) and pinned (cae-toggle-button) through the form (#73)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const card = (fixture.nativeElement as HTMLElement).querySelector(
      '.forge-form-card',
    ) as HTMLElement;
    const cmp = fixture.componentInstance;

    // cae-select-button (single): clicking "Team" writes 'team' to the form (view → model). Steps
    // stamp eagerly, so both controls are in the DOM regardless of the active step.
    const team = Array.from(card.querySelectorAll('cae-select-button button')).find(
      (b) => b.textContent?.trim() === 'Team',
    ) as HTMLButtonElement;
    team.click();
    fixture.detectChanges();
    expect(cmp['form'].getRawValue().visibility).toBe('team');
    expect(team.getAttribute('aria-checked')).toBe('true');

    // cae-toggle-button (boolean): seeds false, a click flips it to pressed/true.
    const pin = card.querySelector('cae-toggle-button button') as HTMLButtonElement;
    expect(cmp['form'].getRawValue().pinned).toBe(false);
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    pin.click();
    fixture.detectChanges();
    expect(cmp['form'].getRawValue().pinned).toBe(true);
    expect(pin.getAttribute('aria-pressed')).toBe('true');
  });

  it('round-trips the seats + budget cae-sliders through the deferred capacity form (#109)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await renderDeferred(fixture); // the capacity card is @defer'd below the fold (#85, #109)
    const cmp = fixture.componentInstance;
    const card = (fixture.nativeElement as HTMLElement).querySelector(
      '.forge-capacity-card',
    ) as HTMLElement;
    expect(card).not.toBeNull();

    // Both sliders render (single seats + range budget), bound to the standalone capacity form.
    expect(card.querySelectorAll('cae-slider').length).toBe(2);
    // The single seats slider seeds from the model (writeValue → the rendered thumb; single-thumb
    // reflection works in jsdom — the range thumbs need a real browser, #110).
    const seatsThumb = card.querySelector('cae-slider input[matSliderThumb]') as HTMLInputElement;
    expect(seatsThumb.value).toBe('10');
    // The range budget slider renders two named thumbs bound to the [min, max] pair.
    const startThumb = card.querySelector(
      'cae-slider input[matSliderStartThumb]',
    ) as HTMLInputElement;
    const endThumb = card.querySelector('cae-slider input[matSliderEndThumb]') as HTMLInputElement;
    expect(startThumb).not.toBeNull();
    expect(endThumb).not.toBeNull();
    expect(startThumb.getAttribute('aria-label')).toBe('Minimum monthly budget');
    expect(endThumb.getAttribute('aria-label')).toBe('Maximum monthly budget');

    // A programmatic setValue writes THROUGH the CVAs to the rendered controls (model → view): the
    // single seats thumb reflects the new value in jsdom — a real CVA check, not a tautological
    // FormGroup round-trip (range thumbs need a browser, #110). getRawValue then reads the model back,
    // incl. the [start, end] tuple (the mode-dependent value seam).
    cmp['capacity'].setValue({ seats: 25, budget: [150, 600] });
    fixture.detectChanges();
    expect(seatsThumb.value).toBe('25'); // model → view through the CVA writeValue
    expect(cmp['capacity'].getRawValue().seats).toBe(25);
    expect(cmp['capacity'].getRawValue().budget).toEqual([150, 600]);
  });

  it('shows the workspace structure as a cae-tree and announces a selection', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await renderDeferred(fixture); // the structure tree is @defer'd below the fold (#85)
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
    await renderDeferred(fixture); // the reference tabs are @defer'd below the fold (#85)
    // Scope to the reference tabs — the stepper headers also carry role=tab.
    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.forge-reference [role="tab"]',
    );
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent).toContain('Design tokens');
    expect(tabs[1].textContent).toContain('In this batch');
  });

  it('renders a single-expand cae-accordion FAQ that coordinates its panels (#77)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await renderDeferred(fixture); // the FAQ accordion is @defer'd below the fold (#85)
    const faq = (fixture.nativeElement as HTMLElement).querySelector('.forge-faq')!;
    const headers = (): HTMLElement[] =>
      Array.from(faq.querySelectorAll('mat-expansion-panel-header'));
    expect(headers().length).toBe(3);

    // Single-expand end-to-end: opening the second section closes the first (accordion-coordinated).
    headers()[0].click();
    await fixture.whenStable();
    expect(headers()[0].getAttribute('aria-expanded')).toBe('true');
    headers()[1].click();
    await fixture.whenStable();
    expect(headers()[1].getAttribute('aria-expanded')).toBe('true');
    expect(headers()[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('removes a cae-chip tag from the signal list when its × is clicked (#83)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await renderDeferred(fixture); // the tag row is @defer'd below the fold (#85)
    const el = fixture.nativeElement as HTMLElement;
    const chips = (): HTMLElement[] => Array.from(el.querySelectorAll('.forge-tags cae-chip'));
    expect(chips().length).toBe(3);

    // Click the first chip's remove button → (removed) drops the tag → the chip unrenders.
    const firstRemove = chips()[0].querySelector('button')!;
    const firstLabel = chips()[0].textContent?.trim();
    firstRemove.click();
    await fixture.whenStable();
    expect(chips().length).toBe(2);
    expect(chips().map((c) => c.textContent?.trim())).not.toContain(firstLabel);
    // The removal is announced in a live region (standalone chips don't self-manage focus/announce).
    const status = el.querySelector('.forge-tags__status')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('Removed');
    expect(status.textContent).toContain('2 tags remaining');
  });

  it('renders a live wizard-progress strip from the display primitives (#88)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    const card = (fixture.nativeElement as HTMLElement).querySelector(
      '.forge-form-card',
    ) as HTMLElement;

    // The cae-progress-bar carries the announced value; on step 0 that's 33% (step 1 of 3).
    const bar = card.querySelector('cae-progress-bar mat-progress-bar')!;
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-label')).toBe('Workspace setup progress');
    expect(bar.getAttribute('aria-valuenow')).toBe('33');

    // A VERTICAL cae-divider separates the bar from the ring (its display:contents wrapper hoists
    // the inner mat-divider, which is the actual role=separator element).
    const divider = card.querySelector('.forge-progress mat-divider')!;
    expect(divider.getAttribute('role')).toBe('separator');
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');

    // The cae-progress-spinner ring is a decorative echo — hidden from AT so the value is announced
    // once (by the bar), not twice.
    const ring = card.querySelector('.forge-progress__ring')!;
    expect(ring.getAttribute('aria-hidden')).toBe('true');
    expect(ring.querySelector('cae-progress-spinner mat-progress-spinner')).toBeTruthy();

    // It's live: advancing to the last step fills the meter to 100% (signal-driven via stepProgress).
    cmp['step'].set(2);
    fixture.detectChanges();
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
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
      visibility: 'team',
      description: '',
      password: 'password1',
      agree: true,
      notify: true,
      pinned: false,
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
    // cae-select-button forwards describedby onto each option's inner <button> (mat-button-toggle
    // has no aria-describedby input) — assert on the first option button.
    const firstVisBtn = (): Element | null => el.querySelector('cae-select-button button');

    // Before submit: no consumer errors, and no dangling describedby references.
    expect(el.querySelector('#plan-error')).toBeNull();
    expect(el.querySelector('#agree-error')).toBeNull();
    expect(el.querySelector('#visibility-error')).toBeNull();
    expect(firstRadio()?.getAttribute('aria-describedby')).toBeNull();
    expect(agreeBox()?.getAttribute('aria-describedby')).toBeNull();
    expect(firstVisBtn()?.getAttribute('aria-describedby')).toBeNull();

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
    // visibility (cae-select-button) — same consumer-owned pattern, described onto its buttons.
    expect(el.querySelector('#visibility-error')?.textContent).toContain('Choose who can see');
    expect(firstVisBtn()?.getAttribute('aria-describedby')).toBe('visibility-error');
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
      visibility: 'team',
      description: '',
      password: 'password1',
      agree: true,
      notify: true,
      pinned: false,
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
    await renderDeferred(fixture); // swatches live in the @defer'd reference tabs (#85)
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
