import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  forwardRef,
  inject,
  input,
  isDevMode,
  numberAttribute,
  OnInit,
  signal,
  viewChildren,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * `cae-input-otp` — a one-time-code input (`p-inputOtp` parity, `reference/COMPARISON.md`), the
 * segmented member of the M3 input family (sibling of `cae-input-number` #301). *N* single-character
 * cells present as **one** form control: the CVA value is the combined code string, each cell a view
 * of one character. `writeValue("482913")` distributes across the cells; editing any cell recomposes
 * and emits (Book 08 §3.4).
 *
 * **Family placement — the `NG_VALUE_ACCESSOR` selection-control family, not the base.** The DOM shape
 * is *N* inputs, not one, so there is no single inner `matInput` to bridge — this is a thin `cae-*`
 * **component** (Book 08 §2.1, the documented deviation from that section's directive default, as with
 * the rest of the family) implementing `ControlValueAccessor` directly, with **consumer-owned error
 * display** (#47): {@link ariaDescribedby} forwards onto every cell so a screen reader reads the
 * consumer's error/hint on focus (there is no `mat-form-field` to host it). `role="group"` +
 * {@link ariaLabel}/{@link ariaLabelledby} make the set announce as one field.
 *
 * **Roving focus without `FocusKeyManager` — a deliberate, documented choice.** Book 08 §3.4 cites the
 * CDK `FocusKeyManager` (Book 05 §3.2) for the roving focus, and it is the right tool for a bar of
 * *non-input* focusables (as `cae-menubar` uses it). Here the cells are native `<input>`s, which are
 * (a) already focusable — the manager's core service — and (b) where the user *types*, so its
 * type-ahead would hijack the very digit keys the field exists to capture, and wiring it needs a
 * per-cell `FocusableOption` wrapper. Since this component already owns keystroke entry, Backspace,
 * paste-spread, and overwrite regardless, the manager would add machinery that fights the inputs for
 * no behavioural gain. Instead the cells self-manage a **roving tabindex** (only the active cell is in
 * the tab order — one tab stop for the whole group) and focus moves by index via a `viewChildren`
 * query. Same observable a11y contract, less code (the "laziest sufficient code" rung below the
 * manager). The keyboard model:
 *
 * - **Type** a character → it fills the cell and focus advances to the next.
 * - **Backspace** on a filled cell clears it in place; on an *empty* cell it retreats, clearing the
 *   previous cell (the expected delete-back feel).
 * - **Arrow Left/Right, Home/End** move focus without editing.
 * - **Paste** `482913` into any cell spreads across the cells from there — the most-missed OTP
 *   behaviour. **SMS autofill** (`autocomplete="one-time-code"`) drops the whole code into the first
 *   cell as an `input` event (not a `paste`), so a multi-character `input` spreads too — and the first
 *   cell omits `maxlength` so the OS's full code reaches `onInput` intact rather than being truncated
 *   to one character (the other cells keep `maxlength=1` for clean single-character overwrite).
 *
 * `integerOnly` (default) sets `inputmode="numeric"` and filters *entry* to digits; clear it for an
 * alphanumeric code (`inputmode="text"`). The value is a plain `string` — an **incomplete** code is a
 * shorter string; enforce completeness with the consumer's `Validators` (e.g. `minLength(6)`), the
 * #47 family contract. Two value edges to know: a **middle** cell cleared collapses under `join('')`
 * (cells `['4','','2']` emit `"42"`, so re-feeding that value shifts the `2` left — OTP entry is
 * left-to-right, so this is rare); and `writeValue` is **faithful**, not re-filtered, so a non-digit
 * seeded into an `integerOnly` field (a consumer bug) displays and round-trips as written. Token-only
 * theming (D-04); zoneless-compatible: `OnPush` + signal state.
 *
 * ```html
 * <cae-input-otp [length]="6" ariaLabel="One-time code" [formControl]="code" />
 * ```
 *
 * Deferred parity extras (own follow-ups): a `mask` mode (dot-obscured cells for sensitive codes) and
 * `readonly`. Programmatic {@link writeValue} is faithful — it displays exactly the string set
 * (truncated to {@link length}), it does not re-filter to `integerOnly`.
 */
@Component({
  selector: 'cae-input-otp',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'group',
    '[attr.aria-label]': 'ariaLabel() || null',
    '[attr.aria-labelledby]': 'ariaLabelledby() || null',
    '(focusout)': 'onFocusOut($event)',
  },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeInputOtp), multi: true },
  ],
  template: `
    @for (i of indices(); track i) {
      <input
        #cell
        class="cae-input-otp__cell"
        type="text"
        [attr.maxlength]="i === 0 ? null : 1"
        [attr.inputmode]="integerOnly() ? 'numeric' : 'text'"
        [attr.autocomplete]="i === 0 ? 'one-time-code' : 'off'"
        [attr.aria-label]="cellAriaLabel()(i, length())"
        [attr.aria-describedby]="ariaDescribedby() || null"
        [attr.aria-required]="required() ? 'true' : null"
        [attr.tabindex]="i === activeTabStop() ? 0 : -1"
        [value]="cellChar(i)"
        [disabled]="isDisabled()"
        (focus)="onFocus(i, cell)"
        (input)="onInput(i, cell)"
        (keydown)="onKeydown(i, $event)"
        (paste)="onPaste(i, $event)"
      />
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      gap: var(--cae-space-2);
      align-items: center;
    }
    .cae-input-otp__cell {
      /* Comfortable ~48px target (WCAG 2.5.5), composed from tokens — no hardcoded design value. */
      --_cae-otp-cell: calc(var(--cae-space-4) + var(--cae-space-6));
      inline-size: var(--_cae-otp-cell);
      block-size: var(--_cae-otp-cell);
      padding: 0;
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      background: var(--cae-surface-raised);
      color: var(--cae-color-on-surface);
      font-family: var(--cae-font-mono);
      font-size: var(--cae-text-lg);
      font-weight: var(--cae-weight-medium);
      text-align: center;
      box-sizing: border-box;
    }
    .cae-input-otp__cell:focus,
    .cae-input-otp__cell:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
      border-color: var(--cae-color-primary);
    }
    .cae-input-otp__cell:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
})
export class CaeInputOtp implements ControlValueAccessor, OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * Number of code cells. Defaults to 6 (the common SMS one-time-code length). **Set-once** (like
   * `cae-select-button`'s `multiple`): bind a static value, not a signal that changes at runtime — a
   * runtime change desyncs the stored characters from the model and the tab stop, so a dev-warn fires
   * (the tab stop is clamped defensively regardless). Accepts a string attribute (`length="4"`).
   */
  readonly length = input(6, { transform: numberAttribute });
  /**
   * Restrict entry to digits and set `inputmode="numeric"` (the default — most one-time codes are
   * numeric). Clear it for an alphanumeric code, which allows any single character and sets
   * `inputmode="text"`.
   */
  readonly integerOnly = input(true, { transform: booleanAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * Marks the group required — drives `aria-required` on each cell. This **annotates only**; it
   * registers no validator, so enforce a complete code with the consumer's `Validators` (#47 family).
   */
  readonly required = input(false, { transform: booleanAttribute });
  /** Accessible name for the whole group when no visible label wraps it. */
  readonly ariaLabel = input('');
  /** `id` of a visible element that labels the group (preferred over {@link ariaLabel}). */
  readonly ariaLabelledby = input('');
  /**
   * `id`(s) of element(s) describing the field — the a11y hook for a consumer-owned error or hint
   * (#47). Forwarded to **every** cell (focus lands on a cell, never the group host), where a screen
   * reader reads it on focus; pair it with a form-level live region for submit-time announcement.
   */
  readonly ariaDescribedby = input('');
  /**
   * Builds each cell's accessible name from its index and the total. Defaults to
   * `"Character N of M"`; override to localise or to say "Digit" for a numeric code.
   */
  readonly cellAriaLabel = input<(index: number, length: number) => string>(
    (index, length) => `Character ${index + 1} of ${length}`,
  );

  /** The cell indices to render (`0..length-1`); clamped so a stray `length < 1` renders nothing. */
  protected readonly indices = computed(() =>
    Array.from({ length: Math.max(0, this.length()) }, (_, i) => i),
  );

  /**
   * The per-cell characters — the source of truth. {@link length} is **set-once**, so this array is
   * not reconciled to `length` at runtime; reads are clamped to `length`
   * ({@link currentValue}/{@link cellChar}) defensively, and a runtime `length` change dev-warns.
   */
  private readonly cells = signal<string[]>([]);
  /** The cell last focused — the roving-tabindex candidate (clamped by {@link activeTabStop}). */
  protected readonly activeIndex = signal(0);
  /**
   * The single tabbable cell — {@link activeIndex} clamped into range, so the group always has exactly
   * one tab stop even if `activeIndex` is momentarily stale (defensive; `length` is set-once). Without
   * this, a `length` shrink past `activeIndex` would leave every cell `tabindex=-1` — the group would
   * fall out of the tab order entirely (WCAG 2.1.1).
   */
  protected readonly activeTabStop = computed(() =>
    Math.min(this.activeIndex(), Math.max(0, this.indices().length - 1)),
  );
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  private readonly cellRefs = viewChildren<ElementRef<HTMLInputElement>>('cell');

  private onChangeFn: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  constructor() {
    // Dev-only: [length] is set-once — warn on a runtime change (the value/tab-stop desync the two
    // reviewers flagged). Capture the initial value on the first effect run (after inputs bind), not
    // in the constructor body (where a signal input still reads its default, not the bound value).
    if (isDevMode()) {
      let initial: number | undefined;
      effect(() => {
        const n = this.length();
        if (initial === undefined) initial = n;
        else if (n !== initial) {
          console.warn(
            `cae-input-otp: [length] is set-once but changed (${initial} → ${n}) at runtime — this desyncs the value and the tab stop. Bind a static value.`,
          );
        }
      });
    }
  }

  ngOnInit(): void {
    if (!isDevMode()) return;
    if (this.length() < 1) {
      console.warn(`cae-input-otp: [length] is ${this.length()} — expected at least 1 cell.`);
    }
    if (!this.ariaLabel() && !this.ariaLabelledby()) {
      console.warn(
        'cae-input-otp: no [ariaLabel]/[ariaLabelledby] — the role="group" has no accessible name; screen-reader users hear the cells with no field context.',
      );
    }
  }

  /** The character shown in cell `index` (empty string when unset). */
  protected cellChar(index: number): string {
    return this.cells()[index] ?? '';
  }

  /** Called when a cell gains focus (click or Tab): make it the roving-tabbable cell and select its
   * content so the next keystroke overwrites (the expected OTP feel). */
  protected onFocus(index: number, el: HTMLInputElement): void {
    this.activeIndex.set(index);
    el.select();
  }

  /**
   * Cell `input` handler. A single accepted character fills the cell and advances focus; a rejected
   * character (e.g. a letter while {@link integerOnly}) is reverted. A multi-character value — SMS
   * one-time-code **autofill** fires `input`, not `paste` — is spread across the cells from here.
   */
  protected onInput(index: number, el: HTMLInputElement): void {
    const raw = el.value;
    if (raw.length > 1) {
      this.spreadFrom(index, raw);
      el.value = this.cellChar(index); // re-sync this cell's display after the spread
      return;
    }
    const sanitized = this.sanitize(raw);
    if (raw && !sanitized) {
      el.value = this.cellChar(index); // reject: restore the cell's real value
      return;
    }
    this.setCell(index, sanitized);
    this.commit();
    if (sanitized) this.focusCell(index + 1);
  }

  /**
   * Cell `keydown` handler — the roving-tabindex keyboard model (see the class docstring). All handled
   * keys `preventDefault` so this component solely owns focus movement and delete-back.
   */
  protected onKeydown(index: number, event: KeyboardEvent): void {
    switch (event.key) {
      case 'Backspace':
        event.preventDefault();
        if (this.cellChar(index)) {
          this.setCell(index, '');
          this.commit();
        } else if (index > 0) {
          this.setCell(index - 1, '');
          this.commit();
          this.focusCell(index - 1);
        }
        break;
      case 'Delete':
        event.preventDefault();
        if (this.cellChar(index)) {
          this.setCell(index, '');
          this.commit();
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.focusCell(index - 1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.focusCell(index + 1);
        break;
      case 'Home':
        event.preventDefault();
        this.focusCell(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusCell(this.length() - 1);
        break;
    }
  }

  /** Cell `paste` handler — spread the pasted text across the cells from `index` (the primary
   * multi-fill path; `preventDefault` so the raw text never lands in a single cell). */
  protected onPaste(index: number, event: ClipboardEvent): void {
    event.preventDefault();
    this.spreadFrom(index, event.clipboardData?.getData('text') ?? '');
  }

  /** Fire `onTouched` only when focus leaves the whole group, not while moving between its cells. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !this.host.nativeElement.contains(next)) this.onTouched();
  }

  /** Write `char` (empty or one character) into cell `index`, growing the sparse array as needed. */
  private setCell(index: number, char: string): void {
    this.cells.update((c) => {
      const next = c.slice();
      while (next.length <= index) next.push('');
      next[index] = char;
      return next;
    });
  }

  /** Distribute `text` across the cells starting at `start`, then focus the next empty cell. */
  private spreadFrom(start: number, text: string): void {
    const chars = this.sanitize(text);
    if (!chars) return;
    this.cells.update((c) => {
      const next = c.slice();
      let i = start;
      for (const ch of chars) {
        if (i >= this.length()) break;
        while (next.length <= i) next.push('');
        next[i] = ch;
        i++;
      }
      return next;
    });
    this.commit();
    this.focusCell(Math.min(start + chars.length, this.length() - 1));
  }

  /** Strip whitespace and, when {@link integerOnly}, non-digits. */
  private sanitize(text: string): string {
    const stripped = text.replace(/\s/g, '');
    return this.integerOnly() ? stripped.replace(/\D/g, '') : stripped;
  }

  /** Move focus to cell `target` (clamped into range), via the `viewChildren` query. */
  private focusCell(target: number): void {
    const clamped = Math.min(this.length() - 1, Math.max(0, target));
    this.cellRefs()[clamped]?.nativeElement.focus();
  }

  /** Emit the combined code — cells joined, clamped to {@link length}. */
  private commit(): void {
    this.onChangeFn(this.currentValue());
  }
  private currentValue(): string {
    return this.cells().slice(0, this.length()).join('');
  }

  /** First empty cell (where entry should resume), else the last cell. */
  private firstEmptyIndex(): number {
    const c = this.cells();
    for (let i = 0; i < this.length(); i++) if (!c[i]) return i;
    return Math.max(0, this.length() - 1);
  }

  // --- ControlValueAccessor ---
  writeValue(value: string | null): void {
    this.cells.set((value ?? '').split('').slice(0, this.length()));
    this.activeIndex.set(this.firstEmptyIndex()); // Tab lands on the next cell to fill
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChangeFn = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }
}
