import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CdkContextMenuTrigger } from '@angular/cdk/menu';

import { CaeContextMenu } from './context-menu';
import type { CaeMenuItem } from 'caelum/menu';

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
});
