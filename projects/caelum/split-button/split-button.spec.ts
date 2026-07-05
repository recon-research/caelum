import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CaeMenuTrigger, type CaeMenuItem } from 'caelum/menu';

import { CaeSplitButton } from './split-button';

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
