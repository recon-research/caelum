import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { CaeSlider } from './slider';

/**
 * MatSlider depends on real layout geometry (getBoundingClientRect / ResizeObserver / pointer
 * events) that jsdom stubs out. Two consequences shape these tests, and both are deferred to a
 * real-browser M4 check (#110):
 *  - a synthetic `input` event does NOT make MatSliderThumb emit `valueChange`, so a "drag" is
 *    exercised by firing the template's own `(valueChange)` output (the exact event a real drag
 *    would raise) — this proves the CVA glue (valueChange → onChange) end to end;
 *  - range thumbs can't reflect a bound `[value]` in jsdom (native range inputs default to 50 and
 *    the two-thumb sibling clamp needs real geometry), so the range `writeValue` tests assert the
 *    component's value state. Single-thumb `[value]` DOES reflect in jsdom, so that one is asserted
 *    against the rendered input.
 */
describe('CaeSlider', () => {
  let component: CaeSlider;
  let fixture: ComponentFixture<CaeSlider>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeSlider] }).compileComponents();
    fixture = TestBed.createComponent(CaeSlider);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  // Each thumb is a native <input> carrying a matSliderThumb directive — the selector attribute
  // stays in the DOM, so target each thumb by it.
  const singleThumb = (): HTMLInputElement =>
    fixture.nativeElement.querySelector('input[matSliderThumb]');
  const startThumb = (): HTMLInputElement =>
    fixture.nativeElement.querySelector('input[matSliderStartThumb]');
  const endThumb = (): HTMLInputElement =>
    fixture.nativeElement.querySelector('input[matSliderEndThumb]');

  // A user drag surfaces as the thumb's `valueChange` output; fire it directly (see the file note).
  const drag = (thumbSelector: string, value: number): void =>
    fixture.debugElement.query(By.css(thumbSelector)).triggerEventHandler('valueChange', value);

  it('should create as a single-thumb slider by default', () => {
    expect(component).toBeTruthy();
    expect(singleThumb()).not.toBeNull();
    expect(startThumb()).toBeNull();
  });

  it('reflects a value written by the form model (writeValue, single) on the rendered thumb', () => {
    component.writeValue(42);
    fixture.detectChanges();
    expect(singleThumb().value).toBe('42');
  });

  it('propagates a user drag back to the form (registerOnChange, single)', () => {
    let latest: unknown;
    component.registerOnChange((v) => (latest = v));
    drag('input[matSliderThumb]', 73);
    expect(latest).toBe(73);
  });

  it('marks touched on blur (registerOnTouched)', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    singleThumb().dispatchEvent(new FocusEvent('blur'));
    expect(touched).toBe(true);
  });

  it('disables via the form model (setDisabledState)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(singleThumb().disabled).toBe(true);
  });

  it('disables via the template input too (merged with the form model)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(singleThumb().disabled).toBe(true);
  });

  it('coerces a bare disabled attribute (booleanAttribute)', () => {
    fixture.componentRef.setInput('disabled', '');
    fixture.detectChanges();
    expect(component.disabled()).toBe(true);
    expect(singleThumb().disabled).toBe(true);
  });

  it('forwards min/max/step to the inner slider input', () => {
    fixture.componentRef.setInput('min', 10);
    fixture.componentRef.setInput('max', 20);
    fixture.componentRef.setInput('step', 2);
    fixture.detectChanges();
    expect(singleThumb().min).toBe('10');
    expect(singleThumb().max).toBe('20');
    expect(singleThumb().step).toBe('2');
  });

  it('names the thumb via ariaLabel (a range input needs an accessible name), absent by default', () => {
    // No dangling empty attribute when unset.
    expect(singleThumb().getAttribute('aria-label')).toBeNull();
    fixture.componentRef.setInput('ariaLabel', 'Seats');
    fixture.detectChanges();
    expect(singleThumb().getAttribute('aria-label')).toBe('Seats');
  });

  it('forwards ariaLabelledby to the thumb', () => {
    expect(singleThumb().getAttribute('aria-labelledby')).toBeNull();
    fixture.componentRef.setInput('ariaLabelledby', 'seats-label');
    fixture.detectChanges();
    expect(singleThumb().getAttribute('aria-labelledby')).toBe('seats-label');
  });

  it('forwards ariaDescribedby to the thumb (the consumer-error a11y hook, #47)', () => {
    expect(singleThumb().getAttribute('aria-describedby')).toBeNull();
    fixture.componentRef.setInput('ariaDescribedby', 'seats-error');
    fixture.detectChanges();
    expect(singleThumb().getAttribute('aria-describedby')).toBe('seats-error');
  });

  it('falls back to min on a null (reset) value (single)', () => {
    component.writeValue(50);
    fixture.detectChanges();
    expect(singleThumb().value).toBe('50');
    component.writeValue(null);
    fixture.detectChanges();
    expect(singleThumb().value).toBe('0'); // min default
  });

  it('does not echo onChange when the form writes a value (the CVA no-echo invariant)', () => {
    let calls = 0;
    component.registerOnChange(() => calls++);
    component.writeValue(30);
    fixture.detectChanges();
    // A model write must NOT dirty the form — onChange fires only from user input, never writeValue.
    expect(calls).toBe(0);
  });

  it('stays disabled while EITHER the template input OR the form model disables it', () => {
    fixture.componentRef.setInput('disabled', true);
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(singleThumb().disabled).toBe(true);
    // Clearing only the form-model source leaves the template disable in force (OR-merge).
    component.setDisabledState(false);
    fixture.detectChanges();
    expect(singleThumb().disabled).toBe(true);
    // Clearing both re-enables.
    fixture.componentRef.setInput('disabled', false);
    fixture.detectChanges();
    expect(singleThumb().disabled).toBe(false);
  });

  describe('range mode', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('range', true);
      fixture.detectChanges();
    });

    it('renders two thumbs (start + end), not the single thumb', () => {
      expect(startThumb()).not.toBeNull();
      expect(endThumb()).not.toBeNull();
      expect(singleThumb()).toBeNull();
    });

    it('takes a [start, end] pair from the form model (writeValue)', () => {
      component.writeValue([20, 80]);
      // The value state the template binds to each thumb's [value] (rendered positions verified in a
      // real browser, #110 — jsdom range inputs can't reflect a bound value).
      expect(component['start']()).toBe(20);
      expect(component['end']()).toBe(80);
    });

    it('emits a [start, end] pair when a thumb is dragged (view → model)', () => {
      component.writeValue([20, 80]);
      let latest: unknown;
      component.registerOnChange((v) => (latest = v));
      drag('input[matSliderEndThumb]', 60);
      expect(latest).toEqual([20, 60]);
    });

    it('falls back to the full [min, max] span for a null (reset) value', () => {
      component.writeValue(null);
      expect(component['start']()).toBe(0); // min default
      expect(component['end']()).toBe(100); // max default
    });

    it('names the two thumbs distinctly via startAriaLabel / endAriaLabel', () => {
      fixture.componentRef.setInput('startAriaLabel', 'Minimum');
      fixture.componentRef.setInput('endAriaLabel', 'Maximum');
      fixture.detectChanges();
      expect(startThumb().getAttribute('aria-label')).toBe('Minimum');
      expect(endThumb().getAttribute('aria-label')).toBe('Maximum');
    });

    it('falls back to ariaLabel when a per-thumb label is not given', () => {
      fixture.componentRef.setInput('ariaLabel', 'Budget');
      fixture.detectChanges();
      expect(startThumb().getAttribute('aria-label')).toBe('Budget');
      expect(endThumb().getAttribute('aria-label')).toBe('Budget');
    });

    it('forwards a shared ariaDescribedby onto both thumbs (consumer-error hook, #47)', () => {
      expect(startThumb().getAttribute('aria-describedby')).toBeNull();
      expect(endThumb().getAttribute('aria-describedby')).toBeNull();
      fixture.componentRef.setInput('ariaDescribedby', 'budget-error');
      fixture.detectChanges();
      expect(startThumb().getAttribute('aria-describedby')).toBe('budget-error');
      expect(endThumb().getAttribute('aria-describedby')).toBe('budget-error');
    });

    it('names both thumbs from a shared ariaLabelledby, but suppresses it once a thumb has its own aria-label (no silent override, #111)', () => {
      // With only a shared labelledby, both thumbs fall back to it (ambiguous but named).
      fixture.componentRef.setInput('ariaLabelledby', 'budget-label');
      fixture.detectChanges();
      expect(startThumb().getAttribute('aria-labelledby')).toBe('budget-label');
      expect(endThumb().getAttribute('aria-labelledby')).toBe('budget-label');
      // Adding per-thumb aria-labels drops the labelledby so the distinct names win — ARIA ranks
      // aria-labelledby above aria-label, so forwarding both would clobber the per-thumb names.
      fixture.componentRef.setInput('startAriaLabel', 'Minimum');
      fixture.componentRef.setInput('endAriaLabel', 'Maximum');
      fixture.detectChanges();
      expect(startThumb().getAttribute('aria-label')).toBe('Minimum');
      expect(startThumb().getAttribute('aria-labelledby')).toBeNull();
      expect(endThumb().getAttribute('aria-label')).toBe('Maximum');
      expect(endThumb().getAttribute('aria-labelledby')).toBeNull();
    });
  });
});
