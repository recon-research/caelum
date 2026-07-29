/**
 * Real-browser verification for `cae-panel` / `cae-fieldset` (#711, via the #240 harness).
 *
 * **Why this file has to exist.** Three of the slice's load-bearing claims are invisible to jsdom,
 * which does no layout and resolves no custom property:
 *
 *   1. **The WCAG 2.5.8 hit-target floor.** The unit suite matches the *compiled style sheet as
 *      text*. That is a source assertion, not a behavioural oracle — renaming the rule's selector,
 *      or appending a later equal-specificity rule that overrides the floor, leaves every regex
 *      passing while the button ends up with no floor at all. Only a layout engine resolves `var()`
 *      and the cascade. The `compact` arm matters most: `--cae-target-min` is density-INVARIANT,
 *      and the entire reason the rule uses it is that `--cae-space-*` shrinks to 16px there.
 *   2. **`hidden` genuinely removes collapsed content from the tab order.** jsdom has no focus
 *      model worth trusting here, so "collapsing takes the content out of Tab" — the claim that
 *      makes hiding-instead-of-removing safe — can only be shown against a real engine.
 *   3. **The `<fieldset>` `min-inline-size` reset.** The UA default (`min-content`) is a *used
 *      value* computed during layout; a jsdom text match on the declaration cannot show that the
 *      group actually shrinks inside a narrow flex parent.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeFieldset } from './fieldset';
import { CaePanel } from './panel';
import { loadCaelumTheme } from '../testing/theme';

@Component({
  imports: [CaePanel, CaeFieldset],
  template: `
    <cae-panel id="panel" header="Billing details" toggleable [(collapsed)]="collapsed">
      <button id="panel-inner" type="button">Inside the panel</button>
    </cae-panel>

    <cae-fieldset id="fieldset" legend="Billing details" toggleable [(collapsed)]="collapsed">
      <button id="fieldset-inner" type="button">Inside the fieldset</button>
    </cae-fieldset>
  `,
})
class PanelBrowserHost {
  readonly collapsed = signal(false);
}

/**
 * The two shapes whose hit target is NOT comfortably wide: a one-glyph legend (the fieldset toggle
 * has `padding: 0`, so its inline size is chevron + gap + text) and a header long enough to squeeze
 * the panel's toggle. Both are floors a "Billing details" fixture can never measure.
 */
@Component({
  imports: [CaePanel, CaeFieldset],
  template: `
    <div style="inline-size: 200px">
      <cae-fieldset legend="I" toggleable>body</cae-fieldset>
      <cae-panel header="Averyverylongunbrokenheaderstringwithnospaces" toggleable>body</cae-panel>
    </div>
  `,
})
class TightHost {}

/** A very narrow flex parent — the shape that exposes a fieldset's UA `min-inline-size`. */
@Component({
  imports: [CaeFieldset],
  template: `
    <div id="squeeze" style="display: flex; inline-size: 120px">
      <cae-fieldset legend="A legend far wider than one hundred and twenty pixels">
        <p>Body text that is also considerably wider than the parent box allows.</p>
      </cae-fieldset>
    </div>
  `,
})
class SqueezedFieldsetHost {}

describe('CaePanel / CaeFieldset (real browser)', () => {
  let fixture: ComponentFixture<PanelBrowserHost>;

  beforeEach(() => loadCaelumTheme());

  afterEach(() => {
    document.documentElement.removeAttribute('data-density');
  });

  const render = async (): Promise<HTMLElement> => {
    fixture = TestBed.createComponent(PanelBrowserHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  const collapse = async (): Promise<void> => {
    fixture.componentInstance.collapsed.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
  };

  for (const density of [null, 'comfortable', 'compact']) {
    it(`floors both toggles at 24x24 CSS px (density: ${density ?? 'default'}) — WCAG 2.5.8`, async () => {
      if (density) document.documentElement.setAttribute('data-density', density);
      const root = await render();

      for (const selector of ['.cae-panel__toggle', '.cae-fieldset__toggle']) {
        const box = root.querySelector(selector)!.getBoundingClientRect();
        // The rendered box, not the declaration: this is what a pointer actually has to hit.
        expect(box.width, `${selector} width`).toBeGreaterThanOrEqual(24);
        expect(box.height, `${selector} height`).toBeGreaterThanOrEqual(24);
      }
    });
  }

  it('resolves the panel toggle floor from --cae-target-min, not a spacing token', async () => {
    const root = await render();
    const computed = getComputedStyle(root.querySelector('.cae-panel__toggle')!);
    const targetMin = getComputedStyle(document.documentElement)
      .getPropertyValue('--cae-target-min')
      .trim();

    // Pin the SOURCE of the floor: several --cae-space-* tokens are also 24px at the default
    // density, so an equal-looking swap would pass a bare numeric check here.
    expect(targetMin).not.toBe('');
    expect(computed.minInlineSize).toBe(targetMin);
    expect(computed.minBlockSize).toBe(targetMin);
  });

  it('takes collapsed content out of the tab order, in both components', async () => {
    const root = await render();
    const regions = [
      { content: '.cae-panel__content', inner: '#panel-inner' },
      { content: '.cae-fieldset__content', inner: '#fieldset-inner' },
    ].map(({ content, inner }) => ({
      content: root.querySelector<HTMLElement>(content)!,
      inner: root.querySelector<HTMLButtonElement>(inner)!,
    }));

    // Expanded: focusable. This arm is what makes the collapsed assertion below meaningful rather
    // than a button that was never reachable in the first place.
    for (const { inner } of regions) {
      inner.focus();
      expect(document.activeElement).toBe(inner);
    }

    // This collapse deliberately happens while focus is still INSIDE the region, and what follows
    // is measured rather than assumed (#870). Neither component can cause the strand — both toggles
    // sit outside their own content region — so it is a consumer hazard on the programmatic path,
    // the same one MatExpansionPanel and p-panel have, documented on the `collapsed` input.
    await collapse();

    // Synchronously after the model write and CD, focus is STILL on the now-hidden button: the
    // engine defers its focus fixup to the next rendering opportunity rather than applying it with
    // the style change.
    expect(document.activeElement).toBe(regions[1].inner);

    // One frame on, it has been reset to <body> — the WCAG 2.4.3 strand. Pinning both halves is
    // what #870 needs: a redirect has to act before this frame, because afterwards
    // `activeElement === body` can no longer distinguish a collapse from a deliberate park.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(document.activeElement).toBe(document.body);

    for (const { content, inner } of regions) {
      // Assert the REGION's display, not the button's: `display: none` on an ancestor does not
      // change a descendant's own computed `display` (it stays `inline-block` here), so checking
      // the button would silently measure the wrong element.
      expect(getComputedStyle(content).display).toBe('none');
      // …and the button is genuinely unrendered, which is what removes it from the tab order.
      expect(inner.offsetParent).toBeNull();

      (document.activeElement as HTMLElement | null)?.blur();
      inner.focus();
      // Content inside a `hidden` region is not focusable — focus does not enter it.
      expect(document.activeElement).not.toBe(inner);
    }
  });

  it('actually renders the legend, which is what names the group', async () => {
    const root = await render();
    const legend = root.querySelector('legend')!;

    // Measured, not asserted from attributes: a `<legend>` that is present in the DOM but not
    // rendered contributes nothing to the fieldset's accessible name, and the group goes unnamed —
    // the exact defect `[legend]` being required exists to prevent. A mutation adding `hidden` to
    // the legend passes every text-content assertion in the unit suite and is caught only here
    // (axe ships no rule for an unnamed fieldset).
    const box = legend.getBoundingClientRect();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(legend.textContent!.trim()).toBe('Billing details');
  });

  it('floors a ONE-GLYPH legend toggle, and keeps a long header from pushing the toggle out', async () => {
    const fixture = TestBed.createComponent(TightHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    // `legend="I"` is the narrowest shape the API permits (an empty legend is a compile error and
    // a dev warning). The fieldset toggle floors only its BLOCK axis, so this arm is what makes
    // that omission a measured fact rather than an assertion: chevron (1em) + gap + one glyph
    // still clears 24px, which is why an inline floor would be inert here.
    const legendToggle = root.querySelector('.cae-fieldset__toggle')!.getBoundingClientRect();
    expect(legendToggle.width).toBeGreaterThanOrEqual(24);
    expect(legendToggle.height).toBeGreaterThanOrEqual(24);

    // `.cae-panel__title { min-inline-size: 0 }` is the flex-item reset that lets an unbreakable
    // header shrink; without it the title's automatic minimum pushes the toggle past the card edge.
    const card = root.querySelector('mat-card')!.getBoundingClientRect();
    const panelToggle = root.querySelector('.cae-panel__toggle')!.getBoundingClientRect();
    expect(panelToggle.right).toBeLessThanOrEqual(card.right + 1);
    expect(panelToggle.width).toBeGreaterThanOrEqual(24);
  });

  it('lets a fieldset shrink below its content width (the UA min-inline-size reset)', async () => {
    const fixture = TestBed.createComponent(SqueezedFieldsetHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();

    const parent = (fixture.nativeElement as HTMLElement).querySelector('#squeeze')!;
    const fieldset = parent.querySelector('fieldset')!;

    // Without `min-inline-size: 0` the UA default (min-content) pins the fieldset to its widest
    // content and it overflows the 120px flex parent instead of shrinking into it.
    expect(fieldset.getBoundingClientRect().width).toBeLessThanOrEqual(
      parent.getBoundingClientRect().width,
    );
    expect(getComputedStyle(fieldset).minInlineSize).toBe('0px');
  });
});
