import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatButton } from '@angular/material/button';
import { MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';

import { CaeButton } from './button';
import { CaeMenu, CaeMenuItem } from '../menu/menu';

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

  it('applies no menu trigger and no aria-expanded when no menu is bound (#57)', () => {
    fixture.detectChanges();
    // The opt-in trigger branch is not rendered, so a plain button carries no MatMenuTrigger —
    // and thus no spurious aria-expanded (which MatMenuTrigger would stamp as "false", making
    // every plain button announce as a collapsed disclosure).
    expect(fixture.debugElement.query(By.directive(MatMenuTrigger))).toBeNull();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.hasAttribute('aria-expanded')).toBe(false);
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
      [menuTriggerFor]="m"
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

  it('keeps the shared bindings (tooltip + variant + aria-label) on the inner button in the menu branch (two-branch parity)', () => {
    const button = innerButton();
    const tip = fixture.debugElement.query(By.directive(MatTooltip));
    const trig = fixture.debugElement.query(By.directive(MatMenuTrigger));
    const matBtn = fixture.debugElement.query(By.directive(MatButton)).injector.get(MatButton);
    // The menu branch must carry the SAME bindings as the plain branch — a divergence would ship
    // silently, since this parity check is the only cross-branch guard.
    expect(tip.nativeElement).toBe(button);
    expect(trig.nativeElement).toBe(button);
    expect(tip.injector.get(MatTooltip).message).toBe('Workspace actions');
    expect(matBtn.appearance).toBe('outlined');
    expect(button.getAttribute('aria-label')).toBe('Workspace actions');
  });

  it('forwards the disabled state on the menu-branch button too (two-branch parity)', async () => {
    // Set before the first CD so it binds at initial render (a plain-field mutation after render
    // does not propagate under zoneless).
    const f = TestBed.createComponent(MenuButtonHost);
    f.componentInstance.disabled = true;
    f.detectChanges();
    await f.whenStable();
    const button = f.nativeElement.querySelector('cae-button button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('forwards disabledInteractive on the menu-branch button, keeping it a working trigger (#58 two-branch parity)', async () => {
    // disabledInteractive must be forwarded in the menu branch as well as the plain branch — a
    // divergence would ship silently. An interactive-disabled button stays focusable, so it can
    // still open its menu while being announced disabled.
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
});
