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

/** Pump a fixed number of macrotasks + CD passes — for fetches whose outcome is not an aria-rowcount change. */
async function pump(fixture: { detectChanges(): void }, times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
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

  it('rows-per-page menu: choosing a larger size re-fetches a bigger page (#177 dogfood)', async () => {
    const fixture = TestBed.createComponent(OrdersGridDemo);
    await settle(fixture); // initial page settles → loading cleared, so the menu is live (not snapped-back)
    const el = fixture.nativeElement as HTMLElement;
    const cmp = fixture.componentInstance as unknown as {
      pageRows(): readonly { id: number }[];
      fetchCount(): number;
    };
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('1-25 of 4800');
    const fetchesBefore = cmp.fetchCount();

    const select = el.querySelector<HTMLSelectElement>('.cae-data-grid__page-size-select')!;
    select.value = '50';
    select.dispatchEvent(new Event('change'));
    await pump(fixture, 10);

    // A fresh 50-row slice — the full port round-trip driven purely by the rows-per-page menu (no
    // consumer wiring beyond [pageSizeOptions]); the reset-to-page-0 on a size change is unit-tested in
    // data-grid.spec.ts.
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('1-50 of 4800');
    expect(cmp.pageRows().length).toBe(50);
    expect(cmp.pageRows()[0].id).toBe(1000);
    expect(cmp.fetchCount()).toBe(fetchesBefore + 1);
  });

  // ---- Loading / error state (#188) ----

  it('drives the grid [loading] state true during the initial fetch and clears it once settled', async () => {
    const fixture = TestBed.createComponent(OrdersGridDemo);
    const cmp = fixture.componentInstance as unknown as { loading(): boolean };
    fixture.detectChanges(); // mount + emit the initial dataRequest
    expect(cmp.loading()).toBe(true); // a fetch is in flight (also the starting state)
    await settle(fixture);
    expect(cmp.loading()).toBe(false); // .finally cleared it after the page arrived
  });

  it('surfaces a fetch failure without blanking the page, clears loading, and recovers on retry', async () => {
    const fixture = TestBed.createComponent(OrdersGridDemo);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const cmp = fixture.componentInstance as unknown as {
      loading(): boolean;
      fetchError(): string | null;
      pageRows(): readonly { id: number }[];
      fetchCount(): number;
      simulateFailure(): void;
      retry(): void;
    };
    const loadedRows = cmp.pageRows().length;
    const fetchesBefore = cmp.fetchCount();
    expect(cmp.fetchError()).toBeNull();

    cmp.simulateFailure();
    await pump(fixture);
    // The failed fetch surfaced an error banner, cleared loading via .finally (not stranded), and left
    // the previously loaded page in place beneath the banner (a failed refresh does not blank the table).
    expect(cmp.fetchError()).not.toBeNull();
    expect(cmp.loading()).toBe(false);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not load');
    expect(cmp.pageRows().length).toBe(loadedRows);
    expect(cmp.fetchCount()).toBe(fetchesBefore); // a failed fetch does not count as served

    cmp.retry();
    await pump(fixture);
    // Retry clears the error, re-fetches the slice, and settles loading.
    expect(cmp.fetchError()).toBeNull();
    expect(cmp.loading()).toBe(false);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(cmp.fetchCount()).toBe(fetchesBefore + 1); // the successful retry served a page
  });
});
