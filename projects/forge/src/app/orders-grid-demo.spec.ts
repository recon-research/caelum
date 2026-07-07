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

  // ---- Retry-banner focus management (#194) ----
  // A successful retry clears the error banner, destroying the Retry button. If it held focus, focus
  // must move to the persistent Simulate button — never dropped to <body> (the #189 pattern, consumer-
  // owned per #192). document.activeElement requires the fixture attached to the live document.

  const toolbarBtn = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>('.forge-orders-card__toolbar button')!;
  const retryInnerBtn = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>('.forge-orders-card__error button');

  it('rescues focus off the destroyed Retry button to the Simulate button on a successful retry', async () => {
    const fixture = TestBed.createComponent(OrdersGridDemo);
    const el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    try {
      await settle(fixture);
      (fixture.componentInstance as unknown as { simulateFailure(): void }).simulateFailure();
      await pump(fixture);
      const retryBtn = retryInnerBtn(el)!;
      expect(retryBtn).toBeTruthy(); // the banner is showing
      retryBtn.focus(); // Retry holds focus (a keyboard user)
      expect(document.activeElement).toBe(retryBtn);
      retryBtn.click(); // retry -> banner cleared -> Retry destroyed
      await pump(fixture);
      expect(el.querySelector('[role="alert"]')).toBeNull(); // banner gone
      expect(document.activeElement).toBe(toolbarBtn(el)); // focus rescued, not dropped to <body>
    } finally {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  });

  it('does not steal focus when the Retry button did not hold it (programmatic retry)', async () => {
    // Safari/Firefox do not focus a clicked <button>, and a programmatic retry never does — moving focus
    // then would be an unexpected change (WCAG 3.2.x). Focus a DIFFERENT element than the rescue target
    // (a grid sort header, not the Simulate button) so a wrongful steal to Simulate is observable: the
    // rescue must leave this focus untouched. (Removing both no-steal gates moves focus -> Simulate here.)
    const fixture = TestBed.createComponent(OrdersGridDemo);
    const el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    try {
      await settle(fixture);
      const cmp = fixture.componentInstance as unknown as {
        simulateFailure(): void;
        retry(): void;
      };
      cmp.simulateFailure();
      await pump(fixture);
      const sortHeader = el.querySelector<HTMLButtonElement>('.cae-data-grid__sort')!;
      expect(sortHeader).toBeTruthy();
      sortHeader.focus(); // focus on a real control OUTSIDE the retry button and != the rescue target
      expect(document.activeElement).toBe(sortHeader);
      cmp.retry(); // programmatic — Retry never held focus
      await pump(fixture);
      expect(document.activeElement).toBe(sortHeader); // focus left untouched (no steal to Simulate)
    } finally {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  });

  it('keeps the Simulate button focusable (aria-disabled, not native-disabled) while loading', () => {
    // The retry focus-rescue targets the Simulate button — which is disabled while loading. If it were
    // NATIVE-disabled it would be unfocusable, and a rescue during a still-in-flight fetch (a slow/real
    // network, where loading is still true when the focus move fires) would drop focus to <body>.
    // disabledInteractive keeps it aria-disabled but focusable — a valid rescue target. Removing
    // disabledInteractive puts the native `disabled` attribute back and fails this.
    const fixture = TestBed.createComponent(OrdersGridDemo);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges(); // mount: loading starts true (the initial fetch is in flight)
    expect((fixture.componentInstance as unknown as { loading(): boolean }).loading()).toBe(true);
    const simulateBtn = toolbarBtn(el);
    expect(simulateBtn.hasAttribute('disabled')).toBe(false); // not native-disabled -> focusable
    expect(simulateBtn.getAttribute('aria-disabled')).toBe('true'); // aria-disabled instead
  });
});
