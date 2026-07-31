/**
 * RTL geometry for `cae-drawer` (#858), in its **own file on purpose**.
 *
 * Vitest isolates browser spec files, and this fixture needs that. It is the only drawer fixture
 * that ends with an OPEN drawer, and destroying one now routes through the close-on-destroy added
 * for #855 — whose focus restore is asynchronous, by way of Material's `_restoreFocus`. Sharing a
 * file with `drawer.browser.spec.ts`, that tail landed inside the *next* test and stole the focus
 * assertion in `moves focus into the drawer when it opens`. Closing in `afterEach` fixed it locally
 * and still failed on the slower CI runner, which is the tell that it was a timing patch rather
 * than a fix: the isolation is structural, so it does not depend on who wins a race.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dir, type Direction } from '@angular/cdk/bidi';

import { CaeDrawer, CaeDrawerContainer, CaeDrawerPosition } from './drawer';
import { loadCaelumTheme } from '../testing/theme';
import { animationsSettled } from '../testing/animation';

/**
 * RTL arm (#858). Needs a **real CDK `Dir` ancestor**: `MatDrawerContainer` injects
 * `Directionality`, and a bare `dir="rtl"` attribute does not provide it — only the `Dir` directive
 * does. And it has to live here rather than in jsdom, because the flip it verifies is geometry:
 * Material swaps `_left`/`_right` in `_validateDrawers`, but what the user sees comes from the
 * `[dir=rtl] .mat-drawer { transform: translate3d(100%, 0, 0) }` rules in `sidenav.mjs`'s
 * stylesheet. jsdom computes no layout, so the claim is unfalsifiable there.
 */
@Component({
  imports: [CaeDrawer, CaeDrawerContainer, Dir],
  template: `
    <div [dir]="dir()">
      <cae-drawer-container style="height: 200px; width: 800px">
        <cae-drawer [(opened)]="opened" [position]="position()" mode="side" ariaLabel="Nav">
          <a id="rtl-link" href="#t">Nav</a>
        </cae-drawer>
        <main id="rtl-content">Content</main>
      </cae-drawer-container>
    </div>
  `,
})
class RtlHost {
  readonly dir = signal<Direction>('ltr');
  readonly opened = signal(true);
  readonly position = signal<CaeDrawerPosition>('start');
}

describe('CaeDrawer — direction-relative positions (real browser, #858)', () => {
  let fixture: ComponentFixture<RtlHost>;
  let host: RtlHost;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [RtlHost] }).compileComponents();
    loadCaelumTheme();
    fixture = TestBed.createComponent(RtlHost);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  // Close before teardown, deliberately. This is the one fixture in the file that ends with an
  // OPEN drawer, and destroying one now routes through `releaseDrawer` -> Material's close, whose
  // focus restore is async (#855). Left to the next `resetTestingModule`, that tail lands inside
  // the following test and steals its focus assertion — measured, not guessed.
  afterEach(async () => {
    host.opened.set(false);
    fixture.detectChanges();
    await animationsSettled(fixture.nativeElement);
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  /** Which half of the container the open drawer occupies. */
  async function side(): Promise<'left' | 'right'> {
    fixture.detectChanges();
    await fixture.whenStable();
    await animationsSettled(fixture.nativeElement);
    const el = fixture.nativeElement as HTMLElement;
    const container = el.querySelector('mat-drawer-container')!.getBoundingClientRect();
    const drawerRect = el.querySelector('mat-drawer')!.getBoundingClientRect();
    // Guard the guard: a zero-width drawer would make every comparison below meaningless, and a
    // collapsed container is the documented way this component renders nothing (see the docstring).
    expect(drawerRect.width).toBeGreaterThan(0);
    expect(container.width).toBeGreaterThan(drawerRect.width);
    const centre = (drawerRect.left + drawerRect.right) / 2;
    return centre < (container.left + container.right) / 2 ? 'left' : 'right';
  }

  it('flips start and end under RTL — the reason they are not named left/right', async () => {
    expect(await side()).toBe('left');

    host.dir.set('rtl');
    expect(await side()).toBe('right');

    // The mirror arm. Without it, "start is on the right under RTL" is also satisfied by a drawer
    // that ignores `position` entirely and always sits on the reading-end edge.
    host.position.set('end');
    expect(await side()).toBe('left');

    host.dir.set('ltr');
    expect(await side()).toBe('right');
  });
});
