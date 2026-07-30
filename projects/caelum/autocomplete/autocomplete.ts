import { COMMA, ENTER } from '@angular/cdk/keycodes';
import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatAutocompleteModule, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import {
  MatChipGrid,
  MatChipInput,
  type MatChipInputEvent,
  MatChipRemove,
  MatChipRow,
} from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput, MatInputModule } from '@angular/material/input';
import { CaeFormFieldControlBase } from '@recon-research/caelum/form-field';

/** A single suggestion in a `cae-autocomplete`. */
export interface CaeAutocompleteOption {
  /** The value bound into the form when this suggestion is chosen. */
  value: string;
  /** Visible label — shown in the panel and, once chosen, in the input. */
  label: string;
  /** Disable just this suggestion. */
  disabled?: boolean;
}

/**
 * `cae-autocomplete` — the Direct (1:1) wrapper over Material's `matAutocomplete` inside a
 * `mat-form-field` (`reference/COMPARISON.md` row 39: `p-autocomplete` → `cae-autocomplete`; Book 09).
 * A typeahead input with a filtered suggestion overlay. Suggestions are data
 * (`CaeAutocompleteOption[]`) and the control is a real `ControlValueAccessor`, so
 * `[(ngModel)]` / `[formControl]` bind exactly as they did to `p-autocomplete` (Book 07 §3.1).
 *
 * **Value seam — a strict single-select combobox by default.** The CVA value is the **chosen
 * suggestion's `value` key** (a `string`, like `cae-select`), committed **only when a suggestion is
 * selected** — NOT the free-typed text. Typing filters the panel; `displayWith` renders the chosen
 * label in the input. On blur the input display is **reconciled to the model** — text that wasn't
 * committed by picking a suggestion reverts to the chosen label (clearing the input then blurring
 * commits `''`). (Between focus and blur the two can diverge — mid-typing, or after Escape —
 * reconciliation is at blur.) That strictness is a deliberate, documented flip from Material's
 * free-typing default toward `p-autocomplete`'s "choose a suggestion" model, and {@link freeText}
 * flips it back. Async/loading suggestions, `minLength`, and option groups remain follow-ups (#120).
 *
 * **{@link freeText} — the value may be what was typed.** Opt in (`p-autocomplete`'s
 * `forceSelection=false`, Material's `requireSelection=false`) and blur commits the trimmed text
 * verbatim instead of reverting it, so the model may hold a key OR an arbitrary string. Committing is
 * keyed off the *displayed* text, not the model, so blurring an untouched picked suggestion cannot
 * clobber its key with its own label. A value with no matching option displays as itself rather than
 * blanking.
 *
 * **{@link multiple} — the tag-entry form control (`p-chips`' replacement).** `p-chips` was REMOVED in
 * PrimeNG v20-rc and upstream's blessed replacement is `p-autocomplete [multiple]`, so **D-549** routes
 * the tag-entry *form/CVA* case here rather than to a `cae-chips` (`cae-chip-set [textEntry]` stays the
 * non-form *display* shape, #201). The value becomes a **`readonly string[]`** of keys rendered as
 * removable chips over `MatChipGrid` + `matChipInputFor`; with {@link freeText} on, Enter/comma commit
 * the typed token, which is the pure tag-entry shape `p-chips` served. The two modes share one
 * component because that is the shape a migrating `p-autocomplete` user already knows — unlike
 * `cae-select`/`cae-multi-select`, which split because *upstream* splits `p-select`/`p-multiSelect`.
 *
 * Because the mode is an input, {@link CaeFormFieldControlBase}'s `emptyValue()` — a field initializer,
 * so it runs before any input is bound — cannot depend on it. The empty value therefore stays `''` for
 * both modes and {@link chipValues}/`singleValue` normalize whatever shape the form actually wrote,
 * which also makes the control immune to a mid-life `[multiple]` flip. Duplicate chips are rejected on
 * add and de-duplicated in `writeValue`: the value array is external data, and a repeated key would
 * throw NG0955 out of the `@for … track chip` that renders it.
 *
 * Chips are hand-rolled here rather than reusing `cae-chip-set` for two reasons: `mat-form-field`
 * resolves its `MatFormFieldControl` by content query, which does not cross a nested component's
 * boundary (so a projected `<cae-chip-set>` would leave the field with no control), and importing it
 * would drag `caelum/chip-set` into this entry point's bundle, breaking the pay-per-import contract.
 *
 * The shared form-field inputs (`label`/`placeholder`/`hint`/`required`/`disabled`/`appearance`/
 * `ariaLabel`/`errorMessages`), the string `ControlValueAccessor`, and the validation-error
 * forwarding all come from {@link CaeFormFieldControlBase} (#46) — this class adds only the
 * suggestions, the client-side filter, and the display/selection wiring. Like `cae-select`, the inner
 * `matInput` carries no `NgControl` (it is uncontrolled — the consumer binds the OUTER element), so
 * the base drives its bridged error state via {@link updateInnerErrorState}.
 *
 * **Accessibility.** `matAutocomplete` wires `role=combobox` + `aria-expanded` +
 * `aria-activedescendant` on the input and `role=listbox` on the panel; name the field with `label`
 * (preferred) or `ariaLabel`. Validation feedback is the mat-form-field `<mat-error>` (Book 07 §3.4).
 * Known gap: because the inner input is uncontrolled, no panel option carries `aria-selected` on open
 * (Material only marks it on a live pick, and `MatOption.selected` is read-only so it can't be bound
 * declaratively as `cae-listbox` does) — the chosen value is still announced via the input text
 * (tracked with the async/dynamic gaps in #120).
 *
 * No `color` input: theming comes through the `--cae-*`/`--mat-sys-*` token bridge, not Material's
 * palette input (the library's token-only discipline). Zoneless-compatible: `OnPush` + signal state
 * (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-autocomplete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatChipGrid,
    MatChipInput,
    MatChipRemove,
    MatChipRow,
  ],
  template: `
    <mat-form-field [appearance]="appearance()">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
      @if (multiple()) {
        <mat-chip-grid
          #grid
          [required]="required()"
          [disabled]="isDisabled()"
          [errorStateMatcher]="errorStateMatcher"
        >
          @for (chip of chipValues(); track chip) {
            <mat-chip-row [removable]="!isDisabled()" (removed)="removeChip(chip)">
              {{ chipLabel(chip) }}
              @if (!isDisabled()) {
                <button
                  matChipRemove
                  type="button"
                  [attr.aria-label]="chipRemoveAriaLabel()(chipLabel(chip))"
                >
                  <svg
                    class="cae-autocomplete__remove-glyph"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M6 6 L18 18 M6 18 L18 6" />
                  </svg>
                </button>
              }
            </mat-chip-row>
          }
        </mat-chip-grid>
        <input
          #input
          [matChipInputFor]="grid"
          [matAutocomplete]="auto"
          [matChipInputSeparatorKeyCodes]="separatorKeyCodes()"
          [placeholder]="placeholder()"
          [disabled]="isDisabled()"
          [attr.aria-label]="ariaLabel() || label() || null"
          (input)="onType(input.value)"
          (matChipInputTokenEnd)="onTokenEnd($event)"
          (focusout)="onBlur(input)"
        />
      } @else {
        <input
          #input
          matInput
          [matAutocomplete]="auto"
          [placeholder]="placeholder()"
          [required]="required()"
          [disabled]="isDisabled()"
          [errorStateMatcher]="errorStateMatcher"
          [attr.aria-label]="ariaLabel() || null"
          (input)="onType(input.value)"
          (focusout)="onBlur(input)"
        />
      }
      <mat-autocomplete
        #auto="matAutocomplete"
        [displayWith]="displayFn"
        [autoActiveFirstOption]="autoActiveFirstOption()"
        (optionSelected)="onSelected($event.option.value)"
      >
        @for (option of filtered(); track option.value) {
          <mat-option [value]="option.value" [disabled]="option.disabled ?? false">
            {{ option.label }}
          </mat-option>
        }
      </mat-autocomplete>
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
    .cae-autocomplete__remove-glyph {
      inline-size: 1em;
      block-size: 1em;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
    }
  `,
})
export class CaeAutocomplete extends CaeFormFieldControlBase<string | readonly string[]> {
  /** The suggestions, as data. */
  readonly options = input<readonly CaeAutocompleteOption[]>([]);
  /**
   * Multi-value chip mode — the tag-entry form control (`p-autocomplete [multiple]`, **D-549**). The
   * CVA value becomes a `readonly string[]` of chosen keys, rendered as removable chips above the
   * text field. Pair with {@link freeText} for the arbitrary-tag entry `p-chips` used to serve.
   */
  readonly multiple = input(false, { transform: booleanAttribute });
  /**
   * Let text that matches no suggestion become the value (`p-autocomplete`'s `forceSelection=false`).
   * Single mode commits it on blur instead of reverting; {@link multiple} mode commits it as a chip on
   * Enter or comma. Off by default — the v1 strict combobox is the documented flip.
   */
  readonly freeText = input(false, { transform: booleanAttribute });
  /** Accessible name for a chip's remove button. Defaults to `"Remove <label>"`. */
  readonly chipRemoveAriaLabel = input<(label: string) => string>((label) => `Remove ${label}`);
  /**
   * Highlight the first matching suggestion when the panel opens so Enter selects it (Material's
   * `autoActiveFirstOption`). Defaults to `false`, matching Material AND `p-autocomplete`'s
   * `autoHighlight` — since the panel opens on mere focus, a `true` default would let an accidental
   * Enter commit the first option before the user has chosen. Set it `true` to let Enter pick the top
   * match after typing.
   */
  readonly autoActiveFirstOption = input(false, { transform: booleanAttribute });
  /**
   * Predicate deciding whether a suggestion matches the typed query (already lower-cased + trimmed).
   * Defaults to a case-insensitive label substring match; override for e.g. prefix or value matching.
   */
  readonly filterWith = input<(option: CaeAutocompleteOption, query: string) => boolean>(
    (option, query) => option.label.toLowerCase().includes(query),
  );

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('input');
  /**
   * The inner Material control the base pokes to recompute its (bridged) error state. Exactly one of
   * these exists at a time — the template's mode arms are mutually exclusive — and in chip mode it is
   * the `MatChipGrid`, not the input, that is the field's `MatFormFieldControl`.
   */
  private readonly matInput = viewChild(MatInput);
  private readonly chipGrid = viewChild(MatChipGrid);
  protected updateInnerErrorState(): void {
    this.matInput()?.updateErrorState();
    this.chipGrid()?.updateErrorState();
  }
  /**
   * The autocomplete trigger on whichever input is stamped. In chip mode Enter is ambiguous — it is
   * both the panel's "select the highlighted option" key and a chip separator — and the two host
   * listeners live on the same element, so {@link onTokenEnd} consults this to tell them apart.
   */
  private readonly autocompleteTrigger = viewChild(MatAutocompleteTrigger);

  /** The live text typed into the input, used only for filtering the panel. */
  private readonly query = signal('');

  /**
   * The committed value read as a single key. Coerces a list (a `[multiple]` value, or a mid-life mode
   * flip) to its first entry rather than rendering `[object Object]`-grade nonsense.
   */
  private readonly singleValue = computed(() => {
    const value = this.value();
    return typeof value === 'string' ? value : (value[0] ?? '');
  });
  /**
   * The committed value read as the chip list. A plain string — the shared empty value, or a mode flip
   * — reads as a one-chip list (empty string → no chips), so chip mode never sees a non-array.
   */
  protected readonly chipValues = computed<readonly string[]>(() => {
    const value = this.value();
    return typeof value === 'string' ? (value ? [value] : []) : value;
  });

  /** The suggestion matching the committed key. Single mode only — chip mode has a list, not one pick. */
  protected readonly selectedOption = computed(() =>
    this.multiple()
      ? undefined
      : this.options().find((option) => option.value === this.singleValue()),
  );

  /**
   * What the single-mode input should display for the committed value: the chosen suggestion's label,
   * or — under {@link freeText}, where the value may be arbitrary text — the value itself. Strict mode
   * keeps showing `''` for a value with no matching option (the orphaned-value gap, #120).
   */
  private readonly displayText = computed(() => {
    const option = this.selectedOption();
    if (option) return option.label;
    return this.freeText() ? this.singleValue() : '';
  });

  /**
   * The suggestions to show: everything while the input still shows the chosen label (nothing typed
   * since a selection), otherwise the `filterWith` matches for the typed query. Chip mode additionally
   * drops options already taken — they are rejected as duplicates, so offering them is a dead click.
   */
  protected readonly filtered = computed<readonly CaeAutocompleteOption[]>(() => {
    const query = this.query().trim().toLowerCase();
    const taken = this.multiple() ? new Set(this.chipValues()) : null;
    const base = taken
      ? this.options().filter((option) => !taken.has(option.value))
      : this.options();
    if (!query || query === this.selectedOption()?.label.toLowerCase()) return base;
    const predicate = this.filterWith();
    return base.filter((option) => predicate(option, query));
  });

  /**
   * Maps a suggestion's `value` key → its label for the input display (Material's `displayWith`).
   * Chip mode returns `''` so the trigger *clears* the field on a pick instead of leaving the label
   * behind: the pick becomes a chip, and a cleared field is also what makes a same-keystroke
   * `matChipInputTokenEnd` read empty and fall into {@link onTokenEnd}'s blank guard.
   */
  protected readonly displayFn = (value: string): string =>
    this.multiple() ? '' : (this.options().find((option) => option.value === value)?.label ?? '');

  /** A chip's visible text: the matching suggestion's label, else the raw free-text value. */
  protected chipLabel(value: string): string {
    return this.options().find((option) => option.value === value)?.label ?? value;
  }

  /**
   * Chip separators. Empty unless {@link freeText} — Material's `_emitChipEnd` calls `preventDefault()`
   * on any separator key, so listing ENTER in strict mode would silently swallow the Enter that submits
   * the surrounding form while never being able to add a chip.
   */
  protected readonly separatorKeyCodes = computed<readonly number[]>(() =>
    this.freeText() ? [ENTER, COMMA] : [],
  );

  constructor() {
    super();
    // Render the committed selection's label in the input: the trigger sets it on a user pick (via
    // displayFn), but a programmatic writeValue has no bound inner control to do it. This runs only
    // when value()/options() change (never mid-typing — typing changes `query`, not `value` — so it
    // won't clobber in-progress text); the guard makes an already-correct value a no-op.
    afterRenderEffect(() => {
      // Chip mode has no committed text to mirror — the value is the chips, and the field holds only
      // the in-progress token, which this must never clobber.
      if (this.multiple()) return;
      const label = this.displayText();
      const element = this.inputRef()?.nativeElement;
      if (element && element.value !== label) element.value = label;
    });
  }

  // The strict-combobox behaviour (filter on `query`, revert un-picked text on blur) is hand-rolled
  // rather than using Material's native `requireSelection`: that input works through the trigger's OWN
  // CVA, but this control deliberately keeps the inner input UNCONTROLLED so the CVA + error bridge
  // live on the OUTER element (#46). The hand-roll's clear-then-blur → commit-'' also matches
  // `p-autocomplete` better than requireSelection's revert-to-previous. `requireSelection` is the
  // eventual lever for the opt-in free-text mode (#120).

  protected onType(text: string): void {
    this.query.set(text);
  }

  protected onSelected(value: string): void {
    if (this.multiple()) {
      // The trigger clears the field itself (displayFn returns '' in this mode).
      this.addChip(value);
      this.query.set('');
      return;
    }
    this.commitValue(value);
    this.query.set(this.displayFn(value));
  }

  /** Append a chip unless it is already present — a repeat would throw NG0955 out of the `@for`. */
  private addChip(value: string): void {
    const current = this.chipValues();
    if (current.includes(value)) return;
    this.commitValue([...current, value]);
  }

  protected removeChip(value: string): void {
    const current = this.chipValues();
    const next = current.filter((chip) => chip !== value);
    if (next.length !== current.length) this.commitValue(next);
  }

  /**
   * A separator key ({@link freeText} only) committed the typed token. Clears first, per the
   * `cae-chip-set` #556 lesson: Material's blur path can re-enter this synchronously, and a field still
   * holding the text would commit the same entry twice.
   */
  protected onTokenEnd(event: MatChipInputEvent): void {
    const trigger = this.autocompleteTrigger();
    if (trigger?.panelOpen && trigger.activeOption) {
      // This Enter belongs to the panel: it selects the highlighted suggestion, which arrives
      // separately through onSelected. Both host listeners fire — the trigger calls preventDefault()
      // but never stopPropagation() — so without this the same keystroke would add two chips. The
      // guard is order-independent: if the trigger ran first the field is already cleared and the
      // blank guard below catches it instead.
      return;
    }
    const value = event.value.trim();
    event.chipInput.clear();
    this.query.set('');
    if (value) this.addChip(value);
  }

  protected onBlur(input: HTMLInputElement): void {
    if (this.multiple()) {
      // The value is the chips; a leftover token is visibly uncommitted, so it is left alone for the
      // user to finish (p-autocomplete [multiple] has no addOnBlur). Clearing it here would also fire
      // on focus moving to a chip's own remove button, which is not the user leaving the field.
      this.onTouched();
      return;
    }
    // Single mode: reconcile the input against the model on blur. Strict reverts un-picked text;
    // freeText commits it. Either way the display is then written directly rather than left to the
    // afterRenderEffect, which does not run when the committed value did not actually change.
    const display = this.displayText();
    const text = input.value.trim();
    if (text === '') {
      if (this.singleValue() !== '') this.commitValue('');
    } else if (this.freeText() && text !== display.trim()) {
      // Keyed off the DISPLAYED text, not the model: blurring an untouched picked suggestion leaves
      // its label in the field, and comparing that against the key would clobber 'us' with
      // 'United States'.
      this.commitValue(text);
    }
    const next = this.displayText();
    if (input.value !== next) input.value = next;
    this.query.set(next);
    this.onTouched();
  }

  // --- ControlValueAccessor ---
  // Reset the filter query on any programmatic write (a form patch, load, or reset) so the panel
  // shows the full list on reopen rather than a list stale-filtered by the text that preceded the
  // write (with `query` empty, `filtered()` returns all options). The input display is reconciled
  // independently by the afterRenderEffect, so this never affects what the user sees.
  //
  // De-duplicate an incoming array at this trust boundary: the form model is external data, and a
  // repeated key throws NG0955 out of the `@for … track chip` that renders the chips. The spread also
  // copies, so later mutation of the caller's array cannot desync the signal. A nullish or string
  // value falls through to the base's empty-value normalization.
  override writeValue(value: string | readonly string[]): void {
    super.writeValue(Array.isArray(value) ? [...new Set<string>(value)] : value);
    // Chip mode excepted: there the field holds the user's in-progress token, which no effect
    // rewrites and a form write does not own. Clearing the query alone would unfilter the panel
    // underneath text still on screen.
    if (!this.multiple()) this.query.set('');
  }
}
