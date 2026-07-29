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

  it('reaches nested rows too — a submenu leaf gets the same glyph treatment (#150)', async () => {
    fixture.componentInstance.items.set([
      { value: 'new', label: 'New', icon: 'plus' },
      { label: 'More', items: [{ value: 'deep', label: 'Deep', icon: 'plus' }] },
    ]);
    fixture.detectChanges();
    await open();
    const branch = items().find((el) => el.textContent?.includes('More'))!;
    branch.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const deep = items().find((el) => el.textContent?.includes('Deep'))!;
    expect(deep.querySelector('svg path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.plus);
    expect(deep.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(deep.textContent?.trim()).toBe('Deep');
  });

  it('forwards iconTemplate down every level — D-596 governs the whole tree, not just the root', async () => {
    // The arm above passes without any forwarding at all: `item.icon` is read by whichever level
    // renders the row. The consumer's TEMPLATE is the half that has to be handed down, so this is
    // the one that fails if a nested cae-menu is left un-bound.
    fixture.componentInstance.items.set([
      { value: 'new', label: 'New', icon: 'plus' },
      { label: 'More', items: [{ value: 'deep', label: 'Deep', icon: 'plus' }] },
    ]);
    fixture.componentInstance.useTpl.set(true);
    fixture.detectChanges();
    await open();
    items()
      .find((el) => el.textContent?.includes('More'))!
      .click();
    fixture.detectChanges();
    await fixture.whenStable();
    const deep = items().find((el) => el.textContent?.includes('Deep'))!;
    // Index is per-level: 'Deep' is the first row of ITS panel, so 0 — not 2 continuing the root.
    expect(deep.querySelector('.custom-icon')?.textContent).toBe('0:deep');
    expect(deep.querySelector('svg')).toBeNull();
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

// --- Tiered submenus (#150) ---------------------------------------------------------------
//
// A branch item stamps its own nested panel. These specs pin the CONTRACT this component owns
// (which rows become branches, what a branch emits, which panel a trigger opens, and that the
// recursion terminates), plus one arm per Material behaviour the component's doc comment CLAIMS
// to inherit — a claim about a dependency is worth exactly as much as its test.

const SHARE: CaeMenuItem = {
  label: 'Share',
  items: [
    { value: 'email', label: 'Email' },
    { label: 'Social', items: [{ value: 'bsky', label: 'Bluesky' }] },
  ],
};

@Component({
  imports: [CaeMenu, CaeMenuTrigger],
  template: `
    <cae-menu #actions [items]="items()" (itemSelect)="selected.set($event)" />
    <button type="button" [caeMenuTriggerFor]="actions">Actions</button>
  `,
})
class SubmenuHost {
  readonly items = signal<readonly CaeMenuItem[]>([
    { value: 'new', label: 'New' },
    SHARE,
    { value: 'del', label: 'Delete' },
  ]);
  readonly selected = signal<CaeMenuItem | undefined>(undefined);
}

describe('CaeMenu tiered submenus (#150)', () => {
  let fixture: ComponentFixture<SubmenuHost>;
  let host: SubmenuHost;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SubmenuHost] }).compileComponents();
    fixture = TestBed.createComponent(SubmenuHost);
    host = fixture.componentInstance;
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => overlayContainer?.ngOnDestroy());

  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const trigger = (): CaeMenuTrigger =>
    fixture.debugElement.query(By.directive(CaeMenuTrigger)).injector.get(CaeMenuTrigger);
  const openRoot = async (): Promise<void> => {
    trigger().open();
    await settle();
  };
  /**
   * The rows of ONE panel, resolved through the opening trigger's `aria-controls` rather than a
   * document-wide query: with submenus the overlay container holds several panels at once, and a
   * closed Material panel lingers in the DOM — so a bare `document.querySelectorAll` would blend
   * levels and read stale rows (the `scope-overlay-assertions-to-their-panel` recipe).
   */
  const panelOf = (triggerEl: HTMLElement): HTMLElement => {
    const id = triggerEl.getAttribute('aria-controls');
    expect(id).toBeTruthy(); // aria-controls is only set while open — a null id means not-open.
    return document.getElementById(id!)!;
  };
  const rowsIn = (panel: HTMLElement): HTMLElement[] =>
    Array.from(panel.querySelectorAll<HTMLElement>('[mat-menu-item]'));
  // Resolved through the directive, not a `[caeMenuTriggerFor]` attribute selector: that is a
  // property binding, so Angular never renders it as an attribute.
  const rootPanel = (): HTMLElement =>
    panelOf(fixture.debugElement.query(By.directive(CaeMenuTrigger)).nativeElement as HTMLElement);
  const rowNamed = (panel: HTMLElement, label: string): HTMLElement =>
    rowsIn(panel).find((el) => el.textContent?.trim() === label)!;
  const press = (el: HTMLElement, keyCode: number): void => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { get: () => keyCode });
    el.dispatchEvent(event);
  };
  const RIGHT_ARROW = 39;
  const LEFT_ARROW = 37;
  const DOWN_ARROW = 40;

  // These two are the guard for the defect that ALL of the specs below missed while it was live.
  // An early draft recursed with `ngTemplateOutlet` instead of a nested cae-menu; because MatMenu
  // finds its rows by a content query rooted at its own declaration site, the panel matched ZERO
  // items. Every assertion about rendering, ARIA, emission and depth still passed — the rows were
  // in the DOM, they simply were not in the FocusKeyManager. Roving focus and typeahead were dead
  // and nothing was red. So the contract worth pinning is not "the rows exist" but "Material can
  // still DRIVE them", which is only observable through focus.
  it('drives roving focus over the root panel (the rows reach the key manager)', async () => {
    await openRoot();
    const rows = rowsIn(rootPanel());
    expect(document.activeElement).toBe(rows[0]);
    press(rootPanel(), DOWN_ARROW);
    await settle();
    expect(document.activeElement).toBe(rows[1]);
  });

  it('gives each level its OWN key manager — arrowing in a submenu stays in that submenu', async () => {
    await openRoot();
    const share = rowNamed(rootPanel(), 'Share');
    press(share, RIGHT_ARROW);
    await settle();
    const level2 = panelOf(share);
    // Opening by keyboard focuses the submenu's first row, not the parent's.
    expect(document.activeElement).toBe(rowsIn(level2)[0]);
    press(level2, DOWN_ARROW);
    await settle();
    // Second row of the SUBMENU ('Social'), never row 2 of the root ('Share').
    expect(document.activeElement).toBe(rowsIn(level2)[1]);
    expect(rowsIn(level2).map((el) => el.textContent!.trim())).toEqual(['Email', 'Social']);
  });

  it('renders only the top level in the root panel — a branch does not flatten its children', async () => {
    await openRoot();
    // If the recursion leaked into the parent panel this would read Email/Social/Bluesky too.
    expect(rowsIn(rootPanel()).map((el) => el.textContent!.trim())).toEqual([
      'New',
      'Share',
      'Delete',
    ]);
  });

  it('marks a branch as a submenu trigger and leaves leaves alone (aria-haspopup/expanded)', async () => {
    await openRoot();
    const branch = rowNamed(rootPanel(), 'Share');
    expect(branch.getAttribute('aria-haspopup')).toBe('menu');
    expect(branch.getAttribute('aria-expanded')).toBe('false');
    // A leaf carries neither — the attributes are the discriminator, not a class.
    const leaf = rowNamed(rootPanel(), 'New');
    expect(leaf.getAttribute('aria-haspopup')).toBeNull();
    expect(leaf.getAttribute('aria-expanded')).toBeNull();
  });

  it('opens a branch into its OWN panel, and recurses to depth 3', async () => {
    await openRoot();
    const share = rowNamed(rootPanel(), 'Share');
    share.click();
    await settle();
    expect(share.getAttribute('aria-expanded')).toBe('true');

    const level2 = panelOf(share);
    expect(level2).not.toBe(rootPanel());
    expect(rowsIn(level2).map((el) => el.textContent!.trim())).toEqual(['Email', 'Social']);

    // Depth 3 — the outlet really is recursive, not a hand-unrolled second level.
    const social = rowNamed(level2, 'Social');
    social.click();
    await settle();
    expect(rowsIn(panelOf(social)).map((el) => el.textContent!.trim())).toEqual(['Bluesky']);
  });

  it('emits nothing for a branch, and the leaf itself from any depth', async () => {
    await openRoot();
    const share = rowNamed(rootPanel(), 'Share');
    share.click();
    await settle();
    // Activating a branch is navigation, not selection (Book 09 §3.5's line for CascadeSelect).
    expect(host.selected()).toBeUndefined();

    rowNamed(panelOf(share), 'Email').click();
    await settle();
    expect(host.selected()?.value).toBe('email');
  });

  it('treats an EMPTY items array as a leaf — no dead-end panel', async () => {
    host.items.set([{ value: 'solo', label: 'Solo', items: [] }]);
    await openRoot();
    const solo = rowNamed(rootPanel(), 'Solo');
    expect(solo.getAttribute('aria-haspopup')).toBeNull();
    solo.click();
    await settle();
    expect(host.selected()?.value).toBe('solo');
  });

  it('does not open a disabled branch', async () => {
    host.items.set([{ ...SHARE, disabled: true }]);
    await openRoot();
    const share = rowNamed(rootPanel(), 'Share');
    expect(share.getAttribute('disabled')).not.toBeNull();
    share.click();
    await settle();
    expect(share.getAttribute('aria-expanded')).toBe('false');
    expect(share.getAttribute('aria-controls')).toBeNull();
  });

  it('opens with ArrowRight and closes with ArrowLeft (the inherited LTR traversal)', async () => {
    await openRoot();
    const share = rowNamed(rootPanel(), 'Share');
    press(share, RIGHT_ARROW);
    await settle();
    expect(share.getAttribute('aria-expanded')).toBe('true');

    // Left closes the level it is pressed in, returning to the parent.
    press(rowsIn(panelOf(share))[0], LEFT_ARROW);
    await settle();
    expect(share.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the consumer trigger pointed at the ROOT panel, not a submenu', async () => {
    // Regression guard for the viewChild pin: nested <mat-menu>s now share this view, so a
    // by-type query could hand the trigger whichever panel Angular happened to see first.
    await openRoot();
    expect(rowsIn(rootPanel()).map((el) => el.textContent!.trim())).toContain('Share');
    const caeMenu = fixture.debugElement.query(By.directive(CaeMenu)).componentInstance as CaeMenu;
    expect(caeMenu.getMenuPanel()).toBe(matTriggerOf(fixture).menu);
  });

  it('closes an open submenu when its branch is removed from the model (#774 class)', async () => {
    // Both slots must be BRANCHES for this to test the tracking at all. With a leaf sliding into
    // the removed branch's position the `@if` arm flips, which destroys the view — and the panel
    // closes — under `track $index` just as much as under `track item`. That earlier shape passed
    // against both, i.e. it asserted nothing; mutation-testing is what surfaced it.
    const exportBranch: CaeMenuItem = {
      label: 'Export',
      items: [{ value: 'pdf', label: 'PDF' }],
    };
    host.items.set([SHARE, exportBranch]);
    await openRoot();
    const share = rowNamed(rootPanel(), 'Share');
    share.click();
    await settle();
    const level2Id = share.getAttribute('aria-controls')!;
    expect(document.getElementById(level2Id)).not.toBeNull();

    // Drop the OPEN branch. Its identity is gone, so `track item` destroys its view and disposes
    // the trigger, taking the panel with it. Under `track $index` position 0 is REUSED by
    // exportBranch — same arm, same trigger instance — so the panel would survive, still open,
    // silently re-labelled with another item's children.
    host.items.set([exportBranch]);
    await settle();
    expect(document.getElementById(level2Id)).toBeNull();
  });

  it('has no axe violations with a submenu open', async () => {
    await openRoot();
    rowNamed(rootPanel(), 'Share').click();
    await settle();
    await expectNoA11yViolations(overlayContainer.getContainerElement());
  });
});

function matTriggerOf(fixture: ComponentFixture<unknown>): MatMenuTrigger {
  return fixture.debugElement.query(By.directive(MatMenuTrigger)).injector.get(MatMenuTrigger);
}
