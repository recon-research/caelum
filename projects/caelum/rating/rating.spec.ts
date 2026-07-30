import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Directionality } from '@angular/cdk/bidi';

import { CaeIcon } from '@recon-research/caelum/icon';

import { CaeRating } from './rating';
import { expectNoA11yViolations } from '../testing/a11y';

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

  it('has no axe violations (named via ariaLabel)', async () => {
    fixture.componentRef.setInput('ariaLabel', 'Overall rating');
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  // #773 restated: a one-shot sweep of the pristine, unrated, enabled, valid, default-glyph state
  // grades the one state the contract mostly ISN'T in. Both #823 reviewers checked the installed axe
  // role tables and confirmed these arms pass today — so this closes an oracle gap, not a live
  // violation, and it is the assertion that would catch one arriving later.
  it.each([
    ['rated', () => component.writeValue(3)],
    ['disabled', () => fixture.componentRef.setInput('disabled', true)],
    ['readonly', () => fixture.componentRef.setInput('readonly', true)],
    [
      'invalid + required',
      () => {
        fixture.componentRef.setInput('invalid', true);
        fixture.componentRef.setInput('required', true);
      },
    ],
    [
      'named glyphs',
      () => {
        fixture.componentRef.setInput('icon', 'user');
        component.writeValue(2);
      },
    ],
  ])('has no axe violations when %s', async (_label, arrange) => {
    fixture.componentRef.setInput('ariaLabel', 'Overall rating');
    arrange();
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoA11yViolations(fixture.nativeElement);
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

    // allowCancel OFF: re-selecting the active star is a genuine no-op — no emit at all.
    // This assertion used to read `expect(latest).toBe(3)` under that very title, which PROVED the
    // opposite: `latest` starts undefined and writeValue correctly never emits, so a passing
    // `toBe(3)` could only mean the click had fired onChange, dirtying a pristine form with an
    // unchanged value (#823). Native radios and mat-radio-group emit nothing here.
    component.writeValue(3);
    fixture.detectChanges();
    stars()[2].click();
    fixture.detectChanges();
    expect(latest).toBeUndefined();
    // ...and the value is retained rather than silently cleared.
    expect(stars()[2].getAttribute('aria-checked')).toBe('true');

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

  it('keeps a reachable tab stop and a coherent a11y tree when [stars] shrinks below the value', () => {
    // The ordinary `<cae-rating [stars]="config().starCount" [formControl]="ctrl">` shape: the saved
    // rating arrives before an async star count settles.
    component.writeValue(5);
    fixture.detectChanges();
    fixture.componentRef.setInput('stars', 3);
    fixture.detectChanges();

    // WCAG 2.1.1 — the roving tab stop pointed at ordinal 5, which no longer renders, so every
    // remaining star was tabindex="-1" and the enabled control could not be reached by Tab at all.
    expect(stars().map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    // WCAG 1.3.1 — aria-checked was false on every star (the a11y tree said "nothing selected")
    // while displayValue still painted all three filled.
    expect(stars().map((s) => s.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect([0, 1, 2].every(isOn)).toBe(true);
    // Otherwise a hardcoded setsize of 5 survives — AT would announce "3 of 5" on a 3-star group.
    expect(stars().every((s) => s.getAttribute('aria-setsize') === '3')).toBe(true);
  });

  it.each([['readonly'], ['disabled']])(
    'drops the hover preview when the control becomes %s',
    (input) => {
      component.writeValue(1);
      fixture.detectChanges();
      stars()[3].dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      expect([0, 1, 2, 3].every(isOn)).toBe(true); // the preview paints 4

      // Both arms: gating the hover on only ONE of the two flags otherwise survives.
      fixture.componentRef.setInput(input, true);
      fixture.detectChanges();
      expect(isOn(0)).toBe(true);
      expect([1, 2, 3].some(isOn)).toBe(false);
      expect(stars()[0].getAttribute('aria-checked')).toBe('true');
    },
  );

  it('clears the hover preview on mouseleave — the premise the gate test rests on', () => {
    // Asserted explicitly because the test above documents "hoverValue is cleared only by the
    // GROUP's mouseleave" as its rationale, and deleting that binding otherwise kills no test.
    component.writeValue(1);
    fixture.detectChanges();
    stars()[3].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect([0, 1, 2, 3].every(isOn)).toBe(true);

    groupEl().dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(isOn(0)).toBe(true);
    expect([1, 2, 3].some(isOn)).toBe(false);
  });

  it('reports touched on focusout — the seam a consumer binds [invalid] through', () => {
    // Zero coverage before #823: deleting `(focusout)="onTouched()"` killed no test, while Forge
    // binds [invalid]="rating.invalid && rating.touched" — a dead onTouched means a required rating
    // never surfaces its error (the #741 defect class).
    let touched = 0;
    component.registerOnTouched(() => touched++);
    fixture.detectChanges();
    groupEl().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(touched).toBe(1);
  });

  describe('writeValue reconciles the form with what the widget can show (#823)', () => {
    it.each([
      ['fractional, rounding up', 3.6, 4],
      ['fractional, rounding down', 3.2, 3],
      ['zero — which Validators.required would otherwise accept', 0, null],
      ['NaN — which === cannot compare, so the guard must use Object.is', Number.NaN, null],
      ['a numeric string, the everyday JSON shape', '3' as unknown as number, 3],
      ['genuine junk', 'abc' as unknown as number, null],
    ])('echoes the normalised value back to the form: %s', async (_label, written, expected) => {
      let latest: number | null | undefined;
      component.registerOnChange((v) => (latest = v));

      component.writeValue(written);
      fixture.detectChanges();
      // Deferred on purpose: Angular's setUpControl calls writeValue BEFORE registerOnChange, so a
      // synchronous echo would be swallowed on the initial bind and would re-enter the form on a
      // later patchValue.
      expect(latest).toBeUndefined();

      await fixture.whenStable();
      expect(latest).toBe(expected);
    });

    it('reads onChange when the microtask RUNS, not when the write happened (setUpControl order)', async () => {
      // The arms above register the callback first, which is the OPPOSITE of Angular's real order:
      // `setUpControl` calls writeValue and only then registerOnChange. An implementation that
      // captured `onChangeFn` at write time would pass every arm above and silently swallow the echo
      // on every initial bind — the exact defect the deferral exists to prevent.
      component.writeValue(0);
      fixture.detectChanges();
      let latest: number | null | undefined;
      component.registerOnChange((v) => (latest = v));

      await fixture.whenStable();
      expect(latest).toBeNull();
    });

    it.each([
      ['a value it can honour', 3],
      ['an out-of-range value, which [stars] may still grow to fit', 9],
      ['undefined, the uninitialised [(ngModel)] shape', undefined as unknown as number],
      ['null', null],
    ])('stays silent for %s, so a pristine form is never dirtied', async (_label, written) => {
      let calls = 0;
      component.registerOnChange(() => calls++);
      component.writeValue(written);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(calls).toBe(0);
    });

    it('preserves an out-of-range value instead of destroying it when [stars] has not settled', async () => {
      // The data-loss shape: `[stars]="cfg()?.max ?? 0"` degrades to 5 while the config loads. An
      // echo that clamped would rewrite the saved 8 to 5, and the user's rating would be gone by the
      // time the real count arrived.
      let latest: number | null | undefined;
      component.registerOnChange((v) => (latest = v));
      component.writeValue(8);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(latest).toBeUndefined(); // nothing written back
      expect(stars()[4].getAttribute('aria-checked')).toBe('true'); // displayed clamped to 5 of 5

      // ...and once the real count arrives, the original value is intact and renders in full.
      fixture.componentRef.setInput('stars', 10);
      fixture.detectChanges();
      expect(stars().length).toBe(10);
      expect(stars()[7].getAttribute('aria-checked')).toBe('true');
    });

    it('only the LATEST write may correct the form (supersession guard)', async () => {
      let latest: number | null | undefined;
      component.registerOnChange((v) => (latest = v));
      component.writeValue(0); // queues an echo of null
      component.writeValue(3); // supersedes it before the microtask drains
      fixture.detectChanges();
      await fixture.whenStable();
      // Without the guard the stale echo lands on a form that now legitimately holds 3.
      expect(latest).toBeUndefined();
      expect(stars()[2].getAttribute('aria-checked')).toBe('true');
    });
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
        // ...and no internal state moved either. Asserting only the emit would pass an
        // implementation that guarded the callback but still repainted and moved aria-checked.
        expect(stars().map((s) => s.getAttribute('aria-checked'))).toEqual([
          'false',
          'true',
          'false',
          'false',
          'false',
        ]);
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

    it('still swallows the keys it owns, so a focused readonly widget does not scroll the page', () => {
      fixture.componentRef.setInput('readonly', true);
      component.writeValue(3);
      fixture.detectChanges();

      // Readonly keeps its tab stop (a screen reader must be able to focus and read the value), so
      // these keys land inside a focused widget that will not act on them — and used to fall through
      // to the browser's default scroll.
      // Driven from the full owned-key set, not a sample: dropping any ONE key from SCROLL_KEYS
      // (ArrowDown is the most damaging) otherwise survives the suite.
      for (const key of [
        ' ',
        'Spacebar',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
      ]) {
        expect(press(stars()[2], key).defaultPrevented).toBe(true);
      }
      // Enter is deliberately left alone — it belongs to the surrounding form.
      expect(press(stars()[2], 'Enter').defaultPrevented).toBe(false);
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

      // Clamp at the top. The target equals the current value, so nothing is emitted — an arrow held
      // at the boundary used to fire once per key repeat, dirtying the form on every tick. A broken
      // clamp is still caught: it would emit 6 and fail `toBeUndefined()`.
      component.writeValue(5);
      fixture.detectChanges();
      latest = undefined;
      press(stars()[4], 'ArrowRight');
      expect(latest).toBeUndefined();
      expect(stars()[4].getAttribute('aria-checked')).toBe('true');
      expect(document.activeElement).toBe(stars()[4]);

      // Clamp at the bottom.
      component.writeValue(1);
      fixture.detectChanges();
      latest = undefined;
      const ev2 = press(stars()[0], 'ArrowLeft');
      expect(latest).toBeUndefined();
      expect(stars()[0].getAttribute('aria-checked')).toBe('true');
      // Positive witnesses: without these, a handler that returned immediately (no clamp, no focus,
      // no preventDefault) would satisfy both assertions above from the state writeValue already left.
      expect(document.activeElement).toBe(stars()[0]);
      expect(ev2.defaultPrevented).toBe(true);
    });

    it('arrows step from the FOCUSED star, not from the current value', () => {
      // Every other arrow test presses on the star that already equals the value, so
      // `current = effectiveValue() ?? ordinal` — a partial revert of the HIGH1 fix — is
      // indistinguishable there. This is the arrow twin of the Space test below, and it is the shape
      // an AT virtual cursor or a programmatic focus() produces.
      component.writeValue(3);
      fixture.detectChanges();
      stars()[0].focus();

      press(stars()[0], 'ArrowRight');
      expect(latest).toBe(2);
      expect(document.activeElement).toBe(stars()[1]);
    });

    it('keeps a live tab stop when [stars] degrades to the default (End must clamp to the RENDERED count)', () => {
      // `[stars]="items().length"` with an empty async array: starList() degrades to 5 rendered
      // stars, but a handler reading `stars()` directly would compute n = 0 → End emits 0 →
      // focusOrdinal 0 → NO star carries tabindex="0". That is #823's HIGH2 through a second door.
      fixture.componentRef.setInput('stars', 0);
      fixture.detectChanges();
      expect(stars().length).toBe(5);

      press(stars()[2], 'End');
      expect(latest).toBe(5);
      expect(stars()[4].getAttribute('tabindex')).toBe('0');
    });

    it('restores focus when a [stars] shrink destroys the focused star', () => {
      component.writeValue(5);
      fixture.detectChanges();
      stars()[4].focus();
      expect(document.activeElement).toBe(stars()[4]);

      fixture.componentRef.setInput('stars', 3);
      fixture.detectChanges();
      // @for destroys the node, so the browser drops focus to <body>; fixing the tabindex alone left
      // the user's next Tab restarting from the top of the document.
      expect(document.activeElement).toBe(stars()[2]);
    });

    it('Space activates the FOCUSED star, not the current value (APG radio semantics)', () => {
      component.writeValue(3);
      fixture.detectChanges();
      stars()[0].focus();

      // The keyboard model used to reconstruct its position as `value() ?? 1`, so Space here
      // re-selected 3 and no keystroke could ever reach a LOWER star.
      press(stars()[0], ' ');
      expect(latest).toBe(1);
      expect(stars()[0].getAttribute('aria-checked')).toBe('true');
      expect(document.activeElement).toBe(stars()[0]);
    });

    it('[allowCancel] toggles the focused star without migrating the tab stop away from it', () => {
      fixture.componentRef.setInput('allowCancel', true);
      component.writeValue(3);
      fixture.detectChanges();
      stars()[2].focus();

      press(stars()[2], ' '); // cancel
      expect(latest).toBeNull();
      expect(document.activeElement).toBe(stars()[2]);

      // Pressing again on the SAME star must re-select 3. Once the value was null the old model read
      // `null ?? 1`, so the tab stop silently moved to star 1 while DOM focus stayed on star 3 — and
      // this keystroke wrote 1 and yanked focus across the group with it.
      press(stars()[2], ' ');
      expect(latest).toBe(3);
      expect(document.activeElement).toBe(stars()[2]);
    });

    it('arrows stay in range after [stars] shrinks below the value', () => {
      component.writeValue(5);
      fixture.detectChanges();
      fixture.componentRef.setInput('stars', 3);
      fixture.detectChanges();
      latest = undefined;

      // Stepping down from the clamped position must land on 2, not on 4 — the old model computed
      // from the raw value 5, emitting 4 (still out of range on a 3-star group) while its
      // `focusStar(3)` was a silent no-op on an element that no longer exists.
      press(stars()[2], 'ArrowLeft');
      expect(latest).toBe(2);
      expect(document.activeElement).toBe(stars()[1]);
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
      const spaceEv = press(stars()[0], ' ');
      expect(latest).toBe(1);
      // Space is consumed (it would otherwise scroll); Enter is NOT, because implicit form
      // submission belongs to the form. Consuming Enter here made the same key behave differently
      // depending on [readonly], which the readonly test pins from the other side.
      expect(spaceEv.defaultPrevented).toBe(true);
      expect(press(stars()[1], 'Enter').defaultPrevented).toBe(false);
      expect(latest).toBe(2);

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
      for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'] as const) {
        const ev = press(stars()[2], 'ArrowRight', { [mod]: true });
        expect(latest).toBeUndefined();
        expect(ev.defaultPrevented).toBe(false);
      }
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

      // With no offIcon, off stars fall back to the on glyph — i.e. BOTH states draw the same glyph.
      // This assertion used to stand alone, which certified a WCAG 1.4.1 violation as intended
      // behaviour: with one glyph and no fill available (cae-icon is stroke-only, D-596), colour was
      // the only remaining difference. It is safe now only because the scale cue below carries the
      // shape half — so the two assertions have to travel together (#823).
      fixture.componentRef.setInput('offIcon', '');
      fixture.detectChanges();
      expect(icons[2].componentInstance.name()).toBe('user');

      const styles = compiledStyles();
      // The cue is a DASHED outline — absolute, so a single glyph seen alone reads as "not filled".
      // A size delta alone is relative and says nothing in the all-off (unrated) or all-on states,
      // which is where a rating spends most of its life.
      expect(styles).toMatch(/\.cae-rating__icon--one-glyph[^{]*\{[^}]*stroke-dasharray:\s*[\d.]/);
      expect(styles).toMatch(
        /--on[^{]*\.cae-rating__icon--one-glyph[^{]*\{[^}]*stroke-dasharray:\s*none/,
      );
      // The scale is a secondary cue; assert its MAGNITUDE, not merely that a scale() is declared —
      // `scale(1)` would satisfy a shape-only regex while restoring the colour-only violation.
      const scale = /\.cae-rating__icon--one-glyph[^{]*\{[^}]*transform:\s*scale\(([\d.]+)\)/.exec(
        styles,
      );
      expect(Number(scale?.[1])).toBeLessThanOrEqual(0.85);
    });

    it('leaves a consumer who supplied BOTH glyphs alone — they already have a shape cue', () => {
      fixture.componentRef.setInput('icon', 'user');
      fixture.componentRef.setInput('offIcon', 'folder');
      component.writeValue(2);
      fixture.detectChanges();

      // The cue class is only applied when one glyph serves both states. Applying it unconditionally
      // would silently override the consumer's own design with a dashed, shrunken off icon.
      const icons = fixture.nativeElement.querySelectorAll('.cae-rating__icon');
      expect(
        Array.from(icons).some((i) =>
          (i as Element).classList.contains('cae-rating__icon--one-glyph'),
        ),
      ).toBe(false);

      fixture.componentRef.setInput('offIcon', '');
      fixture.detectChanges();
      const gated = fixture.nativeElement.querySelectorAll('.cae-rating__icon--one-glyph');
      expect(gated.length).toBe(5);
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
      // The OFF half, which the on-state regex above cannot see. Delete `fill: none` and SVG's
      // initial fill (black) applies: every star renders solid, on/off collapses to colour alone,
      // and the assertion above still matches — the shape cue has to be pinned from both ends.
      expect(compiledStyles()).toMatch(/\.cae-rating__glyph[^{]*\{[^}]*fill:\s*none/);
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
