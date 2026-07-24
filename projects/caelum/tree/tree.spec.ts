import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CaeTree, CaeTreeNode } from './tree';
import { expectNoA11yViolations } from '../testing/a11y';

const NODES: CaeTreeNode[] = [
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
];

describe('CaeTree', () => {
  let component: CaeTree;
  let fixture: ComponentFixture<CaeTree>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeTree] }).compileComponents();
    fixture = TestBed.createComponent(CaeTree);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('nodes', NODES);
    fixture.componentRef.setInput('ariaLabel', 'Structure');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('registers ONE CDK node type — no "conflicting node types" warning (#491)', async () => {
    // CdkTreeNode declares _type='flat', CdkNestedTreeNode _type='nested', and each reports its type
    // via _setNodeTypeIfUnset() on init; the tree warns (dev-mode) when the two disagree. A flat
    // <mat-tree-node> leaf inside this childrenAccessor (nested) tree used to trip exactly that, and
    // the CDK states expand/collapse bookkeeping is undefined under the mix.
    //
    // The spy must be armed BEFORE the component renders, so this builds its own fixture rather than
    // using the shared one (which the beforeEach has already rendered).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const f = TestBed.createComponent(CaeTree);
      f.componentRef.setInput('nodes', NODES);
      f.componentRef.setInput('ariaLabel', 'Structure');
      f.detectChanges();
      await f.whenStable();

      // Vacuity guard: the warning can only fire once BOTH node defs have instantiated, so assert the
      // tree really stamped branches AND leaves — and that none of them is the flat element any more.
      expect(f.nativeElement.querySelectorAll('mat-nested-tree-node').length).toBeGreaterThan(1);
      expect(f.nativeElement.querySelector('mat-tree-node')).toBeNull();
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('conflicting node types'));
    } finally {
      warn.mockRestore();
    }
  });

  const labels = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.cae-tree__label'));
  const groups = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.cae-tree__children'));
  const toggles = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.cae-tree__toggle'));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('has no axe violations (labeled tree, nested nodes)', async () => {
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('renders a labelled treeitem for every node in the nested data', () => {
    // childrenAccessor stamps the whole hierarchy up front; collapsed subtrees are hidden,
    // not absent — so every node has a label element.
    const text = labels().map((l) => l.textContent?.trim());
    expect(text).toEqual(['Workspace', 'Projects', 'App', 'API', 'Settings']);
  });

  it('labels the tree for assistive tech', () => {
    const tree = fixture.nativeElement.querySelector('[role="tree"]');
    expect(tree?.getAttribute('aria-label')).toBe('Structure');
  });

  it('hides collapsed subtrees and reveals them on toggle', async () => {
    // Root starts collapsed → its children group is display:none.
    const rootGroup = groups()[0];
    expect(rootGroup.style.display).toBe('none');

    toggles()[0].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(rootGroup.style.display).not.toBe('none');
  });

  it('emits the node when its label is activated (nodeSelect)', () => {
    let picked: CaeTreeNode | undefined;
    component.nodeSelect.subscribe((n) => (picked = n));
    // Workspace label (first) — a leaf or branch label both emit.
    labels()[0].click();
    expect(picked?.value).toBe('ws');
  });
});
