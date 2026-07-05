import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeDataGrid } from './data-grid';
import { CAE_GRID } from './grid-adapter';
import { ClientGridAdapter } from './client-grid-adapter';
import { CaeColumn, CaeSort } from './grid-types';

// A plain typed interface (no index signature) — the grid generic is unconstrained (like cae-table).
interface Person {
  name: string;
  age: number;
  role: string;
}

const COLUMNS: CaeColumn<Person>[] = [
  { id: 'name', header: 'Name', value: (r) => r.name, sortable: true },
  { id: 'age', header: 'Age', value: (r) => r.age, sortable: true, align: 'end' },
  { id: 'role', header: 'Role', value: (r) => r.role }, // not sortable
];

const PEOPLE: Person[] = [
  { name: 'Bob', age: 30, role: 'Lead' },
  { name: 'Ann', age: 20, role: 'Eng' },
  { name: 'Cy', age: 25, role: 'Eng' },
];

/** Records sortBy calls, to prove the component drives whatever engine CAE_GRID hands it. */
class RecordingAdapter<T> extends ClientGridAdapter<T> {
  readonly sortCalls: (CaeSort | null)[] = [];
  override sortBy(sort: CaeSort | null): void {
    this.sortCalls.push(sort);
    super.sortBy(sort);
  }
}

// NOTE (test scope): the body rows are rendered by cdk-virtual-scroll, which measures its viewport
// via getBoundingClientRect — 0 in jsdom, so it renders no rows here. The DATA that would populate
// them is proven exhaustively in client-grid-adapter.spec.ts; the component's rendering + recycling
// of those rows at scale is an M4 real-browser verify follow-up. These specs assert the jsdom-stable
// wiring: header, sort, pager (via the adapter-derived range/disabled state), aria, empty, and the
// engine-swap isolation — none of which depend on rendered body rows.
describe('CaeDataGrid', () => {
  let fixture: ComponentFixture<CaeDataGrid<Person>>;
  let ref: ComponentRef<CaeDataGrid<Person>>;
  let el: HTMLElement;

  function setup(inputs: Record<string, unknown> = {}, providers: unknown[] = []): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CaeDataGrid],
      providers: providers as never[],
    });
    fixture = TestBed.createComponent(CaeDataGrid<Person>);
    ref = fixture.componentRef;
    ref.setInput('columns', COLUMNS);
    ref.setInput('data', PEOPLE);
    for (const [k, v] of Object.entries(inputs)) ref.setInput(k, v);
    el = fixture.nativeElement as HTMLElement;
    flush();
  }

  // Two CD passes: the first creates the view, the second lets the wiring effects settle (zoneless).
  function flush(): void {
    fixture.detectChanges();
    fixture.detectChanges();
  }

  const grid = () => el.querySelector('[role="grid"]') as HTMLElement;
  const headerCells = () => Array.from(el.querySelectorAll('[role="columnheader"]'));
  const headerByText = (text: string) => headerCells().find((h) => h.textContent!.includes(text))!;
  const sortButtons = () =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('.cae-data-grid__sort'));
  const pageBtn = (label: string) =>
    el.querySelector<HTMLButtonElement>(`.cae-data-grid__page-btn[aria-label="${label}"]`);

  it('renders a role=grid with aria-rowcount (incl. header) + aria-colcount', () => {
    setup();
    const g = grid();
    expect(g).not.toBeNull();
    expect(g.getAttribute('aria-rowcount')).toBe('4'); // 3 rows + header
    expect(g.getAttribute('aria-colcount')).toBe('3');
  });

  it('renders one columnheader per column, in order, with header text', () => {
    setup();
    const text = headerCells().map((h) => h.textContent!.replace(/[↕↑↓]/g, '').trim());
    expect(text).toEqual(['Name', 'Age', 'Role']);
  });

  it('makes only sortable columns a sort button carrying aria-sort', () => {
    setup();
    expect(sortButtons().length).toBe(2); // name + age; role is not sortable
    const withSort = headerCells().filter((h) => h.hasAttribute('aria-sort'));
    expect(withSort.length).toBe(2);
    expect(withSort.every((h) => h.getAttribute('aria-sort') === 'none')).toBe(true);
    expect(headerByText('Role').hasAttribute('aria-sort')).toBe(false);
  });

  it('cycles a sortable header three-state (none -> asc -> desc -> none) and emits sortChange', () => {
    const emitted: (CaeSort | null)[] = [];
    setup();
    ref.instance.sortChange.subscribe((s) => emitted.push(s));
    const nameBtn = () => headerByText('Name').querySelector('button') as HTMLButtonElement;

    nameBtn().click();
    flush();
    expect(headerByText('Name').getAttribute('aria-sort')).toBe('ascending');

    nameBtn().click();
    flush();
    expect(headerByText('Name').getAttribute('aria-sort')).toBe('descending');

    nameBtn().click();
    flush();
    expect(headerByText('Name').getAttribute('aria-sort')).toBe('none');

    expect(emitted).toEqual([
      { columnId: 'name', dir: 'asc' },
      { columnId: 'name', dir: 'desc' },
      null,
    ]);
  });

  it('reflects the initial sort (sortActive + sortDirection) on the header aria-sort', () => {
    setup({ sortActive: 'age', sortDirection: 'asc' });
    expect(headerByText('Age').getAttribute('aria-sort')).toBe('ascending');
    expect(headerByText('Name').getAttribute('aria-sort')).toBe('none');
  });

  it('shows no pager by default', () => {
    setup();
    expect(el.querySelector('.cae-data-grid__pager')).toBeNull();
  });

  it('wires the pager from adapter state when [paginated] (range + disabled + advance)', () => {
    setup({ paginated: true, pageSize: 2 });
    expect(el.querySelector('.cae-data-grid__pager')).not.toBeNull();
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('1-2 of 3');
    // Prev disabled on the first page, Next enabled (3 rows over pages of 2).
    expect(pageBtn('Previous page')?.disabled).toBe(true);
    expect(pageBtn('Next page')?.disabled).toBe(false);

    pageBtn('Next page')!.click();
    flush();
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('3-3 of 3');
    expect(pageBtn('Next page')?.disabled).toBe(true);
    expect(pageBtn('Previous page')?.disabled).toBe(false);
  });

  it('announces the empty state in a persistent role=status live region', () => {
    setup({ data: [], emptyMessage: 'Nobody here.' });
    const region = el.querySelector('.cae-data-grid__empty') as HTMLElement;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent!.trim()).toBe('Nobody here.');
    expect(grid().getAttribute('aria-rowcount')).toBe('1'); // header only
  });

  it('keeps the empty region mounted-but-empty while rows are present (announced transition)', () => {
    setup();
    const region = () => el.querySelector('.cae-data-grid__empty') as HTMLElement;
    const first = region();
    expect(first.textContent!.trim()).toBe('');
    ref.setInput('data', []);
    flush();
    expect(region()).toBe(first); // same element gains text
    expect(region().textContent!.trim()).toBe('No data.');
  });

  it('uses a visible caption and suppresses aria-label when both are set', () => {
    setup({ caption: 'Team roster', ariaLabel: 'People' });
    expect(el.querySelector('.cae-data-grid__caption')?.textContent!.trim()).toBe('Team roster');
    expect(grid().hasAttribute('aria-label')).toBe(false);
  });

  it('sets aria-label when there is no caption, and omits it otherwise', () => {
    setup({ ariaLabel: 'People' });
    expect(grid().getAttribute('aria-label')).toBe('People');
    setup();
    expect(grid().hasAttribute('aria-label')).toBe(false);
  });

  it('reacts to a data change, updating the aria-rowcount', () => {
    setup();
    expect(grid().getAttribute('aria-rowcount')).toBe('4');
    ref.setInput('data', [{ name: 'Solo', age: 1, role: 'X' }]);
    flush();
    expect(grid().getAttribute('aria-rowcount')).toBe('2'); // 1 row + header
  });

  it('drives a swapped-in engine through the CAE_GRID token (adapter isolation proof)', () => {
    setup({}, [{ provide: CAE_GRID, useValue: <T>() => new RecordingAdapter<T>() }]);
    const adapter = (fixture.componentInstance as unknown as { adapter: RecordingAdapter<Person> })
      .adapter;
    expect(adapter).toBeInstanceOf(RecordingAdapter);
    // Clicking a header goes through the injected engine, not the built-in default.
    const nameBtn = headerByText('Name').querySelector('button') as HTMLButtonElement;
    nameBtn.click();
    flush();
    expect(adapter.sortCalls).toEqual([{ columnId: 'name', dir: 'asc' }]);
  });
});
