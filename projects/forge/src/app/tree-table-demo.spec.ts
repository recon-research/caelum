import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TreeTableDemo } from './tree-table-demo';

// Forge-side liveness for #262: the deferred demo renders a real treegrid, seeded with the top folders
// open, a custom Kind cell, and a nodeActivate note.
describe('TreeTableDemo', () => {
  let fixture: ComponentFixture<TreeTableDemo>;
  let el: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [TreeTableDemo] });
    fixture = TestBed.createComponent(TreeTableDemo);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const rowNames = (): string[] =>
    Array.from(el.querySelectorAll('[data-cae-tt-row] td:first-child')).map((c) =>
      c.textContent!.replace(/\s+/g, ' ').trim(),
    );

  it('renders a treegrid', () => {
    expect(el.querySelector('[role="treegrid"]')).not.toBeNull();
  });

  it('shows the hierarchy with src/app seeded open', () => {
    // src open → app (open) → its 3 files, then main.ts, styles.scss; then the collapsed public folder
    // and the two root files.
    expect(rowNames()).toEqual([
      'src',
      'app',
      'app.ts',
      'app.html',
      'app.scss',
      'main.ts',
      'styles.scss',
      'public',
      'package.json',
      'README.md',
    ]);
  });

  it('renders the custom Kind cell (caeTreeCellDef) for every row', () => {
    const tags = Array.from(el.querySelectorAll('.forge-ftype')).map((t) => t.textContent!.trim());
    expect(tags.length).toBe(rowNames().length);
    expect(tags[0]).toBe('folder'); // src
    expect(tags).toContain('file');
  });

  it('announces an activation in the status note', () => {
    const note = el.querySelector('.forge-tree-table-card__note') as HTMLElement;
    expect(note.getAttribute('role')).toBe('status');
    expect(note.textContent!.trim()).toBe('');
    // Activate the first row (src) via Enter on the focused row.
    const firstRow = el.querySelector('[data-cae-tt-row="0"]') as HTMLElement;
    firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(note.textContent).toContain('Opened src');
  });
});
