import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  isDevMode,
  OnInit,
  viewChild,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput, MatInputModule } from '@angular/material/input';
import { CaeFormFieldControlBase } from 'caelum/form-field';

/**
 * One parsed position of a mask template: either a fixed literal character or an editable
 * token slot with the predicate a candidate character must satisfy to fill it.
 */
type MaskSlot =
  | { readonly literal: true; readonly char: string }
  | { readonly literal: false; readonly token: string; readonly test: (c: string) => boolean };

/**
 * The three `p-inputMask` token characters and the class of character each accepts:
 * `9` a digit, `a` a letter, `*` an alphanumeric. Every other character in the template is a
 * literal shown as-is. (Backslash-escaping a literal `9`/`a`/`*` is a deferred parity extra, #315.)
 */
const MASK_TOKENS: Readonly<Record<string, (c: string) => boolean>> = {
  '9': (c) => c >= '0' && c <= '9',
  a: (c) => /[a-z]/i.test(c),
  '*': (c) => /[a-z0-9]/i.test(c),
};

/** Parse a mask template (`"(999) 999-9999"`) into ordered literal/token slots. */
function parseMask(mask: string): MaskSlot[] {
  const slots: MaskSlot[] = [];
  for (const char of mask) {
    if (Object.hasOwn(MASK_TOKENS, char)) {
      slots.push({ literal: false, token: char, test: MASK_TOKENS[char] });
    } else {
      slots.push({ literal: true, char });
    }
  }
  return slots;
}

/**
 * Conform an arbitrary input string to the mask, the single parse every edit routes through
 * (type, paste, delete, replace — Book 08 §3.2). Walks the template once, treating **every**
 * input character as a data candidate: literals are emitted (and a matching typed-through literal
 * is consumed), token slots pull the next candidate that satisfies their predicate and skip the
 * rest — so a pasted `"(212) 555-0142"` and a typed `"2125550142"` conform identically. Trailing
 * literals past the last filled token are trimmed (progressive masking: an empty field stays
 * truly empty so the floating label rests; `"212"` shows `"(212"`, not `"(212) "`).
 *
 * @returns `view` — the masked string to display; `unmasked` — the raw data characters (the model).
 */
function conform(input: string, slots: MaskSlot[]): { view: string; unmasked: string } {
  let view = '';
  let unmasked = '';
  let lastFill = 0; // view length right after the last token was filled — trims trailing literals
  let i = 0; // index into the candidate input
  for (const slot of slots) {
    if (slot.literal) {
      view += slot.char;
      if (i < input.length && input[i] === slot.char) i++; // user typed through the literal
      continue;
    }
    while (i < input.length && !slot.test(input[i])) i++; // skip non-matching candidates
    if (i >= input.length) break; // out of data → stop (leaves trailing literals to be trimmed)
    view += input[i];
    unmasked += input[i];
    lastFill = view.length;
    i++;
  }
  return { view: view.slice(0, lastFill), unmasked };
}

/**
 * Where the caret belongs after a reformat: just past the `n`-th filled token in `view`, then
 * skipped forward over any following literals so it rests *before the next editable slot* (Book
 * 08 §3.2's "caret lands after the next editable slot"). `n` is the count of data characters that
 * preceded the caret in the pre-conform string, so the caret tracks the same logical position
 * across masking rather than snapping to the end. `view[k]` aligns with `slots[k]` because
 * {@link conform} emits exactly one character per slot in order.
 */
function caretForDataIndex(view: string, slots: MaskSlot[], n: number): number {
  if (n <= 0) {
    let k = 0;
    while (k < view.length && slots[k].literal) k++; // skip leading literals
    return k;
  }
  let count = 0;
  for (let k = 0; k < view.length; k++) {
    if (slots[k].literal) continue;
    if (++count === n) {
      let pos = k + 1;
      while (pos < view.length && slots[pos].literal) pos++;
      return pos;
    }
  }
  return view.length;
}

/**
 * `cae-input-mask` — the fixed-template masked text input (`reference/COMPARISON.md`:
 * `p-inputMask` → `cae-input-mask`), the input family's fourth member and last sibling of
 * `cae-input-number` (#301), `cae-input-otp` (#303), and `cae-password` (#304). A mask applies a
 * template (`(999) 999-9999`, `99/99/9999`, `aa-9999`) where tokens mark editable slots
 * (`9` digit, `a` letter, `*` alphanumeric) and every other character is a fixed literal.
 *
 * **Component, not a bare directive** (plan_work #302, resolving the ticket's open sub-decision).
 * Book 08 §2.1 makes a directive-on-`matInput` the generic default because the DOM shape is
 * unchanged — but Caelum's house pattern wraps the `matInput` inside a `cae-*` component extending
 * {@link CaeFormFieldControlBase}, so a lone `[caeInputMask]` directive would be the family's odd
 * one out and would re-solve the label/hint/appearance/required/error-bridge wiring the base gives
 * for free. `cae-input-number` #301 already made — and documented — this exact deliberate deviation
 * for family consistency; the same reasoning carries here. Consumers write
 * `<cae-input-mask mask="(999) 999-9999" label="Phone" [formControl]>` exactly like `<cae-input>`.
 *
 * **The model/view split** (Book 08 §2.2, the R3 scar). The base `value()` holds the canonical
 * **unmasked** string (`"2125550142"`); the inner `<input matInput>` displays the masked *view*.
 * A keystroke conforms the DOM text to the template, restores the caret, and commits the unmasked
 * value out through the CVA; a programmatic `writeValue` sets the model and a reactive
 * {@link syncView} effect re-masks it into the DOM. The form only ever sees the unmasked model
 * (set `[keepLiteral]` to commit the decorated string instead). Masking is a small local parse —
 * **no foreign mask library** (Book 08 §2.3, D-11 provenance).
 *
 * **Caret discipline** (Book 08 §3.1/§3.2/§3.6). Unlike `cae-input-number` (which reformats only
 * on blur to dodge the caret), a mask must reformat on *every* keystroke, so the native value is
 * managed imperatively — set + `setSelectionRange` synchronously in the input handler — rather than
 * through a `[value]` binding, whose asynchronous re-write would clobber the caret. IME composition
 * is buffered (mask input is skipped mid-composition and processed on `compositionend`) so a
 * composed alpha value is never corrupted mid-flight (Book 08 §3.6).
 *
 * Validation stays the form's: `required`/`pattern`/business rules are the consumer's `ValidatorFn`s
 * surfaced through the inherited `#29/#47` error bridge; this control owns only the mask↔model
 * fidelity. A structural "mask incomplete" validator is an offered follow-up, not auto-applied
 * (Book 07 §3.2, #315).
 *
 * a11y: the mask template is a *visual* affordance — pass a `hint` describing the expected format
 * (e.g. `hint="US format — 10 digits"`), which `mat-form-field` links via `aria-describedby` so a
 * screen-reader user learns the format the auto-inserted literals imply (Book 07 §3.4). Deletion
 * routes through `beforeinput` so Backspace/Delete removes the nearest *data* character rather than
 * dead-ending on an immovable literal (Book 08 §3.2's "drive edits off `beforeinput`").
 *
 * Zoneless-compatible: `OnPush` + signal state, no zone-coupled APIs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-input-mask',
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
        [placeholder]="placeholder()"
        [required]="required()"
        [disabled]="isDisabled()"
        [attr.inputmode]="effectiveInputMode()"
        [attr.autocomplete]="autocomplete()"
        [attr.aria-label]="ariaLabel() || null"
        [errorStateMatcher]="errorStateMatcher"
        (beforeinput)="onBeforeInput($event, inputEl)"
        (input)="onInput(inputEl, $event)"
        (compositionstart)="onCompositionStart()"
        (compositionend)="onCompositionEnd(inputEl)"
        (blur)="onTouched()"
      />
      @if (hint()) {
        <mat-hint>{{ hint() }}</mat-hint>
      }
      @for (message of activeErrorMessages(); track $index) {
        <mat-error>{{ message }}</mat-error>
      }
    </mat-form-field>
  `,
  styles: `
    :host,
    mat-form-field {
      display: block;
    }
  `,
})
export class CaeInputMask extends CaeFormFieldControlBase<string> implements OnInit {
  /** The mask template. Tokens: `9` digit, `a` letter, `*` alphanumeric; all else literal. Required. */
  readonly mask = input.required<string>();
  /**
   * Commit the *masked* view string as the model instead of the unmasked raw value. Off by
   * default — the form sees `"2125550142"`, not `"(212) 555-0142"` (Book 08 §3.2).
   */
  readonly keepLiteral = input(false, { transform: booleanAttribute });
  /**
   * `inputmode` hint for on-screen keyboards. Defaults to `'numeric'` when every token in the
   * mask is a digit (`9`) — the common phone/date/SSN case — else unset; override as needed
   * (e.g. `'tel'`). `null` removes the attribute.
   */
  readonly inputMode = input<string | null | undefined>(undefined);
  /** Native `autocomplete` hint (e.g. `'tel'`, `'postal-code'`); omitted → attribute absent. */
  readonly autocomplete = input<string | null>(null);

  /** The parsed mask, recomputed when {@link mask} changes. */
  private readonly slots = computed(() => parseMask(this.mask()));

  /** Auto-`numeric` when the mask is all-digit tokens, unless {@link inputMode} overrides. */
  protected readonly effectiveInputMode = computed(() => {
    const override = this.inputMode();
    if (override !== undefined) return override;
    const slots = this.slots();
    const tokens = slots.filter((s) => !s.literal);
    return tokens.length > 0 && tokens.every((s) => !s.literal && s.token === '9')
      ? 'numeric'
      : null;
  });

  /** The inner `<input>` element — the effect writes the masked view to it imperatively. */
  private readonly inputElRef = viewChild<ElementRef<HTMLInputElement>>('inputEl');
  /** The inner MatInput directive — poked to recompute its (bridged) error state. */
  private readonly matInput = viewChild(MatInput);

  /** True while an IME composition is active; suppresses mid-composition masking (Book 08 §3.6). */
  private composing = false;

  constructor() {
    super();
    this.syncView();
  }

  ngOnInit(): void {
    if (!isDevMode()) return;
    if (!this.label().trim() && !this.ariaLabel().trim()) {
      // A placeholder is not an accessible name — a screen reader announces the field as an
      // unlabeled textbox (Book 07 §3.3). Warn rather than ship a silently-inaccessible control.
      // `.trim()` so a whitespace-only name doesn't pass as a real accessible name.
      console.warn(
        '[cae-input-mask] no accessible name — set `label` or `ariaLabel` (a placeholder is not an accessible name).',
      );
    }
    // A literal a token predicate ALSO accepts is ambiguous: the parser can't tell a typed-through
    // literal from real data, so such a character is silently absorbed into the literal (view/model
    // divergence). Real masks use punctuation literals; warn if one collides (Book 08 §3.2).
    const ambiguous = this.slots().find(
      (s) => s.literal && Object.values(MASK_TOKENS).some((test) => test(s.char)),
    );
    if (ambiguous && ambiguous.literal) {
      console.warn(
        `[cae-input-mask] mask literal "${ambiguous.char}" is also valid token data — typing it is ` +
          'ambiguous and it may be silently absorbed; prefer a non-alphanumeric literal.',
      );
    }
  }

  protected updateInnerErrorState(): void {
    this.matInput()?.updateErrorState();
  }

  /**
   * Reactively mirror the model into the DOM for the *programmatic* path — `writeValue`, a
   * runtime `[mask]` change — re-masking `value()` against the current template. A no-op after a
   * keystroke (the input handler already set the identical view, and `conform` is idempotent on
   * its own `unmasked` output), so it never fights or re-caret-clobbers active typing.
   */
  private syncView(): void {
    effect(() => {
      const el = this.inputElRef()?.nativeElement;
      if (!el) return;
      const view = conform(this.value(), this.slots()).view;
      if (el.value !== view) el.value = view;
    });
  }

  /**
   * A keystroke/paste/range-replace. Conform the post-edit DOM text to the mask, restore the caret,
   * and commit the unmasked value (or the literal view under `keepLiteral`). Skipped while an IME
   * composition is active — both via the `composing` flag and the event's own `isComposing`, which
   * also drops a stray post-`compositionend` `input` some browsers fire (Book 08 §3.6). Collapsed
   * deletions are handled earlier in {@link onBeforeInput}; a range delete falls through to here.
   */
  protected onInput(el: HTMLInputElement, event?: Event): void {
    if (this.composing || (event as InputEvent | undefined)?.isComposing) return;
    const caret = el.selectionStart ?? el.value.length;
    const dataBeforeCaret = conform(el.value.slice(0, caret), this.slots()).unmasked.length;
    this.renderConformed(el, el.value, dataBeforeCaret);
  }

  /**
   * Intercept a *collapsed* Backspace/Delete before the browser applies it, and delete the nearest
   * DATA character rather than an immovable literal. Without this, backspacing onto a literal
   * (`) `, `-`, `/`) is a no-op — `conform` just re-inserts it and the caret snaps back, dead-ending
   * keyboard/AT deletion (the classic mask-backspace trap; a11y review #302). Insertions and range
   * deletes are left to the browser + {@link onInput}.
   */
  protected onBeforeInput(event: Event, el: HTMLInputElement): void {
    if (this.composing) return;
    const inputType = (event as InputEvent).inputType;
    const backward = inputType === 'deleteContentBackward';
    const forward = inputType === 'deleteContentForward';
    if (!backward && !forward) return;
    const start = el.selectionStart ?? 0;
    if (start !== (el.selectionEnd ?? start)) return; // range delete → browser removes it, then onInput
    // Step over literal positions in the delete direction to find the data character to remove.
    const slots = this.slots();
    const dom = el.value;
    const step = backward ? -1 : 1;
    let idx = backward ? start - 1 : start;
    while (idx >= 0 && idx < dom.length && slots[idx]?.literal) idx += step;
    event.preventDefault(); // this handler owns the deletion (a no-op when no data char remains)
    if (idx < 0 || idx >= dom.length) return;
    const dataBeforeCaret = conform(dom.slice(0, idx), slots).unmasked.length;
    this.renderConformed(el, dom.slice(0, idx) + dom.slice(idx + 1), dataBeforeCaret);
  }

  /**
   * Conform `nextDom` to the mask, write the view to the element, restore the caret to just after
   * `dataBeforeCaret` data characters, and commit the model. The single tail shared by the insert
   * ({@link onInput}) and delete ({@link onBeforeInput}) paths.
   */
  private renderConformed(el: HTMLInputElement, nextDom: string, dataBeforeCaret: number): void {
    const slots = this.slots();
    const { view, unmasked } = conform(nextDom, slots);
    el.value = view;
    const pos = caretForDataIndex(view, slots, dataBeforeCaret);
    el.setSelectionRange(pos, pos);
    this.commitValue(this.keepLiteral() ? view : unmasked);
  }

  protected onCompositionStart(): void {
    this.composing = true;
  }

  protected onCompositionEnd(el: HTMLInputElement): void {
    this.composing = false;
    this.onInput(el);
  }
}
