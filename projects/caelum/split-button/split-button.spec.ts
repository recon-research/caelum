import { Component, ComponentRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CAE_ICON_GLYPHS } from 'caelum/icon';
import { CaeMenuTrigger, type CaeMenuItem } from 'caelum/menu';

import { CaeSplitButton } from './split-button';
import { expectNoA11yViolations } from '../testing/a11y';

const MODEL: CaeMenuItem[] = [
  { value: 'close', label: 'Save and close' },
  { value: 'draft', label: 'Save as draft' },
];

describe('CaeSplitButton', () => {
  let fixture: ComponentFixture<CaeSplitButton>;
  let ref: ComponentRef<CaeSplitButton>;
  let cmp: CaeSplitButton;
  let el: HTMLElement;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeSplitButton] }).compileComponents();
    overlayContainer = TestBed.inject(OverlayContainer);
  });

  afterEach(() => overlayContainer?.ngOnDestroy());

  // Drive inputs via ComponentRef.setInput (marks the OnPush input dirty — the reliable path for a
  // zoneless OnPush child; a host-wrapper field mutation doesn't propagate on plain detectChanges).
  async function setup(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(CaeSplitButton);
    ref = fixture.componentRef;
    cmp = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    ref.setInput('label', 'Save');
    ref.setInput('model', MODEL);
    for (const [k, v] of Object.entries(inputs)) ref.setInput(k, v);
    await flush();
  }

  async function flush(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  // The two <button> halves in DOM order: [0] primary command, [1] chevron toggle. The cae-menu
  // panel is a <mat-menu> template — not in the host DOM until opened — so exactly two buttons.
  const buttons = () => Array.from(el.querySelectorAll('button'));
  const primary = () => buttons()[0];
  const toggle = () => buttons()[1];
  const trigger = (): CaeMenuTrigger =>
    fixture.debugElement.query(By.directive(CaeMenuTrigger)).injector.get(CaeMenuTrigger);
  const menuItems = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[mat-menu-item]'));
  // matButton reflects its appearance as mat-*/mdc-* classes; extract just those (not the BEM
  // cae-split-button__* names) so the variant assertion checks only that appearance flows to both
  // halves and is reactive, without hardcoding Material's exact class name.
  const appearance = (btn: HTMLElement) =>
    Array.from(btn.classList)
      // mat-*/mdc-* only, minus mat-mdc-menu-trigger (present on the toggle, absent on the primary —
      // it's the menu wiring, not the button appearance).
      .filter((c) => (c.startsWith('mat') || c.startsWith('mdc')) && !c.includes('menu-trigger'))
      .sort()
      .join(' ');

  it('has no axe violations (labeled group, primary + chevron)', async () => {
    await setup({ ariaLabel: 'Save actions' });
    await expectNoA11yViolations(el);
  });

  it('renders the primary label and groups the two halves under role=group', async () => {
    await setup();
    expect(buttons().length).toBe(2);
    expect(primary().textContent!.trim()).toBe('Save');
    expect(el.querySelector('[role="group"]')).not.toBeNull();
  });

  it('emits the click event when the primary command button is activated', async () => {
    await setup();
    let event: MouseEvent | undefined;
    cmp.primaryClick.subscribe((e) => (event = e));
    primary().click();
    expect(event?.type).toBe('click');
  });

  it('renders both halves as type=button so neither submits an enclosing form (#148 review)', async () => {
    await setup();
    expect(primary().type).toBe('button');
    expect(toggle().type).toBe('button');
  });

  it('lets the primary opt into type=submit while the toggle stays type=button', async () => {
    await setup({ type: 'submit' });
    expect(primary().type).toBe('submit');
    expect(toggle().type).toBe('button'); // the toggle only opens the menu; it never submits
  });

  it('names the icon-only chevron toggle with menuAriaLabel (chevron itself hidden)', async () => {
    await setup({ menuAriaLabel: 'More save options' });
    expect(toggle().getAttribute('aria-label')).toBe('More save options');
    expect(el.querySelector('.cae-split-button__chevron')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('keeps the toggle named when menuAriaLabel is cleared (no nameless icon button)', async () => {
    await setup({ menuAriaLabel: '' });
    expect(toggle().getAttribute('aria-label')).toBe('More actions');
  });

  it('disables both halves when [disabled]', async () => {
    await setup({ disabled: true });
    expect(primary().disabled).toBe(true);
    expect(toggle().disabled).toBe(true);
  });

  it('disables only the toggle when the model is empty (no dead-end empty menu)', async () => {
    await setup({ model: [] });
    expect(toggle().disabled).toBe(true);
    expect(primary().disabled).toBe(false);
  });

  it('exposes the group accessible name via ariaLabel', async () => {
    await setup({ ariaLabel: 'Save actions' });
    expect(el.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Save actions');
  });

  it('applies variant to both halves, reactively', async () => {
    await setup();
    const filled = appearance(primary());
    expect(appearance(toggle())).toBe(filled); // shared across halves
    ref.setInput('variant', 'outlined');
    await flush();
    expect(appearance(primary())).not.toBe(filled); // reactive
    expect(appearance(toggle())).toBe(appearance(primary())); // still shared
  });

  it('opens the dropdown and renders one menu item per model entry', async () => {
    await setup();
    trigger().open();
    await flush();
    expect(menuItems().length).toBe(MODEL.length);
    expect(menuItems()[0].textContent).toContain('Save and close');
  });

  it('emits itemSelect with the chosen dropdown item', async () => {
    await setup();
    let selected: CaeMenuItem | undefined;
    cmp.itemSelect.subscribe((i) => (selected = i));
    trigger().open();
    await flush();
    menuItems()[1].click();
    await flush();
    expect(selected?.value).toBe('draft');
  });
});

@Component({
  imports: [CaeSplitButton],
  template: `
    <cae-split-button
      label="Save"
      icon="plus"
      [model]="model()"
      [iconTemplate]="useTpl() ? tpl : null"
    />
    <ng-template #tpl let-item let-index="index">
      <span class="custom-icon">{{ index }}:{{ item.value }}</span>
    </ng-template>
  `,
})
class IconHost {
  readonly model = signal<readonly CaeMenuItem[]>([
    { value: 'close', label: 'Save and close', icon: 'folder' },
    { value: 'draft', label: 'Save as draft' },
  ]);
  readonly useTpl = signal(false);
}

describe('CaeSplitButton icons (D-596 / #149)', () => {
  let overlayContainer: OverlayContainer;

  afterEach(() => overlayContainer?.ngOnDestroy());

  it('renders the primary icon glyph before the label, which stays the accessible name', async () => {
    await TestBed.configureTestingModule({ imports: [CaeSplitButton] }).compileComponents();
    overlayContainer = TestBed.inject(OverlayContainer);
    const fixture = TestBed.createComponent(CaeSplitButton);
    fixture.componentRef.setInput('label', 'Save');
    fixture.componentRef.setInput('icon', 'plus');
    fixture.detectChanges();
    await fixture.whenStable();
    const primary = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.cae-split-button__primary',
    )!;
    const glyph = primary.querySelector('svg');
    expect(glyph?.querySelector('path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.plus);
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    // EXACTLY the label (trimmed equality, not toContain) — the glyph adds no name text.
    expect(primary.textContent?.trim()).toBe('Save');
    // Clearing the input removes the glyph (the chevron lives in the toggle, not here).
    fixture.componentRef.setInput('icon', null);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(primary.querySelector('svg')).toBeNull();
  });

  it('renders model[].icon in the dropdown and forwards iconTemplate to the embedded cae-menu', async () => {
    await TestBed.configureTestingModule({ imports: [IconHost] }).compileComponents();
    overlayContainer = TestBed.inject(OverlayContainer);
    const fixture = TestBed.createComponent(IconHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const open = async (): Promise<void> => {
      fixture.debugElement.query(By.directive(CaeMenuTrigger)).injector.get(CaeMenuTrigger).open();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const menuItems = (): HTMLElement[] =>
      Array.from(document.querySelectorAll<HTMLElement>('[mat-menu-item]'));

    // Per-item glyphs flow through the embedded cae-menu with no split-button-side wiring …
    await open();
    expect(menuItems()[0].querySelector('svg path')?.getAttribute('d')).toBe(
      CAE_ICON_GLYPHS.folder,
    );
    expect(menuItems()[1].querySelector('svg')).toBeNull();
    fixture.debugElement.query(By.directive(CaeMenuTrigger)).injector.get(CaeMenuTrigger).close();
    fixture.detectChanges();
    await fixture.whenStable();

    // … while [iconTemplate] IS split-button wiring: forwarded verbatim, and it wins (D-596).
    fixture.componentInstance.useTpl.set(true);
    fixture.detectChanges();
    await open();
    const custom = menuItems().map((el) => el.querySelector('.custom-icon')?.textContent);
    expect(custom).toEqual(['0:close', '1:draft']);
    expect(menuItems()[0].querySelector('svg')).toBeNull();
    // The template governs only the DROPDOWN's icon slot: the primary [icon] glyph survives.
    const primary = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.cae-split-button__primary',
    )!;
    expect(primary.querySelector('svg path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.plus);
    expect(primary.querySelector('.custom-icon')).toBeNull();
  });
});
