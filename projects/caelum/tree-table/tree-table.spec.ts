import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeTreeTable, CaeTreeTableColumn, CaeTreeTableNode } from './tree-table';
import { CaeTreeCellDef } from './tree-cell-def';
import { expectNoA11yViolations } from '../testing/a11y';

interface Item {
  name: string;
  size: string;
  kind: string;
}

// src (branch)
//   app (branch)
//     main.ts (leaf)
//     app.ts (leaf)
//   index.html (leaf)
// README.md (leaf)
const SRC_APP_MAIN: CaeTreeTableNode<Item> = {
  data: { name: 'main.ts', size: '2 KB', kind: 'file' },
};
const SRC_APP_APP: CaeTreeTableNode<Item> = {
  data: { name: 'app.ts', size: '5 KB', kind: 'file' },
};
const SRC_APP: CaeTreeTableNode<Item> = {
  data: { name: 'app', size: '—', kind: 'folder' },
  children: [SRC_APP_MAIN, SRC_APP_APP],
};
const SRC_INDEX: CaeTreeTableNode<Item> = {
  data: { name: 'index.html', size: '1 KB', kind: 'file' },
};
const SRC: CaeTreeTableNode<Item> = {
  data: { name: 'src', size: '—', kind: 'folder' },
  children: [SRC_APP, SRC_INDEX],
};
const README: CaeTreeTableNode<Item> = { data: { name: 'README.md', size: '3 KB', kind: 'file' } };
const TREE: CaeTreeTableNode<Item>[] = [SRC, README];

const COLS: CaeTreeTableColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'size', header: 'Size' },
  { key: 'kind', header: 'Kind' },
];

describe('CaeTreeTable', () => {
  let component: CaeTreeTable<Item>;
  let fixture: ComponentFixture<CaeTreeTable<Item>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeTreeTable] }).compileComponents();
    fixture = TestBed.createComponent(CaeTreeTable<Item>);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('nodes', TREE);
    fixture.componentRef.setInput('columns', COLS);
    fixture.componentRef.setInput('caption', 'Files');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  const rows = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[data-cae-tt-row]'));
  const rowText = (): string[] =>
    rows().map((r) => r.querySelector('td')?.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const attach = (): void => document.body.appendChild(fixture.nativeElement);
  const key = (el: HTMLElement, k: string): KeyboardEvent => {
    const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    fixture.detectChanges();
    return ev;
  };

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('has no axe violations (captioned treegrid, root rows)', async () => {
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('renders only the root rows while every branch is collapsed', () => {
    // Roots: src (branch), README.md (leaf). No expansion → children are absent from the flat list.
    expect(rowText()).toEqual(['src', 'README.md']);
  });

  it('reveals a branch’s children when it is expanded (flattened, in order)', async () => {
    fixture.componentRef.setInput('expanded', [SRC]);
    fixture.detectChanges();
    await fixture.whenStable();
    // src, then its children (app branch collapsed → only app), then README.md.
    expect(rowText()).toEqual(['src', 'app', 'index.html', 'README.md']);
  });

  it('flattens recursively when nested branches are expanded', async () => {
    fixture.componentRef.setInput('expanded', [SRC, SRC_APP]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(rowText()).toEqual(['src', 'app', 'main.ts', 'app.ts', 'index.html', 'README.md']);
  });

  it('is a treegrid named via aria-labelledby → its caption (not native caption-as-name, which a treegrid role does not honor)', () => {
    const table = fixture.nativeElement.querySelector('table');
    expect(table?.getAttribute('role')).toBe('treegrid');
    const caption = fixture.nativeElement.querySelector('caption');
    expect(caption?.textContent?.trim()).toBe('Files');
    // aria-labelledby points at the caption's id (authoritative for a treegrid role); aria-label is off.
    const labelledby = table?.getAttribute('aria-labelledby');
    expect(labelledby).toBeTruthy();
    expect(caption?.getAttribute('id')).toBe(labelledby);
    expect(table?.getAttribute('aria-label')).toBeNull();
  });

  it('falls back to ariaLabel when no caption is given', async () => {
    fixture.componentRef.setInput('caption', '');
    fixture.componentRef.setInput('ariaLabel', 'Project files');
    fixture.detectChanges();
    await fixture.whenStable();
    const table = fixture.nativeElement.querySelector('table');
    expect(table?.getAttribute('aria-label')).toBe('Project files');
  });

  it('exposes the tree position on each row (level / expanded / posinset / setsize)', async () => {
    fixture.componentRef.setInput('expanded', [SRC]);
    fixture.detectChanges();
    await fixture.whenStable();
    // [src, app, index.html, README.md]
    const [src, app, index, readme] = rows();
    expect(src.getAttribute('aria-level')).toBe('1');
    expect(src.getAttribute('aria-expanded')).toBe('true');
    expect(src.getAttribute('aria-posinset')).toBe('1');
    expect(src.getAttribute('aria-setsize')).toBe('2'); // two roots
    // app is a collapsed branch nested under src
    expect(app.getAttribute('aria-level')).toBe('2');
    expect(app.getAttribute('aria-expanded')).toBe('false');
    expect(app.getAttribute('aria-posinset')).toBe('1');
    expect(app.getAttribute('aria-setsize')).toBe('2'); // src has two children
    // index.html is a leaf → no aria-expanded
    expect(index.getAttribute('aria-level')).toBe('2');
    expect(index.hasAttribute('aria-expanded')).toBe(false);
    // README.md is the second root leaf
    expect(readme.getAttribute('aria-level')).toBe('1');
    expect(readme.getAttribute('aria-posinset')).toBe('2');
  });

  it('marks the lead cell rowheader, the rest gridcell, and headers columnheader', () => {
    const firstRow = rows()[0];
    const cells = Array.from(firstRow.querySelectorAll('td'));
    expect(cells[0].getAttribute('role')).toBe('rowheader');
    expect(cells[1].getAttribute('role')).toBe('gridcell');
    expect(cells[2].getAttribute('role')).toBe('gridcell');
    const headers: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('th'));
    expect(headers.every((h) => h.getAttribute('role') === 'columnheader')).toBe(true);
    expect(headers.map((h) => h.textContent?.trim())).toEqual(['Name', 'Size', 'Kind']);
  });

  it('keeps exactly one row in the tab order (roving tabindex)', () => {
    const tabindexes = rows().map((r) => r.getAttribute('tabindex'));
    expect(tabindexes.filter((t) => t === '0').length).toBe(1);
    expect(tabindexes[0]).toBe('0'); // the first row starts as the tab stop
    expect(tabindexes.slice(1).every((t) => t === '-1')).toBe(true);
  });

  it('names each branch toggle distinctly by default (from the first column value, WCAG 2.4.6)', () => {
    // No rowExpandLabel input set → the default derives from the first column ("Toggle src").
    const toggle = rows()[0].querySelector('.cae-tree-table__toggle');
    expect(toggle?.getAttribute('aria-label')).toBe('Toggle src');
  });

  it('keeps the roving tab stop on a real NODE when a different row is expanded by mouse (no index desync)', async () => {
    attach();
    rows()[1].focus(); // README.md becomes active
    fixture.detectChanges(); // flush the (focus) → activeNode → tabindex binding
    expect(rows()[1].getAttribute('tabindex')).toBe('0');
    // Mouse-expand src (a DIFFERENT row): with a positional index the stop would strand on whatever slid
    // into README's old slot; tracking the node keeps it coherent (here it follows the clicked node, src).
    rows()[0].querySelector<HTMLButtonElement>('.cae-tree-table__toggle')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const zeros = rows().filter((r) => r.getAttribute('tabindex') === '0');
    expect(zeros.length).toBe(1); // still exactly one tab stop
    expect(zeros[0].querySelector('td')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('src');
  });

  describe('keyboard navigation', () => {
    beforeEach(() => attach());

    it('Down/Up move roving focus between visible rows', () => {
      key(rows()[0], 'ArrowDown');
      expect(document.activeElement).toBe(rows()[1]);
      expect(rows()[1].getAttribute('tabindex')).toBe('0');
      expect(rows()[0].getAttribute('tabindex')).toBe('-1');
      key(rows()[1], 'ArrowUp');
      expect(document.activeElement).toBe(rows()[0]);
    });

    it('Down stops at the last row; Up stops at the first (no wrap)', () => {
      key(rows()[0], 'ArrowUp');
      expect(document.activeElement).toBe(rows()[0]);
      key(rows()[0], 'ArrowDown'); // -> README.md (last of the 2 collapsed rows)
      key(rows()[1], 'ArrowDown');
      expect(document.activeElement).toBe(rows()[1]);
    });

    it('Home/End jump to the first/last visible row', async () => {
      fixture.componentRef.setInput('expanded', [SRC]);
      fixture.detectChanges();
      await fixture.whenStable();
      key(rows()[0], 'End');
      expect(document.activeElement).toBe(rows()[rows().length - 1]);
      key(rows()[rows().length - 1], 'Home');
      expect(document.activeElement).toBe(rows()[0]);
    });

    it('Right expands a collapsed branch, then (once expanded) steps into the first child', () => {
      rows()[0].focus();
      // src collapsed → first Right expands it in place (focus stays on src, whose <tr> is preserved
      // across the re-render by the node-identity trackBy).
      key(rows()[0], 'ArrowRight');
      expect(component.expanded()).toContain(SRC);
      expect(rowText()).toEqual(['src', 'app', 'index.html', 'README.md']);
      expect(document.activeElement).toBe(rows()[0]);
      // Second Right → into the first child (app, row index 1).
      key(rows()[0], 'ArrowRight');
      expect(document.activeElement).toBe(rows()[1]);
    });

    it('Right on a leaf does nothing', () => {
      rows()[1].focus(); // README.md is a leaf
      key(rows()[1], 'ArrowRight');
      expect(document.activeElement).toBe(rows()[1]);
      expect(component.expanded()).toEqual([]);
    });

    it('Left collapses an expanded branch, then climbs to the parent', async () => {
      fixture.componentRef.setInput('expanded', [SRC]);
      fixture.detectChanges();
      await fixture.whenStable();
      // Focus the child app (row 1), Left → climb to parent src (row 0), src still expanded.
      key(rows()[1], 'ArrowLeft');
      expect(document.activeElement).toBe(rows()[0]);
      expect(component.expanded()).toContain(SRC);
      // Left on the expanded parent → collapse it (focus stays), children disappear.
      key(rows()[0], 'ArrowLeft');
      expect(component.expanded()).not.toContain(SRC);
      expect(rowText()).toEqual(['src', 'README.md']);
    });

    it('Enter and Space activate the focused row (nodeActivate)', () => {
      const activated: CaeTreeTableNode<Item>[] = [];
      component.nodeActivate.subscribe((n) => activated.push(n));
      const enter = key(rows()[0], 'Enter');
      const space = key(rows()[1], ' ');
      expect(activated).toEqual([SRC, README]);
      expect(enter.defaultPrevented).toBe(true);
      expect(space.defaultPrevented).toBe(true);
    });

    it('preventDefaults the arrow keys (so the page does not scroll)', () => {
      const ev = key(rows()[0], 'ArrowDown');
      expect(ev.defaultPrevented).toBe(true);
    });

    it('leaves Alt+Arrow to the browser (#581)', () => {
      rows()[0].focus();
      const ev = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      rows()[0].dispatchEvent(ev);
      expect(document.activeElement).toBe(rows()[0]); // focus did not move
      expect(ev.defaultPrevented).toBe(false);
    });
  });

  describe('expansion via the chevron (pointer path)', () => {
    it('a branch renders a toggle button; a leaf does not', () => {
      const [src, readme] = rows();
      expect(src.querySelector('.cae-tree-table__toggle')).not.toBeNull();
      expect(readme.querySelector('.cae-tree-table__toggle')).toBeNull();
    });

    it('clicking the toggle expands the branch and updates the two-way model', async () => {
      const toggle = rows()[0].querySelector<HTMLButtonElement>('.cae-tree-table__toggle')!;
      toggle.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.expanded()).toEqual([SRC]);
      expect(rowText()).toEqual(['src', 'app', 'index.html', 'README.md']);
      // The toggle is out of the tab order (keyboard uses Right/Left on the row).
      expect(toggle.getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('empty state', () => {
    it('renders a persistent status live region with the empty message when there are no nodes', async () => {
      fixture.componentRef.setInput('nodes', []);
      fixture.componentRef.setInput('emptyMessage', 'Nothing here.');
      fixture.detectChanges();
      await fixture.whenStable();
      const empty = fixture.nativeElement.querySelector('.cae-tree-table__empty');
      expect(empty?.getAttribute('role')).toBe('status');
      expect(empty?.getAttribute('aria-live')).toBe('polite');
      expect(empty?.textContent?.trim()).toBe('Nothing here.');
      expect(rows().length).toBe(0);
    });

    it('collapses the live region text (no announcement) while rows are present', () => {
      const empty = fixture.nativeElement.querySelector('.cae-tree-table__empty');
      expect(empty?.textContent?.trim()).toBe('');
    });
  });
});

// ---- Custom cell templates (caeTreeCellDef) — a projecting host, mirroring cae-table's spec ----

@Component({
  imports: [CaeTreeTable, CaeTreeCellDef],
  template: `
    <cae-tree-table [nodes]="nodes" [columns]="columns" ariaLabel="Files">
      <ng-template
        caeTreeCellDef="name"
        let-row
        let-value="value"
        let-level="level"
        let-exp="expandable"
      >
        <span class="tpl-name" [class.branch]="exp">{{ value }} / L{{ level }}</span>
      </ng-template>
    </cae-tree-table>
  `,
})
class TemplatedHost {
  readonly nodes = TREE;
  readonly columns = COLS;
}

describe('CaeTreeTable custom cells', () => {
  it('renders the caeTreeCellDef template for its column with the tree context (value/level/expandable)', async () => {
    await TestBed.configureTestingModule({ imports: [TemplatedHost] }).compileComponents();
    const fixture = TestBed.createComponent(TemplatedHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const first = fixture.nativeElement.querySelector('.tpl-name');
    // src is a level-0 branch: value "src", level 0, expandable true.
    expect(first?.textContent?.replace(/\s+/g, ' ').trim()).toBe('src / L0');
    expect(first?.classList.contains('branch')).toBe(true);
    fixture.nativeElement.remove();
  });
});

// ---- Interactive cell content must not be hijacked by the row keyboard handler ----

@Component({
  imports: [CaeTreeTable, CaeTreeCellDef],
  template: `
    <cae-tree-table
      [nodes]="nodes"
      [columns]="columns"
      ariaLabel="Files"
      (nodeActivate)="activated()"
    >
      <ng-template caeTreeCellDef="size" let-value="value">
        <button type="button" class="cell-btn">{{ value }}</button>
      </ng-template>
    </cae-tree-table>
  `,
})
class InteractiveCellHost {
  readonly nodes = TREE;
  readonly columns = COLS;
  activateCount = 0;
  activated = (): void => {
    this.activateCount += 1;
  };
}

describe('CaeTreeTable interactive cell content', () => {
  it('does not hijack keydown that originates from a focusable control inside a cell', async () => {
    await TestBed.configureTestingModule({ imports: [InteractiveCellHost] }).compileComponents();
    const fixture = TestBed.createComponent(InteractiveCellHost);
    const host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();

    const rowCount = (): number =>
      fixture.nativeElement.querySelectorAll('[data-cae-tt-row]').length;
    expect(rowCount()).toBe(2); // src + README.md, collapsed
    const cellBtn = fixture.nativeElement.querySelector('.cell-btn') as HTMLButtonElement;
    cellBtn.focus();
    // Enter/Space/arrows from the button must NOT fire nodeActivate or toggle the tree — the row handler
    // returns early because the event target is the button, not the row (target !== currentTarget).
    for (const k of ['Enter', ' ', 'ArrowRight', 'ArrowLeft']) {
      cellBtn.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();
    }
    expect(host.activateCount).toBe(0); // no spurious activation
    expect(rowCount()).toBe(2); // tree not expanded/collapsed by the caret keys
    fixture.nativeElement.remove();
  });
});

// ---- Dev-warnings ----

@Component({
  imports: [CaeTreeTable, CaeTreeCellDef],
  template: `
    <cae-tree-table [nodes]="nodes" [columns]="columns" ariaLabel="Files">
      <ng-template caeTreeCellDef="nope">typo</ng-template>
    </cae-tree-table>
  `,
})
class TypoHost {
  readonly nodes = TREE;
  readonly columns = COLS;
}

describe('CaeTreeTable dev-warnings', () => {
  // Manual console.warn capture (framework-agnostic; the house pattern in table.spec) rather than a
  // Jasmine/Vitest spy — these run under the Angular unit-test builder (Vitest), not Jasmine.
  let warnings: string[];
  let realWarn: typeof console.warn;
  beforeEach(() => {
    warnings = [];
    realWarn = console.warn;
    console.warn = (msg?: unknown) => warnings.push(String(msg));
  });
  afterEach(() => {
    console.warn = realWarn;
  });

  it('warns when a caeTreeCellDef key matches no column', async () => {
    await TestBed.configureTestingModule({ imports: [TypoHost] }).compileComponents();
    const fixture = TestBed.createComponent(TypoHost);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(warnings.some((w) => w.includes('matches no column key'))).toBe(true);
    fixture.nativeElement.remove();
  });

  it('throws a clear message on a duplicate column key (preempting mat-table’s crash)', async () => {
    await TestBed.configureTestingModule({ imports: [CaeTreeTable] }).compileComponents();
    const fixture = TestBed.createComponent(CaeTreeTable<Item>);
    fixture.componentRef.setInput('nodes', TREE);
    fixture.componentRef.setInput('columns', [
      { key: 'name', header: 'Name' },
      { key: 'name', header: 'Also name' },
    ]);
    // The throw is in ngOnInit (before first render), so detectChanges surfaces it.
    expect(() => fixture.detectChanges()).toThrowError(/duplicate column key/);
    fixture.nativeElement.remove();
  });
});
