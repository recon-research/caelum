import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatMenuTrigger } from '@angular/material/menu';
import { CAE_ICON_GLYPHS } from 'caelum/icon';

import { CaeMenu, CaeMenuItem, CaeMenuTrigger } from './menu';
import { expectNoA11yViolations } from '../testing/a11y';

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

  it('has no axe violations in the open menu overlay (scanned outside the fixture)', async () => {
    trigger().open();
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoA11yViolations(overlayContainer.getContainerElement());
  });

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

@Component({
  imports: [CaeMenu, CaeMenuTrigger],
  template: `
    <cae-menu #actions [items]="items()" [iconTemplate]="useTpl() ? tpl : null" />
    <button type="button" [caeMenuTriggerFor]="actions">Actions</button>
    <ng-template #tpl let-item let-index="index">
      <span class="custom-icon">{{ index }}:{{ item.value }}</span>
    </ng-template>
  `,
})
class MenuIconHost {
  readonly items = signal<readonly CaeMenuItem[]>([
    { value: 'new', label: 'New', icon: 'plus' },
    { value: 'find', label: 'Find' },
  ]);
  readonly useTpl = signal(false);
}

describe('CaeMenu per-item icons (D-596)', () => {
  let fixture: ComponentFixture<MenuIconHost>;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MenuIconHost] }).compileComponents();
    fixture = TestBed.createComponent(MenuIconHost);
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => overlayContainer?.ngOnDestroy());

  const open = async (): Promise<void> => {
    fixture.debugElement.query(By.directive(CaeMenuTrigger)).injector.get(CaeMenuTrigger).open();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const items = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[mat-menu-item]'));

  it('renders a registry glyph for item.icon inside that item, none without one', async () => {
    await open();
    const glyph = items()[0].querySelector('svg');
    expect(glyph?.querySelector('path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.plus);
    // Decorative: hidden from AT; the item's accessible name stays EXACTLY its label —
    // trimmed equality, not toContain, so any stray text the icon path ever contributes
    // (a <title>, a stamped name) fails here instead of passing green (#632 discipline).
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    expect(items()[0].textContent?.trim()).toBe('New');
    expect(items()[1].querySelector('svg')).toBeNull();
  });

  it('iconTemplate wins over item.icon, for every item — and yields back when cleared (D-596)', async () => {
    fixture.componentInstance.useTpl.set(true);
    fixture.detectChanges();
    await open();
    // The template is stamped for each item with { $implicit: item, index } …
    const custom = items().map((el) => el.querySelector('.custom-icon')?.textContent);
    expect(custom).toEqual(['0:new', '1:find']);
    // … and the built-in glyph gives way even where item.icon is set.
    expect(items()[0].querySelector('svg')).toBeNull();
    // Reverse flip: clearing the template restores the built-in glyph (not a one-way latch).
    fixture.componentInstance.useTpl.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(items()[0].querySelector('.custom-icon')).toBeNull();
    expect(items()[0].querySelector('svg path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.plus);
  });
});
