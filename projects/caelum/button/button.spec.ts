import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatButton } from '@angular/material/button';
import { MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';

import { CaeButton } from './button';
import { CaeMenu, CaeMenuItem } from '../menu/menu';
import { expectNoA11yViolations } from '../testing/a11y';

describe('CaeButton', () => {
  let fixture: ComponentFixture<CaeButton>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeButton] }).compileComponents();
    fixture = TestBed.createComponent(CaeButton);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('has no axe violations (named via ariaLabel)', async () => {
    fixture.componentRef.setInput('ariaLabel', 'Save workspace');
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('renders a Material button carrying the requested variant', () => {
    fixture.componentRef.setInput('variant', 'outlined');
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.directive(MatButton));
    expect(button).toBeTruthy();
    // Material aliases the `appearance` input to the `matButton` binding.
    expect(button.injector.get(MatButton).appearance).toBe('outlined');
  });

  it('forwards the disabled state to the native button', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
  });

  it('applies the tooltip to the inner focusable button, not the wrapper host (#36)', () => {
    fixture.componentRef.setInput('tooltip', 'Save the workspace');
    fixture.detectChanges();
    const tip = fixture.debugElement.query(By.directive(MatTooltip));
    // The directive must sit on the real <button> — the element a keyboard/SR user focuses —
    // so its hover/focus trigger and aria-describedby land where they are announced.
    expect(tip).toBeTruthy();
    expect((tip.nativeElement as HTMLElement).tagName).toBe('BUTTON');
    expect(tip.injector.get(MatTooltip).message).toBe('Save the workspace');
  });

  it('forwards the tooltip position', () => {
    fixture.componentRef.setInput('tooltip', 'Save');
    fixture.componentRef.setInput('tooltipPosition', 'above');
    fixture.detectChanges();
    const tip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(tip.position).toBe('above');
  });

  it('disables the tooltip when empty (default) so a plain button attaches nothing', () => {
    fixture.detectChanges();
    const tip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(tip.disabled).toBe(true);
  });

  it('enables the tooltip once text is set', () => {
    fixture.componentRef.setInput('tooltip', 'Now described');
    fixture.detectChanges();
    const tip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(tip.disabled).toBe(false);
  });

  it('puts aria-describedby on the inner button only when a tooltip is present (#36)', async () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    // Empty default → no description on a plain button.
    await fixture.whenStable();
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    // With text → the description (rendered by AriaDescriber after the next render) lands on
    // the focusable inner <button>, the element a screen-reader user actually reaches.
    fixture.componentRef.setInput('tooltip', 'Save the workspace');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('attaches the trigger to every button but announces nothing without a menu (#57, #992)', () => {
    fixture.detectChanges();
    // Since #992 there is ONE button and the trigger is ALWAYS attached, so the silence has to be
    // produced rather than inherited from an absent directive — assert the trigger's presence first
    // or every assertion below passes for the wrong reason. Material stamps all three of these
    // unconditionally; left alone, `aria-expanded="false"` announces every plain button in the
    // library as a collapsed disclosure.
    expect(fixture.debugElement.query(By.directive(MatMenuTrigger))).not.toBeNull();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.hasAttribute('aria-expanded')).toBe(false);
    expect(button.hasAttribute('aria-haspopup')).toBe(false);
    expect(button.hasAttribute('aria-controls')).toBe(false);
  });

  it('leaves a menu-less button fully clickable — the attached trigger swallows nothing (#992)', () => {
    fixture.detectChanges();
    // MatMenuTrigger's click/mousedown/keydown listeners now ride EVERY cae-button. On the
    // non-submenu path it neither preventDefaults nor stopPropagates (it calls `toggleMenu()`,
    // which early-returns on a null menu), so `type="submit"` still submits its form and a
    // consumer's own listener still sees the event. Guard the claim's input: an unattached
    // trigger would pass this vacuously.
    expect(fixture.debugElement.query(By.directive(MatMenuTrigger))).not.toBeNull();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    let seen: MouseEvent | undefined;
    fixture.nativeElement.addEventListener('click', (e: MouseEvent) => (seen = e));
    button.click();
    // Reached the host ⇒ not stopPropagation'd; not defaultPrevented ⇒ a submit still submits.
    expect(seen).toBeDefined();
    expect(seen?.defaultPrevented).toBe(false);
  });

  it('natively disables the button by default so it is inert (#58)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    // Plain disabled (disabledInteractive off): the real `disabled` attribute is set, which
    // suppresses focus + pointer events — so aria-disabled is redundant and Material omits it.
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
  });

  it('keeps a disabled button focusable via disabledInteractive so its tooltip can show (#58)', async () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.componentRef.setInput('disabledInteractive', true);
    fixture.componentRef.setInput('tooltip', 'Complete the form to enable this');
    fixture.detectChanges();
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    // Material drops the native `disabled` attribute (which would swallow focus/hover) and marks
    // the button aria-disabled instead: AT still announces it disabled, but it stays focusable and
    // hoverable — so the tooltip explaining *why* it is disabled can actually appear.
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    const tip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(tip.disabled).toBe(false);
    // aria-describedby is tooltip-driven (like #36), not proof of focusability on its own — a
    // native-disabled button gets it too. The aria-disabled + absent `disabled` attr assertions
    // above are what actually require disabledInteractive; this just confirms the tip is wired.
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('coerces a bare disabledInteractive attribute on cae-button itself (#58)', () => {
    // Bare `<cae-button disabledInteractive>` must engage the mode (booleanAttribute), matching
    // how the `disabled` input coerces. Assert on cae-button's OWN input signal, not just the
    // rendered attr: Material's inner input also coerces '' → true, so an attr-only check would
    // stay green even if cae-button's transform were dropped (regressing its InputSignal<boolean>).
    fixture.componentRef.setInput('disabled', true);
    fixture.componentRef.setInput('disabledInteractive', '');
    fixture.detectChanges();
    expect(fixture.componentInstance.disabledInteractive()).toBe(true);
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });
});

@Component({
  imports: [CaeButton, CaeMenu],
  template: `
    <cae-menu #m [items]="items" />
    <cae-button
      [menuTriggerFor]="hasMenu() ? m : undefined"
      [tooltip]="tip"
      [disabled]="disabled"
      [disabledInteractive]="disabledInteractive"
      variant="outlined"
      ariaLabel="Workspace actions"
      >Actions</cae-button
    >
  `,
})
class MenuButtonHost {
  items: CaeMenuItem[] = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Bravo' },
  ];
  tip = 'Workspace actions';
  disabled = false;
  disabledInteractive = false;
  /**
   * A live→unbound flip. `menuTriggerFor` has no default, so `undefined` is an ordinary consumer
   * expression (`[menuTriggerFor]="canManage() ? actionsMenu : undefined"`) — the shape that used
   * to swap one template arm for the other. A signal, not a plain field: under zoneless a
   * post-render field mutation does not push to a child's signal input.
   */
  readonly hasMenu = signal(true);
}

describe('CaeButton (menu trigger #57)', () => {
  let fixture: ComponentFixture<MenuButtonHost>;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MenuButtonHost] }).compileComponents();
    fixture = TestBed.createComponent(MenuButtonHost);
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => overlayContainer?.ngOnDestroy());

  const innerButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('cae-button button') as HTMLButtonElement;
  const matTrigger = (): MatMenuTrigger =>
    fixture.debugElement.query(By.directive(MatMenuTrigger)).injector.get(MatMenuTrigger);
  const caeMenu = (): CaeMenu =>
    fixture.debugElement.query(By.directive(CaeMenu)).componentInstance as CaeMenu;

  it('forwards the menu trigger to the inner focusable <button>, wired to the cae-menu panel', () => {
    const trig = fixture.debugElement.query(By.directive(MatMenuTrigger));
    // The trigger — and its aria-haspopup/expanded + keyboard handling — must sit on the real
    // focusable <button>, not the non-focusable <cae-button> wrapper.
    expect((trig.nativeElement as HTMLElement).tagName).toBe('BUTTON');
    // And it points at the bound cae-menu's panel, read through the public getMenuPanel seam —
    // the consumer never touches a Material type.
    expect(matTrigger().menu).toBe(caeMenu().getMenuPanel());
  });

  it('marks the inner button as a menu trigger (aria-haspopup) once the panel resolves', () => {
    expect(innerButton().getAttribute('aria-haspopup')).toBe('menu');
  });

  it('opens the bound menu from the inner button (renders one item per data item)', async () => {
    matTrigger().openMenu();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(matTrigger().menuOpen).toBe(true);
    const items = Array.from(document.querySelectorAll<HTMLElement>('[mat-menu-item]'));
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Alpha');
  });

  it('carries every binding on the one button the component renders (#992)', () => {
    const button = innerButton();
    const tip = fixture.debugElement.query(By.directive(MatTooltip));
    const trig = fixture.debugElement.query(By.directive(MatMenuTrigger));
    const matBtn = fixture.debugElement.query(By.directive(MatButton)).injector.get(MatButton);
    // This used to be a cross-branch parity guard — the only thing keeping two hand-duplicated
    // <button>s in sync. There is one now, so the duplication it policed cannot recur; what it
    // still buys is that the trigger and the tooltip land on the SAME element as the variant and
    // the accessible name, i.e. on the real focusable control.
    expect(fixture.nativeElement.querySelectorAll('cae-button button').length).toBe(1);
    expect(tip.nativeElement).toBe(button);
    expect(trig.nativeElement).toBe(button);
    expect(tip.injector.get(MatTooltip).message).toBe('Workspace actions');
    expect(matBtn.appearance).toBe('outlined');
    expect(button.getAttribute('aria-label')).toBe('Workspace actions');
  });

  it('renders ONE button across a live→unbound flip, so focus is never stranded (#992)', async () => {
    const before = innerButton();
    // Guard the flip's INPUT: without this the same-node assertion below passes for a fixture in
    // which nothing changed at all.
    expect(before.getAttribute('aria-haspopup')).toBe('menu');
    before.focus();
    expect(document.activeElement).toBe(before);

    fixture.componentInstance.hasMenu.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    const after = innerButton();
    // The SAME node. Two arms were an element swap: the flip destroyed the focused <button> and
    // built its replacement in the other branch, dropping focus to <body> (WCAG 2.4.3). That is
    // why cae-split-button once needed ~150 lines of focus witness/restore for this exact shape —
    // deleting the branch deletes the strand, so nothing here has to be paid for.
    expect(after).toBe(before);
    expect(before.isConnected).toBe(true);
    expect(document.activeElement).toBe(before);
    // ...and the survivor is now announced as an ordinary button.
    expect(after.hasAttribute('aria-haspopup')).toBe(false);
    expect(after.hasAttribute('aria-expanded')).toBe(false);
  });

  it('closes an open menu when the binding is removed (the state two arms could not reach, #992)', async () => {
    matTrigger().openMenu();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(matTrigger().menuOpen).toBe(true);
    expect(innerButton().getAttribute('aria-expanded')).toBe('true');

    fixture.componentInstance.hasMenu.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    // With two arms this came free — the flip destroyed the open trigger and Material's
    // ngOnDestroy disposed its overlay. One surviving element does NOT get that, so this arm
    // exists to prove the state is still reachable-and-handled. The handling turned out to be
    // Material's own: `MatMenuTriggerBase`'s `_menu` setter calls `_destroyMenu()` on null. An
    // explicit `closeMenu()` was written here first and mutation-tested as inert, so it was
    // deleted; this arm is what would catch Material dropping that branch.
    expect(matTrigger().menuOpen).toBe(false);
    expect(innerButton().hasAttribute('aria-expanded')).toBe(false);
  });

  it('forwards the disabled state to the button when a menu is bound', async () => {
    // Set before the first CD so it binds at initial render (a plain-field mutation after render
    // does not propagate under zoneless).
    const f = TestBed.createComponent(MenuButtonHost);
    f.componentInstance.disabled = true;
    f.detectChanges();
    await f.whenStable();
    const button = f.nativeElement.querySelector('cae-button button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('forwards disabledInteractive with a menu bound, keeping it focusable and labelled (#58)', async () => {
    // The button stays focusable and keeps advertising its popup; whether it will actually OPEN is
    // a separate claim, pinned by the arm below (#978).
    const f = TestBed.createComponent(MenuButtonHost);
    f.componentInstance.disabled = true;
    f.componentInstance.disabledInteractive = true;
    f.detectChanges();
    await f.whenStable();
    const button = f.nativeElement.querySelector('cae-button button') as HTMLButtonElement;
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    // The trigger (and its aria-haspopup) still sits on the focusable inner button.
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('refuses to open the bound menu while interactive-disabled, by click and programmatically (#978)', async () => {
    // The claim this replaces said the opposite — that an interactive-disabled button's menu "stays
    // openable, so unbind it to block". It is false: `MatMenuTrigger._openMenu()` early-returns on
    // `aria-disabled`, which is precisely the attribute this mode sets. Nothing pinned it in either
    // direction, because every existing arm was attribute-shaped and none asserted an OPEN.
    const f = TestBed.createComponent(MenuButtonHost);
    f.componentInstance.disabled = true;
    f.componentInstance.disabledInteractive = true;
    f.detectChanges();
    await f.whenStable();

    const button = f.nativeElement.querySelector('cae-button button') as HTMLButtonElement;
    const trig = f.debugElement.query(By.directive(MatMenuTrigger)).injector.get(MatMenuTrigger);

    // Assert the guard's INPUTS, so a refusal below cannot be an unbound trigger no-opping for an
    // unrelated reason — the failure mode that makes an absence-assertion vacuous.
    expect(trig.menu).toBeTruthy();
    expect(button.getAttribute('aria-disabled')).toBe('true');

    trig.openMenu();
    f.detectChanges();
    await f.whenStable();
    expect(trig.menuOpen).toBe(false);
    expect(
      overlayContainer.getContainerElement().querySelectorAll('.mat-mdc-menu-panel').length,
    ).toBe(0);

    // The click path belongs to MatMenuTrigger rather than the consumer, and refuses identically.
    button.click();
    f.detectChanges();
    await f.whenStable();
    expect(trig.menuOpen).toBe(false);
    expect(
      overlayContainer.getContainerElement().querySelectorAll('.mat-mdc-menu-panel').length,
    ).toBe(0);
  });
});
