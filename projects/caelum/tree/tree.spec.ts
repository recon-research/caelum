import { ComponentFixture, TestBed } from '@angular/core/testing';

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
