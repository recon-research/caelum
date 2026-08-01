import { isDevMode } from '@angular/core';

/**
 * Keep focus out of a region that has just been hidden (#870) — shared by {@link CaePanel} and
 * {@link CaeFieldset}, which collapse identically (`[hidden]` on the content region).
 *
 * **The hazard.** Neither component can *cause* this: both toggles sit outside their own content
 * region, so the click path always leaves focus on the toggle. It is reachable only on the
 * **programmatic** path — an external control, a timer, or a route change writing `collapsed` while
 * `document.activeElement` is inside the region. The engine then blurs the now-unrendered element
 * and focus resets to `<body>`, so the next Tab restarts at the top of the document (WCAG 2.4.3).
 * `MatExpansionPanel` and `p-panel` both strand identically; this is Caelum exceeding them, the same
 * call as `cae-drawer` supplying the modal semantics Material omits (D-826).
 *
 * **Why the timing works, and why it is narrow.** Measured in Chromium while pinning
 * `panel.browser.spec.ts`: the engine defers its focus fixup to the next *rendering opportunity*,
 * so synchronously after the model write and change detection `document.activeElement` is **still**
 * the now-hidden element, and only a frame later is it `<body>`. `afterRenderEffect` runs inside
 * that window — after the DOM carries `hidden`, before the browser is handed control — which is the
 * one moment the question "was focus inside me?" is still answerable. A frame later it is not:
 * `activeElement === body` can no longer distinguish a collapse from a deliberate park (the
 * `external-removal-focus-restore` problem). #870 assumed this window was already closed and that a
 * pre-write capture would be needed; the browser spec measures it open instead, which is why this
 * is a post-render read and not a `collapsed`-write interceptor. **The browser arm is what holds
 * that claim** — jsdom has no focus fixup at all, so every jsdom test here passes either way.
 *
 * `contains()` is tree containment, so it answers correctly for a region already carrying `hidden`,
 * and tolerates the `null` that `document.activeElement` can be.
 *
 * **No `preventScroll`** — deliberately, and it is D-853's rule rather than an exception to it. The
 * evidence the decision asks for is that *the focus target* is on screen; what we have here is
 * evidence the **region** was, which is not the same claim when the panel is taller than the
 * viewport and the user was at the bottom of it. Suppressing the scroll there leaves the ring
 * somewhere the user cannot see (WCAG 2.4.7). The collapse is also a layout change by construction
 * — the content's height is going away — so there is no steady view to preserve.
 *
 * @param region the collapsible content region, from the component's own view (never a
 *   `querySelector` on the host: a nested panel's toggle would match an outer panel's lookup and
 *   focus would land in the wrong component)
 * @param toggle the component's own disclosure button, when `[toggleable]` rendered one
 * @param selector the component's element name, for the warning
 */
export function redirectFocusOutOfCollapsedRegion(
  region: HTMLElement | undefined,
  toggle: HTMLElement | undefined,
  selector: 'cae-panel' | 'cae-fieldset',
): void {
  if (!region?.contains(document.activeElement)) return;

  if (toggle) {
    toggle.focus();
    return;
  }

  // Nothing to land on: `[collapsed]` is deliberately not gated on `[toggleable]`, so a component
  // with no disclosure of its own can still be driven from outside. Inventing a focus target here
  // (a `tabindex="-1"` host) would be a focusable non-interactive element whose announcement no one
  // in this repo can verify — so the honest move is to make the remaining gap loud instead of
  // papering it over. The consumer owns the affordance and owns where focus goes with it.
  if (isDevMode()) {
    console.warn(
      `${selector}: the content region collapsed while focus was inside it, and this instance has ` +
        'no toggle to move focus to — focus will reset to <body> and the next Tab will restart at ' +
        'the top of the document (WCAG 2.4.3). Move focus deliberately before collapsing from an ' +
        'external control, or add [toggleable].',
    );
  }
}
