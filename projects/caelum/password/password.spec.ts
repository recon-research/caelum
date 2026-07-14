import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { CaePassword } from './password';

describe('CaePassword', () => {
  let component: CaePassword;
  let fixture: ComponentFixture<CaePassword>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaePassword] }).compileComponents();
    fixture = TestBed.createComponent(CaePassword);
    component = fixture.componentInstance;
    // A label is the normal case (accessible name for the field); set one so nothing is nameless.
    fixture.componentRef.setInput('label', 'Password');
    // Attach so `document.activeElement` reflects focus() (jsdom only focuses connected elements).
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  // --- helpers ---
  const input = (): HTMLInputElement => fixture.nativeElement.querySelector('input');
  const toggle = (): HTMLButtonElement | null =>
    fixture.nativeElement.querySelector('.cae-password__toggle');
  const bar = (): HTMLElement | null => fixture.nativeElement.querySelector('.cae-password__bar');
  // Returns just the strength WORD (strips the "Password strength: " context prefix the live region carries).
  const strengthText = (): string =>
    (
      fixture.nativeElement.querySelector('.cae-password__strength')?.textContent?.trim() ?? ''
    ).replace(/^Password strength:\s*/, '');
  const litSegments = (): number =>
    fixture.nativeElement.querySelectorAll('.cae-password__seg--on').length;
  const type = (value: string): void => {
    const el = input();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- Visibility toggle ---

  it('renders a password-type input by default', () => {
    expect(input().getAttribute('type')).toBe('password');
  });

  it('shows the visibility toggle by default and flips type + aria-pressed on click', () => {
    const btn = toggle()!;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(input().getAttribute('type')).toBe('password');

    btn.click();
    fixture.detectChanges();
    expect(input().getAttribute('type')).toBe('text');
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    btn.click();
    fixture.detectChanges();
    expect(input().getAttribute('type')).toBe('password');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('is a real button (type=button, never submits) with a constant accessible name', () => {
    const btn = toggle()!;
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('aria-label')).toBe('Show password');
    btn.click();
    fixture.detectChanges();
    // Name stays constant while aria-pressed carries the state (WAI-ARIA toggle-button pattern).
    expect(btn.getAttribute('aria-label')).toBe('Show password');
  });

  it('hides the toggle when [toggleMask]=false', () => {
    fixture.componentRef.setInput('toggleMask', false);
    fixture.detectChanges();
    expect(toggle()).toBeNull();
  });

  it('honours a custom toggleAriaLabel', () => {
    fixture.componentRef.setInput('toggleAriaLabel', 'Reveal secret');
    fixture.detectChanges();
    expect(toggle()!.getAttribute('aria-label')).toBe('Reveal secret');
  });

  // --- autocomplete ---

  it('defaults autocomplete to current-password and honours an override', () => {
    expect(input().getAttribute('autocomplete')).toBe('current-password');
    fixture.componentRef.setInput('autocomplete', 'new-password');
    fixture.detectChanges();
    expect(input().getAttribute('autocomplete')).toBe('new-password');
  });

  // --- CVA value round-trip ---

  it('writeValue reflects the model into the input (never re-emits)', () => {
    let emitted = 0;
    component.registerOnChange(() => emitted++);
    component.writeValue('hunter2');
    fixture.detectChanges();
    expect(input().value).toBe('hunter2');
    expect(emitted).toBe(0);
  });

  it('emits the raw typed string through the CVA — the model IS the password', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    type('s3cret!');
    expect(latest).toBe('s3cret!');
    expect(typeof latest).toBe('string');
  });

  it('marks touched on blur', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    input().dispatchEvent(new Event('blur', { bubbles: true }));
    expect(touched).toBe(true);
  });

  // --- Caps-Lock indicator (#312) ---

  const capsRegion = (): HTMLElement | null =>
    fixture.nativeElement.querySelector('.cae-password__capslock');
  const capsWarningOn = (): HTMLElement | null =>
    fixture.nativeElement.querySelector('.cae-password__capslock--on');
  const capsKey = (type: 'keydown' | 'keyup', capsLock: boolean): void => {
    input().dispatchEvent(
      new KeyboardEvent(type, { key: 'a', bubbles: true, modifierCapsLock: capsLock }),
    );
    fixture.detectChanges();
  };

  it('shows a politely-announced Caps-Lock warning when on, and clears it when off', () => {
    // The live region is always present (registered) so an SR reliably announces the on-transition;
    // while off it carries no text and no visual footprint.
    expect(capsRegion()?.getAttribute('role')).toBe('status');
    expect(capsWarningOn()).toBeNull();

    capsKey('keydown', true);
    expect(capsWarningOn()).not.toBeNull();
    expect(capsRegion()!.textContent?.trim()).toBe('Caps Lock is on');

    capsKey('keyup', false); // the keyup binding catches the Caps-Lock key's own release toggle
    expect(capsWarningOn()).toBeNull();
    expect(capsRegion()!.textContent?.trim()).toBe('');
  });

  it('clears the Caps-Lock warning on blur (the state is unknowable once unfocused)', () => {
    capsKey('keydown', true);
    expect(capsWarningOn()).not.toBeNull();
    input().dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();
    expect(capsWarningOn()).toBeNull();
  });

  it('suppresses the indicator entirely when [capsLockIndicator]=false', () => {
    fixture.componentRef.setInput('capsLockIndicator', false);
    fixture.detectChanges();
    capsKey('keydown', true);
    expect(capsRegion()).toBeNull(); // no live region at all — the feature is off
  });

  it('does not resurface a stale warning after the feature is toggled off then back on', () => {
    capsKey('keydown', true); // caps on → warning shown
    expect(capsWarningOn()).not.toBeNull();
    fixture.componentRef.setInput('capsLockIndicator', false); // disable: the effect resets capsLockOn
    fixture.detectChanges();
    fixture.componentRef.setInput('capsLockIndicator', true); // re-enable with NO fresh key event
    fixture.detectChanges();
    expect(capsWarningOn()).toBeNull(); // without the reset effect, the stale 'on' would reappear
  });

  it('honours a custom [capsLockLabel] for i18n', () => {
    fixture.componentRef.setInput('capsLockLabel', 'Feststelltaste aktiv');
    fixture.detectChanges();
    capsKey('keydown', true);
    expect(capsRegion()!.textContent?.trim()).toBe('Feststelltaste aktiv');
  });

  // --- Strength meter (advisory) ---

  it('shows no bar when the field is empty', () => {
    expect(bar()).toBeNull();
    expect(strengthText()).toBe('');
  });

  it('renders the bar with segments lit up to the score once typing starts', () => {
    type('abcdef1!'); // len 8, 3 classes → score 3
    expect(bar()).not.toBeNull();
    expect(bar()!.getAttribute('data-strength')).toBe('3');
    expect(litSegments()).toBe(3);
  });

  it('scores the local heuristic across representative passwords (advisory 0–4)', () => {
    // < 6 chars caps at weak however varied
    type('aB1!');
    expect(strengthText()).toBe('Weak');
    expect(bar()!.getAttribute('data-strength')).toBe('1');
    // 6 chars, single class → weak
    type('abcdef');
    expect(strengthText()).toBe('Weak');
    // 7 chars, two classes → fair
    type('abcde12');
    expect(strengthText()).toBe('Fair');
    // 8 chars, three classes → good
    type('Abcde123');
    expect(strengthText()).toBe('Good');
    // 12 chars, four classes → strong
    type('Abcdefg123!@');
    expect(strengthText()).toBe('Strong');
    expect(bar()!.getAttribute('data-strength')).toBe('4');
    expect(litSegments()).toBe(4);
  });

  it('honours custom strengthLabels (i18n)', () => {
    fixture.componentRef.setInput('strengthLabels', ['Faible', 'Moyen', 'Bon', 'Fort']);
    type('Abcdefg123!@'); // strong
    expect(strengthText()).toBe('Fort');
  });

  it('hides the meter entirely when [showStrength]=false', () => {
    fixture.componentRef.setInput('showStrength', false);
    type('Abcdefg123!@');
    expect(fixture.nativeElement.querySelector('.cae-password__meter')).toBeNull();
  });

  it('keeps a polite live region present (empty) so the first strength announces', () => {
    const region = fixture.nativeElement.querySelector('.cae-password__strength');
    expect(region).not.toBeNull();
    expect(region.getAttribute('role')).toBe('status');
    expect(region.textContent.trim()).toBe(''); // present-and-empty before typing
  });

  it('marks the bar decorative (aria-hidden) so strength is text, not colour-only (WCAG 1.4.1)', () => {
    type('Abcde123');
    expect(bar()!.getAttribute('aria-hidden')).toBe('true');
    expect(strengthText()).toBe('Good'); // meaning carried by text
  });

  it('prefixes the announced strength with context so it is not a bare, mistakable adjective', () => {
    type('Abcdefg123!@'); // strong
    const region = fixture.nativeElement.querySelector('.cae-password__strength');
    expect(region.textContent.trim()).toBe('Password strength: Strong');
  });

  // --- IME composition (family invariant; matters once revealed to type=text) ---

  it('buffers IME composition — no emit mid-composition, one emit on compositionend', () => {
    let latest: string | undefined;
    let emits = 0;
    component.registerOnChange((v) => {
      latest = v;
      emits++;
    });
    const el = input();
    el.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    el.value = 'ni';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(emits).toBe(0); // nothing committed mid-composition
    el.value = '你好';
    el.dispatchEvent(new Event('compositionend', { bubbles: true }));
    expect(emits).toBe(1);
    expect(latest).toBe('你好');
  });

  // --- visible-state coherence ---

  it('re-masks the field on a programmatic writeValue (never shows a written secret in plaintext)', () => {
    toggle()!.click(); // reveal
    fixture.detectChanges();
    expect(input().getAttribute('type')).toBe('text');
    component.writeValue('newSecret');
    fixture.detectChanges();
    expect(input().getAttribute('type')).toBe('password'); // re-masked
    expect(input().value).toBe('newSecret');
  });

  it('stays masked if the toggle is removed while revealed (never stranded as plaintext)', () => {
    toggle()!.click(); // reveal
    fixture.detectChanges();
    expect(input().getAttribute('type')).toBe('text');
    fixture.componentRef.setInput('toggleMask', false); // remove the only unmask control
    fixture.detectChanges();
    expect(toggle()).toBeNull();
    expect(input().getAttribute('type')).toBe('password'); // [type] is guarded by toggleMask()
  });

  it('does not flip visibility while disabled (the toggle is inert)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    toggle()!.click(); // a disabled button's click is a no-op
    fixture.detectChanges();
    expect(input().getAttribute('type')).toBe('password');
  });

  it('round-trips typing while revealed', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    toggle()!.click();
    fixture.detectChanges();
    type('visiblePass1');
    expect(latest).toBe('visiblePass1');
    expect(input().getAttribute('type')).toBe('text');
  });

  it('coerces a null writeValue to empty string', () => {
    component.writeValue(null as unknown as string);
    fixture.detectChanges();
    expect(input().value).toBe('');
  });

  // --- no-accessible-name dev-warn ---

  it('warns in dev when neither label nor ariaLabel gives an accessible name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bare = TestBed.createComponent(CaePassword); // no label / ariaLabel set
    bare.detectChanges(); // runs ngOnInit
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no accessible name'));
    warn.mockRestore();
    bare.destroy();
  });

  // --- never logs the value ---

  it('never logs the password value while typing or toggling', () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];
    type('topsecret');
    toggle()!.click();
    fixture.detectChanges();
    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        expect(call.join(' ')).not.toContain('topsecret');
      }
      spy.mockRestore();
    }
  });

  // --- label / a11y basics ---

  it('renders the label', () => {
    expect(fixture.nativeElement.querySelector('mat-label')?.textContent?.trim()).toBe('Password');
  });

  it('reflects required onto the inner input (aria-required)', () => {
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();
    expect(input().getAttribute('aria-required')).toBe('true');
  });

  // --- disabled ---

  it('disables the input and the toggle via the [disabled] input', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(input().disabled).toBe(true);
    expect(toggle()!.disabled).toBe(true);
  });

  it('disables via setDisabledState (reactive forms)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(input().disabled).toBe(true);
    expect(toggle()!.disabled).toBe(true);
  });
});

// --- Forms integration (host components) ---

@Component({
  standalone: true,
  imports: [CaePassword, ReactiveFormsModule],
  template: `<cae-password
    label="Password"
    [formControl]="control"
    [errorMessages]="{ minlength: 'At least 8 characters', pattern: 'Must contain a number' }"
  />`,
})
class PasswordHost {
  // The ENFORCED policy — min length AND a required digit. The advisory meter models neither exactly,
  // which is the point: they can diverge (Book 08 §3.5).
  readonly control = new FormControl('', {
    nonNullable: true,
    validators: [Validators.minLength(8), Validators.pattern(/\d/)],
  });
}

describe('CaePassword — forms integration', () => {
  let fixture: ComponentFixture<PasswordHost>;
  let host: PasswordHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PasswordHost] }).compileComponents();
    fixture = TestBed.createComponent(PasswordHost);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  const input = (): HTMLInputElement => fixture.nativeElement.querySelector('input');

  it('round-trips the value through a reactive FormControl', () => {
    host.control.setValue('correct horse');
    fixture.detectChanges();
    expect(input().value).toBe('correct horse');

    input().value = 'battery staple';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(host.control.value).toBe('battery staple');
  });

  it('surfaces the ENFORCED validator error via the inherited #29/#47 bridge', async () => {
    input().value = 'aB3$'; // 4 chars → fails minLength(8)
    input().dispatchEvent(new Event('input', { bubbles: true }));
    host.control.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.control.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('mat-error')?.textContent?.trim()).toBe(
      'At least 8 characters',
    );
  });

  it('advisory meter and the enforced rule can DIVERGE — the meter is a hint, the ValidatorFn is the gate', async () => {
    // 'Abcdefgh!@#' — 11 chars, 3 classes → the meter reads "Good", but there is no digit, so the
    // form's pattern rule (which the meter does NOT model) still blocks. This is the split (Book 08 §3.5):
    // a non-weak meter next to a still-invalid form, the error being about the digit, not "strength".
    input().value = 'Abcdefgh!@#';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    host.control.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // meter: "Good" (advisory, non-weak)
    expect(
      fixture.nativeElement.querySelector('.cae-password__bar')?.getAttribute('data-strength'),
    ).toBe('3');
    // enforced: still invalid, and the DIGIT error (not a strength thing) is what shows
    expect(host.control.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('mat-error')?.textContent?.trim()).toBe(
      'Must contain a number',
    );
  });
});
