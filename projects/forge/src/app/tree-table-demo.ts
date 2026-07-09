import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { CaeCard } from 'caelum/card';
import {
  CaeTreeCellDef,
  CaeTreeTable,
  type CaeTreeTableColumn,
  type CaeTreeTableNode,
} from 'caelum/tree-table';

/** A row of the workspace file tree — a plain typed model (the tree-table generic is unconstrained). */
interface FileRow {
  name: string;
  kind: 'folder' | 'file';
  size: string;
}

// A small, deterministic workspace tree (no Math.random / Date.now — the reproducible-build + OnPush
// determinism rule). Branch nodes are folders; leaves are files. Named consts so the demo can seed the
// initial expansion by node reference (the [(expanded)] model is by reference identity).
const APP_DIR: CaeTreeTableNode<FileRow> = {
  data: { name: 'app', kind: 'folder', size: '—' },
  children: [
    { data: { name: 'app.ts', kind: 'file', size: '6.2 KB' } },
    { data: { name: 'app.html', kind: 'file', size: '3.1 KB' } },
    { data: { name: 'app.scss', kind: 'file', size: '1.4 KB' } },
  ],
};
const SRC_DIR: CaeTreeTableNode<FileRow> = {
  data: { name: 'src', kind: 'folder', size: '—' },
  children: [
    APP_DIR,
    { data: { name: 'main.ts', kind: 'file', size: '0.4 KB' } },
    { data: { name: 'styles.scss', kind: 'file', size: '2.0 KB' } },
  ],
};
const PUBLIC_DIR: CaeTreeTableNode<FileRow> = {
  data: { name: 'public', kind: 'folder', size: '—' },
  children: [
    { data: { name: 'favicon.ico', kind: 'file', size: '4.2 KB' } },
    { data: { name: 'robots.txt', kind: 'file', size: '0.1 KB' } },
  ],
};
const WORKSPACE: readonly CaeTreeTableNode<FileRow>[] = [
  SRC_DIR,
  PUBLIC_DIR,
  { data: { name: 'package.json', kind: 'file', size: '1.8 KB' } },
  { data: { name: 'README.md', kind: 'file', size: '5.0 KB' } },
];

/**
 * The deferred "Workspace files" `cae-tree-table` demo (#262) — the first M3 hierarchical table. It
 * shows the `treegrid` end-to-end: nested folders/files, expand/collapse by chevron *or* keyboard
 * (Right/Left on the focused row, Up/Down/Home/End to move, Enter to open), a custom `caeTreeCellDef`
 * on the Kind column, and `(nodeActivate)` driving a live-region note. Seeded with `src`/`app` open so
 * the depth is visible on load.
 *
 * `@defer`'d from App (#85): cae-tree-table pulls in `MatTable`, so keeping this component in its own
 * lazy chunk holds its bytes off Forge's initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-tree-table-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeTreeTable, CaeTreeCellDef],
  templateUrl: './tree-table-demo.html',
  styleUrl: './tree-table-demo.scss',
})
export class TreeTableDemo {
  protected readonly files = WORKSPACE;
  protected readonly columns: readonly CaeTreeTableColumn[] = [
    { key: 'name', header: 'Name' },
    { key: 'kind', header: 'Kind' },
    { key: 'size', header: 'Size' },
  ];

  /** Seed the two top folders open so the hierarchy is visible on load; two-way so the demo tracks user toggles. */
  protected readonly open = signal<readonly CaeTreeTableNode<FileRow>[]>([SRC_DIR, APP_DIR]);

  /** Persistent live-region text confirming a row activation (empty until the first Enter/Space). */
  protected readonly openedNote = signal('');

  /** A semantic accessible name for each branch's expand toggle (names *what* it controls). */
  protected readonly expandLabel = (f: FileRow): string => `Toggle ${f.name}`;

  /** Liveness: activating a row (Enter/Space) announces which file/folder was opened. */
  protected onActivate(node: CaeTreeTableNode<FileRow>): void {
    this.openedNote.set(`Opened ${node.data.name}.`);
  }
}
