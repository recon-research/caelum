import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { vi } from 'vitest';

import {
  CaePickList,
  CaePickListItemDef,
  CaePickListSide,
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
      [sourceAriaLabel]="sourceAriaLabel()"
      [targetAriaLabel]="targetAriaLabel()"
      [sourceAriaLabelledby]="sourceAriaLabelledby()"
      [targetAriaLabelledby]="targetAriaLabelledby()"
      (transfer)="lastTransfer.set($event)"
    >
      <ng-template caePickListItem let-item let-i="index" let-active="active">
        <span class="tpl">{{ $any(item).name }}#{{ i }}{{ active ? '*' : '' }}</span>
      </ng-template>
    </cae-pick-list>
  `,
})
class PickListHost {
  readonly sourceItems = signal<readonly Row[]>([]);
  readonly targetItems = signal<readonly Row[]>([]);
  readonly sourceAriaLabel = signal('');
  readonly targetAriaLabel = signal('');
  readonly sourceAriaLabelledby = signal('');
  readonly targetAriaLabelledby = signal('');
  readonly lastTransfer = signal<CaePickListTransferEvent<Row> | null>(null);
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

describe('CaePickList', () => {
  let fixture: ComponentFixture<PickListHost>;
  let host: PickListHost;
  let announce: ReturnType<typeof vi.spyOn>;

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
  function activeTextIn(list: HTMLElement): string | null {
    const el = list.querySelector('[aria-selected="true"]');
    return el ? el.textContent!.trim() : null;
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

  it('renders two named listboxes of options, both wired as cdkDropLists sharing the instructions', () => {
    render({ source: ROWS(), target: [{ id: 'z', name: 'Zeta' }] });
    expect(lists().length).toBe(2);
    expect(src().getAttribute('aria-label')).toBe('Source list'); // default names
    expect(tgt().getAttribute('aria-label')).toBe('Target list');
    expect(optionsIn(src()).length).toBe(3);
    expect(optionsIn(tgt()).length).toBe(1);
    // Both CdkDropList directives are actually applied (they stamp this class) — so the transfer
    // (cdkDropListDropped) bindings are real, not just handlers tested in isolation.
    expect([src(), tgt()].every((l) => l.classList.contains('cdk-drop-list'))).toBe(true);
    // A single visually-hidden instructions node describes both listboxes.
    const described = src().getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    expect(tgt().getAttribute('aria-describedby')).toBe(described);
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

  it('activates the first row of each list by default: aria-selected + the sole tab stop', () => {
    render({
      source: ROWS(),
      target: [
        { id: 'z', name: 'Zeta' },
        { id: 'y', name: 'Yotta' },
      ],
    });
    for (const list of [src(), tgt()]) {
      const rows = optionsIn(list);
      expect(rows[0].getAttribute('aria-selected')).toBe('true');
      expect(rows[0].getAttribute('tabindex')).toBe('0');
      expect(rows[1].getAttribute('tabindex')).toBe('-1');
      expect(list.querySelectorAll('[aria-selected="true"]').length).toBe(1);
    }
  });

  it('activates a row on click within its own list (selection + tab stop follow)', () => {
    render({ source: ROWS(), target: [] });
    optionsIn(src())[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(optionsIn(src())[2].getAttribute('aria-selected')).toBe('true');
    expect(optionsIn(src())[2].getAttribute('tabindex')).toBe('0');
    expect(optionsIn(src())[0].getAttribute('aria-selected')).toBe('false');
  });

  it('moves the active row within a list with Arrow/Home/End, following focus (no transfer)', () => {
    render({ source: ROWS(), target: [] });
    const before = textsIn(src());
    optionsIn(src())[0].focus();

    optionsIn(src())[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    fixture.detectChanges();
    expect(document.activeElement).toBe(optionsIn(src())[1]);
    expect(activeTextIn(src())).toContain('Bravo');

    optionsIn(src())[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(optionsIn(src())[2]);

    optionsIn(src())[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(optionsIn(src())[0]);

    // Navigation never transfers or reorders, and doesn't announce.
    expect(textsIn(src())).toEqual(before);
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

  it('moves the selected row to the target end, activating it there, emitting + announcing', () => {
    render({ source: ROWS(), target: [] }); // source active = Alpha (0)
    btn('Move selected to target').click();
    fixture.detectChanges();

    expect(names(host.sourceItems())).toEqual(['Bravo', 'Charlie']);
    expect(names(host.targetItems())).toEqual(['Alpha']);
    expect(activeTextIn(tgt())).toContain('Alpha'); // the moved item is active in its new list
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
    expect(activeTextIn(tgt())).toContain('Alpha'); // first moved item is active (index 1)
    const evt = host.lastTransfer()!;
    expect(evt.from).toBe('source');
    expect(names(evt.items)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(announce).toHaveBeenCalledWith('Moved 3 items to the target list.');
  });

  it('moves selected + all back the other way (target → source)', () => {
    render({ source: [], target: ROWS() });
    optionsIn(tgt())[2].dispatchEvent(new MouseEvent('click', { bubbles: true })); // select Charlie
    fixture.detectChanges();

    btn('Move selected to source').click();
    fixture.detectChanges();
    expect(names(host.targetItems())).toEqual(['Alpha', 'Bravo']);
    expect(names(host.sourceItems())).toEqual(['Charlie']);
    expect(announce).toHaveBeenCalledWith('Moved to the source list, position 1 of 1.');

    btn('Move all to source').click();
    fixture.detectChanges();
    expect(host.targetItems().length).toBe(0);
    expect(names(host.sourceItems())).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(announce).toHaveBeenLastCalledWith('Moved 2 items to the source list.');
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

  it('ignores a within-list drop (same container) — no transfer, no announce (v1 sorting disabled)', () => {
    render({ source: ROWS(), target: [] });
    const before = textsIn(src());
    const same = {};
    drop({ previousContainer: same, container: same, previousIndex: 0, currentIndex: 2 }, 'source');
    fixture.detectChanges();
    expect(host.lastTransfer()).toBeNull();
    expect(announce).not.toHaveBeenCalled();
    expect(textsIn(src())).toEqual(before);
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

  it('clamps a list active index when it shrinks below it (no stale/resurrected index)', () => {
    render({ source: ROWS(), target: [] });
    optionsIn(src())[2].dispatchEvent(new MouseEvent('click', { bubbles: true })); // active = 2 (Charlie)
    fixture.detectChanges();
    expect(activeTextIn(src())).toContain('Charlie');
    // Shrink source externally to a single row: index 2 is out of range and must clamp.
    host.sourceItems.set([{ id: 'solo', name: 'Solo' }]);
    fixture.detectChanges();
    expect(activeTextIn(src())).toContain('Solo');
    // Grow back: the clamped index must NOT resurrect the old position 2.
    host.sourceItems.set(ROWS());
    fixture.detectChanges();
    expect(src().querySelector('[aria-selected="true"]')).toBe(optionsIn(src())[0]);
  });

  it('renders two empty lists without crashing — no rows, all transfer buttons aria-disabled', () => {
    render({ source: [], target: [] });
    expect(optionsIn(src()).length).toBe(0);
    expect(optionsIn(tgt()).length).toBe(0);
    expect(src().querySelectorAll('[aria-selected="true"]').length).toBe(0);
    expect(disabled('Move selected to target')).toBe(true);
    expect(disabled('Move all to target')).toBe(true);
    expect(disabled('Move selected to source')).toBe(true);
    expect(disabled('Move all to source')).toBe(true);
  });
});
