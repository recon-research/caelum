/**
 * Waiting for a rendered state to **settle** before measuring it (#779).
 *
 * **Dev/test ONLY** — like `a11y.ts` and `theme.ts`, this file lives outside every secondary
 * entry point (no `ng-package.json`) and is excluded from the library build.
 *
 * **Why this exists.** axe judges `color-contrast` from **composited** colours. Sample while an
 * overlay is still fading in and it reads the blend, not the component: `confirm.browser.spec.ts`
 * failed CI on a settled **5.746:1** palette because the dialog was ~89% opaque at that instant,
 * which composites to 4.408 — under the 4.5 threshold. The tell was a single alpha (0.893 / 0.896 /
 * 0.889) recovered consistently from all three channels; a real palette defect does not blend
 * uniformly. It reddened an unrelated PR (#778) and passed on a re-run of the same sha.
 *
 * **Why waiting on focus is not enough.** "Focus has landed" *feels* like "the overlay has settled",
 * and is not — the `.cdk-overlay-backdrop` transition is still running when focus arrives, and on a
 * slower runner the container and surface transitions are too. That was true when Material deferred
 * `_trapFocus()` to the open animation, and it is *more* true since `CaeDialog` set
 * `delayFocusTrap: false` (#765): focus now lands at content-attach, i.e. before the animation has
 * even started. Hence a wait keyed to the animations themselves.
 *
 * **Why not a fixed delay.** A sleep long enough to be safe on the slowest runner is dead time on
 * every other run, and a sleep tuned to a fast box is the flake generator this repo already avoids
 * for #765. `getAnimations()` asks the browser what is actually in flight.
 */

/**
 * Resolve once every in-flight CSS transition/animation inside `root` has finished.
 *
 * Infinite animations are **excluded** — `cae-progress-spinner`'s indeterminate arc never
 * completes, so awaiting its `finished` promise would hang the test run forever rather than fail
 * it. Only animations with a finite `endTime` are waited on (pinned in `animation.spec.ts`).
 *
 * A no-op outside a real browser: jsdom implements neither CSS transitions nor the Web Animations
 * timeline, so there is nothing to wait for and no API to ask.
 */
export async function animationsSettled(root: Element | Document = document): Promise<void> {
  const el: Element = root instanceof Document ? root.documentElement : root;
  if (typeof el.getAnimations !== 'function') return;

  // One frame first: a transition that is queued but has not yet started is absent from
  // getAnimations(), so sampling immediately could find nothing and return before it begins.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const finite = el
    .getAnimations({ subtree: true })
    .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity));

  // A cancelled animation rejects `finished`; that is a settled state for our purposes.
  await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
}
