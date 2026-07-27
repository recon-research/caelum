/**
 * Visual-regression arms for `cae-input` (#732, provisional on #735).
 *
 * **Why the input is in the representative set.** Two token groups reach the screen nowhere else:
 *
 * 1. **`--cae-color-error`.** It is the only semantic colour with a *mandatory* contrast story
 *    (an error a user cannot read is an a11y defect, not a cosmetic one), and the errored arm here
 *    is the only golden that renders it. `--cae-color-warn`'s sibling defect is filed as #425.
 * 2. **`--cae-color-on-surface-variant`.** Label, placeholder and hint all take it, so this is the
 *    component that would notice it collapsing into `--cae-color-on-surface`.
 *
 * It is also the densest patch of *Material* chrome Caelum ships — the outline notch, the floating
 * label and the subscript row are all drawn from `--mat-sys-*`, which makes this spec the most
 * sensitive tripwire for a repeat of #736 (the theme bridge loading only half its properties). A
 * `cae-button` renders acceptably against a handful of missing properties; a form field does not.
 *
 * **The errored control is touched in the host constructor, and that timing is load-bearing.** The
 * error trigger is `invalid && (touched || submitted)`, so the control must be touched before the
 * capture. This spec used to touch it in `ngAfterViewInit` instead, because the constructor — the
 * obvious place — rendered an ordinary empty field with no red outline and no message, silently
 * vacating the one arm that witnesses `--cae-color-error`. That was #741, a real bridge defect and
 * not a fact about this spec: `ngDoCheck` ran before the subclass template bound
 * `[errorStateMatcher]`, so the inner control latched a `false` error state that nothing recomputed.
 * `CaeFormFieldControlBase` now recomputes once after the first render, so the pre-binding touch
 * sticks — and keeping it here means this golden also witnesses that fix, which is why the
 * workaround was removed rather than merely re-commented.
 */
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { CaeInput } from './input';
import { VR_ARMS, matchArm, renderArm, resetArm } from '../testing/vr';

@Component({
  imports: [CaeInput, ReactiveFormsModule],
  template: `
    <cae-input label="Filled value" [formControl]="filled" hint="We never share this." />
    <cae-input label="Empty with placeholder" placeholder="you@example.com" />
    <cae-input label="Required" required hint="Required fields carry an asterisk." />
    <cae-input label="Disabled" [formControl]="disabled" />
    <cae-input label="Errored" [formControl]="ctrl" [errorMessages]="messages" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--cae-space-2);
    }
  `,
})
class InputVrHost {
  readonly filled = new FormControl('user@example.com', { nonNullable: true });
  // Disabled via the *control*, not a `disabled` attribute: with `[formControl]` present the bare
  // attribute binds to `FormControlDirective`'s own `disabled` input (typed `boolean`) rather than
  // to the component's `booleanAttribute` one, which is a compile error and, in older Angular, a
  // runtime warning. The reactive path is also the one consumers are told to use.
  readonly disabled = new FormControl(
    { value: 'read only', disabled: true },
    { nonNullable: true },
  );
  readonly ctrl = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly messages: Record<string, string> = { required: 'Email is required' };

  constructor() {
    this.ctrl.markAsTouched();
  }
}

describe('CaeInput (visual regression)', () => {
  afterEach(() => resetArm());

  for (const arm of VR_ARMS) {
    it(`renders label, hint, disabled and error states in the ${arm.name} arm`, async () => {
      const el = renderArm(InputVrHost, arm);
      await matchArm(el, `input-${arm.name}`);
    });
  }
});
