/**
 * Visual-regression arms for `cae-table` (#732, provisional on #735).
 *
 * **Why the table is in the representative set.** It is the component the *density* arms are
 * actually about. `[data-density='compact']` re-declares `--cae-space-*` globally, and every other
 * component in this suite spends that budget once — a button's padding tightens by 4px and the
 * golden moves by 4px. A table spends it per row, so the same token change compounds across the
 * header and five body rows, which is both the largest signal in the suite and the one most likely
 * to be *partially* wrong (a row that stopped tracking the scale while its neighbours kept going).
 *
 * It is also the only golden with repeating horizontal rules, so it carries `--cae-color-border`
 * at the one place a border regression is legible: a stack of them, where a wrong colour reads as
 * banding rather than as a single hairline nobody looks at twice.
 *
 * Five rows rather than two — a density regression that shifts row height by a pixel is invisible
 * in one row and unmistakable by the fifth, and the widths are pinned by the data, not the
 * viewport, so the golden's size comes from the harness (see `renderArm`).
 */
import { Component } from '@angular/core';

import { CaeTable, CaeTableColumn } from './table';
import { VR_ARMS, matchArm, renderArm, resetArm } from '../testing/vr';

const COLUMNS: readonly CaeTableColumn[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'role', header: 'Role' },
  { key: 'status', header: 'Status' },
];

const ROWS = [
  { name: 'Ada Lovelace', role: 'Engineer', status: 'Active' },
  { name: 'Grace Hopper', role: 'Admiral', status: 'Active' },
  { name: 'Alan Turing', role: 'Analyst', status: 'Away' },
  { name: 'Katherine Johnson', role: 'Mathematician', status: 'Active' },
  { name: 'Jean Bartik', role: 'Programmer', status: 'Away' },
];

@Component({
  imports: [CaeTable],
  template: `<cae-table [columns]="columns" [data]="rows" caption="Team roster" />`,
  styles: `
    :host {
      display: block;
    }
  `,
})
class TableVrHost {
  readonly columns = COLUMNS;
  readonly rows = ROWS;
}

describe('CaeTable (visual regression)', () => {
  afterEach(() => resetArm());

  for (const arm of VR_ARMS) {
    it(`renders a five-row roster in the ${arm.name} arm`, async () => {
      const el = renderArm(TableVrHost, arm, 560);
      await matchArm(el, `table-${arm.name}`);
    });
  }
});
