import {
  afterRenderEffect,
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
} from '@recon-research/caelum/icon';

/**
 * Shape-normalise a value the form wrote. **Deliberately does NOT clamp to the star count** (#823,
 * owner-decided): a shape error can never become valid, but a range error can — `[stars]` is a live
 * input, so a value that exceeds today's count may be perfectly valid once an async star count
 * settles. Echoing a clamp here destroyed exactly that: `[stars]="cfg()?.max ?? 0"` degrades to 5
 * while loading, so a saved 8 was rewritten to 5 and the user's rating was gone by the time the real
 * count arrived. `effectiveValue` clamps the *display* instead, and the first user interaction emits
 * the correction. (Same call `cae-slider` makes — its `writeValue` doesn't clamp the model to
 * min/max either.)
 *
 * Numeric strings ARE coerced: `'3'` is an everyday JSON / query-param / `FormData` shape, and since
 * the normalised value is echoed back, treating it as garbage would permanently destroy the
 * consumer's value rather than merely fail to display it.
 */
function normalizeWritten(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  // 0 (or below) means "no rating" → null, so `Validators.required` sees an empty control rather
  // than a number that satisfies it while the widget renders unrated.
  return Math.max(0, Math.round(n)) || null;
}

/**
 * Keys this widget owns that would otherwise scroll the page. Consumed even when the control is
 * readonly — it keeps its tab stop, so the keypress lands inside a focused widget that will not act
 * on it. `Enter` is deliberately absent: it belongs to the surrounding form, on both paths.
 */
const SCROLL_KEYS = new Set([
  ' ',
  'Spacebar',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
]);

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
 * **On/off is a shape cue, not colour** (WCAG 1.4.1), on *every* path. The built-in default star is
 * drawn inline — solid (`fill: currentColor`) when on, hollow (`fill: none`) when off — because the
 * shared `cae-icon` glyphs are stroke-only by contract (D-596) and cannot express a fill. `[icon]` /
 * `[offIcon]` swap in named `cae-icon` glyphs; since a consumer may set only one of the two (each
 * falls back to the other, so both states can share a glyph), that path carries its own non-colour
 * cue — an off star is drawn as a **dashed** outline (#823). `[iconTemplate]` (D-596, via the
 * single-homed {@link caeItemIconContext}) is the full escape hatch; there the *consumer* owns the
 * on/off cue, and `item.active` is what the library gives them to build it with.
 *
 * **The form's value and the widget's presentation are reconciled, not assumed equal.** A written
 * value whose *shape* the widget cannot honour (fractional, `0`, a numeric string, junk) is
 * normalised *and echoed back to the control* so the two agree — see {@link writeValue}. A value that
 * is merely out of *range* is preserved and only displayed clamped ({@link effectiveValue}), because
 * `[stars]` can still grow; the same reason a later `[stars]` shrink is presentation-only.
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
      (focusin)="onFocusIn($event)"
      (mouseleave)="clearHover()"
    >
      @for (ordinal of starList(); track ordinal) {
        <span
          #starEl
          class="cae-rating__star"
          [class.cae-rating__star--on]="ordinal <= displayValue()"
          role="radio"
          [attr.aria-checked]="ordinal === effectiveValue()"
          [attr.aria-posinset]="ordinal"
          [attr.aria-setsize]="starList().length"
          [attr.aria-label]="starAriaLabel(ordinal)"
          [attr.aria-disabled]="isDisabled() ? 'true' : null"
          [attr.tabindex]="tabIndexFor(ordinal)"
          (click)="select(ordinal)"
          (keydown)="onKeydown($event, ordinal)"
          (mouseenter)="onHover(ordinal)"
        >
          @if (iconTemplate(); as tpl) {
            <ng-container
              [ngTemplateOutlet]="tpl"
              [ngTemplateOutletContext]="iconContext(ratingStar(ordinal), ordinal - 1)"
            />
          } @else if (icon() || offIcon()) {
            <cae-icon
              class="cae-rating__icon"
              [class.cae-rating__icon--one-glyph]="!icon() || !offIcon()"
              [name]="glyphFor(ordinal)"
            />
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
    /* The SHAPE half of on/off for the named-glyph path (WCAG 1.4.1), per the owner's call on #823.
       cae-icon glyphs are stroke-only by contract (D-596) and cannot express a fill, so the built-in
       star's solid/hollow trick is unavailable — and a consumer who supplies only ONE of
       [icon]/[offIcon] gets the same glyph for both states, leaving colour as the only difference.
       That difference is worth almost nothing: --cae-color-warn against
       --cae-color-on-surface-variant is 1.16:1 in the light arm, so the cue below is not a "second
       half", it is doing the whole job.

       DASHED, not merely smaller. A size delta is a RELATIVE cue — it needs a neighbour to compare
       against, so it says nothing in the two states a rating spends most of its life in: all-off
       (unrated, every form's initial state) and all-on (a top rating). A dashed outline is absolute:
       one glyph, seen alone, reads as "not filled". stroke-dasharray is an inherited SVG property, so
       setting it on the cae-icon host reaches the glyph inside without piercing encapsulation; the
       scale is kept as a secondary, redundant cue. Both survive forced-colors (which overrides colour
       VALUES, not keywords or geometry) — unlike opacity, which would have been suppressed.

       Gated to --one-glyph: a consumer who supplied BOTH icons already has an absolute shape cue and
       must not have their design silently overridden. */
    .cae-rating__icon--one-glyph {
      stroke-dasharray: 3 2.5;
      transform: scale(0.82);
    }
    .cae-rating__star--on .cae-rating__icon--one-glyph {
      stroke-dasharray: none;
      transform: none;
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
  /**
   * `cae-icon` glyph for an ON star. Empty → the built-in solid star, *unless* `[offIcon]` is set, in
   * which case the named-glyph branch is taken and `[offIcon]` supplies both states. `string` (not just
   * `CaeIconName`) per D-596.
   */
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
  /**
   * The committed value as this widget can actually present it — {@link value} clamped to the stars
   * that currently exist. **Every presentation concern reads this, never `value()` directly** (#823).
   *
   * `[stars]` is an input and can shrink *after* a value was written — the ordinary
   * `<cae-rating [stars]="config().starCount" [formControl]="ctrl">` shape does it whenever the saved
   * rating arrives before an async star count settles. Reading the raw value there put `aria-checked`
   * on a star that no longer exists, so the group reported "nothing selected" while the pixels showed
   * a rating, and the roving tab stop pointed at a removed element — leaving the enabled control with
   * **zero tab stops** and no keyboard way back in (WCAG 2.1.1 + 1.3.1).
   *
   * Deliberately presentation-only: a shrink does NOT emit a correction, because the user did not make
   * that change. (A *write* the widget cannot honour is different — `writeValue` echoes it back; see
   * there.) So the form may hold 5 while a 3-star group shows 3, and the next user interaction settles
   * it.
   */
  protected readonly effectiveValue = computed(() => {
    const v = this.value();
    return v == null ? null : Math.min(this.starList().length, v);
  });
  /** How many stars render "on" — the hover preview when hovering, else the committed value. */
  protected readonly displayValue = computed(
    // The hover term is gated on `interactive()`: hover state is only cleared by the group's
    // `mouseleave`, so a control that becomes disabled/readonly mid-hover would otherwise keep
    // painting a magnitude that contradicts its own `aria-checked`.
    () => (this.interactive() ? this.hoverValue() : null) ?? this.effectiveValue() ?? 0,
  );
  /** The star that is the roving tab stop: the selected one, or the first when nothing is selected. */
  private readonly focusOrdinal = computed(() => this.effectiveValue() ?? 1);

  private onChangeFn: (value: number | null) => void = () => {};
  protected onTouched: () => void = () => {};
  /**
   * The last value the *form* holds — set from `writeValue`'s RAW argument and from every emit. This
   * is the dedupe baseline, and it is deliberately not `value()`: the two differ exactly when the form
   * wrote something the widget had to normalise, which is when a correction most needs to get through.
   */
  private formValue: unknown = null;
  /** The star that last received focus — the witness a `[stars]` shrink checks for disconnection. */
  private lastFocusedStar: HTMLElement | null = null;

  constructor() {
    // A `[stars]` shrink removes star elements. Fixing the roving tabindex (see `effectiveValue`) put
    // the tab stop back on a star that exists, but it does nothing for a user whose focus was ON the
    // removed star: `@for` destroys the node and the browser drops focus to `<body>`, so their next
    // Tab restarts from the top of the document with nothing announced.
    afterRenderEffect(() => {
      this.starList(); // dependency: re-check whenever the rendered set changes
      const last = this.lastFocusedStar;
      // Keyed off the captured element being disconnected, NOT off `activeElement === body` alone —
      // that cannot tell "the element was removed" from "the user deliberately clicked away"
      // (`external-removal-focus-restore`). Both conditions must hold before we take focus back.
      if (last && !last.isConnected && document.activeElement === document.body) {
        this.lastFocusedStar = null;
        this.focusStar(this.focusOrdinal() - 1);
      }
    });
  }

  /** Remember which star holds focus, so a `[stars]` shrink can tell whether it destroyed it. */
  protected onFocusIn(event: FocusEvent): void {
    this.lastFocusedStar = event.target as HTMLElement | null;
  }

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
    this.setValue(this.allowCancel() && this.effectiveValue() === ordinal ? null : ordinal);
  }

  /**
   * `ordinal` is the star the event fired on — i.e. **the star that has focus**, which is the only
   * correct origin for a keyboard move (APG: Space activates the *focused* radio; arrows step from
   * where focus is). It used to be reconstructed as `value() ?? 0`, which agrees with focus only while
   * the two happen to coincide and diverges on the first keystroke that moves one without the other:
   * Space on star 1 of a 3-rated group re-selected 3, and with `[allowCancel]` the tab stop silently
   * migrated to star 1 while DOM focus stayed put, so the next Space wrote 1 and yanked focus (#823).
   */
  protected onKeydown(event: KeyboardEvent, ordinal: number): void {
    // A chord (Ctrl+Home jumps the document, Cmd+arrows are OS nav, etc.) is not ours to consume.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!this.interactive()) {
      // Readonly keeps its tab stop so a screen reader can read the value, which means these keys land
      // in a focused widget that will not act on them — and would then scroll the page. Swallow the
      // ones we own. Enter is excluded deliberately: it belongs to the surrounding form.
      if (SCROLL_KEYS.has(event.key)) event.preventDefault();
      return;
    }

    const n = this.starList().length;
    const current = ordinal;
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
        // Select (or cancel) the star that actually has focus.
        this.setValue(this.allowCancel() && this.effectiveValue() === ordinal ? null : ordinal);
        this.focusStar(ordinal - 1);
        // Enter selects but is NOT consumed: implicit form submission belongs to the form, and
        // swallowing it here made Enter behave differently depending on `[readonly]` — the readonly
        // branch deliberately lets it through, so the interactive branch must too. APG's radio
        // pattern specifies Space for activation and says nothing about Enter.
        if (event.key !== 'Enter') event.preventDefault();
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
    // Dedupe against what the FORM holds, not against `value()` — re-selecting the active star must
    // not emit (a native radio doesn't, and it would dirty a pristine form with an unchanged value,
    // firing unsaved-changes guards; holding an arrow at the clamp boundary emitted once per repeat).
    // Keying off `value()` instead would trap a form holding 9: the widget shows 5, so clicking star 5
    // would compare equal and the correction would never reach the form.
    if (value === this.formValue) return;
    this.formValue = value;
    this.onChangeFn(value);
  }

  // --- ControlValueAccessor ---
  /**
   * Normalises what the form wrote, and — per the owner's call on #823 — **echoes the normalised
   * value back** so the control and the widget cannot disagree. Without the echo the clamp was
   * display-only: a form holding `9`, `3.6`, `'3'` or `0` kept that value while the stars showed
   * something else, and `0` in particular satisfied `Validators.required` (which rejects only
   * null/undefined/''/[]) on a widget that looked unrated.
   *
   * Three constraints make this safe:
   * - **Deferred.** Angular's `setUpControl` calls `writeValue` *before* `registerOnChange`, so a
   *   synchronous echo would be swallowed on the initial bind; and on a later `patchValue` it would
   *   re-enter the form mid-update. A microtask lands after both — and it must read `onChangeFn`
   *   *when it runs*, never capture it at write time, or the initial bind is silently lost.
   * - **Only when it actually differs.** A well-formed write (`3` on a 5-star group) emits nothing, so
   *   the common path never touches the form's pristine state. Only a value the widget cannot honour
   *   is corrected — which is the observable trade-off the owner accepted.
   * - **Shape only, never range.** See {@link normalizeWritten}: an out-of-range value is preserved
   *   and merely displayed clamped, because `[stars]` may not have settled yet.
   *
   * Two limits worth knowing. Under `updateOn: 'blur' | 'submit'` the echo is only *staged* — Angular
   * defers `updateControl`, so `control.value` keeps the un-normalised value until the next blur or
   * submit. And the echo is not gated on {@link interactive}: a `readonly`/`disabled` rating still
   * reconciles its control, because that is normalisation rather than user interaction.
   */
  writeValue(value: number | null): void {
    // `undefined` and `null` are the same "no value" to a form, and an uninitialised `[(ngModel)]`
    // really does write `undefined` on first render — without canonicalising, `null === undefined`
    // is false, so every such control echoed once and came up `ng-dirty` before the user touched it.
    const raw = value ?? null;
    // The RAW argument is what the form holds — the dedupe baseline in `setValue` depends on it.
    this.formValue = raw;
    const normalized = normalizeWritten(raw);
    this.value.set(normalized);

    if (normalized === raw) return;
    queueMicrotask(() => {
      // A newer write may have superseded this one while the microtask was queued; only the latest
      // write may correct the form. `Object.is`, not `===`: `NaN === NaN` is false, so a plain
      // comparison skipped the echo for exactly the write that most needs it — leaving the form
      // holding NaN, which passes `Validators.required` on a widget rendering "unrated".
      if (Object.is(this.formValue, raw)) this.setValue(normalized);
    });
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
