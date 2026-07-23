import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { CaeDataGrid } from 'caelum/grid';
import { TanStackGridAdapter } from 'caelum/grid-tanstack';

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

  it('exports the full set end-to-end on Export CSV click, announcing it in the live region', () => {
    const exportBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent!.includes('Export CSV'),
    ) as HTMLButtonElement;
    expect(exportBtn).toBeTruthy();
    const note = el.querySelector('.forge-grid-card__note') as HTMLElement;
    expect(note.getAttribute('role')).toBe('status');
    expect(note.textContent!.trim()).toBe(''); // empty until the first export

    // Stub the browser download primitives jsdom does not implement, so the handler runs end-to-end
    // (button -> grid.exportRows() -> blob -> anchor download -> note). Restored in finally.
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    const realClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = () => 'blob:stub';
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = () => {};
    try {
      exportBtn.click();
      fixture.detectChanges();
      fixture.detectChanges();
      expect(note.textContent).toContain('Exported 5000 rows');
    } finally {
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
      HTMLAnchorElement.prototype.click = realClick;
    }
  });
});
