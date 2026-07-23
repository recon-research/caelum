import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  contentChild,
  Directive,
  inject,
  input,
  TemplateRef,
} from '@angular/core';

/**
 * The template context every projected timeline template receives: `$implicit` and `item` are the
 * event being rendered (so `let-item` and `let-x="item"` both work), and `index` is its position.
 * Uniform across the three slots (`caeTimelineContent` / `caeTimelineOpposite` / `caeTimelineMarker`),
 * so a consumer learns it once — the same shape D-596's icon slot uses.
 */
export interface CaeTimelineContext<T> {
  /** The event this template is rendering (`let-item` binds this). */
  $implicit: T;
  /** The same event under its explicit name (`let-x="item"`). */
  item: T;
  /** The event's index in `[value]`. */
  index: number;
}

/**
 * `[caeTimelineContent]` — the main content of each event (the side of the rail opposite the
 * dates). Projected into `cae-timeline`; receives the {@link CaeTimelineContext}.
 */
@Directive({ selector: '[caeTimelineContent]' })
export class CaeTimelineContent<T = unknown> {
  readonly templateRef = inject<TemplateRef<CaeTimelineContext<T>>>(TemplateRef);
}

/**
 * `[caeTimelineOpposite]` — the content on the *opposite* side of the rail (typically a date/time).
 * Projected into `cae-timeline`; receives the {@link CaeTimelineContext}.
 */
@Directive({ selector: '[caeTimelineOpposite]' })
export class CaeTimelineOpposite<T = unknown> {
  readonly templateRef = inject<TemplateRef<CaeTimelineContext<T>>>(TemplateRef);
}

/**
 * `[caeTimelineMarker]` — replaces the default dot on the rail for each event (e.g. a status icon).
 * Projected into `cae-timeline`; receives the {@link CaeTimelineContext}. When present it is NOT
 * `aria-hidden` (a custom marker can carry meaning); the default dot is decorative.
 */
@Directive({ selector: '[caeTimelineMarker]' })
export class CaeTimelineMarker<T = unknown> {
  readonly templateRef = inject<TemplateRef<CaeTimelineContext<T>>>(TemplateRef);
}

/** Which side of the rail the content sits on. `alternate` flips it per event. */
export type CaeTimelineAlign = 'left' | 'right' | 'alternate';
/** Rail orientation. */
export type CaeTimelineLayout = 'vertical' | 'horizontal';

/**
 * `cae-timeline` — a data-driven event timeline (`reference/COMPARISON.md`: `p-timeline` →
 * `cae-timeline`, "CSS/flex + CDK"; Book 11 §3.1). Renders `[value]` as a semantic ordered list
 * (`<ol>`/`<li>`) with a marker + connector rail down (or across) the middle; each event's main
 * content and its opposite (date) content come from projected templates, and the default rail dot
 * can be replaced per event. Angular core only (NgTemplateOutlet); no Material, no CDK.
 *
 * **Layout & RTL.** `[layout]` is `vertical` (default) or `horizontal`; `[align]` is `left`
 * (default, single-sided), `right`, or `alternate` (two-sided, flipping each event). All spacing and
 * alignment use CSS *logical* properties (`padding-inline`, `text-align: start/end`, `margin-inline`)
 * and the flex main axis follows `direction`, so `alternate` and `horizontal` mirror correctly under
 * RTL with no directionality code. Colours/spacing/radii read from the `--cae-*` token bridge (D-04).
 *
 * **Accessibility.** The rail (connector + default dot) is decorative and `aria-hidden`; a custom
 * `caeTimelineMarker` is left announced (it may carry meaning). Ordered-list semantics convey the
 * sequence. Zoneless-compatible: `OnPush` + signal inputs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: {
    class: 'cae-timeline',
    '[class.cae-timeline--horizontal]': "layout() === 'horizontal'",
    '[class.cae-timeline--align-right]': "align() === 'right'",
    '[class.cae-timeline--align-alternate]': "align() === 'alternate'",
  },
  template: `
    <ol class="cae-timeline__list">
      @for (event of value(); track $index; let last = $last) {
        <li class="cae-timeline__event">
          <div class="cae-timeline__opposite">
            @if (opposite(); as tpl) {
              <ng-container
                [ngTemplateOutlet]="tpl.templateRef"
                [ngTemplateOutletContext]="context(event, $index)"
              />
            }
          </div>
          <div class="cae-timeline__separator">
            <span class="cae-timeline__marker">
              @if (marker(); as tpl) {
                <ng-container
                  [ngTemplateOutlet]="tpl.templateRef"
                  [ngTemplateOutletContext]="context(event, $index)"
                />
              } @else {
                <span class="cae-timeline__dot" aria-hidden="true"></span>
              }
            </span>
            @if (!last) {
              <span class="cae-timeline__connector" aria-hidden="true"></span>
            }
          </div>
          <div class="cae-timeline__content">
            @if (content(); as tpl) {
              <ng-container
                [ngTemplateOutlet]="tpl.templateRef"
                [ngTemplateOutletContext]="context(event, $index)"
              />
            }
          </div>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-timeline__list {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .cae-timeline__event {
      display: flex;
      align-items: stretch;
    }
    :host(:not(.cae-timeline--horizontal)) .cae-timeline__event {
      min-block-size: 3.5rem;
    }

    .cae-timeline__opposite,
    .cae-timeline__content {
      padding-block: var(--cae-space-1);
      padding-inline: var(--cae-space-3);
    }
    /* Default (left): the rail hugs the leading edge, content fills the trailing side, and the
       opposite cell takes only its own content's width. */
    .cae-timeline__opposite {
      flex: 0 0 auto;
      text-align: end;
      color: var(--cae-color-on-surface-variant);
    }
    .cae-timeline__content {
      flex: 1 1 auto;
    }

    .cae-timeline__separator {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .cae-timeline__marker {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .cae-timeline__dot {
      inline-size: 0.75rem;
      block-size: 0.75rem;
      border-radius: var(--cae-radius-full);
      background-color: var(--cae-color-primary);
    }
    .cae-timeline__connector {
      flex: 1 1 auto;
      inline-size: 2px;
      background-color: var(--cae-color-border);
    }

    /* align right: content on the leading side. */
    :host(.cae-timeline--align-right) .cae-timeline__event {
      flex-direction: row-reverse;
    }
    :host(.cae-timeline--align-right) .cae-timeline__content {
      text-align: end;
    }

    /* alternate: two-sided; both cells share width and flip on even events. */
    :host(.cae-timeline--align-alternate) .cae-timeline__opposite {
      flex: 1 1 0;
    }
    :host(.cae-timeline--align-alternate) .cae-timeline__event:nth-child(even) {
      flex-direction: row-reverse;
    }
    :host(.cae-timeline--align-alternate)
      .cae-timeline__event:nth-child(even)
      .cae-timeline__content {
      text-align: end;
    }
    :host(.cae-timeline--align-alternate)
      .cae-timeline__event:nth-child(even)
      .cae-timeline__opposite {
      text-align: start;
    }

    /* horizontal: the rail runs across; events stack their cells in a column, the connector goes
       along the inline axis. */
    :host(.cae-timeline--horizontal) .cae-timeline__list {
      flex-direction: row;
    }
    :host(.cae-timeline--horizontal) .cae-timeline__event {
      flex-direction: column;
      min-inline-size: 8rem;
    }
    :host(.cae-timeline--horizontal) .cae-timeline__separator {
      flex-direction: row;
    }
    :host(.cae-timeline--horizontal) .cae-timeline__connector {
      inline-size: auto;
      block-size: 2px;
    }
    :host(.cae-timeline--horizontal) .cae-timeline__opposite {
      text-align: start;
    }
  `,
})
export class CaeTimeline<T = unknown> {
  /** The events to render, in order. */
  readonly value = input<readonly T[]>([]);
  /** Which side of the rail the content sits on (default `left`; `alternate` flips per event). */
  readonly align = input<CaeTimelineAlign>('left');
  /** Rail orientation (default `vertical`). */
  readonly layout = input<CaeTimelineLayout>('vertical');

  /** The projected content / opposite / marker templates, if provided by the consumer. */
  protected readonly content = contentChild(CaeTimelineContent);
  protected readonly opposite = contentChild(CaeTimelineOpposite);
  protected readonly marker = contentChild(CaeTimelineMarker);

  /** Build the per-event template context (the same `{ $implicit, item, index }` shape everywhere). */
  protected context(item: T, index: number): CaeTimelineContext<T> {
    return { $implicit: item, item, index };
  }
}
