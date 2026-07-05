import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeTable, CaeTableColumn } from './table';

// A plain typed interface (no index signature) — cae-table's generic is unconstrained, so an
// ordinary row model type works without `extends Record<string, unknown>` (#141).
interface Person {
  name: string;
  age: number | null;
  role: string;
}

const COLUMNS: CaeTableColumn[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'age', header: 'Age', sortable: true },
  { key: 'role', header: 'Role' }, // not sortable
];

const PEOPLE: Person[] = [
  { name: 'Bob', age: 30, role: 'Lead' },
  { name: 'Ann', age: 20, role: 'Eng' },
  { name: 'Cy', age: 25, role: 'Eng' },
];

describe('CaeTable', () => {
  let fixture: ComponentFixture<CaeTable<Person>>;
  let ref: ComponentRef<CaeTable<Person>>;
  let el: HTMLElement;

  function setup(inputs: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(CaeTable<Person>);
    ref = fixture.componentRef;
    ref.setInput('columns', COLUMNS);
    ref.setInput('data', PEOPLE);
    for (const [k, v] of Object.entries(inputs)) ref.setInput(k, v);
    el = fixture.nativeElement as HTMLElement;
    flush();
  }

  // Two CD passes: the first creates the view (resolving the MatSort/MatPaginator viewChildren),
  // the second lets the wiring effects re-run against them (zoneless — effects flush on detect).
  function flush(): void {
    fixture.detectChanges();
    fixture.detectChanges();
  }

  const headerCells = () => Array.from(el.querySelectorAll('th[mat-header-cell]'));
  const dataRows = () => Array.from(el.querySelectorAll('tr[mat-row]'));
  const cellText = (row: Element) =>
    Array.from(row.querySelectorAll('td[mat-cell]')).map((c) => c.textContent!.trim());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeTable] }).compileComponents();
  });

  it('renders one header cell per column, in config order, with the header text', () => {
    setup();
    expect(headerCells().map((h) => h.textContent!.trim())).toEqual(['Name', 'Age', 'Role']);
  });

  it('renders one row per datum with each column cell read off the row by key', () => {
    setup();
    const rows = dataRows();
    expect(rows.length).toBe(3);
    expect(cellText(rows[0])).toEqual(['Bob', '30', 'Lead']);
  });

  it('renders a null/undefined cell value as an empty cell, not the string "null"', () => {
    setup({ data: [{ name: 'Nil', age: null, role: 'Eng' }] });
    expect(cellText(dataRows()[0])).toEqual(['Nil', '', 'Eng']);
  });

  it('makes only the sortable columns mat-sort-header (keyboard-operable, aria-sort)', () => {
    setup();
    const sortable = headerCells().filter((h) => h.hasAttribute('mat-sort-header'));
    expect(sortable.map((h) => h.textContent!.trim())).toEqual(['Name', 'Age']);
  });

  it('applies the initial sort (sortActive + sortDirection) to the rendered rows', () => {
    setup({ sortActive: 'age', sortDirection: 'asc' });
    // ascending by age → Ann (20), Cy (25), Bob (30)
    expect(dataRows().map((r) => cellText(r)[0])).toEqual(['Ann', 'Cy', 'Bob']);
  });

  it('sorts when a sort header is activated (the MatSort → data-source wiring)', () => {
    setup();
    const ageHeader = headerCells().find((h) => h.textContent!.trim() === 'Age') as HTMLElement;
    ageHeader.click(); // first click → ascending
    flush();
    expect(dataRows().map((r) => cellText(r)[0])).toEqual(['Ann', 'Cy', 'Bob']);
  });

  it('renders no paginator by default and shows every row', () => {
    setup();
    expect(el.querySelector('mat-paginator')).toBeNull();
    expect(dataRows().length).toBe(3);
  });

  it('paginates client-side when [paginated], limiting rows to the page size', () => {
    setup({ paginated: true, pageSize: 2 });
    expect(el.querySelector('mat-paginator')).not.toBeNull();
    expect(dataRows().length).toBe(2);
  });

  it('shows the empty message (and no data rows) when data is empty', () => {
    setup({ data: [], emptyMessage: 'Nobody here.' });
    expect(dataRows().length).toBe(0);
    expect(el.querySelector('.cae-table__empty')?.textContent!.trim()).toBe('Nobody here.');
  });

  it('hides the empty message when there is data', () => {
    setup();
    expect(el.querySelector('.cae-table__empty')).toBeNull();
  });

  it('renders a visible <caption> as the table accessible name', () => {
    setup({ caption: 'Team roster' });
    const caption = el.querySelector('table > caption');
    expect(caption?.textContent!.trim()).toBe('Team roster');
  });

  it('sets aria-label on the table when given, and omits the attribute otherwise', () => {
    setup({ ariaLabel: 'People' });
    expect(el.querySelector('table')?.getAttribute('aria-label')).toBe('People');
    setup();
    expect(el.querySelector('table')?.hasAttribute('aria-label')).toBe(false);
  });

  it('reacts to a data change, re-rendering the rows', () => {
    setup();
    ref.setInput('data', [{ name: 'Solo', age: 1, role: 'X' }]);
    flush();
    const rows = dataRows();
    expect(rows.length).toBe(1);
    expect(cellText(rows[0])).toEqual(['Solo', '1', 'X']);
  });
});
