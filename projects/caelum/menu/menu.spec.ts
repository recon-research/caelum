import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { BidiModule } from '@angular/cdk/bidi';
import { MatMenuTrigger } from '@angular/material/menu';
import { CAE_ICON_GLYPHS } from '@recon-research/caelum/icon';

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
  /**
   * Dispatch a keydown carrying a CDK keyCode (KeyboardEvent init has no keyCode field).
   *
   * **The target matters for some keys and not others, which is worth knowing before trusting an
   * assertion.** A `MatMenu` panel has NO `(keydown)` binding; `_handleKeydown` is reached through
   * `overlayRef.keydownEvents()`, and the CDK dispatcher listens on `body` and routes to the
   * TOP-MOST attached overlay without consulting the event target. So panel-directed keys (Down,
   * Escape, the closing arrow) would behave identically if dispatched at `document.body` — they
   * prove "the topmost overlay handled it", not "the key was scoped to this element". Keys on a
   * TRIGGER row (the opening arrow) are genuinely target-scoped: they fire that row's own host
   * binding. Assertions that need per-level scoping have to come from observed focus, not from
   * where the event was aimed.
   */
  const press = (el: HTMLElement, keyCode: number): void => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { get: () => keyCode });
    el.dispatchEvent(event);
  };
  const RIGHT_ARROW = 39;
  const LEFT_ARROW = 37;
  const DOWN_ARROW = 40;
  const ESCAPE = 27;
  const backdrops = (): number =>
    overlayContainer.getContainerElement().querySelectorAll('.cdk-overlay-backdrop').length;

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

    // The assertions above would ALSO hold for one shared key manager spanning both panels, since
    // the arrow reaches the topmost overlay either way (see `press`). This is the complement that
    // only a per-level manager satisfies: close back to the root and its active row must still be
    // 'Share' at index 1 — a shared manager would have advanced past it to index 2.
    press(level2, LEFT_ARROW);
    await settle();
    expect(document.activeElement).toBe(share);
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

  it('emits exactly ONCE for a depth-3 leaf — the per-level relay does not re-broadcast', async () => {
    // Every level binds (itemSelect)="itemSelect.emit($event)" on its child, so a leaf's event is
    // re-emitted at each enclosing level on the way up. Nothing else in this file can tell one
    // emission from three: every other arm reads `selected()`, which looks identical either way.
    // If this ever regresses to a broadcast, a consumer's menu action runs once per level of depth.
    const emissions: (string | undefined)[] = [];
    host.selected.set(undefined);
    const sub = fixture.debugElement
      .query(By.directive(CaeMenu))
      .componentInstance.itemSelect.subscribe((i: CaeMenuItem) => emissions.push(i.value));

    await openRoot();
    const share = rowNamed(rootPanel(), 'Share');
    share.click();
    await settle();
    const social = rowNamed(panelOf(share), 'Social');
    social.click();
    await settle();
    // Two branches activated, and neither is selectable.
    expect(emissions).toEqual([]);

    rowNamed(panelOf(social), 'Bluesky').click();
    await settle();
    expect(emissions).toEqual(['bsky']);
    sub.unsubscribe();
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
    // ONE level, not the whole tree: the root stays open and focus lands back on the branch row.
    // Without these two, any implementation that collapsed everything would pass.
    expect(matTriggerOf(fixture).menuOpen).toBe(true);
    expect(document.activeElement).toBe(share);
  });

  it('closes exactly one level on Escape, restoring focus to the branch row', async () => {
    // Book 09 §3.4 names this a fixed menu invariant, so it is pinned here rather than trusted.
    // Escape is a DIFFERENT switch case from the closing arrow, so the arm above does not cover it.
    await openRoot();
    const share = rowNamed(rootPanel(), 'Share');
    press(share, RIGHT_ARROW);
    await settle();
    press(panelOf(share), ESCAPE);
    await settle();
    expect(share.getAttribute('aria-expanded')).toBe('false');
    expect(matTriggerOf(fixture).menuOpen).toBe(true);
    expect(document.activeElement).toBe(share);
  });

  it('opens a submenu on hover, without stealing focus into it', async () => {
    // The one inherited behaviour that depends on THIS component's timing: Material wires
    // hover-open once, in ngAfterContentInit, and it no-ops forever unless the branch row's
    // `[matMenuTriggerFor]` is already set at that instant. Converting that binding to an effect
    // (the shape CaeMenuTrigger itself uses) would kill hover-open with every other spec green.
    await openRoot();
    const share = rowNamed(rootPanel(), 'Share');
    share.dispatchEvent(new MouseEvent('mouseenter')); // non-bubbling: dispatch on the row itself
    await settle();
    expect(share.getAttribute('aria-expanded')).toBe('true');
    // Opened by mouse, so Material deliberately does NOT autofocus the submenu's first row.
    expect(document.activeElement).not.toBe(rowsIn(panelOf(share))[0]);
  });

  it('names each submenu panel from its branch, and the root only when asked', async () => {
    // A submenu is a NEW unnamed role="menu" without this — axe has no rule for it, so both axe
    // arms pass while a screen-reader user hears a bare "menu" on entering level 2.
    await openRoot();
    const share = rowNamed(rootPanel(), 'Share');
    expect(rootPanel().getAttribute('aria-label')).toBeNull(); // root: opt-in, unchanged default
    share.click();
    await settle();
    expect(panelOf(share).getAttribute('aria-label')).toBe('Share');

    // …and it recurses: level 3 is named by ITS branch, not by the root's.
    const social = rowNamed(panelOf(share), 'Social');
    social.click();
    await settle();
    expect(panelOf(social).getAttribute('aria-label')).toBe('Social');
  });

  it('marks a branch with the decorative submenu chevron, and a leaf without', async () => {
    // Material latches this in its `menu` SETTER, which only fires once `child.getMenuPanel()`
    // transitions undefined -> panel. That is a second change-detection pass this component's
    // recursion depends on; if it ever stopped happening the chevron would vanish while
    // `aria-haspopup` (a live binding) still read 'menu' — so the ARIA arm cannot cover this.
    await openRoot();
    const chevron = rowNamed(rootPanel(), 'Share').querySelector('.mat-mdc-menu-submenu-icon');
    expect(chevron).not.toBeNull();
    expect(chevron!.getAttribute('aria-hidden')).toBe('true');
    expect(rowNamed(rootPanel(), 'New').querySelector('.mat-mdc-menu-submenu-icon')).toBeNull();
  });

  it('gives a submenu no backdrop of its own — only the root has one', async () => {
    await openRoot();
    expect(backdrops()).toBe(1);
    rowNamed(rootPanel(), 'Share').click();
    await settle();
    // A second backdrop would swallow clicks aimed at the parent panel's rows.
    expect(backdrops()).toBe(1);
  });

  it('keeps the consumer trigger pointed at the ROOT panel, not a submenu', async () => {
    // A wiring assertion, NOT a guard against an ordering hazard — there isn't one. Each nested
    // panel lives in a nested cae-menu's own view and a view query does not cross a component
    // boundary, so `viewChild(MatMenu)` has exactly one candidate (menu.ts explains why the
    // template-ref pin was dropped). Kept because it is the only arm that checks the seam still
    // resolves to the root once branches exist alongside it.
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
    // …and the SURVIVOR is coherent. Without these, an implementation that tore the whole menu
    // down on any model change would pass, which is not the contract: the remaining branch is
    // still rendered, and closed rather than inheriting the dead branch's open state.
    expect(rowsIn(rootPanel()).map((el) => el.textContent!.trim())).toEqual(['Export']);
    expect(rowNamed(rootPanel(), 'Export').getAttribute('aria-expanded')).toBe('false');
  });

  it('has no axe violations with a submenu open', async () => {
    await openRoot();
    const share = rowNamed(rootPanel(), 'Share');
    share.click();
    await settle();
    // Prove the submenu is OPEN and in the scanned container before scanning it. axe asserts only
    // "no violations", so an empty container passes hardest of all: deleting the branch's
    // [matMenuTriggerFor] would leave this green while the title claims a submenu was scanned
    // (the #773/#785 pristine-state class this repo already mechanized against).
    expect(share.getAttribute('aria-expanded')).toBe('true');
    expect(rowsIn(panelOf(share)).length).toBe(2);
    await expectNoA11yViolations(overlayContainer.getContainerElement());
  });
});

/**
 * A born-RTL host. `MatMenuTrigger` reads its direction from the injected `Directionality`, so the
 * RTL arm needs a REAL CDK `Dir` ancestor over the trigger — setting `document.dir` would not reach
 * it (the `rtl-directionality-signal-read` recipe).
 */
@Component({
  imports: [CaeMenu, CaeMenuTrigger, BidiModule],
  template: `
    <div dir="rtl">
      <cae-menu #actions [items]="items" />
      <button type="button" [caeMenuTriggerFor]="actions">Actions</button>
    </div>
  `,
})
class RtlSubmenuHost {
  items: CaeMenuItem[] = [{ label: 'Share', items: [{ value: 'email', label: 'Email' }] }];
}

describe('CaeMenu submenu traversal in RTL (#150)', () => {
  let fixture: ComponentFixture<RtlSubmenuHost>;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RtlSubmenuHost] }).compileComponents();
    fixture = TestBed.createComponent(RtlSubmenuHost);
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => overlayContainer?.ngOnDestroy());

  it('MIRRORS the arrows — Left opens, Right closes', async () => {
    // The doc comment claims RTL-awareness; the LTR arm cannot show it, and a wrapper that
    // hard-coded Right-opens would pass every other spec in this file.
    fixture.debugElement.query(By.directive(CaeMenuTrigger)).injector.get(CaeMenuTrigger).open();
    fixture.detectChanges();
    await fixture.whenStable();
    const branch = Array.from(document.querySelectorAll<HTMLElement>('[mat-menu-item]')).find(
      (r) => r.textContent!.trim() === 'Share',
    )!;

    const press = (el: HTMLElement, keyCode: number): void => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'keyCode', { get: () => keyCode });
      el.dispatchEvent(event);
    };
    const LEFT = 37;
    const RIGHT = 39;

    // Right must NOT open in RTL — assert the negative first, so a direction-blind
    // implementation fails here rather than sliding through on the positive below.
    press(branch, RIGHT);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(branch.getAttribute('aria-expanded')).toBe('false');

    press(branch, LEFT);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(branch.getAttribute('aria-expanded')).toBe('true');

    const panel = document.getElementById(branch.getAttribute('aria-controls')!)!;
    press(panel, RIGHT);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(branch.getAttribute('aria-expanded')).toBe('false');
  });
});

function matTriggerOf(fixture: ComponentFixture<unknown>): MatMenuTrigger {
  return fixture.debugElement.query(By.directive(MatMenuTrigger)).injector.get(MatMenuTrigger);
}
