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
    overrides: Partial<Record<'mode' | 'ariaLabel' | 'required' | 'showClear', unknown>> = {},
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
});
