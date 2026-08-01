import { isDevMode } from '@angular/core';

/**
 * Keep focus out of a region that has just been hidden (#870) — shared by {@link CaePanel} and
 * {@link CaeFieldset}, which collapse identically (`[hidden]` on the content region).
 *
 * **The hazard.** Neither component can *cause* this from its own toggle: both toggles sit outside
 * their own content region, so clicking one always leaves focus on it. It is reachable from a
 * control *inside* the region (a "Done" button that collapses its own panel — the shape Forge
 * demonstrates), and from anything programmatic: a timer, a route change, an external control on a
 * browser that does not focus buttons on click. The engine then blurs the now-unrendered element
 * and focus resets to `<body>`, so the keyboard user loses their place (WCAG 2.4.3).
 *
 * Note an external *button* usually cannot reach it on Chromium/Firefox: `mousedown` focuses the
 * button, so focus has already left the region by the time the handler writes `collapsed`.
 *
 * **Prior art — this is convergent, not novel.** `MatExpansionPanelHeader` does the same thing by a
 * different mechanism: `panel.closed` filtered on `_containsFocus()` (itself `activeElement` +
 * `contains`), landing on the header via `focusVia(el, 'program')` — which passes no options, so no
 * `preventScroll` either (measured in `@angular/material/fesm2022/expansion.mjs`). `cae-panel`
 * cannot inherit that because it composes `MatCard`, not `MatExpansionPanel`. `p-panel` is
 * **unmeasured** — primeng is not installed here, and PATTERNS §16 asks for source, not assumption.
 *
 * **Why the timing works, and why it is narrow.** Measured in Chromium while pinning
 * `panel.browser.spec.ts`: the engine defers its focus fixup to the next *rendering opportunity*,
 * so synchronously after the model write and change detection `document.activeElement` is **still**
 * the now-hidden element, and only a frame later is it `<body>`. `afterRenderEffect` runs inside
 * that window — after the DOM carries `hidden`, before the browser is handed control — which is the
 * one moment the question "was focus inside me?" is still answerable. A frame later it is not:
 * `activeElement === body` can no longer distinguish a collapse from a deliberate park (the
 * `external-removal-focus-restore` problem). #870 assumed this window was already closed and that a
 * pre-write capture would be needed; the browser spec measures it open instead. **The browser arm is
 * what holds that claim** — jsdom has no focus fixup at all, so every jsdom test here passes either
 * way, and the mutation that proves it is deferring this call by one `requestAnimationFrame`.
 *
 * **Scope: `contains()` is *tree* containment.** That is what makes it answer correctly for a region
 * already carrying `hidden`, and it tolerates the `null` `activeElement` can be. It also bounds the
 * contract: focus that a consumer has moved into a CDK overlay opened from inside the region lives
 * in `.cdk-overlay-container` on `<body>`, so it is not contained and this declines (#954).
 *
 * **No `preventScroll`** — deliberately, and it is D-853's rule rather than an exception to it. The
 * evidence the decision asks for is that *the focus target* is on screen; what we have here is
 * evidence the **region** was, which is not the same claim when the panel is taller than the
 * viewport and the user was at the bottom of it. Suppressing the scroll there leaves the ring
 * somewhere the user cannot see (WCAG 2.4.7). Material's equivalent omits it too.
 *
 * @param region the collapsible content region, from the component's own view (never a
 *   `querySelector` on the host: a nested panel's toggle would match an outer panel's lookup and
 *   focus would land in the wrong component). Passing the *host* instead would be a subtler bug —
 *   the toggle is inside the host, so every collapse-by-click would re-`focus()` the already-focused
 *   toggle and re-run its scroll-into-view. Both are pinned in the spec.
 * @param toggle the component's own disclosure button, when `[toggleable]` rendered one
 * @param selector the component's element name, for the warning
 */
export function redirectFocusOutOfCollapsedRegion(
  region: HTMLElement | undefined,
  toggle: HTMLElement | undefined,
  selector: 'cae-panel' | 'cae-fieldset',
): void {
  // Resolved against the region's OWN root, not the global document. `document.activeElement`
  // retargets to the outermost shadow host on the path to the focused node, so with the panel
  // mounted inside a `ViewEncapsulation.ShadowDom` consumer (or an Angular Element) it returns an
  // ANCESTOR of the region — `contains()` is then false and this declines silently, skipping the
  // warning too. `getRootNode()` is the fix that works in both directions: in light DOM it is
  // `document` and this is byte-identical, and it preserves the case that already worked (a shadow
  // tree *inside* the region, where the retargeted host is a descendant). CDK's
  // `_getFocusedElementPierceShadowDom` is the wrong tool here — it pierces DOWN, and `contains()`
  // does not cross shadow boundaries, so it would break that second case.
  const root = region?.getRootNode() as DocumentOrShadowRoot | undefined;
  if (!region?.contains(root?.activeElement ?? null)) return;

  if (toggle) {
    toggle.focus();
    return;
  }

  // Nothing to land on: `[collapsed]` is deliberately not gated on `[toggleable]`, so a component
  // with no disclosure of its own can still be driven from outside. Inventing a focus target here
  // (a `tabindex="-1"` host) would be a focusable non-interactive element whose announcement no one
  // in this repo can verify — so the honest move is to make the remaining gap loud instead of
  // papering it over. The consumer owns the affordance and owns where focus goes with it (#951).
  if (isDevMode()) {
    console.warn(
      `${selector}: the content region collapsed while focus was inside it, and this instance has ` +
        'no toggle to move focus to — focus will reset to <body>, so the keyboard user loses their ' +
        'place (WCAG 2.4.3). Move focus deliberately before collapsing from an external control, ' +
        'or add [toggleable].',
    );
  }
}
