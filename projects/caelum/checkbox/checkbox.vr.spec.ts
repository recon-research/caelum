/**
 * Visual-regression arms for `cae-checkbox` (#732, provisional on #735).
 *
 * **Why the checkbox is in the representative set — and it is the odd one out.** Every other
 * component here proves the density tokens *do* something: the compact arm must visibly tighten.
 * This one guards the opposite claim. `--cae-target-min` is declared **density-invariant** on
 * purpose (`_tokens.scss`: WCAG 2.5.8 Target Size, 24x24 CSS px), so a control that floors its hit
 * target on it must come out the *same height* in both arms while its neighbours shrink around it.
 *
 * That makes this the only golden in the suite whose comfortable and compact captures are expected
 * to agree on the control's own box — and the reason it earns a slot: a "tighten everything"
 * regression is invisible in a suite where tightening is always correct. **Measured on these
 * goldens:** the checked glyph is 18px tall in both arms, while the capture as a whole goes 264px →
 * 216px. The box holds; only the space around it moves. The two arms are therefore not identical
 * images, and a regression that let the control shrink with the scale would break the first half of
 * that sentence while leaving the second half looking perfectly normal.
 *
 * **`cae-radio` is deliberately excluded.** It draws a circle where this draws a square, but it
 * reads the identical token set through the identical Material seam, so its goldens would restate
 * this one's at the cost of four more images to review. The representative set is chosen by token
 * surface, not by component count (#732); a radio-specific regression that this spec could not see
 * would have to be a Material shape bug, which is not what this instrument is for.
 */
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { CaeCheckbox } from './checkbox';
import { VR_ARMS, matchArm, renderArm, resetArm } from '../testing/vr';

@Component({
  imports: [CaeCheckbox, ReactiveFormsModule],
  template: `
    <cae-checkbox [formControl]="unchecked">Unchecked</cae-checkbox>
    <cae-checkbox [formControl]="checked">Checked</cae-checkbox>
    <cae-checkbox [formControl]="disabledChecked">Disabled, checked</cae-checkbox>
    <cae-checkbox [formControl]="disabledUnchecked">Disabled, unchecked</cae-checkbox>
    <cae-checkbox [formControl]="labelled" labelPosition="before">Label before</cae-checkbox>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--cae-space-2);
      align-items: flex-start;
    }
  `,
})
class CheckboxVrHost {
  readonly unchecked = new FormControl(false, { nonNullable: true });
  readonly checked = new FormControl(true, { nonNullable: true });
  readonly labelled = new FormControl(true, { nonNullable: true });
  // Disabled via the *control*: with `[formControl]` present, a bare `disabled` attribute binds to
  // `FormControlDirective`'s own `disabled` input (typed `boolean`), not the component's
  // `booleanAttribute` one — a compile error, and the reactive path is the supported one anyway.
  readonly disabledChecked = new FormControl(
    { value: true, disabled: true },
    { nonNullable: true },
  );
  readonly disabledUnchecked = new FormControl(
    { value: false, disabled: true },
    { nonNullable: true },
  );
}

describe('CaeCheckbox (visual regression)', () => {
  afterEach(() => resetArm());

  for (const arm of VR_ARMS) {
    it(`renders every selection state in the ${arm.name} arm`, async () => {
      const el = renderArm(CheckboxVrHost, arm);
      await matchArm(el, `checkbox-${arm.name}`);
    });
  }
});
