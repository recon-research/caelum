import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { CaeButton } from 'caelum/button';
import { CaeCard } from 'caelum/card';
// The SAME neutral grid surface the client + TanStack demos use. `provideServerGrid`/
// `serverGridAdapterFactory`/`CAE_GRID` select the SERVER engine (#176) with no markup change — the
// third engine behind the one port. `CaeGridDataRequest` is the vendor-free lazy-load descriptor.
import {
  CaeDataGrid,
  CAE_GRID,
  serverGridAdapterFactory,
  type CaeColumn,
  type CaeGridDataRequest,
} from 'caelum/grid';

/** A row of the "Orders" server-side demo — a plain typed model (the grid generic is unconstrained). */
interface Order {
  id: number;
  customer: string;
  product: string;
  amount: number;
  status: string;
}

/** How many rows live on the "server" — the grid never loads more than one page of these at a time. */
const ORDER_ROWS = 4800;

const ORDER_COLUMNS: readonly CaeColumn<Order>[] = [
  { id: 'id', header: 'Order', value: (o) => o.id, sortable: true, align: 'end', width: '6rem' },
  { id: 'customer', header: 'Customer', value: (o) => o.customer, sortable: true },
  { id: 'product', header: 'Product', value: (o) => o.product, sortable: true },
  {
    id: 'amount',
    header: 'Amount',
    value: (o) => o.amount,
    sortable: true,
    align: 'end',
    width: '8rem',
  },
  { id: 'status', header: 'Status', value: (o) => o.status, sortable: true, width: '8rem' },
];

/**
 * Deterministically build the full server-side dataset. No Math.random / Date.now (both would break
 * OnPush determinism + the reproducible build); every field cycles through fixed pools so the set is
 * stable. Stands in for a database the browser never fully loads.
 */
function buildOrders(count: number): readonly Order[] {
  const customers = [
    'Acme Corp',
    'Globex',
    'Initech',
    'Umbrella',
    'Hooli',
    'Stark Industries',
    'Wayne Ent.',
    'Cyberdyne',
  ];
  const products = ['Widget Pro', 'Gadget X', 'Sprocket', 'Cog Kit', 'Assembly A', 'Module B'];
  const statuses = ['paid', 'paid', 'pending', 'refunded', 'paid'];
  const rows: Order[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      id: 1000 + i,
      customer: customers[i % customers.length],
      product: products[i % products.length],
      amount: 50 + ((i * 37) % 950),
      status: statuses[i % statuses.length],
    });
  }
  return rows;
}

/** The full dataset — lives outside the component, standing in for a remote source. */
const ALL_ORDERS = buildOrders(ORDER_ROWS);

/**
 * Neutral comparator the fake server sorts by. Deliberately mirrors the library's own collation
 * (numbers numerically, strings by locale) so this server-sorted order matches what the client engine
 * would produce — the demo is the sort authority in server mode, and this keeps the three engines
 * visibly consistent.
 */
function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

/**
 * The "server" — sorts + slices the in-memory dataset to satisfy one {@link CaeGridDataRequest} and
 * returns only that page. A `Promise` stands in for the network round-trip (in a real app this is an
 * `HttpClient` call to a paginated API); it resolves deterministically so the demo + its spec are
 * stable. This is exactly the work a backend does — the browser only ever receives one page. Pass
 * `shouldFail` to reject the round-trip, exercising the demo's fetch-error state (#188).
 */
function queryOrders(
  req: CaeGridDataRequest,
  shouldFail = false,
): Promise<{ rows: readonly Order[]; total: number }> {
  if (shouldFail) return Promise.reject(new Error('simulated server error'));
  let all: readonly Order[] = ALL_ORDERS;
  if (req.sort) {
    const col = ORDER_COLUMNS.find((c) => c.id === req.sort!.columnId);
    if (col) {
      const factor = req.sort.dir === 'asc' ? 1 : -1;
      all = [...all].sort((a, b) => compareValues(col.value(a), col.value(b)) * factor);
    }
  }
  const rows =
    req.pageSize > 0
      ? all.slice(req.page * req.pageSize, req.page * req.pageSize + req.pageSize)
      : all;
  return Promise.resolve({ rows, total: ALL_ORDERS.length });
}

/**
 * The deferred "Orders (server-side)" `cae-data-grid` demo, running on the **{@link ServerGridAdapter}**
 * engine (#176 — the M2 grid server seam). It is the same neutral component the client-default (#170)
 * and TanStack (#171) demos use; the only difference is the element-injector provider below, which
 * swaps `CAE_GRID` to the server factory — a third engine behind the identical port, no markup change.
 *
 * Lazy-data flow (Book 13 §3.4): the grid emits `(dataRequest)` on mount + every sort/page change;
 * {@link onDataRequest} fetches that page from the simulated server and pushes it back by updating
 * `[data]` (the page) + `[total]` (the server count). The grid holds **one page** — never all
 * {@link ORDER_ROWS} rows — which is the whole point of the server seam.
 */
@Component({
  selector: 'app-orders-grid-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeButton, CaeCard, CaeDataGrid],
  providers: [{ provide: CAE_GRID, useValue: serverGridAdapterFactory }],
  templateUrl: './orders-grid-demo.html',
  styleUrl: './orders-grid-demo.scss',
})
export class OrdersGridDemo {
  protected readonly orderColumns = ORDER_COLUMNS;

  /** The current page returned by the server — bound to the grid's `[data]`. */
  protected readonly pageRows = signal<readonly Order[]>([]);
  /** The server's full row count — bound to the grid's `[total]` (drives the pager + aria-rowcount). */
  protected readonly pageTotal = signal(0);
  /** How many page fetches the server has served — proves the grid is genuinely lazy, not client-side. */
  protected readonly fetchCount = signal(0);

  /**
   * Whether a page fetch is in flight — bound to the grid's `[loading]` (#188). The consumer owns this
   * because it owns the async fetch; the grid can't know a request is outstanding. Starts **true** (the
   * grid fetches its first page on mount, so the very first render already reads as *loading*, not the
   * empty "0 rows" state). Set true when a fetch starts, cleared in the `.finally` of {@link onDataRequest}
   * so a *failed* fetch never strands the grid loading.
   */
  protected readonly loading = signal(true);
  /** A failed-fetch message (null = no error) — shown in a `role="alert"` banner with a Retry. */
  protected readonly fetchError = signal<string | null>(null);
  /** The last request the grid emitted — lets Retry / Simulate-failure re-issue the current slice. */
  private readonly lastRequest = signal<CaeGridDataRequest | null>(null);
  /** When true, the next fetch rejects — the "Simulate fetch failure" button flips it (demo only). */
  private readonly failNext = signal(false);

  /**
   * A stable one-line description of the server-side nature (empty until the first fetch settles). Keyed
   * on {@link pageTotal} (constant after the first load) rather than the per-fetch count, so this
   * `role="status"` region is NOT re-announced on every page/sort change — the pager's own live region
   * already announces the range, and two live regions repeating on each page turn is noise.
   */
  protected readonly serverNote = computed(() =>
    this.pageTotal() ? `${this.pageTotal()} orders on the server — one page loaded at a time.` : '',
  );

  /**
   * Handle a grid data request: fetch the matching page from the simulated server and push it back.
   * Binding the result into `[data]`/`[total]` is how a slice reaches the grid — the consumer never
   * touches the adapter (the neutral half of the lazy seam). The signal writes land in the async
   * `.then` callback (a real `HttpClient` call is likewise async), so they never run synchronously
   * inside the grid's emit-during-change-detection — the correct, faithful shape for a fetch.
   *
   * The loading/error lifecycle (#188): flip {@link loading} on before the fetch and clear it in a
   * `.finally` — so it clears on **success or failure**, never stranding the grid loading; a `.catch`
   * surfaces the error in a banner. The currently loaded rows stay visible beneath the banner (a failed
   * re-fetch of the *current* page does not blank the table); note the pager range still reflects the
   * target page after a failed page *change* — rolling the grid page back on failure is a seam-robustness
   * followup (#190).
   */
  protected onDataRequest(req: CaeGridDataRequest): void {
    this.lastRequest.set(req);
    this.loading.set(true);
    this.fetchError.set(null);
    const shouldFail = this.failNext();
    this.failNext.set(false);
    queryOrders(req, shouldFail)
      .then((result) => {
        this.pageRows.set(result.rows);
        this.pageTotal.set(result.total);
        this.fetchCount.update((n) => n + 1);
      })
      .catch(() => this.fetchError.set('Could not load orders. Check your connection and retry.'))
      .finally(() => this.loading.set(false));
  }

  /** Re-issue the last request (the Retry button on the error banner). */
  protected retry(): void {
    const req = this.lastRequest();
    if (req) this.onDataRequest(req);
  }

  /** Force the next fetch to fail, then re-issue the current slice — demonstrates the error state. */
  protected simulateFailure(): void {
    this.failNext.set(true);
    this.retry();
  }
}
