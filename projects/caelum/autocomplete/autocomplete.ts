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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput, MatInputModule } from '@angular/material/input';
import { CaeFormFieldControlBase } from 'caelum/form-field';

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
 * **Value seam — a strict single-select combobox.** The CVA value is the **chosen suggestion's
 * `value` key** (a `string`, like `cae-select`), committed **only when a suggestion is selected** —
 * NOT the free-typed text. Typing filters the panel; `displayWith` renders the chosen label in the
 * input. On blur the input display is **reconciled to the model** — text that wasn't committed by
 * picking a suggestion reverts to the chosen label (clearing the input then blurring commits `''`).
 * (Between focus and blur the two can diverge — mid-typing, or after Escape — reconciliation is at
 * blur.) This keeps the model clean and key-based; a free-text mode (the value = the typed string), a
 * `multiple` chip mode, async/loading suggestions, `minLength`, and option groups are additive
 * follow-ups (#120). It is a deliberate, documented flip from Material's free-typing default toward
 * `p-autocomplete`'s "choose a suggestion" model — kept reversible (free text is opt-in later).
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
  imports: [MatFormFieldModule, MatInputModule, MatAutocompleteModule],
  template: `
    <mat-form-field [appearance]="appearance()">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
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
  `,
})
export class CaeAutocomplete extends CaeFormFieldControlBase {
  /** The suggestions, as data. */
  readonly options = input<readonly CaeAutocompleteOption[]>([]);
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
  /** The inner MatInput — poked by the base to recompute its (bridged) error state. */
  private readonly matInput = viewChild(MatInput);
  protected updateInnerErrorState(): void {
    this.matInput()?.updateErrorState();
  }

  /** The live text typed into the input, used only for filtering the panel. */
  private readonly query = signal('');
  /** The suggestion matching the committed value (the base's `value()` = the chosen key). */
  protected readonly selectedOption = computed(() =>
    this.options().find((option) => option.value === this.value()),
  );

  /**
   * The suggestions to show: everything while the input still shows the chosen label (nothing typed
   * since a selection), otherwise the `filterWith` matches for the typed query.
   */
  protected readonly filtered = computed<readonly CaeAutocompleteOption[]>(() => {
    const query = this.query().trim().toLowerCase();
    if (!query || query === this.selectedOption()?.label.toLowerCase()) return this.options();
    const predicate = this.filterWith();
    return this.options().filter((option) => predicate(option, query));
  });

  /** Maps a suggestion's `value` key → its label for the input display (Material's `displayWith`). */
  protected readonly displayFn = (value: string): string =>
    this.options().find((option) => option.value === value)?.label ?? '';

  constructor() {
    super();
    // Render the committed selection's label in the input: the trigger sets it on a user pick (via
    // displayFn), but a programmatic writeValue has no bound inner control to do it. This runs only
    // when value()/options() change (never mid-typing — typing changes `query`, not `value` — so it
    // won't clobber in-progress text); the guard makes an already-correct value a no-op.
    afterRenderEffect(() => {
      const label = this.selectedOption()?.label ?? '';
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
    this.commitValue(value);
    this.query.set(this.displayFn(value));
  }

  protected onBlur(input: HTMLInputElement): void {
    // Strict combobox: reconcile the input display with the committed model on blur.
    const label = this.selectedOption()?.label ?? '';
    if (input.value.trim() === '') {
      // Cleared (incl. whitespace-only) → show empty + commit the empty selection. Set the display
      // directly: when the model is already '' no value change fires, so the effect won't clear it.
      input.value = '';
      if (this.value() !== '') this.commitValue('');
      this.query.set('');
    } else if (input.value !== label) {
      // Typed text that was never selected → revert to the chosen label.
      input.value = label;
      this.query.set(label);
    }
    this.onTouched();
  }

  // --- ControlValueAccessor ---
  // Reset the filter query on any programmatic write (a form patch, load, or reset) so the panel
  // shows the full list on reopen rather than a list stale-filtered by the text that preceded the
  // write (with `query` empty, `filtered()` returns all options). The input display is reconciled
  // independently by the afterRenderEffect, so this never affects what the user sees.
  override writeValue(value: string): void {
    super.writeValue(value);
    this.query.set('');
  }
}
