import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { OverlayContainer } from '@angular/cdk/overlay';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { vi } from 'vitest';

import { CaeTreeSelect, type CaeTreeSelectionMode } from './tree-select';
// The node model is reused from cae-tree (type-only in the component). A spec may reach the source
// directly — it is not packaged — so this needs no built dist.
import type { CaeTreeNode } from '../tree/tree';

const NODES: readonly CaeTreeNode[] = [
  {
    value: 'ws',
    label: 'Workspace',
    children: [
      {
        value: 'proj',
        label: 'Projects',
        children: [
          { value: 'app', label: 'App' },
          { value: 'api', label: 'API' },
        ],
      },
      { value: 'settings', label: 'Settings' },
    ],
  },
  // A navigational node: no `value` → not selectable, only expand/collapse.
  { label: 'Read-only group', children: [{ value: 'ro-child', label: 'Child' }] },
];

@Component({
  imports: [CaeTreeSelect, ReactiveFormsModule],
  template: `
    <cae-tree-select
      [formControl]="control"
      [nodes]="nodes()"
      [selectionMode]="mode()"
      [ariaLabel]="ariaLabel()"
      [required]="required()"
      [showClear]="showClear()"
      [filterable]="filterable()"
      [emptyMessage]="emptyMessage()"
      [filterWith]="filterWith()"
    />
  `,
})
class Host {
  // A real form control drives the CVA round-trip (value in / value out). Loosely typed because the
  // seam shape depends on selectionMode (string in single, string[] in multiple).
  readonly control = new FormControl<string | string[] | null>('');
  readonly nodes = signal<readonly CaeTreeNode[]>(NODES);
  readonly mode = signal<CaeTreeSelectionMode>('single');
  readonly ariaLabel = signal('Pick a node');
  readonly required = signal(false);
  readonly showClear = signal(false);
  readonly filterable = signal(false);
  readonly emptyMessage = signal('No matches');
  // Defaults to the component's own predicate (case-insensitive label substring); a test overrides it.
  readonly filterWith = signal<(node: CaeTreeNode, query: string) => boolean>((node, query) =>
    node.label.toLowerCase().includes(query),
  );
}

describe('CaeTreeSelect', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let overlayContainer: OverlayContainer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    // Attach to the document so the trigger is focusable (jsdom focus needs an attached element);
    // the overlay panel lives in the CDK container (already in <body>) regardless.
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    overlayContainer?.ngOnDestroy();
    fixture.nativeElement.remove();
  });

  // Set inputs (mode especially — its value shape depends on it) BEFORE the first render, then flush.
  async function init(
    overrides: Partial<
      Record<
        | 'mode'
        | 'ariaLabel'
        | 'required'
        | 'showClear'
        | 'filterable'
        | 'emptyMessage'
        | 'filterWith',
        unknown
      >
    > = {},
  ) {
    for (const [k, v] of Object.entries(overrides))
      (host as never as Record<string, { set(v: unknown): void }>)[k].set(v);
    await flush();
  }
  async function flush(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const trigger = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('.cae-tree-select__trigger');
  const container = (): HTMLElement => overlayContainer.getContainerElement();
  const panel = (): HTMLElement | null => container().querySelector('.cae-tree-select__panel');
  const labelEls = (): HTMLElement[] =>
    Array.from(container().querySelectorAll('.cae-tree-select__label'));
  const labelFor = (text: string): HTMLElement =>
    labelEls().find((l) => l.textContent?.trim() === text)!;
  const treeItems = (): HTMLElement[] =>
    Array.from(container().querySelectorAll('[role="treeitem"]'));
  const treeItemFor = (text: string): HTMLElement =>
    labelFor(text).closest('[role="treeitem"]') as HTMLElement;

  async function open(): Promise<void> {
    trigger().click();
    await flush();
  }

  it('renders a role=combobox trigger with the placeholder when empty', async () => {
    await init();
    const t = trigger();
    expect(t.getAttribute('role')).toBe('combobox');
    expect(t.getAttribute('aria-haspopup')).toBe('tree');
    expect(t.getAttribute('aria-expanded')).toBe('false');
    expect(t.textContent?.trim()).toContain('Select…');
  });

  it('reflects the accessible name and required state on the trigger', async () => {
    await init({ required: true });
    expect(trigger().getAttribute('aria-label')).toBe('Pick a node');
    expect(trigger().getAttribute('aria-required')).toBe('true');
  });

  it('opens the panel on click and points aria-controls at it', async () => {
    await init();
    await open();
    expect(panel()).not.toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    // aria-controls must reference the role=tree popup (aria-haspopup="tree"), not the wrapper div.
    const tree = container().querySelector('[role="tree"]')!;
    expect(tree.id).toBeTruthy();
    expect(trigger().getAttribute('aria-controls')).toBe(tree.id);
  });

  it('opens on ArrowDown/ArrowUp from the trigger', async () => {
    await init();
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await flush();
    expect(panel()).not.toBeNull();
  });

  it('stamps every node as a treeitem in the panel tree', async () => {
    await init();
    await open();
    // childrenAccessor stamps the whole hierarchy up front (collapsed subtrees hidden, not absent).
    const text = labelEls().map((l) => l.textContent?.trim());
    expect(text).toEqual([
      'Workspace',
      'Projects',
      'App',
      'API',
      'Settings',
      'Read-only group',
      'Child',
    ]);
    expect(treeItems().length).toBeGreaterThan(0);
  });

  it('single-select: emits the node key, shows its label, and closes on pick', async () => {
    await init();
    await open();
    labelFor('Settings').click();
    await flush();
    expect(host.control.value).toBe('settings'); // the KEY, not the label
    expect(trigger().textContent?.trim()).toContain('Settings');
    expect(panel()).toBeNull(); // single-select dismisses
  });

  it('selects via the keyboard — Enter on a focused treeitem (the (activation) path)', async () => {
    await init();
    await open();
    const first = treeItems()[0]; // Workspace (value 'ws')
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(host.control.value).toBe('ws'); // keyboard select reaches the value
    expect(panel()).toBeNull(); // single-select dismisses
  });

  it('toggles via the keyboard — Space in multiple mode, without double-firing', async () => {
    await init({ mode: 'multiple' });
    await open();
    const first = treeItems()[0];
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await flush();
    expect(host.control.value).toEqual(['ws']);
    // A second Space toggles it back off — proving a single activation (no click+activation double-fire).
    first.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await flush();
    expect(host.control.value).toEqual([]);
  });

  it('multiple-select: emits a key array, keeps the panel open, and marks aria-selected', async () => {
    await init({ mode: 'multiple' });
    await open();
    labelFor('App').click();
    labelFor('API').click();
    await flush();
    expect(host.control.value).toEqual(['app', 'api']);
    expect(panel()).not.toBeNull(); // multiple stays open
    const selected = container().querySelectorAll('[aria-selected="true"]');
    expect(selected.length).toBe(2);
    // Toggling one off removes it from the value.
    labelFor('App').click();
    await flush();
    expect(host.control.value).toEqual(['api']);
  });

  it('marks the tree aria-multiselectable only in multiple mode', async () => {
    await init({ mode: 'multiple' });
    await open();
    expect(container().querySelector('[role="tree"]')?.getAttribute('aria-multiselectable')).toBe(
      'true',
    );
  });

  it('does not select a navigational node (one without a value)', async () => {
    await init();
    await open();
    labelFor('Read-only group').click();
    await flush();
    expect(host.control.value).toBe(''); // unchanged — no value key to select
  });

  it('does not leak expansion state into the value', async () => {
    await init();
    await open();
    const toggle = container().querySelector<HTMLElement>('.cae-tree-select__toggle')!;
    toggle.click(); // expand Workspace
    await flush();
    expect(host.control.value).toBe(''); // expanding selects nothing
    expect(panel()).not.toBeNull(); // and does not close the panel
  });

  it('writeValue reflects a written key as the trigger label without re-emitting onChange', async () => {
    await init();
    let emissions = 0;
    host.control.valueChanges.subscribe(() => emissions++);
    host.control.setValue('app'); // programmatic write
    await flush();
    expect(trigger().textContent?.trim()).toContain('App');
    // setValue itself emits once; if writeValue looped back through onChange it would be 2.
    expect(emissions).toBe(1);
  });

  it('writeValue ignores an unknown key (nothing selected)', async () => {
    await init();
    host.control.setValue('does-not-exist');
    await flush();
    expect(trigger().textContent?.trim()).toContain('Select…');
  });

  it('summarizes the trigger past two selections in multiple mode', async () => {
    await init({ mode: 'multiple' });
    host.control.setValue(['app', 'api', 'settings']);
    await flush();
    expect(trigger().textContent?.trim()).toContain('3 selected');
  });

  it('resolves a mismatched written shape to empty rather than junk', async () => {
    await init(); // single mode
    host.control.setValue(['app', 'api'] as never); // an array written to a single-select
    await flush();
    expect(trigger().textContent?.trim()).toContain('Select…');
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    await init();
    trigger().focus();
    await open();
    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(panel()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on an outside (backdrop) click', async () => {
    await init();
    await open();
    container().querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await flush();
    expect(panel()).toBeNull();
  });

  it('marks the control touched when the panel is dismissed', async () => {
    await init();
    expect(host.control.touched).toBe(false);
    await open();
    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(host.control.touched).toBe(true);
  });

  it('does not open while disabled, and closes if disabled mid-open', async () => {
    await init();
    await open();
    expect(panel()).not.toBeNull();
    host.control.disable(); // setDisabledState(true)
    await flush();
    expect(panel()).toBeNull(); // disabling closes an open panel
    expect(trigger().disabled).toBe(true);
    trigger().click(); // click while disabled is a no-op (native disabled)
    await flush();
    expect(panel()).toBeNull();
  });

  it('warns in dev when the combobox has no accessible name', async () => {
    const warn = console.warn;
    const calls: string[] = [];
    console.warn = (msg: string) => calls.push(msg);
    try {
      const bare = TestBed.createComponent(CaeTreeSelect);
      bare.componentRef.setInput('nodes', NODES);
      bare.detectChanges();
      await bare.whenStable();
      expect(calls.some((c) => c.includes('accessible name'))).toBe(true);
    } finally {
      console.warn = warn;
    }
  });

  it('does not warn when an accessible name is provided', async () => {
    const warn = console.warn;
    const calls: string[] = [];
    console.warn = (msg: string) => calls.push(msg);
    try {
      const named = TestBed.createComponent(CaeTreeSelect);
      named.componentRef.setInput('nodes', NODES);
      named.componentRef.setInput('ariaLabel', 'Named');
      named.detectChanges();
      await named.whenStable();
      expect(calls.some((c) => c.includes('accessible name'))).toBe(false);
    } finally {
      console.warn = warn;
    }
  });

  describe('a11y: focus the selected node on open (F2, #281)', () => {
    // The marker cdkTrapFocus auto-capture redirects its initial focus onto (APG select-only-combobox:
    // start on the current value's node, not the first node). The real .focus() landing depends on the
    // mat-tree key manager and is an M4 real-browser check; here we pin the deterministic wiring.
    const focusTarget = (): HTMLElement | null => container().querySelector('[cdkFocusInitial]');

    it('marks an already-visible selected node as the auto-capture focus target', async () => {
      host.control.setValue('ws'); // a top-level node — visible at rest
      await init();
      await open();
      expect(focusTarget()).toBe(treeItemFor('Workspace'));
    });

    it('reveals (expands to) a collapsed deep selection on open and marks it', async () => {
      host.control.setValue('app'); // ws > proj > app — both ancestors collapsed at rest
      await init();
      await open();
      // The ancestor path was expanded, so the focus target is not stranded inside a display:none subtree.
      const toggleLabel = (t: string): string | null | undefined =>
        treeItemFor(t).querySelector('.cae-tree-select__toggle')?.getAttribute('aria-label');
      expect(toggleLabel('Workspace')).toBe('Collapse Workspace');
      expect(toggleLabel('Projects')).toBe('Collapse Projects');
      expect(focusTarget()).toBe(treeItemFor('App'));
    });

    it('marks nothing when there is no selection (auto-capture keeps its first-node default)', async () => {
      await init();
      await open();
      expect(focusTarget()).toBeNull();
    });

    it('marks and reveals only the FIRST selected node in multiple mode (not a hidden later one)', async () => {
      await init({ mode: 'multiple' });
      host.control.setValue(['settings', 'app']); // settings selected first; App is DOM-order-first but deeper
      await flush();
      await open();
      // Exactly ONE focus target — the first-selected node — even though App precedes it in DOM order and is
      // also selected. Marking every selected node would let auto-capture pick the deeper, still-hidden App.
      expect(container().querySelectorAll('[cdkFocusInitial]').length).toBe(1);
      expect(focusTarget()).toBe(treeItemFor('Settings'));
      // And the reveal expanded that same node's ancestor (so the target isn't display:none).
      expect(
        treeItemFor('Workspace')
          .querySelector('.cae-tree-select__toggle')
          ?.getAttribute('aria-label'),
      ).toBe('Collapse Workspace');
    });
  });

  describe('a11y: announce multi-select toggles (F6, #281)', () => {
    let announce: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      // Stub announce so the test asserts the call without mounting a real live region.
      announce = vi.spyOn(TestBed.inject(LiveAnnouncer), 'announce').mockResolvedValue(undefined);
    });

    it('announces each toggle with the running count in multiple mode', async () => {
      await init({ mode: 'multiple' });
      await open();
      labelFor('App').click();
      await flush();
      expect(announce).toHaveBeenLastCalledWith('App selected, 1 selected');
      labelFor('API').click();
      await flush();
      expect(announce).toHaveBeenLastCalledWith('API selected, 2 selected');
      labelFor('App').click(); // toggle off
      await flush();
      expect(announce).toHaveBeenLastCalledWith('App deselected, 1 selected');
    });

    it('does not announce in single mode (it closes and the value is read on focus return)', async () => {
      await init(); // single
      await open();
      labelFor('Settings').click();
      await flush();
      expect(announce).not.toHaveBeenCalled();
    });
  });

  describe('checkbox mode — tri-state parent↔child propagation (#280)', () => {
    it('checking a parent checks its whole subtree (down-propagation)', async () => {
      await init({ mode: 'checkbox' });
      await open();
      labelFor('Projects').click();
      await flush();
      // proj + both leaves are checked; the value carries the fully-checked parent AND its leaves.
      expect([...(host.control.value as string[])].sort()).toEqual(['api', 'app', 'proj']);
      expect(treeItemFor('Projects').getAttribute('aria-checked')).toBe('true');
      expect(treeItemFor('App').getAttribute('aria-checked')).toBe('true');
      expect(treeItemFor('API').getAttribute('aria-checked')).toBe('true');
      // Workspace has an unchecked sibling (Settings) → indeterminate, not in the value.
      expect(treeItemFor('Workspace').getAttribute('aria-checked')).toBe('mixed');
      expect(treeItemFor('Settings').getAttribute('aria-checked')).toBe('false');
    });

    it('checking every child rolls the parent up to checked (up-propagation)', async () => {
      await init({ mode: 'checkbox' });
      await open();
      labelFor('App').click();
      await flush();
      expect(treeItemFor('Projects').getAttribute('aria-checked')).toBe('mixed'); // one of two
      labelFor('API').click();
      await flush();
      expect(treeItemFor('Projects').getAttribute('aria-checked')).toBe('true'); // both → checked
      expect([...(host.control.value as string[])]).toContain('proj'); // the parent joins the value
    });

    it('a partially-checked parent is indeterminate (aria-checked=mixed + the mixed box)', async () => {
      await init({ mode: 'checkbox' });
      await open();
      labelFor('App').click();
      await flush();
      expect(host.control.value).toEqual(['app']); // only the leaf; the parent is derived, not stored
      expect(treeItemFor('Projects').getAttribute('aria-checked')).toBe('mixed');
      expect(treeItemFor('Workspace').getAttribute('aria-checked')).toBe('mixed');
      expect(container().querySelector('.cae-tree-select__checkbox--mixed')).not.toBeNull();
    });

    it('unchecking a checked parent clears its whole subtree', async () => {
      await init({ mode: 'checkbox' });
      await open();
      labelFor('Projects').click(); // check all
      await flush();
      labelFor('Projects').click(); // uncheck all
      await flush();
      expect(host.control.value).toEqual([]);
      expect(treeItemFor('App').getAttribute('aria-checked')).toBe('false');
      expect(treeItemFor('Projects').getAttribute('aria-checked')).toBe('false');
    });

    it('unchecking one child drops the parent from the value and marks it mixed', async () => {
      await init({ mode: 'checkbox' });
      await open();
      labelFor('Projects').click(); // proj + app + api all checked
      await flush();
      labelFor('App').click(); // uncheck one leaf
      await flush();
      expect([...(host.control.value as string[])].sort()).toEqual(['api']); // proj rolled back off
      expect(treeItemFor('Projects').getAttribute('aria-checked')).toBe('mixed');
      expect(treeItemFor('App').getAttribute('aria-checked')).toBe('false');
      expect(treeItemFor('API').getAttribute('aria-checked')).toBe('true');
    });

    it('clicking an indeterminate parent checks the whole subtree', async () => {
      await init({ mode: 'checkbox' });
      await open();
      labelFor('App').click(); // Projects → mixed
      await flush();
      expect(treeItemFor('Projects').getAttribute('aria-checked')).toBe('mixed');
      labelFor('Projects').click(); // mixed → check all
      await flush();
      expect(treeItemFor('Projects').getAttribute('aria-checked')).toBe('true');
      expect([...(host.control.value as string[])].sort()).toEqual(['api', 'app', 'proj']);
    });

    it('writeValue canonicalizes — writing all of a parent’s children adds the parent', async () => {
      await init({ mode: 'checkbox' });
      host.control.setValue(['app', 'api']); // both leaves, parent key omitted
      await flush();
      // The trigger summarizes the CANONICAL set (proj + app + api = 3), proving the roll-up on write.
      expect(trigger().textContent?.trim()).toContain('3 selected');
      await open();
      expect(treeItemFor('Projects').getAttribute('aria-checked')).toBe('true');
    });

    it('uses aria-checked (not aria-selected) and gives value-less nodes no checkbox', async () => {
      await init({ mode: 'checkbox' });
      await open();
      // a selectable node carries aria-checked, never aria-selected, in checkbox mode
      expect(treeItemFor('App').getAttribute('aria-selected')).toBeNull();
      expect(treeItemFor('App').getAttribute('aria-checked')).toBe('false');
      // the navigational group (no value) gets no aria-checked; exactly one box per selectable node (6)
      expect(treeItemFor('Read-only group').getAttribute('aria-checked')).toBeNull();
      expect(container().querySelectorAll('.cae-tree-select__checkbox').length).toBe(6);
      // its value-bearing child is still checkable
      labelFor('Child').click();
      await flush();
      expect(host.control.value).toEqual(['ro-child']);
    });

    it('does not mark aria-multiselectable (state rides aria-checked, not aria-selected)', async () => {
      await init({ mode: 'checkbox' });
      await open();
      expect(
        container().querySelector('[role="tree"]')?.getAttribute('aria-multiselectable'),
      ).toBeNull();
    });

    it('announces each toggle with the running count and keeps the panel open', async () => {
      const announce = vi
        .spyOn(TestBed.inject(LiveAnnouncer), 'announce')
        .mockResolvedValue(undefined);
      await init({ mode: 'checkbox' });
      await open();
      labelFor('App').click();
      await flush();
      expect(announce).toHaveBeenLastCalledWith('App checked, 1 selected');
      expect(panel()).not.toBeNull(); // stays open like multiple mode
      labelFor('Projects').click(); // App already checked → this checks proj + api too (3 total)
      await flush();
      expect(announce).toHaveBeenLastCalledWith('Projects checked, 3 selected');
      labelFor('Projects').click(); // uncheck the subtree
      await flush();
      expect(announce).toHaveBeenLastCalledWith('Projects unchecked, 0 selected');
    });

    it('clear resets to an empty array', async () => {
      await init({ mode: 'checkbox', showClear: true });
      host.control.setValue(['app', 'api']);
      await flush();
      const clearBtn = fixture.nativeElement.querySelector(
        '.cae-tree-select__clear',
      ) as HTMLButtonElement;
      clearBtn.click();
      await flush();
      expect(host.control.value).toEqual([]);
    });

    it('retains a value written before nodes() load, then rolls it up when they arrive', async () => {
      host.nodes.set([]); // options not loaded yet (async tree)
      await init({ mode: 'checkbox' });
      host.control.setValue(['app', 'api']); // patch the form value before the options arrive
      await flush();
      expect(host.control.value).toEqual(['app', 'api']); // retained, NOT dropped
      host.nodes.set(NODES); // options arrive
      await flush();
      await open();
      // the retained keys now resolve and roll their parent up in the view
      expect(treeItemFor('App').getAttribute('aria-checked')).toBe('true');
      expect(treeItemFor('Projects').getAttribute('aria-checked')).toBe('true');
    });

    it('unchecking a filtered parent still clears its pruned-from-view descendants', async () => {
      await init({ mode: 'checkbox', filterable: true });
      host.control.setValue(['app', 'api']); // Projects fully checked
      await flush();
      await open();
      const filter = container().querySelector('.cae-tree-select__filter') as HTMLInputElement;
      filter.value = 'App'; // matches App only; API is pruned from the view
      filter.dispatchEvent(new Event('input', { bubbles: true }));
      await flush();
      expect(labelEls().some((l) => l.textContent?.trim() === 'API')).toBe(false); // API hidden
      labelFor('Projects').click(); // uncheck the (still-checked) parent
      await flush();
      // the hidden API must be cleared too — not left stranded in the value
      expect(host.control.value).toEqual([]);
    });

    it('a value-less leaf sibling does not block a parent from rolling up', async () => {
      host.nodes.set([
        {
          value: 'p',
          label: 'Parent',
          children: [
            { label: 'Decoration' }, // value-less leaf — no checkbox, no opinion
            { value: 'y', label: 'Y' },
          ],
        },
      ]);
      await init({ mode: 'checkbox' });
      await open();
      labelFor('Y').click(); // the only selectable descendant
      await flush();
      // Parent rolls up to checked (the value-less leaf is excluded from the tally) and joins the value
      expect(treeItemFor('Parent').getAttribute('aria-checked')).toBe('true');
      expect([...(host.control.value as string[])].sort()).toEqual(['p', 'y']);
    });
  });

  describe('[showClear] — reset the selection (#282)', () => {
    const clearBtn = (): HTMLButtonElement | null =>
      fixture.nativeElement.querySelector('.cae-tree-select__clear');

    it('renders no clear button by default, even with a selection', async () => {
      host.control.setValue('settings');
      await init(); // showClear defaults to false
      expect(clearBtn()).toBeNull();
    });

    it('renders no clear button when [showClear] is on but nothing is selected', async () => {
      await init({ showClear: true });
      expect(clearBtn()).toBeNull();
    });

    it('renders a named type=button clear affordance when enabled and something is selected', async () => {
      host.control.setValue('settings');
      await init({ showClear: true });
      const btn = clearBtn();
      expect(btn).not.toBeNull();
      expect(btn!.getAttribute('aria-label')).toBe('Clear selection');
      expect(btn!.type).toBe('button'); // never submits an enclosing form
    });

    it('clears the selection and emits the single-mode empty value ""', async () => {
      host.control.setValue('settings');
      await init({ showClear: true });
      clearBtn()!.click();
      await flush();
      expect(host.control.value).toBe(''); // single empty is '', not []
      expect(trigger().textContent?.trim()).toContain('Select…');
      expect(clearBtn()).toBeNull(); // the button unmounts once the selection is gone
    });

    it('clears to an empty array in multiple mode', async () => {
      await init({ mode: 'multiple', showClear: true });
      host.control.setValue(['app', 'api']);
      await flush();
      expect(clearBtn()).not.toBeNull();
      clearBtn()!.click();
      await flush();
      expect(host.control.value).toEqual([]); // multiple empty is []
    });

    it('does not open the panel when cleared', async () => {
      host.control.setValue('settings');
      await init({ showClear: true });
      clearBtn()!.click();
      await flush();
      expect(panel()).toBeNull();
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });

    it('moves focus to the trigger when the focused clear button unmounts (WCAG 2.4.3)', async () => {
      host.control.setValue('settings');
      await init({ showClear: true });
      const btn = clearBtn()!;
      btn.focus(); // a keyboard user tabbed onto the clear button
      expect(document.activeElement).toBe(btn);
      btn.click(); // clearing removes the button it lives on
      await flush();
      // Without the focus-first move, removing the focused button would drop focus to <body>.
      expect(document.activeElement).toBe(trigger());
    });

    it('does not steal focus to the trigger when the clear button did not hold focus (WCAG 3.2.5)', async () => {
      host.control.setValue('settings');
      await init({ showClear: true });
      // A mouse clear that never focused the × (activeElement stays <body>): clearing must not yank
      // focus to the trigger. This is the teeth for the `activeElement === currentTarget` gate —
      // remove the gate (always focus the trigger) and this fails.
      expect(document.activeElement).not.toBe(trigger());
      clearBtn()!.click();
      await flush();
      expect(document.activeElement).not.toBe(trigger());
    });

    it('marks the control touched on clear', async () => {
      host.control.setValue('settings');
      await init({ showClear: true });
      expect(host.control.touched).toBe(false);
      clearBtn()!.click();
      await flush();
      expect(host.control.touched).toBe(true);
    });

    it('hides the clear button when the control is disabled', async () => {
      host.control.setValue('settings');
      await init({ showClear: true });
      expect(clearBtn()).not.toBeNull();
      host.control.disable();
      await flush();
      expect(clearBtn()).toBeNull(); // a disabled control's value must not be mutable
    });
  });

  describe('duplicate node key dev-warn (#282)', () => {
    it('warns in dev when two nodes share a value key', async () => {
      const warn = console.warn;
      const calls: string[] = [];
      console.warn = (msg: string) => calls.push(msg);
      try {
        host.nodes.set([
          { value: 'dup', label: 'One' },
          { value: 'dup', label: 'Two', children: [{ value: 'ok', label: 'Child' }] },
        ]);
        await init();
        expect(calls.some((c) => c.includes('duplicate node value'))).toBe(true);
      } finally {
        console.warn = warn;
      }
    });

    it('does not warn on a unique key set (navigational nodes without a value are exempt)', async () => {
      const warn = console.warn;
      const calls: string[] = [];
      console.warn = (msg: string) => calls.push(msg);
      try {
        await init(); // the default NODES have unique keys + a value-less navigational node
        expect(calls.some((c) => c.includes('duplicate node value'))).toBe(false);
      } finally {
        console.warn = warn;
      }
    });
  });

  describe('[filterable] — in-panel filter (#282)', () => {
    const filterInput = (): HTMLInputElement | null =>
      container().querySelector('.cae-tree-select__filter');
    const emptyMsg = (): HTMLElement | null =>
      panel()?.querySelector('.cae-tree-select__empty') ?? null;
    const srRegion = (): HTMLElement | null =>
      panel()?.querySelector('.cae-tree-select__sr') ?? null;
    const shownLabels = (): (string | undefined)[] => labelEls().map((l) => l.textContent?.trim());
    const toggleLabel = (t: string): string | null | undefined =>
      treeItemFor(t).querySelector('.cae-tree-select__toggle')?.getAttribute('aria-label');
    async function type(text: string): Promise<void> {
      const input = filterInput()!;
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flush();
    }

    it('renders no filter box by default (filterable off)', async () => {
      await init();
      await open();
      expect(filterInput()).toBeNull();
    });

    it('renders the filter box with its accessible name + placeholder when enabled', async () => {
      await init({ filterable: true });
      await open();
      const input = filterInput();
      expect(input).not.toBeNull();
      expect(input!.getAttribute('aria-label')).toBe('Filter nodes');
      expect(input!.getAttribute('placeholder')).toBe('Filter');
    });

    it('narrows a leaf match to it plus its ancestor path (siblings pruned)', async () => {
      await init({ filterable: true });
      await open();
      await type('api');
      // API matches; its ancestors Workspace > Projects are kept for reachability; App/Settings/the
      // value-less group are pruned entirely (removed from the DOM, not merely hidden).
      expect(shownLabels()).toEqual(['Workspace', 'Projects', 'API']);
    });

    it('keeps the whole subtree of a node that matches on its own text', async () => {
      await init({ filterable: true });
      await open();
      await type('projects');
      // Projects matches → its full subtree (App, API) stays; Workspace kept as ancestor; Settings pruned.
      expect(shownLabels()).toEqual(['Workspace', 'Projects', 'App', 'API']);
    });

    it('matches case-insensitively', async () => {
      await init({ filterable: true });
      await open();
      await type('SETTINGS');
      expect(shownLabels()).toEqual(['Workspace', 'Settings']);
    });

    it('force-expands surviving ancestors so a deep match is reachable', async () => {
      await init({ filterable: true });
      await open();
      await type('api'); // ws > proj > api, both ancestors collapsed at rest
      expect(toggleLabel('Workspace')).toBe('Collapse Workspace');
      expect(toggleLabel('Projects')).toBe('Collapse Projects');
    });

    it('shows the empty message and no tree items when nothing matches', async () => {
      await init({ filterable: true, emptyMessage: 'Nothing here' });
      await open();
      await type('zzz-no-match');
      expect(treeItems().length).toBe(0);
      expect(emptyMsg()?.textContent?.trim()).toBe('Nothing here');
    });

    it('announces the result count in a polite live region', async () => {
      await init({ filterable: true });
      await open();
      const region = srRegion()!;
      expect(region.getAttribute('aria-live')).toBe('polite');
      await type('api'); // one match
      expect(region.textContent?.trim()).toBe('1 result');
      await type('s'); // Workspace, Projects, Settings
      expect(region.textContent?.trim()).toBe('3 results');
      await type('zzz'); // none
      expect(region.textContent?.trim()).toBe('No matches');
    });

    it('selecting a filtered result still emits its key and closes (single mode)', async () => {
      await init({ filterable: true });
      await open();
      await type('settings');
      labelFor('Settings').click();
      await flush();
      expect(host.control.value).toBe('settings');
      expect(panel()).toBeNull();
    });

    it('filtering is view-only — a selected key filtered out of view stays in the value', async () => {
      host.control.setValue('app');
      await init({ filterable: true });
      await open();
      await type('settings'); // App is not shown
      expect(shownLabels()).toEqual(['Workspace', 'Settings']);
      expect(host.control.value).toBe('app'); // value untouched
      await type(''); // clear the filter
      expect(shownLabels()).toContain('App'); // App is back
      expect(host.control.value).toBe('app');
    });

    it('restores the full tree and the pre-filter expansion when the query clears', async () => {
      await init({ filterable: true });
      await open();
      // Manually expand only Workspace before filtering (Projects stays collapsed).
      treeItemFor('Workspace').querySelector<HTMLElement>('.cae-tree-select__toggle')!.click();
      await flush();
      expect(toggleLabel('Workspace')).toBe('Collapse Workspace');
      expect(toggleLabel('Projects')).toBe('Expand Projects');
      // Filter on 'projects' — an INTERNAL node match. Its whole subtree shows and it is force-expanded.
      // This is the teeth: if the force-expand touched the ORIGINAL Projects (not a throwaway copy), the
      // expansion would leak and Projects would stay expanded after clearing.
      await type('projects');
      expect(toggleLabel('Projects')).toBe('Collapse Projects');
      expect(shownLabels()).toEqual(['Workspace', 'Projects', 'App', 'API']);
      // Clearing restores exactly the pre-filter state: Workspace expanded (manual), Projects collapsed —
      // the filter's expansion of the Projects COPY never touched the original.
      await type('');
      expect(shownLabels()).toContain('Settings'); // full tree back
      expect(toggleLabel('Workspace')).toBe('Collapse Workspace');
      expect(toggleLabel('Projects')).toBe('Expand Projects');
    });

    it('marks the filter box (not a selected node) as the auto-capture focus target', async () => {
      host.control.setValue('ws');
      await init({ filterable: true });
      await open();
      const target = container().querySelector('[cdkFocusInitial]');
      expect(target).toBe(filterInput());
      expect(container().querySelectorAll('[cdkFocusInitial]').length).toBe(1);
    });

    it('moves focus into the tree on ArrowDown from the filter box', async () => {
      await init({ filterable: true });
      await open();
      const input = filterInput()!;
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await flush();
      expect(document.activeElement).toBe(treeItems()[0]);
    });

    it('honors a custom filterWith predicate for both the shown set and the announced count', async () => {
      // A key-prefix matcher on the node VALUE, deliberately chosen so the query diverges from the label
      // predicate: 'ws' matches Workspace by its value 'ws', but the default label-substring predicate
      // finds "ws" in NO label — so if either filteredNodes or matchCount ignored filterWith, this fails.
      await init({
        filterable: true,
        filterWith: (node: CaeTreeNode, query: string) => (node.value ?? '').startsWith(query),
      });
      await open();
      await type('ws');
      // Workspace matches → its whole subtree shows; the count reflects the single (own-text) match.
      expect(shownLabels()).toEqual(['Workspace', 'Projects', 'App', 'API', 'Settings']);
      expect(srRegion()?.textContent?.trim()).toBe('1 result');
    });

    it('resets a stale filter when the control is disabled mid-filter and later reopened', async () => {
      // Regression (#282 review): setDisabledState closes WITHOUT calling close(), so a per-path query
      // reset would be missed — the reopened panel would show a stale, collapsed, filtered tree behind an
      // empty box. The reset effect (keyed on isOpen/filterable) covers this path.
      await init({ filterable: true });
      await open();
      await type('api');
      expect(shownLabels()).toEqual(['Workspace', 'Projects', 'API']);
      host.control.disable(); // setDisabledState(true) — closes the panel directly
      await flush();
      host.control.enable();
      await flush();
      await open();
      expect(filterInput()!.value).toBe(''); // box is empty...
      expect(shownLabels()).toContain('Settings'); // ...and the tree is NOT stale-filtered
    });

    it('resets the filter when the panel closes and reopens', async () => {
      await init({ filterable: true });
      await open();
      await type('api');
      expect(shownLabels()).toEqual(['Workspace', 'Projects', 'API']);
      panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await flush();
      await open();
      expect(filterInput()!.value).toBe(''); // query cleared
      expect(shownLabels()).toContain('Settings'); // full tree shown again
    });
  });

  describe('per-node disabled (#282, on decision #526)', () => {
    // 'api' (a leaf under Projects) and 'settings' (a top-level leaf) are disabled; 'proj'/'app' are not.
    const DISABLED_NODES: readonly CaeTreeNode[] = [
      {
        value: 'proj',
        label: 'Projects',
        children: [
          { value: 'app', label: 'App' },
          { value: 'api', label: 'API', disabled: true },
        ],
      },
      { value: 'settings', label: 'Settings', disabled: true },
    ];

    it('does not select a disabled node on click, and marks it aria-disabled (not aria-selected)', async () => {
      host.nodes.set(DISABLED_NODES);
      await init();
      await open();
      labelFor('Settings').click();
      await flush();
      expect(host.control.value).toBe(''); // unchanged — disabled node is inert to selection
      const item = treeItemFor('Settings');
      expect(item.getAttribute('aria-disabled')).toBe('true');
      expect(item.getAttribute('aria-selected')).toBeNull();
      // It is still IN the tree (focusable/roving-reachable), not removed.
      expect(treeItems().map((t) => t.textContent?.trim())).toContain(
        treeItemFor('Settings').textContent?.trim(),
      );
      expect(item.querySelector('.cae-tree-select__row--disabled')).not.toBeNull();
    });

    it('does not select a disabled node via the keyboard (Enter on its treeitem)', async () => {
      host.nodes.set(DISABLED_NODES);
      await init();
      await open();
      const item = treeItemFor('Settings');
      item.focus();
      item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flush();
      expect(host.control.value).toBe(''); // Enter on a disabled node is a no-op
      expect(panel()).not.toBeNull(); // and does not commit/close
    });

    it('checkbox: a disabled child is excluded from cascade and the parent tally', async () => {
      host.nodes.set(DISABLED_NODES);
      await init({ mode: 'checkbox' });
      await open();
      labelFor('Projects').click(); // check the parent
      await flush();
      // 'api' is disabled → NOT forced by the parent cascade and NOT in the value; the parent still
      // rolls up to checked from its one enabled child ('app').
      expect([...(host.control.value as string[])].sort()).toEqual(['app', 'proj']);
      expect(treeItemFor('Projects').getAttribute('aria-checked')).toBe('true');
      expect(treeItemFor('App').getAttribute('aria-checked')).toBe('true');
      // A disabled node carries no checkbox state at all.
      expect(treeItemFor('API').getAttribute('aria-checked')).toBeNull();
    });

    it('checkbox: a disabled node renders no checkbox', async () => {
      host.nodes.set(DISABLED_NODES);
      await init({ mode: 'checkbox' });
      await open();
      // Only the two enabled value-bearing nodes (proj, app) get a box; api + settings get none.
      expect(container().querySelectorAll('.cae-tree-select__checkbox').length).toBe(2);
    });

    it('writeValue retains a disabled key unshown, and it resolves when the node is enabled', async () => {
      host.nodes.set(DISABLED_NODES);
      await init(); // single mode
      host.control.setValue('settings'); // a disabled node's key
      await flush();
      // Retained in the value (not dropped)…
      expect(host.control.value).toBe('settings');
      // …but not shown selected while disabled (label unresolved → placeholder).
      expect(trigger().textContent?.trim()).toContain('Select…');
      // Enabling the node resolves the held key for free (the async-key round-trip path).
      host.nodes.set([
        DISABLED_NODES[0],
        { value: 'settings', label: 'Settings' }, // same key, now enabled
      ]);
      await flush();
      expect(trigger().textContent?.trim()).toContain('Settings');
    });

    it('checkbox: an ancestor cascade passes THROUGH a disabled internal node to enabled descendants', async () => {
      // gp (enabled) → parent (DISABLED) → child (enabled leaf). Checking gp must force the enabled
      // grandchild ON — the disabled internal node is transparent to the cascade — yet the disabled
      // node itself is excluded from the value and carries no checkbox.
      host.nodes.set([
        {
          value: 'gp',
          label: 'Grandparent',
          children: [
            {
              value: 'parent',
              label: 'Parent',
              disabled: true,
              children: [{ value: 'child', label: 'Child' }],
            },
          ],
        },
      ]);
      await init({ mode: 'checkbox' });
      await open();
      labelFor('Grandparent').click();
      await flush();
      expect([...(host.control.value as string[])].sort()).toEqual(['child', 'gp']); // 'parent' excluded
      expect(treeItemFor('Grandparent').getAttribute('aria-checked')).toBe('true');
      expect(treeItemFor('Child').getAttribute('aria-checked')).toBe('true'); // forced through the disabled node
      expect(treeItemFor('Parent').getAttribute('aria-checked')).toBeNull(); // disabled → no checkbox
    });

    it('checkbox: writeValue retains a disabled key unshown, resolving to checked when enabled', async () => {
      host.nodes.set(DISABLED_NODES);
      await init({ mode: 'checkbox' });
      host.control.setValue(['api']); // 'api' is disabled
      await flush();
      expect(host.control.value).toEqual(['api']); // retained, not canonicalized away
      expect(trigger().textContent?.trim()).toContain('Select…'); // unresolved while disabled
      // Enable the node → the held key resolves for free (same round-trip as an async-loaded key).
      host.nodes.set([
        { value: 'proj', label: 'Projects', children: [{ value: 'api', label: 'API' }] },
      ]);
      await flush();
      expect(trigger().textContent?.trim()).toContain('API');
      await open();
      expect(treeItemFor('API').getAttribute('aria-checked')).toBe('true');
    });
  });
});
