import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  input,
  isDevMode,
  model,
} from '@angular/core';
import { CaeIcon } from 'caelum/icon';

// Module-scoped id counter for the `aria-controls` target. Deterministic per load, never collides.
let nextUniqueId = 0;

/**
 * `cae-fieldset` — a **native** `<fieldset>` + `<legend>` group with an optional disclosure
 * (`reference/COMPARISON.md`: `p-fieldset` → `cae-fieldset`; Book 11 §3.1 rates the row
 * **Compose**, "build a `<fieldset>`+legend").
 *
 * It is a separate component from {@link CaePanel} rather than a flag on it because the two are
 * not the same widget wearing different paint. A `<legend>` is a **native accessible-name
 * mechanism**: it names the enclosed group, and screen readers repeat that name when the user
 * moves onto each control inside — "Billing details, Card number, edit". No `MatCard` and no
 * ARIA attribute reproduces that association; only the real element does. Use `cae-fieldset` to
 * group **form controls** and `cae-panel` for everything else.
 *
 * **`[legend]` is required.** A `<fieldset>` with no legend is an unnamed group — the one thing
 * this component exists to prevent — so the omission is a compile error rather than a silent a11y
 * defect. This is a deliberate divergence from `p-fieldset`, whose `legend` is optional (recorded
 * in `docs/MIGRATION.md`); it is the same call as `cae-drawer` supplying the modal semantics
 * Material omits (D-826). A *dynamically* empty legend still slips past the type system, so it is
 * caught by a dev-mode warning instead.
 *
 * The legend is plain text, not a projected slot: when `[toggleable]`, the legend's content becomes
 * the toggle `<button>`'s label, and anything interactive projected there would nest inside it.
 *
 * **The disclosure** shares `cae-panel`'s button/ARIA/`hidden` contract exactly — a real
 * `<button type="button">` (Enter/Space for free) with `aria-expanded` and `aria-controls`,
 * following the WAI-ARIA APG *Disclosure* pattern. One deliberate difference: here the **whole
 * legend is the trigger**, where the panel's header text is not. That is the shape `cae-panel`
 * rejects as `toggler="header"` — safe in this component precisely because the legend is a plain
 * string with no projection slot, so nothing interactive can ever nest inside the button.
 * Collapsing **hides** the content rather than removing it, so a grouped form keeps its values and
 * validation state across a collapse/expand cycle; `hidden` still takes it out of both the
 * accessibility tree and the tab order.
 *
 * Theme comes free through the token bridge. Zoneless-compatible: `OnPush` + signal inputs (D-12).
 *
 * @example
 * ```html
 * <cae-fieldset legend="Billing details" toggleable [(collapsed)]="billingCollapsed">
 *   <cae-input label="Card number" [(ngModel)]="card" />
 * </cae-fieldset>
 * ```
 */
@Component({
  selector: 'cae-fieldset',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeIcon],
  template: `
    <fieldset class="cae-fieldset">
      <legend class="cae-fieldset__legend">
        @if (toggleable()) {
          <button
            type="button"
            class="cae-fieldset__toggle"
            [class.cae-fieldset__toggle--expanded]="!collapsed()"
            [attr.aria-expanded]="!collapsed()"
            [attr.aria-controls]="contentId"
            (click)="toggle()"
          >
            <cae-icon class="cae-fieldset__chevron" name="chevron-down" aria-hidden="true" />
            {{ legend() }}
          </button>
        } @else {
          {{ legend() }}
        }
      </legend>
      <div class="cae-fieldset__content" [id]="contentId" [hidden]="collapsed()">
        <ng-content />
      </div>
    </fieldset>
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-fieldset {
      /* The UA default is min-inline-size: min-content, which stops the group ever shrinking below
         its widest control and silently breaks any flex/grid parent. Resetting it is the one
         non-obvious requirement of using a real fieldset. */
      min-inline-size: 0;
      margin: 0;
      /* Padding lives on the content box so it can collapse away with it. */
      padding: 0;
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      color: var(--cae-color-on-surface);
    }
    .cae-fieldset__legend {
      /* A native legend interrupts the fieldset border; the inline padding is the gap it burns
         through it, and the margin insets it from the corner radius. */
      padding-inline: var(--cae-space-2);
      margin-inline-start: var(--cae-space-2);
      font-family: var(--cae-font-heading);
      font-size: var(--cae-text-md);
      font-weight: var(--cae-weight-medium);
      line-height: var(--cae-line-heading);
    }
    .cae-fieldset__toggle {
      display: inline-flex;
      align-items: center;
      gap: var(--cae-space-1);
      /* Floor the hit target to the density-INVARIANT --cae-target-min (24px): a --cae-space-*
         floor collapses to 16px at [data-density=compact] and fails WCAG 2.5.8 (PATTERNS 10).
         BLOCK axis only. PATTERNS 10 adds min-inline-size to a text label only when it "can be
         narrower than 24px", and this one cannot: with padding: 0 its inline size is still the
         chevron (1em = 16px, density-invariant) + gap (4px) + the legend text. Measured at the
         worst case the API allows -- a one-glyph legend -- that is 25.44px, so an inline floor
         here would be inert. The browser spec measures that case rather than asserting it. */
      min-block-size: var(--cae-target-min);
      padding: 0;
      border: 0;
      border-radius: var(--cae-radius-sm);
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .cae-fieldset__toggle:focus-visible {
      outline: var(--cae-focus-ring-width) solid var(--cae-focus-ring-color);
      outline-offset: var(--cae-focus-ring-offset);
    }
    .cae-fieldset__chevron {
      flex: none;
      display: inline-flex;
    }
    /* Down when COLLAPSED (the "expand" affordance), rotated up when expanded -- matching
       Material's expansion indicator and p-panel, so this and cae-expansion-panel never point
       opposite ways in the same state (WCAG 3.2.4). Block-axis only, so nothing to mirror in RTL. */
    .cae-fieldset__toggle--expanded .cae-fieldset__chevron {
      transform: rotate(180deg);
    }
    .cae-fieldset__content {
      padding: var(--cae-space-4);
      font-size: var(--cae-text-sm);
      line-height: var(--cae-line-body);
    }
    /* Re-assert the UA rule for [hidden]. Any author 'display' on the content would otherwise beat
       the UA stylesheet regardless of specificity and leave collapsed content visible. */
    .cae-fieldset__content[hidden] {
      display: none;
    }
  `,
})
export class CaeFieldset {
  /**
   * The group's accessible name, rendered into the native `<legend>`. Required: see the class doc
   * — an unnamed group is the defect this component exists to prevent.
   */
  readonly legend = input.required<string>();
  /** Render the collapse toggle. Without it the fieldset is a plain named group. */
  readonly toggleable = input(false, { transform: booleanAttribute });
  /**
   * Whether the body is collapsed. Two-way: `[(collapsed)]`.
   *
   * **Bind it** (`[collapsed]="true"`) — never a bare `collapsed` attribute. A `model()` takes no
   * `booleanAttribute` transform, so the bare form arrives as `''`, which is falsy: the group
   * renders **expanded**, the opposite of the intent, with no error.
   *
   * As in {@link CaePanel} this is not gated on `[toggleable]` (an external control may drive it),
   * and collapsing while focus is inside the region drops focus to `<body>` — see that class's
   * `collapsed` doc for both corollaries.
   */
  readonly collapsed = model(false);

  /** `aria-controls` target — the collapsible region. */
  protected readonly contentId = `cae-fieldset-content-${nextUniqueId++}`;

  constructor() {
    if (isDevMode()) {
      afterRenderEffect(() => {
        // Hoisted by convention, not necessity: the read below happens in a condition, which is
        // evaluated on every run either way. Keeping it at the top means the dependency set stays
        // `{legend}` however the guard is later edited — a read that ends up inside a *branch* is
        // not a dependency on the paths that skip it, and the effect then silently stops re-running
        // (#710). What makes the check reactive at all is that this read is tracked; the spec pins
        // that by flipping the legend to empty AFTER first render and requiring the warning.
        const legend = this.legend();
        if (!legend.trim()) {
          console.warn(
            'cae-fieldset: [legend] is empty. The legend is the accessible name of the enclosed ' +
              'group — without it a screen reader announces the controls inside with no group ' +
              'context (WCAG 1.3.1, 3.3.2).',
          );
        }
      });
    }
  }

  /**
   * There is deliberately no separate `toggled` output: a `model()` already emits `collapsedChange`
   * on exactly this write, with the same value — `p-fieldset`'s `onAfterToggle` is `(collapsedChange)`.
   */
  protected toggle(): void {
    this.collapsed.set(!this.collapsed());
  }
}
