/**
 * Real-browser verification for `cae-alert` (#710, via the #240 harness).
 *
 * **Why this file has to exist.** The unit suite asserts the WCAG 2.5.8 hit-target floor by
 * matching the *compiled style sheet as text* — `min-inline-size: var(--cae-target-min)`. That is a
 * source assertion, not a behavioural oracle, and an independent review lens produced two mutations
 * that keep the text present while the button ends up with no floor at all:
 *
 *   1. rename the rule's selector (`.cae-alert__close` → `.cae-alert__close-control`) so it matches
 *      no element — every regex still passes, and the button silently loses its floor, its reset
 *      border/background, and its focus ring;
 *   2. append a later rule of equal specificity setting `1rem` — the cascade wins, the earlier
 *      declaration is still in the text, and `1rem` is not `var(--cae-space-*)` so even the negative
 *      assertion is satisfied.
 *
 * Only a real layout engine can tell those apart, because only a real layout engine resolves
 * `var()` and the cascade. jsdom returns the empty string for any custom property and never
 * computes used values.
 *
 * The `compact` arm is the one that matters most: `--cae-target-min` is declared **density-
 * invariant**, and the whole reason the rule uses it instead of a `--cae-space-*` token is that
 * spacing tokens shrink to 16px there — below the 24×24 CSS pixels SC 2.5.8 requires.
 */
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CaeAlert } from './alert';
import { loadCaelumTheme } from '../testing/theme';

@Component({
  imports: [CaeAlert],
  template: `
    <cae-alert id="danger" severity="danger" dismissible [(visible)]="visible">
      The card on file expired.
    </cae-alert>
    <cae-alert id="success" severity="success">Workspace saved.</cae-alert>
    <cae-alert id="unknown" severity="nonsense">Unmapped severity.</cae-alert>
  `,
})
class AlertBrowserHost {
  readonly visible = signal(true);
}

describe('CaeAlert (real browser)', () => {
  beforeEach(() => loadCaelumTheme());

  afterEach(() => {
    document.documentElement.removeAttribute('data-density');
  });

  const render = async (): Promise<HTMLElement> => {
    const fixture = TestBed.createComponent(AlertBrowserHost);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    return fixture.nativeElement.querySelector('.cae-alert__close') as HTMLElement;
  };

  for (const density of [null, 'comfortable', 'compact']) {
    it(`floors the close button at 24x24 CSS px (density: ${density ?? 'default'}) — WCAG 2.5.8`, async () => {
      if (density) document.documentElement.setAttribute('data-density', density);
      const btn = await render();

      const box = btn.getBoundingClientRect();
      // The rendered box, not the declaration: this is what a pointer actually has to hit.
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
    });
  }

  it('resolves the target floor from --cae-target-min, not a spacing token', async () => {
    const btn = await render();
    const computed = getComputedStyle(btn);
    const targetMin = getComputedStyle(document.documentElement)
      .getPropertyValue('--cae-target-min')
      .trim();

    // Pin the SOURCE of the floor, so swapping in a --cae-space-* token of a coincidentally equal
    // size at the default density (where several of them are also 24px) still fails here once the
    // compact arm above shrinks it.
    expect(targetMin).not.toBe('');
    expect(computed.minInlineSize).toBe(targetMin);
    expect(computed.minBlockSize).toBe(targetMin);
  });

  it('paints a DIFFERENT tint per severity, and none for an unmapped one', async () => {
    await render();
    const tint = (id: string): string =>
      getComputedStyle(document.querySelector(`#${id} .cae-alert`)!).backgroundColor;

    // `color-mix()` resolves only in a real engine — and to `color(srgb …)` here, not `rgb()`, so
    // compare colours to each other rather than to a literal format. Two severities resolving to
    // the same paint is exactly the swap an independent lens showed passes the whole jsdom suite.
    expect(tint('danger')).not.toBe(tint('success'));
    // An unmapped severity matches no rule at all, so it stays transparent — which also proves the
    // two above are tinted by their *own* rule rather than inheriting something from the container.
    expect(tint('danger')).not.toBe(tint('unknown'));
    expect(tint('success')).not.toBe(tint('unknown'));

    const border = getComputedStyle(document.querySelector('#danger .cae-alert')!);
    expect(border.borderTopWidth).toBe('1px');
    expect(border.borderTopColor).not.toBe(tint('danger'));
  });
});
