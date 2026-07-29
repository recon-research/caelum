/**
 * Visual-regression arms for `cae-panel` / `cae-fieldset` (#711, provisional on #735).
 *
 * **Why this pair earns a slot: the two states ARE the contract, and one of them is drawn by the
 * user agent.** A `<legend>` burns a gap through its `<fieldset>`'s border and sits *inside* it —
 * native rendering that no Caelum source assertion grades, and that the legend's own
 * `padding-inline` / `margin-inline-start` silently controls. Set either to zero and the legend
 * collides with the corner radius; nothing in the jsdom suite moves, because jsdom paints nothing
 * and `axe` has no opinion about it.
 *
 * The **collapsed arm** is the other half. The unit suite proves `[hidden]` lands on the content
 * region and that the toggle carries `aria-expanded` — but the *affordance* a sighted user reads is
 * the chevron's direction, and that comes from a single `transform: rotate(180deg)` rule keyed on a
 * class. Deleting that rule leaves every unit assertion passing (the class is still bound, the
 * attribute still flips) while the arrow points the wrong way in both states — a rendered capture
 * is the only oracle that sees it. These goldens also pin the direction *convention*: down when
 * collapsed, matching Material's expansion indicator and `p-panel`. The first cut of this slice had
 * it inverted, and only a review lens reading Material's compiled CSS caught it.
 *
 * Both components appear in one host so the goldens also pin the thing a migrator most needs to be
 * true: the two containers are visually consistent with each other at the same density.
 */
import { Component } from '@angular/core';

import { CaeFieldset } from './fieldset';
import { CaePanel, CaePanelHeader } from './panel';
import { VR_ARMS, matchArm, renderArm, resetArm } from '../testing/vr';

@Component({
  imports: [CaePanel, CaePanelHeader, CaeFieldset],
  template: `
    <cae-panel header="Shipping address">Plain, not toggleable.</cae-panel>

    <cae-panel header="Billing details" toggleable>Expanded — the chevron points up.</cae-panel>

    <cae-panel header="Payment history" toggleable [collapsed]="true">
      Collapsed — this body must not render, and the chevron points down.
    </cae-panel>

    <cae-panel toggleable>
      <h4 caePanelHeader>Projected heading</h4>
      A real heading in the header slot — the second reason CaePanelHeader exists, and previously
      pictured nowhere.
    </cae-panel>

    <cae-fieldset legend="Card details">Plain, not toggleable.</cae-fieldset>

    <cae-fieldset legend="Delivery options" toggleable>Expanded.</cae-fieldset>

    <cae-fieldset legend="Gift wrapping" toggleable [collapsed]="true">
      Collapsed — this body must not render.
    </cae-fieldset>
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
class PanelVrHost {}

describe('CaePanel / CaeFieldset (visual regression)', () => {
  afterEach(() => resetArm());

  for (const arm of VR_ARMS) {
    it(`renders both containers, expanded and collapsed, in the ${arm.name} arm`, async () => {
      const el = renderArm(PanelVrHost, arm);
      await matchArm(el, `panel-${arm.name}`);
    });
  }
});
