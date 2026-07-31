import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatDrawer } from '@angular/material/sidenav';

import { CaeDrawer, CaeDrawerContainer, CaeDrawerMode, CaeDrawerPosition } from './drawer';
import { expectNoA11yViolations } from '../testing/a11y';

/**
 * Scope note. Focus-trap behaviour — Tab wrapping inside an open modal drawer, Escape dismissal,
 * focus restore on close — is **not** tested here, and not because it is hard: it is structurally
 * unverifiable in jsdom. CDK's `InteractivityChecker.isVisible` gates on `hasGeometry`, which reads
 * `offsetWidth || offsetHeight || getClientRects().length`, and jsdom returns 0 for all three on
 * every element. So nothing is ever focusable, the trap has no target, and a jsdom assertion about
 * it passes identically against the bug and the fix (#824 measured exactly this). Those claims live
 * in `drawer.browser.spec.ts`; what jsdom *can* see — the wiring, the attributes, the modality
 * rule — is pinned here.
 */
@Component({
  imports: [CaeDrawer, CaeDrawerContainer],
  template: `
    <cae-drawer-container [hasBackdrop]="hasBackdrop()">
      @if (present()) {
        <!-- Deliberately wrapped in an element: a bare or @if-only drawer is collected even by a
             descendants:false query, so only this shape actually exercises the flag. -->
        <div class="drawer-wrapper">
          <cae-drawer
            [(opened)]="opened"
            [mode]="mode()"
            [position]="position()"
            [disableClose]="disableClose()"
            [ariaLabel]="ariaLabel()"
            [ariaLabelledby]="ariaLabelledby()"
          >
            <a id="nav-link" href="#target">Nav link</a>
          </cae-drawer>
        </div>
      }
      <main id="main-content">Page content</main>
    </cae-drawer-container>
  `,
})
class DrawerHost {
  readonly opened = signal(false);
  readonly mode = signal<CaeDrawerMode>('over');
  readonly position = signal<CaeDrawerPosition>('start');
  readonly hasBackdrop = signal<boolean | null>(null);
  readonly disableClose = signal(false);
  readonly ariaLabel = signal('Main navigation');
  readonly ariaLabelledby = signal('');
  readonly present = signal(true);
}

/** Bare attribute form — the shape that reaches an uncoerced input as the string `''`. */
@Component({
  imports: [CaeDrawer, CaeDrawerContainer],
  template: `<cae-drawer-container hasBackdrop>
    <cae-drawer mode="side" ariaLabel="Nav">x</cae-drawer>
  </cae-drawer-container>`,
})
class BareBackdropHost {}

/** Two drawers, distinct bodies — the only shape that can falsify the per-drawer indexing. */
@Component({
  imports: [CaeDrawer, CaeDrawerContainer],
  template: `<cae-drawer-container>
    <cae-drawer position="start" ariaLabel="Start"><span id="body-start">S</span></cae-drawer>
    <cae-drawer position="end" ariaLabel="End"><span id="body-end">E</span></cae-drawer>
  </cae-drawer-container>`,
})
class TwoDrawerHost {}

/** Nothing bound — the only shape in which an input's own default is observable. */
@Component({
  imports: [CaeDrawer, CaeDrawerContainer],
  template: `<cae-drawer-container><cae-drawer>x</cae-drawer></cae-drawer-container>`,
})
class BareDrawerHost {}

/** Two independently-driven drawers — the shape the container-wide modality rules need (#856). */
@Component({
  imports: [CaeDrawer, CaeDrawerContainer],
  template: `
    <cae-drawer-container [hasBackdrop]="hasBackdrop()">
      @if (startPresent()) {
        <cae-drawer position="start" [(opened)]="startOpen" [mode]="startMode()" ariaLabel="Start">
          <a id="body-start" href="#t">S</a>
        </cae-drawer>
      }
      <cae-drawer position="end" [(opened)]="endOpen" [mode]="endMode()" ariaLabel="End">
        <a id="body-end" href="#t">E</a>
      </cae-drawer>
      <main id="main-content">Page content</main>
    </cae-drawer-container>
  `,
})
class PairHost {
  readonly startPresent = signal(true);
  readonly startOpen = signal(false);
  readonly endOpen = signal(false);
  readonly startMode = signal<CaeDrawerMode>('over');
  readonly endMode = signal<CaeDrawerMode>('over');
  readonly hasBackdrop = signal<boolean | null>(null);
}

describe('CaeDrawer / CaeDrawerContainer', () => {
  let fixture: ComponentFixture<DrawerHost>;
  let host: DrawerHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DrawerHost] }).compileComponents();
    fixture = TestBed.createComponent(DrawerHost);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  const el = (): HTMLElement => fixture.nativeElement;
  const drawer = (): HTMLElement | null => el().querySelector('mat-drawer');
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  // -------------------------------------------------------------------------
  // Projection wiring — the claim the whole design rests on.
  // -------------------------------------------------------------------------

  it('stamps a real mat-drawer and puts the drawer body INSIDE it, not in the content area', () => {
    const matDrawer = drawer();
    expect(matDrawer).not.toBeNull();

    // The load-bearing assertion. MatDrawerContainer projects by element selector
    // (`<ng-content select="mat-drawer, mat-sidenav">`), so if the container ever stopped
    // re-stamping and passed <cae-drawer> straight through, the nav would fall into the DEFAULT
    // slot and render as page content — visually plausible, semantically a different component.
    // Asserting only "the link exists somewhere" would pass in exactly that broken world.
    const link = el().querySelector('#nav-link');
    expect(link).not.toBeNull();
    expect(matDrawer!.contains(link!)).toBe(true);

    const content = el().querySelector('mat-drawer-content');
    expect(content).not.toBeNull();
    expect(content!.contains(link!)).toBe(false);
  });

  it('puts non-drawer projected content in the content area, not in the drawer', () => {
    const main = el().querySelector('#main-content');
    expect(main).not.toBeNull();
    expect(el().querySelector('mat-drawer-content')!.contains(main!)).toBe(true);
    expect(drawer()!.contains(main!)).toBe(false);
  });

  it('finds a drawer nested inside a wrapper element — what descendants:true actually buys', () => {
    // Guard the guard: assert the INPUT is really the shape under test, so this can never quietly
    // degrade into the unwrapped case that passes with descendants:false. Removing the flag was
    // mutation-tested and killed this test only once the wrapper was here.
    const wrapper = el().querySelector('.drawer-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.querySelector('cae-drawer')).not.toBeNull();

    expect(drawer()).not.toBeNull();
    expect(drawer()!.querySelector('#nav-link')).not.toBeNull();
  });

  it('adds and removes its drawer as the declaration is toggled', async () => {
    expect(drawer()).not.toBeNull();
    host.present.set(false);
    await settle();
    expect(drawer()).toBeNull();
    host.present.set(true);
    await settle();
    expect(drawer()).not.toBeNull();
  });

  it('renders the cae-drawer host itself inert, so it cannot show up as page content', () => {
    const hostEl = el().querySelector('cae-drawer');
    expect(hostEl).not.toBeNull();
    expect(getComputedStyle(hostEl!).display).toBe('none');
  });

  // -------------------------------------------------------------------------
  // Input passthrough + two-way state.
  // -------------------------------------------------------------------------

  it('passes mode and position through to the Material drawer', async () => {
    expect(drawer()!.classList.contains('mat-drawer-over')).toBe(true);

    host.mode.set('side');
    host.position.set('end');
    await settle();

    expect(drawer()!.classList.contains('mat-drawer-side')).toBe(true);
    expect(drawer()!.classList.contains('mat-drawer-over')).toBe(false);
    expect(drawer()!.classList.contains('mat-drawer-end')).toBe(true);
  });

  it('opens when the bound model is set, and writes a Material-side close back to it', async () => {
    expect(drawer()!.classList.contains('mat-drawer-opened')).toBe(false);

    host.opened.set(true);
    await settle();
    expect(drawer()!.classList.contains('mat-drawer-opened')).toBe(true);

    // The write-back leg: closing through Material's own API must land on the host's signal, or a
    // one-way consumer silently diverges from what is rendered (see CaeDrawer.opened's docstring).
    // Driving Material directly — rather than setting host.opened(false) — is what makes this a
    // real test of the write-back: the latter would pass even with the (openedChange) binding cut.
    const matDrawer = fixture.debugElement.query(By.directive(MatDrawer))
      .componentInstance as MatDrawer;
    await matDrawer.close();
    await settle();

    expect(host.opened()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // The modal semantics Material omits (D-826 applied to the drawer family).
  // -------------------------------------------------------------------------

  it('marks a modal drawer as a dialog and names it', () => {
    expect(drawer()!.getAttribute('role')).toBe('dialog');
    expect(drawer()!.getAttribute('aria-label')).toBe('Main navigation');
  });

  it('supports aria-labelledby as the alternative naming route, and omits it when unset', async () => {
    // Written because removing the [attr.aria-labelledby] binding was a mutation I EXPECTED to
    // survive the suite as it stood — it did. The absence arm matters as much as the presence one:
    // a binding that always emits the attribute would name the drawer with an empty idref, which
    // is worse than no name at all.
    expect(drawer()!.hasAttribute('aria-labelledby')).toBe(false);

    host.ariaLabel.set('');
    host.ariaLabelledby.set('main-content');
    await settle();

    expect(drawer()!.getAttribute('aria-labelledby')).toBe('main-content');
    expect(drawer()!.hasAttribute('aria-label')).toBe(false);
    expect(drawer()!.getAttribute('role')).toBe('dialog');
  });

  it('drops the dialog role in side mode, promoting a NAMED drawer to a region landmark', async () => {
    host.mode.set('side');
    await settle();
    expect(drawer()!.getAttribute('role')).toBe('region');
    expect(drawer()!.getAttribute('aria-modal')).toBeNull();
    expect(drawer()!.getAttribute('aria-label')).toBe('Main navigation');
  });

  it('withholds the name entirely from an unnamed non-modal drawer', async () => {
    // <mat-drawer> is an unknown element, so with no role it maps to `generic` — where ARIA
    // PROHIBITS aria-label/aria-labelledby. Emitting a name there is a name nothing can announce,
    // so the container must withhold the attribute rather than orphan it.
    host.mode.set('side');
    host.ariaLabel.set('');
    host.ariaLabelledby.set('');
    await settle();
    expect(drawer()!.getAttribute('role')).toBeNull();
    expect(drawer()!.hasAttribute('aria-label')).toBe(false);
    expect(drawer()!.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('exposes aria-modal only while open, never on a drawer mid-close', async () => {
    // Closed: the panel is visibility:hidden and out of the a11y tree anyway.
    expect(drawer()!.getAttribute('aria-modal')).toBeNull();

    host.opened.set(true);
    await settle();
    expect(drawer()!.getAttribute('aria-modal')).toBe('true');
    // The role must survive the open state too — otherwise gating it on `!opened()` (the contract
    // evaporating exactly when it matters) has no killer.
    expect(drawer()!.getAttribute('role')).toBe('dialog');

    // Mid-close Material deliberately keeps the panel visible to animate it out. An aria-modal left
    // behind here would tell AT to hide the whole page for the duration of the animation.
    host.opened.set(false);
    await settle();
    expect(drawer()!.getAttribute('aria-modal')).toBeNull();
  });

  it('treats push as modal too, not just over', async () => {
    // Without this arm the modality rule can be narrowed to `mode() === 'over'` and survive the
    // whole suite, leaving a push drawer with a real backdrop and a real focus trap but no
    // announced modality — the exact D-826 defect the component exists to fix.
    host.mode.set('push');
    await settle();
    expect(drawer()!.getAttribute('role')).toBe('dialog');
  });

  it('follows the container backdrop override in both directions, mirroring Material', async () => {
    // Asserts BOTH sides: Caelum's label AND the backdrop Material actually rendered. Reading only
    // the label would pass with the [hasBackdrop] passthrough deleted, because isModal() reads the
    // input directly and has no data dependency on the binding reaching Material.
    host.mode.set('side');
    host.hasBackdrop.set(true);
    await settle();
    expect(drawer()!.getAttribute('role')).toBe('dialog');
    expect(el().querySelector('.mat-drawer-backdrop')).not.toBeNull();

    host.mode.set('over');
    host.hasBackdrop.set(false);
    await settle();
    // Suppressed backdrop => not modal, so no dialog role and no aria-modal. It is still NAMED,
    // so it lands on `region` rather than nothing (see roleFor) — the point here is that `dialog`
    // is gone and Material rendered no backdrop.
    expect(drawer()!.getAttribute('role')).toBe('region');
    expect(drawer()!.getAttribute('aria-modal')).toBeNull();
    expect(el().querySelector('.mat-drawer-backdrop')).toBeNull();
  });

  it('coerces the bare-attribute form of hasBackdrop the way Material does', async () => {
    // Material's own setter coerces, so `<cae-drawer-container hasBackdrop>` gives it '' -> true:
    // a real backdrop and a real focus trap. An uncoerced signal here would hold '' (falsy) and
    // withhold role="dialog" permanently, since nothing ever writes back to this input.
    const bare = TestBed.createComponent(BareBackdropHost);
    await bare.whenStable();
    const bareDrawer = bare.nativeElement.querySelector('mat-drawer');
    expect(bareDrawer.getAttribute('role')).toBe('dialog');
  });

  it('stamps two drawers independently, each with its own body and position', async () => {
    // Every other test declares ONE drawer, which makes the per-drawer indexing unfalsifiable:
    // slice(0,1), drawers()[0].content(), and a fixed position all look correct with a single child.
    const pair = TestBed.createComponent(TwoDrawerHost);
    await pair.whenStable();
    const drawers = pair.nativeElement.querySelectorAll('mat-drawer');
    expect(drawers.length).toBe(2);

    const start = pair.nativeElement.querySelector('mat-drawer:not(.mat-drawer-end)');
    const end = pair.nativeElement.querySelector('mat-drawer.mat-drawer-end');
    expect(start.querySelector('#body-start')).not.toBeNull();
    expect(start.querySelector('#body-end')).toBeNull();
    expect(end.querySelector('#body-end')).not.toBeNull();
    expect(end.querySelector('#body-start')).toBeNull();
  });

  it('applies each input default when nothing is bound', async () => {
    // No default is otherwise observed: both hosts bind every input, so changing any default
    // survives the suite.
    const bare = TestBed.createComponent(BareDrawerHost);
    await bare.whenStable();
    const d = bare.nativeElement.querySelector('mat-drawer');
    expect(d.classList.contains('mat-drawer-over')).toBe(true);
    expect(d.classList.contains('mat-drawer-end')).toBe(false);
    expect(d.classList.contains('mat-drawer-opened')).toBe(false);
    expect(d.hasAttribute('aria-label')).toBe(false);
  });

  it('has no axe violations open or closed', async () => {
    await expectNoA11yViolations(el());
    host.opened.set(true);
    await settle();
    await expectNoA11yViolations(el());
  });
});

/**
 * Modality coherence — Caelum's per-drawer label vs Material's container-wide machinery
 * (#855 / #856 / #857).
 *
 * These need **fake timers**, unlike every test above. `inert` is the only jsdom-visible proxy for
 * Material's modal state (its focus trap is not — see the scope note), and `MatDrawerContent`
 * writes it from `_drawerToggled` via `_animationEnd.pipe(delay(50))`. `whenStable()` does not wait
 * out that delay, so without advancing the clock `inert` is never set at all and every assertion
 * here reads `null` — passing identically against the bug and the fix.
 */
describe('CaeDrawerContainer — modality coherence', () => {
  let fixture: ComponentFixture<DrawerHost>;
  let host: DrawerHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DrawerHost] }).compileComponents();
    fixture = TestBed.createComponent(DrawerHost);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    // Fake timers AFTER create, so the real-timer compile/create is undisturbed.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    fixture.nativeElement.remove();
  });

  /** Render, then run out Material's deferred `inert` write. */
  const flush = (): void => {
    fixture.detectChanges();
    vi.advanceTimersByTime(200);
    fixture.detectChanges();
  };

  const el = (): HTMLElement => fixture.nativeElement;
  const content = (): HTMLElement => el().querySelector('mat-drawer-content')!;
  const drawer = (): HTMLElement | null => el().querySelector('mat-drawer');

  // -------------------------------------------------------------------------
  // #855 — a drawer destroyed while open must not strand `inert` on the content.
  // -------------------------------------------------------------------------

  it('clears the content inert when an open modal drawer is destroyed', () => {
    host.opened.set(true);
    flush();
    // Vacuity guard. If Material never set `inert` — the default state of this suite before fake
    // timers were introduced — the assertion below would pass against a completely broken fix.
    expect(content().getAttribute('inert')).toBe('true');

    host.present.set(false);
    flush();

    expect(drawer()).toBeNull();
    // The defect: `MatDrawer.ngOnDestroy` never re-runs `_updateInert`, so this stayed 'true' and
    // the whole page was left non-interactive and hidden from AT with nothing on screen to say so.
    expect(content().hasAttribute('inert')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // #857 — modality changed while open: Material must follow Caelum's label.
  // -------------------------------------------------------------------------

  it('applies the trap and inert when hasBackdrop turns a side drawer modal mid-open', () => {
    host.mode.set('side');
    host.opened.set(true);
    flush();
    expect(drawer()!.getAttribute('role')).toBe('region');
    expect(content().hasAttribute('inert')).toBe(false);

    host.hasBackdrop.set(true);
    flush();

    // Caelum re-labels; before the fix Material moved nothing, leaving a drawer announced as a
    // modal dialog with the entire page still reachable behind it.
    expect(drawer()!.getAttribute('role')).toBe('dialog');
    expect(content().getAttribute('inert')).toBe('true');
  });

  it('releases the trap and inert when hasBackdrop turns an over drawer non-modal mid-open', () => {
    host.opened.set(true);
    flush();
    expect(drawer()!.getAttribute('role')).toBe('dialog');
    expect(content().getAttribute('inert')).toBe('true');

    host.hasBackdrop.set(false);
    flush();

    // The worse arm: Caelum dropped the modal labelling while Material's trap and `inert` stayed
    // on, so with disableClose the user was held in a panel claiming to be ordinary content.
    expect(drawer()!.getAttribute('role')).toBe('region');
    expect(content().hasAttribute('inert')).toBe(false);
  });

  it('pulls focus into a drawer that becomes modal while already open', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      host.mode.set('side');
      host.opened.set(true);
      flush();
      outside.focus();
      expect(document.activeElement).toBe(outside);

      host.hasBackdrop.set(true);
      flush();

      // `MatDrawer._takeFocus()` runs only from the `openedChange` subscription, so a modality flip
      // fires nothing — leaving focus outside a role="dialog" whose surroundings Material has just
      // made `inert`, i.e. focus sitting on nothing.
      expect(document.activeElement).toBe(el().querySelector('.cae-drawer__panel'));
    } finally {
      outside.remove();
    }
  });

  it('leaves an ordinary open to Material, focusing the drawer rather than the panel', () => {
    // The negative arm of the rule above, and the one that pins the *restriction* rather than the
    // mechanism: drop the already-open condition and the focus-in fires on every open too, landing
    // focus on `.cae-drawer__panel` instead. Material's own choice here is `<mat-drawer>` — with
    // nothing tabbable findable in jsdom, `_takeFocus()` falls back to focusing the host element —
    // so the two outcomes are distinguishable, which is exactly what makes this test able to fail.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    // Watch the panel for a focus EVENT rather than reading `activeElement` at the end. Material's
    // `_takeFocus` resolves a promise and then focuses `<mat-drawer>`, so it lands *after* our
    // `afterNextRender` — a final-state assertion reads Material's value and passes even when the
    // focus-in wrongly fired first. Measured: the end-state version of this test could not kill
    // dropping the already-open restriction.
    const panel = el().querySelector('.cae-drawer__panel')!;
    let panelFocused = 0;
    const count = (): number => ++panelFocused;
    panel.addEventListener('focus', count);
    try {
      outside.focus();
      host.opened.set(true);
      flush();
      expect(panelFocused).toBe(0);
      expect(document.activeElement).toBe(drawer());
    } finally {
      panel.removeEventListener('focus', count);
      outside.remove();
    }
  });

  it('does not re-steal focus when an open drawer changes between two modal modes', () => {
    // `over` → `push` is a modality-preserving change. The focus-in must key on the false→true
    // modality EDGE, not merely on "open and modal now": keyed on the latter it re-fires on any
    // re-run while a modal drawer is open, yanking focus out of whatever the user was using inside
    // the drawer. This is the arm that pins the edge.
    const panel = (): HTMLElement => el().querySelector('.cae-drawer__panel')!;
    host.opened.set(true);
    flush();
    const link = el().querySelector<HTMLElement>('#nav-link')!;
    link.focus();
    let panelFocused = 0;
    const count = (): number => ++panelFocused;
    panel().addEventListener('focus', count);
    try {
      host.mode.set('push');
      flush();
      expect(drawer()!.getAttribute('role')).toBe('dialog');
      expect(panelFocused).toBe(0);
      expect(document.activeElement).toBe(link);
    } finally {
      panel().removeEventListener('focus', count);
    }
  });
});

/**
 * The surviving-sibling arm of #855, in its own fixture because ORDER matters: the fixture must be
 * created while real timers are still installed. `MatDrawerContainer` arms `_transitionsEnabled`
 * from a `setTimeout` in `ngAfterContentInit`; created under the fake clock, advancing time turns
 * transitions ON, and `_animationEnd` then waits for a transition event jsdom never dispatches — so
 * `inert` is never written and the whole test reads `null`. Measured.
 */
describe('CaeDrawerContainer — destroying one of two drawers (#855)', () => {
  let fixture: ComponentFixture<PairHost>;
  let host: PairHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PairHost] }).compileComponents();
    fixture = TestBed.createComponent(PairHost);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    fixture.nativeElement.remove();
  });

  const flush = (): void => {
    fixture.detectChanges();
    vi.advanceTimersByTime(200);
    fixture.detectChanges();
  };
  const content = (): HTMLElement => fixture.nativeElement.querySelector('mat-drawer-content')!;

  it('leaves the surviving drawer able to re-inert the content', () => {
    // The reason the fix closes the drawer rather than just removing the attribute. `_updateInert`
    // is guarded by Material's own `_isInert` flag, so clearing the attribute behind its back
    // leaves that flag stuck `true` and the next `_updateInert` becomes a no-op — a modal drawer
    // over content that is still reachable.
    //
    // It has to be a *surviving sibling* that opens next. Re-adding a drawer constructs a new
    // `MatDrawer`, whose `mode` binding runs `set mode` on creation — which calls `_updateInert`
    // and silently repairs the desync. The single-drawer version of this test therefore passed
    // against both the fix and the naive attribute-removal, measured doing exactly that.
    host.startOpen.set(true);
    flush();
    expect(content().getAttribute('inert')).toBe('true');

    host.startPresent.set(false);
    flush();
    expect(content().hasAttribute('inert')).toBe(false);

    // The `end` drawer was never destroyed, so nothing re-ran its `mode` setter: Material's own
    // bookkeeping is the only thing that can let this open apply `inert` again.
    host.endOpen.set(true);
    flush();
    expect(content().getAttribute('inert')).toBe('true');
  });
});

/** Container-wide modality with two drawers — the only shape that can falsify the #856 rules. */
describe('CaeDrawerContainer — two drawers open at once (#856)', () => {
  let fixture: ComponentFixture<PairHost>;
  let host: PairHost;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PairHost] }).compileComponents();
    fixture = TestBed.createComponent(PairHost);
    host = fixture.componentInstance;
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => warn.mockRestore());

  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const drawers = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('mat-drawer'));
  const attr = (name: string): (string | null)[] => drawers().map((d) => d.getAttribute(name));

  it('emits aria-modal for the sole open drawer', async () => {
    // Vacuity guard for the two tests below: without this, gating aria-modal on a condition that
    // is ALWAYS false (never emitting it at all) would satisfy them both.
    host.startOpen.set(true);
    await settle();
    expect(attr('aria-modal')).toEqual(['true', null]);
  });

  it('withholds aria-modal from both drawers when two are open, keeping their dialog roles', async () => {
    host.startOpen.set(true);
    host.endOpen.set(true);
    await settle();

    // `aria-modal="true"` claims everything outside this node is inert. With a sibling drawer open
    // that is false in both directions, and two siblings each asserting it is invalid state that
    // Material alone never produced — it emits no aria-modal at all. The role stays: a dialog is
    // still a dialog, it just is not the exclusive one.
    expect(attr('aria-modal')).toEqual([null, null]);
    expect(attr('role')).toEqual(['dialog', 'dialog']);
  });

  it('dev-warns when a second drawer opens behind a backdrop', async () => {
    host.startOpen.set(true);
    await settle();
    expect(warn).not.toHaveBeenCalled();

    host.endOpen.set(true);
    await settle();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('#856'));
  });

  it('stays silent when two NON-modal drawers are open — no backdrop, no container-wide trap', async () => {
    // The rule is keyed on the backdrop, not on the drawer count: `side` drawers share no focus
    // trap and no `inert`, so two of them are an ordinary supported layout. A warning keyed on
    // `openDrawers().length > 1` alone would cry wolf here — and a guard that fires on the correct
    // path trains the reader to skim it.
    host.startMode.set('side');
    host.endMode.set('side');
    host.startOpen.set(true);
    host.endOpen.set(true);
    await settle();

    expect(warn).not.toHaveBeenCalled();
    expect(attr('role')).toEqual(['region', 'region']);
  });
});
