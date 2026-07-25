/**
 * Real-browser verification for `cae-slider` (#405, was #110).
 *
 * **Why this component has the largest coverage hole in the sweep.** `slider.spec.ts` opens by
 * naming two things jsdom cannot do, both deferred here:
 *
 *  1. a synthetic `input` event does not make `MatSliderThumb` emit `valueChange`, so its "drag"
 *     fires the component's own output directly — the CVA glue is proven, but *nothing that
 *     produces the event* is;
 *  2. **range thumbs cannot reflect a bound `[value]` at all** (native range inputs default to 50
 *     and the two-thumb sibling clamp needs real geometry), so the range `writeValue` tests assert
 *     the component's internal signals rather than the rendered thumbs.
 *
 * Point 2 leaves a real gap: "does writing `[20, 60]` to the form actually put the thumbs at 20
 * and 60?" had never been checked anywhere. It was not an idle question — `writeValue` sets the
 * `start` then `end` signals, Angular updates the two `[value]` bindings in template order, and
 * Material pins each range input's `max`/`min` to its sibling, so the start thumb is assigned
 * while the end input still holds its *previous* value: the shape of a clamp bug.
 *
 * **Measured: it holds.** The clamp is real and live (the start thumb renders `max="60"`, asserted
 * below) but Material re-syncs the pair after both bindings land, so the reflection is correct.
 * Recorded because "we checked, and here is the mechanism that makes it safe" is worth more than
 * an untested assumption — and the assertion now fails if that re-sync ever regresses.
 *
 * Interaction here is driven by `userEvent` (Playwright), i.e. real key events delivered to the
 * focused element — not a dispatched `input`. That is the half `slider.spec.ts` had to stub.
 *
 * Run it: `npm run test:browser`.
 */
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { userEvent } from 'vitest/browser';

import { CaeSlider, CaeSliderValue } from './slider';
import { expectNoA11yViolations } from '../testing/a11y';
import { loadCaelumTheme, themeToken } from '../testing/theme';

/** The written range. Deliberately asymmetric and away from the 50 a bare range input defaults to. */
const WRITTEN: [number, number] = [20, 60];

@Component({
  imports: [CaeSlider, ReactiveFormsModule],
  template: `
    <cae-slider
      [formControl]="range"
      range
      startAriaLabel="Minimum price"
      endAriaLabel="Maximum price"
    />
    <cae-slider [formControl]="single" ariaLabel="Volume" />
  `,
  styles: `
    :host {
      display: block;
      width: 400px;
    }
  `,
})
class SliderHost {
  readonly range = new FormControl<CaeSliderValue | null>(WRITTEN);
  readonly single = new FormControl<CaeSliderValue | null>(42);
  readonly touched = signal(false);
}

describe('CaeSlider (real browser)', () => {
  let el: HTMLElement;
  let host: SliderHost;

  function render(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [SliderHost] });
    // MatSlider's track/thumb geometry is token-driven; without the theme the control has no
    // box to measure and axe judges unstyled colours (#724, PATTERNS §9).
    loadCaelumTheme();
    const fixture = TestBed.createComponent(SliderHost);
    fixture.detectChanges();
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
  }

  const startThumb = () => el.querySelector('input[matSliderStartThumb]') as HTMLInputElement;
  const endThumb = () => el.querySelector('input[matSliderEndThumb]') as HTMLInputElement;
  const singleThumb = () => el.querySelector('input[matSliderThumb]') as HTMLInputElement;

  beforeEach(() => render());

  afterEach(() => {
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  it('gives the slider real geometry, so the thumbs are positionable at all', () => {
    // The premise of every measurement below, and the #724 liveness guard.
    expect(themeToken('--cae-color-border')).not.toBe('');
    const track = el.querySelector('mat-slider') as HTMLElement;
    expect(track.getBoundingClientRect().width).toBeGreaterThan(0);
  });

  it('reflects a written range onto BOTH rendered thumbs', () => {
    // The claim jsdom could not make. If Material's sibling min/max clamp bites during the
    // template-order write, the start thumb lands somewhere other than 20 and this fails.
    expect(startThumb().value).toBe(String(WRITTEN[0]));
    expect(endThumb().value).toBe(String(WRITTEN[1]));
  });

  it('exposes the written range to assistive tech, not just as a DOM value', () => {
    // Material sets `aria-valuetext`, and `aria-valuenow` is deliberately ABSENT: a native
    // `<input type="range">` has an implicit `slider` role whose valuenow the browser derives
    // from the element's own value, so a hand-written attribute could only drift from it.
    // Pinned in both directions — a well-meaning "fix" adding aria-valuenow would fail here.
    expect(startThumb().getAttribute('aria-valuetext')).toBe(String(WRITTEN[0]));
    expect(endThumb().getAttribute('aria-valuetext')).toBe(String(WRITTEN[1]));
    expect(startThumb().hasAttribute('aria-valuenow')).toBe(false);
    // …and the sibling clamp is live: the start thumb's ceiling tracks the end thumb's value.
    // This is the mechanism that made a clamped write plausible; Material re-syncs it after
    // both bindings land, which is why the reflection above holds.
    expect(startThumb().max).toBe(String(WRITTEN[1]));
  });

  it('positions the thumbs in value order along the track', () => {
    // Geometry, not just attributes: 0 for everything under jsdom.
    const s = startThumb().getBoundingClientRect();
    const e = endThumb().getBoundingClientRect();
    expect(s.width).toBeGreaterThan(0);
    expect(e.left).toBeGreaterThan(s.left);
  });

  it('turns a real arrow-key press into a form update (the half jsdom had to stub)', async () => {
    endThumb().focus();
    expect(document.activeElement).toBe(endThumb());
    await userEvent.keyboard('{ArrowRight}');
    // A genuine key event → native range input → MatSliderThumb → valueChange → CVA onChange.
    expect(endThumb().value).toBe(String(WRITTEN[1] + 1));
    expect(host.range.value).toEqual([WRITTEN[0], WRITTEN[1] + 1]);
    // …and the screen-reader-visible value tracks the interaction, not just the model.
    expect(endThumb().getAttribute('aria-valuetext')).toBe(String(WRITTEN[1] + 1));
  });

  it('keeps the range coherent when a thumb is driven into its sibling', async () => {
    // Material enforces start <= end through the sibling clamp, which needs real geometry.
    // Walk the start thumb up past the end thumb and confirm it stops rather than crossing.
    startThumb().focus();
    for (let i = 0; i < WRITTEN[1] - WRITTEN[0] + 5; i++) {
      await userEvent.keyboard('{ArrowRight}');
    }
    const [start, end] = host.range.value as [number, number];
    expect(start).toBeLessThanOrEqual(end);
    expect(start).toBe(WRITTEN[1]);
  });

  it('reflects and updates a single-thumb value the same way', async () => {
    expect(singleThumb().value).toBe('42');
    singleThumb().focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(host.single.value).toBe(43);
  });

  it('has no axe violations, no rules disabled', async () => {
    // Each thumb is a native range input, so a missing accessible name is a 4.1.2 failure —
    // and in range mode the two names must be distinct. Both sliders are named here.
    await expectNoA11yViolations(el);
  });
});
