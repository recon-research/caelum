import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Dir, Direction } from '@angular/cdk/bidi';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { vi } from 'vitest';

import {
  CaePickList,
  CaePickListItemDef,
  CaePickListReorderEvent,
  CaePickListSide,
  CaePickListSourceHeaderDef,
  CaePickListTargetHeaderDef,
  CaePickListTransferEvent,
} from './pick-list';

interface Row {
  id: string;
  name: string;
}

/** A fresh trio each call so tests never share array identity. */
const ROWS = (): Row[] => [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Bravo' },
  { id: 'c', name: 'Charlie' },
];

/** A fresh four-row list — block-move / range tests need a non-adjacent, non-edge-pinned selection. */
const FOUR = (): Row[] => [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Bravo' },
  { id: 'c', name: 'Charlie' },
  { id: 'd', name: 'Delta' },
];

/** The shape onDrop actually reads — a subset of CdkDragDrop we can build in jsdom (no real pointer drag). */
type DropLike = {
  previousContainer: unknown;
  container: unknown;
  previousIndex: number;
  currentIndex: number;
};

/** Host with a projected item template (shared by both lists) — the common, content-agnostic case. */
@Component({
  selector: 'cae-pick-list-host',
  imports: [CaePickList, CaePickListItemDef],
  template: `
    <cae-pick-list
      [source]="sourceItems()"
      (sourceChange)="sourceItems.set($event)"
      [target]="targetItems()"
      (targetChange)="targetItems.set($event)"
      [sourceSelection]="sourceSel()"
      (sourceSelectionChange)="sourceSel.set($event)"
      [targetSelection]="targetSel()"
      (targetSelectionChange)="targetSel.set($event)"
      [sourceAriaLabel]="sourceAriaLabel()"
      [targetAriaLabel]="targetAriaLabel()"
      [sourceAriaLabelledby]="sourceAriaLabelledby()"
      [targetAriaLabelledby]="targetAriaLabelledby()"
      (transfer)="lastTransfer.set($event)"
      (reorder)="lastReorder.set($event)"
    >
      <ng-template
        caePickListItem
        let-item
        let-i="index"
        let-active="active"
        let-selected="selected"
      >
        <span class="tpl"
          >{{ $any(item).name }}#{{ i }}{{ active ? '*' : '' }}{{ selected ? '+' : '' }}</span
        >
      </ng-template>
    </cae-pick-list>
  `,
})
class PickListHost {
  readonly sourceItems = signal<readonly Row[]>([]);
  readonly targetItems = signal<readonly Row[]>([]);
  readonly sourceSel = signal<readonly Row[]>([]);
  readonly targetSel = signal<readonly Row[]>([]);
  readonly sourceAriaLabel = signal('');
  readonly targetAriaLabel = signal('');
  readonly sourceAriaLabelledby = signal('');
  readonly targetAriaLabelledby = signal('');
  readonly lastTransfer = signal<CaePickListTransferEvent<Row> | null>(null);
  readonly lastReorder = signal<CaePickListReorderEvent<Row> | null>(null);
}

/** Host with NO template — exercises the `{{ item }}` fallback with plain strings. */
@Component({
  selector: 'cae-pick-list-fallback-host',
  imports: [CaePickList],
  template: `<cae-pick-list [source]="src()" [target]="tgt()" />`,
})
class FallbackHost {
  readonly src = signal<readonly string[]>(['x', 'y']);
  readonly tgt = signal<readonly string[]>(['z']);
}

/**
 * Host projecting per-pane header slots — exercises the `aria-labelledby` labelling path and its
 * precedence over the `aria-label` string. `sourceAriaLabelledby` (an external heading the consumer
 * owns) is bound so the explicit-labelledby-beats-header precedence can be asserted.
 */
@Component({
  selector: 'cae-pick-list-header-host',
  imports: [CaePickList, CaePickListSourceHeaderDef, CaePickListTargetHeaderDef],
  template: `
    <h2 id="external-src">External source heading</h2>
    <cae-pick-list
      [source]="sourceItems()"
      [target]="targetItems()"
      [sourceAriaLabel]="sourceAriaLabel()"
      [sourceAriaLabelledby]="sourceAriaLabelledby()"
    >
      <ng-template caePickListSourceHeader>Available roles</ng-template>
      <ng-template caePickListTargetHeader>Assigned roles</ng-template>
    </cae-pick-list>
  `,
})
class PickListHeaderHost {
  readonly sourceItems = signal<readonly Row[]>(ROWS());
  readonly targetItems = signal<readonly Row[]>([]);
  readonly sourceAriaLabel = signal('');
  readonly sourceAriaLabelledby = signal('');
}

/** Host with the per-side filter enabled — object rows need a custom `filterMatch`. */
@Component({
  selector: 'cae-pick-list-filter-host',
  imports: [CaePickList, CaePickListItemDef],
  template: `
    <cae-pick-list
      [source]="sourceItems()"
      (sourceChange)="sourceItems.set($event)"
      [target]="targetItems()"
      (targetChange)="targetItems.set($event)"
      [sourceSelection]="sourceSel()"
      (sourceSelectionChange)="sourceSel.set($event)"
      [targetSelection]="targetSel()"
      (targetSelectionChange)="targetSel.set($event)"
      [filter]="true"
      [filterMatch]="match"
      filterPlaceholder="Search"
      sourceAriaLabel="Available roles"
      targetAriaLabel="Assigned roles"
      (transfer)="lastTransfer.set($event)"
      (reorder)="lastReorder.set($event)"
    >
      <ng-template caePickListItem let-item>{{ $any(item).name }}</ng-template>
    </cae-pick-list>
  `,
})
class PickListFilterHost {
  readonly sourceItems = signal<readonly Row[]>(ROWS());
  readonly targetItems = signal<readonly Row[]>([]);
  readonly sourceSel = signal<readonly Row[]>([]);
  readonly targetSel = signal<readonly Row[]>([]);
  readonly lastTransfer = signal<CaePickListTransferEvent<Row> | null>(null);
  readonly lastReorder = signal<CaePickListReorderEvent<Row> | null>(null);
  readonly match = (item: Row, q: string): boolean =>
    item.name.toLowerCase().includes(q.toLowerCase());
}

/** Wraps the pick-list under a CDK `Dir` ancestor so a test can flip the ambient direction reactively. */
@Component({
  selector: 'cae-pick-list-rtl-host',
  imports: [CaePickList, CaePickListItemDef, Dir],
  template: `
    <div [dir]="direction()">
      <cae-pick-list [source]="sourceItems()" [target]="targetItems()">
        <ng-template caePickListItem let-item>{{ $any(item).name }}</ng-template>
      </cae-pick-list>
    </div>
  `,
})
class PickListRtlHost {
  readonly direction = signal<Direction>('ltr');
  readonly sourceItems = signal<readonly Row[]>(ROWS());
  readonly targetItems = signal<readonly Row[]>([]);
}

describe('CaePickList', () => {
  let fixture: ComponentFixture<PickListHost>;
  let host: PickListHost;
  let announce: ReturnType<typeof vi.spyOn>;
  /** Local fixtures the filter tests create with their own host type — drained in afterEach. */
  const filterFixtures: ComponentFixture<unknown>[] = [];

  function render(
    opts: {
      source?: readonly Row[];
      target?: readonly Row[];
    } = {},
  ): void {
    fixture = TestBed.createComponent(PickListHost);
    host = fixture.componentInstance;
    host.sourceItems.set(opts.source ?? ROWS());
    host.targetItems.set(opts.target ?? []);
    // Attach to the document so `.focus()` moves `document.activeElement` (jsdom requirement).
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  }

  beforeEach(() => {
    const announcer = TestBed.inject(LiveAnnouncer);
    // Stub the announce so the test never mounts a real live region; we only assert the call.
    announce = vi.spyOn(announcer, 'announce').mockResolvedValue(undefined);
  });

  afterEach(() => {
    fixture?.nativeElement.remove();
    fixture?.destroy();
    for (const f of filterFixtures.splice(0)) {
      f.nativeElement.remove();
      f.destroy();
    }
    vi.restoreAllMocks();
  });

  // Fresh queries each call — the @for re-renders rows, but the two <ul> hosts are stable.
  function lists(): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="listbox"]'),
    );
  }
  const src = (): HTMLElement => lists()[0];
  const tgt = (): HTMLElement => lists()[1];
  function optionsIn(list: HTMLElement): HTMLElement[] {
    return Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
  }
  function textsIn(list: HTMLElement): string[] {
    return optionsIn(list).map((el) => el.textContent!.trim());
  }
  function btn(label: string): HTMLButtonElement {
    return fixture.nativeElement.querySelector(
      `button[aria-label="${label}"]`,
    ) as HTMLButtonElement;
  }
  // Buttons use aria-disabled (NOT native [disabled]) so a bound-reaching button stays focusable.
  function disabled(label: string): boolean {
    return btn(label).getAttribute('aria-disabled') === 'true';
  }
  // Focus (the roving tab stop) is separate from selection (aria-selected) — read them independently.
  function focusedTextIn(list: HTMLElement): string | null {
    const el = list.querySelector('[tabindex="0"]');
    return el ? el.textContent!.trim() : null;
  }
  function selectedTextsIn(list: HTMLElement): string[] {
    return Array.from(list.querySelectorAll<HTMLElement>('[aria-selected="true"]')).map((el) =>
      el.textContent!.trim(),
    );
  }
  function names(items: readonly Row[]): string[] {
    return items.map((r) => r.name);
  }
  function component(): CaePickList<Row> {
    return fixture.debugElement.query(By.directive(CaePickList))
      .componentInstance as CaePickList<Row>;
  }
  function drop(event: DropLike, side: CaePickListSide): void {
    (component() as unknown as { onDrop(e: DropLike, s: CaePickListSide): void }).onDrop(
      event,
      side,
    );
  }
  function clickRow(list: HTMLElement, i: number, mods: Partial<MouseEventInit> = {}): void {
    optionsIn(list)[i].dispatchEvent(new MouseEvent('click', { bubbles: true, ...mods }));
    fixture.detectChanges();
  }
  function key(el: HTMLElement, k: string, mods: Partial<KeyboardEventInit> = {}): void {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...mods }));
    fixture.detectChanges();
  }

  it('renders two multiselectable listboxes; each option (not the container) is described by the instructions', () => {
    render({ source: ROWS(), target: [{ id: 'z', name: 'Zeta' }] });
    expect(lists().length).toBe(2);
    expect(src().getAttribute('aria-label')).toBe('Source list'); // default names
    expect(tgt().getAttribute('aria-label')).toBe('Target list');
    expect([src(), tgt()].every((l) => l.getAttribute('aria-multiselectable') === 'true')).toBe(
      true,
    );
    expect(optionsIn(src()).length).toBe(3);
    expect(optionsIn(tgt()).length).toBe(1);
    // Both CdkDropList directives are actually applied (they stamp this class) — so the transfer
    // (cdkDropListDropped) bindings are real, not just handlers tested in isolation.
    expect([src(), tgt()].every((l) => l.classList.contains('cdk-drop-list'))).toBe(true);
    // The instructions are described-by the OPTIONS (not the container) so roving tabindex re-announces
    // them as focus moves — the listbox.ts precedent (a container describedby is never re-read).
    const described = optionsIn(src())[0].getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    expect(src().getAttribute('aria-describedby')).toBeNull();
    expect(tgt().getAttribute('aria-describedby')).toBeNull();
    expect(optionsIn(tgt())[0].getAttribute('aria-describedby')).toBe(described);
    expect(fixture.nativeElement.querySelector(`#${described}`)?.textContent).toContain('transfer');
  });

  it('names each list from its ariaLabel, and prefers ariaLabelledby when set', () => {
    render({ source: ROWS(), target: [] });
    host.sourceAriaLabel.set('Available roles');
    host.targetAriaLabel.set('Assigned roles');
    fixture.detectChanges();
    expect(src().getAttribute('aria-label')).toBe('Available roles');
    expect(tgt().getAttribute('aria-label')).toBe('Assigned roles');

    host.sourceAriaLabelledby.set('src-heading');
    fixture.detectChanges();
    expect(src().getAttribute('aria-labelledby')).toBe('src-heading');
    expect(src().getAttribute('aria-label')).toBeNull(); // labelledby wins; no double name
  });

  it('a projected header labels its own list (aria-labelledby → the header id) and supersedes the aria-label string', () => {
    const hf = TestBed.createComponent(PickListHeaderHost);
    hf.componentInstance.sourceAriaLabel.set('ignored when a header is projected');
    document.body.appendChild(hf.nativeElement);
    hf.detectChanges();
    const el = hf.nativeElement as HTMLElement;
    const [srcList, tgtList] = Array.from(el.querySelectorAll<HTMLElement>('[role="listbox"]'));

    const srcHeaderId = srcList.getAttribute('aria-labelledby')!;
    expect(srcHeaderId).toBeTruthy();
    expect(srcList.getAttribute('aria-label')).toBeNull(); // the header names the list; no double name
    expect(el.querySelector(`#${srcHeaderId}`)?.textContent?.trim()).toBe('Available roles');

    const tgtHeaderId = tgtList.getAttribute('aria-labelledby')!;
    expect(tgtHeaderId).toBeTruthy();
    expect(tgtHeaderId).not.toBe(srcHeaderId); // each list points at its OWN header, not a shared id
    expect(el.querySelector(`#${tgtHeaderId}`)?.textContent?.trim()).toBe('Assigned roles');

    hf.nativeElement.remove();
    hf.destroy();
  });

  it('prefers an explicit ariaLabelledby (an external heading you own) over a projected header', () => {
    const hf = TestBed.createComponent(PickListHeaderHost);
    hf.componentInstance.sourceAriaLabelledby.set('external-src');
    document.body.appendChild(hf.nativeElement);
    hf.detectChanges();
    const el = hf.nativeElement as HTMLElement;
    const srcList = el.querySelector<HTMLElement>('[role="listbox"]')!;

    expect(srcList.getAttribute('aria-labelledby')).toBe('external-src'); // the input wins over the header
    expect(srcList.getAttribute('aria-label')).toBeNull();
    // The header still renders as a visible title even though it no longer provides the accessible name.
    expect(el.textContent).toContain('Available roles');

    hf.nativeElement.remove();
    hf.destroy();
  });

  it('focuses the first row of each list by default (sole tab stop) with nothing selected', () => {
    render({
      source: ROWS(),
      target: [
        { id: 'z', name: 'Zeta' },
        { id: 'y', name: 'Yotta' },
      ],
    });
    for (const list of [src(), tgt()]) {
      const rows = optionsIn(list);
      // Focus (tab stop) defaults to row 0; selection is empty (p-pickList parity).
      expect(rows[0].getAttribute('tabindex')).toBe('0');
      expect(rows[1].getAttribute('tabindex')).toBe('-1');
      expect(rows.every((r) => r.getAttribute('aria-selected') === 'false')).toBe(true);
      expect(selectedTextsIn(list)).toEqual([]);
    }
  });

  it('plain click within a list selects only that row (replace) and focuses it', () => {
    render({ source: ROWS(), target: [] });
    clickRow(src(), 2);
    expect(optionsIn(src())[2].getAttribute('aria-selected')).toBe('true');
    expect(optionsIn(src())[2].getAttribute('tabindex')).toBe('0'); // focus follows
    expect(optionsIn(src())[0].getAttribute('aria-selected')).toBe('false');
    expect(selectedTextsIn(src())).toEqual(['Charlie#2*+']); // exactly one selected
    expect(names(host.sourceSel())).toEqual(['Charlie']); // [(sourceSelection)] round-trips out
    // The other list is untouched — selection is per-side.
    expect(host.targetSel()).toEqual([]);
    expect(announce).toHaveBeenCalledWith('1 of 3 selected in the source list');
  });

  it('moves focus within a list with Arrow/Home/End (no selection, no transfer, no announce)', () => {
    render({ source: ROWS(), target: [] });
    const before = textsIn(src());
    optionsIn(src())[0].focus();

    key(optionsIn(src())[0], 'ArrowDown');
    expect(document.activeElement).toBe(optionsIn(src())[1]);
    expect(focusedTextIn(src())).toContain('Bravo');

    key(optionsIn(src())[1], 'End');
    expect(document.activeElement).toBe(optionsIn(src())[2]);

    key(optionsIn(src())[2], 'Home');
    expect(document.activeElement).toBe(optionsIn(src())[0]);

    // Navigation never transfers, never selects, and doesn't announce.
    expect(textsIn(src())).toEqual(before);
    expect(selectedTextsIn(src())).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
  });

  it('marks the move-to-target buttons aria-disabled when source is empty and vice-versa', () => {
    render({ source: ROWS(), target: [] });
    // target empty ⇒ move-to-source disabled; source full ⇒ move-to-target enabled.
    expect(disabled('Move selected to source')).toBe(true);
    expect(disabled('Move all to source')).toBe(true);
    expect(disabled('Move selected to target')).toBe(false);
    expect(disabled('Move all to target')).toBe(false);
    // aria-disabled, not native [disabled] — the button stays in the tab order (never blurs).
    expect(btn('Move selected to source').disabled).toBe(false);

    // Move everything across; now source is empty and the direction flips.
    btn('Move all to target').click();
    fixture.detectChanges();
    expect(disabled('Move selected to target')).toBe(true);
    expect(disabled('Move all to target')).toBe(true);
    expect(disabled('Move selected to source')).toBe(false);
    expect(disabled('Move all to source')).toBe(false);
  });

  it('keeps a source-emptying transfer button focused (aria-disabled, not native → no strand)', () => {
    render({ source: [{ id: 'a', name: 'Alpha' }], target: [] });
    const moveAll = btn('Move all to target');
    moveAll.focus();
    expect(document.activeElement).toBe(moveAll);
    moveAll.click(); // empties the source; move-to-target becomes aria-disabled
    fixture.detectChanges();
    // The focused button must NOT be blurred to <body> — a native [disabled] flip would strand it.
    expect(disabled('Move all to target')).toBe(true);
    expect(document.activeElement).toBe(moveAll);
    expect(moveAll.getAttribute('aria-disabled')).toBe('true');
  });

  it('"Move selected" with nothing selected moves the focused row, focusing it in the target', () => {
    render({ source: ROWS(), target: [] }); // source focus = Alpha (0), nothing selected
    btn('Move selected to target').click();
    fixture.detectChanges();

    expect(names(host.sourceItems())).toEqual(['Bravo', 'Charlie']);
    expect(names(host.targetItems())).toEqual(['Alpha']);
    expect(focusedTextIn(tgt())).toContain('Alpha'); // the moved item is focused in its new list
    expect(selectedTextsIn(tgt())).toEqual([]); // moved item is not auto-selected in the target
    const evt = host.lastTransfer()!;
    expect(evt.from).toBe('source');
    expect(evt.to).toBe('target');
    expect(names(evt.items)).toEqual(['Alpha']);
    expect(names(evt.source)).toEqual(['Bravo', 'Charlie']);
    expect(names(evt.target)).toEqual(['Alpha']);
    expect(announce).toHaveBeenCalledWith('Moved to the target list, position 1 of 1.');
  });

  it('moves ALL source items to the target end, clearing source, emitting + announcing the count', () => {
    render({ source: ROWS(), target: [{ id: 'z', name: 'Zeta' }] });
    btn('Move all to target').click();
    fixture.detectChanges();

    expect(host.sourceItems().length).toBe(0);
    expect(names(host.targetItems())).toEqual(['Zeta', 'Alpha', 'Bravo', 'Charlie']);
    expect(focusedTextIn(tgt())).toContain('Alpha'); // first moved item is focused (index 1)
    const evt = host.lastTransfer()!;
    expect(evt.from).toBe('source');
    expect(names(evt.items)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(announce).toHaveBeenCalledWith('Moved 3 items to the target list.');
  });

  it('transfers on a cross-list CDK drop, honoring the drop index, announcing', () => {
    render({ source: ROWS(), target: [] });
    // jsdom can't run a real pointer drag; drive onDrop with a cross-container (source→target) drop.
    drop({ previousContainer: {}, container: {}, previousIndex: 2, currentIndex: 0 }, 'target');
    fixture.detectChanges();

    expect(names(host.sourceItems())).toEqual(['Alpha', 'Bravo']);
    expect(names(host.targetItems())).toEqual(['Charlie']);
    const evt = host.lastTransfer()!;
    expect(evt.from).toBe('source');
    expect(evt.to).toBe('target');
    expect(names(evt.items)).toEqual(['Charlie']);
    expect(announce).toHaveBeenCalledWith('Moved to the target list, position 1 of 1.');
  });

  it('transfers on a cross-list CDK drop the other way (target → source), honoring the drop index', () => {
    render({ source: [], target: ROWS() });
    // dropSide='source' ⇒ fromSide='target'; guards the mirror half of the from/to mapping.
    drop({ previousContainer: {}, container: {}, previousIndex: 0, currentIndex: 0 }, 'source');
    fixture.detectChanges();

    expect(names(host.targetItems())).toEqual(['Bravo', 'Charlie']);
    expect(names(host.sourceItems())).toEqual(['Alpha']);
    const evt = host.lastTransfer()!;
    expect(evt.from).toBe('target');
    expect(evt.to).toBe('source');
    expect(names(evt.items)).toEqual(['Alpha']);
    expect(announce).toHaveBeenCalledWith('Moved to the source list, position 1 of 1.');
  });

  it('reorders within a list on a same-container drop (sorting enabled), emitting (reorder) not (transfer)', () => {
    render({ source: ROWS(), target: [] });
    const same = {};
    // A same-container drop now REORDERS (v1 ignored it); drive onDrop with previous≠current in one list.
    drop({ previousContainer: same, container: same, previousIndex: 0, currentIndex: 2 }, 'source');
    fixture.detectChanges();
    // Alpha (0) moved to the end; target untouched; no cross-list transfer fired.
    expect(names(host.sourceItems())).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(host.targetItems().length).toBe(0);
    expect(host.lastTransfer()).toBeNull();
    const evt = host.lastReorder()!;
    expect(evt.side).toBe('source');
    expect(names(evt.items)).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(evt.previousIndex).toBe(0);
    expect(evt.currentIndex).toBe(2);
    expect(evt.movedIndices).toEqual([0]);
    expect(focusedTextIn(src())).toContain('Alpha'); // the dragged row is focused at its new index
    expect(announce).toHaveBeenCalledWith('Moved to position 3 of 3 in the source list');
  });

  it('a same-container drop with equal indices is a no-op (no reorder, no announce)', () => {
    render({ source: ROWS(), target: [] });
    const before = textsIn(src());
    const same = {};
    drop({ previousContainer: same, container: same, previousIndex: 1, currentIndex: 1 }, 'source');
    fixture.detectChanges();
    expect(textsIn(src())).toEqual(before);
    expect(host.lastReorder()).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('a drag-reorder of a selected row re-sorts the emitted selection into the new list order', () => {
    render({ source: FOUR(), target: [] });
    clickRow(src(), 1); // select Bravo (1)
    clickRow(src(), 2, { ctrlKey: true }); // + Charlie (2) → selection [Bravo, Charlie]
    const same = {};
    // Drag Charlie (2) to the top: moveItemInArray(2 → 0) ⇒ [Charlie, Alpha, Bravo, Delta].
    // Charlie now precedes Bravo, so the emitted selection must re-sort [Bravo, Charlie] → [Charlie, Bravo]
    // (the length-only prune guard would NOT catch this same-size reorder — this is the re-sort branch).
    drop({ previousContainer: same, container: same, previousIndex: 2, currentIndex: 0 }, 'source');
    fixture.detectChanges();
    expect(names(host.sourceItems())).toEqual(['Charlie', 'Alpha', 'Bravo', 'Delta']);
    expect(names(host.sourceSel())).toEqual(['Charlie', 'Bravo']); // re-sorted to the new list order
  });

  it('renders rich rows through the projected item template in both lists (item, index, active)', () => {
    render({ source: ROWS(), target: [{ id: 'z', name: 'Zeta' }] });
    expect(textsIn(src())).toEqual(['Alpha#0*', 'Bravo#1', 'Charlie#2']);
    expect(textsIn(tgt())).toEqual(['Zeta#0*']);
  });

  it('falls back to {{ item }} when no item template is projected', () => {
    const fb = TestBed.createComponent(FallbackHost);
    fb.detectChanges();
    const listEls = Array.from(
      (fb.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="listbox"]'),
    );
    const rowsOf = (l: HTMLElement) =>
      Array.from(l.querySelectorAll<HTMLElement>('[role="option"]')).map((el) =>
        el.textContent!.trim(),
      );
    expect(rowsOf(listEls[0])).toEqual(['x', 'y']);
    expect(rowsOf(listEls[1])).toEqual(['z']);
    fb.destroy();
  });

  it('clamps a list focus index when it shrinks below it, pruning a now-absent selection', () => {
    render({ source: ROWS(), target: [] });
    clickRow(src(), 2); // focus = 2 (Charlie), and Charlie selected
    expect(focusedTextIn(src())).toContain('Charlie');
    expect(names(host.sourceSel())).toEqual(['Charlie']);
    // Shrink source externally to a single row: index 2 is out of range → clamp; Charlie gone → prune.
    host.sourceItems.set([{ id: 'solo', name: 'Solo' }]);
    fixture.detectChanges();
    expect(focusedTextIn(src())).toContain('Solo');
    expect(host.sourceSel()).toEqual([]); // Charlie no longer present → selection pruned
    // Grow back: the clamped index must NOT resurrect the old position 2.
    host.sourceItems.set(ROWS());
    fixture.detectChanges();
    expect(src().querySelector('[tabindex="0"]')).toBe(optionsIn(src())[0]);
  });

  it('renders two empty lists without crashing — no rows, all transfer buttons aria-disabled', () => {
    render({ source: [], target: [] });
    expect(optionsIn(src()).length).toBe(0);
    expect(optionsIn(tgt()).length).toBe(0);
    expect(selectedTextsIn(src())).toEqual([]);
    expect(disabled('Move selected to target')).toBe(true);
    expect(disabled('Move all to target')).toBe(true);
    expect(disabled('Move selected to source')).toBe(true);
    expect(disabled('Move all to source')).toBe(true);
  });

  // --- Multi-select (ARIA listbox multiselect, per side) -----------------------------------------

  it('Ctrl/Cmd+click toggles a source row into/out of the selection (additive)', () => {
    render({ source: ROWS(), target: [] });
    clickRow(src(), 0); // select Alpha (replace)
    clickRow(src(), 2, { ctrlKey: true }); // add Charlie
    expect(selectedTextsIn(src())).toEqual(['Alpha#0+', 'Charlie#2*+']); // list order; Charlie focused
    expect(names(host.sourceSel())).toEqual(['Alpha', 'Charlie']);
    clickRow(src(), 0, { ctrlKey: true }); // toggle Alpha off
    expect(names(host.sourceSel())).toEqual(['Charlie']);
  });

  it('Shift+click selects the contiguous range from the anchor', () => {
    render({ source: ROWS(), target: [] });
    clickRow(src(), 0); // anchor = 0
    clickRow(src(), 2, { shiftKey: true }); // range 0..2
    expect(names(host.sourceSel())).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('Space toggles the focused target row; Ctrl+A selects all in that list; announces the count', () => {
    render({ source: [], target: ROWS() });
    optionsIn(tgt())[1].focus();
    key(optionsIn(tgt())[1], ' '); // toggle Bravo on
    expect(names(host.targetSel())).toEqual(['Bravo']);
    expect(host.sourceSel()).toEqual([]); // the other list stays empty
    expect(announce).toHaveBeenCalledWith('1 of 3 selected in the target list');

    key(optionsIn(tgt())[1], 'a', { ctrlKey: true }); // select all in target
    expect(names(host.targetSel())).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(announce).toHaveBeenCalledWith('3 of 3 selected in the target list');
  });

  it('Shift+ArrowDown range-extends the selection while moving focus', () => {
    render({ source: ROWS(), target: [] });
    optionsIn(src())[0].focus();
    key(optionsIn(src())[0], 'ArrowDown', { shiftKey: true }); // anchor 0 → focus 1, range 0..1
    expect(document.activeElement).toBe(optionsIn(src())[1]);
    expect(names(host.sourceSel())).toEqual(['Alpha', 'Bravo']);
    key(optionsIn(src())[1], 'ArrowDown', { shiftKey: true }); // extend to 0..2
    expect(names(host.sourceSel())).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('Shift+End range-extends from the anchor to the last row', () => {
    render({ source: ROWS(), target: [] });
    optionsIn(src())[0].focus();
    key(optionsIn(src())[0], ' '); // anchor = Alpha (0)
    key(optionsIn(src())[0], 'End', { shiftKey: true }); // extend 0..2
    expect(names(host.sourceSel())).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(document.activeElement).toBe(optionsIn(src())[2]);
  });

  it('Escape clears the whole selection of that list (keyboard parity with pointer)', () => {
    render({ source: ROWS(), target: [] });
    optionsIn(src())[0].focus();
    key(optionsIn(src())[0], 'a', { ctrlKey: true }); // select all
    expect(host.sourceSel().length).toBe(3);
    key(optionsIn(src())[0], 'Escape');
    expect(host.sourceSel()).toEqual([]);
    expect(selectedTextsIn(src())).toEqual([]);
    expect(announce).toHaveBeenCalledWith('Selection cleared in the source list');
  });

  it('moves a multi-selection as a block to the target, preserving source order (non-adjacent)', () => {
    render({ source: FOUR(), target: [{ id: 'z', name: 'Zeta' }] });
    clickRow(src(), 0); // select Alpha (0)
    clickRow(src(), 2, { ctrlKey: true }); // + Charlie (2) → non-adjacent selection {0, 2}
    btn('Move selected to target').click();
    fixture.detectChanges();

    // The selected block moves in source order; the rest stays behind.
    expect(names(host.sourceItems())).toEqual(['Bravo', 'Delta']);
    expect(names(host.targetItems())).toEqual(['Zeta', 'Alpha', 'Charlie']);
    expect(focusedTextIn(tgt())).toContain('Alpha'); // first moved row is focused (index 1)
    const evt = host.lastTransfer()!;
    expect(names(evt.items)).toEqual(['Alpha', 'Charlie']);
    expect(host.sourceSel()).toEqual([]); // moved items pruned from the source selection
    expect(announce).toHaveBeenCalledWith('Moved 2 items to the target list.');
  });

  it('moves the selected block + all back the other way (target → source button transfer)', () => {
    render({ source: [], target: FOUR() });
    clickRow(tgt(), 1); // select Bravo
    clickRow(tgt(), 3, { ctrlKey: true }); // + Delta → target selection {Bravo, Delta}
    btn('Move selected to source').click();
    fixture.detectChanges();
    // The mirror leg: transferSelected('target','source') moves the block in target order, rest stays.
    expect(names(host.targetItems())).toEqual(['Alpha', 'Charlie']);
    expect(names(host.sourceItems())).toEqual(['Bravo', 'Delta']);
    expect(host.targetSel()).toEqual([]); // moved items pruned from the target selection
    expect(announce).toHaveBeenCalledWith('Moved 2 items to the source list.');

    btn('Move all to source').click(); // move the remainder wholesale
    fixture.detectChanges();
    expect(host.targetItems().length).toBe(0);
    expect(names(host.sourceItems())).toEqual(['Bravo', 'Delta', 'Alpha', 'Charlie']);
    expect(announce).toHaveBeenLastCalledWith('Moved 2 items to the source list.');
  });

  it('writes selection in from the parent ([(sourceSelection)] two-way) and reflects it', () => {
    render({ source: ROWS(), target: [] });
    const rows = host.sourceItems();
    host.sourceSel.set([rows[0], rows[2]]); // parent selects Alpha + Charlie
    fixture.detectChanges();
    expect(selectedTextsIn(src())).toEqual(['Alpha#0*+', 'Charlie#2+']);
    expect(optionsIn(src())[0].getAttribute('aria-selected')).toBe('true');
    expect(optionsIn(src())[1].getAttribute('aria-selected')).toBe('false');
  });

  it('keeps the range anchor stable across an index shift (anchor is the item, not a stale index)', () => {
    render({ source: ROWS(), target: [] });
    clickRow(src(), 1); // select Bravo, anchor = Bravo (row 1)
    // Prepend a row externally: Bravo is now at index 2 (a STALE index anchor of 1 would mis-range).
    const rows = host.sourceItems();
    host.sourceItems.set([{ id: 'z', name: 'Zeta' }, ...rows]);
    fixture.detectChanges();
    expect(names(host.sourceItems())).toEqual(['Zeta', 'Alpha', 'Bravo', 'Charlie']);
    // Shift+click Charlie (now row 3): the item anchor (Bravo, now row 2) ranges Bravo..Charlie.
    clickRow(src(), 3, { shiftKey: true });
    expect(names(host.sourceSel())).toEqual(['Bravo', 'Charlie']);
  });

  it('a cross-list drop of a selected row prunes it from the source selection', () => {
    render({ source: FOUR(), target: [] });
    clickRow(src(), 0); // Alpha
    clickRow(src(), 2, { ctrlKey: true }); // + Charlie → source selection [Alpha, Charlie]
    // Drag Alpha (row 0) across to the target; the button block-move isn't involved here.
    drop({ previousContainer: {}, container: {}, previousIndex: 0, currentIndex: 0 }, 'target');
    fixture.detectChanges();
    expect(names(host.sourceItems())).toEqual(['Bravo', 'Charlie', 'Delta']);
    expect(names(host.targetItems())).toEqual(['Alpha']);
    // Alpha left the source, so it drops out of the source selection; Charlie stays.
    expect(names(host.sourceSel())).toEqual(['Charlie']);
  });

  // --- Within-list reorder (move buttons) --------------------------------------------------------

  it('reorders the focused source row down with the move button (no selection), announcing + emitting', () => {
    render({ source: ROWS(), target: [] }); // focus = Alpha (0), nothing selected
    btn('Move down in the source list').click();
    fixture.detectChanges();
    expect(names(host.sourceItems())).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(focusedTextIn(src())).toContain('Alpha'); // focus follows the moved row
    expect(host.targetItems().length).toBe(0); // the other list is untouched — reorder is per-side
    const evt = host.lastReorder()!;
    expect(evt.side).toBe('source');
    expect(names(evt.items)).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(evt.previousIndex).toBe(0);
    expect(evt.currentIndex).toBe(1);
    expect(evt.movedIndices).toEqual([0]);
    expect(announce).toHaveBeenCalledWith('Moved to position 2 of 3 in the source list');
  });

  it('moves the focused source row to the bottom with the move-to-bottom button', () => {
    render({ source: ROWS(), target: [] });
    btn('Move to bottom in the source list').click();
    fixture.detectChanges();
    expect(names(host.sourceItems())).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(focusedTextIn(src())).toContain('Alpha'); // focus follows to the bottom
    expect(announce).toHaveBeenCalledWith('Moved to position 3 of 3 in the source list');
  });

  it('disables the reorder buttons at the list bounds (aria-disabled, staying focusable)', () => {
    render({ source: ROWS(), target: [] }); // focus at top (0), nothing selected
    expect(disabled('Move up in the source list')).toBe(true);
    expect(disabled('Move to top in the source list')).toBe(true);
    expect(disabled('Move down in the source list')).toBe(false);
    expect(disabled('Move to bottom in the source list')).toBe(false);
    // aria-disabled, not native [disabled] — a bound-reaching reorder button stays in the tab order.
    expect(btn('Move up in the source list').disabled).toBe(false);
    // Focus the last row → down/bottom disable, up/top enable.
    optionsIn(src())[2].focus();
    fixture.detectChanges();
    expect(disabled('Move down in the source list')).toBe(true);
    expect(disabled('Move to bottom in the source list')).toBe(true);
    expect(disabled('Move up in the source list')).toBe(false);
    expect(disabled('Move to top in the source list')).toBe(false);
  });

  it('a bound-reaching reorder is a guarded no-op even if the aria-disabled button is clicked', () => {
    render({ source: ROWS(), target: [] }); // focus at top; up is aria-disabled
    const before = textsIn(src());
    btn('Move up in the source list').click(); // guarded by canReorderUp — must do nothing
    fixture.detectChanges();
    expect(textsIn(src())).toEqual(before);
    expect(host.lastReorder()).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('reorders a multi-selected block together, keeping its relative order and pruning nothing', () => {
    render({ source: FOUR(), target: [] });
    clickRow(src(), 0); // Alpha
    clickRow(src(), 1, { ctrlKey: true }); // + Bravo → selection {Alpha, Bravo} at the top
    btn('Move down in the source list').click(); // bubble the block one step past Charlie
    fixture.detectChanges();
    expect(names(host.sourceItems())).toEqual(['Charlie', 'Alpha', 'Bravo', 'Delta']);
    expect(names(host.sourceSel())).toEqual(['Alpha', 'Bravo']); // block intact, relative order kept
    const evt = host.lastReorder()!;
    expect(evt.side).toBe('source');
    expect(evt.previousIndex).toBe(0);
    expect(evt.movedIndices).toEqual([0, 1]);
    expect(announce).toHaveBeenCalledWith('Moved 2 items down in the source list');
  });

  it('bubbles a NON-contiguous block past its in-between neighbour, keeping selection order', () => {
    render({ source: FOUR(), target: [] });
    clickRow(src(), 0); // Alpha (0)
    clickRow(src(), 2, { ctrlKey: true }); // + Charlie (2) → non-contiguous {0, 2}, Bravo (1) between
    btn('Move down in the source list').click();
    fixture.detectChanges();
    // Charlie bubbles past Delta; Alpha bubbles past Bravo — each picked row moves one step down.
    expect(names(host.sourceItems())).toEqual(['Bravo', 'Alpha', 'Delta', 'Charlie']);
    // Selection stays {Alpha, Charlie}, still in list order (block move never reorders picked-vs-picked).
    expect(names(host.sourceSel())).toEqual(['Alpha', 'Charlie']);
    expect(host.lastReorder()!.movedIndices).toEqual([0, 2]);
  });

  it('keeps focus on the focused row when it is OUTSIDE the moved selection', () => {
    render({ source: FOUR(), target: [] });
    clickRow(src(), 2); // Charlie (2)
    clickRow(src(), 3, { ctrlKey: true }); // + Delta (3) → selection {Charlie, Delta} at the bottom
    optionsIn(src())[0].focus(); // focus Alpha — OUTSIDE the selection
    fixture.detectChanges();
    btn('Move up in the source list').click(); // move the {Charlie, Delta} block up one
    fixture.detectChanges();
    expect(names(host.sourceItems())).toEqual(['Alpha', 'Charlie', 'Delta', 'Bravo']);
    // Focus must follow its own item (Alpha), not jump to the moved block.
    expect(focusedTextIn(src())).toContain('Alpha');
  });

  it('reorders the target list independently of the source (mirror side)', () => {
    render({ source: [], target: ROWS() });
    optionsIn(tgt())[2].focus(); // focus Charlie (2) in the target
    fixture.detectChanges();
    btn('Move to top in the target list').click();
    fixture.detectChanges();
    expect(names(host.targetItems())).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(host.sourceItems().length).toBe(0); // source untouched
    expect(focusedTextIn(tgt())).toContain('Charlie'); // focus follows to the top
    const evt = host.lastReorder()!;
    expect(evt.side).toBe('target');
    expect(names(evt.items)).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(announce).toHaveBeenCalledWith('Moved to position 1 of 3 in the target list');
  });

  it('keeps a bound-reaching reorder button focused (aria-disabled, not native → no strand)', () => {
    render({ source: ROWS(), target: [] }); // focus at top; "to bottom" enabled
    const toBottom = btn('Move to bottom in the source list');
    toBottom.focus();
    expect(document.activeElement).toBe(toBottom);
    toBottom.click(); // sends the focused row to the bottom → down/bottom go aria-disabled
    fixture.detectChanges();
    expect(disabled('Move to bottom in the source list')).toBe(true);
    // aria-disabled (not native [disabled]) → the button is NOT blurred to <body>, so the keyboard
    // user isn't stranded (the recurring aria-disabled-at-bounds MAJOR class).
    expect(document.activeElement).toBe(toBottom);
    expect(toBottom.getAttribute('aria-disabled')).toBe('true');
  });

  it('wraps each pane\'s reorder buttons in a labelled role="group"', () => {
    render({ source: ROWS(), target: ROWS() });
    const groupLabels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="group"]'),
    ).map((g) => g.getAttribute('aria-label'));
    expect(groupLabels).toContain('Reorder source list');
    expect(groupLabels).toContain('Reorder target list');
  });

  it('reorders the TARGET list on a same-container drop (mirror drag path)', () => {
    render({ source: [], target: ROWS() });
    const same = {};
    drop({ previousContainer: same, container: same, previousIndex: 2, currentIndex: 0 }, 'target');
    fixture.detectChanges();
    expect(names(host.targetItems())).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(host.sourceItems().length).toBe(0); // source untouched
    const evt = host.lastReorder()!;
    expect(evt.side).toBe('target');
    expect(evt.previousIndex).toBe(2);
    expect(evt.currentIndex).toBe(0);
    expect(announce).toHaveBeenCalledWith('Moved to position 1 of 3 in the target list');
  });

  // --- Per-side in-list filter (#342) ------------------------------------------------------------

  function renderFilter(source?: readonly Row[], target?: readonly Row[]) {
    const f = TestBed.createComponent(PickListFilterHost);
    filterFixtures.push(f);
    const fh = f.componentInstance;
    if (source) fh.sourceItems.set(source);
    if (target) fh.targetItems.set(target);
    document.body.appendChild(f.nativeElement);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const lbs = (): HTMLElement[] =>
      Array.from(el.querySelectorAll<HTMLElement>('[role="listbox"]'));
    const srcList = (): HTMLElement => lbs()[0];
    const tgtList = (): HTMLElement => lbs()[1];
    const searchInputs = (): HTMLInputElement[] =>
      Array.from(el.querySelectorAll<HTMLInputElement>('input[type="search"]'));
    const srcInput = (): HTMLInputElement => searchInputs()[0];
    const tgtInput = (): HTMLInputElement => searchInputs()[1];
    const opts = (list: HTMLElement): HTMLElement[] =>
      Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
    const texts = (list: HTMLElement): string[] => opts(list).map((o) => o.textContent!.trim());
    const type = (inp: HTMLInputElement, q: string): void => {
      inp.value = q;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      f.detectChanges();
    };
    const button = (label: string): HTMLButtonElement =>
      el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
    const btnDisabled = (label: string): boolean =>
      button(label).getAttribute('aria-disabled') === 'true';
    const cmp = f.debugElement.query(By.directive(CaePickList))
      .componentInstance as CaePickList<Row>;
    return {
      f,
      fh,
      el,
      srcList,
      tgtList,
      srcInput,
      tgtInput,
      opts,
      texts,
      type,
      button,
      btnDisabled,
      cmp,
    };
  }

  it('renders no filter boxes when [filter] is off (the default host)', () => {
    render({ source: ROWS(), target: [] });
    expect(fixture.nativeElement.querySelectorAll('input[type="search"]').length).toBe(0);
  });

  it('renders a labelled search box per list, named from each list', () => {
    const r = renderFilter();
    expect(r.srcInput().getAttribute('aria-label')).toBe('Filter Available roles');
    expect(r.tgtInput().getAttribute('aria-label')).toBe('Filter Assigned roles');
    expect(r.srcInput().getAttribute('placeholder')).toBe('Search');
  });

  it('narrows only the list whose box you type in; announces its result count', () => {
    const r = renderFilter(ROWS(), [
      { id: 't1', name: 'Tango' },
      { id: 't2', name: 'Lima' },
    ]);
    r.type(r.srcInput(), 'l'); // source: Alpha + Charlie
    expect(r.texts(r.srcList())).toEqual(['Alpha', 'Charlie']);
    expect(r.texts(r.tgtList())).toEqual(['Tango', 'Lima']); // target box untouched → unchanged
    expect(announce).toHaveBeenCalledWith('2 results in the source list');
  });

  it('returns the model by reference when a list query is blank (identity preserved)', () => {
    const r = renderFilter();
    const cmp = r.cmp as unknown as {
      sourceFiltered(): readonly Row[];
      source(): readonly Row[];
    };
    expect(cmp.sourceFiltered()).toBe(cmp.source());
    r.type(r.srcInput(), 'l');
    expect(cmp.sourceFiltered()).not.toBe(cmp.source());
    r.type(r.srcInput(), '');
    expect(cmp.sourceFiltered()).toBe(cmp.source());
  });

  it('disables reorder on the filtering list only; transfer and the other list stay live', () => {
    const r = renderFilter(ROWS(), FOUR());
    r.type(r.srcInput(), 'l'); // source filtering
    expect(r.btnDisabled('Move up in the source list')).toBe(true);
    expect(r.btnDisabled('Move to bottom in the source list')).toBe(true);
    expect(r.opts(r.srcList()).every((o) => o.classList.contains('cdk-drag-disabled'))).toBe(true);
    // Target is NOT filtering → its reorder stays live and its rows remain draggable.
    expect(r.btnDisabled('Move down in the target list')).toBe(false);
    expect(r.opts(r.tgtList()).some((o) => o.classList.contains('cdk-drag-disabled'))).toBe(false);
    // Transfer stays live (both lists non-empty) — the whole point of filtering.
    expect(r.btnDisabled('Move selected to target')).toBe(false);
    expect(r.btnDisabled('Move all to target')).toBe(false);
  });

  it('maps a filtered source-row click to the right item (index-safe under filter)', () => {
    const r = renderFilter();
    r.type(r.srcInput(), 'l'); // visible [Alpha (0), Charlie (1)] — Charlie is full-index 2
    r.opts(r.srcList())[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    r.f.detectChanges();
    expect(names(r.fh.sourceSel())).toEqual(['Charlie']); // not Bravo
  });

  it('Ctrl+A while filtering the source selects only its visible rows', () => {
    const r = renderFilter();
    r.type(r.srcInput(), 'l'); // Alpha, Charlie visible
    r.opts(r.srcList())[0].focus();
    r.opts(r.srcList())[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }),
    );
    r.f.detectChanges();
    expect(names(r.fh.sourceSel())).toEqual(['Alpha', 'Charlie']); // not Bravo
  });

  it('transfers the selection while filtering (filter to find, then move)', () => {
    const r = renderFilter();
    r.type(r.srcInput(), 'l'); // visible Alpha, Charlie
    r.opts(r.srcList())[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); // select Charlie
    r.f.detectChanges();
    r.button('Move selected to target').click();
    r.f.detectChanges();
    expect(names(r.fh.targetItems())).toEqual(['Charlie']);
    expect(names(r.fh.sourceItems())).toEqual(['Alpha', 'Bravo']); // Charlie left source
    expect(r.fh.lastTransfer()!.to).toBe('target');
  });

  it('move-selected includes a filter-hidden selected row (transfer acts on the whole selection)', () => {
    const r = renderFilter();
    r.opts(r.srcList())[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); // select Bravo (no filter)
    r.f.detectChanges();
    expect(names(r.fh.sourceSel())).toEqual(['Bravo']);
    r.type(r.srcInput(), 'l'); // Bravo hidden from view...
    expect(r.texts(r.srcList())).toEqual(['Alpha', 'Charlie']);
    r.button('Move selected to target').click();
    r.f.detectChanges();
    expect(names(r.fh.targetItems())).toEqual(['Bravo']); // ...but it still transfers
    expect(names(r.fh.sourceItems())).toEqual(['Alpha', 'Charlie']);
  });

  it('shows the empty-state row for a no-match list; describes its box; announces; keeps focus on the box', () => {
    const r = renderFilter();
    r.srcInput().focus();
    r.type(r.srcInput(), 'zzz');
    expect(r.opts(r.srcList())).toEqual([]); // no real options
    const describedby = r.srcInput().getAttribute('aria-describedby');
    expect(describedby).toBeTruthy();
    const empty = r.srcList().querySelector(`#${describedby}`) as HTMLElement;
    expect(empty?.textContent?.trim()).toBe('No results');
    expect(empty.getAttribute('role')).toBe('presentation'); // not a fake option
    expect(announce).toHaveBeenCalledWith('No results');
    expect(document.activeElement).toBe(r.srcInput());
  });

  it('names the filtered side in the described-by instructions (unambiguous for the other list)', () => {
    const r = renderFilter();
    const instr = r.el.querySelector('.cae-pick-list__sr-only') as HTMLElement;
    expect(instr.textContent).toContain('Reorder within a list with its move buttons');
    r.type(r.srcInput(), 'l'); // only the source is filtering
    expect(instr.textContent).toContain('The source list is filtered');
    expect(instr.textContent).toContain('transfer buttons still move the selection');
    // Names SOURCE, not a generic "a list" — a user reading the still-live target list isn't misled.
    expect(instr.textContent).not.toContain('The target list is filtered');
  });

  it('disables Move selected (not Move all) when the source filters to zero matches with no selection', () => {
    const r = renderFilter();
    r.type(r.srcInput(), 'zzz'); // no matches, nothing selected → no move-set
    expect(r.btnDisabled('Move selected to target')).toBe(true); // not an enabled dead no-op
    expect(r.btnDisabled('Move all to target')).toBe(false); // move-all still moves the full model
  });

  it('keeps the source focus on a row focused WHILE filtering, across clearing (item-stable)', () => {
    const r = renderFilter();
    r.type(r.srcInput(), 'l'); // visible [Alpha, Charlie]
    r.opts(r.srcList())[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); // Charlie (filtered idx 1)
    r.f.detectChanges();
    r.type(r.srcInput(), ''); // clear — focus remaps to Charlie, not the stale filtered idx 1 (Bravo)
    const tabStop = r.srcList().querySelector('[tabindex="0"]') as HTMLElement;
    expect(tabStop.textContent!.trim()).toBe('Charlie'); // NOT Bravo
  });

  it('restores the source tab stop to the same item after a filter round-trip (focus not clamped away)', () => {
    const r = renderFilter();
    r.opts(r.srcList())[2].dispatchEvent(new MouseEvent('click', { bubbles: true })); // focus Charlie (index 2)
    r.f.detectChanges();
    r.type(r.srcInput(), 'char'); // filter down to just Charlie
    expect(r.texts(r.srcList())).toEqual(['Charlie']);
    r.type(r.srcInput(), ''); // clear — index 2 must survive against the full model, not clamp to 0
    const tabStop = r.srcList().querySelector('[tabindex="0"]') as HTMLElement;
    expect(tabStop.textContent!.trim()).toBe('Charlie'); // NOT Alpha
  });

  // The host is a logical flex row, so the panes mirror for free under rtl; only the centre transfer
  // glyphs flip (via the `--rtl` host class + a CSS scaleX). The visual flip needs real layout, so it's
  // a visual-regression concern (M4/#240) — here we lock the class hook via the ambient Directionality
  // change contract (a scoped `Dir` ancestor, the reactive path the demo uses), plus that the transfer
  // aria-labels stay semantic (never "left/right") so RTL never regresses the accessible name.
  describe('RTL (transfer axis)', () => {
    function renderDir(): ComponentFixture<PickListRtlHost> {
      const f = TestBed.createComponent(PickListRtlHost);
      filterFixtures.push(f); // drained by afterEach
      f.detectChanges();
      return f;
    }
    const pickListEl = (f: ComponentFixture<PickListRtlHost>): HTMLElement =>
      (f.nativeElement as HTMLElement).querySelector('.cae-pick-list') as HTMLElement;
    const hasRtl = (f: ComponentFixture<PickListRtlHost>): boolean =>
      pickListEl(f).classList.contains('cae-pick-list--rtl');

    it('adds the --rtl host class when the ambient direction becomes rtl', () => {
      const f = renderDir();
      expect(hasRtl(f)).toBe(false); // ltr baseline — no flip
      f.componentInstance.direction.set('rtl');
      f.detectChanges();
      expect(hasRtl(f)).toBe(true);
    });

    it('flips on first paint under a born-rtl [dir] binding (not just a post-init toggle)', () => {
      // Set rtl BEFORE the first detectChanges: the parent Dir binds rtl in the same update pass but
      // never emits `change` (it's pre-init), so the older toSignal(change,{initialValue}) idiom would
      // stay ltr here. Reading the signal-backed Directionality.value catches it. (Guards #342 vs #364.)
      const f = TestBed.createComponent(PickListRtlHost);
      filterFixtures.push(f);
      f.componentInstance.direction.set('rtl');
      f.detectChanges();
      expect(hasRtl(f)).toBe(true);
    });

    it('removes the --rtl host class when the ambient direction flips back to ltr', () => {
      const f = renderDir();
      f.componentInstance.direction.set('rtl');
      f.detectChanges();
      expect(hasRtl(f)).toBe(true);
      f.componentInstance.direction.set('ltr');
      f.detectChanges();
      expect(hasRtl(f)).toBe(false);
    });

    it('keeps the transfer button aria-labels direction-agnostic (semantic, not "left/right")', () => {
      const f = renderDir();
      f.componentInstance.direction.set('rtl');
      f.detectChanges();
      // The visual glyph flips; the accessible name never does — the same four semantic labels appear.
      const root = f.nativeElement as HTMLElement;
      const labels = Array.from(
        root.querySelectorAll<HTMLButtonElement>('.cae-pick-list__controls .cae-pick-list__btn'),
      ).map((b) => b.getAttribute('aria-label'));
      expect(labels).toEqual([
        'Move selected to target',
        'Move all to target',
        'Move selected to source',
        'Move all to source',
      ]);
    });
  });
});
