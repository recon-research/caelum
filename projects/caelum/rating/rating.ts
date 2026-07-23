import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  input,
  numberAttribute,
  signal,
  TemplateRef,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Directionality } from '@angular/cdk/bidi';

import {
  CaeIcon,
  caeItemIconContext,
  type CaeIconName,
  type CaeItemIconContext,
} from 'caelum/icon';

/**
 * The item a `cae-rating` `[iconTemplate]` receives as its D-596 context `item` (issue #663).
 * The context builder is the single-homed {@link caeItemIconContext} (#649); the item it carries
 * is this shape rather than a bare `number`, because a rating renders ONE template across both
 * icon states, so the template needs {@link active} to pick the on/off glyph itself.
 */
export interface CaeRatingStar {
  /** The star's 1-based ordinal (1 = the first star). */
  value: number;
  /** Whether this star is "on" at the current (hover-preview or committed) value. */
  active: boolean;
}

/**
 * `cae-rating` — a keyboard-operable star rating that is a real form control
 * (`reference/COMPARISON.md`: `p-rating` → `cae-rating`; Book 07 §3.1). It belongs to the
 * selection-control family (`cae-radio` / `cae-checkbox` / `cae-select-button`), NOT the
 * `mat-form-field`-wrapping family: a rating is a selection, not a text input, so it wires
 * `NG_VALUE_ACCESSOR` directly (like `cae-radio`) and `[(ngModel)]` / `[formControl]` bind the
 * `number | null` value. Template `disabled` merges with reactive-forms `setDisabledState`.
 * Zoneless-compatible: `OnPush` + signal state (provisional on #9; Book 01 §3.2).
 *
 * **A11y** (APG rating over a radio group): the host row is `role="radiogroup"` named by
 * `ariaLabel` / `ariaLabelledby`; each star is a `role="radio"` with `aria-checked`,
 * `aria-posinset` / `aria-setsize`, and its own accessible name ("3 stars"). Focus is a roving
 * tabindex — one tab stop, on the selected star (or the first when unset). Keyboard: Right/Up
 * increase, Left/Down decrease (a rating is a magnitude, so it follows slider direction, not a
 * pure radio group's Up=previous), each move ALSO selecting; `Home`/`End` jump to first/last;
 * `Space`/`Enter` select the focused star; with `[allowCancel]`, re-selecting the active star
 * clears to `null`. Left/Right flip under RTL. `[invalid]` mirrors the consumer's `ng-invalid`
 * onto `aria-invalid` (the #47 consumer-owned validation seam — same reason `cae-radio` forwards
 * `ariaDescribedby` rather than rendering its own `<mat-error>`).
 *
 * **On/off is a shape cue, not colour** (WCAG 1.4.1): the built-in default star is drawn inline —
 * solid (`fill: currentColor`) when on, hollow (`fill: none`) when off — because the shared
 * `cae-icon` glyphs are stroke-only by contract (D-596) and cannot express a fill. `[icon]` /
 * `[offIcon]` swap in named `cae-icon` glyphs, and `[iconTemplate]` (D-596, via the single-homed
 * {@link caeItemIconContext}) is the full escape hatch for a custom glyph.
 */
@Component({
  selector: 'cae-rating',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, CaeIcon],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeRating), multi: true },
  ],
  template: `
    <div
      class="cae-rating"
      role="radiogroup"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-labelledby]="ariaLabelledby() || null"
      [attr.aria-required]="required() ? 'true' : null"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      [attr.aria-readonly]="readonly() ? 'true' : null"
      [attr.aria-disabled]="isDisabled() ? 'true' : null"
      (focusout)="onTouched()"
      (mouseleave)="clearHover()"
    >
      @for (ordinal of starList(); track ordinal) {
        <span
          #starEl
          class="cae-rating__star"
          [class.cae-rating__star--on]="ordinal <= displayValue()"
          role="radio"
          [attr.aria-checked]="ordinal === value()"
          [attr.aria-posinset]="ordinal"
          [attr.aria-setsize]="starList().length"
          [attr.aria-label]="starAriaLabel(ordinal)"
          [attr.aria-disabled]="isDisabled() ? 'true' : null"
          [attr.tabindex]="tabIndexFor(ordinal)"
          (click)="select(ordinal)"
          (keydown)="onKeydown($event)"
          (mouseenter)="onHover(ordinal)"
        >
          @if (iconTemplate(); as tpl) {
            <ng-container
              [ngTemplateOutlet]="tpl"
              [ngTemplateOutletContext]="iconContext(ratingStar(ordinal), ordinal - 1)"
            />
          } @else if (icon() || offIcon()) {
            <cae-icon class="cae-rating__icon" [name]="glyphFor(ordinal)" />
          } @else {
            <svg class="cae-rating__glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M12 2 L14.4 8.8 L21.5 8.9 L15.8 13.2 L17.9 20.1 L12 16 L6.1 20.1 L8.2 13.2 L2.5 8.9 L9.6 8.8 Z"
              />
            </svg>
          }
        </span>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    /* [hidden] must beat the inline-flex display above (the avatar #662 lesson). */
    :host([hidden]) {
      display: none;
    }
    .cae-rating {
      display: inline-flex;
      align-items: center;
      gap: var(--cae-space-1);
    }
    .cae-rating__star {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      /* A NEW clickable affordance floors at the interactive target token (WCAG 2.5.8), NOT a
         --cae-space-* value: spacing shrinks at compact density, which would drop the star below
         24px and fail the target-size floor the density suite asserts (#663). */
      min-inline-size: var(--cae-target-min);
      min-block-size: var(--cae-target-min);
      color: var(--cae-color-on-surface-variant);
      cursor: pointer;
      border-radius: var(--cae-radius-sm);
    }
    /* On == amber; off == muted. Paired with the solid/hollow glyph fill below, so the state is
       never conveyed by colour alone (WCAG 1.4.1). */
    .cae-rating__star--on {
      color: var(--cae-color-warn);
    }
    .cae-rating__star:focus-visible {
      outline: var(--cae-focus-ring);
      /* Inset so the ring stays inside the target box rather than bleeding into the neighbour. */
      outline-offset: calc(-1 * var(--cae-focus-ring-width));
    }
    .cae-rating[aria-readonly='true'] .cae-rating__star,
    .cae-rating[aria-disabled='true'] .cae-rating__star {
      cursor: default;
    }
    .cae-rating[aria-disabled='true'] {
      opacity: 0.5;
    }
    .cae-rating__glyph {
      inline-size: 1.25em;
      block-size: 1.25em;
      /* Hollow by default (off state) — the SHAPE half of the on/off distinction. */
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linejoin: round;
    }
    /* Solid when on — a fill, not just a colour swap, so on/off survives WCAG 1.4.1. */
    .cae-rating__star--on .cae-rating__glyph {
      fill: currentColor;
    }
    .cae-rating__icon {
      font-size: 1.25em;
    }
  `,
})
export class CaeRating implements ControlValueAccessor {
  private readonly dir = inject(Directionality);

  /** Number of stars (default 5). NaN / < 1 falls back to 5 rather than rendering an empty group. */
  readonly stars = input(5, { transform: numberAttribute });
  /**
   * Non-interactive but still announced: the stars keep their roving tab stop (a screen reader can
   * focus and read the value) and the group is `aria-readonly`, but clicks/keys don't change it.
   * Named `readonly` (matching `cae-input`/`cae-textarea`) — the `readonly readonly` field reads oddly
   * but keeps the consumer binding `[readonly]` without an aliased input (@angular-eslint no-input-rename).
   */
  readonly readonly = input(false, { transform: booleanAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. Removes the tab stop. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Re-selecting the currently-active star clears the value to `null` (p-rating's cancel behaviour). */
  readonly allowCancel = input(false, { transform: booleanAttribute });
  /** Marks the group required — drives `aria-required` on the radiogroup (the `cae-radio` sibling). */
  readonly required = input(false, { transform: booleanAttribute });
  /**
   * Mirror the consumer's `ng-invalid` onto `aria-invalid` — bind `[invalid]="ctrl.invalid && ctrl.touched"`.
   * Consumer-wired rather than auto-read from `NgControl`, so the CVA keeps the `NG_VALUE_ACCESSOR`
   * provider wiring of the selection-control family (#47) instead of the `NgControl`-injecting variant.
   */
  readonly invalid = input(false, { transform: booleanAttribute });
  /** `cae-icon` glyph for an ON star; empty → the built-in solid star. `string` (not just `CaeIconName`) per D-596. */
  readonly icon = input<CaeIconName | (string & {})>('');
  /** `cae-icon` glyph for an OFF star; empty → falls back to `[icon]` (or the built-in hollow star). */
  readonly offIcon = input<CaeIconName | (string & {})>('');
  /** Full per-star glyph override (D-596). Wins over `[icon]`/`[offIcon]`; context item is a {@link CaeRatingStar}. */
  readonly iconTemplate = input<TemplateRef<CaeItemIconContext<CaeRatingStar>> | null>(null);
  /** Accessible name for the group when no visible label wraps it. */
  readonly ariaLabel = input('');
  /** `id` of a visible element that labels the group (preferred when a label is shown). */
  readonly ariaLabelledby = input('');

  /** The star elements, for roving-focus moves after keyboard navigation. */
  private readonly starEls = viewChildren<ElementRef<HTMLElement>>('starEl');
  /** The single-homed D-596 context builder (#649) — wired verbatim, never re-implemented. */
  protected readonly iconContext = caeItemIconContext;

  protected readonly value = signal<number | null>(null);
  private readonly formDisabled = signal(false);
  /** Hover-preview magnitude (interactive only); purely visual — `aria-checked` follows {@link value}. */
  private readonly hoverValue = signal<number | null>(null);

  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  protected readonly interactive = computed(() => !this.isDisabled() && !this.readonly());
  /** 1-based star ordinals; NaN / < 1 count degrades to the default 5 (guards the clamp bound, too). */
  protected readonly starList = computed(() => {
    const n = Math.floor(this.stars());
    const count = Number.isFinite(n) && n >= 1 ? n : 5;
    return Array.from({ length: count }, (_, i) => i + 1);
  });
  /** How many stars render "on" — the hover preview when hovering, else the committed value. */
  protected readonly displayValue = computed(() => this.hoverValue() ?? this.value() ?? 0);
  /** The star that is the roving tab stop: the selected one, or the first when nothing is selected. */
  private readonly focusOrdinal = computed(() => this.value() ?? 1);

  private onChangeFn: (value: number | null) => void = () => {};
  protected onTouched: () => void = () => {};

  protected starAriaLabel(ordinal: number): string {
    return `${ordinal} ${ordinal === 1 ? 'star' : 'stars'}`;
  }

  /** The {@link CaeRatingStar} passed to a consumer `[iconTemplate]` for this ordinal. */
  protected ratingStar(ordinal: number): CaeRatingStar {
    return { value: ordinal, active: ordinal <= this.displayValue() };
  }

  /** Named glyph for the `[icon]`/`[offIcon]` path; each falls back to the other so one input suffices. */
  protected glyphFor(ordinal: number): string {
    const on = this.icon() || this.offIcon();
    const off = this.offIcon() || this.icon();
    return ordinal <= this.displayValue() ? on : off;
  }

  protected tabIndexFor(ordinal: number): number | null {
    if (this.isDisabled()) return null;
    return ordinal === this.focusOrdinal() ? 0 : -1;
  }

  protected onHover(ordinal: number): void {
    if (this.interactive()) this.hoverValue.set(ordinal);
  }
  protected clearHover(): void {
    this.hoverValue.set(null);
  }

  /** Commit a click/tap on a star (or a cancel when `[allowCancel]` re-selects the active one). */
  protected select(ordinal: number): void {
    if (!this.interactive()) return;
    this.setValue(this.allowCancel() && this.value() === ordinal ? null : ordinal);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.interactive()) return;
    // A chord (Ctrl+Home jumps the document, Cmd+arrows are OS nav, etc.) is not ours to consume.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const n = this.starList().length;
    const current = this.value() ?? 0;
    const rtl = this.dir.value === 'rtl';
    let target: number;

    switch (event.key) {
      case 'ArrowUp':
        target = Math.min(n, current + 1);
        break;
      case 'ArrowDown':
        target = Math.max(1, current - 1);
        break;
      case 'ArrowRight':
        target = rtl ? Math.max(1, current - 1) : Math.min(n, current + 1);
        break;
      case 'ArrowLeft':
        target = rtl ? Math.min(n, current + 1) : Math.max(1, current - 1);
        break;
      case 'Home':
        target = 1;
        break;
      case 'End':
        target = n;
        break;
      case ' ':
      case 'Spacebar':
      case 'Enter': {
        // Select (or cancel) the focused star — the tab stop, i.e. the current value or the first.
        const focused = this.value() ?? 1;
        this.setValue(this.allowCancel() && this.value() === focused ? null : focused);
        this.focusStar(focused - 1);
        event.preventDefault();
        return;
      }
      default:
        return;
    }

    // Arrows / Home / End move focus AND select in one step (radio-group semantics), clamped to
    // [1, n] — a magnitude never wraps, and it never lands on "no star", so arrows can't reach null.
    this.setValue(target);
    this.focusStar(target - 1);
    event.preventDefault();
  }

  private focusStar(index: number): void {
    this.starEls()[index]?.nativeElement.focus();
  }

  private setValue(value: number | null): void {
    this.value.set(value);
    this.onChangeFn(value);
  }

  // --- ControlValueAccessor ---
  writeValue(value: number | null): void {
    if (value == null || !Number.isFinite(value)) {
      this.value.set(null);
      return;
    }
    // Clamp an out-of-range written value into [0, stars]; 0 (or below) means "no rating" → null.
    const clamped = Math.min(this.starList().length, Math.max(0, Math.round(value)));
    this.value.set(clamped || null);
  }
  registerOnChange(fn: (value: number | null) => void): void {
    this.onChangeFn = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }
}
