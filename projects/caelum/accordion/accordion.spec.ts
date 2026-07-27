import { Component, QueryList, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatAccordion, MatExpansionPanelHeader } from '@angular/material/expansion';

import { CaeAccordion, CaeExpansionPanel } from './accordion';
import { expectNoA11yViolations } from '../testing/a11y';

// ---------------------------------------------------------------------------
// CaeExpansionPanel — a single collapsible panel, standalone (no accordion).
// ---------------------------------------------------------------------------
describe('CaeExpansionPanel', () => {
  let component: CaeExpansionPanel;
  let fixture: ComponentFixture<CaeExpansionPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeExpansionPanel] }).compileComponents();
    fixture = TestBed.createComponent(CaeExpansionPanel);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Section');
    await fixture.whenStable();
  });

  const header = (): HTMLElement =>
    fixture.nativeElement.querySelector('mat-expansion-panel-header');

  it('renders its title in the header', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('mat-panel-title')?.textContent).toContain(
      'Section',
    );
  });

  it('renders a description only when one is provided', async () => {
    expect(fixture.nativeElement.querySelector('mat-panel-description')).toBeNull();
    fixture.componentRef.setInput('description', 'more detail');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('mat-panel-description')?.textContent).toContain(
      'more detail',
    );
  });

  it('starts collapsed and opens when [expanded] is set', async () => {
    expect(header().getAttribute('aria-expanded')).toBe('false');
    fixture.componentRef.setInput('expanded', true);
    await fixture.whenStable();
    expect(header().getAttribute('aria-expanded')).toBe('true');
  });

  it('emits expandedChange and opened when the user toggles it open', async () => {
    let changed: boolean | undefined;
    let openedFired = false;
    component.expandedChange.subscribe((v) => (changed = v));
    component.opened.subscribe(() => (openedFired = true));
    header().click();
    await fixture.whenStable();
    expect(changed).toBe(true);
    expect(openedFired).toBe(true);
    expect(header().getAttribute('aria-expanded')).toBe('true');
  });

  it('emits closed when toggled shut', async () => {
    fixture.componentRef.setInput('expanded', true);
    await fixture.whenStable();
    let closedFired = false;
    component.closed.subscribe(() => (closedFired = true));
    header().click();
    await fixture.whenStable();
    expect(closedFired).toBe(true);
    expect(header().getAttribute('aria-expanded')).toBe('false');
  });

  it('announces and enforces the disabled state (no toggle)', async () => {
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    expect(header().getAttribute('aria-disabled')).toBe('true');
    header().click();
    await fixture.whenStable();
    expect(header().getAttribute('aria-expanded')).toBe('false');
  });

  it('hides the toggle indicator when hideToggle is set', async () => {
    expect(fixture.nativeElement.querySelector('.mat-expansion-indicator')).not.toBeNull();
    fixture.componentRef.setInput('hideToggle', true);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.mat-expansion-indicator')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CaeAccordion — coordination of projected panels (the DI-through-projection
// contract): single-expand by default, multi when opted in.
// ---------------------------------------------------------------------------
@Component({
  imports: [CaeAccordion, CaeExpansionPanel],
  template: `
    <cae-accordion [multiple]="multi()">
      <cae-expansion-panel title="One" [(expanded)]="p1">first body</cae-expansion-panel>
      <cae-expansion-panel title="Two" [(expanded)]="p2">second body</cae-expansion-panel>
    </cae-accordion>
  `,
})
class AccordionHost {
  readonly multi = signal(false);
  p1 = false;
  p2 = false;
}

describe('CaeAccordion', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AccordionHost] }).compileComponents();
  });

  const headers = (f: ComponentFixture<AccordionHost>): HTMLElement[] =>
    Array.from(f.nativeElement.querySelectorAll('mat-expansion-panel-header'));

  it('has no axe violations (two titled, collapsed panels)', async () => {
    const f = TestBed.createComponent(AccordionHost);
    await f.whenStable();
    await expectNoA11yViolations(f.nativeElement);
  });

  it('applies MatAccordion to its host and projects one panel per child', async () => {
    const f = TestBed.createComponent(AccordionHost);
    await f.whenStable();
    // The host directive is what makes projected panels a coordinated group.
    expect(f.nativeElement.querySelector('cae-accordion').classList).toContain('mat-accordion');
    expect(headers(f).length).toBe(2);
  });

  it('coordinates single-expand by default — opening one panel closes the other', async () => {
    const f = TestBed.createComponent(AccordionHost);
    await f.whenStable();
    headers(f)[0].click();
    await f.whenStable();
    expect(headers(f)[0].getAttribute('aria-expanded')).toBe('true');

    headers(f)[1].click();
    await f.whenStable();
    // Material's UniqueSelectionDispatcher auto-closed panel one; the auto-close fires
    // expandedChange, so the two-way-bound model tracked it with no reconciliation on our side.
    expect(headers(f)[1].getAttribute('aria-expanded')).toBe('true');
    expect(headers(f)[0].getAttribute('aria-expanded')).toBe('false');
    expect(f.componentInstance.p1).toBe(false);
    expect(f.componentInstance.p2).toBe(true);
  });

  it('keeps multiple panels open when [multiple] is set', async () => {
    const f = TestBed.createComponent(AccordionHost);
    f.componentInstance.multi.set(true);
    await f.whenStable();
    headers(f)[0].click();
    headers(f)[1].click();
    await f.whenStable();
    expect(headers(f)[0].getAttribute('aria-expanded')).toBe('true');
    expect(headers(f)[1].getAttribute('aria-expanded')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// CaeAccordion — the #759 roving mechanism: the accordion hands Material's
// FocusKeyManager the headers its own content query cannot see.
//
// The keyboard behaviour is pinned in accordion.browser.spec.ts, because jsdom
// cannot answer "where did focus go". What IS directly observable here is the
// item list the manager roves over — including the ownership filter, which no
// keyboard test can isolate cleanly, and the two D-623 guards on the reach.
// ---------------------------------------------------------------------------
@Component({
  imports: [CaeAccordion, CaeExpansionPanel],
  template: `
    <cae-accordion>
      <cae-expansion-panel title="One">
        <cae-accordion>
          <cae-expansion-panel title="Nested">nested body</cae-expansion-panel>
        </cae-accordion>
      </cae-expansion-panel>
      @if (showTwo()) {
        <!-- Wrapped in a plain element on purpose: a consumer grouping panels in a <div> must not
             lose roving for them, which is exactly what the contentChildren default would do. -->
        <div class="group">
          <cae-expansion-panel title="Two">second body</cae-expansion-panel>
        </div>
      }
    </cae-accordion>
  `,
})
class NestedAccordionHost {
  readonly showTwo = signal(false);
}

describe('CaeAccordion roving mechanism (#759)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [NestedAccordionHost] }).compileComponents();
  });

  /**
   * The internals both D-623 guards are about. Declared as a standalone shape rather than an
   * intersection with `MatAccordion`/`CaeAccordion`: TypeScript reduces `Public & { private… }` to
   * `never`, so an intersection would make every access below an error.
   */
  interface AccordionInternals {
    _ownHeaders?: QueryList<MatExpansionPanelHeader>;
    _keyManager?: { _items?: unknown };
  }

  /** The Nth `cae-accordion` in declaration order — [outer, inner] for the host above. */
  const debugAt = (f: ComponentFixture<NestedAccordionHost>, i: number) =>
    f.debugElement.queryAll(By.directive(CaeAccordion))[i];

  const accordionAt = (
    f: ComponentFixture<NestedAccordionHost>,
    i: number,
  ): { syncHeaders(): void } => debugAt(f, i).componentInstance;

  /** The `MatAccordion` host directive of a given `cae-accordion`. */
  const matOf = (f: ComponentFixture<NestedAccordionHost>, i: number): AccordionInternals =>
    debugAt(f, i).injector.get(MatAccordion) as unknown as AccordionInternals;

  /** Titles of the panels a given accordion's content query collected, before any filtering. */
  const panelTitles = (f: ComponentFixture<NestedAccordionHost>, i: number): string[] => {
    const collected = (
      debugAt(f, i).componentInstance as unknown as {
        panels: () => readonly CaeExpansionPanel[];
      }
    ).panels();
    return collected.map((p) => p.title());
  };

  /** Titles of the headers a given accordion's key manager will actually rove over. */
  const rovedTitles = (f: ComponentFixture<NestedAccordionHost>, i: number): string[] => {
    const titleByInstance = new Map<unknown, string>(
      f.debugElement
        .queryAll(By.directive(MatExpansionPanelHeader))
        .map((de) => [
          de.componentInstance,
          (de.nativeElement as HTMLElement).querySelector('mat-panel-title')?.textContent?.trim() ??
            '',
        ]),
    );
    return (matOf(f, i)._ownHeaders?.toArray() ?? []).map((h) => titleByInstance.get(h) ?? '?');
  };

  it('gives each accordion exactly its own headers — a nested one does not steal them', async () => {
    const f = TestBed.createComponent(NestedAccordionHost);
    await f.whenStable();

    // The premise first, because it is the half that can rot silently: the outer query really does
    // collect the nested accordion's panel. `descendants: true` is what makes that true — with the
    // default (`false`, measured) the outer collects only its direct children, the filter never
    // sees a foreign panel, and the assertion below would pass while proving nothing.
    expect(panelTitles(f, 0)).toEqual(['One', 'Nested']);

    // So the disjointness below is the ownership predicate's doing (`header.panel.accordion ===
    // this`, Material's own line), not an accident of query scope. Without it, ArrowDown in the
    // outer accordion would walk into the inner one's panels.
    expect(rovedTitles(f, 0)).toEqual(['One']);
    expect(rovedTitles(f, 1)).toEqual(['Nested']);
  });

  it('re-syncs when a panel appears, and keeps declaration order', async () => {
    const f = TestBed.createComponent(NestedAccordionHost);
    await f.whenStable();
    expect(rovedTitles(f, 0)).toEqual(['One']);

    f.componentInstance.showTwo.set(true);
    await f.whenStable();
    // Order is what makes ArrowDown mean "the next one down"; a panel added inside an `@if` must
    // land after "One", not appended to whatever the manager happened to hold.
    expect(rovedTitles(f, 0)).toEqual(['One', 'Two']);
  });

  it('pins the Material private the fix reaches into (D-623 guard 2)', async () => {
    const f = TestBed.createComponent(NestedAccordionHost);
    await f.whenStable();
    const mat = matOf(f, 0);

    // A rename OR a rewire has to fail here, loudly and in CI, rather than silently in a user's
    // keyboard: `_ownHeaders` must still be the QueryList we can reset, AND the key manager must
    // still be the thing reading it. Feeding a list nobody reads would be the quiet failure.
    expect(mat._ownHeaders).toBeInstanceOf(QueryList);
    expect(typeof mat._ownHeaders?.reset).toBe('function');
    expect(typeof mat._ownHeaders?.notifyOnChanges).toBe('function');
    expect(mat._keyManager?._items).toBe(mat._ownHeaders);
  });

  it('degrades to the pre-#759 behaviour if the private disappears (D-623 guard 1)', async () => {
    const f = TestBed.createComponent(NestedAccordionHost);
    await f.whenStable();
    const mat = matOf(f, 0);
    const outer = accordionAt(f, 0);

    const saved = mat._ownHeaders;
    delete mat._ownHeaders; // simulate a Material rename
    // No roving is APG-conformant; a TypeError out of a render hook is not. The guard must make the
    // feature absent, not the component broken.
    expect(() => outer.syncHeaders()).not.toThrow();

    mat._ownHeaders = saved; // restored by the INVERSE edit, so later specs see a live accordion
    expect(rovedTitles(f, 0)).toEqual(['One']);
  });
});
