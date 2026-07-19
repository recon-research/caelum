import { Component, ElementRef, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeChipSet, CaeChipRemoveEvent } from './chip-set';

@Component({
  imports: [CaeChipSet],
  template: `
    <cae-chip-set
      [items]="items()"
      [ariaLabel]="ariaLabel"
      [ariaLabelledby]="ariaLabelledby"
      (removed)="onRemoved($event)"
    />
  `,
})
class StringHost {
  items = signal<readonly string[]>(['alpha', 'beta', 'gamma']);
  ariaLabel = '';
  ariaLabelledby = '';
  events: CaeChipRemoveEvent<string>[] = [];
  onRemoved(e: CaeChipRemoveEvent<string>): void {
    this.events.push(e);
    this.items.update((list) => list.filter((t) => t !== e.item));
  }
}

interface Tag {
  id: number;
  name: string;
}

@Component({
  imports: [CaeChipSet],
  template: `
    <cae-chip-set
      [items]="items()"
      [label]="labelFn"
      [removeAriaLabel]="removeFn"
      (removed)="removed = removed + 1"
    />
  `,
})
class ObjectHost {
  items = signal<readonly Tag[]>([
    { id: 1, name: 'Design' },
    { id: 2, name: 'Frontend' },
  ]);
  labelFn = (t: Tag): string => t.name;
  removeFn = (t: Tag): string => `Delete tag ${t.name}`;
  removed = 0;
}

// Exercises [emptyFocusTarget] (#202): an outside button to steal-test against, the set, and a
// focusable status region the set should land focus on when the LAST chip is removed by the user.
@Component({
  imports: [CaeChipSet],
  template: `
    <button #ext type="button">outside</button>
    <cae-chip-set
      [items]="items()"
      [emptyFocusTarget]="statusRef()"
      (removed)="onRemoved($event)"
    />
    <p #status tabindex="-1">status</p>
  `,
})
class TargetHost {
  items = signal<readonly string[]>(['solo']);
  readonly statusRef = viewChild<ElementRef<HTMLElement>>('status');
  readonly extRef = viewChild<ElementRef<HTMLButtonElement>>('ext');
  onRemoved(e: CaeChipRemoveEvent<string>): void {
    this.items.update((l) => l.filter((t) => t !== e.item));
  }
}

// Like TargetHost but the consumer drops the item ASYNCHRONOUSLY (the #205 case: a confirm dialog, or
// `http.delete().subscribe(drop)`). The drop is captured and applied only when the test calls `pendingDrop()`
// — fully deterministic, no timer/microtask races. This is exactly what the old request-time afterNextRender
// could not handle (it fired on the first post-request render, while the chip was still present, and never
// re-armed).
@Component({
  imports: [CaeChipSet],
  template: `
    <button #ext type="button">outside</button>
    <cae-chip-set
      [items]="items()"
      [emptyFocusTarget]="statusRef()"
      (removed)="onRemoved($event)"
    />
    <p #status tabindex="-1">status</p>
  `,
})
class AsyncTargetHost {
  items = signal<readonly string[]>(['solo']);
  readonly statusRef = viewChild<ElementRef<HTMLElement>>('status');
  readonly extRef = viewChild<ElementRef<HTMLButtonElement>>('ext');
  pendingDrop: (() => void) | null = null;
  onRemoved(e: CaeChipRemoveEvent<string>): void {
    this.pendingDrop = () => this.items.update((l) => l.filter((t) => t !== e.item));
  }
}

describe('CaeChipSet', () => {
  let el: HTMLElement;

  // Focus assertions (document.activeElement) need the host attached to the live document.
  afterEach(() => {
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  async function makeString(
    setup: (h: StringHost) => void = () => {},
  ): Promise<ComponentFixture<StringHost>> {
    await TestBed.configureTestingModule({ imports: [StringHost] }).compileComponents();
    const f = TestBed.createComponent(StringHost);
    setup(f.componentInstance);
    el = f.nativeElement as HTMLElement;
    document.body.appendChild(el);
    f.detectChanges();
    await f.whenStable();
    return f;
  }

  async function settle(f: ComponentFixture<unknown>): Promise<void> {
    f.detectChanges();
    await f.whenStable();
  }

  const grid = (f: ComponentFixture<unknown>): HTMLElement =>
    (f.nativeElement as HTMLElement).querySelector('mat-chip-grid') as HTMLElement;
  const rows = (f: ComponentFixture<unknown>): HTMLElement[] =>
    Array.from((f.nativeElement as HTMLElement).querySelectorAll('mat-chip-row'));
  const removeBtn = (row: HTMLElement): HTMLButtonElement | null => row.querySelector('button');

  it('renders one chip row per item, in order, with the labels', async () => {
    const f = await makeString();
    const r = rows(f);
    expect(r.length).toBe(3);
    expect(r.map((row) => row.textContent!.trim())).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('uses grid a11y semantics (role=grid / row / gridcell)', async () => {
    const f = await makeString();
    expect(grid(f).getAttribute('role')).toBe('grid');
    const r = rows(f);
    expect(r.every((row) => row.getAttribute('role') === 'row')).toBe(true);
    // Each row exposes gridcell descendants (the label + remove cells).
    expect(grid(f).querySelectorAll('[role="gridcell"]').length).toBeGreaterThanOrEqual(3);
  });

  it('drops the grid role when there are no chips (Material empty-set behaviour)', async () => {
    const f = await makeString((h) => h.items.set([]));
    expect(rows(f).length).toBe(0);
    expect(grid(f).getAttribute('role')).toBeNull();
  });

  it('is removable by default, naming each remove button "Remove <label>" (auto-distinct)', async () => {
    const f = await makeString();
    const r = rows(f);
    const labels = r.map((row) => removeBtn(row)!.getAttribute('aria-label'));
    expect(labels).toEqual(['Remove alpha', 'Remove beta', 'Remove gamma']);
    expect(r.every((row) => removeBtn(row)!.type === 'button')).toBe(true);
  });

  it('emits (removed) with the item + index when a × is clicked', async () => {
    const f = await makeString();
    removeBtn(rows(f)[1])!.click(); // remove 'beta'
    await settle(f);
    expect(f.componentInstance.events[0]).toEqual({ item: 'beta', index: 1 });
    // The consumer dropped it, so the chip unrenders — a live round-trip.
    expect(rows(f).map((row) => row.textContent!.trim())).toEqual(['alpha', 'gamma']);
  });

  it('removes on Enter on the remove button (keyboard operability)', async () => {
    const f = await makeString();
    const ev = new KeyboardEvent('keydown', { bubbles: true });
    Object.defineProperty(ev, 'keyCode', { get: () => 13 }); // ENTER — Material reads keyCode
    removeBtn(rows(f)[0])!.dispatchEvent(ev);
    await settle(f);
    expect(f.componentInstance.events[0]).toEqual({ item: 'alpha', index: 0 });
  });

  it('redirects focus to an adjacent chip when the focused chip is removed (the managed-set win)', async () => {
    // The reason cae-chip-set exists: a plain cae-chip drops focus to <body> on removal. Here, removing
    // the focused middle chip must land focus on a sibling chip, not <body>.
    const f = await makeString();
    const betaRemove = removeBtn(rows(f)[1])!;
    betaRemove.focus();
    expect(grid(f).contains(document.activeElement)).toBe(true); // focus is within the set
    betaRemove.click(); // remove 'beta' while it holds focus
    await settle(f);
    expect(rows(f).map((row) => row.textContent!.trim())).toEqual(['alpha', 'gamma']);
    // Focus stayed inside the set (redirected to a sibling chip), not stranded on <body>.
    expect(document.activeElement).not.toBe(document.body);
    expect(grid(f).contains(document.activeElement)).toBe(true);
  });

  it('does NOT manage focus when the LAST chip is removed (empty-set is the consumer contract, #202)', async () => {
    // Verified against Material 22: removing the final chip leaves no in-set target and MatChipGrid.focus()
    // no-ops (no chip input), so focus leaves the set. The docstring scopes the redirect to "a sibling
    // remains"; the empty case is the consumer's (the Forge demo moves focus to its status region).
    const f = await makeString((h) => h.items.set(['solo']));
    const soloRemove = removeBtn(rows(f)[0])!;
    soloRemove.focus();
    soloRemove.click();
    await settle(f);
    expect(rows(f).length).toBe(0);
    expect(grid(f).contains(document.activeElement)).toBe(false); // not retained in the emptied set
  });

  async function makeTarget(): Promise<ComponentFixture<TargetHost>> {
    await TestBed.configureTestingModule({ imports: [TargetHost] }).compileComponents();
    const f = TestBed.createComponent(TargetHost);
    el = f.nativeElement as HTMLElement;
    document.body.appendChild(el);
    f.detectChanges();
    await f.whenStable();
    return f;
  }

  it('moves focus to [emptyFocusTarget] when the last chip is removed while focus was in the set (#202)', async () => {
    // The first-class hook for the empty case: bind an element and the set lands focus there after the
    // emptying render, so a keyboard user who removes the final chip is not dropped to <body>.
    const f = await makeTarget();
    const soloRemove = removeBtn(rows(f)[0])!;
    soloRemove.focus();
    expect(grid(f).contains(document.activeElement)).toBe(true); // focus is in the set at removal
    soloRemove.click(); // remove 'solo' -> the set empties
    await settle(f);
    expect(rows(f).length).toBe(0);
    expect(document.activeElement).toBe(f.componentInstance.statusRef()!.nativeElement);
  });

  it('does NOT steal focus to [emptyFocusTarget] on a programmatic clear (focus was outside the set) (#202)', async () => {
    // The steal guard (WCAG 3.2.x, the #189 principle): emptying the set by any path OTHER than a
    // focus-holding removal must leave the user's focus where it is. Here focus is on an outside button
    // and the list is cleared directly (not via a chip ×) — focus must stay on the button.
    const f = await makeTarget();
    const extBtn = f.componentInstance.extRef()!.nativeElement;
    extBtn.focus();
    expect(document.activeElement).toBe(extBtn);
    f.componentInstance.items.set([]); // programmatic clear — never routes through onRemoved
    await settle(f);
    expect(rows(f).length).toBe(0);
    expect(document.activeElement).toBe(extBtn); // untouched
  });

  it('does NOT steal focus when the last chip is removed while focus is OUTSIDE the set (heldFocus gate, #202)', async () => {
    // Anti-steal (WCAG 3.2.x, #189): a chip removal that did NOT hold focus in the set (here a non-focusing
    // pointer × — the Safari/Firefox case — with focus parked on an outside BUTTON) leaves focus where it is.
    // Note focus is on an element OUTSIDE the host, so the move-time ownsFocus check also rejects the move;
    // the sibling test below (focus on <body>) is what UNIQUELY exercises the request-time heldFocus arm-gate.
    // Distinct from the programmatic-clear test above, which bypasses onRemoved entirely.
    const f = await makeTarget();
    const extBtn = f.componentInstance.extRef()!.nativeElement;
    extBtn.focus();
    expect(document.activeElement).toBe(extBtn);
    removeBtn(rows(f)[0])!.click(); // removes the last chip; the click does not focus the × (focus stays on extBtn)
    await settle(f);
    expect(rows(f).length).toBe(0);
    expect(document.activeElement).toBe(extBtn); // not yanked to the empty-focus target
  });

  it('does NOT arm the empty redirect when the removal did not hold focus (focus on <body>, heldFocus gate #205)', async () => {
    // The case that UNIQUELY gives the request-time heldFocus arm-gate teeth: with focus on <body> (nothing
    // focused), a non-focusing pointer × (jsdom .click() does not focus) removes the last chip. heldFocus is
    // false → the redirect never arms → focus stays on <body>. This FAILS if `heldFocus &&` is dropped from the
    // arm condition: the marker would arm (wasLast true), the set would empty, and the move-time ownsFocus check
    // treats <body> as "ours" → focus would jump to emptyFocusTarget. The extBtn test above can't catch that
    // deletion (its focus is on an outside element, which ownsFocus also rejects).
    const f = await makeTarget();
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(document.activeElement).toBe(document.body); // nothing focused
    removeBtn(rows(f)[0])!.click(); // non-focusing pointer × on the last chip; focus stays on <body>
    await settle(f);
    expect(rows(f).length).toBe(0);
    expect(document.activeElement).toBe(document.body); // not redirected to emptyFocusTarget
  });

  async function makeAsyncTarget(): Promise<ComponentFixture<AsyncTargetHost>> {
    await TestBed.configureTestingModule({ imports: [AsyncTargetHost] }).compileComponents();
    const f = TestBed.createComponent(AsyncTargetHost);
    el = f.nativeElement as HTMLElement;
    document.body.appendChild(el);
    f.detectChanges();
    await f.whenStable();
    return f;
  }

  it('lands focus on [emptyFocusTarget] when the last chip is dropped ASYNCHRONOUSLY (#205)', async () => {
    // The gap the old request-time afterNextRender missed: the consumer defers the drop (a confirm dialog /
    // http.delete().subscribe). The redirect must key off the set ACTUALLY emptying, not the removal request.
    const f = await makeAsyncTarget();
    const soloRemove = removeBtn(rows(f)[0])!;
    soloRemove.focus();
    expect(grid(f).contains(document.activeElement)).toBe(true); // focus in the set at removal
    soloRemove.click(); // request only — the drop is deferred
    await settle(f);
    // Genuinely still present: the old afterNextRender would have fired on THIS render and given up.
    expect(rows(f).length).toBe(1);
    // Now the async drop lands:
    f.componentInstance.pendingDrop!();
    await settle(f);
    expect(rows(f).length).toBe(0);
    expect(document.activeElement).toBe(f.componentInstance.statusRef()!.nativeElement); // followed the async emptying
  });

  it('does NOT steal focus on an async empty when focus legitimately moved away during the gap (#205 re-validation)', async () => {
    // The move-time ownership re-check: if the user moves focus elsewhere while the async drop is in flight,
    // the later emptying must NOT yank focus back to [emptyFocusTarget] (WCAG 3.2.5). This FAILS a naive
    // pending-flag redesign that moves unconditionally once the set empties.
    const f = await makeAsyncTarget();
    const soloRemove = removeBtn(rows(f)[0])!;
    soloRemove.focus();
    soloRemove.click(); // armed (held focus + last chip)
    await settle(f);
    const extBtn = f.componentInstance.extRef()!.nativeElement;
    extBtn.focus(); // focus legitimately moves away during the async gap
    expect(document.activeElement).toBe(extBtn);
    f.componentInstance.pendingDrop!(); // async drop lands → the set empties
    await settle(f);
    expect(rows(f).length).toBe(0);
    expect(document.activeElement).toBe(extBtn); // not stolen to the empty-focus target
  });

  it('lands focus on [emptyFocusTarget] when a SYNCHRONOUS cascade removal empties a >1 set (#448)', async () => {
    // #448: a (removed) handler that drops SEVERAL items at once — a parent-cascades-to-children multi-drop —
    // empties the set from length > 1. The pre-emit "empties alone" predictor is false (children still present),
    // so the redirect must arm on the POST-emit observed emptying. Synchronous ⇒ unambiguously removal-caused
    // (no async gap for a coincident clear). FAILS without the emptiedNow trigger — focus falls to <body>.
    @Component({
      imports: [CaeChipSet],
      template: `
        <cae-chip-set
          [items]="items()"
          [emptyFocusTarget]="statusRef()"
          (removed)="onRemoved($event)"
        />
        <p #status tabindex="-1">status</p>
      `,
    })
    class CascadeHost {
      items = signal<readonly string[]>(['parent', 'child-a', 'child-b']);
      readonly statusRef = viewChild<ElementRef<HTMLElement>>('status');
      onRemoved(e: CaeChipRemoveEvent<string>): void {
        // Removing the parent cascades to its children — the whole set empties synchronously from length 3.
        if (e.item === 'parent') this.items.set([]);
        else this.items.update((l) => l.filter((t) => t !== e.item));
      }
    }
    await TestBed.configureTestingModule({ imports: [CascadeHost] }).compileComponents();
    const f = TestBed.createComponent(CascadeHost);
    el = f.nativeElement as HTMLElement;
    document.body.appendChild(el);
    f.detectChanges();
    await f.whenStable();
    const parentRemove = removeBtn(rows(f)[0])!; // 'parent'
    parentRemove.focus();
    expect(grid(f).contains(document.activeElement)).toBe(true); // focus in the set at removal
    parentRemove.click(); // cascade-drops all three synchronously inside the emit
    await settle(f);
    expect(rows(f).length).toBe(0); // emptied from length 3
    expect(document.activeElement).toBe(f.componentInstance.statusRef()!.nativeElement); // redirected, not <body>
  });

  it('does NOT redirect on a coincident programmatic clear during an async NON-last removal (#448 anti-steal)', async () => {
    // The counterpart guard: once a drop is DEFERRED, an emptying can't be told apart from a coincident
    // programmatic clear, so the sync-cascade arm must NOT widen the async path. A NON-last chip is removed
    // async (drop pending) while two siblings remain; the consumer then clears the whole set. The emptying is
    // the CLEAR's doing, not the removal's → no redirect (WCAG 3.2.5). FAILS if emptiedNow leaked into async.
    @Component({
      imports: [CaeChipSet],
      template: `
        <cae-chip-set
          [items]="items()"
          [emptyFocusTarget]="statusRef()"
          (removed)="onRemoved($event)"
        />
        <p #status tabindex="-1">status</p>
      `,
    })
    class AsyncClearHost {
      items = signal<readonly string[]>(['a', 'b', 'c']);
      readonly statusRef = viewChild<ElementRef<HTMLElement>>('status');
      pendingDrop: (() => void) | null = null;
      onRemoved(e: CaeChipRemoveEvent<string>): void {
        this.pendingDrop = () => this.items.update((l) => l.filter((t) => t !== e.item));
      }
      clear(): void {
        this.items.set([]);
      }
    }
    await TestBed.configureTestingModule({ imports: [AsyncClearHost] }).compileComponents();
    const f = TestBed.createComponent(AsyncClearHost);
    el = f.nativeElement as HTMLElement;
    document.body.appendChild(el);
    f.detectChanges();
    await f.whenStable();
    const aRemove = removeBtn(rows(f)[0])!; // 'a' — a NON-last chip
    aRemove.focus();
    expect(grid(f).contains(document.activeElement)).toBe(true);
    aRemove.click(); // async removal request; the drop is deferred (pendingDrop captured, 'a' still present)
    await settle(f);
    expect(rows(f).length).toBe(3); // nothing dropped yet, siblings remain — nothing armed
    f.componentInstance.clear(); // programmatic clear empties the set
    await settle(f);
    expect(rows(f).length).toBe(0);
    // The emptying was the clear's, not the removal's — focus fell to <body>, not stolen to the target.
    expect(document.activeElement).not.toBe(f.componentInstance.statusRef()!.nativeElement);
    expect(document.activeElement).toBe(document.body);
  });

  it('does NOT redirect to [emptyFocusTarget] on a non-last sync removal — focus stays on the grid sibling (#448)', async () => {
    // The one-shot's "enabled chip remains" guard: a non-last SYNCHRONOUS removal (emptiesAlone false → the
    // one-shot path) whose drop leaves an enabled sibling must let the grid's FocusKeyManager keep focus on that
    // sibling, NOT yank it to the target. FAILS if redirectAfterSyncCascade drops its `items.some(enabled)` guard
    // (the one-shot would then steal focus off the redirected sibling — a WCAG 3.2.5 steal).
    @Component({
      imports: [CaeChipSet],
      template: `
        <cae-chip-set
          [items]="items()"
          [emptyFocusTarget]="statusRef()"
          (removed)="onRemoved($event)"
        />
        <p #status tabindex="-1">status</p>
      `,
    })
    class MultiTargetHost {
      items = signal<readonly string[]>(['alpha', 'beta', 'gamma']);
      readonly statusRef = viewChild<ElementRef<HTMLElement>>('status');
      onRemoved(e: CaeChipRemoveEvent<string>): void {
        this.items.update((l) => l.filter((t) => t !== e.item));
      }
    }
    await TestBed.configureTestingModule({ imports: [MultiTargetHost] }).compileComponents();
    const f = TestBed.createComponent(MultiTargetHost);
    el = f.nativeElement as HTMLElement;
    document.body.appendChild(el);
    f.detectChanges();
    await f.whenStable();
    const betaRemove = removeBtn(rows(f)[1])!; // 'beta' — a non-last middle chip
    betaRemove.focus();
    expect(grid(f).contains(document.activeElement)).toBe(true);
    betaRemove.click(); // sync drop of 'beta'; alpha + gamma remain → one-shot fires but must NOT redirect
    await settle(f);
    expect(rows(f).length).toBe(2);
    expect(document.activeElement).not.toBe(f.componentInstance.statusRef()!.nativeElement); // not the target
    expect(grid(f).contains(document.activeElement)).toBe(true); // grid kept focus on a sibling
  });

  it('does NOT steal focus into a SIBLING chip when an ASYNC drop lands after the user has left (#556)', async () => {
    // The sibling-chip half of the async-drop steal (#551 fixed the empty-set half). Material's
    // _redirectDestroyedChipFocus is SYNCHRONOUS and unconditional: when the drop finally lands it focuses a
    // surviving sibling whether or not the user is still here. Every ownership gate this component has hangs
    // off the empty-set paths, so nothing intercepts it (WCAG 3.2.5).
    const f = await makeAsyncTarget();
    f.componentInstance.items.set(['a', 'b', 'c']);
    await settle(f);
    const aRemove = removeBtn(rows(f)[0])!;
    aRemove.focus();
    aRemove.click(); // request only; two enabled siblings remain → the NOT-last branch, no empty marker
    await settle(f);
    expect(rows(f).length).toBe(3); // the drop is genuinely still in flight
    const extBtn = f.componentInstance.extRef()!.nativeElement;
    extBtn.focus(); // the user gives up waiting and moves to an unrelated field
    expect(document.activeElement).toBe(extBtn);
    f.componentInstance.pendingDrop!(); // the async drop lands → Material redirects into chip 'b'
    await settle(f);
    expect(rows(f).length).toBe(2);
    expect(document.activeElement).toBe(extBtn); // must stay where the user left it
  });

  it('does NOT drag the user back out when they RETURN to the set before the async drop lands (#556)', async () => {
    // The discriminator behind the #556 restore: an arrival from outside is Material's grab only while an items
    // change is mid-flight. A user who Tabs back in during the async gap arrives with the set SETTLED, so their
    // return must not be witnessed — otherwise the drop landing would yank them back out to where they came
    // from, inverting the fix into the very steal it prevents. FAILS if onFocusIn drops its settled-set gate.
    const f = await makeAsyncTarget();
    f.componentInstance.items.set(['a', 'b', 'c']);
    await settle(f);
    const aRemove = removeBtn(rows(f)[0])!;
    aRemove.focus();
    aRemove.click(); // async removal request, two enabled siblings remain
    await settle(f);
    const extBtn = f.componentInstance.extRef()!.nativeElement;
    extBtn.focus(); // the user steps away...
    (rows(f)[1].querySelector('.mat-mdc-chip-action') as HTMLElement).focus(); // ...then comes back on their own
    expect(grid(f).contains(document.activeElement)).toBe(true);
    f.componentInstance.pendingDrop!(); // the drop lands while they are legitimately inside the set
    await settle(f);
    expect(rows(f).length).toBe(2);
    expect(document.activeElement).not.toBe(extBtn); // not dragged back out
    expect(grid(f).contains(document.activeElement)).toBe(true); // left in the set, where they chose to be
  });

  it('still redirects to a sibling when an async drop lands while the user WAITED in the set (#556)', async () => {
    // The desirable half of Material's sibling redirect — the reason a managed chip set exists — must survive
    // the #556 restore: a user who waits in the set is LEFT on the sibling Material picks.
    // What this does NOT pin is the <body> arm of onFocusIn's witness guard. jsdom reports relatedTarget as
    // `null` here (measured), and `document.body.focus()` is a silent no-op there while it genuinely blurs in
    // a browser — so that arm passes with or without the guard and is unpinnable in jsdom. A test asserting
    // otherwise was written, proven vacuous by mutation, and deleted; see chip-set.ts › onFocusIn and #617.
    const f = await makeAsyncTarget();
    f.componentInstance.items.set(['a', 'b', 'c']);
    await settle(f);
    const aRemove = removeBtn(rows(f)[0])!;
    aRemove.focus();
    aRemove.click(); // async removal request — the user waits, focus stays in the set
    await settle(f);
    f.componentInstance.pendingDrop!(); // the drop lands with the user still here
    await settle(f);
    expect(rows(f).length).toBe(2);
    expect(document.activeElement).not.toBe(document.body); // not stranded
    expect(grid(f).contains(document.activeElement)).toBe(true); // Material's redirect kept the user in the set
  });

  it('keeps waiting across an UNRELATED items change while the async drop is in flight (#556)', async () => {
    // The marker must be consumed on the render where the removed item actually DEPARTS, not on the first
    // items change that happens to come along. A list that mutates for its own reasons mid-drop (a poll, a
    // collaborator's insert) would otherwise disarm the guard early and leave the real grab — which lands
    // later — unprotected. FAILS if restoreAfterSiblingGrab drops its still-present check.
    const f = await makeAsyncTarget();
    f.componentInstance.items.set(['a', 'b', 'c']);
    await settle(f);
    const aRemove = removeBtn(rows(f)[0])!;
    aRemove.focus();
    aRemove.click(); // async removal request for 'a' → marker armed
    await settle(f);
    f.componentInstance.items.update((l) => [...l, 'd']); // unrelated insert; 'a' is still present
    await settle(f);
    expect(rows(f).length).toBe(4);
    const extBtn = f.componentInstance.extRef()!.nativeElement;
    extBtn.focus(); // the user leaves while the drop is still pending
    f.componentInstance.pendingDrop!(); // now 'a' finally departs → Material grabs a sibling
    await settle(f);
    expect(rows(f).length).toBe(3);
    expect(document.activeElement).toBe(extBtn); // the marker survived the unrelated change and still guarded
  });

  it('does not reuse a witness from an EARLIER removal on a later one (#556)', async () => {
    // The witness binds to the flush it was captured in — the subtlest part of the design. Removal 1 restores
    // the user to an outside button; removal 2 is a normal stay-put remove whose redirect is CORRECT. If the
    // witness outlived its flush, removal 2 would "restore" to removal 1's button and throw the user out of
    // the set on a removal they never left. FAILS if the effect stops clearing grabWitness each run.
    const f = await makeAsyncTarget();
    f.componentInstance.items.set(['a', 'b', 'c']);
    await settle(f);
    const extBtn = f.componentInstance.extRef()!.nativeElement;
    // Removal 1: the user leaves, the drop lands, the #556 restore fires and puts them back on extBtn.
    removeBtn(rows(f)[0])!.focus();
    removeBtn(rows(f)[0])!.click();
    await settle(f);
    extBtn.focus();
    f.componentInstance.pendingDrop!();
    await settle(f);
    expect(document.activeElement).toBe(extBtn); // restore fired — a witness existed this flush

    // Removal 2: the user is in the set and STAYS. Material's redirect is right; nothing to undo.
    removeBtn(rows(f)[0])!.focus();
    removeBtn(rows(f)[0])!.click();
    await settle(f);
    f.componentInstance.pendingDrop!();
    await settle(f);
    expect(rows(f).length).toBe(1);
    expect(document.activeElement).not.toBe(extBtn); // not thrown out by removal 1's stale witness
    expect(grid(f).contains(document.activeElement)).toBe(true);
  });

  it('[textEntry]: an async drop must not yank the user out of the FIELD into a chip (#556)', async () => {
    // Found by adversarial review of this slice. With [textEntry] the input is a separate composite control
    // inside the same host, so a witness test scoped to the HOST reads "grab pulled the user out of the field
    // into a chip" as an internal move and drops it — leaving the steal (WCAG 3.2.5) unremediated on the one
    // surface where the user is most likely to be mid-task, typing. Scoping the test to the GRID fixes it.
    // With [addOnBlur] it compounds: the field's blur commits half-typed text as a chip.
    @Component({
      imports: [CaeChipSet],
      template: `
        <cae-chip-set
          [items]="items()"
          textEntry
          textEntryLabel="Add"
          (removed)="onRemoved($event)"
        />
      `,
    })
    class EntryAsyncHost {
      items = signal<readonly string[]>(['a', 'b', 'c']);
      pendingDrop: (() => void) | null = null;
      onRemoved(e: CaeChipRemoveEvent<string>): void {
        this.pendingDrop = () => this.items.update((l) => l.filter((t) => t !== e.item));
      }
    }
    await TestBed.configureTestingModule({ imports: [EntryAsyncHost] }).compileComponents();
    const f = TestBed.createComponent(EntryAsyncHost);
    el = f.nativeElement as HTMLElement;
    document.body.appendChild(el);
    f.detectChanges();
    await f.whenStable();
    const aRemove = removeBtn(rows(f)[0])!;
    aRemove.focus();
    aRemove.click();
    await settle(f);
    const inp = (f.nativeElement as HTMLElement).querySelector(
      '.cae-chip-set__input',
    ) as HTMLInputElement;
    inp.focus(); // user moves into the text field and starts typing
    expect(document.activeElement).toBe(inp);
    f.componentInstance.pendingDrop!();
    await settle(f);
    expect(document.activeElement).toBe(inp); // must stay in the field
  });

  it("witnesses no grab when the user clicks in during the drop's scheduling gap (#556)", async () => {
    // Both adversarial lenses filed a steal here: they read `items() === renderedItems` as a WALL-CLOCK gap
    // between the consumer writing the signal and the flush, which a real click could land inside. It is not
    // one. `items` is a signal INPUT, so it does not update when the parent writes — only when change
    // detection propagates the binding. The window where it differs from the last rendered value therefore
    // lies INSIDE the synchronous flush, where no user-driven focus event can interleave.
    // This drives their exact sequence: an external control that flushes the pending drop from its own
    // focusout handler, so the write lands before the user's focusin. Verified to have teeth — removing the
    // settled-set gate makes it fail.
    const f = await makeAsyncTarget();
    f.componentInstance.items.set(['a', 'b', 'c']);
    await settle(f);
    const aRemove = removeBtn(rows(f)[0])!;
    aRemove.focus();
    aRemove.click(); // async removal, marker armed
    await settle(f);
    const extBtn = f.componentInstance.extRef()!.nativeElement;
    // The external element flushes the pending drop as focus LEAVES it — so the items write lands
    // before the user's own focusin, inside the mid-flight window.
    extBtn.addEventListener('focusout', () => f.componentInstance.pendingDrop!());
    extBtn.focus();
    const bAction = rows(f)[1].querySelector('.mat-mdc-chip-action') as HTMLElement;
    bAction.focus(); // the user deliberately clicks chip b
    await settle(f);
    expect(document.activeElement).not.toBe(extBtn); // must not be thrown back out
  });

  it('dev-warns when [emptyFocusTarget] is non-focusable and does not receive focus (#206)', async () => {
    // The DX guard: a target missing tabindex="-1" (or detached) makes .focus() a silent no-op, dropping
    // the keyboard user to <body> — same as no redirect, but hidden. Here the target is a plain <p> (not
    // focusable), so after the emptying removal focus does NOT land on it and the dev-warn must fire. This
    // FAILS if the post-focus warn is removed. jsdom respects tabindex-focusability (the tabindex="-1"
    // TargetHost above lands focus; this one cannot), so the distinction has teeth.
    @Component({
      imports: [CaeChipSet],
      template: `
        <cae-chip-set
          [items]="items()"
          [emptyFocusTarget]="statusRef()"
          (removed)="onRemoved($event)"
        />
        <p #status>status</p>
      `,
    })
    class NonFocusableTargetHost {
      items = signal<readonly string[]>(['solo']);
      readonly statusRef = viewChild<ElementRef<HTMLElement>>('status');
      onRemoved(e: CaeChipRemoveEvent<string>): void {
        this.items.update((l) => l.filter((t) => t !== e.item));
      }
    }
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (m?: unknown) => warnings.push(String(m));
    try {
      await TestBed.configureTestingModule({
        imports: [NonFocusableTargetHost],
      }).compileComponents();
      const f = TestBed.createComponent(NonFocusableTargetHost);
      el = f.nativeElement as HTMLElement;
      document.body.appendChild(el);
      f.detectChanges();
      await f.whenStable();
      const soloRemove = removeBtn(rows(f)[0])!;
      soloRemove.focus();
      expect(grid(f).contains(document.activeElement)).toBe(true); // focus held in the set at removal
      soloRemove.click(); // remove the last chip -> the set empties, afterNextRender fires the failed focus
      await settle(f);
      expect(rows(f).length).toBe(0);
      expect(document.activeElement).not.toBe(f.componentInstance.statusRef()!.nativeElement); // focus did NOT land
      expect(warnings.some((w) => w.includes('did not receive focus'))).toBe(true);
    } finally {
      console.warn = realWarn;
    }
  });

  it('does NOT dev-warn when [emptyFocusTarget] receives focus (no false positive) (#206)', async () => {
    // Locks the guard's condition: with a focusable target (tabindex="-1"), focus lands and the warn must
    // stay silent. FAILS if the warn is made unconditional.
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (m?: unknown) => warnings.push(String(m));
    try {
      const f = await makeTarget();
      const soloRemove = removeBtn(rows(f)[0])!;
      soloRemove.focus();
      soloRemove.click();
      await settle(f);
      expect(document.activeElement).toBe(f.componentInstance.statusRef()!.nativeElement); // focus landed
      expect(warnings.some((w) => w.includes('did not receive focus'))).toBe(false);
    } finally {
      console.warn = realWarn;
    }
  });

  it('names the set via aria-label', async () => {
    const f = await makeString((h) => (h.ariaLabel = 'Workspace tags'));
    expect(grid(f).getAttribute('aria-label')).toBe('Workspace tags');
  });

  it('names the set via aria-labelledby (preferred when a visible label exists)', async () => {
    const f = await makeString((h) => (h.ariaLabelledby = 'tags-label'));
    expect(grid(f).getAttribute('aria-labelledby')).toBe('tags-label');
    expect(grid(f).hasAttribute('aria-label')).toBe(false);
  });

  it('supports object items via a [label] accessor + a [removeAriaLabel] override', async () => {
    await TestBed.configureTestingModule({ imports: [ObjectHost] }).compileComponents();
    const f = TestBed.createComponent(ObjectHost);
    el = f.nativeElement as HTMLElement;
    f.detectChanges();
    await f.whenStable();
    const r = rows(f);
    expect(r.map((row) => row.textContent!.trim())).toEqual(['Design', 'Frontend']);
    expect(removeBtn(r[0])!.getAttribute('aria-label')).toBe('Delete tag Design');
    removeBtn(r[1])!.click();
    await settle(f);
    expect(f.componentInstance.removed).toBe(1);
  });

  it('throws a clear cae-chip-set error on duplicate items (dev config guard, preempts NG0955)', async () => {
    await TestBed.configureTestingModule({ imports: [StringHost] }).compileComponents();
    const f = TestBed.createComponent(StringHost);
    f.componentInstance.items.set(['dup', 'dup']);
    el = f.nativeElement as HTMLElement;
    expect(() => f.detectChanges()).toThrowError(/cae-chip-set: \[items\] has duplicate value/);
  });

  it('dev-warns when an object item has no [label] (would render "[object Object]")', async () => {
    @Component({ imports: [CaeChipSet], template: `<cae-chip-set [items]="items" />` })
    class NoLabelHost {
      items = [{ id: 1 }, { id: 2 }]; // distinct refs (unique), but no [label] -> String() = [object Object]
    }
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (m?: unknown) => warnings.push(String(m));
    try {
      await TestBed.configureTestingModule({ imports: [NoLabelHost] }).compileComponents();
      const f = TestBed.createComponent(NoLabelHost);
      el = f.nativeElement as HTMLElement;
      f.detectChanges();
      expect(warnings.some((w) => w.includes('[object Object]'))).toBe(true);
    } finally {
      console.warn = realWarn;
    }
  });

  describe('per-item [chipRemovable]/[chipDisabled] (#201)', () => {
    interface Item {
      id: number;
      name: string;
      locked?: boolean;
      off?: boolean;
    }

    @Component({
      imports: [CaeChipSet],
      template: `
        <cae-chip-set
          [items]="items()"
          [label]="labelFn"
          [chipRemovable]="removableFn"
          [chipDisabled]="disabledFn"
          (removed)="onRemoved($event)"
        />
      `,
    })
    class PerItemHost {
      // A mixed list: an open chip (removable), a locked chip (non-removable but enabled), a disabled chip.
      items = signal<readonly Item[]>([
        { id: 1, name: 'open' },
        { id: 2, name: 'locked', locked: true },
        { id: 3, name: 'off', off: true },
      ]);
      labelFn = (t: Item): string => t.name;
      removableFn = (t: Item): boolean => !t.locked;
      disabledFn = (t: Item): boolean => !!t.off;
      events: CaeChipRemoveEvent<Item>[] = [];
      onRemoved(e: CaeChipRemoveEvent<Item>): void {
        this.events.push(e);
        this.items.update((l) => l.filter((x) => x !== e.item));
      }
    }

    async function makePerItem(): Promise<ComponentFixture<PerItemHost>> {
      await TestBed.configureTestingModule({ imports: [PerItemHost] }).compileComponents();
      const f = TestBed.createComponent(PerItemHost);
      el = f.nativeElement as HTMLElement;
      document.body.appendChild(el);
      f.detectChanges();
      await f.whenStable();
      return f;
    }

    it('renders a × only on removable, non-disabled chips (locked and disabled chips have none)', async () => {
      const f = await makePerItem();
      const r = rows(f);
      expect(r.length).toBe(3);
      expect(removeBtn(r[0])).not.toBeNull(); // open -> removable
      expect(removeBtn(r[1])).toBeNull(); // locked -> no × affordance
      expect(removeBtn(r[2])).toBeNull(); // disabled -> implicitly locked, no ×
    });

    it('greys + aria-disables a [chipDisabled] chip while a locked-but-enabled chip stays enabled', async () => {
      const f = await makePerItem();
      const r = rows(f);
      // The a11y contract (not just the greying class): Material sets aria-disabled on the disabled chip's
      // actionable cell. A locked-but-enabled chip is NOT aria-disabled — it's a normal, announced chip.
      expect(r[2].querySelector('[aria-disabled="true"]')).not.toBeNull(); // disabled 'off'
      expect(r[1].querySelector('[aria-disabled="true"]')).toBeNull(); // locked != disabled
      expect(r[0].querySelector('[aria-disabled="true"]')).toBeNull(); // open
      expect(r[2].classList.contains('mat-mdc-chip-disabled')).toBe(true); // and greyed
    });

    it('still removes a removable chip in a mixed list ((removed) fires, only that chip drops)', async () => {
      const f = await makePerItem();
      removeBtn(rows(f)[0])!.click(); // remove 'open'
      await settle(f);
      expect(f.componentInstance.events.map((e) => e.item.name)).toEqual(['open']);
      expect(rows(f).map((row) => row.textContent!.trim())).toEqual(['locked', 'off']);
    });

    it('defaults to all-removable, none-disabled when the accessors are unset (non-breaking, v1 behaviour)', async () => {
      const f = await makeString(); // StringHost binds neither chipRemovable nor chipDisabled
      const r = rows(f);
      expect(r.every((row) => removeBtn(row) !== null)).toBe(true);
      expect(r.some((row) => row.classList.contains('mat-mdc-chip-disabled'))).toBe(false);
    });

    it('does not remove a locked chip via Backspace (the [removable] gate + onRemoved guard, #201)', async () => {
      // The × absence isn't what stops a keyboard remove — Material's remove() is gated by [removable], and
      // onRemoved guards the emit. Backspace on a locked chip must be a no-op. FAILS if [removable] regresses
      // to a bare `removable` and the guard is dropped. (Positive control: the Enter-on-× test above proves
      // keyboard removal is wired, so a silent no-op here is the gate working, not a dead event path.)
      const f = await makePerItem();
      const lockedRow = rows(f)[1]; // 'locked' — non-removable, enabled, no ×
      const ev = new KeyboardEvent('keydown', { bubbles: true });
      Object.defineProperty(ev, 'keyCode', { get: () => 8 }); // BACKSPACE — Material reads keyCode
      lockedRow.dispatchEvent(ev);
      await settle(f);
      expect(f.componentInstance.events).toEqual([]);
      expect(rows(f).length).toBe(3);
    });

    it('lands focus on [emptyFocusTarget] when removing the last ENABLED chip leaves only disabled chips (#201)', async () => {
      // The strand this feature could reintroduce (verified against Material 22): the FocusKeyManager skips
      // disabled chips and MatChipGrid.focus() no-ops on a disabled-only set, so removing the focused removable
      // chip when only a disabled sibling remains would drop focus to <body> — even though a chip remains. The
      // redirect must treat "no enabled chip left" like the empty case. FAILS without the noEnabledChipLeft arm.
      @Component({
        imports: [CaeChipSet],
        template: `
          <cae-chip-set
            [items]="items()"
            [label]="labelFn"
            [chipDisabled]="disabledFn"
            [emptyFocusTarget]="statusRef()"
            (removed)="onRemoved($event)"
          />
          <p #status tabindex="-1">status</p>
        `,
      })
      class DisabledSiblingHost {
        items = signal<readonly Item[]>([
          { id: 1, name: 'open' },
          { id: 2, name: 'off', off: true },
        ]);
        labelFn = (t: Item): string => t.name;
        disabledFn = (t: Item): boolean => !!t.off;
        readonly statusRef = viewChild<ElementRef<HTMLElement>>('status');
        onRemoved(e: CaeChipRemoveEvent<Item>): void {
          this.items.update((l) => l.filter((x) => x !== e.item));
        }
      }
      await TestBed.configureTestingModule({ imports: [DisabledSiblingHost] }).compileComponents();
      const f = TestBed.createComponent(DisabledSiblingHost);
      el = f.nativeElement as HTMLElement;
      document.body.appendChild(el);
      f.detectChanges();
      await f.whenStable();
      const openRemove = removeBtn(rows(f)[0])!; // 'open' is removable; the disabled 'off' has no ×
      openRemove.focus();
      expect(grid(f).contains(document.activeElement)).toBe(true); // focus in the set at removal
      openRemove.click(); // remove the only enabled chip — only the disabled 'off' remains
      await settle(f);
      expect(rows(f).length).toBe(1); // the disabled chip is still present (set not empty)
      expect(document.activeElement).toBe(f.componentInstance.statusRef()!.nativeElement); // not stranded on <body>
    });
  });

  describe('[textEntry] tag field (#201)', () => {
    @Component({
      imports: [CaeChipSet],
      template: `
        <cae-chip-set
          [items]="items()"
          [textEntry]="textEntry"
          [textEntryLabel]="textEntryLabel"
          [addOnBlur]="addOnBlur"
          [emptyFocusTarget]="statusRef()"
          (removed)="onRemoved($event)"
          (added)="onAdded($event)"
        />
        <p #status tabindex="-1">status</p>
      `,
    })
    class TextEntryHost {
      items = signal<readonly string[]>(['solo']);
      textEntry = true;
      textEntryLabel = 'Add a tag';
      addOnBlur = false;
      added: string[] = [];
      readonly statusRef = viewChild<ElementRef<HTMLElement>>('status');
      onAdded(v: string): void {
        this.added.push(v);
        this.items.update((l) => [...l, v]);
      }
      onRemoved(e: CaeChipRemoveEvent<string>): void {
        this.items.update((l) => l.filter((t) => t !== e.item));
      }
    }

    async function makeEntry(
      setup: (h: TextEntryHost) => void = () => {},
    ): Promise<ComponentFixture<TextEntryHost>> {
      await TestBed.configureTestingModule({ imports: [TextEntryHost] }).compileComponents();
      const f = TestBed.createComponent(TextEntryHost);
      setup(f.componentInstance);
      el = f.nativeElement as HTMLElement;
      document.body.appendChild(el);
      f.detectChanges();
      await f.whenStable();
      return f;
    }

    const field = (f: ComponentFixture<unknown>): HTMLInputElement | null =>
      (f.nativeElement as HTMLElement).querySelector('.cae-chip-set__input');

    /** Type `value` and press a separator key (ENTER 13 / COMMA 188 — Material reads `keyCode`). */
    function commit(f: ComponentFixture<unknown>, value: string, keyCode = 13): void {
      const inp = field(f)!;
      inp.value = value;
      const ev = new KeyboardEvent('keydown', { bubbles: true });
      Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
      inp.dispatchEvent(ev);
    }

    it('renders no input unless [textEntry] is set (opt-in)', async () => {
      // The default set stays a pure display/removal list — the field is additive, never implicit.
      const f = await makeEntry((h) => (h.textEntry = false));
      expect(field(f)).toBeNull();
    });

    it('commits trimmed text on Enter as an (added) request and clears the field', async () => {
      const f = await makeEntry();
      commit(f, '  delta  ');
      await settle(f);
      expect(f.componentInstance.added).toEqual(['delta']); // trimmed, not '  delta  '
      expect(field(f)!.value).toBe(''); // field cleared for the next tag
      expect(rows(f).length).toBe(2); // the host appended it -> a second chip rendered
    });

    it('commits on comma too (the p-chips separator)', async () => {
      const f = await makeEntry();
      commit(f, 'epsilon', 188); // COMMA
      await settle(f);
      expect(f.componentInstance.added).toEqual(['epsilon']);
    });

    it('swallows a blank/whitespace-only entry but still clears the field', async () => {
      // An empty chip would render with no accessible name; the clear stops stray spaces lingering.
      const f = await makeEntry();
      commit(f, '   ');
      await settle(f);
      expect(f.componentInstance.added).toEqual([]);
      expect(field(f)!.value).toBe('');
      expect(rows(f).length).toBe(1); // unchanged
    });

    it('leaves focus in the input when the last chip is removed (no strand, no redirect) (#201)', async () => {
      // The empty-set landing spot with [textEntry] on. Verified against Material 22: MatChipGrid lands focus
      // on its registered input when the last chip goes — which is what makes skipping [emptyFocusTarget] safe
      // rather than a regression; the no-strand guarantee this component exists for still holds, via the input.
      // NOTE this test does NOT prove the guard: on a SYNC removal Material's own focus move lands after the
      // redirect and overwrites it either way. The async test below is the one with teeth.
      const f = await makeEntry();
      const soloRemove = removeBtn(rows(f)[0])!;
      soloRemove.focus();
      expect(grid(f).contains(document.activeElement)).toBe(true); // focus held in the set at removal
      soloRemove.click(); // remove the last chip -> the set empties
      await settle(f);
      expect(rows(f).length).toBe(0);
      expect(document.activeElement).toBe(field(f));
      expect(document.activeElement).not.toBe(f.componentInstance.statusRef()!.nativeElement);
    });

    it('does NOT steal focus out of the input when an ASYNC drop empties the set (WCAG 3.2.5) (#201)', async () => {
      // The teeth for the [textEntry] early-return in focusEmptyTargetIfOurs. The input lives INSIDE the host,
      // so the ownsFocus gate reads "still ours" and would wave the redirect straight through. Async is what
      // makes the steal observable: the drop lands in a later task, by which time the user has moved to the
      // input to type the next tag and Material has settled (the destroyed chip wasn't focused, so Material has
      // no reason to move focus again and cannot mask a steal, unlike the synchronous case above).
      @Component({
        imports: [CaeChipSet],
        template: `
          <cae-chip-set
            [items]="items()"
            textEntry
            textEntryLabel="Add a tag"
            [emptyFocusTarget]="statusRef()"
            (removed)="onRemoved($event)"
          />
          <p #status tabindex="-1">status</p>
        `,
      })
      class AsyncEntryHost {
        items = signal<readonly string[]>(['solo']);
        readonly statusRef = viewChild<ElementRef<HTMLElement>>('status');
        pendingDrop: (() => void) | null = null;
        onRemoved(e: CaeChipRemoveEvent<string>): void {
          // Captured, not applied — the deterministic stand-in for a confirm dialog / http.delete().
          this.pendingDrop = () => this.items.update((l) => l.filter((t) => t !== e.item));
        }
      }
      await TestBed.configureTestingModule({ imports: [AsyncEntryHost] }).compileComponents();
      const f = TestBed.createComponent(AsyncEntryHost);
      el = f.nativeElement as HTMLElement;
      document.body.appendChild(el);
      f.detectChanges();
      await f.whenStable();

      const soloRemove = removeBtn(rows(f)[0])!;
      soloRemove.focus();
      soloRemove.click(); // request only — the chip is still rendered, the drop is pending
      await settle(f);
      expect(rows(f).length).toBe(1);

      const inp = field(f)!;
      inp.focus(); // the user moves to the field to type the next tag while the delete is in flight
      expect(document.activeElement).toBe(inp);

      f.componentInstance.pendingDrop!(); // the async drop finally lands -> the set empties
      await settle(f);
      expect(rows(f).length).toBe(0);
      // Focus must still be in the field the user is typing in — NOT yanked to the bound target.
      expect(document.activeElement).toBe(inp);
      expect(document.activeElement).not.toBe(f.componentInstance.statusRef()!.nativeElement);
    });

    it('lands focus in the input when only DISABLED chips remain (no strand) (#201)', async () => {
      // The other no-focusable-chip shape: chips remain but none is focusable, so Material's key manager has
      // no in-set target. Without [textEntry] this is the case [emptyFocusTarget] exists for. With it, the
      // guard skips that redirect — so this test proves the skip does not strand: verified against Material
      // 22, MatChipGrid focuses its registered input when no ELIGIBLE chip remains, not merely when empty.
      interface Item {
        id: number;
        name: string;
        off?: boolean;
      }
      @Component({
        imports: [CaeChipSet],
        template: `
          <cae-chip-set
            [items]="items()"
            [label]="labelFn"
            [chipDisabled]="disabledFn"
            textEntry
            textEntryLabel="Add a tag"
            [emptyFocusTarget]="statusRef()"
            (removed)="onRemoved($event)"
          />
          <p #status tabindex="-1">status</p>
        `,
      })
      class DisabledRemainderEntryHost {
        items = signal<readonly Item[]>([
          { id: 1, name: 'open' },
          { id: 2, name: 'off', off: true },
        ]);
        labelFn = (t: Item): string => t.name;
        disabledFn = (t: Item): boolean => !!t.off;
        readonly statusRef = viewChild<ElementRef<HTMLElement>>('status');
        onRemoved(e: CaeChipRemoveEvent<Item>): void {
          this.items.update((l) => l.filter((x) => x !== e.item));
        }
      }
      await TestBed.configureTestingModule({
        imports: [DisabledRemainderEntryHost],
      }).compileComponents();
      const f = TestBed.createComponent(DisabledRemainderEntryHost);
      el = f.nativeElement as HTMLElement;
      document.body.appendChild(el);
      f.detectChanges();
      await f.whenStable();
      const openRemove = removeBtn(rows(f)[0])!;
      openRemove.focus();
      openRemove.click(); // remove the only ENABLED chip — a disabled chip remains, so the set is NOT empty
      await settle(f);
      expect(rows(f).length).toBe(1);
      expect(document.activeElement).toBe(field(f)); // the input, not <body> and not the bound target
      expect(document.activeElement).not.toBe(document.body);
    });

    it('redirects to [emptyFocusTarget] when TWO OR MORE disabled chips remain (#201)', async () => {
      // The arity that Material does NOT rescue. Traced in MatChipSet._redirectDestroyedChipFocus
      // (Material 22): it calls grid.focus() — which forwards to the registered input — when NO chips
      // remain, and when exactly ONE remains and is disabled. With two or more disabled chips left it calls
      // _keyManager.setPreviousItemActive() instead, whose skip-predicate loop walks off the end and focuses
      // nothing. So the [textEntry] skip must NOT apply here, or the keyboard user lands on <body> — the
      // exact strand this component exists to prevent (WCAG 2.4.3).
      interface Item {
        id: number;
        name: string;
        off?: boolean;
      }
      @Component({
        imports: [CaeChipSet],
        template: `
          <cae-chip-set
            [items]="items()"
            [label]="labelFn"
            [chipDisabled]="disabledFn"
            textEntry
            textEntryLabel="Add a tag"
            [emptyFocusTarget]="statusRef()"
            (removed)="onRemoved($event)"
          />
          <p #status tabindex="-1">status</p>
        `,
      })
      class TwoDisabledHost {
        items = signal<readonly Item[]>([
          { id: 1, name: 'open' },
          { id: 2, name: 'off1', off: true },
          { id: 3, name: 'off2', off: true },
        ]);
        labelFn = (t: Item): string => t.name;
        disabledFn = (t: Item): boolean => !!t.off;
        readonly statusRef = viewChild<ElementRef<HTMLElement>>('status');
        onRemoved(e: CaeChipRemoveEvent<Item>): void {
          this.items.update((l) => l.filter((x) => x !== e.item));
        }
      }
      await TestBed.configureTestingModule({ imports: [TwoDisabledHost] }).compileComponents();
      const f = TestBed.createComponent(TwoDisabledHost);
      el = f.nativeElement as HTMLElement;
      document.body.appendChild(el);
      f.detectChanges();
      await f.whenStable();
      const openRemove = removeBtn(rows(f)[0])!;
      openRemove.focus();
      openRemove.click(); // remove the only enabled chip — TWO disabled chips remain
      await settle(f);
      expect(rows(f).length).toBe(2);
      expect(document.activeElement).not.toBe(document.body); // must not strand
      expect(document.activeElement).toBe(f.componentInstance.statusRef()!.nativeElement);
    });

    it('names the input from [textEntryLabel] (the set ariaLabel names the grid, not the field)', async () => {
      const f = await makeEntry();
      expect(field(f)!.getAttribute('aria-label')).toBe('Add a tag');
    });

    it('does NOT commit pending text on blur by default', async () => {
      // The default must not mint a chip the user never asked for; the text simply stays in the field.
      const f = await makeEntry();
      field(f)!.value = 'ghost';
      field(f)!.dispatchEvent(new Event('blur'));
      await settle(f);
      expect(f.componentInstance.added).toEqual([]);
    });

    it('commits pending text on blur when [addOnBlur] is set', async () => {
      const f = await makeEntry((h) => (h.addOnBlur = true));
      field(f)!.value = 'zeta';
      field(f)!.dispatchEvent(new Event('blur'));
      await settle(f);
      expect(f.componentInstance.added).toEqual(['zeta']);
      expect(field(f)!.value).toBe('');
    });

    it('commits only ONCE when an (added) handler blurs the field (re-entrancy guard)', async () => {
      // onTokenEnd clears BEFORE emitting. Otherwise a consumer whose handler moves focus re-enters through
      // Material's unconditional blur emit while the field still holds the text — two chips from one Enter,
      // which for string items is a thrown duplicate.
      const f = await makeEntry((h) => {
        h.addOnBlur = true;
        const original = h.onAdded.bind(h);
        h.onAdded = (v: string): void => {
          original(v);
          field(f)!.dispatchEvent(new Event('blur')); // handler moves focus away
        };
      });
      commit(f, 'once');
      await settle(f);
      expect(f.componentInstance.added).toEqual(['once']); // exactly one, not ['once','once']
    });

    it('warns in dev when [textEntry] has no accessible name', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await makeEntry((h) => {
        h.textEntryLabel = '';
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[textEntry] is on but the input has'),
      );
      warn.mockRestore();
    });

    it('does NOT warn when [textEntry] is named (the negative arm)', async () => {
      // Without this, a warn made unconditional by a bad edit would still pass the positive test above.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await makeEntry();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('warns in dev when an added value duplicates an existing chip (the NG0955 trap)', async () => {
      // validateConfig only runs at init, so it cannot catch a duplicate a tag field creates at runtime.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Record without appending — appending really would raise NG0955, which is the point of the warning.
      const f = await makeEntry((h) => {
        h.onAdded = (v: string): void => {
          h.added.push(v);
        };
      });
      commit(f, 'solo'); // 'solo' is already in [items]
      await settle(f);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('duplicates an existing chip'));
      warn.mockRestore();
    });

    describe('a disabled FIRST chip (#550)', () => {
      interface Item {
        id: number;
        name: string;
        off?: boolean;
      }
      @Component({
        imports: [CaeChipSet],
        template: `
          <cae-chip-set
            [items]="items()"
            [label]="labelFn"
            [chipDisabled]="disabledFn"
            [textEntry]="textEntry"
            [ariaLabel]="ariaLabel()"
            textEntryLabel="Add a tag"
          />
        `,
      })
      class DisabledFirstHost {
        ariaLabel = signal('Tags');
        items = signal<readonly Item[]>([
          { id: 1, name: 'locked', off: true },
          { id: 2, name: 'open' },
        ]);
        labelFn = (t: Item): string => t.name;
        // A predicate over plain mutable data — exactly what [chipDisabled]'s contract permits, and the shape
        // that a memoized gridTabIndex would fail to track (the fn reference never changes when `locked` does).
        locked = new Set<number>();
        disabledFn = (t: Item): boolean => !!t.off || this.locked.has(t.id);
        textEntry = true;
      }

      async function makeDisabledFirst(
        setup: (h: DisabledFirstHost) => void = () => {},
      ): Promise<ComponentFixture<DisabledFirstHost>> {
        await TestBed.configureTestingModule({ imports: [DisabledFirstHost] }).compileComponents();
        const f = TestBed.createComponent(DisabledFirstHost);
        setup(f.componentInstance);
        el = f.nativeElement as HTMLElement;
        document.body.appendChild(el);
        f.detectChanges();
        await f.whenStable();
        return f;
      }

      it('drops the grid out of the tab order so Shift+Tab cannot bounce (WCAG 2.1.2)', async () => {
        // Material 22's MatChipGrid.focus() forwards to the registered input whenever `_chips.first.disabled`
        // — it treats "first chip disabled" as "nothing to focus" rather than looking past it. The grid host is
        // nonetheless a tab stop whenever it has ANY chips (the host binding is
        // `(disabled || (_chips && _chips.length === 0)) ? -1 : tabIndex`, and Caelum never sets the grid's
        // `disabled`), and it carries a `(focus)` listener calling that same focus().
        //
        // So with [textEntry] + a disabled first chip the grid becomes a one-way valve: Shift+Tab out of the
        // input moves to the grid host, whose focus handler forwards straight back to the input. The user
        // cannot navigate BACKWARD past the component at all — a keyboard trap (WCAG 2.1.2, Level A).
        // Material's own escape hatch (MatChipSet._allowFocusEscape, which zeroes the tabindex on TAB) cannot
        // fire: it hangs off the GRID's keydown host listener, and the input is a DOM SIBLING of the grid, so
        // keystrokes in the input never reach it.
        const f = await makeDisabledFirst();
        expect(grid(f).getAttribute('tabindex')).toBe('-1');
      });

      it('keeps the grid a tab stop when the first chip is ENABLED (the negative arm)', async () => {
        // The narrow gate: with a focusable first chip Material's focus() takes its normal branch and lands on
        // a chip, so the grid must stay reachable. Without this arm a blanket tabindex=-1 would still pass the
        // test above while silently making the chips unreachable in every other configuration.
        const f = await makeDisabledFirst((h) => {
          h.items = signal<readonly Item[]>([
            { id: 1, name: 'open' },
            { id: 2, name: 'locked', off: true },
          ]);
        });
        expect(grid(f).getAttribute('tabindex')).toBe('0');
      });

      it('keeps the grid a tab stop without [textEntry] (the no-input arm)', async () => {
        // With no registered input Material's forwarding branch returns early and is inert, so the grid is
        // still the only way in and must keep its tab stop even behind a disabled first chip.
        const f = await makeDisabledFirst((h) => (h.textEntry = false));
        expect(grid(f).getAttribute('tabindex')).toBe('0');
      });

      it('TRACKS a runtime change of the first chip rather than latching its initial value', async () => {
        // The three arms above are all static, set up before the first render. This one is why gridTabIndex is
        // a plain method and not a computed(): [chipDisabled] is documented as a plain predicate, so it may
        // close over ordinary mutable data that no signal tracks.
        //
        // Mutating that data alone changes nothing — the set is OnPush, so nothing re-renders. The divergence
        // needs the component dirtied by something INDEPENDENT of items()/chipDisabled(), which is what the
        // [ariaLabel] change below stands in for (any other input, or a parent's OnPush push, does the same).
        // At that point the chip's `[disabled]="isDisabled(item)"` method binding re-evaluates and the chip
        // renders disabled — while a memoized gridTabIndex, whose only deps are items() and chipDisabled(),
        // would hold its stale 0 and silently restore the #550 trap.
        const f = await makeDisabledFirst((h) => {
          h.items = signal<readonly Item[]>([
            { id: 1, name: 'open' },
            { id: 2, name: 'other' },
          ]);
        });
        expect(grid(f).getAttribute('tabindex')).toBe('0');
        // Lock the first chip by mutating the data the predicate closes over. Neither [items] nor the
        // [chipDisabled] function REFERENCE changes — so a computed() would see no dependency change and hold
        // its stale 0, while the chip beside it re-renders disabled.
        f.componentInstance.locked.add(1);
        f.componentInstance.ariaLabel.set('Tags (updated)'); // an unrelated input change dirties the set
        await settle(f);
        expect(rows(f)[0].classList.contains('mat-mdc-chip-disabled')).toBe(true); // the chip followed it
        expect(grid(f).getAttribute('tabindex')).toBe('-1'); // ...and so must the grid's tab stop
      });
    });

    it('does NOT let an async drop pull focus INTO the field after the user has left (#551)', async () => {
      // The mirror image of the steal the [textEntry] guard prevents, and the one case this component cannot
      // simply decline to act on: the steal is MATERIAL's, not ours. When the set empties, MatChipGrid.focus()
      // queues `Promise.resolve().then(() => _chipInput.focus())` — unconditionally, with no check that focus
      // is still inside the widget. It is reached even though the destroyed chip was NOT focused, because
      // MatChipSet._trackDestroyedFocusedChip also fires on `_hadFocusOnRemove` (captured back at remove()
      // time) while its key manager still points at the removed chip's action.
      //
      // So: request a removal from the chip, walk away to an unrelated field, and let the drop land late. The
      // user's keystrokes would be yanked into the tag field mid-sentence (WCAG 3.2.5).
      @Component({
        imports: [CaeChipSet],
        template: `
          <cae-chip-set
            [items]="items()"
            textEntry
            textEntryLabel="Add a tag"
            (removed)="onRemoved($event)"
          />
          <input #elsewhere class="elsewhere" />
        `,
      })
      class WalkAwayHost {
        items = signal<readonly string[]>(['solo']);
        readonly elsewhereRef = viewChild<ElementRef<HTMLInputElement>>('elsewhere');
        pendingDrop: (() => void) | null = null;
        onRemoved(e: CaeChipRemoveEvent<string>): void {
          // Captured, not applied — the deterministic stand-in for http.delete().subscribe(drop).
          this.pendingDrop = () => this.items.update((l) => l.filter((t) => t !== e.item));
        }
      }
      await TestBed.configureTestingModule({ imports: [WalkAwayHost] }).compileComponents();
      const f = TestBed.createComponent(WalkAwayHost);
      el = f.nativeElement as HTMLElement;
      document.body.appendChild(el);
      f.detectChanges();
      await f.whenStable();

      const soloRemove = removeBtn(rows(f)[0])!;
      soloRemove.focus();
      soloRemove.click(); // request only — the chip is still rendered, the drop is in flight
      await settle(f);
      expect(rows(f).length).toBe(1);

      const elsewhere = f.componentInstance.elsewhereRef()!.nativeElement;
      elsewhere.focus(); // the user gives up waiting and moves to an unrelated field OUTSIDE the set
      elsewhere.value = 'typing something else';
      expect(document.activeElement).toBe(elsewhere);

      // settle()'s await drains the whole microtask queue, so Material's queued input.focus() AND the restore
      // queued behind it have both run by the time it returns. The ordering is what the assertion proves: had
      // the restore run FIRST, host.contains(elsewhere) would be false, it would bail, and Material would land
      // on the field — so a passing assertion is evidence the restore is genuinely behind Material's grab.
      f.componentInstance.pendingDrop!(); // the drop finally lands -> the set empties
      await settle(f);
      expect(rows(f).length).toBe(0);
      // Focus must still be where the user put it — NOT dragged into the now-empty set's tag field.
      expect(document.activeElement).toBe(elsewhere);
      expect(document.activeElement).not.toBe(field(f));
    });

    it('undoes the grab for an async CASCADE emptying, which arms no redirect marker (#551)', async () => {
      // The shape that gating the undo on pendingEmptyRemoval would miss. Removing 'a' from ['a','b'] is NOT
      // last-enabled, so onRemoved takes the afterNextRender one-shot; that fires while the async drop is still
      // in flight, sees 'a' present, and correctly leaves NO marker. The handler then drops 'a' AND 'b'
      // together in a later task (a parent->children cascade, the #448 shape). Material still grabs — it keyed
      // off _hadFocusOnRemove back at remove() time — so the undo must not be reachable only via the marker.
      @Component({
        imports: [CaeChipSet],
        template: `
          <cae-chip-set
            [items]="items()"
            textEntry
            textEntryLabel="Add a tag"
            (removed)="onRemoved()"
          />
          <input #elsewhere class="elsewhere" />
        `,
      })
      class CascadeHost {
        items = signal<readonly string[]>(['a', 'b']);
        readonly elsewhereRef = viewChild<ElementRef<HTMLInputElement>>('elsewhere');
        pendingDrop: (() => void) | null = null;
        onRemoved(): void {
          this.pendingDrop = () => this.items.set([]); // drops the removed item AND its sibling
        }
      }
      await TestBed.configureTestingModule({ imports: [CascadeHost] }).compileComponents();
      const f = TestBed.createComponent(CascadeHost);
      el = f.nativeElement as HTMLElement;
      document.body.appendChild(el);
      f.detectChanges();
      await f.whenStable();

      const aRemove = removeBtn(rows(f)[0])!;
      aRemove.focus();
      aRemove.click();
      await settle(f);
      expect(rows(f).length).toBe(2); // nothing dropped yet — the one-shot has already fired and armed nothing

      const elsewhere = f.componentInstance.elsewhereRef()!.nativeElement;
      elsewhere.focus();

      f.componentInstance.pendingDrop!(); // the cascade lands: both chips go at once
      await settle(f);
      expect(rows(f).length).toBe(0);
      expect(document.activeElement).toBe(elsewhere);
    });

    it('leaves focus alone when Material does NOT grab (the no-grab arm)', async () => {
      // With TWO disabled chips remaining Material takes setPreviousItemActive(), which focuses nothing — so
      // there is no grab to undo. This arity does NOT take the [textEntry] early-return (that would be the
      // strand #201 fixed), so it falls through to the emptyFocusTarget redirect and is stopped only by the
      // ownsFocus gate. [emptyFocusTarget] is therefore bound deliberately: without it the redirect would be a
      // silent no-op and this test could not tell a working gate from a missing one. Focus must stay put —
      // neither dragged into the field by a spurious restore, nor pushed to the status region by the redirect.
      interface Item {
        id: number;
        name: string;
        off?: boolean;
      }
      @Component({
        imports: [CaeChipSet],
        template: `
          <cae-chip-set
            [items]="items()"
            [label]="labelFn"
            [chipDisabled]="disabledFn"
            textEntry
            textEntryLabel="Add a tag"
            [emptyFocusTarget]="statusRef()"
            (removed)="onRemoved($event)"
          />
          <input #elsewhere class="elsewhere" />
          <p #status tabindex="-1">status</p>
        `,
      })
      class NoGrabHost {
        readonly statusRef = viewChild<ElementRef<HTMLElement>>('status');
        items = signal<readonly Item[]>([
          { id: 1, name: 'open' },
          { id: 2, name: 'off1', off: true },
          { id: 3, name: 'off2', off: true },
        ]);
        labelFn = (t: Item): string => t.name;
        disabledFn = (t: Item): boolean => !!t.off;
        readonly elsewhereRef = viewChild<ElementRef<HTMLInputElement>>('elsewhere');
        pendingDrop: (() => void) | null = null;
        onRemoved(e: CaeChipRemoveEvent<Item>): void {
          this.pendingDrop = () => this.items.update((l) => l.filter((x) => x !== e.item));
        }
      }
      await TestBed.configureTestingModule({ imports: [NoGrabHost] }).compileComponents();
      const f = TestBed.createComponent(NoGrabHost);
      el = f.nativeElement as HTMLElement;
      document.body.appendChild(el);
      f.detectChanges();
      await f.whenStable();

      const openRemove = removeBtn(rows(f)[0])!;
      openRemove.focus();
      openRemove.click();
      await settle(f);

      const elsewhere = f.componentInstance.elsewhereRef()!.nativeElement;
      elsewhere.focus();

      f.componentInstance.pendingDrop!(); // only the enabled chip goes; two disabled chips remain
      await settle(f);
      expect(rows(f).length).toBe(2);
      expect(document.activeElement).toBe(elsewhere); // untouched — nothing grabbed, nothing restored
      expect(document.activeElement).not.toBe(f.componentInstance.statusRef()!.nativeElement);
    });
  });
});
