import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { CaeDataGrid } from 'caelum/grid';
import { TanStackGridAdapter } from 'caelum/grid';

import { ActivityGridDemo } from './activity-grid-demo';

// The Forge-side isolation proof for #171: the demo swaps the grid engine to TanStack via ONE
// element-injector provider and changes nothing else. These assertions confirm the swap took (the
// grid's engine is TanStackGridAdapter) and that the unchanged component renders at realistic scale.
describe('ActivityGridDemo', () => {
  let fixture: ComponentFixture<ActivityGridDemo>;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ActivityGridDemo] });
    fixture = TestBed.createComponent(ActivityGridDemo);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    fixture.detectChanges();
  });

  it('drives the grid with the TanStack engine (provided locally, not the client default)', () => {
    const grid = fixture.debugElement.query(By.directive(CaeDataGrid))
      .componentInstance as unknown as { adapter: unknown };
    expect(grid.adapter).toBeInstanceOf(TanStackGridAdapter);
  });

  it('renders the grid at scale (5000 rows) behind the unchanged cae-data-grid', () => {
    const grid = el.querySelector('[role="table"]') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.getAttribute('aria-rowcount')).toBe('5001'); // 5000 rows + header
    expect(grid.getAttribute('aria-colcount')).toBe('5');
  });

  it('renders the five value-accessor columns in order, seq initially descending', () => {
    const headers = Array.from(el.querySelectorAll('[role="columnheader"]')).map((h) =>
      h.textContent!.replace(/[↕↑↓]/g, '').trim(),
    );
    expect(headers).toEqual(['#', 'Actor', 'Action', 'Status', 'When']);
    const seqHeader = Array.from(el.querySelectorAll('[role="columnheader"]')).find((h) =>
      h.textContent!.includes('#'),
    )!;
    expect(seqHeader.getAttribute('aria-sort')).toBe('descending');
  });

  it('exposes an Export CSV control wired to the grid (liveness handle)', () => {
    const exportBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent!.includes('Export CSV'),
    );
    expect(exportBtn).toBeTruthy();
    // The empty note live-region is present (announces the export result on click).
    const note = el.querySelector('.forge-grid-card__note') as HTMLElement;
    expect(note.getAttribute('role')).toBe('status');
  });
});
