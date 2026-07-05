import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { CaeFormFieldControlBase } from 'caelum/form-field';

/** A single option in a `cae-multi-select`. */
export interface CaeMultiSelectOption {
  /** The value collected into the form array when this option is chosen. */
  value: string;
  /** Visible label — shown in the panel option and the trigger chip. */
  label: string;
  /** Disable just this option. */
  disabled?: boolean;
}

/**
 * `cae-multi-select` — the Composed (M1) multi-value select over Material's `mat-select [multiple]`
 * inside a `mat-form-field` (`reference/COMPARISON.md`: `p-multiSelect` → `cae-multi-select`; Book 09
 * §3.5 — a *value-bearing overlay*, where the overlay IS the picker and the CVA is the contract).
 * Options are data (`CaeMultiSelectOption[]`) and the control is a real `ControlValueAccessor` whose
 * value is a **`string[]`**, so `[(ngModel)]` / `[formControl]` bind the chosen set exactly as they
 * did to `p-multiSelect` (Book 07 §3.1). This is the first control whose value is an array rather than
 * a string, which is why {@link CaeFormFieldControlBase} is generic over its value type (this control
 * sets `T = string[]` and overrides `emptyValue()` → `[]`; #135) — the array control reuses the shared
 * CVA + validation-error-forwarding bridge (#46) unchanged rather than re-duplicating it.
 *
 * **Composed over Direct.** Unlike `cae-select` (a 1:1 Direct wrapper), this adds two pieces Material
 * doesn't ship on `mat-select`:
 * - a **chip summary trigger** (`mat-select-trigger` + `mat-chip-set`) that shows the chosen options
 *   as chips in the collapsed field — `p-multiSelect`'s signature look (removable-from-trigger chips
 *   are an additive follow-up, #136);
 * - an **in-panel client-side filter** (a search input at the top of the panel), on by default like
 *   `p-multiSelect` (`filterable`). The default predicate is a case-insensitive label substring match;
 *   override `filterWith` for prefix/value matching. The filter input **swallows only printable keys**
 *   so mat-select's typeahead key manager doesn't hijack them, while Arrow/Enter/Escape/Tab still
 *   propagate to keep the panel keyboard-operable (real-browser focus + key behaviour is verified at
 *   the M4 a11y pass, #137).
 *
 * **Data-loss guard.** `mat-select` drops the selection for any option that unmounts, so a naive
 * filter would silently delete a chosen-but-filtered-out value from the form. {@link filteredOptions}
 * therefore **always keeps currently-selected options rendered** — a selected option survives the
 * filter even when it doesn't match the query.
 *
 * The shared form-field inputs (`label`/`placeholder`/`hint`/`required`/`disabled`/`appearance`/
 * `ariaLabel`/`errorMessages`), the array `ControlValueAccessor`, and the validation-error forwarding
 * all come from {@link CaeFormFieldControlBase} — this class adds only the options, the filter, the
 * chip summary, and the change wiring. Like `cae-select`, the inner `mat-select` carries no `NgControl`
 * (the consumer binds the OUTER element), so the base drives its bridged error state via
 * {@link updateInnerErrorState}; and like `cae-select`, `mat-select` reflects `errorState` →
 * `aria-invalid` unconditionally, so a required-empty multi-select does expose `aria-invalid="true"`.
 * `Validators.required` treats an empty array as invalid, so mapping `required` carries the message.
 *
 * **Accessibility.** `mat-select [multiple]` provides `role=listbox` + `aria-multiselectable` on the
 * panel and `aria-selected` per option; name the field with `label` (preferred) or `ariaLabel`, and
 * the filter input carries its own `filterAriaLabel`. No `color` input — theming is the
 * `--cae-*`/`--mat-sys-*` token bridge. Zoneless-compatible: `OnPush` + signal state (provisional on
 * #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-multi-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule, MatChipsModule],
  template: `
    <mat-form-field [appearance]="appearance()">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
      <mat-select
        multiple
        [value]="value()"
        [disabled]="isDisabled()"
        [required]="required()"
        [placeholder]="placeholder()"
        [errorStateMatcher]="errorStateMatcher"
        [attr.aria-label]="ariaLabel() || null"
        (selectionChange)="handleChange($event.value)"
        (focusout)="onTouched()"
        (openedChange)="onOpenedChange($event)"
      >
        @if (selectedOptions().length) {
          <mat-select-trigger>
            <mat-chip-set class="cae-multi-select__chips">
              @for (option of selectedOptions(); track option.value) {
                <mat-chip>{{ option.label }}</mat-chip>
              }
            </mat-chip-set>
          </mat-select-trigger>
        }

        @if (filterable()) {
          <div class="cae-multi-select__filter">
            <input
              #filter
              type="text"
              autocomplete="off"
              [placeholder]="filterPlaceholder()"
              [attr.aria-label]="filterAriaLabel()"
              (input)="onFilter(filter.value)"
              (keydown)="onFilterKeydown($event)"
            />
          </div>
        }

        @for (option of filteredOptions(); track option.value) {
          <mat-option [value]="option.value" [disabled]="option.disabled ?? false">
            {{ option.label }}
          </mat-option>
        } @empty {
          <div class="cae-multi-select__empty" role="presentation">{{ emptyMessage() }}</div>
        }
      </mat-select>
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
    .cae-multi-select__chips {
      --mdc-chip-container-height: 24px;
    }
    .cae-multi-select__filter {
      padding: 8px 16px 4px;
    }
    .cae-multi-select__filter input {
      box-sizing: border-box;
      inline-size: 100%;
      padding: 8px 12px;
      border: 1px solid var(--mat-sys-outline-variant, currentColor);
      border-radius: var(--mat-sys-corner-extra-small, 4px);
      background: var(--mat-sys-surface-container-high, transparent);
      color: var(--mat-sys-on-surface, currentColor);
      font: inherit;
    }
    .cae-multi-select__filter input::placeholder {
      color: var(--mat-sys-on-surface-variant, currentColor);
    }
    .cae-multi-select__empty {
      padding: 8px 16px;
      color: var(--mat-sys-on-surface-variant, currentColor);
    }
  `,
})
export class CaeMultiSelect extends CaeFormFieldControlBase<string[]> {
  /** The selectable options, as data. */
  readonly options = input<readonly CaeMultiSelectOption[]>([]);
  /** Show the in-panel filter box. On by default, matching `p-multiSelect`'s `filter`. */
  readonly filterable = input(true, { transform: booleanAttribute });
  /** Placeholder for the filter box. */
  readonly filterPlaceholder = input('Filter');
  /** Accessible name for the filter box (it has no visible label). */
  readonly filterAriaLabel = input('Filter options');
  /** Shown in the panel when the filter matches nothing (and nothing is selected). */
  readonly emptyMessage = input('No matches');
  /**
   * Predicate deciding whether an option matches the typed query (already lower-cased + trimmed).
   * Defaults to a case-insensitive label substring match; override for e.g. prefix or value matching.
   */
  readonly filterWith = input<(option: CaeMultiSelectOption, query: string) => boolean>(
    (option, query) => option.label.toLowerCase().includes(query),
  );

  /** The inner MatSelect — poked by the base to recompute its (bridged) error state. */
  private readonly matSelect = viewChild(MatSelect);
  protected updateInnerErrorState(): void {
    this.matSelect()?.updateErrorState();
  }

  /** The live filter text. Reset when the panel closes so it reopens showing the full list. */
  protected readonly query = signal('');

  /** The chosen options, in `options()` order — the source for the trigger chip summary. */
  protected readonly selectedOptions = computed<readonly CaeMultiSelectOption[]>(() => {
    const selected = new Set(this.value());
    return this.options().filter((option) => selected.has(option.value));
  });

  /**
   * The options shown in the panel: everything when the filter is empty, otherwise the `filterWith`
   * matches PLUS every currently-selected option (the data-loss guard — see the class docstring),
   * in `options()` order.
   */
  protected readonly filteredOptions = computed<readonly CaeMultiSelectOption[]>(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) return this.options();
    const selected = new Set(this.value());
    const predicate = this.filterWith();
    return this.options().filter(
      (option) => selected.has(option.value) || predicate(option, query),
    );
  });

  // The empty value is [] (not the base default ''): mat-select[multiple] throws on a non-array
  // value, so the control must never hand it a string. Overriding this (a prototype method) is
  // enough — the base's `value` signal is seeded from it during construction (no constructor here).
  protected override emptyValue(): string[] {
    return [];
  }

  protected handleChange(values: string[]): void {
    // Copy the array mat-select hands back so a later internal mutation can't alias our signal.
    this.commitValue([...values]);
  }

  protected onFilter(text: string): void {
    this.query.set(text);
  }

  protected onFilterKeydown(event: KeyboardEvent): void {
    // Type printable keys into the filter box instead of letting mat-select's typeahead key manager
    // hijack them; multi-character keys (ArrowDown, Enter, Escape, Tab, Home, End) still propagate to
    // mat-select so the panel stays keyboard-operable. Real-browser focus + key behaviour: M4 (#137).
    if (event.key.length === 1) event.stopPropagation();
  }

  protected onOpenedChange(opened: boolean): void {
    // Reset the filter when the panel closes so the next open shows the full list. (The panel view —
    // and its filter input — is destroyed on close, so only this signal needs clearing.)
    if (!opened) this.query.set('');
  }

  // --- ControlValueAccessor ---
  override writeValue(value: string[]): void {
    // Normalize a nullish or mis-shaped model to an empty array — mat-select[multiple] throws on a
    // non-array value. Copy an incoming array so external mutation of the caller's reference can't
    // desync our signal.
    super.writeValue(Array.isArray(value) ? [...value] : []);
  }
}
