import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Directionality } from '@angular/cdk/bidi';

import { CaeIcon } from 'caelum/icon';

import { CaeRating } from './rating';

/** Access the compiled component styles (structural assertions jsdom can't measure by layout). */
const compiledStyles = (): string =>
  (CaeRating as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join('\n');

describe('CaeRating', () => {
  let fixture: ComponentFixture<CaeRating>;
  let component: CaeRating;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeRating] }).compileComponents();
    fixture = TestBed.createComponent(CaeRating);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  const stars = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="radio"]'));
  const groupEl = (): HTMLElement => fixture.nativeElement.querySelector('[role="radiogroup"]');
  const isOn = (i: number): boolean => stars()[i].classList.contains('cae-rating__star--on');
  const press = (el: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(ev);
    fixture.detectChanges();
    return ev;
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a radiogroup of `[stars]` role=radio stars (default 5)', () => {
    expect(groupEl().getAttribute('role')).toBe('radiogroup');
    expect(stars().length).toBe(5);
    fixture.componentRef.setInput('stars', 3);
    fixture.detectChanges();
    expect(stars().length).toBe(3);
  });

  it('degrades a NaN / < 1 star count to the default 5 rather than an empty group', () => {
    fixture.componentRef.setInput('stars', 0);
    fixture.detectChanges();
    expect(stars().length).toBe(5);
    fixture.componentRef.setInput('stars', Number.NaN);
    fixture.detectChanges();
    expect(stars().length).toBe(5);
  });

  it('names the group and each star for AT (aria-label, posinset/setsize)', () => {
    fixture.componentRef.setInput('ariaLabel', 'Overall rating');
    fixture.detectChanges();
    expect(groupEl().getAttribute('aria-label')).toBe('Overall rating');
    expect(stars()[0].getAttribute('aria-label')).toBe('1 star');
    expect(stars()[2].getAttribute('aria-label')).toBe('3 stars');
    expect(stars()[2].getAttribute('aria-posinset')).toBe('3');
    expect(stars().every((s) => s.getAttribute('aria-setsize') === '5')).toBe(true);
  });

  it('reflects a written value as exactly ONE checked radio, with cumulative visual fill (writeValue)', () => {
    component.writeValue(3);
    fixture.detectChanges();
    // Radio semantics: exactly one aria-checked=true (the 3rd), the rest false — never null.
    expect(stars().map((s) => s.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
    ]);
    // Visual magnitude is cumulative — stars 1..3 render "on".
    expect([0, 1, 2].every(isOn)).toBe(true);
    expect([3, 4].some(isOn)).toBe(false);
  });

  it('propagates a click selection back to the form as a number (registerOnChange)', () => {
    let latest: number | null | undefined;
    component.registerOnChange((v) => (latest = v));
    stars()[2].click();
    fixture.detectChanges();
    expect(latest).toBe(3);
    expect(typeof latest).toBe('number');
  });

  it('[allowCancel] clears to null when the active star is re-selected; otherwise re-select is a no-op', () => {
    let latest: number | null | undefined;
    component.registerOnChange((v) => (latest = v));

    // allowCancel OFF: re-selecting the active star keeps it.
    component.writeValue(3);
    stars()[2].click();
    fixture.detectChanges();
    expect(latest).toBe(3);

    // allowCancel ON: re-selecting the active star clears to null (genuinely reaches null).
    fixture.componentRef.setInput('allowCancel', true);
    component.writeValue(3);
    stars()[2].click();
    fixture.detectChanges();
    expect(latest).toBeNull();
    expect(stars().every((s) => s.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('clamps an out-of-range written value; 0 / negative / NaN mean "no rating" (null)', () => {
    component.writeValue(9); // > 5 stars → clamp to 5
    fixture.detectChanges();
    expect(stars()[4].getAttribute('aria-checked')).toBe('true');

    component.writeValue(3.6); // rounds to 4
    fixture.detectChanges();
    expect(stars()[3].getAttribute('aria-checked')).toBe('true');

    for (const empty of [0, -2, Number.NaN]) {
      component.writeValue(empty);
      fixture.detectChanges();
      expect(stars().every((s) => s.getAttribute('aria-checked') === 'false')).toBe(true);
    }
  });

  it('mirrors [invalid] onto aria-invalid and [required] onto aria-required', () => {
    expect(groupEl().getAttribute('aria-invalid')).toBeNull();
    expect(groupEl().getAttribute('aria-required')).toBeNull();
    fixture.componentRef.setInput('invalid', true);
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();
    expect(groupEl().getAttribute('aria-invalid')).toBe('true');
    expect(groupEl().getAttribute('aria-required')).toBe('true');
  });

  describe('disabled state', () => {
    it('removes every tab stop, is aria-disabled, and blocks click/keyboard (setDisabledState + [disabled])', () => {
      let latest: number | null | undefined;
      component.registerOnChange((v) => (latest = v));
      component.writeValue(2);

      for (const disable of [
        () => fixture.componentRef.setInput('disabled', true),
        () => {
          fixture.componentRef.setInput('disabled', false);
          component.setDisabledState(true);
        },
      ]) {
        latest = undefined;
        disable();
        fixture.detectChanges();
        expect(groupEl().getAttribute('aria-disabled')).toBe('true');
        // No tab stop anywhere — the control is out of the tab order entirely.
        expect(stars().every((s) => s.getAttribute('tabindex') === null)).toBe(true);
        stars()[4].click();
        press(stars()[1], 'ArrowRight');
        expect(latest).toBeUndefined(); // neither click nor key committed anything
      }
    });
  });

  describe('readonly state', () => {
    it('keeps a tab stop and stays announced, but ignores click/keyboard', () => {
      fixture.componentRef.setInput('readonly', true);
      component.writeValue(3);
      let latest: number | null | undefined;
      component.registerOnChange((v) => (latest = v));
      fixture.detectChanges();

      expect(groupEl().getAttribute('aria-readonly')).toBe('true');
      // Still focusable/announced: the selected star keeps its roving tab stop.
      expect(stars()[2].getAttribute('tabindex')).toBe('0');
      expect(stars()[2].getAttribute('aria-checked')).toBe('true');
      // But non-interactive.
      stars()[4].click();
      press(stars()[2], 'ArrowRight');
      expect(latest).toBeUndefined();
      expect(stars()[2].getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('keyboard model (attached to the DOM for real focus)', () => {
    beforeEach(() => document.body.appendChild(fixture.nativeElement));
    afterEach(() => fixture.nativeElement.remove());

    let latest: number | null | undefined;
    beforeEach(() => {
      latest = undefined;
      component.registerOnChange((v) => (latest = v));
    });

    it('roving tabindex puts the sole tab stop on the selected star (or the first when unset)', () => {
      // Unset → the first star is the tab stop.
      expect(stars().map((s) => s.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1']);
      component.writeValue(4);
      fixture.detectChanges();
      expect(stars().map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1', '0', '-1']);
    });

    it('Arrow keys move focus AND select, clamped at both ends (magnitude never wraps)', () => {
      component.writeValue(2);
      fixture.detectChanges();
      const ev = press(stars()[1], 'ArrowRight');
      expect(latest).toBe(3);
      expect(document.activeElement).toBe(stars()[2]);
      expect(ev.defaultPrevented).toBe(true);

      press(stars()[2], 'ArrowLeft');
      expect(latest).toBe(2);
      expect(document.activeElement).toBe(stars()[1]);

      // Clamp at the top.
      component.writeValue(5);
      fixture.detectChanges();
      press(stars()[4], 'ArrowRight');
      expect(latest).toBe(5);

      // Clamp at the bottom.
      component.writeValue(1);
      fixture.detectChanges();
      press(stars()[0], 'ArrowLeft');
      expect(latest).toBe(1);
    });

    it('Up/Down mirror Right/Left (a rating follows slider direction, Up = increase)', () => {
      component.writeValue(2);
      fixture.detectChanges();
      press(stars()[1], 'ArrowUp');
      expect(latest).toBe(3);
      press(stars()[2], 'ArrowDown');
      expect(latest).toBe(2);
    });

    it('Home / End jump to the first / last star', () => {
      component.writeValue(3);
      fixture.detectChanges();
      press(stars()[2], 'End');
      expect(latest).toBe(5);
      expect(document.activeElement).toBe(stars()[4]);
      press(stars()[4], 'Home');
      expect(latest).toBe(1);
      expect(document.activeElement).toBe(stars()[0]);
    });

    it('Space / Enter select the focused star; with allowCancel they toggle it to null', () => {
      // From unset, Space on the first (the tab stop) selects star 1.
      press(stars()[0], ' ');
      expect(latest).toBe(1);

      // With allowCancel, Space on the active star clears it.
      fixture.componentRef.setInput('allowCancel', true);
      component.writeValue(3);
      fixture.detectChanges();
      press(stars()[2], 'Enter');
      expect(latest).toBeNull();
    });

    it('leaves modifier chords (Ctrl/Meta/Alt/Shift) for the browser — no select, no preventDefault', () => {
      component.writeValue(3);
      fixture.detectChanges();
      const ev = press(stars()[2], 'ArrowRight', { ctrlKey: true });
      expect(latest).toBeUndefined();
      expect(ev.defaultPrevented).toBe(false);
    });
  });

  describe('RTL', () => {
    beforeEach(async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [CaeRating],
        providers: [
          { provide: Directionality, useValue: { value: 'rtl', change: { subscribe: () => {} } } },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(CaeRating);
      component = fixture.componentInstance;
      await fixture.whenStable();
    });

    it('flips ArrowLeft/ArrowRight so the arrows follow reading direction', () => {
      let latest: number | null | undefined;
      component.registerOnChange((v) => (latest = v));
      component.writeValue(3);
      fixture.detectChanges();
      press(stars()[2], 'ArrowRight'); // RTL: right = previous
      expect(latest).toBe(2);
      press(stars()[1], 'ArrowLeft'); // RTL: left = next
      expect(latest).toBe(3);
    });
  });

  describe('D-596 icon slots', () => {
    it('renders cae-icon glyphs for [icon]/[offIcon] (on vs off), falling back to [icon] when [offIcon] is unset', () => {
      fixture.componentRef.setInput('icon', 'user');
      fixture.componentRef.setInput('offIcon', 'folder');
      component.writeValue(2);
      fixture.detectChanges();

      const icons = fixture.debugElement.queryAll(By.directive(CaeIcon));
      expect(icons.length).toBe(5);
      // The built-in inline star is NOT drawn once a named glyph is supplied.
      expect(fixture.nativeElement.querySelector('.cae-rating__glyph')).toBeNull();
      // On stars (1..2) use [icon], off stars (3..5) use [offIcon].
      expect(icons[0].componentInstance.name()).toBe('user');
      expect(icons[2].componentInstance.name()).toBe('folder');

      // With no offIcon, off stars fall back to the on glyph.
      fixture.componentRef.setInput('offIcon', '');
      fixture.detectChanges();
      expect(icons[2].componentInstance.name()).toBe('user');
    });

    it('draws the built-in inline star by default (a solid/hollow SHAPE, not colour alone)', () => {
      component.writeValue(2);
      fixture.detectChanges();
      expect(fixture.debugElement.queryAll(By.directive(CaeIcon)).length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('.cae-rating__glyph').length).toBe(5);
      // The fill toggles with the on-state in the compiled styles — the WCAG 1.4.1 shape cue.
      // ([^{]* spans the emulated-encapsulation [_ngcontent-%COMP%] attrs + descendant whitespace.)
      expect(compiledStyles()).toMatch(
        /--on[^{]*\.cae-rating__glyph[^{]*\{\s*fill:\s*currentColor/,
      );
    });
  });

  describe('custom [iconTemplate] (D-596)', () => {
    @Component({
      imports: [CaeRating],
      template: `
        <cae-rating [iconTemplate]="tpl" ariaLabel="r" />
        <ng-template #tpl let-star>
          <i class="tpl-star" [attr.data-value]="star.value" [attr.data-active]="star.active"></i>
        </ng-template>
      `,
    })
    class Host {}

    it('overrides the glyph and passes each star its ordinal + active flag', () => {
      const host = TestBed.createComponent(Host);
      host.detectChanges();
      const rating = host.debugElement.query(By.directive(CaeRating))
        .componentInstance as CaeRating;
      rating.writeValue(2);
      host.detectChanges();

      const tplStars = Array.from(
        host.nativeElement.querySelectorAll('.tpl-star'),
      ) as HTMLElement[];
      expect(tplStars.length).toBe(5);
      // Neither the built-in star nor cae-icon is drawn when a template is supplied.
      expect(host.nativeElement.querySelector('.cae-rating__glyph')).toBeNull();
      expect(host.debugElement.queryAll(By.directive(CaeIcon)).length).toBe(0);
      // The context carries the 1-based ordinal and the active flag (on for 1..2).
      expect(tplStars.map((s) => s.getAttribute('data-value'))).toEqual(['1', '2', '3', '4', '5']);
      expect(tplStars.map((s) => s.getAttribute('data-active'))).toEqual([
        'true',
        'true',
        'false',
        'false',
        'false',
      ]);
    });
  });

  describe("hit-target floor (#663, WCAG 2.5.8) — structural, jsdom can't measure paint", () => {
    it('sizes each star with --cae-target-min, NEVER a --cae-space-* value', () => {
      const styles = compiledStyles();
      expect(styles).toMatch(/min-inline-size:\s*var\(--cae-target-min\)/);
      expect(styles).toMatch(/min-block-size:\s*var\(--cae-target-min\)/);
      // A spacing token shrinks under compact density → would fail the target-size floor the
      // density suite asserts (>=24px). Prove the min-size is not derived from --cae-space-*.
      expect(styles).not.toMatch(/min-(?:inline|block)-size:\s*var\(--cae-space/);
    });
  });

  it('the [hidden] host attribute beats the inline-flex display (the avatar #662 lesson)', () => {
    expect(compiledStyles()).toMatch(/\[hidden\][^{]*\{\s*display:\s*none/);
  });
});
