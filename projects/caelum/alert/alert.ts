import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  isDevMode,
  model,
} from '@angular/core';

/**
 * Alert severity. Maps to the existing `--cae-color-*` tokens — `success`/`warn`/`danger` to
 * success/warn/error, and `info` to `primary` (there is no dedicated info token; #662), exactly as
 * {@link CaeTagSeverity} does. Unlike `cae-tag`'s, this one is **not** optional: an alert with no
 * severity is a bordered box, which is what `cae-card` already is.
 *
 * Migrating from `p-message`? Its fourth value is `error`; here it is **`danger`** (matching
 * `cae-tag`). An unrecognised severity renders no glyph and no tint — dev mode warns.
 */
export type CaeAlertSeverity = 'info' | 'success' | 'warn' | 'danger';

/**
 * How the alert announces to assistive tech. Deliberately the same three words as
 * {@link CaeToastPoliteness} (`caelum/toast`) so a consumer learns the vocabulary once, even though
 * the mechanism differs — the toast forwards to Material's `LiveAnnouncer`, the alert *is* the live
 * region. `'assertive'` → `role="alert"` (interrupts), `'polite'` → `role="status"` (waits its
 * turn), `'off'` → no role at all, i.e. static page content that is never announced.
 */
export type CaeAlertPoliteness = 'assertive' | 'polite' | 'off';

/**
 * Decorative severity glyphs, 24×24, stroke-drawn — the same self-authored inline-SVG convention as
 * `cae-chip` and `cae-password` (US-origin / no-CDN discipline, D-05/D-10: `mat-icon` would pull the
 * Material Icons font off a Google CDN).
 *
 * Deliberately **not** added to the `caelum/icon` registry (D-596). That registry is the
 * *consumer-facing* glyph-supply seam — the names a consumer passes to `[icon]`. These four are
 * internal: the severity picks them, no input names them, so registering them would grow the public
 * `CaeIconName` union for nothing and make `caelum/alert` depend on `caelum/icon` to render its own
 * decoration. If a consumer ever needs an alert glyph of their own, the answer is the D-596
 * `iconTemplate` escape hatch, not four more registry keys.
 */
const SEVERITY_GLYPHS: Readonly<Record<CaeAlertSeverity, string>> = {
  info: 'M12 21 A9 9 0 1 0 12 3 A9 9 0 0 0 12 21 M12 11 V16.5 M12 7.5 V9',
  success: 'M12 21 A9 9 0 1 0 12 3 A9 9 0 0 0 12 21 M8 12.5 L11 15.5 L16.5 9.5',
  warn: 'M12 4 L21.5 20.5 H2.5 Z M12 10 V14.5 M12 16.75 V17.5',
  danger: 'M12 21 A9 9 0 1 0 12 3 A9 9 0 0 0 12 21 M9 9 L15 15 M15 9 L9 15',
};

/**
 * The severity's name, rendered visually-hidden inside the live region so severity reaches assistive
 * tech at all. Without it the tint and the (decorative) glyph are the *only* severity channels, both
 * of them visual — a screen-reader user would hear "Two warehouses have not reported stock" with no
 * indication it is a warning, which is WCAG 1.3.1, not merely a nicety. Override or suppress per
 * instance with {@link CaeAlert.severityLabel}.
 */
const SEVERITY_LABELS: Readonly<Record<CaeAlertSeverity, string>> = {
  info: 'Note',
  success: 'Success',
  warn: 'Warning',
  danger: 'Error',
};

/**
 * `cae-alert` — the **inline** status / validation message (`reference/COMPARISON.md`: `p-message` →
 * `cae-alert`, tier Build-S, #710). A real build, not a wrap: Material ships no first-party alert,
 * and `cae-toast` is not a substitute — it is transient, overlay-positioned, and announced through
 * `LiveAnnouncer`, a different pattern with a different a11y contract.
 *
 * ```html
 * <cae-alert severity="danger">Your session expired — sign in again.</cae-alert>
 * <cae-alert severity="success" dismissible [dismissFocusTarget]="heading">Workspace saved.</cae-alert>
 * ```
 *
 * **Severity is never conveyed by colour alone** (WCAG 1.4.1). Every alert renders a tinted
 * background *and* a severity glyph *and* its projected text; the text stays a neutral, high-contrast
 * `--cae-color-on-surface` rather than the severity hue, because a saturated mid-tone (amber most of
 * all) fails WCAG 1.4.3 as text on its own light tint — the finding that shaped `cae-tag` in #662.
 * Both of those channels are visual, though, so the severity's **name** is also rendered
 * visually-hidden inside the region ({@link severityLabel}) — otherwise assistive tech receives no
 * severity at all (WCAG 1.3.1). A dev-mode guard warns when an alert renders with no text.
 *
 * **The live region is {@link politeness}, and it is a real choice.** `danger` defaults to
 * `'assertive'` (`role="alert"`) because a failure that appears in response to a user action should
 * interrupt; every other severity defaults to `'polite'` (`role="status"`). Override per instance —
 * a persistent "this workspace is read-only" banner is page furniture and wants `'off'`, while a
 * validation summary the user is about to be sent back to may want `'assertive'` even at `warn`.
 * Only `'off'` suppresses the role: an unrecognised value falls back to `'status'`, because a
 * silently un-announced alert is the worst failure this component can produce.
 *
 * **Stated edge — a live region announces *changes*, and only reliably once it exists.** Screen
 * readers specifically handle a `role="alert"` node being **inserted after load with new text**, so
 * the common `@if (error()) { <cae-alert severity="danger"> }` shape announces. Three cases do not:
 * an alert already present at first paint (a live region's initial content is not a change),
 * re-inserting byte-identical text, and `role="status"` insertion, which is AT-dependent. For a
 * polite message that must be heard, keep the alert **mounted** — meaning {@link visible} stays
 * `true` and the *projected content* changes. Setting `visible` to `false` destroys the live-region
 * element, so re-showing it is an insertion, not an update. This is how live regions work, not a
 * wrapper limitation.
 *
 * **The region deliberately excludes the dismiss button.** `role` sits on an inner body element, so
 * the close control is *beside* the live region rather than inside it: `role="alert"`/`"status"`
 * both imply `aria-atomic="true"`, so anything inside is re-spoken on every change, and "…the card
 * expired. Close, button" is not the announcement anyone wants. The limit worth knowing: content you
 * *project* lands inside the region, so an alert carrying its own link or Retry button re-speaks it.
 * An alert that genuinely requires a response wants `alertdialog` — `cae-confirm` — not this.
 *
 * **Dismissal.** `[dismissible]` renders a close button floored to the density-invariant
 * `--cae-target-min` (WCAG 2.5.8 — `--cae-space-*` shrinks to 16px at `[data-density=compact]`).
 * Closing writes {@link visible} to `false`; the host stays in the DOM, so `[(visible)]="showBanner"`
 * re-shows the same element. Because the button that was clicked is then gone, focus would fall to
 * `<body>` (WCAG 2.4.3) — bind {@link dismissFocusTarget} to say where it should land instead.
 * Observe dismissal with `(visibleChange)`; there is deliberately no second `(dismissed)` output
 * that would fire on exactly the same occasions with strictly less information.
 *
 * Zoneless-compatible: `OnPush` + signal inputs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="cae-alert" [class]="'cae-alert--' + severity()">
        <!-- The live region: severity + message only. The dismiss button is deliberately OUTSIDE it. -->
        <div class="cae-alert__body" [attr.role]="role()">
          <!-- Skipped entirely for an unrecognised severity: an empty path is a phantom 1.25em box,
               and garbage path data logs a browser parse error (the cae-icon #649 shape). -->
          @if (glyph(); as d) {
            <svg class="cae-alert__glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path [attr.d]="d" />
            </svg>
          }
          @if (severityText(); as label) {
            <span class="cae-visually-hidden">{{ label }}:</span>
          }
          <div class="cae-alert__content"><ng-content /></div>
        </div>
        @if (dismissible()) {
          <button
            type="button"
            class="cae-alert__close"
            [attr.aria-label]="closeAriaLabel()"
            (click)="dismiss()"
          >
            <svg
              class="cae-alert__close-glyph"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 6 L18 18 M6 18 L18 6" />
            </svg>
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-alert {
      display: flex;
      align-items: flex-start;
      gap: var(--cae-space-3);
      padding: var(--cae-space-3);
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      /* Neutral, AA-contrast text on a severity-tinted background (see the class doc): severity lives
         in the background hue, the border, and the glyph — never in the text colour. */
      color: var(--cae-color-on-surface);
      font-size: var(--cae-text-sm);
      line-height: var(--cae-line-body);
    }
    .cae-alert__body {
      display: flex;
      align-items: flex-start;
      gap: var(--cae-space-2);
      /* Take the slack so the dismiss button sits hard against the trailing edge. */
      flex: 1 1 auto;
      min-inline-size: 0;
    }
    .cae-alert__glyph {
      flex: none;
      inline-size: 1.25em;
      block-size: 1.25em;
      /* Optical centring against the first line of text, which is 1em on a --cae-line-body leading. */
      margin-block-start: calc((1em * var(--cae-line-body) - 1.25em) / 2);
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .cae-alert__content {
      min-inline-size: 0;
    }
    /* Visually-hidden but AT-readable (the standard sr-only recipe, as in cae-table) — carries the
       severity, which is otherwise a purely visual channel. */
    .cae-visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }

    .cae-alert__close {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      /* Floor the hit target to the density-INVARIANT --cae-target-min (24px): a --cae-space-* floor
         collapses to 16px at [data-density=compact] and fails WCAG 2.5.8. */
      min-inline-size: var(--cae-target-min);
      min-block-size: var(--cae-target-min);
      padding: 0;
      border: 0;
      border-radius: var(--cae-radius-sm);
      background: none;
      color: inherit;
      cursor: pointer;
    }
    .cae-alert__close:focus-visible {
      outline: var(--cae-focus-ring-width) solid var(--cae-focus-ring-color);
      outline-offset: var(--cae-focus-ring-offset);
    }
    .cae-alert__close-glyph {
      inline-size: 1em;
      block-size: 1em;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
    }

    /* info → primary: there is no --cae-color-info token (#662). */
    .cae-alert--info {
      background: color-mix(in srgb, var(--cae-color-primary) 12%, var(--cae-surface-base));
      border-color: color-mix(in srgb, var(--cae-color-primary) 40%, var(--cae-surface-base));
    }
    .cae-alert--info .cae-alert__glyph {
      color: var(--cae-color-primary);
    }
    .cae-alert--success {
      background: color-mix(in srgb, var(--cae-color-success) 12%, var(--cae-surface-base));
      border-color: color-mix(in srgb, var(--cae-color-success) 40%, var(--cae-surface-base));
    }
    .cae-alert--success .cae-alert__glyph {
      color: var(--cae-color-success);
    }
    .cae-alert--warn {
      background: color-mix(in srgb, var(--cae-color-warn) 12%, var(--cae-surface-base));
      border-color: color-mix(in srgb, var(--cae-color-warn) 40%, var(--cae-surface-base));
    }
    .cae-alert--warn .cae-alert__glyph {
      color: var(--cae-color-warn);
    }
    .cae-alert--danger {
      background: color-mix(in srgb, var(--cae-color-error) 12%, var(--cae-surface-base));
      border-color: color-mix(in srgb, var(--cae-color-error) 40%, var(--cae-surface-base));
    }
    .cae-alert--danger .cae-alert__glyph {
      color: var(--cae-color-error);
    }
  `,
})
export class CaeAlert {
  /**
   * Severity — picks the tint, the border, the decorative glyph, and the visually-hidden label.
   * Typed to autocomplete the union while tolerating a `string` from a data-driven source (the
   * `cae-icon` D-596 convention); an unrecognised value renders neither glyph nor tint and warns in
   * dev mode. `p-message`'s `"error"` is `"danger"` here.
   */
  readonly severity = input<CaeAlertSeverity | (string & {})>('info');

  /**
   * How the message announces. Unset ⇒ derived from {@link severity}: `danger` announces
   * `'assertive'`, everything else `'polite'`. Pass `'off'` for static page furniture that should
   * never be announced — that is the *only* value which removes the role.
   */
  readonly politeness = input<CaeAlertPoliteness | (string & {})>();

  /**
   * The severity's name, rendered visually-hidden before the message so assistive tech receives the
   * severity at all — the tint and the glyph are both visual channels (WCAG 1.3.1). Unset ⇒ the
   * built-in English name (`Note`/`Success`/`Warning`/`Error`); pass your own for i18n, or `null` to
   * suppress it when the message already names its own severity ("Error: the card expired").
   */
  readonly severityLabel = input<string | null>();

  /** Render a close button (see the class doc for the focus contract it obliges). */
  readonly dismissible = input(false, { transform: booleanAttribute });

  /** Accessible name for the close button (the alert's own text is projected). */
  readonly closeAriaLabel = input('Close');

  /**
   * Whether the alert renders its content. Two-way: closing writes `false` here, and writing `true`
   * back re-shows the same host element. The host itself is never removed by us.
   *
   * Takes no attribute coercion (`model()` accepts no transform), so the bare attribute form
   * `<cae-alert visible>` passes the string `''` — falsy — and the alert never renders. Bind it, or
   * leave it alone. A same-turn write-back (setting it `true` again from inside a `(visibleChange)`
   * handler) is also not re-pushed: Angular's two-way binding compares against the last *expression*
   * value, which never changed, so the model stays `false`. Re-show asynchronously.
   */
  readonly visible = model(true);

  /**
   * Where focus should land when the close button removes itself — without this, the keyboard user
   * is dropped to `<body>` (WCAG 2.4.3). Accepts a raw `HTMLElement` (a `#ref` template variable),
   * an `ElementRef`, or a `viewChild()` result (bind it directly — `undefined` is tolerated).
   * A non-interactive target needs `tabindex="-1"` to be focusable; a dev-mode guard says so if the
   * focus call turns out to be a no-op.
   *
   * Unset ⇒ focus is left where the browser puts it, and dev mode warns — unlike `cae-chip-set`'s
   * `[emptyFocusTarget]`, this is not a "the consumer owns it" case: dismissal *always* destroys the
   * element that had focus, so there is no arrangement where doing nothing is correct.
   */
  readonly dismissFocusTarget = input<HTMLElement | ElementRef<HTMLElement> | null | undefined>(
    null,
  );

  private readonly host = inject(ElementRef<HTMLElement>);

  /** The resolved politeness — the explicit input, else the severity default. */
  protected readonly resolvedPoliteness = computed(
    () => this.politeness() ?? (this.severity() === 'danger' ? 'assertive' : 'polite'),
  );

  /**
   * The ARIA role carrying the live region. Fails **safe**: only an explicit `'off'` removes the
   * role, so a stringly-typed or misspelled politeness degrades to a polite live region rather than
   * to silence — an alert nobody hears is the worst outcome this component has.
   */
  protected readonly role = computed<'alert' | 'status' | null>(() => {
    const politeness = this.resolvedPoliteness();
    if (politeness === 'off') return null;
    return politeness === 'assertive' ? 'alert' : 'status';
  });

  /**
   * The decorative severity glyph's path data; `undefined` (→ render no `<svg>` at all) for an
   * unrecognised severity. Gated on OWN keys: a bare index would resolve `Object.prototype` names —
   * `'toString'`, `'constructor'` — to inherited truthy functions and stamp a garbage `d` attribute
   * (the `cae-icon` #649 finding; realistic input at this trust boundary, since severity commonly
   * comes from a server-driven row).
   */
  protected readonly glyph = computed(() => {
    const severity = this.severity();
    return Object.hasOwn(SEVERITY_GLYPHS, severity)
      ? SEVERITY_GLYPHS[severity as CaeAlertSeverity]
      : undefined;
  });

  /** The visually-hidden severity name; `null` suppresses it (explicitly, or for a junk severity). */
  protected readonly severityText = computed(() => {
    // One check covers both explicit cases: a string overrides the name, and `null` suppresses it
    // by being returned as-is. (A separate `explicit === null` early return was provably inert —
    // it produced the identical value on every input, and a mutation deleting it killed no test.)
    const explicit = this.severityLabel();
    if (explicit !== undefined) return explicit;
    const severity = this.severity();
    return Object.hasOwn(SEVERITY_LABELS, severity)
      ? SEVERITY_LABELS[severity as CaeAlertSeverity]
      : null;
  });

  constructor() {
    // Dev-only DX guards (#710). Both read their signals UNCONDITIONALLY at the top: a signal read
    // that happens only inside a warn branch is not a dependency on the clean path, so the effect
    // would never re-run to notice a later change — and a test asserting "does not warn" would pass
    // because the body never executed at all, not because the guard stayed quiet.
    //
    // afterRenderEffect keyed on visible(), NOT cae-tag's one-shot afterNextRender: an alert is
    // overwhelmingly rendered conditionally (`@if (error())`), so a first-render-only check would
    // read an absent element and pass vacuously on the exact shape that matters. Known limit: the
    // projected content is read from the DOM, which is not reactive, so a message emptied at runtime
    // while the alert stays mounted is not re-checked (#863).
    if (isDevMode()) {
      afterRenderEffect(() => {
        const visible = this.visible();
        const severity = this.severity();
        if (!visible) return;

        // An unrecognised severity silently loses EVERY channel at once — no glyph, no tint, and a
        // polite role where `danger` would have interrupted — while the text still reads fine, so
        // the empty-message guard below cannot see it. `p-message`'s "error" lands here.
        if (!Object.hasOwn(SEVERITY_GLYPHS, severity)) {
          console.warn(
            `cae-alert: unknown [severity="${severity}"] — no glyph and no tint render, so ` +
              `severity is conveyed by nothing at all. Built-in severities: ` +
              `${Object.keys(SEVERITY_GLYPHS).join(', ')} (PrimeNG's "error" is "danger" here).`,
          );
        }

        // A severity alert with NO text conveys its meaning by the tint and an aria-hidden glyph
        // alone — i.e. by colour only, WCAG 1.4.1 (the cae-tag #669 convention). Reads the RENDERED
        // content, not an input, because the message is always projected.
        const content = this.host.nativeElement.querySelector('.cae-alert__content');
        if (content && !content.textContent?.trim()) {
          console.warn(
            `cae-alert: [severity="${severity}"] with no message conveys status by colour ` +
              'alone (the glyph is decorative) — WCAG 1.4.1. Project text into the alert.',
          );
        }
      });
    }
  }

  /**
   * Close the alert: place focus first, then hide.
   *
   * Focus moves **synchronously, before** the model write, and deliberately not from a post-render
   * hook. `afterNextRender` bound to this component's injector is unregistered when its own view is
   * destroyed — which is exactly what the documented `@if (error()) { <cae-alert (visibleChange)=
   * "error.set(null)"> }` shape does — so the redirect would silently never run, dropping focus to
   * `<body>`: the WCAG 2.4.3 failure this method exists to prevent, with the dev warning stranded
   * inside the cancelled callback too. Moving focus first also needs no anti-steal guard: a consumer
   * handler reacting to `(visibleChange)` runs afterwards and simply wins, which is the right
   * precedence.
   */
  protected dismiss(): void {
    // Only redirect a focus we are actually about to destroy. Without this, a dismissal that never
    // held focus — Safari does not focus a button on mouse-down, and a screen-reader user may
    // activate it from the virtual cursor with focus parked at <body> — would yank focus out of
    // wherever the user really was (WCAG 3.2.5) and fire a spurious missing-target warning.
    if (this.host.nativeElement.contains(document.activeElement)) {
      this.placeFocus();
    }
    this.visible.set(false);
  }

  /** Land focus on the consumer's target, and dev-warn when the move silently fails (#206). */
  private placeFocus(): void {
    const target = this.dismissFocusTarget();
    const el = target instanceof ElementRef ? target.nativeElement : target;
    el?.focus({ preventScroll: true });

    if (!isDevMode()) return;
    if (!el) {
      console.warn(
        'cae-alert: [dismissible] with no [dismissFocusTarget] — dismissing dropped focus to ' +
          '<body> (WCAG 2.4.3). Bind [dismissFocusTarget] to the element focus should land on.',
      );
    } else if (document.activeElement !== el) {
      // A non-focusable target (a non-interactive element missing tabindex="-1") or one detached
      // from the DOM makes .focus() a silent no-op — the same as no redirect at all, but hidden.
      console.warn(
        'cae-alert: [dismissFocusTarget] did not receive focus — the element is likely not ' +
          'focusable (a non-interactive target needs tabindex="-1") or is detached from the DOM.',
      );
    }
  }
}
