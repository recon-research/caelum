import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  isDevMode,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput, MatInputModule } from '@angular/material/input';
import { CaeFormFieldControlBase } from 'caelum/form-field';

/**
 * The four strength labels, weakest→strongest, shown beside the meter for scores 1–4 (score 0,
 * an empty field, shows none). Advisory text — announced to assistive tech and overridable for
 * i18n. See {@link CaePassword.strengthLabels}.
 */
export type CaePasswordStrengthLabels = readonly [string, string, string, string];

/**
 * A small, deterministic strength heuristic (0–4) — **advisory only** (Book 08 §3.5). It scores
 * length + character-class variety, and nothing else: NO entropy, repeat, or dictionary penalty
 * (`'aaaaaaaaaaaa'` reads "Fair") — it is a rough hint, never a guarantee. It is NOT validation
 * (the form owns the enforced `ValidatorFn`, Book 07 §3.2) and it deliberately pulls in no scoring
 * library (Book 03 admit/reject; D-11; a richer estimator is the gated follow-up #312). Kept a
 * module-local pure function so the component stays lazy and the scoring is trivially reasoned about.
 */
function estimateStrength(password: string): number {
  if (!password) return 0;
  const classes =
    (/[a-z]/.test(password) ? 1 : 0) +
    (/[A-Z]/.test(password) ? 1 : 0) +
    (/[0-9]/.test(password) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(password) ? 1 : 0);
  // A very short password can never read as strong, however varied — cap it at "weak".
  if (password.length < 6) return 1;
  let score = 1; // length ≥ 6 earns the first point
  if (password.length >= 12) score++;
  if (classes >= 2) score++;
  if (classes >= 3) score++;
  return score; // ceiling is 4 by construction (base 1 + three +1s)
}

/**
 * `cae-password` — a password field with an inline visibility toggle and an advisory strength meter
 * (`reference/COMPARISON.md`: `p-password` → `cae-password`), the input family's component sibling of
 * {@link CaeInputNumber} (#301) and `cae-input-otp` (#303).
 *
 * **Component, not a directive.** Book 08 §2.1 defaults specialized inputs to a directive on a bare
 * `matInput`, but — like `cae-input-number` — the visibility toggle (a `matSuffix` button) and the
 * meter region GROW the DOM around the input, so this is a `cae-*` component extending
 * {@link CaeFormFieldControlBase} (Book 08 §3.5). Consumers write `<cae-password [(ngModel)]>` exactly
 * like `<cae-input>` and inherit label/hint/appearance/required/disabled/ariaLabel/errorMessages + the
 * #29/#47 validation-error bridge for free. The CVA value is the password `string` itself — no
 * model/view split (unlike the numeric field): the input stores what the user typed, and flipping
 * `type` between `password`/`text` never transforms it. IME composition is buffered exactly like
 * `cae-input` (onChange fires on `compositionend`, not the intermediate keystrokes) — which matters
 * once the field is *revealed* to `type=text`, re-enabling the IME browsers suppress for a password.
 *
 * **The visibility toggle** is a self-authored inline-SVG button (an eye to reveal, a slashed eye to
 * conceal — NOT `mat-icon`, whose font ships from a Google CDN Caelum avoids for US-origin, per
 * `chip.ts`). Its accessible name stays constant ({@link toggleAriaLabel}) and `aria-pressed` conveys
 * the shown/hidden state — the WAI-ARIA toggle-button pattern. It never logs the value, and a
 * programmatic `writeValue` re-masks the field so a freshly-written secret never renders in plaintext.
 *
 * **The meter is advisory (Book 08 §3.5).** {@link score} is the local heuristic above (0–4), rendered
 * as a token-styled 4-segment bar (Book 04 §3.6 — no hardcoded colours; the error→warn→primary→success
 * ramp reads from `--cae-color-*`) with a **context-prefixed** text label ("Password strength: …") in a
 * polite live region, so strength is never conveyed by colour alone (WCAG 1.4.1) and the bare adjective
 * can't be mistaken for the enforced error when read out of context. It is a *hint*, never a gate: the
 * ENFORCED policy (min length, character classes, breach checks) is a `ValidatorFn` the form owns
 * (Book 07 §3.2) and surfaces through the inherited error bridge — a green meter never substitutes for
 * validation.
 *
 * **Caps-Lock hint (#312).** A common password-field a11y nicety: a `getModifierState('CapsLock')` read on
 * the field's key events drives a token-styled, politely-announced (`role="status"`) warning so a user
 * doesn't silently enter an upper-cased secret. It reads only the modifier bit (never the value), resets
 * on blur (the state is unknowable without a key event, so a pinned-on warning would go stale), and is
 * opt-out via `[capsLockIndicator]` with i18n text via `[capsLockLabel]`.
 *
 * Zoneless-compatible: `OnPush` + signal state, no zone-coupled APIs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field [appearance]="appearance()">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
      <input
        #inputEl
        matInput
        [type]="toggleMask() && visible() ? 'text' : 'password'"
        [value]="value()"
        [placeholder]="placeholder()"
        [required]="required()"
        [disabled]="isDisabled()"
        [attr.autocomplete]="autocomplete()"
        [errorStateMatcher]="errorStateMatcher"
        [attr.aria-label]="ariaLabel() || null"
        (input)="onInput(inputEl.value)"
        (keydown)="onCapsLock($event)"
        (keyup)="onCapsLock($event)"
        (compositionstart)="onCompositionStart()"
        (compositionend)="onCompositionEnd(inputEl.value)"
        (blur)="onBlur()"
      />
      @if (toggleMask()) {
        <button
          matSuffix
          type="button"
          class="cae-password__toggle"
          [disabled]="isDisabled()"
          [attr.aria-label]="toggleAriaLabel()"
          [attr.aria-pressed]="visible()"
          (click)="toggleVisible()"
        >
          <svg
            class="cae-password__toggle-glyph"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M2 12 C 4.5 7, 8 5, 12 5 C 16 5, 19.5 7, 22 12 C 19.5 17, 16 19, 12 19 C 8 19, 4.5 17, 2 12 Z"
            />
            <circle cx="12" cy="12" r="3.2" />
            @if (visible()) {
              <!-- currently shown → the button conceals: cross the eye out -->
              <path d="M4 4 L20 20" />
            }
          </svg>
        </button>
      }
      @if (hint()) {
        <mat-hint>{{ hint() }}</mat-hint>
      }
      @for (message of activeErrorMessages(); track $index) {
        <mat-error>{{ message }}</mat-error>
      }
    </mat-form-field>

    @if (capsLockIndicator()) {
      <!-- Always present (a registered polite live region) so caps-on inserts text into an existing
           region and announces reliably; the visual warning + its footprint appear only while on. It
           carries the state as TEXT (never colour-only, WCAG 1.4.1) and reads only the modifier bit,
           never the secret. -->
      <div
        class="cae-password__capslock"
        role="status"
        [class.cae-password__capslock--on]="capsLockOn()"
      >
        @if (capsLockOn()) {
          <svg
            class="cae-password__capslock-glyph"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M12 4 L19 11 L15 11 L15 15 L9 15 L9 11 L5 11 Z" />
            <path d="M9 18 H15" />
          </svg>
          {{ capsLockLabel() }}
        }
      </div>
    }

    @if (showStrength()) {
      <div class="cae-password__meter">
        @if (value()) {
          <!-- The bar is decorative (aria-hidden); the label below carries the strength as context-
               prefixed TEXT so it is never colour-only (WCAG 1.4.1) nor a bare, mistakable adjective. -->
          <div class="cae-password__bar" [attr.data-strength]="score()" aria-hidden="true">
            @for (seg of segments; track seg) {
              <span class="cae-password__seg" [class.cae-password__seg--on]="seg <= score()"></span>
            }
          </div>
        }
        <!-- Always present (even empty) so the first '' → 'Password strength: Weak' transition
             announces politely; only changes on a level flip, so typing announces a handful of
             times, not per key. -->
        <span class="cae-password__strength" role="status">{{ strengthAnnouncement() }}</span>
      </div>
    }
  `,
  styles: `
    :host,
    mat-form-field {
      display: block;
    }

    /* Compact, transparent icon button — token-styled (no Material ripple/theme). space-6 is 32px but
       falls to exactly 24px at [data-density=compact], so the density-INVARIANT --cae-target-min floor
       enforces the WCAG 2.5.8 (AA) 24px minimum unconditionally rather than relying on that coincidence (#456). */
    .cae-password__toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--cae-space-6);
      block-size: var(--cae-space-6);
      min-inline-size: var(--cae-target-min);
      min-block-size: var(--cae-target-min);
      padding: 0;
      border: 0;
      border-radius: var(--cae-radius-full);
      background: transparent;
      color: var(--cae-color-on-surface-variant);
      cursor: pointer;
    }
    .cae-password__toggle:hover:not(:disabled) {
      color: var(--cae-color-on-surface);
    }
    .cae-password__toggle:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
    }
    .cae-password__toggle:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .cae-password__toggle-glyph {
      inline-size: 1.25em;
      block-size: 1.25em;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* Caps-Lock warning. The base rule leaves no footprint while off (an empty block collapses to 0
       height); the --on modifier adds the row layout only when the warning shows. The TEXT uses the
       readable secondary-text token — --cae-color-warn (amber-40) fails WCAG 1.4.3's 4.5:1 as text on
       the light surface (the token-layer fix is #425) — while the amber warning CUE lives on the
       aria-hidden glyph, which owes only the 3:1 graphical bound (WCAG 1.4.11). */
    .cae-password__capslock {
      color: var(--cae-color-on-surface-variant);
      font-size: 0.875em;
    }
    .cae-password__capslock--on {
      display: flex;
      align-items: center;
      gap: var(--cae-space-1);
      margin-block-start: var(--cae-space-1);
    }
    .cae-password__capslock-glyph {
      inline-size: 1em;
      block-size: 1em;
      fill: none;
      stroke: var(--cae-color-warn);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .cae-password__meter {
      display: flex;
      flex-direction: column;
      gap: var(--cae-space-1);
      margin-block-start: var(--cae-space-1);
    }
    .cae-password__bar {
      display: flex;
      gap: var(--cae-space-1);
    }
    .cae-password__seg {
      flex: 1;
      block-size: var(--cae-space-1);
      border-radius: var(--cae-radius-full);
      background: var(--cae-color-border);
    }
    /* The strength ramp — token colours only (Book 04 §3.6), never hardcoded. */
    .cae-password__bar[data-strength='1'] .cae-password__seg--on {
      background: var(--cae-color-error);
    }
    .cae-password__bar[data-strength='2'] .cae-password__seg--on {
      background: var(--cae-color-warn);
    }
    .cae-password__bar[data-strength='3'] .cae-password__seg--on {
      background: var(--cae-color-primary);
    }
    .cae-password__bar[data-strength='4'] .cae-password__seg--on {
      background: var(--cae-color-success);
    }
    .cae-password__strength {
      color: var(--cae-color-on-surface-variant);
    }
  `,
})
export class CaePassword extends CaeFormFieldControlBase<string> implements OnInit {
  /** Whether the visibility toggle button is shown. Default `true`. */
  readonly toggleMask = input(true, { transform: booleanAttribute });
  /** Whether the advisory strength meter is shown. Default `true`. */
  readonly showStrength = input(true, { transform: booleanAttribute });
  /**
   * Accessible name for the visibility toggle button. Stays CONSTANT while `aria-pressed` conveys the
   * shown/hidden state (the WAI-ARIA toggle-button pattern), rather than flipping label + state together.
   */
  readonly toggleAriaLabel = input('Show password');
  /**
   * `autocomplete` hint for password managers. Default `current-password` (a login field); set
   * `new-password` for sign-up / change-password so managers offer to generate + save a fresh secret.
   */
  readonly autocomplete = input('current-password');
  /** The four strength labels (weakest→strongest) for scores 1–4; override for i18n (score 0 shows none). */
  readonly strengthLabels = input<CaePasswordStrengthLabels>(['Weak', 'Fair', 'Good', 'Strong']);
  /** Whether the Caps-Lock warning is shown while the field is focused. Default `true`. */
  readonly capsLockIndicator = input(true, { transform: booleanAttribute });
  /** The Caps-Lock warning text; override for i18n. Announced politely + shown as the token-styled hint. */
  readonly capsLockLabel = input('Caps Lock is on');

  /** Whether the password is currently revealed (`type=text`). Toggled by the suffix button. */
  protected readonly visible = signal(false);
  protected toggleVisible(): void {
    this.visible.update((v) => !v);
  }

  /** Advisory 0–4 strength score over the current value (Book 08 §3.5). */
  protected readonly score = computed(() => estimateStrength(this.value()));
  /** The advisory label word for the current score (empty at 0). */
  protected readonly strengthText = computed(() => {
    const s = this.score();
    return s === 0 ? '' : this.strengthLabels()[s - 1];
  });
  /**
   * The visible + announced strength line. Context-prefixed so a screen reader hearing it out of the
   * blue can't mistake the advisory adjective for the enforced error (a11y review): "" at score 0,
   * "Password strength: Good" otherwise.
   */
  protected readonly strengthAnnouncement = computed(() => {
    const word = this.strengthText();
    return word ? `Password strength: ${word}` : '';
  });
  /** The four meter segments (1..4), lit up to the current score. */
  protected readonly segments = [1, 2, 3, 4] as const;

  /** Whether Caps Lock is currently on, per the last key event while focused; drives the warning. */
  protected readonly capsLockOn = signal(false);
  /**
   * Update the Caps-Lock state from a key event's modifier bit (the only way to read it — there is no
   * ambient query). Wired to both keydown AND keyup so pressing the Caps-Lock key itself, which reports
   * the pre-toggle state on keydown in some browsers, is still caught on keyup. Reads ONLY the modifier
   * bit — never the typed value.
   */
  protected onCapsLock(event: KeyboardEvent): void {
    if (!this.capsLockIndicator()) return;
    this.capsLockOn.set(event.getModifierState?.('CapsLock') ?? false);
  }
  /**
   * Blur marks the control touched (the base contract) and clears the Caps-Lock warning: the state is
   * unknowable without a key event, so a warning left pinned on after focus leaves would be stale.
   */
  protected onBlur(): void {
    this.onTouched();
    this.capsLockOn.set(false);
  }

  constructor() {
    super();
    // If the feature is switched off at runtime, drop any lingering "on" state so re-enabling it can't
    // resurface a stale warning without a fresh key event (the guard stops it being set while off; this
    // clears a value set before it was turned off).
    effect(() => {
      if (!this.capsLockIndicator()) this.capsLockOn.set(false);
    });
  }

  /** True between `compositionstart`/`end` so onChange isn't spammed mid-IME (mirrors `cae-input`). */
  private composing = false;

  /** The inner MatInput — poked to recompute its (bridged) error state each `ngDoCheck`. */
  private readonly matInput = viewChild(MatInput);
  protected updateInnerErrorState(): void {
    this.matInput()?.updateErrorState();
  }

  ngOnInit(): void {
    if (isDevMode() && !this.label() && !this.ariaLabel()) {
      console.warn(
        '[cae-password] no accessible name — set `label` or `ariaLabel` ' +
          '(a placeholder is not an accessible name).',
      );
    }
  }

  /** A keystroke commits the raw string straight through the CVA — the model IS the password. */
  protected onInput(raw: string): void {
    // Skip while composing: don't emit or rewrite value() (which re-binds [value] and can abort IME).
    if (this.composing) return;
    this.commitValue(raw);
  }
  protected onCompositionStart(): void {
    this.composing = true;
  }
  protected onCompositionEnd(raw: string): void {
    this.composing = false;
    this.onInput(raw);
  }

  /** Programmatic writes re-mask the field (never render a freshly-written secret in plaintext) and,
   * per the base contract, never re-emit onChange. */
  override writeValue(value: string): void {
    this.visible.set(false);
    super.writeValue(value);
  }
}
