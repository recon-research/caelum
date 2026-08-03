import { Component, ComponentRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatMenuTrigger } from '@angular/material/menu';
import { CAE_ICON_GLYPHS } from '@recon-research/caelum/icon';
import { CaeMenuTrigger, type CaeMenuItem } from '@recon-research/caelum/menu';

import { CaeSplitButton } from './split-button';
import { expectNoA11yViolations } from '../testing/a11y';

const MODEL: CaeMenuItem[] = [
  { value: 'close', label: 'Save and close' },
  { value: 'draft', label: 'Save as draft' },
];

describe('CaeSplitButton', () => {
  let fixture: ComponentFixture<CaeSplitButton>;
  let ref: ComponentRef<CaeSplitButton>;
  let cmp: CaeSplitButton;
  let el: HTMLElement;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeSplitButton] }).compileComponents();
    overlayContainer = TestBed.inject(OverlayContainer);
  });

  afterEach(() => overlayContainer?.ngOnDestroy());

  // Drive inputs via ComponentRef.setInput (marks the OnPush input dirty — the reliable path for a
  // zoneless OnPush child; a host-wrapper field mutation doesn't propagate on plain detectChanges).
  async function setup(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(CaeSplitButton);
    ref = fixture.componentRef;
    cmp = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    ref.setInput('label', 'Save');
    ref.setInput('model', MODEL);
    for (const [k, v] of Object.entries(inputs)) ref.setInput(k, v);
    await flush();
  }

  async function flush(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  // The two <button> halves in DOM order: [0] primary command, [1] chevron toggle. The cae-menu
  // panel is a <mat-menu> template — not in the host DOM until opened — so exactly two buttons.
  const buttons = () => Array.from(el.querySelectorAll('button'));
  const primary = () => buttons()[0];
  const toggle = () => buttons()[1];

  // D-859: a dead TOGGLE is `aria-disabled` — focusable, so it cannot strand focus — and advertises
  // no popup. Asserted as a whole because `.disabled` alone would now pass for a live toggle too:
  // no toggle carries the native attribute any more. The PRIMARY button is untouched — it is a
  // command, not a menu trigger, so it stays natively disabled and its arms below still read
  // `.disabled`.
  //
  // This comment used to add "rendering as a dead row does under D-856". False, and verified false
  // at source (#989 review): a dead row keeps native `disabled` and `tabindex="-1"` and is SKIPPED
  // by MatMenu's key manager. See D-859's evidence correction.
  const expectDeadToggle = (): void => {
    expect(toggle().hasAttribute('disabled')).toBe(false); // native disabled blurs to <body>
    expect(toggle().getAttribute('aria-disabled')).toBe('true');
    expect(toggle().hasAttribute('aria-haspopup')).toBe(false);
    expect(toggle().hasAttribute('aria-expanded')).toBe(false);
  };
  // The OTHER shade of disabled (#989 review): the consumer switched the whole control off, so the
  // toggle goes natively disabled like the primary and leaves the tab order with it. D-859 is
  // scoped to a dead DROPDOWN; it does not govern this case.
  const expectOffToggle = (): void => {
    expect(toggle().hasAttribute('disabled')).toBe(true);
    expect(toggle().hasAttribute('aria-haspopup')).toBe(false);
    expect(toggle().hasAttribute('aria-expanded')).toBe(false);
  };
  const expectLiveToggle = (): void => {
    expect(toggle().hasAttribute('disabled')).toBe(false);
    expect(toggle().hasAttribute('aria-disabled')).toBe(false);
    expect(toggle().getAttribute('aria-haspopup')).toBe('menu');
  };
  const trigger = (): CaeMenuTrigger =>
    fixture.debugElement.query(By.directive(CaeMenuTrigger)).injector.get(CaeMenuTrigger);
  const menuItems = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[mat-menu-item]'));
  // matButton reflects its appearance as mat-*/mdc-* classes; extract just those (not the BEM
  // cae-split-button__* names) so the variant assertion checks only that appearance flows to both
  // halves and is reactive, without hardcoding Material's exact class name.
  const appearance = (btn: HTMLElement) =>
    Array.from(btn.classList)
      // mat-*/mdc-* only, minus mat-mdc-menu-trigger (present on the toggle, absent on the primary —
      // it's the menu wiring, not the button appearance).
      .filter((c) => (c.startsWith('mat') || c.startsWith('mdc')) && !c.includes('menu-trigger'))
      .sort()
      .join(' ');

  // Two-branch parity (#989 review). The sanctioned deltas between D-859's arms, and only these:
  // what Material derives from the deadness bindings, plus the trigger's popup advertisement.
  // `class` is compared as a set separately; `aria-label`'s VALUE is compared directly.
  const ATTR_DELTA = new Set([
    'class',
    'disabled',
    'aria-disabled',
    'aria-haspopup',
    'aria-expanded',
    'mat-ripple-loader-disabled', // Material's own, derived from the disabled state
  ]);
  const attrNames = (btn: HTMLElement) =>
    btn
      .getAttributeNames()
      .filter((n) => !ATTR_DELTA.has(n))
      .sort();
  const MAT_CLASS_DELTA =
    /^(mat-mdc-button-disabled|mat-mdc-button-disabled-interactive|mat-mdc-menu-trigger)$/;
  const classSet = (btn: HTMLElement) =>
    Array.from(btn.classList)
      .filter((c) => !MAT_CLASS_DELTA.test(c))
      .sort();

  it('has no axe violations (labeled group, primary + chevron)', async () => {
    await setup({ ariaLabel: 'Save actions' });
    await expectNoA11yViolations(el);
  });

  it('renders the primary label and groups the two halves under role=group', async () => {
    await setup();
    expect(buttons().length).toBe(2);
    expect(primary().textContent!.trim()).toBe('Save');
    expect(el.querySelector('[role="group"]')).not.toBeNull();
  });

  it('emits the click event when the primary command button is activated', async () => {
    await setup();
    let event: MouseEvent | undefined;
    cmp.primaryClick.subscribe((e) => (event = e));
    primary().click();
    expect(event?.type).toBe('click');
  });

  it('renders both halves as type=button so neither submits an enclosing form (#148 review)', async () => {
    await setup();
    expect(primary().type).toBe('button');
    expect(toggle().type).toBe('button');
  });

  it('renders dead and live from ONE element, changing only the sanctioned attributes (#998)', async () => {
    // The successor to the two-branch parity arm, and it grades a strictly stronger property.
    //
    // That arm existed because D-859 duplicated this markup and nothing else compared the copies —
    // and it demonstrably failed at the job until #989 rewrote it to compare SETS: two independent
    // reviewers landed on the same surviving mutation (a bare `matButton` on the dead arm, rendering
    // a filled chevron welded to an outlined primary) because the spec captured the live arm's
    // classes and then `toContain`-checked them against ITSELF.
    //
    // #998 removed the duplication instead. Drift between arms is now impossible by construction,
    // so what needs guarding is the construction: ONE node whose bindings flip. Keep the mechanical
    // set comparison anyway — it is what fails if someone re-introduces a branch, and it is the only
    // thing that would.
    //
    // Non-default variant and label, so a hardcoded literal cannot pass by matching the default.
    await setup({
      model: [{ value: 'a', label: 'Alpha' }] satisfies CaeMenuItem[],
      variant: 'outlined',
      menuAriaLabel: 'More save options',
    });
    const liveToggle = toggle();
    const liveAppearance = appearance(liveToggle);
    const liveLabel = liveToggle.getAttribute('aria-label');
    const liveAttrs = attrNames(liveToggle);
    const liveClasses = classSet(liveToggle);
    const liveChevron = liveToggle.querySelector('.cae-split-button__chevron');
    expectLiveToggle();

    ref.setInput('model', [{ value: 'a', label: 'Alpha', disabled: true }] satisfies CaeMenuItem[]);
    await flush();

    const deadToggle = toggle();
    // THE claim of the collapse: same node, not a rebuilt one. If a branch ever comes back this is
    // the assertion that fails, and it fails before any of the parity comparisons below.
    expect(deadToggle).toBe(liveToggle);
    expect(attrNames(deadToggle)).toEqual(liveAttrs);
    expect(classSet(deadToggle)).toEqual(liveClasses);
    expect(classSet(deadToggle)).toContain('cae-split-button__toggle'); // …and not empty on both
    // `appearance()` is not reused for the variant check: its filter deliberately keeps the
    // disabled-state classes, which legitimately differ across the flip.
    expect(liveAppearance).toContain('outlined'); // guard: the fixture really is on a non-default
    expect(classSet(deadToggle).join(' ')).toContain('outlined');
    expect(deadToggle.getAttribute('aria-label')).toBe(liveLabel);
    expect(liveLabel).toBe('More save options'); // guard: liveLabel is not the default literal
    expect(deadToggle.querySelector('.cae-split-button__chevron')).toBe(liveChevron);
    expectDeadToggle();
  });

  it('keeps focus on the toggle across a live↔dead flip, in both directions (#998, was #977)', async () => {
    // What #977's focus machinery used to buy, now free. The two-branch destroyed the focused
    // button and rebuilt it in the other arm, stranding focus on <body> (WCAG 2.4.3) — so the
    // component carried a witness, `focusin`/`focusout` bookkeeping and a deferred restore. One
    // element cannot be destroyed by its own bindings changing, so all of it is gone.
    //
    // Assert the SURVIVAL, not the absence of the machinery: "no restore ran" would also be true
    // if the toggle vanished and nothing put focus back, which is the bug the machinery existed to
    // prevent. Both directions, because the old arms only ever captured a witness while live and so
    // graded one of them.
    await setup({ model: [{ value: 'a', label: 'Alpha' }] satisfies CaeMenuItem[] });
    const live = toggle();
    live.focus();
    expect(document.activeElement).toBe(live);

    ref.setInput('model', [{ value: 'a', label: 'Alpha', disabled: true }] satisfies CaeMenuItem[]);
    await flush();

    expect(toggle()).toBe(live);
    expect(live.isConnected).toBe(true);
    expectDeadToggle(); // aria-disabled, not native — so it can still hold focus
    expect(document.activeElement).toBe(live);

    // …and back. A model arriving late (empty → populated) is the ordinary shape of this direction.
    ref.setInput('model', [{ value: 'a', label: 'Alpha' }] satisfies CaeMenuItem[]);
    await flush();

    expect(toggle()).toBe(live);
    expectLiveToggle();
    expect(document.activeElement).toBe(live);
  });

  it('does NOT pull focus back to the toggle when the user is elsewhere (#977)', async () => {
    // Cheap now — with no restore there is nothing to steal with — and kept precisely for that
    // reason: it is what fails if a future slice re-introduces a restore without its anti-steal
    // gates. Both departures the #989 review separated: to another control, and to the background.
    await setup({ model: [{ value: 'a', label: 'Alpha' }] satisfies CaeMenuItem[] });
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      toggle().focus();
      outside.focus();
      ref.setInput('model', [
        { value: 'a', label: 'Alpha', disabled: true },
      ] satisfies CaeMenuItem[]);
      await flush();
      expect(document.activeElement).toBe(outside);

      ref.setInput('model', [{ value: 'a', label: 'Alpha' }] satisfies CaeMenuItem[]);
      await flush();
      toggle().focus();
      toggle().blur();
      expect(document.activeElement).toBe(document.body);
      ref.setInput('model', [] satisfies CaeMenuItem[]);
      await flush();
      expect(document.activeElement).toBe(document.body);
    } finally {
      outside.remove();
    }
  });

  it('closes an OPEN menu when the toggle goes dead, rather than leaving an orphan panel (#998)', async () => {
    // The one state the two-branch could not reach, so nothing graded it before: the arms were
    // separate elements, so going dead destroyed the open trigger and Material's teardown closed
    // the overlay with it. One element survives the flip — without the directive's own close, the
    // panel would stay open above a toggle reporting no `aria-expanded` at all.
    await setup({ model: [{ value: 'a', label: 'Alpha' }] satisfies CaeMenuItem[] });
    // Oracle is the trigger's own `menuOpen`, not a DOM query: a closed Material panel LINGERS in
    // the overlay container, and `aria-expanded` cannot serve either — the dead binding nulls it
    // whether or not the panel actually closed, which is exactly the masking this arm must see past.
    const matTrigger = fixture.debugElement
      .query(By.directive(CaeMenuTrigger))
      .injector.get(MatMenuTrigger);
    trigger().open();
    await flush();
    expect(matTrigger.menuOpen).toBe(true); // guard: it really opened
    expect(toggle().getAttribute('aria-expanded')).toBe('true');

    ref.setInput('model', [{ value: 'a', label: 'Alpha', disabled: true }] satisfies CaeMenuItem[]);
    await flush();

    expect(matTrigger.menuOpen).toBe(false);
    // Deliberately NOT asserting the overlay pane is gone: measured here, `.cdk-overlay-pane`
    // survives the close (1, not 0), because Material disposes it on its own schedule. That is the
    // 3p's teardown timing, not this fix — grading it would make the arm fail on a Material bump.
    expectDeadToggle();
  });

  it('lets the primary opt into type=submit while the toggle stays type=button', async () => {
    await setup({ type: 'submit' });
    expect(primary().type).toBe('submit');
    expect(toggle().type).toBe('button'); // the toggle only opens the menu; it never submits
  });

  it('names the icon-only chevron toggle with menuAriaLabel (chevron itself hidden)', async () => {
    await setup({ menuAriaLabel: 'More save options' });
    expect(toggle().getAttribute('aria-label')).toBe('More save options');
    expect(el.querySelector('.cae-split-button__chevron')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('keeps the toggle named when menuAriaLabel is cleared (no nameless icon button)', async () => {
    await setup({ menuAriaLabel: '' });
    expect(toggle().getAttribute('aria-label')).toBe('More actions');
  });

  it('disables both halves NATIVELY when [disabled], so they leave the tab order together', async () => {
    // #989 review. Applying D-859's aria-disabled posture here left the primary out of the tab
    // order while the toggle stayed in it, so a control the consumer had switched off kept exactly
    // one tab stop — on the half that does nothing, with the labelled half unreachable. D-859 is
    // scoped to "a dead trigger — one whose dropdown has nothing reachable behind it", which a
    // consumer-disabled control is not.
    await setup({ disabled: true });
    expect(primary().disabled).toBe(true);
    expectOffToggle();
    expect(toggle().hasAttribute('aria-disabled')).toBe(false); // natively disabled, not announced
  });

  it('still gives a MODEL-dead toggle the D-859 posture while the control is enabled', async () => {
    // The other side of the same fork: deadness that comes from the dropdown keeps aria-disabled
    // and stays focusable. Without this arm the fix above could be over-applied to both causes and
    // nothing would notice.
    await setup({ model: [] });
    expect(primary().disabled).toBe(false);
    expectDeadToggle();
  });

  it('disables only the toggle when the model is empty (no dead-end empty menu)', async () => {
    await setup({ model: [] });
    expectDeadToggle();
    expect(primary().disabled).toBe(false);
  });

  // --- Nothing-reachable models (#961) -------------------------------------------------------
  //
  // The arm above was the WHOLE of this rule until now: `model().length === 0`. Each case below is
  // non-empty, so each used to leave the toggle live, open the dropdown, and let Material park
  // focus on a bare role="menu" div where only Escape answers. The toggle now asks `cae-menu`'s own
  // question (`caeMenuHasUsableItems`, D-858) rather than a looser one — and only the TOGGLE: the
  // primary command is independent of what is behind the chevron.

  it('disables the toggle when every dropdown item is disabled (#961/D-856)', async () => {
    await setup({
      model: [
        { value: 'close', label: 'Save and close', disabled: true },
        { value: 'draft', label: 'Save as draft', disabled: true },
      ] satisfies CaeMenuItem[],
    });
    expectDeadToggle();
    expect(primary().disabled).toBe(false);
  });

  it('disables the toggle when the model is TRANSITIVELY dead (#962)', async () => {
    // Nothing above the leaf carries `disabled`: a branch holding a branch whose only child is
    // disabled. Every intermediate row reads `disabled === undefined`, so a per-row check — even
    // `model().every((i) => i.disabled)` — passes it through. Only a bottom-up walk answers it.
    await setup({
      model: [
        {
          label: 'Export',
          items: [{ label: 'Formats', items: [{ value: 'pdf', label: 'PDF', disabled: true }] }],
        },
      ] satisfies CaeMenuItem[],
    });
    expectDeadToggle();
  });

  it('leaves the toggle ENABLED when something deep in the model is reachable', async () => {
    // The negative control: same shape, one live leaf at the bottom. A rule that disables this has
    // stopped being a dead-end check and started hiding working menus.
    await setup({
      model: [
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
      ] satisfies CaeMenuItem[],
    });
    expectLiveToggle();
  });

  it('disables the toggle when the only item is a DISABLED BRANCH', async () => {
    // The `!item.disabled` half of the predicate, untested by every other arm: this item is
    // disabled but has LIVE children, so the traversal does NOT mark it a dead end and only that
    // half keeps the toggle off. Without it the dropdown opens holding one disabled branch row.
    await setup({
      model: [
        { label: 'Locked', disabled: true, items: [{ value: 'a', label: 'A' }] },
      ] satisfies CaeMenuItem[],
    });
    expectDeadToggle();
  });

  it('re-evaluates the verdict when the model changes on a LIVE instance', async () => {
    // Every other arm builds a fresh fixture and reads the state once, so a one-shot latch would
    // pass all of them. This is the arm that requires the verdict to be reactive.
    await setup({ model: [{ value: 'a', label: 'A' }] satisfies CaeMenuItem[] });
    expectLiveToggle();
    ref.setInput('model', [{ value: 'a', label: 'A', disabled: true }] satisfies CaeMenuItem[]);
    await flush();
    expectDeadToggle();
    ref.setInput('model', [{ value: 'a', label: 'A' }] satisfies CaeMenuItem[]);
    await flush();
    expectLiveToggle();
  });

  it('disables the toggle when the model is cyclic — not a finite graph (#877)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const loop: { label: string; value: string; items?: readonly CaeMenuItem[] } = {
        label: 'Loop',
        value: 'loop',
      };
      loop.items = [loop as CaeMenuItem];
      await setup({ model: [loop as CaeMenuItem] });
      // The cycle break makes `Loop` a disabled leaf, leaving the model with nothing reachable —
      // a dead end the all-disabled arm cannot produce, since no item here is marked disabled.
      expectDeadToggle();
    } finally {
      warn.mockRestore();
    }
  });

  it('exposes the group accessible name via ariaLabel', async () => {
    await setup({ ariaLabel: 'Save actions' });
    expect(el.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Save actions');
  });

  it('applies variant to both halves, reactively', async () => {
    await setup();
    const filled = appearance(primary());
    expect(appearance(toggle())).toBe(filled); // shared across halves
    ref.setInput('variant', 'outlined');
    await flush();
    expect(appearance(primary())).not.toBe(filled); // reactive
    expect(appearance(toggle())).toBe(appearance(primary())); // still shared
  });

  it('opens the dropdown and renders one menu item per model entry', async () => {
    await setup();
    trigger().open();
    await flush();
    expect(menuItems().length).toBe(MODEL.length);
    expect(menuItems()[0].textContent).toContain('Save and close');
  });

  it('emits itemSelect with the chosen dropdown item', async () => {
    await setup();
    let selected: CaeMenuItem | undefined;
    cmp.itemSelect.subscribe((i) => (selected = i));
    trigger().open();
    await flush();
    menuItems()[1].click();
    await flush();
    expect(selected?.value).toBe('draft');
  });
  it('inherits tiered submenus from the embedded cae-menu, with no split-button wiring (#150)', async () => {
    // COMPARISON's p-tieredmenu row claims split-button gets submenus for free because it EMBEDS
    // cae-menu rather than re-rendering CaeMenuItem itself. That is a claim about this component,
    // so it is asserted here and not only in menu.spec.ts.
    await setup({
      model: [
        { value: 'save', label: 'Save' },
        { label: 'Export', items: [{ value: 'pdf', label: 'PDF' }] },
      ],
    });
    trigger().open();
    await flush();
    const branch = menuItems().find((r) => r.textContent!.trim() === 'Export')!;
    expect(branch.getAttribute('aria-haspopup')).toBe('menu');
    branch.click();
    await flush();
    const submenu = document.getElementById(branch.getAttribute('aria-controls')!)!;
    expect(
      Array.from(submenu.querySelectorAll('[mat-menu-item]')).map((r) => r.textContent!.trim()),
    ).toEqual(['PDF']);
  });
});

@Component({
  imports: [CaeSplitButton],
  template: `
    <cae-split-button
      label="Save"
      icon="plus"
      [model]="model()"
      [iconTemplate]="useTpl() ? tpl : null"
    />
    <!--
      A TEXT-FREE glyph carrying its per-item context in a data attribute (#963, the D-596 sweep).
      This fixture used to stamp the index and value as visible text — the one shape D-596 forbids,
      and it matters most here: the dropdown IS a cae-menu, so Material derives both the row's
      accessible name and its typeahead key from row text, stripping only mat-icon /
      .material-icons. The data attribute proves exactly the same thing about per-item context.
      (No backticks in here: this is inside a template literal, and one would terminate it.)
    -->
    <ng-template #tpl let-item let-index="index">
      <span class="custom-icon" [attr.data-cx]="index + ':' + item.value" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 12h16" /></svg>
      </span>
    </ng-template>
  `,
})
class IconHost {
  readonly model = signal<readonly CaeMenuItem[]>([
    { value: 'close', label: 'Save and close', icon: 'folder' },
    { value: 'draft', label: 'Save as draft' },
  ]);
  readonly useTpl = signal(false);
}

describe('CaeSplitButton icons (D-596 / #149)', () => {
  let overlayContainer: OverlayContainer;

  afterEach(() => overlayContainer?.ngOnDestroy());

  it('renders the primary icon glyph before the label, which stays the accessible name', async () => {
    await TestBed.configureTestingModule({ imports: [CaeSplitButton] }).compileComponents();
    overlayContainer = TestBed.inject(OverlayContainer);
    const fixture = TestBed.createComponent(CaeSplitButton);
    fixture.componentRef.setInput('label', 'Save');
    fixture.componentRef.setInput('icon', 'plus');
    fixture.detectChanges();
    await fixture.whenStable();
    const primary = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.cae-split-button__primary',
    )!;
    const glyph = primary.querySelector('svg');
    expect(glyph?.querySelector('path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.plus);
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    // EXACTLY the label (trimmed equality, not toContain) — the glyph adds no name text.
    expect(primary.textContent?.trim()).toBe('Save');
    // Clearing the input removes the glyph (the chevron lives in the toggle, not here).
    fixture.componentRef.setInput('icon', null);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(primary.querySelector('svg')).toBeNull();
  });

  it('renders model[].icon in the dropdown and forwards iconTemplate to the embedded cae-menu', async () => {
    await TestBed.configureTestingModule({ imports: [IconHost] }).compileComponents();
    overlayContainer = TestBed.inject(OverlayContainer);
    const fixture = TestBed.createComponent(IconHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const open = async (): Promise<void> => {
      fixture.debugElement.query(By.directive(CaeMenuTrigger)).injector.get(CaeMenuTrigger).open();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const menuItems = (): HTMLElement[] =>
      Array.from(document.querySelectorAll<HTMLElement>('[mat-menu-item]'));

    // Per-item glyphs flow through the embedded cae-menu with no split-button-side wiring …
    await open();
    expect(menuItems()[0].querySelector('svg path')?.getAttribute('d')).toBe(
      CAE_ICON_GLYPHS.folder,
    );
    expect(menuItems()[1].querySelector('svg')).toBeNull();
    fixture.debugElement.query(By.directive(CaeMenuTrigger)).injector.get(CaeMenuTrigger).close();
    fixture.detectChanges();
    await fixture.whenStable();

    // … while [iconTemplate] IS split-button wiring: forwarded verbatim, and it wins (D-596).
    fixture.componentInstance.useTpl.set(true);
    fixture.detectChanges();
    await open();
    const custom = menuItems().map((el) =>
      el.querySelector('.custom-icon')?.getAttribute('data-cx'),
    );
    expect(custom).toEqual(['0:close', '1:draft']);
    // The BUILT-IN glyph gave way; the template's own svg is what remains — so this targets the
    // cae-icon ELEMENT, not a bare `svg` (the text-free template renders one too) and not the
    // cosmetic .cae-menu__icon class, which nothing pins and whose deletion would read green.
    expect(menuItems()[0].querySelector('cae-icon')).toBeNull();
    // The row's accessible name is EXACTLY its label — the arm menu.spec.ts gained at #881,
    // brought here because this component embeds a real cae-menu and inherits its exposure
    // (#963). MatMenuItem.getLabel() feeds withTypeAhead() and strips only mat-icon /
    // .material-icons, with no override input, so row text is both the name and the typeahead
    // key. Trimmed EQUALITY: a text-stamping template makes this read "0:close Save and close".
    expect(menuItems().map((el) => el.textContent?.trim())).toEqual([
      'Save and close',
      'Save as draft',
    ]);
    // The template governs only the DROPDOWN's icon slot: the primary [icon] glyph survives.
    const primary = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.cae-split-button__primary',
    )!;
    expect(primary.querySelector('svg path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.plus);
    expect(primary.querySelector('.custom-icon')).toBeNull();
  });
});
