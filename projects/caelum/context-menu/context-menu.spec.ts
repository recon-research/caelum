import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CdkContextMenuTrigger, CdkMenuItem } from '@angular/cdk/menu';

import { CaeContextMenu } from './context-menu';
import type { CaeMenuItem } from 'caelum/menu';
import { CAE_ICON_GLYPHS } from 'caelum/icon';
import { expectNoA11yViolations } from '../testing/a11y';

@Component({
  imports: [CaeContextMenu],
  template: `
    <cae-context-menu [items]="items" (itemSelect)="selected = $event">
      <div class="target-content">Right-click me</div>
    </cae-context-menu>
  `,
})
class ContextHost {
  items: CaeMenuItem[] = [
    { value: 'view', label: 'View' },
    { value: 'edit', label: 'Edit' },
    { value: 'del', label: 'Delete', disabled: true },
  ];
  selected?: CaeMenuItem;
}

describe('CaeContextMenu', () => {
  let fixture: ComponentFixture<ContextHost>;
  let host: ContextHost;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ContextHost] }).compileComponents();
    fixture = TestBed.createComponent(ContextHost);
    host = fixture.componentInstance;
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => overlayContainer?.ngOnDestroy());

  const target = (): HTMLElement =>
    fixture.nativeElement.querySelector('.cae-context-menu__target') as HTMLElement;

  const rightClick = async (el: Element = target()): Promise<void> => {
    el.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const panel = (): HTMLElement | null => document.querySelector('[role="menu"]');
  const menuItems = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));

  it('projects the right-click target content (transparent wrapper)', () => {
    expect(target()).toBeTruthy();
    expect(target().textContent).toContain('Right-click me');
  });

  it('has no axe violations in the open context menu panel', async () => {
    await rightClick();
    expect(panel()).toBeTruthy();
    await expectNoA11yViolations(overlayContainer.getContainerElement());
  });

  it('opens a role=menu panel with one role=menuitem per data item on right-click', async () => {
    expect(panel()).toBeNull();
    await rightClick();
    expect(panel()).toBeTruthy();
    expect(menuItems().length).toBe(host.items.length);
    expect(menuItems()[0].textContent).toContain('View');
  });

  it('renders each item as type=button (no accidental form submit, #148)', async () => {
    await rightClick();
    for (const item of menuItems()) {
      expect(item.getAttribute('type')).toBe('button');
    }
  });

  it('marks the flagged item aria-disabled', async () => {
    await rightClick();
    const del = menuItems().find((i) => i.textContent?.includes('Delete'));
    expect(del?.getAttribute('aria-disabled')).toBe('true');
    expect(del?.classList.contains('cdk-menu-item-disabled')).toBe(true);
  });

  it('emits the chosen item on activation (itemSelect)', async () => {
    await rightClick();
    menuItems()[1].click();
    fixture.detectChanges();
    expect(host.selected?.value).toBe('edit');
  });

  it('does not activate a disabled item', async () => {
    await rightClick();
    const del = menuItems().find((i) => i.textContent?.includes('Delete'));
    del?.click();
    fixture.detectChanges();
    expect(host.selected).toBeUndefined();
  });

  // The empty-items guard drives cdkContextMenuDisabled, so _openOnContextMenu no-ops and the
  // browser's own context menu shows instead of a dead-end empty panel (the cae-menubar rule).
  // Driven on a direct CaeContextMenu fixture via setInput — the reliable zoneless pattern for
  // reading a binding back off a reactive input (mirrors the cae-menubar spec).
  const directTrigger = (items: readonly CaeMenuItem[]): CdkContextMenuTrigger => {
    const ref = TestBed.createComponent(CaeContextMenu);
    ref.componentRef.setInput('items', items);
    ref.detectChanges();
    return ref.debugElement
      .query(By.directive(CdkContextMenuTrigger))
      .injector.get(CdkContextMenuTrigger);
  };

  it('disables the trigger when items is empty (right-click falls through to native)', () => {
    expect(directTrigger([]).disabled).toBe(true);
  });

  it('enables the trigger when items are present', () => {
    expect(directTrigger([{ label: 'A' }]).disabled).toBe(false);
  });

  it('makes the target a focusable region (tabindex 0) so the Menu key can open it', () => {
    // Keyboard opening (Menu key / Shift+F10) fires contextmenu on the FOCUSED element, so the
    // target must be focusable for keyboard access — the wrapper provides it, no consumer tabindex.
    expect(target().getAttribute('tabindex')).toBe('0');
    target().focus();
    expect(document.activeElement).toBe(target());
  });

  it('drops the target out of the tab order (tabindex -1) when items is empty', () => {
    const ref = TestBed.createComponent(CaeContextMenu);
    ref.componentRef.setInput('items', []);
    ref.detectChanges();
    const t = ref.nativeElement.querySelector('.cae-context-menu__target') as HTMLElement;
    expect(t.getAttribute('tabindex')).toBe('-1');
  });
});

@Component({
  imports: [CaeContextMenu],
  template: `
    <cae-context-menu [items]="items()" [iconTemplate]="useTpl() ? tpl : null">
      <div class="target-content">Right-click me</div>
    </cae-context-menu>
    <ng-template #tpl let-item let-index="index">
      <span class="custom-icon">{{ index }}:{{ item.value }}</span>
    </ng-template>
  `,
})
class ContextIconHost {
  readonly items = signal<readonly CaeMenuItem[]>([
    { value: 'view', label: 'View', icon: 'search' },
    { value: 'edit', label: 'Edit' },
    { value: 'del', label: 'Delete', icon: 'folder', disabled: true },
  ]);
  readonly useTpl = signal(false);
}

describe('CaeContextMenu per-item icons (D-596, #645)', () => {
  let fixture: ComponentFixture<ContextIconHost>;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ContextIconHost] }).compileComponents();
    fixture = TestBed.createComponent(ContextIconHost);
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => overlayContainer?.ngOnDestroy());

  const open = async (): Promise<void> => {
    (fixture.nativeElement.querySelector('.cae-context-menu__target') as HTMLElement).dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const menuItems = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));

  it('renders a registry glyph for item.icon inside that item, none without one', async () => {
    await open();
    const glyph = menuItems()[0].querySelector('svg');
    expect(glyph?.querySelector('path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.search);
    // Decorative: hidden from AT, and the item's accessible name stays EXACTLY its label —
    // trimmed equality, not toContain, so any stray text the icon ever contributes fails here.
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    expect(menuItems()[0].textContent?.trim()).toBe('View');
    expect(menuItems()[1].querySelector('svg')).toBeNull();
  });

  it('iconTemplate wins over item.icon, for every item — and yields back when cleared', async () => {
    fixture.componentInstance.useTpl.set(true);
    fixture.detectChanges();
    await open();
    // Stamped once per item with { $implicit: item, index } …
    const custom = menuItems().map((el) => el.querySelector('.custom-icon')?.textContent);
    expect(custom).toEqual(['0:view', '1:edit', '2:del']);
    // … and the built-in glyph gives way even where item.icon is set.
    expect(menuItems()[0].querySelector('svg')).toBeNull();
    // Reverse flip: clearing the template restores the built-in glyph (not a one-way latch).
    fixture.componentInstance.useTpl.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(menuItems()[0].querySelector('.custom-icon')).toBeNull();
    expect(menuItems()[0].querySelector('svg path')?.getAttribute('d')).toBe(
      CAE_ICON_GLYPHS.search,
    );
  });

  it('renders a glyph on a DISABLED item (decoration is independent of activatability)', async () => {
    await open();
    const del = menuItems()[2];
    expect(del.classList).toContain('cdk-menu-item-disabled');
    expect(del.querySelector('svg path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.folder);
  });

  it('pins the typeahead label to item.label, so a text-stamping iconTemplate cannot poison it', async () => {
    fixture.componentInstance.useTpl.set(true);
    fixture.detectChanges();
    await open();
    // CdkMenuItem derives typeahead from the element's RAW textContent — unlike MatMenuItem,
    // which clones and strips icon elements first. So without cdkMenuitemTypeaheadLabel this
    // host's "0:view" template text would prefix the label, and CDK's prefix-match typeahead
    // (indexOf(input) === 0) would never jump to "View" on `V`. The item pins the label, so a
    // consumer template can render anything without breaking keyboard navigation.
    const labels = fixture.debugElement
      .queryAll(By.directive(CdkMenuItem))
      .map((d) => d.injector.get(CdkMenuItem).getLabel());
    expect(labels).toEqual(['View', 'Edit', 'Delete']);
    // The raw text really is polluted — proving the assertion above is load-bearing, not vacuous.
    expect(menuItems()[0].textContent).toContain('0:view');
  });
});
