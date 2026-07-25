/**
 * Visual-regression arms for `cae-card` (#732, provisional on #735).
 *
 * **Why the card is in the representative set.** It is the only shipped component that puts the
 * *surface ramp* on screen. `_tokens.scss` declares three surfaces — `--cae-surface-base`,
 * `--cae-surface-raised`, `--cae-surface-sunken` — whose whole job is to read as distinct layers,
 * and a card's three appearances (`filled` / `raised` / `outlined`) stack a raised surface on the
 * base one with `--cae-color-border` and `--cae-elevation-*` separating them. `cae-button` renders
 * elevation too, but on a 36px pill: a shadow token that regressed to `none` there is nearly
 * invisible, while here it is the only thing distinguishing `raised` from `filled`.
 *
 * The two text rows exist for the same reason — a card is where `--cae-color-on-surface` (title)
 * and `--cae-color-on-surface-variant` (subtitle) sit side by side on the *same* background, so a
 * regression that collapses the two into one colour shows up as the pair losing contrast with each
 * other rather than with the page.
 */
import { Component } from '@angular/core';

import { CaeCard, CaeCardAppearance } from './card';
import { VR_ARMS, matchArm, renderArm, resetArm } from '../testing/vr';

const APPEARANCES: readonly CaeCardAppearance[] = ['outlined', 'raised', 'filled'];

@Component({
  imports: [CaeCard],
  template: `
    @for (a of appearances; track a) {
      <cae-card [appearance]="a" [title]="a + ' card'" subtitle="Supporting line">
        Body copy on the card's own surface.
      </cae-card>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--cae-space-3);
    }
  `,
})
class CardVrHost {
  readonly appearances = APPEARANCES;
}

describe('CaeCard (visual regression)', () => {
  afterEach(() => resetArm());

  for (const arm of VR_ARMS) {
    it(`renders every appearance in the ${arm.name} arm`, async () => {
      const el = renderArm(CardVrHost, arm);
      await matchArm(el, `card-${arm.name}`);
    });
  }
});
