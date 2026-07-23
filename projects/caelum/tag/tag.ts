import { NgTemplateOutlet } from '@angular/common';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  input,
  TemplateRef,
} from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import {
  caeItemIconContext,
  CaeIcon,
  type CaeIconName,
  type CaeItemIconContext,
} from 'caelum/icon';

/**
 * Tag severity. Maps to the existing `--cae-color-*` tokens — `success`/`warn`/`danger` to
 * success/warn/error, and `info` to `primary` (there is no dedicated info token; #662). Absent = the
 * neutral surface tag.
 */
export type CaeTagSeverity = 'success' | 'info' | 'warn' | 'danger';

/**
 * `cae-tag` — a static, non-interactive status label (`reference/COMPARISON.md`: `p-tag` →
 * `cae-tag`, "`MatChip` (static)", tier Compose; Book 11 §3.1). It **composes Material's `mat-chip`
 * in its presentational configuration** — deliberately not a second `cae-chip` (that one is the
 * interactive/removable chip) and not a new severity palette. A standalone `mat-chip` defaults its
 * `role` to `null` and joins no chip set, so it renders as a plain, non-focusable pill; ripple is
 * disabled so it carries no interactive affordance at all.
 *
 * **Severity colour** comes from the existing token bridge (D-04): the tag re-tints the chip through
 * Material's own `--mat-chip-*` theming seam, mixing the severity token with the surface for the
 * background. The label text stays a **neutral, high-contrast `--cae-color-on-surface`** (a saturated
 * severity colour as text on its own light tint fails WCAG 1.4.3 for mid-tone hues like amber — #662
 * review), so severity reads from the background hue and the decorative icon, never the text colour,
 * in both schemes. `[rounded]` swaps the corner radius to `--cae-radius-full`.
 *
 * **Icon** follows the D-596 per-item convention: `[icon]` renders a registry glyph via `cae-icon`,
 * and `[iconTemplate]` is the custom-glyph escape hatch, receiving the tag's `[value]` as its
 * `{ $implicit, item }` context. The label is `[value]` (or projected `<ng-content>` for rich
 * content). Zoneless-compatible: `OnPush` + signal inputs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatChipsModule, NgTemplateOutlet, CaeIcon],
  template: `
    <mat-chip
      class="cae-tag__chip"
      [disableRipple]="true"
      [class.cae-tag--rounded]="rounded()"
      [class.cae-tag--success]="severity() === 'success'"
      [class.cae-tag--info]="severity() === 'info'"
      [class.cae-tag--warn]="severity() === 'warn'"
      [class.cae-tag--danger]="severity() === 'danger'"
    >
      @if (iconTemplate(); as tpl) {
        <ng-container
          [ngTemplateOutlet]="tpl"
          [ngTemplateOutletContext]="iconContext(value() ?? null, 0)"
        />
      } @else if (icon(); as ic) {
        <cae-icon [name]="ic" />
      }
      <span class="cae-tag__label">
        @if (value(); as v) {
          {{ v }}
        } @else {
          <ng-content />
        }
      </span>
    </mat-chip>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .cae-tag__chip {
      /* Neutral, AA-contrast text on a severity-tinted background (see the class doc): the label is
         always on-surface, severity lives in the background hue + the decorative icon. */
      --mat-chip-elevated-container-color: var(--cae-surface-raised);
      --mat-chip-label-text-color: var(--cae-color-on-surface);
      /* Static label — suppress the hover state-layer a standard mat-chip would otherwise show, so
         the tag carries no interactive affordance (ripple is already disabled). */
      --mat-chip-hover-state-layer-opacity: 0;
    }
    .cae-tag__label {
      display: inline-flex;
      align-items: center;
      gap: var(--cae-space-1);
      font-size: var(--cae-text-sm);
      font-weight: var(--cae-weight-medium);
    }
    /* The icon is decorative (cae-icon is aria-hidden), so its colour carries no contrast duty — it's
       a pure severity accent. Material's --mat-chip-with-icon-icon-color only reaches its own
       matChipAvatar/graphic slots, NOT a plain projected cae-icon, so colour the glyph directly. */
    .cae-tag__chip cae-icon {
      color: var(--cae-color-on-surface-variant);
    }

    .cae-tag--rounded {
      --mat-chip-container-shape-radius: var(--cae-radius-full);
    }

    .cae-tag--success {
      --mat-chip-elevated-container-color: color-mix(
        in srgb,
        var(--cae-color-success) 24%,
        var(--cae-surface-base)
      );
    }
    .cae-tag--success cae-icon {
      color: var(--cae-color-success);
    }
    /* info → primary: there is no --cae-color-info token (#662). */
    .cae-tag--info {
      --mat-chip-elevated-container-color: color-mix(
        in srgb,
        var(--cae-color-primary) 24%,
        var(--cae-surface-base)
      );
    }
    .cae-tag--info cae-icon {
      color: var(--cae-color-primary);
    }
    .cae-tag--warn {
      --mat-chip-elevated-container-color: color-mix(
        in srgb,
        var(--cae-color-warn) 24%,
        var(--cae-surface-base)
      );
    }
    .cae-tag--warn cae-icon {
      color: var(--cae-color-warn);
    }
    .cae-tag--danger {
      --mat-chip-elevated-container-color: color-mix(
        in srgb,
        var(--cae-color-error) 24%,
        var(--cae-surface-base)
      );
    }
    .cae-tag--danger cae-icon {
      color: var(--cae-color-error);
    }
  `,
})
export class CaeTag {
  /** The label text. Alternatively project rich content via `<ng-content>`. */
  readonly value = input<string>();
  /** Severity colour (maps to `--cae-color-*`; `info` → primary). Absent = neutral. */
  readonly severity = input<CaeTagSeverity>();
  /** Fully-round the corners (`--cae-radius-full`) instead of the default chip radius. */
  readonly rounded = input(false, { transform: booleanAttribute });
  /** Leading glyph name (from the `caelum/icon` registry, D-596). */
  readonly icon = input<CaeIconName | (string & {})>();
  /** Custom-glyph escape hatch (D-596); receives `{ $implicit, item }` = the tag's `[value]`. */
  readonly iconTemplate = input<TemplateRef<CaeItemIconContext<string | null>>>();

  /** The D-596 context builder, single-homed in `caelum/icon` (#649). */
  protected readonly iconContext = caeItemIconContext;
}
