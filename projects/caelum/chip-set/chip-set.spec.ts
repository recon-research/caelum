import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeChipSet, CaeChipRemoveEvent } from './chip-set';

@Component({
  imports: [CaeChipSet],
  template: `
    <cae-chip-set
      [items]="items()"
      [ariaLabel]="ariaLabel"
      [ariaLabelledby]="ariaLabelledby"
      (removed)="onRemoved($event)"
    />
  `,
})
class StringHost {
  items = signal<readonly string[]>(['alpha', 'beta', 'gamma']);
  ariaLabel = '';
  ariaLabelledby = '';
  events: CaeChipRemoveEvent<string>[] = [];
  onRemoved(e: CaeChipRemoveEvent<string>): void {
    this.events.push(e);
    this.items.update((list) => list.filter((t) => t !== e.item));
  }
}

interface Tag {
  id: number;
  name: string;
}

@Component({
  imports: [CaeChipSet],
  template: `
    <cae-chip-set
      [items]="items()"
      [label]="labelFn"
      [removeAriaLabel]="removeFn"
      (removed)="removed = removed + 1"
    />
  `,
})
class ObjectHost {
  items = signal<readonly Tag[]>([
    { id: 1, name: 'Design' },
    { id: 2, name: 'Frontend' },
  ]);
  labelFn = (t: Tag): string => t.name;
  removeFn = (t: Tag): string => `Delete tag ${t.name}`;
  removed = 0;
}

describe('CaeChipSet', () => {
  let el: HTMLElement;

  // Focus assertions (document.activeElement) need the host attached to the live document.
  afterEach(() => {
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  async function makeString(
    setup: (h: StringHost) => void = () => {},
  ): Promise<ComponentFixture<StringHost>> {
    await TestBed.configureTestingModule({ imports: [StringHost] }).compileComponents();
    const f = TestBed.createComponent(StringHost);
    setup(f.componentInstance);
    el = f.nativeElement as HTMLElement;
    document.body.appendChild(el);
    f.detectChanges();
    await f.whenStable();
    return f;
  }

  async function settle(f: ComponentFixture<unknown>): Promise<void> {
    f.detectChanges();
    await f.whenStable();
  }

  const grid = (f: ComponentFixture<unknown>): HTMLElement =>
    (f.nativeElement as HTMLElement).querySelector('mat-chip-grid') as HTMLElement;
  const rows = (f: ComponentFixture<unknown>): HTMLElement[] =>
    Array.from((f.nativeElement as HTMLElement).querySelectorAll('mat-chip-row'));
  const removeBtn = (row: HTMLElement): HTMLButtonElement | null => row.querySelector('button');

  it('renders one chip row per item, in order, with the labels', async () => {
    const f = await makeString();
    const r = rows(f);
    expect(r.length).toBe(3);
    expect(r.map((row) => row.textContent!.trim())).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('uses grid a11y semantics (role=grid / row / gridcell)', async () => {
    const f = await makeString();
    expect(grid(f).getAttribute('role')).toBe('grid');
    const r = rows(f);
    expect(r.every((row) => row.getAttribute('role') === 'row')).toBe(true);
    // Each row exposes gridcell descendants (the label + remove cells).
    expect(grid(f).querySelectorAll('[role="gridcell"]').length).toBeGreaterThanOrEqual(3);
  });

  it('drops the grid role when there are no chips (Material empty-set behaviour)', async () => {
    const f = await makeString((h) => h.items.set([]));
    expect(rows(f).length).toBe(0);
    expect(grid(f).getAttribute('role')).toBeNull();
  });

  it('is removable by default, naming each remove button "Remove <label>" (auto-distinct)', async () => {
    const f = await makeString();
    const r = rows(f);
    const labels = r.map((row) => removeBtn(row)!.getAttribute('aria-label'));
    expect(labels).toEqual(['Remove alpha', 'Remove beta', 'Remove gamma']);
    expect(r.every((row) => removeBtn(row)!.type === 'button')).toBe(true);
  });

  it('emits (removed) with the item + index when a × is clicked', async () => {
    const f = await makeString();
    removeBtn(rows(f)[1])!.click(); // remove 'beta'
    await settle(f);
    expect(f.componentInstance.events[0]).toEqual({ item: 'beta', index: 1 });
    // The consumer dropped it, so the chip unrenders — a live round-trip.
    expect(rows(f).map((row) => row.textContent!.trim())).toEqual(['alpha', 'gamma']);
  });

  it('removes on Enter on the remove button (keyboard operability)', async () => {
    const f = await makeString();
    const ev = new KeyboardEvent('keydown', { bubbles: true });
    Object.defineProperty(ev, 'keyCode', { get: () => 13 }); // ENTER — Material reads keyCode
    removeBtn(rows(f)[0])!.dispatchEvent(ev);
    await settle(f);
    expect(f.componentInstance.events[0]).toEqual({ item: 'alpha', index: 0 });
  });

  it('redirects focus to an adjacent chip when the focused chip is removed (the managed-set win)', async () => {
    // The reason cae-chip-set exists: a plain cae-chip drops focus to <body> on removal. Here, removing
    // the focused middle chip must land focus on a sibling chip, not <body>.
    const f = await makeString();
    const betaRemove = removeBtn(rows(f)[1])!;
    betaRemove.focus();
    expect(grid(f).contains(document.activeElement)).toBe(true); // focus is within the set
    betaRemove.click(); // remove 'beta' while it holds focus
    await settle(f);
    expect(rows(f).map((row) => row.textContent!.trim())).toEqual(['alpha', 'gamma']);
    // Focus stayed inside the set (redirected to a sibling chip), not stranded on <body>.
    expect(document.activeElement).not.toBe(document.body);
    expect(grid(f).contains(document.activeElement)).toBe(true);
  });

  it('does NOT manage focus when the LAST chip is removed (empty-set is the consumer contract, #202)', async () => {
    // Verified against Material 22: removing the final chip leaves no in-set target and MatChipGrid.focus()
    // no-ops (no chip input), so focus leaves the set. The docstring scopes the redirect to "a sibling
    // remains"; the empty case is the consumer's (the Forge demo moves focus to its status region).
    const f = await makeString((h) => h.items.set(['solo']));
    const soloRemove = removeBtn(rows(f)[0])!;
    soloRemove.focus();
    soloRemove.click();
    await settle(f);
    expect(rows(f).length).toBe(0);
    expect(grid(f).contains(document.activeElement)).toBe(false); // not retained in the emptied set
  });

  it('names the set via aria-label', async () => {
    const f = await makeString((h) => (h.ariaLabel = 'Workspace tags'));
    expect(grid(f).getAttribute('aria-label')).toBe('Workspace tags');
  });

  it('names the set via aria-labelledby (preferred when a visible label exists)', async () => {
    const f = await makeString((h) => (h.ariaLabelledby = 'tags-label'));
    expect(grid(f).getAttribute('aria-labelledby')).toBe('tags-label');
    expect(grid(f).hasAttribute('aria-label')).toBe(false);
  });

  it('supports object items via a [label] accessor + a [removeAriaLabel] override', async () => {
    await TestBed.configureTestingModule({ imports: [ObjectHost] }).compileComponents();
    const f = TestBed.createComponent(ObjectHost);
    el = f.nativeElement as HTMLElement;
    f.detectChanges();
    await f.whenStable();
    const r = rows(f);
    expect(r.map((row) => row.textContent!.trim())).toEqual(['Design', 'Frontend']);
    expect(removeBtn(r[0])!.getAttribute('aria-label')).toBe('Delete tag Design');
    removeBtn(r[1])!.click();
    await settle(f);
    expect(f.componentInstance.removed).toBe(1);
  });

  it('throws a clear cae-chip-set error on duplicate items (dev config guard, preempts NG0955)', async () => {
    await TestBed.configureTestingModule({ imports: [StringHost] }).compileComponents();
    const f = TestBed.createComponent(StringHost);
    f.componentInstance.items.set(['dup', 'dup']);
    el = f.nativeElement as HTMLElement;
    expect(() => f.detectChanges()).toThrowError(/cae-chip-set: \[items\] has duplicate value/);
  });

  it('dev-warns when an object item has no [label] (would render "[object Object]")', async () => {
    @Component({ imports: [CaeChipSet], template: `<cae-chip-set [items]="items" />` })
    class NoLabelHost {
      items = [{ id: 1 }, { id: 2 }]; // distinct refs (unique), but no [label] -> String() = [object Object]
    }
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (m?: unknown) => warnings.push(String(m));
    try {
      await TestBed.configureTestingModule({ imports: [NoLabelHost] }).compileComponents();
      const f = TestBed.createComponent(NoLabelHost);
      el = f.nativeElement as HTMLElement;
      f.detectChanges();
      expect(warnings.some((w) => w.includes('[object Object]'))).toBe(true);
    } finally {
      console.warn = realWarn;
    }
  });
});
