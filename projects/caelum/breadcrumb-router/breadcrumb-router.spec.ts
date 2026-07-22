import { Component, ErrorHandler, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import {
  CaeBreadcrumb,
  type CaeBreadcrumbItem,
  type CaeBreadcrumbSelectEvent,
} from 'caelum/breadcrumb';

import { CaeBreadcrumbRouterLink } from './breadcrumb-router';

@Component({ template: 'reports' })
class ReportsPage {}
@Component({ template: 'home' })
class HomePage {}

@Component({
  imports: [CaeBreadcrumb, CaeBreadcrumbRouterLink],
  template: ` <cae-breadcrumb caeBreadcrumbRouterLink [home]="home" [items]="items()" /> `,
})
class RouterTrailHost {
  readonly home: CaeBreadcrumbItem = { label: 'Home', url: '/home' };
  readonly items = signal<readonly CaeBreadcrumbItem[]>([
    { label: 'Reports', url: '/reports' },
    { label: 'Q3' },
  ]);
}

describe('CaeBreadcrumbRouterLink (#333, D-595)', () => {
  let fixture: ComponentFixture<RouterTrailHost>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTrailHost],
      providers: [
        provideRouter([
          { path: 'home', component: HomePage },
          { path: 'reports', component: ReportsPage },
        ]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RouterTrailHost);
    router = TestBed.inject(Router);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  /** Every navigable crumb, in trail order (home first) — each a real `<a href>`. */
  const links = (): HTMLAnchorElement[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a[href]'),
    );

  /**
   * Click a crumb the way a browser would, so `defaultPrevented` is observable. `cancelable` is
   * required — a non-cancelable event silently ignores preventDefault() and the test would pass
   * against a directive that never intercepted anything.
   */
  const click = async (el: Element, init: MouseEventInit = {}): Promise<MouseEvent> => {
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
    el.dispatchEvent(ev);
    fixture.detectChanges();
    await fixture.whenStable();
    return ev;
  };

  it('keeps the honest href markup — the directive upgrades the click, it does not replace the link', () => {
    // The whole point of the directive-over-second-component choice: markup is unchanged, so
    // middle-click / "copy link address" / crawlers still see a real destination.
    expect(links().map((a) => a.getAttribute('href'))).toEqual(['/home', '/reports']);
  });

  it('routes in-app on a plain left click, suppressing the full page load', async () => {
    const ev = await click(links()[1]);
    // End-to-end: a real Router actually resolved the route, not a spy that recorded a call.
    expect(router.url).toBe('/reports');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('navigates the home crumb too (home is not a special case)', async () => {
    await click(links()[0]);
    expect(router.url).toBe('/home');
  });

  for (const [name, init] of [
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['middle-click', { button: 1 }],
  ] as const) {
    it(`leaves ${name} clicks to the browser (new tab/window must not be swallowed)`, async () => {
      const ev = await click(links()[1], init);
      // Not intercepted: default stands, so the native href does what the user asked for. This is
      // the classic SPA-link bug — a directive that routes on ctrl-click steals the new tab.
      expect(ev.defaultPrevented).toBe(false);
      expect(router.url).toBe('/');
    });
  }

  it('ignores a target other than _self, mirroring RouterLink', async () => {
    const a = links()[1];
    a.target = '_blank';
    const ev = await click(a);
    expect(ev.defaultPrevented).toBe(false);
    expect(router.url).toBe('/');
  });

  it('leaves a url-less current crumb alone (nothing to navigate to)', () => {
    // The last crumb is aria-current and never a link, so it is not in links() at all — the
    // directive can never be handed a routeless destination from it.
    expect(links().length).toBe(2);
    expect(fixture.nativeElement.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe(
      'Q3',
    );
  });

  // Deliberately NOT titled "the subscription is torn down": the framework removes the anchor's
  // click listener and disables the OutputEmitterRef on destroy, so this passes with or without
  // the directive's own DestroyRef cleanup. It is a real regression guard on the BEHAVIOUR (a dead
  // trail must not navigate), not evidence about the teardown mechanism.
  it('a destroyed trail no longer navigates', async () => {
    const a = links()[1];
    fixture.destroy();
    const ev = await click(a);
    expect(ev.defaultPrevented).toBe(false);
    expect(router.url).toBe('/');
  });
});

@Component({
  imports: [CaeBreadcrumb, CaeBreadcrumbRouterLink],
  template: `
    <cae-breadcrumb caeBreadcrumbRouterLink [items]="items()" (itemSelect)="onSelect($event)" />
  `,
})
class VetoTrailHost {
  readonly items = signal<readonly CaeBreadcrumbItem[]>([
    { label: 'External', url: 'https://portal.example.com/reports' },
    { label: 'Relative', url: 'reports' },
    { label: 'Missing', url: '/nowhere' },
    { label: 'Reports', url: '/reports' },
    { label: 'Q3' },
  ]);
  veto = false;
  onSelect(e: CaeBreadcrumbSelectEvent): void {
    if (this.veto) e.originalEvent.preventDefault();
  }
}

describe('CaeBreadcrumbRouterLink — what it refuses to route (#333)', () => {
  let fixture: ComponentFixture<VetoTrailHost>;
  let router: Router;
  let handled: unknown[];

  beforeEach(async () => {
    handled = [];
    await TestBed.configureTestingModule({
      imports: [VetoTrailHost],
      providers: [
        provideRouter([{ path: 'reports', component: ReportsPage }]),
        { provide: ErrorHandler, useValue: { handleError: (e: unknown) => handled.push(e) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(VetoTrailHost);
    router = TestBed.inject(Router);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const links = (): HTMLAnchorElement[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a[href]'),
    );

  const click = async (el: Element): Promise<MouseEvent> => {
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    el.dispatchEvent(ev);
    fixture.detectChanges();
    await fixture.whenStable();
    return ev;
  };

  it('leaves an absolute external url to the browser (a breadcrumb points at ancestors)', async () => {
    // navigateByUrl would parse 'https://portal.example.com/reports' into segments matching no
    // route, killing a crumb that worked fine before the directive was applied.
    const ev = await click(links()[0]);
    expect(ev.defaultPrevented).toBe(false);
    expect(router.url).toBe('/');
  });

  it('leaves a document-relative url to the browser (href and router resolve it differently)', async () => {
    // href 'reports' resolves against the current directory; navigateByUrl('reports') resolves to
    // absolute '/reports'. Routing it would make left-click and ctrl-click go to different places.
    const ev = await click(links()[1]);
    expect(ev.defaultPrevented).toBe(false);
    expect(router.url).toBe('/');
  });

  it('routes a failed navigation to the ErrorHandler instead of an unhandled rejection', async () => {
    const ev = await click(links()[2]); // '/nowhere' matches no route
    expect(ev.defaultPrevented).toBe(true);
    // The rejection is CAUGHT. Without the .catch this surfaces as `Uncaught (in promise) NG04002`
    // — which, per this repo's own rule, is exactly what makes vitest exit non-zero while printing
    // an all-green test list.
    expect(handled.length).toBe(1);
    expect(String(handled[0])).toContain('NG04002');
  });

  it("honours a consumer's own preventDefault veto (the base component's documented hook)", async () => {
    fixture.componentInstance.veto = true;
    const ev = await click(links()[3]); // '/reports' — a route that WOULD match
    expect(ev.defaultPrevented).toBe(true); // by the consumer, not by us
    expect(router.url).toBe('/'); // …and we did not route over the veto
  });

  it('still routes that same crumb when the consumer does not veto (the veto test is not vacuous)', async () => {
    fixture.componentInstance.veto = false;
    await click(links()[3]);
    expect(router.url).toBe('/reports');
  });
});
