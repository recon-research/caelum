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
 *   2. **`hidden` genuinely removes collapsed content from the tab order — and #870's focus
 *      redirect outruns the engine's own fixup.** jsdom has no focus model worth trusting here: it
 *      never blurs a hidden element, so both the strand this component prevents and the frame-tight
 *      window it prevents it in are invisible there. Every jsdom assertion about the redirect
 *      passes on a runner that has no fixup to outrun; only a real engine grades the timing.
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

/**
 * A panel with NO toggle, driven entirely from outside — the one shape #870's redirect cannot
 * rescue, because there is no control belonging to the panel to move focus to.
 */
@Component({
  imports: [CaePanel],
  template: `
    <cae-panel id="untoggleable" header="Driven from outside" [collapsed]="collapsed()">
      <button id="orphan" type="button">Inside the panel</button>
    </cae-panel>
  `,
})
class UntoggleablePanelHost {
  readonly collapsed = signal(false);
}

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

    // This collapse deliberately happens while focus is still INSIDE the region. Both components
    // are `toggleable` here, so #870's redirect applies: focus lands on the fieldset's toggle (the
    // last region focused above), not on <body>.
    await collapse();

    const fieldsetToggle = root.querySelector<HTMLButtonElement>('.cae-fieldset__toggle')!;
    expect(document.activeElement).toBe(fieldsetToggle);

    // …and it STAYS there. This is the assertion that makes the arm a real timing test rather than
    // a restatement of the line above: before #870 this same wait was what turned focus into
    // <body>, because the engine defers its fixup for an unrendered element to the next rendering
    // opportunity. Surviving two frames proves the redirect ran INSIDE that window — which is the
    // claim jsdom cannot grade at all, having no fixup to outrun.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(document.activeElement).toBe(fieldsetToggle);

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

  it('still strands focus when the panel has no toggle — the documented residual gap (#870)', async () => {
    const fixture = TestBed.createComponent(UntoggleablePanelHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const orphan = root.querySelector<HTMLButtonElement>('#orphan')!;
    orphan.focus();
    expect(document.activeElement).toBe(orphan);

    fixture.componentInstance.collapsed.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    // The redirect declines rather than inventing a target (it dev-warns instead — graded in the
    // unit suite, where a console spy is cheap). Pinning the strand HERE is what keeps that a
    // measured decision rather than an assumption: if a later change gave the panel something to
    // focus, this arm goes red and forces the doc on `collapsed` to be re-read.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(document.activeElement).toBe(document.body);

    fixture.nativeElement.remove();
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
