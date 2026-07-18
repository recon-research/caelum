import { hasModifierKey } from '@angular/cdk/keycodes';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  computed,
  contentChildren,
  effect,
  inject,
  input,
  isDevMode,
  model,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { CaeTreeCellContext, CaeTreeCellDef } from './tree-cell-def';

/**
 * Process-global counter seeding a unique per-instance `<caption>` id — the `aria-labelledby` target
 * that names the grid. Distinctness across tables is what matters; never rendered as visible text.
 */
let nextTreeTableId = 0;

/**
 * A node in a {@link CaeTreeTable}. The row's cell values come from {@link data}; nest via
 * {@link children}, and a node whose `children` array is present and non-empty is **expandable**.
 * Vendor-neutral (no Material type). Membership in the {@link CaeTreeTable.expanded} model is by
 * **reference identity** on the node object — a fresh `nodes` input built with new objects resets
 * expansion (a stable-identity `dataKey` is a follow-up, mirroring cae-table's #144 note).
 *
 * @typeParam T - the row (cell-data) shape.
 */
export interface CaeTreeTableNode<T> {
  /** The row object this node contributes — its properties feed the columns (`data[column.key]`). */
  data: T;
  /** Child nodes; presence (and non-emptiness) makes this node an expandable branch. */
  children?: readonly CaeTreeTableNode<T>[];
}

/**
 * A column in a {@link CaeTreeTable}. Deliberately lean — `key` + `header` only — because slice 1
 * supports neither sort nor sticky (unlike {@link CaeTableColumn}); exposing config fields that do
 * nothing would be a false affordance. Sort / sticky / resize arrive as follow-ups and extend this
 * interface then (additively).
 */
export interface CaeTreeTableColumn {
  /**
   * A **flat** property name read off each node's `data` for this column's cell text. Dot paths
   * (`field="user.name"`) are not resolved — a nested key renders a blank default cell; to *render* a
   * nested value, project a `caeTreeCellDef` template (the node's `data` is in scope: `{{ row.user.name }}`).
   */
  key: string;
  /** Visible header-cell label. */
  header: string;
}

/**
 * One rendered (flattened) row — a source node paired with its derived tree position. Produced by the
 * flatten pass (Book 10 §3.4) and consumed only by this component's own template + `mat-table` diff;
 * **library-internal, deliberately not exported** — no public input/output/method produces or accepts one
 * (a `caeTreeCellDef` template receives the leaner {@link CaeTreeCellContext} instead), so exporting it
 * would be dead, version-stable surface. Slice-1 rows are re-derived on every `nodes`/`expanded` change,
 * so hold a node reference, not one of these wrappers.
 */
interface CaeTreeTableRow<T> {
  /** The source node (the stable identity used for `trackBy` and the expanded model). */
  node: CaeTreeTableNode<T>;
  /** The node's `data` — the cell-value source. */
  data: T;
  /** 0-based depth (a root is 0) → drives the indent and `aria-level` (`level + 1`). */
  level: number;
  /** Whether this node has children. */
  expandable: boolean;
  /** Whether this (expandable) node is currently expanded. */
  expanded: boolean;
  /** 1-based position among its siblings → `aria-posinset`. */
  posinset: number;
  /** Sibling count → `aria-setsize`. */
  setsize: number;
}

/**
 * `cae-tree-table` — a **hierarchical** data table (`reference/COMPARISON.md`: `p-treeTable` →
 * `cae-tree-table`). Rows form an expand/collapse tree rendered as a WAI-ARIA **`treegrid`**: the
 * data cousin of a TreeSelect (Book 10 §3.4 — *"same hierarchical data and the same expansion engine,
 * different jobs — TreeTable displays and navigates the hierarchy in a grid; TreeSelect resolves a
 * value from it into a form"*). Composed over Material's `mat-table` for the cell/border/density
 * theming (free through the token bridge, D-04), with the tree structure and keyboard model layered on
 * top — it is **not** an extension of `cae-table` (different role, data shape, and navigation).
 *
 * **Flattened tree** (Book 10 §3.4). The nested {@link nodes} are flattened to a derived list of the
 * currently-*visible* rows (a collapsed branch contributes only itself) via a `computed`, so expansion
 * is **view state held in the {@link expanded} signal model, never in the row data** (Book 10 §3.2),
 * and the render stays a flat row list (virtualization-ready — a follow-up). `mat-table` renders that
 * list over a stable {@link MatTableDataSource} with a node-identity `trackBy`, so expanding a branch
 * *inserts* child rows without tearing down the parent row — which is what keeps roving focus alive
 * across an expand/collapse.
 *
 * **Accessibility — a `treegrid` with row-level roving focus.** The table is `role="treegrid"`; each
 * data row is a `role="row"` carrying `aria-level`, `aria-expanded` (branches only), `aria-posinset`
 * and `aria-setsize`; the lead cell is a `rowheader`, the rest `gridcell`; headers are `columnheader`.
 * Exactly **one** row is in the tab order (roving `tabindex`); within the grid the arrow keys drive
 * navigation — **Down/Up** move between visible rows, **Right** expands a collapsed branch (then, when
 * already expanded, moves to the first child), **Left** collapses an expanded branch (then, when a leaf
 * or already collapsed, moves to the parent), **Home/End** jump to the first/last visible row, and
 * **Enter/Space** emit {@link nodeActivate}. The expand chevron is a `tabindex="-1"` pointer affordance
 * (keyboard users expand/collapse with Right/Left — cae-tree's convention); the row, not the button,
 * owns the `aria-expanded` state, so the button is not double-announced. Give the grid an accessible
 * name with a visible `caption` (preferred) **or** `ariaLabel` — not both (the caption wins, avoiding
 * the #70 label-in-name mismatch; naming is via `aria-labelledby` since a `treegrid`-role element does
 * not reliably take its name from a native `<caption>`). The empty state is a persistent `role="status"`
 * live region intended to announce a populated→empty transition — v1 only reaches empty via `[nodes]=[]`
 * (no filter yet); the SR announcement itself, like the real-browser keyboard/focus behaviour, is
 * confirmed in the M4 pass (#263, #240).
 *
 * **Custom cell content.** Project an `<ng-template caeTreeCellDef="<column-key>">` per column to render
 * a badge/link/formatted value instead of text, with the {@link CaeTreeCellContext} (`$implicit` =
 * node data, `value`, plus the tree position `level`/`expandable`/`expanded`) in scope. The library
 * still owns the `<tr>`/`<td>` and the lead column's toggle+indent, so the `treegrid` structure is
 * preserved. See {@link CaeTreeCellDef}.
 *
 * **v1 scope** (#262): hierarchical rows, expand/collapse, `treegrid` a11y with row-level roving,
 * text + custom-template cells. Follow-ups: node **selection** (checkbox, tri-state propagation),
 * **sort / filter / lazy child-loading / pagination / sticky**, full 2-D per-cell roving, and virtual
 * scroll at scale (Book 10 §3.3). Zoneless-compatible: `OnPush` + signal state (D-12). No `color`
 * input — theming is free via the token bridge (D-04).
 *
 * @typeParam T - the row (cell-data) shape. **Unconstrained** so a plain typed interface works (see
 * {@link CaeTable}'s note on why a `Record<string, unknown>` constraint would reject typed rows);
 * indexing is confined to {@link cellValue}, which casts.
 */
@Component({
  selector: 'cae-tree-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTableModule, NgTemplateOutlet],
  template: `
    <table
      mat-table
      role="treegrid"
      [dataSource]="dataSource"
      [trackBy]="trackByNode"
      [attr.aria-labelledby]="caption() ? captionId : null"
      [attr.aria-label]="caption() ? null : ariaLabel() || null"
    >
      @if (caption()) {
        <!-- Named via aria-labelledby → this caption's id, NOT native caption-as-name: the caption→name
             mapping is an HTML-AAM rule for role="table"; on a role="treegrid" (a name-from-author role)
             several AT/browser pairs don't honor it, which would leave the grid unnamed. aria-labelledby
             is authoritative regardless of role, and keeps the visible-text = accessible-name match. -->
        <caption [id]="captionId">
          {{
            caption()
          }}
        </caption>
      }

      @for (col of columns(); track col.key; let ci = $index) {
        <ng-container [matColumnDef]="col.key">
          <th mat-header-cell *matHeaderCellDef scope="col">{{ col.header }}</th>
          <td mat-cell *matCellDef="let row" [attr.role]="ci === 0 ? 'rowheader' : 'gridcell'">
            @if (ci === 0) {
              <!-- Lead cell: depth indent (a CSS custom property → token-scaled padding, no hardcoded
                   value), then the expand chevron for a branch (a pointer affordance; keyboard uses
                   Right/Left on the row), then the cell content. -->
              <span class="cae-tree-table__lead" [style.--cae-tt-level]="row.level">
                @if (row.expandable) {
                  <button
                    type="button"
                    class="cae-tree-table__toggle"
                    tabindex="-1"
                    [attr.aria-label]="expandLabel(row)"
                    (click)="onToggleClick(row.node, $event)"
                  >
                    <span
                      class="cae-tree-table__chevron"
                      [class.cae-tree-table__chevron--open]="row.expanded"
                      aria-hidden="true"
                    ></span>
                  </button>
                } @else {
                  <span class="cae-tree-table__toggle-spacer" aria-hidden="true"></span>
                }
                @if (cellTemplates().get(col.key); as tpl) {
                  <ng-container
                    [ngTemplateOutlet]="tpl"
                    [ngTemplateOutletContext]="cellContext(row, col.key)"
                  ></ng-container>
                } @else {
                  {{ cellText(row.data, col.key) }}
                }
              </span>
            } @else {
              @if (cellTemplates().get(col.key); as tpl) {
                <ng-container
                  [ngTemplateOutlet]="tpl"
                  [ngTemplateOutletContext]="cellContext(row, col.key)"
                ></ng-container>
              } @else {
                {{ cellText(row.data, col.key) }}
              }
            }
          </td>
        </ng-container>
      }

      <tr mat-header-row *matHeaderRowDef="columnKeys()"></tr>
      <tr
        mat-row
        *matRowDef="let row; columns: columnKeys(); let i = index"
        [attr.data-cae-tt-row]="i"
        [attr.data-cae-tt-scope]="rowScope"
        [attr.aria-level]="row.level + 1"
        [attr.aria-expanded]="row.expandable ? row.expanded : null"
        [attr.aria-posinset]="row.posinset"
        [attr.aria-setsize]="row.setsize"
        [tabindex]="activeRow() === i ? 0 : -1"
        (keydown)="onRowKeydown($event, i)"
        (focus)="activeNode.set(row.node)"
      ></tr>
    </table>

    <!-- Persistent live region (always mounted, text varies) so a data-becomes-empty transition is
         ANNOUNCED (WCAG 4.1.3); :empty hides the strip while rows are present. Mirrors cae-table. -->
    <div class="cae-tree-table__empty" role="status" aria-live="polite">{{ emptyText() }}</div>
  `,
  styles: `
    :host {
      display: block;
    }
    table {
      width: 100%;
    }
    /* Lead cell layout: the indent pushes the whole run (chevron + content); token-scaled by depth via
       the --cae-tt-level custom property set per row (no hardcoded px — one indent step = --cae-space-4). */
    .cae-tree-table__lead {
      display: inline-flex;
      align-items: center;
      gap: var(--cae-space-1);
      padding-inline-start: calc(var(--cae-tt-level, 0) * var(--cae-space-4));
    }
    /* Toggle button + its leaf-row spacer share a width so text lines up across branches and leaves — so
       the WCAG 2.5.8 floor goes on the SHARED rule, keeping branch (toggle) and leaf (spacer) aligned. The
       borderless toggle is a density-invariant 24px (--cae-space-4 would tighten to 12px under compact); the
       chevron glyph stays centered and unchanged, only the tap area grows (interactive-hit-target floor). */
    .cae-tree-table__toggle,
    .cae-tree-table__toggle-spacer {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--cae-space-4);
      block-size: var(--cae-space-4);
      min-inline-size: var(--cae-target-min);
      min-block-size: var(--cae-target-min);
      flex: none;
    }
    .cae-tree-table__toggle {
      padding: 0;
      border: 0;
      background: none;
      color: var(--cae-color-on-surface-variant);
      cursor: pointer;
    }
    /* Decorative chevron drawn from currentColor (no icon font, no hardcoded color) — points inline-end
       when collapsed, rotates down when open. Mirrors cae-table's chevron. */
    .cae-tree-table__chevron {
      display: inline-block;
      inline-size: 0.5em;
      block-size: 0.5em;
      border-inline-end: 2px solid currentColor;
      border-block-end: 2px solid currentColor;
      transform: rotate(-45deg);
      transition: transform 120ms ease;
    }
    .cae-tree-table__chevron--open {
      transform: rotate(45deg);
    }
    /* One roving focus ring per grid, on the focused row (the roving tab stop lives on the <tr>). Uses
       the house focus-ring token + its standard positive offset (as cae-tree does) — a negative offset
       can clip against a thin row's cell borders. Real-browser render is verified in the M4 pass (#240). */
    tr[mat-row]:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
    }
    .cae-tree-table__empty {
      color: var(--cae-color-on-surface-variant);
    }
    .cae-tree-table__empty:not(:empty) {
      padding: var(--cae-space-3);
    }
    .cae-tree-table__empty:empty {
      display: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .cae-tree-table__chevron {
        transition: none;
      }
    }
  `,
})
export class CaeTreeTable<T = Record<string, unknown>> implements OnInit {
  /** The hierarchical rows, as nested nodes. A node with non-empty `children` is an expandable branch. */
  readonly nodes = input<readonly CaeTreeTableNode<T>[]>([]);
  /** The column configuration (order + `key`/`header`). The first column carries the toggle + indent. */
  readonly columns = input<readonly CaeTreeTableColumn[]>([]);
  /**
   * A visible `<caption>` naming the grid (preferred over {@link ariaLabel}). If both are set the
   * caption wins as the accessible name and `aria-label` is suppressed (the #70 label-in-name seam).
   */
  readonly caption = input('');
  /** Accessible name for the grid when no visible {@link caption} is given. */
  readonly ariaLabel = input('');
  /** Text for the persistent empty-state live region when there are no nodes. */
  readonly emptyMessage = input('No data.');
  /**
   * Accessible name for a branch's expand-toggle button. The row (not the button) conveys open/closed
   * via `aria-expanded`, so a **stable** name (naming *what* the button controls) is correct. When
   * unset, the default derives from the row's **first-column** value (`Toggle src`, `Toggle app`, …) so
   * every toggle is distinctly named (WCAG 2.4.6) rather than a repeated generic label; supply a
   * function for a fully custom name. See {@link expandLabel}.
   */
  readonly rowExpandLabel = input<((data: T) => string) | undefined>(undefined);

  /**
   * Two-way set of **expanded** nodes (a vendor-neutral `readonly CaeTreeTableNode<T>[]`). Membership
   * is by **reference identity** on the node object (like cae-table's `[(expanded)]`). Bind `[(expanded)]`
   * for two-way, or `(expandedChange)` to observe. Expansion is **view state**, held here, never in the
   * row data (Book 10 §3.2).
   *
   * **Focus note (M4, #263):** the keyboard collapse path is safe — Left collapses the *focused* branch,
   * which stays present. But a **programmatic** collapse (or a `[nodes]` refresh) that removes a
   * *descendant* row while keyboard focus is inside it drops DOM focus to `<body>` (the roving tab stop
   * re-homes to a valid row, but `.focus()` is not restored); restoring it is a real-browser follow-up,
   * the same hazard cae-table documents at #241.
   */
  readonly expanded = model<readonly CaeTreeTableNode<T>[]>([]);
  /** Emitted when a row is activated (Enter/Space on the focused row) — the whole node is emitted. */
  readonly nodeActivate = output<CaeTreeTableNode<T>>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** A unique per-instance number, seeding the caption id and the row scope attribute. */
  private readonly instanceId = nextTreeTableId++;
  /** Unique per-instance `<caption>` id — the `aria-labelledby` target that names the grid (see the template). */
  protected readonly captionId = `cae-tree-table-caption-${this.instanceId}`;
  /** Per-instance row-scope token, stamped on each row so {@link focusRow} finds THIS table's rows, not a nested one's. */
  protected readonly rowScope = String(this.instanceId);

  /** The `mat-table` `displayedColumns` — just the config keys (no built-in columns in v1). */
  protected readonly columnKeys = computed(() => this.columns().map((c) => c.key));

  /** O(1) expanded-membership derived from the two-way {@link expanded} model. */
  private readonly expandedSet = computed(() => new Set<CaeTreeTableNode<T>>(this.expanded()));

  /**
   * The flattened list of currently-visible rows — the derived render model (Book 10 §3.4). A collapsed
   * branch contributes only itself; an expanded branch is immediately followed by its (recursively
   * flattened) children, so a child's render index is always `parentIndex + 1..`. Recomputed on any
   * `nodes` or `expanded` change; `mat-table` diffs it by node identity ({@link trackByNode}).
   */
  protected readonly visibleRows = computed<readonly CaeTreeTableRow<T>[]>(() => {
    const expanded = this.expandedSet();
    const out: CaeTreeTableRow<T>[] = [];
    const walk = (nodes: readonly CaeTreeTableNode<T>[], level: number): void => {
      const setsize = nodes.length;
      nodes.forEach((node, idx) => {
        const expandable = !!node.children && node.children.length > 0;
        const isExpanded = expandable && expanded.has(node);
        out.push({
          node,
          data: node.data,
          level,
          expandable,
          expanded: isExpanded,
          posinset: idx + 1,
          setsize,
        });
        if (isExpanded) walk(node.children!, level + 1);
      });
    };
    walk(this.nodes(), 0);
    return out;
  });

  /**
   * Stable `mat-table` data source; kept in sync with {@link visibleRows} by the constructor effect.
   * Explicitly annotated: `MatTableDataSource`'s inferred type transitively names `MatPaginator`, which
   * declaration emit can't reference portably (TS2883) — the annotation pins it.
   */
  protected readonly dataSource: MatTableDataSource<CaeTreeTableRow<T>> = new MatTableDataSource<
    CaeTreeTableRow<T>
  >([]);

  /** Node-identity `trackBy` so an expand *inserts* child rows without tearing the parent row down (focus survival). */
  protected readonly trackByNode = (_: number, row: CaeTreeTableRow<T>): unknown => row.node;

  /**
   * The **node** that owns the roving tab stop — tracked by reference, not by index, so the tab stop
   * follows its node across structural changes (an expand/collapse that shifts rows above it, or a mouse
   * expand while a different row is focused). A positional index would desync: expanding row 0 by mouse
   * while row 1 is the tab stop would leave the stop on whatever slid into slot 1. `null` until first focus.
   */
  protected readonly activeNode = signal<CaeTreeTableNode<T> | null>(null);

  /**
   * The row index that owns the single tab stop — the position of {@link activeNode} in the live rows,
   * or `-1` when there are no rows (nothing tabbable), or `0` when the active node is unset / no longer
   * visible (a sensible default tab stop). Exactly one row is `tabindex="0"`; every other is `-1` (roving
   * tabindex — cae-tree's a11y philosophy applied to a grid).
   */
  protected readonly activeRow = computed(() => {
    const rows = this.visibleRows();
    if (rows.length === 0) return -1;
    const node = this.activeNode();
    const idx = node ? rows.findIndex((r) => r.node === node) : -1;
    return idx >= 0 ? idx : 0;
  });

  /**
   * Custom cell renderers projected as `<ng-template caeTreeCellDef="<key>">`. Indexed by column key
   * so a templated column renders its template and the rest keep the text default.
   */
  private readonly cellDefs = contentChildren(CaeTreeCellDef);

  /** Column key → its custom cell {@link CaeTreeCellDef} template (empty when none are projected). */
  protected readonly cellTemplates = computed(() => {
    const map = new Map<string, TemplateRef<CaeTreeCellContext<T>>>();
    for (const def of this.cellDefs()) map.set(def.caeTreeCellDef(), def.template);
    return map;
  });

  /** Empty-state text: '' when there are nodes (so the live region collapses), else the message. */
  protected readonly emptyText = computed(() => (this.nodes().length ? '' : this.emptyMessage()));

  constructor() {
    // Keep the stable data source in sync with the derived visible-row list. A stable MatTableDataSource
    // (updating `.data`) rather than a fresh `[dataSource]` array each change is what preserves rows
    // across an expand: the retained IterableDiffer emits inserts/identity-changes, not a full re-render
    // (which would drop focus). Mirrors cae-table's data-source effect. The spread is not decorative: it
    // widens visibleRows()'s `readonly` array to the mutable one MatTableDataSource.data requires.
    effect(() => {
      this.dataSource.data = [...this.visibleRows()];
    });

    // Dev-only: warn on a caeTreeCellDef that is a typo (matches no column → silently ignored) or a
    // duplicate (two templates for one column → the last silently wins). An effect (not ngOnInit)
    // because content children resolve only after ngAfterContentInit; reactive so it catches a later
    // columns/template change. Zero prod cost. Mirrors cae-table's cell-template warn.
    if (isDevMode()) {
      effect(() => {
        const columns = this.columns();
        // Skip while columns is still empty — a common async-load window where every caeTreeCellDef would
        // transiently "match no column" though the config is correct and resolves a tick later.
        if (columns.length === 0) return;
        const keys = new Set(columns.map((c) => c.key));
        const seen = new Set<string>();
        for (const def of this.cellDefs()) {
          const key = def.caeTreeCellDef();
          if (!keys.has(key)) {
            console.warn(
              `cae-tree-table: <ng-template caeTreeCellDef="${key}"> matches no column key — the template is ignored (check the key against your columns config).`,
            );
          } else if (seen.has(key)) {
            console.warn(
              `cae-tree-table: duplicate <ng-template caeTreeCellDef="${key}"> — the last one wins and the earlier template(s) are ignored (one caeTreeCellDef per column key).`,
            );
          } else {
            seen.add(key);
          }
        }
      });
    }
  }

  /**
   * Dev-only config validation. In `ngOnInit` (not an effect) so it runs BEFORE the first render — a
   * clear cae-tree-table message then preempts the framework-internal crash a duplicate column key
   * would otherwise cause (`mat-table`'s "Duplicate column definition name", since the key is the
   * `matColumnDef` id and the `@for` track key). Zero prod cost; required inputs are set by `ngOnInit`.
   */
  ngOnInit(): void {
    if (!isDevMode()) return;
    const keys = this.columns().map((c) => c.key);
    const dupes = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
    if (dupes.length) {
      throw new Error(
        `cae-tree-table: duplicate column key(s) "${dupes.join('", "')}" — each CaeTreeTableColumn.key must be unique (it is the matColumnDef id and the @for track key).`,
      );
    }
  }

  /** The raw cell value (`data[key]`) — passed to a {@link CaeTreeCellDef} template as `value` and used by {@link cellText}. Nullish-safe. */
  protected cellValue(data: T, key: string): unknown {
    return data == null ? undefined : (data as Record<string, unknown>)[key];
  }

  /** Nullish-safe cell text: renders '' (an empty cell) rather than the string "null"/"undefined". */
  protected cellText(data: T, key: string): string {
    const value = this.cellValue(data, key);
    return value == null ? '' : String(value);
  }

  /**
   * The {@link CaeTreeCellContext} handed to a custom cell template. A method (not an inline literal
   * duplicated in the lead + plain cell branches) — its key set is constant, so `NgTemplateOutlet`
   * updates the existing view's context rather than recreating it on each change detection.
   */
  protected cellContext(row: CaeTreeTableRow<T>, key: string): CaeTreeCellContext<T> {
    return {
      $implicit: row.data,
      value: this.cellValue(row.data, key),
      level: row.level,
      expandable: row.expandable,
      expanded: row.expanded,
    };
  }

  /**
   * The accessible name for a row's expand toggle: the consumer's {@link rowExpandLabel} if given, else a
   * default derived from the row's **first-column** value (`Toggle src`, …) so every toggle is distinctly
   * named (WCAG 2.4.6). Falls back to a generic name only when there is no first column / no value.
   */
  protected expandLabel(row: CaeTreeTableRow<T>): string {
    const custom = this.rowExpandLabel();
    if (custom) return custom(row.data);
    const firstKey = this.columns()[0]?.key;
    const name = firstKey ? this.cellText(row.data, firstKey) : '';
    return name ? `Toggle ${name}` : 'Toggle row';
  }

  /** Whether a node is currently expanded (by reference) — drives its chevron + `aria-expanded`. */
  protected isExpanded(node: CaeTreeTableNode<T>): boolean {
    return this.expandedSet().has(node);
  }

  private setExpanded(node: CaeTreeTableNode<T>, open: boolean): void {
    const cur = this.expanded();
    const has = cur.includes(node);
    if (open && !has) this.expanded.set([...cur, node]);
    else if (!open && has) this.expanded.set(cur.filter((n) => n !== node));
  }

  /**
   * Toggle a branch's expanded state — the pointer path (the chevron button); stops the row from also
   * handling it. Also moves the roving tab stop to this node: clicking the (`tabindex=-1`) chevron
   * doesn't fire the row's `(focus)`, so without this the tab stop would stay on whatever row was last
   * focused while the rows shift underneath it.
   */
  protected onToggleClick(node: CaeTreeTableNode<T>, event: Event): void {
    event.stopPropagation();
    this.activeNode.set(node);
    this.setExpanded(node, !this.isExpanded(node));
  }

  /**
   * The `treegrid` keyboard model, per row. Down/Up move between visible rows; Right expands a collapsed
   * branch then (once expanded) steps into the first child; Left collapses an expanded branch then (leaf
   * or collapsed) climbs to the parent; Home/End jump to the ends; Enter/Space activate. Every handled
   * key is `preventDefault`ed so arrows don't scroll the page and Space doesn't page-jump.
   *
   * **Only handles keys targeting the row itself.** The listener is on the `<tr>`, so a keydown from a
   * focusable control inside a `caeTreeCellDef` cell (a link, button, or text input — supported content)
   * bubbles here too; without the guard, Enter would fire `nodeActivate` instead of the link, and the
   * arrows would collapse/expand the tree instead of moving a text caret (WCAG 2.1.1). `event.target ===
   * currentTarget` is true exactly when the row (the roving tab stop) holds focus.
   */
  protected onRowKeydown(event: KeyboardEvent, i: number): void {
    if (hasModifierKey(event)) return; // Alt+Arrow=Back, Ctrl+Home/End=document, Ctrl+0/±=zoom (#581)
    if (event.target !== event.currentTarget) return;
    const rows = this.visibleRows();
    const row = rows[i];
    if (!row) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusRow(i + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.focusRow(i - 1);
        break;
      case 'Home':
        event.preventDefault();
        this.focusRow(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusRow(rows.length - 1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        // Collapsed branch → expand (stay put; the revealed child is reached by a second Right, after
        // this expansion has rendered). Already-expanded branch → step into the first child (index i+1,
        // since children immediately follow their parent in the flattened list). Leaf → nothing.
        if (row.expandable && !row.expanded) this.setExpanded(row.node, true);
        else if (row.expandable && row.expanded) this.focusRow(i + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        // Expanded branch → collapse (stay put). Otherwise → climb to the parent row.
        if (row.expandable && row.expanded) this.setExpanded(row.node, false);
        else this.focusRow(this.parentIndex(i));
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.nodeActivate.emit(row.node);
        break;
    }
  }

  /** The render index of a row's parent — the nearest earlier row at a shallower level; the row itself if it is a root. */
  private parentIndex(i: number): number {
    const rows = this.visibleRows();
    const level = rows[i].level;
    for (let j = i - 1; j >= 0; j--) {
      if (rows[j].level < level) return j;
    }
    return i;
  }

  /**
   * Move roving focus to the row at `target` (clamped into range). Sets {@link activeNode} to that row's
   * node (so the tab stop tracks the node) and `.focus()`es the actual DOM row — a DOM query (not a view
   * query) so it is robust to `mat-table` stamping rows into its own row outlet. Programmatic `.focus()`
   * ignores the current `tabindex` sign, so the target focuses immediately. Called only for keys that
   * don't restructure the tree in the same keystroke (expand/collapse don't move), so the row exists.
   *
   * The row query is scoped to **this** table by the per-instance `data-cae-tt-scope` token, so a nested
   * `cae-tree-table` inside a cell (whose rows carry the same `data-cae-tt-row` index) is never matched.
   */
  private focusRow(target: number): void {
    const rows = this.visibleRows();
    if (rows.length === 0) return;
    const i = Math.max(0, Math.min(target, rows.length - 1));
    this.activeNode.set(rows[i].node);
    this.host.nativeElement
      .querySelector<HTMLElement>(`[data-cae-tt-scope="${this.rowScope}"][data-cae-tt-row="${i}"]`)
      ?.focus();
  }
}
