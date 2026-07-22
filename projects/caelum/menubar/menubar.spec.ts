import { Component, ComponentRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { DOWN_ARROW, END, HOME, LEFT_ARROW, RIGHT_ARROW } from '@angular/cdk/keycodes';
import { CaeMenuTrigger, type CaeMenuItem } from 'caelum/menu';
import { CAE_ICON_GLYPHS } from 'caelum/icon';

import { CaeMenubar, type CaeMenubarItem } from './menubar';

const GROUPS: CaeMenubarItem[] = [
  {
    label: 'File',
    items: [
      { value: 'new', label: 'New' },
      { value: 'open', label: 'Open' },
    ],
  },
  {
    label: 'Edit',
    items: [
      { value: 'cut', label: 'Cut' },
      { value: 'copy', label: 'Copy' },
    ],
  },
  { label: 'View', items: [{ value: 'zoom', label: 'Zoom' }] },
];

describe('CaeMenubar', () => {
  let fixture: ComponentFixture<CaeMenubar>;
  let ref: ComponentRef<CaeMenubar>;
  let cmp: CaeMenubar;
  let el: HTMLElement;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeMenubar] }).compileComponents();
    overlayContainer = TestBed.inject(OverlayContainer);
  });

  afterEach(() => overlayContainer?.ngOnDestroy());

  // Drive inputs via ComponentRef.setInput (marks the OnPush input dirty — the reliable path for a
  // zoneless OnPush component; a host-wrapper field mutation doesn't propagate on plain CD).
  async function setup(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(CaeMenubar);
    ref = fixture.componentRef;
    cmp = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    ref.setInput('model', GROUPS);
    for (const [k, v] of Object.entries(inputs)) ref.setInput(k, v);
    await flush();
  }

  async function flush(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  // One <button> per top-level group; each cae-menu is display:none and its panel is an overlay
  // template, so the toolbar holds exactly one button per group, in model order.
  const triggers = () => Array.from(el.querySelectorAll('button'));
  const menuTriggerAt = (i: number): CaeMenuTrigger =>
    fixture.debugElement.queryAll(By.directive(CaeMenuTrigger))[i].injector.get(CaeMenuTrigger);
  const menuItems = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[mat-menu-item]'));

  // Dispatch a keydown carrying a CDK keyCode (KeyboardEvent init has no keyCode field, so define
  // it) on the menubar; it bubbles to the toolbar's (keydown) → FocusKeyManager.
  function keydown(keyCode: number): void {
    const event = new KeyboardEvent('keydown', { bubbles: true });
    Object.defineProperty(event, 'keyCode', { get: () => keyCode });
    (el.querySelector('.cae-menubar') as HTMLElement).dispatchEvent(event);
  }

  it('renders a role=menubar of one trigger per group, named by ariaLabel', async () => {
    await setup({ ariaLabel: 'Main' });
    const bar = el.querySelector('[role="menubar"]')!;
    expect(bar).not.toBeNull();
    expect(bar.getAttribute('aria-label')).toBe('Main');
    expect(triggers().length).toBe(GROUPS.length);
    expect(triggers().map((b) => b.textContent!.trim())).toEqual(['File', 'Edit', 'View']);
  });

  it('marks each trigger role=menuitem with type=button (no form submit — #148) and a popup', async () => {
    await setup();
    for (const b of triggers()) {
      expect(b.getAttribute('role')).toBe('menuitem');
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-haspopup')).not.toBeNull();
    }
  });

  it('puts only the first trigger in the tab order (roving tabindex)', async () => {
    await setup();
    expect(triggers().map((b) => b.tabIndex)).toEqual([0, -1, -1]);
  });

  it('moves the roving tabindex to the next trigger on ArrowRight', async () => {
    await setup();
    keydown(RIGHT_ARROW);
    await flush();
    expect(triggers().map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
    expect(document.activeElement).toBe(triggers()[1]);
  });

  it('wraps roving from the last trigger back to the first (LEFT from first wraps to last)', async () => {
    await setup();
    keydown(LEFT_ARROW); // from index 0, wrap to the last
    await flush();
    expect(triggers()[GROUPS.length - 1].tabIndex).toBe(0);
  });

  it('supports Home/End to jump to the first/last trigger', async () => {
    await setup();
    keydown(END);
    await flush();
    expect(triggers()[GROUPS.length - 1].tabIndex).toBe(0);
    keydown(HOME);
    await flush();
    expect(triggers()[0].tabIndex).toBe(0);
  });

  it('opens the active group menu on ArrowDown instead of roving (#153 review)', async () => {
    await setup();
    keydown(DOWN_ARROW);
    await flush();
    // Down opens the active (first) group dropdown and focus enters it — it does NOT rove the bar.
    expect(menuItems().length).toBe(GROUPS[0].items.length);
    expect(menuItems()[0].textContent).toContain('New');
    expect(triggers()[0].tabIndex).toBe(0); // roving unchanged — Down opened, it did not move focus
  });

  it('treats a group with no items as disabled — no dead-end empty menu (#153 review)', async () => {
    await setup({
      model: [
        { label: 'File', items: [{ value: 'new', label: 'New' }] },
        { label: 'Empty', items: [] },
      ] satisfies CaeMenubarItem[],
    });
    expect(triggers()[1].disabled).toBe(true);
  });

  it('skips a disabled group when roving', async () => {
    await setup({
      model: [
        { label: 'File', items: [{ value: 'new', label: 'New' }] },
        { label: 'Edit', items: [{ value: 'cut', label: 'Cut' }], disabled: true },
        { label: 'View', items: [{ value: 'zoom', label: 'Zoom' }] },
      ] satisfies CaeMenubarItem[],
    });
    keydown(RIGHT_ARROW); // 0 -> (skip disabled 1) -> 2
    await flush();
    expect(triggers()[2].tabIndex).toBe(0);
    expect(triggers()[1].disabled).toBe(true);
  });

  it('opens a group dropdown and renders one menu item per entry', async () => {
    await setup();
    menuTriggerAt(1).open(); // Edit
    await flush();
    expect(menuItems().length).toBe(GROUPS[1].items.length);
    expect(menuItems()[0].textContent).toContain('Cut');
  });

  it('emits itemSelect with the chosen dropdown item', async () => {
    await setup();
    let selected: CaeMenuItem | undefined;
    cmp.itemSelect.subscribe((i) => (selected = i));
    menuTriggerAt(0).open(); // File
    await flush();
    menuItems()[1].click(); // Open
    await flush();
    expect(selected?.value).toBe('open');
  });

  it('renders nothing and does not throw for an empty model', async () => {
    await setup({ model: [] });
    expect(triggers().length).toBe(0);
    expect(el.querySelector('[role="menubar"]')).not.toBeNull();
  });
});

@Component({
  imports: [CaeMenubar],
  template: `
    <cae-menubar [model]="model" [iconTemplate]="useTpl() ? tpl : null" />
    <ng-template #tpl let-item let-index="index">
      <span class="custom-icon">{{ index }}:{{ item.value }}</span>
    </ng-template>
  `,
})
class MenubarIconHost {
  readonly model: CaeMenubarItem[] = [
    {
      label: 'File',
      items: [
        { value: 'new', label: 'New', icon: 'plus' },
        { value: 'open', label: 'Open' },
      ],
    },
    { label: 'Edit', items: [{ value: 'cut', label: 'Cut', icon: 'file' }] },
  ];
  readonly useTpl = signal(false);
}

describe('CaeMenubar per-item icons (D-596, #645)', () => {
  let fixture: ComponentFixture<MenubarIconHost>;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MenubarIconHost] }).compileComponents();
    fixture = TestBed.createComponent(MenubarIconHost);
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => overlayContainer?.ngOnDestroy());

  const triggerAt = (i: number): CaeMenuTrigger =>
    fixture.debugElement.queryAll(By.directive(CaeMenuTrigger))[i].injector.get(CaeMenuTrigger);

  // Open group `i` and return ITS dropdown items. A closed Material panel lingers in the overlay
  // container, so a bare document-wide `[mat-menu-item]` query would mix in a sibling group's
  // stale panel (and pass on the wrong panel's content). `aria-controls` on the open trigger
  // names exactly the panel that trigger owns, which is the relationship under test.
  const openGroupItems = async (i: number): Promise<HTMLElement[]> => {
    triggerAt(i).open();
    fixture.detectChanges();
    await fixture.whenStable();
    const btn = fixture.nativeElement.querySelectorAll('.cae-menubar__item')[i] as HTMLElement;
    const panelId = btn.getAttribute('aria-controls');
    expect(panelId, `group ${i} has no aria-controls — its trigger did not open`).toBeTruthy();
    const panel = document.getElementById(panelId as string);
    expect(panel, `group ${i} panel #${panelId} is not in the DOM`).toBeTruthy();
    return Array.from((panel as HTMLElement).querySelectorAll<HTMLElement>('[mat-menu-item]'));
  };

  it('renders per-item icon glyphs in a group dropdown via the embedded cae-menu', async () => {
    const items = await openGroupItems(0);
    const glyph = items[0].querySelector('svg');
    expect(glyph?.querySelector('path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.plus);
    // Decorative: the dropdown item's accessible name stays EXACTLY its label.
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    expect(items[0].textContent?.trim()).toBe('New');
    expect(items[1].querySelector('svg')).toBeNull();
  });

  it('forwards iconTemplate to EVERY group dropdown, not just the first (#645)', async () => {
    fixture.componentInstance.useTpl.set(true);
    fixture.detectChanges();

    const file = await openGroupItems(0);
    expect(file.map((el) => el.querySelector('.custom-icon')?.textContent)).toEqual([
      '0:new',
      '1:open',
    ]);
    expect(file[0].querySelector('svg')).toBeNull();

    // The second group is the assertion that matters: a forward wired to only the first
    // cae-menu (or dropped entirely) leaves this dropdown on its built-in glyph. Its index
    // restarting at 0 also pins the documented per-group (not bar-wide running) count.
    const edit = await openGroupItems(1);
    expect(edit.map((el) => el.querySelector('.custom-icon')?.textContent)).toEqual(['0:cut']);
    expect(edit[0].querySelector('svg')).toBeNull();

    // Reverse flip: clearing the template restores the built-in glyph (not a one-way latch).
    fixture.componentInstance.useTpl.set(false);
    fixture.detectChanges();
    const editAgain = await openGroupItems(1);
    expect(editAgain[0].querySelector('.custom-icon')).toBeNull();
    expect(editAgain[0].querySelector('svg path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.file);
  });
});
