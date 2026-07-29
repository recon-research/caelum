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
