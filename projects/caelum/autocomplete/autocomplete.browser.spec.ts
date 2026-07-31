/**
 * Real-browser verification for `cae-autocomplete` (#900, via the #240 harness).
 *
 * **Why this file has to exist.** `autocomplete.spec.ts` now drives real events, and the CDK overlay
 * genuinely attaches under jsdom — so "the panel opens" is *not* what is browser-only here. What jsdom
 * cannot do is **lay anything out** or **resolve `var()` through the cascade**, which leaves three of
 * this component's claims unfalsifiable there:
 *
 *   1. **The WCAG 2.5.8 hit target on a chip's × button.** Every box jsdom reports is 0×0, so the
 *      unit suite can only assert that the button *exists*. The `compact` arm is the one that
 *      matters: `--cae-target-min` is density-INVARIANT while `--cae-space-*` shrinks to 16px, so a
 *      floor derived from spacing silently drops under the 24px minimum exactly where a dense admin
 *      table puts it (the lesson `cae-panel` #711 recorded, applied to the first chip affordance
 *      `cae-autocomplete` ships).
 *   2. **Contrast on the OPEN panel.** axe grades colour against composited pixels; under jsdom every
 *      colour rule comes back `incomplete`, so the suggestion overlay — the one surface a user reads
 *      while typing — has never actually been graded.
 *   3. **Focus after the last chip goes.** Removing the final chip destroys the element focus is
 *      sitting on. Where focus lands next is a real focus-model question, and jsdom's answer (`body`
 *      by default, regardless of what the component does) cannot distinguish a working restore from
 *      a broken one.
 */
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { CaeAutocomplete, CaeAutocompleteOption } from './autocomplete';
import { expectNoA11yViolations } from '../testing/a11y';
import { loadCaelumTheme } from '../testing/theme';

const OPTIONS: CaeAutocompleteOption[] = [
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'de', label: 'Germany' },
];

@Component({
  imports: [CaeAutocomplete, ReactiveFormsModule],
  template: `
    <cae-autocomplete
      multiple
      freeText
      label="Countries"
      ariaLabel="Countries"
      [options]="opts"
      [formControl]="ctrl"
    />
  `,
})
class ChipHost {
  readonly opts = OPTIONS;
  readonly ctrl = new FormControl<readonly string[]>([]);
}

describe('CaeAutocomplete (real browser, #900)', () => {
  let fixture: ComponentFixture<ChipHost>;

  beforeEach(() => loadCaelumTheme());

  afterEach(() => {
    document.documentElement.removeAttribute('data-density');
  });

  const render = async (chips: readonly string[]): Promise<HTMLElement> => {
    fixture = TestBed.createComponent(ChipHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentInstance.ctrl.setValue(chips);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  const inputEl = (): HTMLInputElement => fixture.nativeElement.querySelector('input');

  for (const density of [null, 'comfortable', 'compact']) {
    it(`floors a chip's remove button at 24x24 CSS px (density: ${density ?? 'default'}) — WCAG 2.5.8`, async () => {
      if (density) document.documentElement.setAttribute('data-density', density);
      const root = await render(['us', 'uk']);
      const removes = root.querySelectorAll('button[matChipRemove]');
      expect(removes.length).toBe(2); // vacuity guard: there are buttons to measure
      for (const remove of Array.from(removes)) {
        const box = remove.getBoundingClientRect();
        // The rendered box, not the declaration — this is what a pointer has to hit.
        expect(box.width, `remove width @ ${density ?? 'default'}`).toBeGreaterThanOrEqual(24);
        expect(box.height, `remove height @ ${density ?? 'default'}`).toBeGreaterThanOrEqual(24);
      }
    });
  }

  it('grades the OPEN suggestion panel for contrast — jsdom can only report incomplete', async () => {
    await render([]);
    const el = inputEl();
    el.focus();
    el.dispatchEvent(new Event('focusin', { bubbles: true }));
    el.value = 'Unit';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    const panelId = el.getAttribute('aria-controls');
    expect(panelId).toBeTruthy(); // vacuity guard: nothing to grade if the panel never opened
    const panel = document.getElementById(panelId!)!;
    expect(panel.querySelectorAll('mat-option').length).toBeGreaterThan(0); // and it has content
    // Scan the panel where it actually lives (the CDK overlay container), not the host subtree.
    await expectNoA11yViolations(panel);
  });

  it('keeps focus inside the widget when the LAST chip is removed', async () => {
    const root = await render(['us']);
    const remove = root.querySelector('button[matChipRemove]') as HTMLElement;
    remove.focus();
    expect(document.activeElement).toBe(remove); // vacuity guard: focus really started on the ×
    remove.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelectorAll('mat-chip-row').length).toBe(0); // the chip really went
    // Material moves focus to the chip input once the grid empties. The assertion that matters is
    // that focus did not fall to <body> — a keyboard user's next Tab would restart from the top of
    // the document with nothing announced.
    expect(document.activeElement).not.toBe(document.body);
    expect(root.contains(document.activeElement)).toBe(true);
  });
});
