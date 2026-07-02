import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatMenuTrigger } from '@angular/material/menu';

import { CaeMenu, CaeMenuItem, CaeMenuTrigger } from './menu';

@Component({
  imports: [CaeMenu, CaeMenuTrigger],
  template: `
    <cae-menu #actions [items]="items" (itemSelect)="selected = $event" />
    <button type="button" [caeMenuTriggerFor]="actions">Actions</button>
  `,
})
class MenuHost {
  items: CaeMenuItem[] = [
    { value: 'dup', label: 'Duplicate' },
    { value: 'exp', label: 'Export' },
    { value: 'del', label: 'Delete', disabled: true },
  ];
  selected?: CaeMenuItem;
}

describe('CaeMenu', () => {
  let fixture: ComponentFixture<MenuHost>;
  let host: MenuHost;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MenuHost] }).compileComponents();
    fixture = TestBed.createComponent(MenuHost);
    host = fixture.componentInstance;
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => overlayContainer?.ngOnDestroy());

  const trigger = (): CaeMenuTrigger =>
    fixture.debugElement.query(By.directive(CaeMenuTrigger)).injector.get(CaeMenuTrigger);
  const matTrigger = (): MatMenuTrigger =>
    fixture.debugElement.query(By.directive(MatMenuTrigger)).injector.get(MatMenuTrigger);
  const items = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[mat-menu-item]'));

  it('should create and wire the panel into the composed MatMenuTrigger', () => {
    expect(host).toBeTruthy();
    // caeMenuTriggerFor reads the cae-menu's panel off the instance through the public
    // getMenuPanel seam — the consumer never touches a Material type.
    const caeMenu = fixture.debugElement.query(By.directive(CaeMenu)).componentInstance as CaeMenu;
    expect(matTrigger().menu).toBe(caeMenu.getMenuPanel());
  });

  it('renders one menu item per data item when opened', async () => {
    trigger().open();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(items().length).toBe(host.items.length);
    expect(items()[0].textContent).toContain('Duplicate');
  });

  it('emits the chosen item on activation (itemSelect)', async () => {
    trigger().open();
    fixture.detectChanges();
    await fixture.whenStable();
    items()[1].click();
    fixture.detectChanges();
    expect(host.selected?.value).toBe('exp');
  });

  it('toggles the menu open then closed (PrimeNG menu.toggle parity)', async () => {
    trigger().toggle();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(matTrigger().menuOpen).toBe(true);
    trigger().toggle();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(matTrigger().menuOpen).toBe(false);
  });
});
