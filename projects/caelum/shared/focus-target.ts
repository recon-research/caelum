import type { ElementRef } from '@angular/core';

/**
 * What a Caelum **focus-restore input** accepts: the element focus should land on when a component
 * is about to destroy the element that currently has it. Bound as a raw `HTMLElement` (a `#ref`
 * template variable), an `ElementRef`, or a `viewChild()` **result**. `null`/`undefined` are
 * tolerated so a query that has not resolved yet is not an error.
 *
 * Type-only: `import type` keeps `caelum/shared` free of runtime code (see the entry point's
 * `public-api.ts`, and `size-budget.json`'s note contrasting it with `caelum/form-field`).
 *
 * ---
 *
 * ## The convention this type carries
 *
 * Two rules apply at **every** call site that unwraps a `CaeFocusTarget`. Both exist because the
 * value crosses a trust boundary — a template binding is consumer-authored, and consumers may not
 * compile with `strictTemplates`.
 *
 * **1. Focus a consumer-named target *without* `preventScroll` (#864 → decision #944).**
 * The dividing line is **evidence that the element is on screen**, not who picked it. Every
 * in-component site that keeps `preventScroll` is *returning* focus somewhere the user demonstrably
 * was moments earlier: `cae-chip-set`'s two anti-steal restores (#551/#556) replay a `heldBy`
 * captured from `document.activeElement`, and `cae-grid`'s pager rescue lands on the button beside
 * the one just pressed. Suppressing a scroll jump toward a place the user was already looking is
 * the point of those calls.
 *
 * A `CaeFocusTarget` carries no such evidence — it is an element the *consumer* named sight-unseen,
 * possibly far above the fold. Suppressing the scroll there moves focus to a control with no
 * perceivable focus indicator anywhere on screen: the indicator exists, but the user cannot see it
 * (WCAG 2.4.7 Focus Visible). So:
 *
 * ```ts
 * el.focus();                            // consumer-named → let the browser scroll to it
 * heldBy.focus({ preventScroll: true }); // user was just here → no gratuitous jump
 * ```
 *
 * **2. Guard that `.focus` is callable before calling it (#865).**
 * The one binding shape that type-checks nowhere and fails at runtime is a bound `viewChild`
 * **signal** rather than its result — `[dismissFocusTarget]="landingRef"` instead of
 * `"landingRef()"`. The unwrap then yields a *function*, and `el.focus()` throws
 * `TypeError: el.focus is not a function` from inside a focus-restore path, where an exception is
 * least expected and most destructive (it aborts the dismissal mid-flight). Caelum's own templates
 * are compiled with `strictTemplates` since #858, so this cannot originate here — but a consumer
 * app without it, or any JavaScript consumer, reaches the runtime unguarded. Check
 * `typeof el.focus === 'function'` and dev-warn naming the fix, rather than throwing.
 */
export type CaeFocusTarget = HTMLElement | ElementRef<HTMLElement> | null | undefined;
