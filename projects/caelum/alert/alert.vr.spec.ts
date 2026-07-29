/**
 * Visual-regression arms for `cae-alert` (#710, provisional on #735).
 *
 * **Why the alert earns a slot: nothing else grades its severity→token mapping.** The component
 * paints four `color-mix(<semantic> 12%, <surface>)` tints, four matching 40% borders and four
 * severity-coloured glyphs, and *no other oracle in the repo can see any of it*. Demonstrated, not
 * assumed — an independent review lens proposed swapping `--cae-color-success` and
 * `--cae-color-error` between the two rules (a danger alert rendering green) and traced it green
 * through all 35 unit tests: the jsdom suite matches CSS as source text, `axe` grades
 * `color-contrast` as *incomplete* without a layout engine, and `theming/contrast.browser.spec.ts`
 * measures foregrounds against the three plain surface tokens, never a `color-mix` result.
 *
 * This is the same blind spot `cae-tag` was added to close (#745), one layer down: the tag proves
 * the status *palette* resolves, the alert proves this component maps each severity to the right
 * member of it. A 12% tint is also a deliberately harder subject than the tag's 24% — a swapped
 * token moves fewer pixels here, so the golden is the sensitive instrument, not the loose one.
 *
 * **Distinct glyphs per severity, unlike the tag's deliberate sameness.** The tag uses one glyph
 * everywhere so hue is the only variable. Here the glyph *is* half the WCAG 1.4.1 non-colour
 * channel, so its geometry is part of what needs pinning: `'Z'`-style garbage path data satisfies
 * the unit test's distinctness check while rendering nothing at all, and only a rendered capture
 * catches that.
 *
 * **The dismissible arm** carries the close button, so the 24px `--cae-target-min` floor and the
 * glyph's optical alignment are captured too — geometry the source-regex assertions cannot judge.
 */
import { Component } from '@angular/core';

import { CaeAlert } from './alert';
import { VR_ARMS, matchArm, renderArm, resetArm } from '../testing/vr';

@Component({
  imports: [CaeAlert],
  template: `
    <cae-alert severity="info" politeness="off">Scheduled maintenance runs Sunday.</cae-alert>
    <cae-alert severity="success" politeness="off">Workspace saved.</cae-alert>
    <cae-alert severity="warn" politeness="off">Two warehouses have not reported stock.</cae-alert>
    <cae-alert severity="danger" politeness="off">Payment failed — the card expired.</cae-alert>
    <cae-alert severity="danger" politeness="off" dismissible>Dismissible.</cae-alert>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--cae-space-3);
      inline-size: 24rem;
    }
  `,
})
class AlertVrHost {}

describe('CaeAlert (visual regression)', () => {
  afterEach(() => resetArm());

  for (const arm of VR_ARMS) {
    it(`renders every severity in the ${arm.name} arm`, async () => {
      const el = renderArm(AlertVrHost, arm);
      await matchArm(el, `alert-${arm.name}`);
    });
  }
});
