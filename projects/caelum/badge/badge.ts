import { Directive } from '@angular/core';
import { MatBadge } from '@angular/material/badge';

/**
 * `caeBadge` — the Direct (1:1) wrapper over Material's `matBadge`
 * (`reference/COMPARISON.md`: `p-badge` / `pBadge` → `cae-badge`; Book 11). An attribute
 * directive, not a component (like `caeTooltip`): it composes `MatBadge` as a `hostDirective`
 * and re-exposes its inputs under `cae*` names, so a team leaving PrimeNG writes
 * `[caeBadge]="count"` on any element (a button, icon, or text) without importing Material
 * directly (D-01/D-02). Zero logic — the aliasing is the whole wrapper; the small overlay
 * count, its position/size, and theming are Material's, unchanged.
 *
 * **a11y — set `caeBadgeDescription`.** A bare numeric badge (e.g. `[caeBadge]="5"`) is a
 * *visual* count only; the "5" is decorative to a screen reader. Forward an accessible
 * description of what the number means — `caeBadgeDescription="5 unread notifications"` —
 * which Material renders as a visually-hidden label the host is `aria-describedby`-linked to.
 * Without it the badge conveys nothing to non-visual users. Use `caeBadgeHidden` to keep the
 * host mounted while removing the badge (e.g. when the count reaches 0) rather than toggling
 * the whole element.
 *
 * Theming is through the token bridge — no `color` input is exposed (Material's `matBadgeColor`
 * is intentionally omitted; the badge resolves `--mat-sys-*` ← `--cae-*`, and `matBadgeColor` is
 * inert under M3 themes anyway). This drops p-badge's `severity` colour semantics
 * (success/info/warn/danger) — a tracked gap (#129), to resolve alongside the cae-button
 * danger/severity colour seam (#105). A standalone `<p-badge>`-style component (a badge with no
 * host element) is likewise a parity extra not covered here (#129); wrap any element with
 * `[caeBadge]` for the `pBadge` overlay case.
 */
@Directive({
  selector: '[caeBadge]',
  hostDirectives: [
    {
      directive: MatBadge,
      inputs: [
        'matBadge: caeBadge',
        'matBadgePosition: caeBadgePosition',
        'matBadgeSize: caeBadgeSize',
        'matBadgeOverlap: caeBadgeOverlap',
        'matBadgeHidden: caeBadgeHidden',
        'matBadgeDisabled: caeBadgeDisabled',
        'matBadgeDescription: caeBadgeDescription',
      ],
    },
  ],
})
export class CaeBadge {}
