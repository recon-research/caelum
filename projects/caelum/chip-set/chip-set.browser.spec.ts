/**
 * Real-browser verification for `cae-chip-set` (#925, via the #240 harness).
 *
 * **Why this file has to exist.** Same single reason as `chip.browser.spec.ts`: jsdom reports every
 * box as 0x0, so `chip-set.spec.ts` can only assert that a remove button exists and is named. The
 * 18x18 breach measured on `cae-autocomplete` (PR #924, #900) is a property of Material's trailing
 * action at *every* density — not a density collapse — and it needs a real engine to see.
 *
 * The set is the more interesting case of the two: it renders N remove buttons through `@for`, so
 * this measures all of them rather than the first, and it renders the text-entry input alongside,
 * whose own floor (`.cae-chip-set__input`) was already on `--cae-target-min` and is asserted here
 * for the first time as a rendered box rather than a declaration.
 */
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeChipSet } from './chip-set';
import { loadCaelumTheme } from '../testing/theme';

@Component({
  imports: [CaeChipSet],
  template: `
    <cae-chip-set
      textEntry
      ariaLabel="Tags"
      textEntryLabel="Add tag"
      [items]="tags"
      [removeAriaLabel]="removeLabel"
    />
  `,
})
class ChipSetHost {
  readonly tags = ['angular', 'material', 'a11y'];
  readonly removeLabel = (item: string): string => `Remove ${item}`;
}

describe('CaeChipSet (real browser, #925)', () => {
  let fixture: ComponentFixture<ChipSetHost>;

  beforeEach(() => loadCaelumTheme());

  afterEach(() => {
    document.documentElement.removeAttribute('data-density');
  });

  const render = async (): Promise<HTMLElement> => {
    fixture = TestBed.createComponent(ChipSetHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  for (const density of [null, 'comfortable', 'compact']) {
    it(`floors every remove button at 24x24 CSS px (density: ${density ?? 'default'}) — WCAG 2.5.8`, async () => {
      if (density) document.documentElement.setAttribute('data-density', density);
      const root = await render();
      const removes = Array.from(root.querySelectorAll('button[matChipRemove]'));
      // Vacuity guard: assert the COUNT, not just non-empty — an @for that stamped one row would
      // otherwise let this pass while two thirds of the buttons went unmeasured.
      expect(removes.length).toBe(3);
      for (const [i, remove] of removes.entries()) {
        const box = remove.getBoundingClientRect();
        expect(box.width, `remove[${i}] width @ ${density ?? 'default'}`).toBeGreaterThanOrEqual(
          24,
        );
        expect(box.height, `remove[${i}] height @ ${density ?? 'default'}`).toBeGreaterThanOrEqual(
          24,
        );
      }
    });
  }

  it('floors the text-entry input at 24 CSS px tall under compact density', async () => {
    // `.cae-chip-set__input` already declared min-block-size: var(--cae-target-min); nothing had
    // ever measured it. compact is the arm that matters — a --cae-space-* floor reads fine at
    // default and collapses to 16px here.
    document.documentElement.setAttribute('data-density', 'compact');
    const root = await render();
    const input = root.querySelector('.cae-chip-set__input') as HTMLElement | null;
    expect(input).not.toBeNull();
    expect(input!.getBoundingClientRect().height).toBeGreaterThanOrEqual(24);
  });
});
