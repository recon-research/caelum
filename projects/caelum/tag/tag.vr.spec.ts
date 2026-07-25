/**
 * Visual-regression arms for `cae-tag` (#745, provisional on #735).
 *
 * **Why the tag earns a slot: it is the suite's only view of the status palette.** The original
 * five (#732) were chosen by token surface, and that selection missed one — `--cae-color-success`,
 * `-warn` and `-error` appear in none of them. Demonstrated, not assumed: #425 darkened two shipped
 * primitives (`--cae-amber-40`, `--cae-green-40`) and the whole suite stayed 20/20 green. A correct
 * result for those components, and a blind spot for the library.
 *
 * `cae-tag` closes it in one component: it renders all four severities, each as
 * `color-mix(<semantic> 24%, <surface>)` behind a neutral `--cae-color-on-surface` label, plus the
 * severity-coloured glyph. So a single capture per arm covers the whole status family *and* is the
 * only golden in the suite that exercises `color-mix` resolution at all.
 *
 * **The same glyph on every severity, on purpose.** Identical geometry across the five chips means
 * the only thing that can differ between them is hue — which is exactly the signal this spec is
 * for. A per-severity glyph would make a colour regression compete with a shape difference for the
 * reviewer's attention.
 *
 * **What each arm is actually sensitive to.** The light arms carry the load: the `*-40` primitives
 * are the light arm of each semantic token, and they are the ones with a contrast constraint to
 * violate (`theming/contrast.browser.spec.ts` holds the numeric bound; this holds the *rendered*
 * result). Measured by reverting `--cae-amber-40` to its pre-#425 `#b26a00`: both light arms fail,
 * both dark arms stay green — the dark arm reads `--cae-amber-80`, which the fix never touched.
 * That is the same independence the #732 goldens showed under a one-unit blue shift.
 */
import { Component } from '@angular/core';

import { CaeTag } from './tag';
import { VR_ARMS, matchArm, renderArm, resetArm } from '../testing/vr';

@Component({
  imports: [CaeTag],
  template: `
    <cae-tag value="Neutral" icon="file" />
    <cae-tag severity="success" value="Success" icon="file" />
    <cae-tag severity="info" value="Info" icon="file" />
    <cae-tag severity="warn" value="Warn" icon="file" />
    <cae-tag severity="danger" value="Danger" icon="file" />
    <cae-tag severity="warn" value="Rounded" icon="file" rounded />
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cae-space-2);
      align-items: flex-start;
    }
  `,
})
class TagVrHost {}

describe('CaeTag (visual regression)', () => {
  afterEach(() => resetArm());

  for (const arm of VR_ARMS) {
    it(`renders every severity in the ${arm.name} arm`, async () => {
      const el = renderArm(TagVrHost, arm);
      await matchArm(el, `tag-${arm.name}`);
    });
  }
});
