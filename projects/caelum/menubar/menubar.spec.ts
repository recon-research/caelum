import { Component, ComponentRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { DOWN_ARROW, END, HOME, LEFT_ARROW, RIGHT_ARROW } from '@angular/cdk/keycodes';
import { CaeMenuTrigger, type CaeMenuItem } from '@recon-research/caelum/menu';
import { CAE_ICON_GLYPHS } from '@recon-research/caelum/icon';

import { CaeMenubar, type CaeMenubarItem } from './menubar';
import { expectNoA11yViolations } from '../testing/a11y';

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

  // One <button> per top-level group: a cae-menu's panel is an overlay TEMPLATE, so it contributes
  // no button inline, and the toolbar holds exactly one per group in model order. This component
  // used to carry its own `cae-menu { display: none }` because mat-toolbar is a flex row with a gap
  // and an empty inline host blockifies into a stray flex item; since #150 `cae-menu` owns that
  // rule itself (`:host { display: none }`, measured in menu.browser.spec.ts at 48px vs 24px), so
  // the local copy was removed rather than kept as a second home for the same fact.
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

  it('inherits tiered submenus in its group dropdowns from the embedded cae-menu (#150)', async () => {
    // COMPARISON's p-tieredmenu row claims menubar gets submenus for free by EMBEDDING cae-menu.
    // #155 still owns the menubar's OWN parity extras; this only pins the inherited half.
    await setup({
      model: [
        { label: 'File', items: [{ label: 'Recent', items: [{ value: 'a', label: 'a.txt' }] }] },
      ],
    });
    menuTriggerAt(0).open();
    await flush();
    const branch = menuItems().find((r) => r.textContent!.trim() === 'Recent')!;
    expect(branch.getAttribute('aria-haspopup')).toBe('menu');
    branch.click();
    await flush();
    const submenu = document.getElementById(branch.getAttribute('aria-controls')!)!;
    expect(
      Array.from(submenu.querySelectorAll('[mat-menu-item]')).map((r) => r.textContent!.trim()),
    ).toEqual(['a.txt']);
  });

  it('renders a role=menubar of one trigger per group, named by ariaLabel', async () => {
    await setup({ ariaLabel: 'Main' });
    const bar = el.querySelector('[role="menubar"]')!;
    expect(bar).not.toBeNull();
    expect(bar.getAttribute('aria-label')).toBe('Main');
    expect(triggers().length).toBe(GROUPS.length);
    expect(triggers().map((b) => b.textContent!.trim())).toEqual(['File', 'Edit', 'View']);
  });

  it('has no axe violations in the toolbar and an open group dropdown', async () => {
    await setup({ ariaLabel: 'Main' });
    menuTriggerAt(0).open();
    await flush();
    expect(menuItems().length).toBeGreaterThan(0);
    // BOTH roots: the overlay holds the dropdown panel, and the toolbar this test's title names
    // lives in the component's own tree. Scanning only the container left `role="menubar"` — and
    // the dead-group DOM #961 introduced — with no axe coverage at all (#979).
    await expectNoA11yViolations(el);
    await expectNoA11yViolations(overlayContainer.getContainerElement());
  });

  it('does not hand an open dropdown to the group that slides into its slot (#879)', async () => {
    // The #774 family rule: a caeMenuTriggerFor's open/closed state lives inside Material and is
    // never bound in this template, so a view reused at a position carries it to whatever data
    // lands there. Under `track $index` this leaves the surviving group looking already-open,
    // showing ITS items, having never been triggered.
    //
    // Removing group 0 rather than the last group is the whole test. Drop the LAST group and
    // nothing slides into the vacated slot, so the reused view is destroyed either way and the
    // assertion passes under BOTH tracking modes — that is exactly how #150's own version of this
    // test was vacuous on first write (and why the vacuity guard below asserts the slide happened).
    await setup();
    menuTriggerAt(0).open();
    await flush();
    expect(menuItems().map((r) => r.textContent!.trim())).toEqual(['New', 'Open']); // setup guard

    ref.setInput('model', GROUPS.slice(1)); // 'File' out; 'Edit' takes position 0
    await flush();

    expect(triggers().map((b) => b.textContent!.trim())).toEqual(['Edit', 'View']); // it DID slide
    expect(triggers()[0].getAttribute('aria-expanded')).not.toBe('true');
    expect(menuItems()).toEqual([]); // no panel survived the group that owned it
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

  // --- Nothing-reachable groups (#961) -------------------------------------------------------
  //
  // The arm above was the WHOLE of this rule until now: `group.items.length === 0`. Every case
  // below is non-empty, so every one of them used to leave the trigger live, open a panel, and let
  // Material park focus on a bare role="menu" div answering no key but Escape. The bar now asks
  // `cae-menu`'s own question (`caeMenuHasUsableItems`, D-858) instead of a looser one.

  it('treats an ALL-DISABLED group as disabled — empty was never the whole rule (#961/D-856)', async () => {
    await setup({
      model: [
        { label: 'File', items: [{ value: 'new', label: 'New' }] },
        { label: 'Locked', items: [{ value: 'a', label: 'A', disabled: true }] },
      ] satisfies CaeMenubarItem[],
    });
    expect(triggers()[1].disabled).toBe(true);
    expect(triggers()[0].disabled).toBe(false); // and it does not over-disable
  });

  it('treats a TRANSITIVELY dead group as disabled — deadness is not a one-level question (#962)', async () => {
    await setup({
      model: [
        { label: 'File', items: [{ value: 'new', label: 'New' }] },
        // Nothing here carries `disabled` above the leaf: the group holds one branch, holding one
        // branch, whose only child is disabled. Every intermediate row has `disabled === undefined`,
        // so any per-row check — including the obvious `items.every((i) => i.disabled)` — reads
        // them as live and lets the trigger through. Only a bottom-up walk answers it.
        {
          label: 'Reports',
          items: [
            {
              label: 'Export',
              items: [
                { label: 'Formats', items: [{ value: 'pdf', label: 'PDF', disabled: true }] },
              ],
            },
          ],
        },
      ] satisfies CaeMenubarItem[],
    });
    expect(triggers()[1].disabled).toBe(true);
  });

  it('leaves a group ENABLED when something deep under it is still reachable', async () => {
    // The negative control for the two arms above: same depth, one live leaf at the bottom. A rule
    // that disables this has stopped being a dead-end check and started hiding working menus.
    await setup({
      model: [
        {
          label: 'Reports',
          items: [
            {
              label: 'Export',
              items: [
                {
                  label: 'Formats',
                  items: [
                    { value: 'pdf', label: 'PDF', disabled: true },
                    { value: 'csv', label: 'CSV' },
                  ],
                },
              ],
            },
          ],
        },
      ] satisfies CaeMenubarItem[],
    });
    expect(triggers()[0].disabled).toBe(false);
  });

  it('treats a group whose only item is a DISABLED BRANCH as disabled', async () => {
    // The `!item.disabled` half of the predicate, which every other arm leaves untested: this
    // item is disabled but has LIVE children, so the traversal does NOT put it in `deadEnd` and
    // only that half keeps the trigger off. Without it the panel opens holding exactly one
    // disabled branch row — the #880 trap, and the shape a permission-gated section header takes.
    await setup({
      model: [
        { label: 'File', items: [{ value: 'new', label: 'New' }] },
        {
          label: 'Gated',
          items: [{ label: 'Locked', disabled: true, items: [{ value: 'a', label: 'A' }] }],
        },
      ] satisfies CaeMenubarItem[],
    });
    expect(triggers()[1].disabled).toBe(true);
  });

  it('re-evaluates the verdict when the model changes on a LIVE instance', async () => {
    // Every other arm builds a fresh fixture and reads the state once, so a one-shot latch would
    // pass all of them. This is the arm that requires the verdict to be reactive.
    await setup({ model: [{ label: 'File', items: [{ value: 'new', label: 'New' }] }] });
    expect(triggers()[0].disabled).toBe(false);
    ref.setInput('model', [
      { label: 'File', items: [{ value: 'new', label: 'New', disabled: true }] },
    ] satisfies CaeMenubarItem[]);
    await flush();
    expect(triggers()[0].disabled).toBe(true);
    ref.setInput('model', [
      { label: 'File', items: [{ value: 'new', label: 'New' }] },
    ] satisfies CaeMenubarItem[]);
    await flush();
    expect(triggers()[0].disabled).toBe(false);
  });

  it('keeps a tab stop when the model arrives AFTER init and group 0 is dead', async () => {
    // The roving tabindex names exactly one trigger, and `ngAfterViewInit` seeds it once — against
    // an EMPTY QueryList when the model is async (the ordinary permissions/HTTP shape). CDK's
    // `_itemsChanged` only repairs an index that already holds a live item, so `activeIndex`
    // stayed 0; a dead group 0 then held the bar's only `tabindex="0"` on a natively-disabled
    // button (Material's `_getTabIndex()` ignores `disabled` for a non-anchor), and the whole
    // menubar left the tab order — WCAG 2.1.1. Measured before the fix: 0 tabbable triggers.
    await setup({ model: [] });
    ref.setInput('model', [
      { label: 'Locked', items: [{ value: 'a', label: 'A', disabled: true }] },
      { label: 'File', items: [{ value: 'new', label: 'New' }] },
    ] satisfies CaeMenubarItem[]);
    await flush();
    expect(triggers().filter((b) => !b.disabled && b.tabIndex === 0).length).toBe(1);
    expect(triggers()[1].tabIndex).toBe(0); // and it is the live one
  });

  it('ArrowDown refuses to open a dead group when EVERY group is dead', async () => {
    // A native `disabled` does NOT stop a programmatic open: `MatMenuTrigger._openMenu` refuses
    // only on `aria-disabled` (`menu.mjs` `_triggerIsAriaDisabled` reads the attribute), which
    // `MatButton` emits only in its `disabledInteractive` posture. So `onKeydown` has to re-ask.
    //
    // The all-dead model is what makes this reachable, and finding it took a mutation: with even
    // one live group the re-seed above moves `activeIndex` onto it, so the guard never fires and
    // an arm written against a mixed model passes with the guard DELETED. Here `seedActiveIndex`
    // has no operable trigger to pick, falls back to index 0 — a dead group — and the guard is the
    // only thing standing between ArrowDown and a panel Material parks focus inside.
    await setup({
      model: [
        { label: 'Locked', items: [{ value: 'a', label: 'A', disabled: true }] },
        { label: 'Gated', items: [] },
      ] satisfies CaeMenubarItem[],
    });
    expect(triggers().every((b) => b.disabled)).toBe(true); // the precondition, asserted
    keydown(DOWN_ARROW);
    await flush();
    expect(menuItems()).toEqual([]);
    expect(document.activeElement?.getAttribute('role')).not.toBe('menu');
  });

  it('treats a CYCLIC group as disabled — the model is not a finite graph (#877)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const loop: { label: string; value: string; items?: readonly CaeMenuItem[] } = {
        label: 'Loop',
        value: 'loop',
      };
      loop.items = [loop as CaeMenuItem];
      await setup({
        model: [
          { label: 'File', items: [{ value: 'new', label: 'New' }] },
          { label: 'Broken', items: [loop as CaeMenuItem] },
        ] satisfies CaeMenubarItem[],
      });
      // The cycle break makes `Loop` a disabled leaf, which leaves its group with nothing
      // reachable — the transitive rule reaching a case the all-disabled arm cannot produce.
      expect(triggers()[1].disabled).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('skips a nothing-reachable group when roving, and Down cannot open it', async () => {
    // #961's own acceptance bullet: `disabledGroup` feeds BOTH [menubarDisabled] (the key
    // manager's skipPredicate) and [disabled] (the DOM), so a dead group must be unreachable by
    // keyboard, not merely greyed. Dead group FIRST, so ngAfterViewInit's "first enabled trigger"
    // seed is what puts roving on File — and Down then opens File's panel, never Locked's.
    await setup({
      model: [
        { label: 'Locked', items: [{ value: 'a', label: 'A', disabled: true }] },
        { label: 'File', items: [{ value: 'new', label: 'New' }] },
        { label: 'View', items: [{ value: 'zoom', label: 'Zoom' }] },
      ] satisfies CaeMenubarItem[],
    });
    expect(triggers()[0].disabled).toBe(true);
    expect(triggers()[1].tabIndex).toBe(0); // roving seeded past the dead group, not onto it

    keydown(DOWN_ARROW);
    await flush();
    expect(menuItems().map((r) => r.textContent!.trim())).toEqual(['New']);

    // And roving from the last trigger wraps PAST the dead one rather than landing on it.
    keydown(RIGHT_ARROW); // 1 -> 2
    await flush();
    keydown(RIGHT_ARROW); // 2 -> wrap, skipping dead 0 -> back to 1
    await flush();
    expect(triggers()[1].tabIndex).toBe(0);
    expect(triggers()[0].tabIndex).toBe(-1);
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
    <!--
      A TEXT-FREE glyph carrying its per-item context in a data attribute (#963, the D-596 sweep).
      This fixture used to stamp the index and value as visible text — the one shape D-596 forbids,
      and it matters most here: each group's dropdown IS a cae-menu, so Material derives both the
      row's accessible name and its typeahead key from row text, stripping only mat-icon /
      .material-icons. The data attribute proves exactly the same thing about per-GROUP indexing.
      (No backticks in here: this is inside a template literal, and one would terminate it.)
    -->
    <ng-template #tpl let-item let-index="index">
      <span class="custom-icon" [attr.data-cx]="index + ':' + item.value" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 12h16" /></svg>
      </span>
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
    expect(file.map((el) => el.querySelector('.custom-icon')?.getAttribute('data-cx'))).toEqual([
      '0:new',
      '1:open',
    ]);
    // The BUILT-IN glyph is gone; the template's own svg is what remains — so this targets the
    // cae-icon ELEMENT, not a bare `svg` (which the text-free template now also renders) and not
    // the cosmetic .cae-menu__icon class (nothing pins it, so deleting it would read green).
    expect(file[0].querySelector('cae-icon')).toBeNull();

    // The second group is the assertion that matters: a forward wired to only the first
    // cae-menu (or dropped entirely) leaves this dropdown on its built-in glyph. Its index
    // restarting at 0 also pins the documented per-group (not bar-wide running) count.
    const edit = await openGroupItems(1);
    expect(edit.map((el) => el.querySelector('.custom-icon')?.getAttribute('data-cx'))).toEqual([
      '0:cut',
    ]);
    expect(edit[0].querySelector('cae-icon')).toBeNull();

    // Reverse flip: clearing the template restores the built-in glyph (not a one-way latch).
    fixture.componentInstance.useTpl.set(false);
    fixture.detectChanges();
    const editAgain = await openGroupItems(1);
    expect(editAgain[0].querySelector('.custom-icon')).toBeNull();
    expect(editAgain[0].querySelector('svg path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.file);
  });

  /**
   * The arm `menu.spec.ts` gained at #881, brought here because this component is one of the two
   * that embed a real `cae-menu` and so inherit its exposure (#963). `MatMenuItem.getLabel()` feeds
   * `FocusKeyManager.withTypeAhead()` and strips ONLY `mat-icon, .material-icons`, with no
   * typeahead-label input to override — so a dropdown row's text content is both its accessible
   * name and its typeahead key, and D-596's "the item's name stays `label`" holds only while the
   * icon slot is text-free. Trimmed EQUALITY, not `toContain`: a template stamping "0:new" makes
   * the row read "0:new New", a wrong name and a key nobody can type.
   */
  it('keeps a dropdown row name exactly its label — built-in glyph AND template', async () => {
    expect((await openGroupItems(0)).map((el) => el.textContent?.trim())).toEqual(['New', 'Open']);
    fixture.componentInstance.useTpl.set(true);
    fixture.detectChanges();
    expect((await openGroupItems(0)).map((el) => el.textContent?.trim())).toEqual(['New', 'Open']);
  });
});
