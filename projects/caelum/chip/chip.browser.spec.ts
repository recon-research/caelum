/**
 * Real-browser verification for `cae-chip` (#925, via the #240 harness).
 *
 * **Why this file has to exist.** The only claim here that jsdom cannot judge is the one that was
 * wrong: the WCAG 2.5.8 hit target on the remove button. jsdom lays nothing out — every
 * `getBoundingClientRect()` comes back 0x0 — so `chip.spec.ts` can assert the button *exists* and
 * that it is named, and no more. The box itself needs a real engine.
 *
 * The breach this pins is **not** a density collapse. Material sizes a chip's trailing action from
 * its own icon scale, so it measured 18x18 at *every* density on `cae-autocomplete` (PR #924, #900),
 * default included. The `compact` arm still earns its place: `--cae-target-min` is
 * density-invariant while `--cae-space-*` shrinks to 16px, so a floor derived from spacing would
 * pass the default arm and fail exactly where a dense admin UI puts a chip row.
 */
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeChip } from './chip';
import { loadCaelumTheme } from '../testing/theme';

@Component({
  imports: [CaeChip],
  template: `<cae-chip removable removeAriaLabel="Remove Angular">Angular</cae-chip>`,
})
class ChipHost {}

describe('CaeChip (real browser, #925)', () => {
  let fixture: ComponentFixture<ChipHost>;

  beforeEach(() => loadCaelumTheme());

  afterEach(() => {
    document.documentElement.removeAttribute('data-density');
  });

  const render = async (): Promise<HTMLElement> => {
    fixture = TestBed.createComponent(ChipHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  for (const density of [null, 'comfortable', 'compact']) {
    it(`floors the remove button at 24x24 CSS px (density: ${density ?? 'default'}) — WCAG 2.5.8`, async () => {
      if (density) document.documentElement.setAttribute('data-density', density);
      const root = await render();
      const remove = root.querySelector('button[matChipRemove]') as HTMLElement | null;
      expect(remove).not.toBeNull(); // vacuity guard: there is a box to measure at all
      const box = remove!.getBoundingClientRect();
      // The RENDERED box, not the declaration — this is the area a pointer has to hit.
      expect(box.width, `remove width @ ${density ?? 'default'}`).toBeGreaterThanOrEqual(24);
      expect(box.height, `remove height @ ${density ?? 'default'}`).toBeGreaterThanOrEqual(24);
    });
  }

  it('keeps the remove button Tab-reachable — a standalone chip has no key manager', async () => {
    // The `[tabIndex]="0"` on the button is load-bearing and easy to mistake for noise: without a
    // MatChipSet focus key-manager, Material leaves chip actions at tabindex="-1" and the x becomes
    // mouse-only. Measured here rather than asserted from the attribute, because the attribute
    // being 0 and the element actually taking focus are different claims.
    const root = await render();
    const remove = root.querySelector('button[matChipRemove]') as HTMLElement;
    remove.focus();
    expect(document.activeElement).toBe(remove);
  });
});
