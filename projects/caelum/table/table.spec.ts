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

  it('shows the empty message in a persistent role=status live region when data is empty', () => {
    setup({ data: [], emptyMessage: 'Nobody here.' });
    expect(dataRows().length).toBe(0);
    const region = el.querySelector('.cae-table__empty') as HTMLElement;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent!.trim()).toBe('Nobody here.');
  });

  it('keeps the empty region mounted-but-empty with data (so a later empty transition is announced)', () => {
    // The region persists (never @if-stamped with its text) — only its text varies. Start with
    // data (region empty), then clear it: the SAME element gains text, which a live region announces.
    setup({ emptyMessage: 'Nobody here.' });
    const region = () => el.querySelector('.cae-table__empty') as HTMLElement;
    expect(region()).not.toBeNull(); // always mounted
    expect(region().textContent!.trim()).toBe(''); // no text while rows are present
    const first = region();
    ref.setInput('data', []);
    flush();
    expect(region()).toBe(first); // same element, not a re-stamped one
    expect(region().textContent!.trim()).toBe('Nobody here.');
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

  it('suppresses aria-label when a caption is set, so the visible caption wins as the name', () => {
    setup({ caption: 'Team roster', ariaLabel: 'People' });
    // Both set: caption is the visible accessible name; aria-label must NOT also be present (else
    // it would override the caption — the label-in-name mismatch).
    expect(el.querySelector('table > caption')?.textContent!.trim()).toBe('Team roster');
    expect(el.querySelector('table')?.hasAttribute('aria-label')).toBe(false);
  });

  it('throws a clear cae-table error on a duplicate column key (dev config guard)', () => {
    expect(() =>
      setup({
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'name', header: 'Name again' },
        ],
      }),
    ).toThrowError(/cae-table: duplicate column key/);
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
