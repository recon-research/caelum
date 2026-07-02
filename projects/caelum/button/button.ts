import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

/** Appearance variants Caelum surfaces — 1:1 with Material's `matButton`. */
export type CaeButtonVariant = 'filled' | 'tonal' | 'elevated' | 'outlined' | 'text';

/**
 * `cae-button` — the Direct (1:1) wrapper over Material's `matButton`
 * (`reference/COMPARISON.md`: `p-button` → `cae-button`). A thin, stable Caelum API
 * seam so a team leaving PrimeNG swaps `p-button` for `cae-button` without binding to
 * Material directly (D-01/D-02; Book 20 §2.1). Colours flow from the token bridge
 * (`--mat-sys-*` ← `--cae-*`), so there is nothing to theme here. Zoneless-compatible:
 * `OnPush` + signal inputs, no zone-coupled APIs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  template: `
    <button
      [matButton]="variant()"
      [type]="type()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel() || null"
    >
      <ng-content />
    </button>
  `,
  styles: `
    :host {
      display: inline-block;
    }
  `,
})
export class CaeButton {
  /** Material button appearance. Defaults to `filled` — the primary action. */
  readonly variant = input<CaeButtonVariant>('filled');
  /** Native button type; `submit` participates in an enclosing `<form>`. */
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  /** Disable the button (coerced, so bare `<cae-button disabled>` works). */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Accessible name — set for icon-only or otherwise ambiguously-labelled buttons. */
  readonly ariaLabel = input('');
}
