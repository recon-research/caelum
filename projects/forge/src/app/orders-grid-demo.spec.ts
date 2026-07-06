import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ServerGridAdapter, CaeDataGrid } from 'caelum/grid';

import { OrdersGridDemo } from './orders-grid-demo';

/** Flush the Promise-backed "server" fetch: pump macrotasks + CD until the grid reports a total. */
async function settle(fixture: { detectChanges(): void; nativeElement: unknown }): Promise<void> {
  const el = fixture.nativeElement as HTMLElement;
  const rowcount = () =>
    (el.querySelector('[role="table"]') as HTMLElement)?.getAttribute('aria-rowcount');
  fixture.detectChanges();
  for (let i = 0; i < 12 && (rowcount() === null || rowcount() === '1'); i++) {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }
}

describe('OrdersGridDemo (#176 server-side grid)', () => {
  it('runs cae-data-grid on the ServerGridAdapter engine (element-injector provider)', () => {
    const fixture = TestBed.createComponent(OrdersGridDemo);
    fixture.detectChanges();
    const gridCmp = fixture.debugElement.query(By.directive(CaeDataGrid))
      .componentInstance as unknown as { adapter: unknown };
    expect(gridCmp.adapter).toBeInstanceOf(ServerGridAdapter);
  });

  it('fetches the first page on init and reports the SERVER total, not the page size', async () => {
    const fixture = TestBed.createComponent(OrdersGridDemo);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const grid = el.querySelector('[role="table"]') as HTMLElement;
    // The server has 4800 rows; only a 25-row page is in the browser, yet aria-rowcount is the total.
    expect(grid.getAttribute('aria-rowcount')).toBe('4801');
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('1-25 of 4800');
    // The demo's own state confirms exactly one page fetch happened.
    const cmp = fixture.componentInstance as unknown as {
      fetchCount(): number;
      pageRows(): readonly { id: number }[];
      pageTotal(): number;
    };
    expect(cmp.fetchCount()).toBe(1);
    expect(cmp.pageTotal()).toBe(4800);
    // Sorted by id asc (the seeded initial sort): first page is ids 1000..1024.
    expect(cmp.pageRows()[0].id).toBe(1000);
    expect(cmp.pageRows().length).toBe(25);
  });

  it('fetches a fresh slice when the pager advances (a new dataRequest → a new page)', async () => {
    const fixture = TestBed.createComponent(OrdersGridDemo);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const next = el.querySelector<HTMLButtonElement>(
      '.cae-data-grid__page-btn[aria-label="Next page"]',
    )!;
    next.click();
    await settle(fixture);
    const cmp = fixture.componentInstance as unknown as {
      fetchCount(): number;
      pageRows(): readonly { id: number }[];
    };
    expect(cmp.fetchCount()).toBe(2); // a second server fetch
    expect(cmp.pageRows()[0].id).toBe(1025); // page 1: ids 1025..1049
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('26-50 of 4800');
  });
});
