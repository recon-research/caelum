import { Component, ComponentRef, signal, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeTable, CaeTableColumn } from './table';
import { CaeCellDef } from './cell-def';

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
