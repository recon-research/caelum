import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CaeToolbar } from './toolbar';
import { expectNoA11yViolations } from '../testing/a11y';

@Component({
  imports: [CaeToolbar],
  template: `
    <cae-toolbar>
      <div caeToolbarStart class="s">Brand</div>
      <div class="d">Loose</div>
      <div caeToolbarEnd class="e">Actions</div>
    </cae-toolbar>
  `,
})
class ToolbarHost {}

describe('CaeToolbar', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ToolbarHost] }).compileComponents();
  });

  function render() {
    const fixture = TestBed.createComponent(ToolbarHost);
    fixture.detectChanges();
    return fixture;
  }

  it('has no axe violations', async () => {
    const el = render().nativeElement as HTMLElement;
    await expectNoA11yViolations(el);
  });

  it('renders a mat-toolbar (the styled bar), not a role="toolbar" widget', () => {
    const el = render().nativeElement as HTMLElement;
    const toolbar = el.querySelector('mat-toolbar');
    expect(toolbar).toBeTruthy();
    // Deliberately NOT the WAI-ARIA toolbar role (that needs roving tabindex, which a visual
    // bar doesn't manage) — matching mat-toolbar.
    expect(toolbar!.getAttribute('role')).toBeNull();
  });

  it('places the start group before the flex spacer and the end group after it', () => {
    const el = render().nativeElement as HTMLElement;
    const nodes = Array.from(
      el.querySelectorAll('.s, .d, .cae-toolbar__spacer, .e'),
    ) as HTMLElement[];
    const idx = (sel: string) => nodes.findIndex((n) => n.matches(sel));
    expect(idx('.s')).toBeGreaterThanOrEqual(0);
    expect(idx('.e')).toBeGreaterThanOrEqual(0);
    expect(idx('.s')).toBeLessThan(idx('.cae-toolbar__spacer'));
    expect(idx('.cae-toolbar__spacer')).toBeLessThan(idx('.e'));
  });

  it('renders un-grouped content start-side (nothing is silently dropped)', () => {
    const el = render().nativeElement as HTMLElement;
    const loose = el.querySelector('.d');
    const spacer = el.querySelector('.cae-toolbar__spacer')!;
    expect(loose).toBeTruthy();
    // the loose div comes before the spacer → it is start-side
    expect(loose!.compareDocumentPosition(spacer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
