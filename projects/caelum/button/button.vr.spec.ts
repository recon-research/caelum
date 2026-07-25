/**
 * Visual-regression arms for `cae-button` (#732, provisional on #735).
 *
 * **Why the button is the first VR target.** It is the densest token surface in the smallest
 * component: all five variants exercise surface, container, outline, elevation and on-colour
 * tokens at once, and every one of them renders *text* — which makes this spec simultaneously the
 * measurement instrument for #735, since text rasterization is the thing most likely to differ
 * between a dev box and CI.
 *
 * Each arm is one golden. A token change that alters any of them fails here with a diff image,
 * which is the whole point: `axe` (#690/#691) sees contrast but not layout, and the
 * `*.browser.spec.ts` layer (#405) sees behaviour but not appearance.
 *
 * Run it: `npm run test:vr`. Update goldens deliberately: `npm run test:vr:update`.
 */
import { Component } from '@angular/core';

import { CaeButton, CaeButtonVariant } from './button';
import { VR_ARMS, matchArm, renderArm, resetArm } from '../testing/vr';

const VARIANTS: readonly CaeButtonVariant[] = ['filled', 'tonal', 'elevated', 'outlined', 'text'];

@Component({
  imports: [CaeButton],
  template: `
    <div class="row">
      @for (v of variants; track v) {
        <cae-button [variant]="v">{{ v }}</cae-button>
      }
    </div>
    <div class="row">
      @for (v of variants; track v) {
        <cae-button [variant]="v" disabled>{{ v }}</cae-button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cae-space-2);
      margin-block-end: var(--cae-space-3);
    }
    .row:last-child {
      margin-block-end: 0;
    }
  `,
})
class ButtonVrHost {
  readonly variants = VARIANTS;
}

describe('CaeButton (visual regression)', () => {
  afterEach(() => resetArm());

  for (const arm of VR_ARMS) {
    it(`renders every variant in the ${arm.name} arm`, async () => {
      const el = renderArm(ButtonVrHost, arm);
      await matchArm(el, `button-${arm.name}`);
    });
  }
});
