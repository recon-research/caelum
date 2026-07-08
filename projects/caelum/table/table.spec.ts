import { Component, ComponentRef, signal, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatPaginator } from '@angular/material/paginator';
import { By } from '@angular/platform-browser';

import { CaeTable, CaeTableColumn } from './table';
import { CaeCellDef } from './cell-def';
import { CaeRowDetailDef } from './row-detail-def';

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

// ---- Custom cell templates (#143, p-table pTemplate="body" parity) ----

// A host projecting a caeCellDef for the `role` column: renders a button with the raw value, the
// row (implicit), and the index — proving the full CaeCellContext reaches the template.
@Component({
  imports: [CaeTable, CaeCellDef],
  template: `
    <cae-table [columns]="columns()" [data]="data()">
      <ng-template caeCellDef="role" let-row let-value="value" let-i="index">
        <button type="button" class="role-btn" [attr.data-idx]="i">
          {{ value }}::{{ asPerson(row).name }}
        </button>
      </ng-template>
    </cae-table>
  `,
})
class TemplatedHost {
  // Signals (not plain fields): a plain-field host binding does not propagate to the OnPush cae-table
  // in zoneless.
  readonly columns = signal<CaeTableColumn[]>(COLUMNS);
  readonly data = signal<Person[]>(PEOPLE);
  // The row context is typed `unknown` (T cannot be inferred from projected content) — the consumer
  // narrows it, the documented v1 pattern.
  asPerson(row: unknown): Person {
    return row as Person;
  }
}

// A host whose caeCellDef key matches no column — the dev-warn path.
@Component({
  imports: [CaeTable, CaeCellDef],
  template: `
    <cae-table [columns]="columns" [data]="data">
      <ng-template caeCellDef="nope"><span>x</span></ng-template>
    </cae-table>
  `,
})
class MismatchedHost {
  columns: CaeTableColumn[] = COLUMNS;
  data: Person[] = PEOPLE;
}

// Two caeCellDef templates for the SAME column key — the last-wins dev-warn path.
@Component({
  imports: [CaeTable, CaeCellDef],
  template: `
    <cae-table [columns]="columns" [data]="data">
      <ng-template caeCellDef="role"><span class="dup-a">A</span></ng-template>
      <ng-template caeCellDef="role"><span class="dup-b">B</span></ng-template>
    </cae-table>
  `,
})
class DuplicateHost {
  columns: CaeTableColumn[] = COLUMNS;
  data: Person[] = PEOPLE;
}

// A host that adds/removes a caeCellDef at runtime (behind @if) — exercises the reactive
// contentChildren -> cellTemplates -> cell text<->template swap.
@Component({
  imports: [CaeTable, CaeCellDef],
  template: `
    <cae-table [columns]="columns()" [data]="data()">
      @if (showTemplate()) {
        <ng-template caeCellDef="role" let-value="value">
          <button type="button" class="role-btn">{{ value }}</button>
        </ng-template>
      }
    </cae-table>
  `,
})
class ToggleHost {
  readonly columns = signal<CaeTableColumn[]>(COLUMNS);
  readonly data = signal<Person[]>(PEOPLE);
  readonly showTemplate = signal(true);
}

describe('CaeTable — custom cell templates (#143)', () => {
  function make<H>(type: Type<H>): { fixture: ComponentFixture<H>; el: HTMLElement } {
    const fixture = TestBed.createComponent(type);
    fixture.detectChanges();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const rowsOf = (el: HTMLElement) => Array.from(el.querySelectorAll('tr[mat-row]'));
  const cellsOf = (row: Element) => Array.from(row.querySelectorAll('td[mat-cell]'));

  it('renders a caeCellDef template for its column, plain text for the rest', async () => {
    await TestBed.configureTestingModule({ imports: [TemplatedHost] }).compileComponents();
    const { el } = make(TemplatedHost);
    const cells = cellsOf(rowsOf(el)[0]);
    // Columns WITHOUT a template keep the zero-boilerplate text default.
    expect(cells[0].textContent!.trim()).toBe('Bob'); // name
    expect(cells[1].textContent!.trim()).toBe('30'); // age
    // The `role` column renders the projected template, not the text default.
    const btn = cells[2].querySelector('button.role-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
  });

  it('passes the full CaeCellContext — value (raw), $implicit (row), index — into the template', async () => {
    await TestBed.configureTestingModule({ imports: [TemplatedHost] }).compileComponents();
    const { el } = make(TemplatedHost);
    const rows = rowsOf(el);
    const btn0 = cellsOf(rows[0])[2].querySelector('button.role-btn') as HTMLButtonElement;
    // value="Lead" (raw row.role), row.name="Bob" via let-row, index 0 via let-i.
    expect(btn0.textContent!.trim()).toBe('Lead::Bob');
    expect(btn0.getAttribute('data-idx')).toBe('0');
    // Second row gets its own row + the next index.
    const btn1 = cellsOf(rows[1])[2].querySelector('button.role-btn') as HTMLButtonElement;
    expect(btn1.textContent!.trim()).toBe('Eng::Ann');
    expect(btn1.getAttribute('data-idx')).toBe('1');
  });

  it('re-renders the templated cell when the row data changes', async () => {
    await TestBed.configureTestingModule({ imports: [TemplatedHost] }).compileComponents();
    const { fixture, el } = make(TemplatedHost);
    fixture.componentInstance.data.set([{ name: 'Solo', age: 1, role: 'X' }]);
    fixture.detectChanges();
    fixture.detectChanges();
    const btn = cellsOf(rowsOf(el)[0])[2].querySelector('button.role-btn') as HTMLButtonElement;
    expect(btn.textContent!.trim()).toBe('X::Solo');
  });

  it('dev-warns on a caeCellDef whose key matches no column (the template is ignored)', async () => {
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (msg?: unknown) => warnings.push(String(msg));
    try {
      await TestBed.configureTestingModule({ imports: [MismatchedHost] }).compileComponents();
      make(MismatchedHost);
      expect(
        warnings.some((w) => w.includes('caeCellDef="nope"') && w.includes('no column key')),
      ).toBe(true);
    } finally {
      console.warn = realWarn;
    }
  });

  it('does NOT dev-warn when the caeCellDef key matches a real column (guard precision)', async () => {
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (msg?: unknown) => warnings.push(String(msg));
    try {
      await TestBed.configureTestingModule({ imports: [TemplatedHost] }).compileComponents();
      make(TemplatedHost); // caeCellDef="role" is a real column
      // A valid key must produce no caeCellDef warning (locks the guard against an over-broad condition).
      expect(warnings.some((w) => w.includes('caeCellDef'))).toBe(false);
    } finally {
      console.warn = realWarn;
    }
  });

  it('dev-warns on two caeCellDef templates for the same column key (last wins)', async () => {
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (msg?: unknown) => warnings.push(String(msg));
    try {
      await TestBed.configureTestingModule({ imports: [DuplicateHost] }).compileComponents();
      make(DuplicateHost);
      expect(warnings.some((w) => w.includes('duplicate') && w.includes('caeCellDef="role"'))).toBe(
        true,
      );
    } finally {
      console.warn = realWarn;
    }
  });

  it('reports the RENDERED row index (post-sort), not the source index', async () => {
    await TestBed.configureTestingModule({ imports: [TemplatedHost] }).compileComponents();
    const { fixture, el } = make(TemplatedHost);
    // Sort by Age asc: Ann(20), Cy(25), Bob(30). The rendered first row becomes Ann (source index 1).
    const ageHeader = Array.from(el.querySelectorAll('th[mat-header-cell]')).find(
      (h) => h.textContent!.trim() === 'Age',
    ) as HTMLElement;
    ageHeader.click();
    fixture.detectChanges();
    fixture.detectChanges();
    const btn0 = cellsOf(rowsOf(el)[0])[2].querySelector('button.role-btn') as HTMLButtonElement;
    // Rendered index 0 pairs with the rendered row (Ann) — proving index/$implicit follow render order,
    // not the source array order (Ann is source index 1).
    expect(btn0.textContent!.trim()).toBe('Eng::Ann');
    expect(btn0.getAttribute('data-idx')).toBe('0');
  });

  it('adds/removes a caeCellDef at runtime, swapping the cell between template and text', async () => {
    await TestBed.configureTestingModule({ imports: [ToggleHost] }).compileComponents();
    const { fixture, el } = make(ToggleHost);
    const roleCell = () => cellsOf(rowsOf(el)[0])[2];
    // Template present: the role cell renders the button.
    expect(roleCell().querySelector('button.role-btn')).not.toBeNull();
    // Remove the caeCellDef → contentChildren update → the cell falls back to the text default.
    fixture.componentInstance.showTemplate.set(false);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(roleCell().querySelector('button.role-btn')).toBeNull();
    expect(roleCell().textContent!.trim()).toBe('Lead'); // Bob's role, as plain text
    // Re-add it → the template returns.
    fixture.componentInstance.showTemplate.set(true);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(roleCell().querySelector('button.role-btn')).not.toBeNull();
  });
});

// ---- Absolute row index (#213, p-table body-template rowIndex parity) ----

// A host projecting a caeCellDef for `role` that renders the ABSOLUTE row index as the cell text and
// stashes the page-relative index in an attr — so a test can prove CaeCellContext.absoluteIndex tracks
// the page offset while `index` stays page-relative (#213). `paginated` is a signal so one host covers
// the unpaginated (single-page) case too.
@Component({
  imports: [CaeTable, CaeCellDef],
  template: `
    <cae-table [columns]="columns()" [data]="data()" [paginated]="paginated()" [pageSize]="2">
      <ng-template caeCellDef="role" let-i="index" let-n="absoluteIndex">
        <span class="idx" [attr.data-rel]="i">{{ n }}</span>
      </ng-template>
    </cae-table>
  `,
})
class AbsoluteIndexHost {
  readonly columns = signal<CaeTableColumn[]>(COLUMNS);
  readonly data = signal<Person[]>(PEOPLE);
  readonly paginated = signal(true);
}

describe('CaeTable — absolute row index (#213)', () => {
  async function make(paginated: boolean): Promise<{
    fixture: ComponentFixture<AbsoluteIndexHost>;
    el: HTMLElement;
  }> {
    const fixture = TestBed.createComponent(AbsoluteIndexHost);
    fixture.componentInstance.paginated.set(paginated); // set before first CD
    fixture.detectChanges();
    fixture.detectChanges();
    // MatTableDataSource sets paginator.length in an async Promise.resolve().then() (untracked — not
    // awaited by whenStable in zoneless); pump a macrotask so hasNextPage() reflects the real length.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const idxCells = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('span.idx')) as HTMLElement[];
  const absOf = (el: HTMLElement) => idxCells(el).map((s) => s.textContent!.trim());
  const relOf = (el: HTMLElement) => idxCells(el).map((s) => s.getAttribute('data-rel'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AbsoluteIndexHost] }).compileComponents();
  });

  it('equals the page-relative index when unpaginated (a single page)', async () => {
    const { el } = await make(false);
    // All 3 rows on one page: absoluteIndex === index === 0,1,2.
    expect(relOf(el)).toEqual(['0', '1', '2']);
    expect(absOf(el)).toEqual(['0', '1', '2']);
  });

  it('offsets by the page on page 1 (offset 0): absolute === relative', async () => {
    const { el } = await make(true);
    // Page 1, pageSize 2: rows 0,1. Offset 0 -> absolute 0,1; relative 0,1.
    expect(relOf(el)).toEqual(['0', '1']);
    expect(absOf(el)).toEqual(['0', '1']);
  });

  it('adds the page offset on page 2: relative resets, absolute continues across the page boundary', async () => {
    const { fixture, el } = await make(true);
    // Advance to page 2 via the paginator's own public API: nextPage() -> its `page` event -> the
    // tracked pageOffset signal updates (and MatTableDataSource re-slices to the new page), then render.
    const paginator = fixture.debugElement.query(By.directive(MatPaginator))
      .componentInstance as MatPaginator;
    expect(paginator.hasNextPage()).toBe(true); // page 1 of 2 -> Next is live
    paginator.nextPage();
    fixture.detectChanges();
    fixture.detectChanges();
    // Page 2 holds the 3rd row (Cy): page-relative index resets to 0; absolute continues at 2 (offset 2).
    expect(relOf(el)).toEqual(['0']);
    expect(absOf(el)).toEqual(['2']);
  });

  it('re-clamps the offset when a data-shrink strands a later page (internal page-clamp path)', async () => {
    // MatTableDataSource clamps a now-out-of-range page via _internalPageChanges, which does NOT emit
    // paginator.page. A page-only offset subscription would miss it and leave absoluteIndex stale at
    // the pre-clamp offset; the offset must track the render stream so it recomputes on the clamp too.
    const five: Person[] = [
      { name: 'A', age: 1, role: 'r' },
      { name: 'B', age: 2, role: 'r' },
      { name: 'C', age: 3, role: 'r' },
      { name: 'D', age: 4, role: 'r' },
      { name: 'E', age: 5, role: 'r' },
    ];
    const { fixture, el } = await make(true);
    fixture.componentInstance.data.set(five);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve)); // paginator.length -> 5
    fixture.detectChanges();
    const paginator = fixture.debugElement.query(By.directive(MatPaginator))
      .componentInstance as MatPaginator;
    paginator.nextPage(); // page 1
    paginator.nextPage(); // page 2 (row E), offset 4
    fixture.detectChanges();
    fixture.detectChanges();
    expect(absOf(el)).toEqual(['4']); // row E at absolute index 4

    // Shrink to 3 rows -> page 2 no longer exists -> the data source clamps to page 1 (offset 2).
    fixture.componentInstance.data.set(five.slice(0, 3));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve)); // flush the clamp microtask
    fixture.detectChanges();
    // Clamped page 1, size 2: slice(2,4) of [A,B,C] = [C], page-relative 0, absolute 2 — NOT stale 4.
    expect(relOf(el)).toEqual(['0']);
    expect(absOf(el)).toEqual(['2']);
  });
});

// ---- Row selection (#144, p-table selectionMode="multiple" parity) ----

// A host binding [(selection)] via the explicit [selection] + (selectionChange) form (a signal-safe
// two-way) — proves the vendor-neutral T[] round-trips out through the model's change output.
@Component({
  imports: [CaeTable],
  template: `
    <cae-table
      [columns]="columns"
      [data]="data"
      selectionMode="multiple"
      [selection]="selected()"
      (selectionChange)="selected.set($event)"
    />
  `,
})
class SelectionHost {
  columns = COLUMNS;
  data = PEOPLE;
  readonly selected = signal<readonly Person[]>([]);
}

describe('CaeTable — row selection (#144)', () => {
  let fixture: ComponentFixture<CaeTable<Person>>;
  let ref: ComponentRef<CaeTable<Person>>;
  let el: HTMLElement;

  function setup(inputs: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(CaeTable<Person>);
    ref = fixture.componentRef;
    ref.setInput('columns', COLUMNS);
    ref.setInput('data', PEOPLE);
    ref.setInput('selectionMode', 'multiple');
    for (const [k, v] of Object.entries(inputs)) ref.setInput(k, v);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    fixture.detectChanges();
  }

  const headerCells = () => Array.from(el.querySelectorAll('th[mat-header-cell]'));
  const rowCheckboxes = () =>
    Array.from(
      el.querySelectorAll<HTMLInputElement>('td.cae-table__select-cell input[type="checkbox"]'),
    );
  const rowCheckbox = (i: number) => rowCheckboxes()[i];
  const selectAll = () =>
    el.querySelector('th.cae-table__select-cell input[type="checkbox"]') as HTMLInputElement;
  const dataRow = (i: number) => Array.from(el.querySelectorAll('tr[mat-row]'))[i];
  const nameOf = (i: number) =>
    dataRow(i).querySelector('td[mat-cell]:not(.cae-table__select-cell)')!.textContent!.trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CaeTable, SelectionHost],
    }).compileComponents();
  });

  it('renders no selection column by default (selectionMode="none")', () => {
    fixture = TestBed.createComponent(CaeTable<Person>);
    ref = fixture.componentRef;
    ref.setInput('columns', COLUMNS);
    ref.setInput('data', PEOPLE);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    fixture.detectChanges();
    expect(el.querySelector('.cae-table__select-cell')).toBeNull();
    expect(el.querySelectorAll('th[mat-header-cell]').length).toBe(3);
  });

  it('prepends a checkbox column with a select-all header + one checkbox per row (multiple)', () => {
    setup();
    expect(headerCells().length).toBe(4); // 3 data columns + the prepended select column
    expect(selectAll()).not.toBeNull();
    expect(el.querySelectorAll('td.cae-table__select-cell input[type="checkbox"]').length).toBe(3);
  });

  it('toggling a row checkbox selects then deselects that row (updates [(selection)])', () => {
    setup();
    // rendered order = data order: Bob, Ann, Cy
    rowCheckbox(0).click();
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([PEOPLE[0]]);
    expect(rowCheckbox(0).checked).toBe(true);
    rowCheckbox(0).click();
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([]);
    expect(rowCheckbox(0).checked).toBe(false);
  });

  it('select-all selects every row, and clears when toggled while all selected', () => {
    setup();
    selectAll().click();
    fixture.detectChanges();
    expect(ref.instance.selection().length).toBe(3);
    expect(selectAll().checked).toBe(true);
    selectAll().click();
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([]);
    expect(selectAll().checked).toBe(false);
  });

  it('shows the select-all as indeterminate when some but not all rows are selected', () => {
    setup();
    rowCheckbox(1).click();
    fixture.detectChanges();
    expect(selectAll().indeterminate).toBe(true);
    expect(selectAll().checked).toBe(false);
  });

  it('reflects a programmatic [selection] input in the row checkboxes', () => {
    setup({ selection: [PEOPLE[1]] });
    expect(rowCheckbox(1).checked).toBe(true);
    expect(rowCheckbox(0).checked).toBe(false);
  });

  it('names each checkbox for assistive tech (rowSelectionLabel default + selectAllLabel)', () => {
    setup();
    // The name is on the internal <input> (the checkbox role), forwarded from mat-checkbox's aria-label.
    expect(selectAll().getAttribute('aria-label')).toBe('Select all rows');
    expect(rowCheckbox(0).getAttribute('aria-label')).toBe('Select row 1');
    expect(rowCheckbox(1).getAttribute('aria-label')).toBe('Select row 2');
  });

  it('uses a custom rowSelectionLabel accessor when provided', () => {
    setup({ rowSelectionLabel: (row: Person) => `Select ${row.name}` });
    expect(rowCheckbox(0).getAttribute('aria-label')).toBe('Select Bob');
  });

  it('keeps a row selected across a sort (reference identity, not row position)', () => {
    setup();
    rowCheckbox(0).click(); // Bob, in data order
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([PEOPLE[0]]); // Bob
    // Sort by Age asc → Ann(20), Cy(25), Bob(30): Bob moves to the last rendered row.
    const ageHeader = headerCells().find((h) => h.textContent!.trim() === 'Age') as HTMLElement;
    ageHeader.click();
    fixture.detectChanges();
    fixture.detectChanges();
    const bobIndex = [0, 1, 2].find((i) => nameOf(i) === 'Bob')!;
    expect(rowCheckbox(bobIndex).checked).toBe(true); // still checked in its new position
    expect(ref.instance.selection()).toEqual([PEOPLE[0]]);
  });

  it('marks the select-all aria-disabled (not native-disabled) on empty data, keeping it focusable', () => {
    setup({ data: [] });
    // disabledInteractive: aria-disabled instead of native disabled, so an external data-clear never
    // strands keyboard focus to <body> (#189/#192). The control stays focusable and its toggle no-ops.
    expect(selectAll().getAttribute('aria-disabled')).toBe('true');
    expect(selectAll().disabled).toBe(false);
  });

  it('throws a clear error when a column uses the reserved selection key (dev guard)', () => {
    expect(() =>
      setup({ columns: [...COLUMNS, { key: '__caeSelect', header: 'Oops' }] }),
    ).toThrowError(/reserved selection key/);
  });

  it('propagates selection to a host via the (selectionChange) two-way output', () => {
    const hostFixture = TestBed.createComponent(SelectionHost);
    hostFixture.detectChanges();
    hostFixture.detectChanges();
    const hostEl = hostFixture.nativeElement as HTMLElement;
    const firstRowCb = hostEl.querySelector(
      'td.cae-table__select-cell input[type="checkbox"]',
    ) as HTMLInputElement;
    firstRowCb.click();
    hostFixture.detectChanges();
    expect(hostFixture.componentInstance.selected()).toEqual([PEOPLE[0]]);
  });
});

// ---- Single-select row selection (#144, p-table selectionMode="single" parity) ----

@Component({
  imports: [CaeTable],
  template: `
    <cae-table
      [columns]="columns"
      [data]="data"
      selectionMode="single"
      [selection]="selected()"
      (selectionChange)="selected.set($event)"
    />
  `,
})
class SingleSelectionHost {
  columns = COLUMNS;
  data = PEOPLE;
  readonly selected = signal<readonly Person[]>([]);
}

describe('CaeTable — single-select row selection (#144)', () => {
  let fixture: ComponentFixture<CaeTable<Person>>;
  let ref: ComponentRef<CaeTable<Person>>;
  let el: HTMLElement;

  function setup(inputs: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(CaeTable<Person>);
    ref = fixture.componentRef;
    ref.setInput('columns', COLUMNS);
    ref.setInput('data', PEOPLE);
    ref.setInput('selectionMode', 'single');
    for (const [k, v] of Object.entries(inputs)) ref.setInput(k, v);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    fixture.detectChanges();
  }

  const radios = () =>
    Array.from(
      el.querySelectorAll<HTMLInputElement>('td.cae-table__select-cell input[type="radio"]'),
    );
  const radio = (i: number) => radios()[i];
  const headerCells = () => Array.from(el.querySelectorAll('th[mat-header-cell]'));
  const nameOf = (i: number) => {
    const dataRow = Array.from(el.querySelectorAll('tr[mat-row]'))[i];
    return dataRow.querySelector('td[mat-cell]:not(.cae-table__select-cell)')!.textContent!.trim();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CaeTable, SingleSelectionHost],
    }).compileComponents();
  });

  it('prepends a radio column (one per row) with NO select-all header control', () => {
    setup();
    expect(headerCells().length).toBe(4); // 3 data columns + the prepended select column
    expect(radios().length).toBe(3);
    // A radio group has no "select all" — the header select-cell holds no control.
    expect(el.querySelector('th.cae-table__select-cell input')).toBeNull();
    // ...and no checkbox anywhere (single mode renders radios, not checkboxes).
    expect(el.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('selects exactly one row, switching (not accumulating) on a second pick', () => {
    setup();
    radio(0).click(); // Bob (data order)
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([PEOPLE[0]]);
    expect(radio(0).checked).toBe(true);
    // Pick another row -> selection switches, length stays 1.
    radio(2).click(); // Cy
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([PEOPLE[2]]);
    expect(radio(2).checked).toBe(true);
    expect(radio(0).checked).toBe(false);
  });

  it('groups the radios under one shared name (native radio-group a11y) and names each for AT', () => {
    setup();
    const names = radios().map((r) => r.getAttribute('name'));
    expect(new Set(names).size).toBe(1); // all one group -> mutual exclusion + "N of M"
    expect(names[0]).toMatch(/^cae-table-select-/);
    // The accessible name is on the internal radio <input>, forwarded from mat-radio-button aria-label.
    expect(radio(0).getAttribute('aria-label')).toBe('Select row 1');
  });

  it('names the selection column for AT via a visually-hidden header label', () => {
    setup();
    const th = el.querySelector('th.cae-table__select-cell') as HTMLElement;
    const label = th.querySelector('.cae-visually-hidden');
    expect(label?.textContent!.trim()).toBe('Select'); // default selectColumnHeader
  });

  it('keeps exactly ONE radio in the tab order (roving tabindex), never N tab stops', () => {
    setup();
    const tabindexes = () => radios().map((r) => r.getAttribute('tabindex'));
    // None selected -> the FIRST rendered radio is the single tab stop; the rest are -1.
    expect(tabindexes()).toEqual(['0', '-1', '-1']);
    // Pick the 3rd row -> the tab stop moves to it (still exactly one 0), proving we override the
    // group-less MatRadioButton default of tabindex 0 on every radio.
    radio(2).click();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(tabindexes()).toEqual(['-1', '-1', '0']);
  });

  it('reflects a programmatic [selection] input in the radios', () => {
    setup({ selection: [PEOPLE[1]] });
    expect(radio(1).checked).toBe(true);
    expect(radio(0).checked).toBe(false);
  });

  it('keeps the selected row across a sort (reference identity, not row position)', () => {
    setup();
    radio(0).click(); // Bob
    fixture.detectChanges();
    const ageHeader = headerCells().find((h) => h.textContent!.trim() === 'Age') as HTMLElement;
    ageHeader.click(); // sort by Age asc -> Ann, Cy, Bob
    fixture.detectChanges();
    fixture.detectChanges();
    const bobIndex = [0, 1, 2].find((i) => nameOf(i) === 'Bob')!;
    expect(radio(bobIndex).checked).toBe(true); // still checked in its new position
    expect(ref.instance.selection()).toEqual([PEOPLE[0]]);
  });

  it('propagates the single selection to a host via the (selectionChange) two-way output', () => {
    const hostFixture = TestBed.createComponent(SingleSelectionHost);
    hostFixture.detectChanges();
    hostFixture.detectChanges();
    const hostEl = hostFixture.nativeElement as HTMLElement;
    const firstRadio = hostEl.querySelector(
      'td.cae-table__select-cell input[type="radio"]',
    ) as HTMLInputElement;
    firstRadio.click();
    hostFixture.detectChanges();
    expect(hostFixture.componentInstance.selected()).toEqual([PEOPLE[0]]);
  });

  // ---- click/Space-to-deselect (#224, opt-in [allowDeselect], p-table parity) ----

  it('#224: without allowDeselect, re-activating the selected radio does NOT clear (native radio semantics)', () => {
    setup(); // allowDeselect defaults false
    radio(0).click();
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([PEOPLE[0]]);
    radio(0).click(); // re-click the already-checked radio
    fixture.detectChanges();
    // A native radio group is not deselectable by default — the pick stands, no in-grid clear.
    expect(ref.instance.selection()).toEqual([PEOPLE[0]]);
    expect(radio(0).checked).toBe(true);
  });

  it('#224: with [allowDeselect], re-clicking the selected radio clears the selection (mouse)', () => {
    setup({ allowDeselect: true });
    radio(0).click();
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([PEOPLE[0]]);
    radio(0).click(); // re-activate the checked radio -> clear
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([]);
    expect(radio(0).checked).toBe(false);
  });

  it('#224: [allowDeselect] leaves first-pick and switch intact — only a re-activation clears', () => {
    setup({ allowDeselect: true });
    radio(0).click(); // first pick selects (click fires before change; not read as already-selected)
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([PEOPLE[0]]);
    radio(2).click(); // switching to a different row replaces, never clears
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([PEOPLE[2]]);
    expect(radio(2).checked).toBe(true);
  });

  it('#224: with [allowDeselect], Space on the selected radio clears it (keyboard-accessible deselect, WCAG 2.1.1)', () => {
    setup({ allowDeselect: true });
    radio(1).click();
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([PEOPLE[1]]);
    // Space on an already-checked native radio emits no change; the (keydown.space) handler clears.
    radio(1).dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(ref.instance.selection()).toEqual([]);
  });
});

// ---- Expandable rows (#144, p-table rowexpansion parity) ----

// A host projecting a caeRowDetailDef and binding [(expanded)] via the signal-safe explicit form
// ([expanded] + (expandedChange)) — proves the vendor-neutral T[] round-trips through the model.
@Component({
  imports: [CaeTable, CaeRowDetailDef],
  template: `
    <cae-table
      [columns]="columns()"
      [data]="data()"
      [expanded]="expanded()"
      (expandedChange)="expanded.set($event)"
    >
      <ng-template caeRowDetailDef let-row>
        <p class="detail-body">Detail: {{ asPerson(row).name }} / {{ asPerson(row).role }}</p>
      </ng-template>
    </cae-table>
  `,
})
class ExpandableHost {
  readonly columns = signal<CaeTableColumn[]>(COLUMNS);
  readonly data = signal<Person[]>(PEOPLE);
  readonly expanded = signal<readonly Person[]>([]);
  asPerson(row: unknown): Person {
    return row as Person;
  }
}

// A host combining expandable rows AND a selection column — proves the prepended-column order.
@Component({
  imports: [CaeTable, CaeRowDetailDef],
  template: `
    <cae-table [columns]="columns" [data]="data" selectionMode="multiple">
      <ng-template caeRowDetailDef let-row>
        <span class="detail-body">{{ asPerson(row).name }}</span>
      </ng-template>
    </cae-table>
  `,
})
class ExpandableSelectableHost {
  columns = COLUMNS;
  data = PEOPLE;
  asPerson(row: unknown): Person {
    return row as Person;
  }
}

// A host combining a caeCellDef (rendering its index + absoluteIndex) AND a caeRowDetailDef — the
// regression guard that multiTemplateDataRows doesn't corrupt the #143/#213 cell-index context to NaN.
@Component({
  imports: [CaeTable, CaeCellDef, CaeRowDetailDef],
  template: `
    <cae-table [columns]="columns" [data]="data">
      <ng-template caeCellDef="role" let-i="index" let-n="absoluteIndex">
        <span class="idx-cell">{{ i }}:{{ n }}</span>
      </ng-template>
      <ng-template caeRowDetailDef let-row>
        <span class="detail-body">{{ asPerson(row).name }}</span>
      </ng-template>
    </cae-table>
  `,
})
class ExpandableWithCellIndexHost {
  columns = COLUMNS;
  data = PEOPLE;
  asPerson(row: unknown): Person {
    return row as Person;
  }
}

// A host that adds/removes the caeRowDetailDef at runtime (behind @if) — exercises the reactive
// contentChildren → rowDetailDef → columnKeys/multiTemplateDataRows transition in both directions.
@Component({
  imports: [CaeTable, CaeRowDetailDef],
  template: `
    <cae-table [columns]="columns()" [data]="data()">
      @if (showDetail()) {
        <ng-template caeRowDetailDef let-row>
          <span class="detail-body">{{ asPerson(row).name }}</span>
        </ng-template>
      }
    </cae-table>
  `,
})
class ToggleExpandableHost {
  readonly columns = signal<CaeTableColumn[]>(COLUMNS);
  readonly data = signal<Person[]>(PEOPLE);
  readonly showDetail = signal(true);
  asPerson(row: unknown): Person {
    return row as Person;
  }
}

// Two caeRowDetailDef templates — the first-wins dev-warn path.
@Component({
  imports: [CaeTable, CaeRowDetailDef],
  template: `
    <cae-table [columns]="columns" [data]="data">
      <ng-template caeRowDetailDef><span class="detail-a">A</span></ng-template>
      <ng-template caeRowDetailDef><span class="detail-b">B</span></ng-template>
    </cae-table>
  `,
})
class DuplicateDetailHost {
  columns = COLUMNS;
  data = PEOPLE;
}

describe('CaeTable — expandable rows (#144)', () => {
  function make<H>(type: Type<H>): { fixture: ComponentFixture<H>; el: HTMLElement } {
    const fixture = TestBed.createComponent(type);
    fixture.detectChanges();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  // The main (data) rows and the detail rows are distinguished by the detail-row class — with
  // multiTemplateDataRows the DOM order is main0, detail0, main1, detail1, … so indices align.
  const mainRows = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('tr[mat-row]:not(.cae-table__detail-row)'));
  const detailRows = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('tr.cae-table__detail-row'));
  const toggle = (el: HTMLElement, i: number) =>
    mainRows(el)[i].querySelector('button.cae-table__expand-toggle') as HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CaeTable,
        CaeRowDetailDef,
        ExpandableHost,
        ExpandableSelectableHost,
        ExpandableWithCellIndexHost,
        ToggleExpandableHost,
        DuplicateDetailHost,
      ],
    }).compileComponents();
  });

  it('renders no expand column and no detail rows without a caeRowDetailDef (off by default)', () => {
    const fixture = TestBed.createComponent(CaeTable<Person>);
    const ref = fixture.componentRef;
    ref.setInput('columns', COLUMNS);
    ref.setInput('data', PEOPLE);
    fixture.detectChanges();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.cae-table__expand-cell')).toBeNull();
    expect(el.querySelectorAll('tr.cae-table__detail-row').length).toBe(0);
    expect(el.querySelectorAll('th[mat-header-cell]').length).toBe(3);
  });

  it('prepends an expand-toggle column with one disclosure button per row, collapsed initially', () => {
    const { el } = make(ExpandableHost);
    const headers = Array.from(el.querySelectorAll('th[mat-header-cell]'));
    expect(headers[0].classList.contains('cae-table__expand-cell')).toBe(true);
    // A visually-hidden name on the expand column header (WCAG 1.3.1).
    expect(headers[0].querySelector('.cae-visually-hidden')!.textContent!.trim()).toBe('Details');
    const buttons = mainRows(el).map((r) => r.querySelector('button.cae-table__expand-toggle'));
    expect(buttons.length).toBe(3);
    expect(buttons.every((b) => b !== null)).toBe(true);
    // Disclosure pattern: each button starts collapsed and names itself with a DISTINCT, correct index.
    // Regression guard: under multiTemplateDataRows the CDK populates dataIndex, not index — a naive
    // `let i = index` would render "Toggle details for row NaN" on every button (see the i ?? di coalesce).
    expect(toggle(el, 0).getAttribute('aria-expanded')).toBe('false');
    expect(toggle(el, 0).getAttribute('aria-label')).toBe('Toggle details for row 1');
    expect(toggle(el, 1).getAttribute('aria-label')).toBe('Toggle details for row 2');
    // No detail content is rendered while collapsed…
    expect(el.querySelector('.detail-body')).toBeNull();
    // …though the detail rows exist (one per datum), collapsed out of the a11y tree.
    expect(detailRows(el).length).toBe(3);
    expect(
      detailRows(el).every((r) => r.classList.contains('cae-table__detail-row--collapsed')),
    ).toBe(true);
  });

  it('points the toggle aria-controls at its detail region id (a valid, distinct IDREF)', () => {
    const { el } = make(ExpandableHost);
    const controls = toggle(el, 0).getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    const region = el.querySelector(`[id="${controls}"]`);
    expect(region).not.toBeNull();
    expect(region!.classList.contains('cae-table__detail')).toBe(true);
    // Distinct rows get distinct region ids (no aria-controls collision).
    expect(toggle(el, 1).getAttribute('aria-controls')).not.toBe(controls);
  });

  it('expands a row on click: aria-expanded flips, detail renders with the row, model updates', () => {
    const { fixture, el } = make(ExpandableHost);
    const host = fixture.componentInstance;
    toggle(el, 0).click();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(toggle(el, 0).getAttribute('aria-expanded')).toBe('true');
    const body = detailRows(el)[0].querySelector('.detail-body');
    expect(body).not.toBeNull();
    // The projected template received the row as $implicit (name + role rendered).
    expect(body!.textContent).toContain('Bob');
    expect(body!.textContent).toContain('Lead');
    expect(detailRows(el)[0].classList.contains('cae-table__detail-row--collapsed')).toBe(false);
    // The two-way expanded model carries the row out as a vendor-neutral T[].
    expect(host.expanded()).toEqual([PEOPLE[0]]);
  });

  it('collapses a row on a second click (empty model, no rendered detail)', () => {
    const { fixture, el } = make(ExpandableHost);
    const host = fixture.componentInstance;
    toggle(el, 0).click();
    fixture.detectChanges();
    fixture.detectChanges();
    toggle(el, 0).click();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(toggle(el, 0).getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.detail-body')).toBeNull();
    expect(host.expanded()).toEqual([]);
  });

  it('expands rows independently — opening one leaves the others collapsed', () => {
    const { fixture, el } = make(ExpandableHost);
    toggle(el, 0).click();
    fixture.detectChanges();
    fixture.detectChanges();
    toggle(el, 2).click();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(toggle(el, 0).getAttribute('aria-expanded')).toBe('true');
    expect(toggle(el, 1).getAttribute('aria-expanded')).toBe('false');
    expect(toggle(el, 2).getAttribute('aria-expanded')).toBe('true');
    // Two detail bodies rendered (rows 0 and 2); row 1 stays collapsed.
    expect(el.querySelectorAll('.detail-body').length).toBe(2);
    expect(detailRows(el)[1].classList.contains('cae-table__detail-row--collapsed')).toBe(true);
  });

  it('is keyboard-operable — the toggle is a native <button> activated by click (WCAG 2.1.1)', () => {
    const { fixture, el } = make(ExpandableHost);
    const b0 = toggle(el, 0);
    // A native <button> turns Enter/Space into a click itself — no custom keydown handler needed, so
    // asserting the button element + the click path is the keyboard-operability proof.
    expect(b0.tagName).toBe('BUTTON');
    b0.click();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(toggle(el, 0).getAttribute('aria-expanded')).toBe('true');
  });

  it('spans the detail cell across every displayed column (colspan)', () => {
    const { el } = make(ExpandableHost);
    const detailCell = detailRows(el)[0].querySelector('td[mat-cell]') as HTMLElement;
    // 1 expand column + 3 data columns = 4.
    expect(detailCell.getAttribute('colspan')).toBe('4');
  });

  it('honors a two-way [(expanded)] seeded from outside — rendering that row’s detail', () => {
    const { fixture, el } = make(ExpandableHost);
    fixture.componentInstance.expanded.set([PEOPLE[1]]);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(toggle(el, 1).getAttribute('aria-expanded')).toBe('true');
    expect(detailRows(el)[1].querySelector('.detail-body')!.textContent).toContain('Ann');
  });

  it('coexists with a selection column — order is expander, then select, then data columns', () => {
    const { el } = make(ExpandableSelectableHost);
    const headers = Array.from(el.querySelectorAll('th[mat-header-cell]'));
    // 1 expand + 1 select + 3 data = 5 header cells, expander first.
    expect(headers.length).toBe(5);
    expect(headers[0].classList.contains('cae-table__expand-cell')).toBe(true);
    expect(headers[1].classList.contains('cae-table__select-cell')).toBe(true);
    // The detail cell now spans all 5 displayed columns.
    const detailCell = el.querySelector('tr.cae-table__detail-row td[mat-cell]') as HTMLElement;
    expect(detailCell.getAttribute('colspan')).toBe('5');
  });

  it('throws a clear error when a column uses a reserved expand/detail key (dev guard)', () => {
    const fixture = TestBed.createComponent(CaeTable<Person>);
    const ref = fixture.componentRef;
    ref.setInput('columns', [...COLUMNS, { key: '__caeExpand', header: 'Oops' }]);
    ref.setInput('data', PEOPLE);
    expect(() => {
      fixture.detectChanges();
      fixture.detectChanges();
    }).toThrowError(/reserved key "__caeExpand"/);
  });

  it('does not regress selection labels under expansion — the row index stays correct (not NaN)', () => {
    const { el } = make(ExpandableSelectableHost);
    const rowCheckboxes = Array.from(
      el.querySelectorAll<HTMLInputElement>('td.cae-table__select-cell input[type="checkbox"]'),
    );
    expect(rowCheckboxes.length).toBe(3);
    // With multiTemplateDataRows on (a detail template is present), a naive `index` is undefined →
    // "Select row NaN"; the i ?? di coalesce keeps the 1-based page position correct.
    expect(rowCheckboxes[0].getAttribute('aria-label')).toBe('Select row 1');
    expect(rowCheckboxes[2].getAttribute('aria-label')).toBe('Select row 3');
  });

  it('does not regress the caeCellDef index/absoluteIndex context under expansion (not NaN)', () => {
    const { el } = make(ExpandableWithCellIndexHost);
    const idxCells = mainRows(el).map((r) => r.querySelector('.idx-cell')!.textContent!.trim());
    // Unpaginated: absoluteIndex === index. Per row index:absoluteIndex is correct (0:0, 1:1, 2:2),
    // proving multiTemplateDataRows didn't corrupt the #143/#213 cell-index context to NaN.
    expect(idxCells).toEqual(['0:0', '1:1', '2:2']);
  });

  it('adds/removes the expand column reactively as the caeRowDetailDef is projected/removed', () => {
    const { fixture, el } = make(ToggleExpandableHost);
    // On (detail template present): expand column + one detail row per datum.
    expect(el.querySelector('.cae-table__expand-cell')).not.toBeNull();
    expect(detailRows(el).length).toBe(3);
    // Remove it → expand column gone, no detail rows, back to 3 data-column headers (no crash on the
    // multiTemplateDataRows true→false transition — the one path a stray multiple-default-rowDef could hit).
    fixture.componentInstance.showDetail.set(false);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(el.querySelector('.cae-table__expand-cell')).toBeNull();
    expect(detailRows(el).length).toBe(0);
    expect(el.querySelectorAll('th[mat-header-cell]').length).toBe(3);
    // Re-project → expand column returns.
    fixture.componentInstance.showDetail.set(true);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(el.querySelector('.cae-table__expand-cell')).not.toBeNull();
    expect(detailRows(el).length).toBe(3);
  });

  it('dev-warns when more than one caeRowDetailDef is projected (first wins)', () => {
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (msg?: unknown) => warnings.push(String(msg));
    try {
      make(DuplicateDetailHost);
      expect(
        warnings.some((w) => w.includes('caeRowDetailDef') && w.includes('only the first')),
      ).toBe(true);
    } finally {
      console.warn = realWarn;
    }
  });
});
