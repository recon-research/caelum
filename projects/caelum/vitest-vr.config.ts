/// <reference types="@vitest/browser-playwright" />
import { defineConfig } from 'vitest/config';

/**
 * Runner config for the **visual-regression** target (`caelum:test-vr`, #732).
 *
 * `@angular/build:unit-test` exposes no knob for the screenshot matcher, but it does take a
 * `runnerConfig` path and merge it — that is the only seam through which `toMatchScreenshot`
 * can be configured, and the reason this file exists at all.
 *
 * **Comparison is strict on purpose.** `allowedMismatchedPixels` is left at its default
 * (`undefined` — *any* non-zero difference fails) and `threshold` is pinned to `0` rather than
 * the library default of `0.1`. A per-pixel colour tolerance is exactly the shape of a gate that
 * has to be loosened every time it fires, and a suite that tolerates "small" colour drift cannot
 * detect the regression this suite exists for: a token resolving to a slightly wrong value.
 * If a golden proves genuinely unstable, the fix is to remove the instability (a font, an
 * animation, a caret) — not to widen the tolerance.
 *
 * `includeAA: true` keeps anti-aliased pixels *in* the comparison for the same reason: pixelmatch
 * would otherwise silently ignore precisely the pixels that differ when text rasterizes
 * differently, which would make the #735 portability measurement report a false agreement.
 */
export default defineConfig({
  test: {
    browser: {
      expect: {
        toMatchScreenshot: {
          comparatorName: 'pixelmatch',
          comparatorOptions: { threshold: 0, includeAA: true },
          // The matcher polls for a *stable* screenshot until this elapses. `vr.ts` freezes
          // animation, transition and caret, so a stable frame exists on the first capture and
          // polling only delays the verdict: at the 5s default a genuine regression took the full
          // 15s test timeout to report, four times over. Nothing here legitimately needs 1.5s.
          timeout: 1500,
          // Goldens do NOT go in the default `__screenshots__/`: that directory is where Vitest
          // drops *failure* captures, and #240 gitignored it for exactly that reason. Writing
          // goldens there would leave them untracked — the suite would pass forever locally and
          // have nothing to compare against in CI. `__vr__/` is committed; `__screenshots__/`
          // stays ignored. (Diffs keep their default `attachmentsDir` home, also ignored.)
          resolveScreenshotPath: ({ root, testFileDirectory, arg, browserName, platform, ext }) =>
            `${root}/${testFileDirectory}/__vr__/${arg}-${browserName}-${platform}${ext}`,
        },
      },
    },
  },
});
