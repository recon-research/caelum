/**
 * Layer 1 automated accessibility verification — Book 16 §3.2 ("axe-core, broad and shallow").
 *
 * **Dev/test ONLY.** `axe-core` is MPL-2.0 (weak/file-level copyleft), admitted at the dev
 * tier and never shipped in Caelum's published package
 * (`provenance/allowlist.json` › `devCopyleftExceptions`; grounding
 * `research/notes/a11y-testing-tooling.md`). This file lives outside every secondary
 * entry point (no `ng-package.json`) and is excluded from the library build, so the
 * copyleft never reaches Caelum's distributed source.
 *
 * axe is **broad and shallow**: it catches the mechanical WCAG class — missing accessible
 * names, invalid ARIA, duplicate ids — in milliseconds. A green run is the *floor*, never
 * the proof (§3.2); keyboard operability (Layer 2, the CDK harness) and screen-reader
 * semantics (Layer 3) are verified separately.
 *
 * jsdom has no layout engine, so axe reports layout-dependent rules (e.g. `color-contrast`)
 * as `incomplete`, **not** as `violations` — this helper asserts on `violations` only, so it
 * never false-fails on a rule jsdom cannot evaluate.
 *
 * **This same helper is the browser harness.** Under Vitest browser mode the test runs *inside*
 * the page, so the plain `axe-core` import above is already the real-browser engine — there is no
 * separate `@axe-core/playwright` integration, and nothing here changes between environments.
 * What changes is the verdict: rules jsdom could only mark `incomplete` (contrast, and anything
 * needing layout) become real pass/fail. Put such a check in a `*.browser.spec.ts` file and run
 * `npm run test:browser` (#240); light/dark and density arms are still to come.
 *
 * **mat-form-field controls (input/textarea/select/…):** name them via `ariaLabel` in a Layer 1
 * spec, not the visible `[label]`. Material's MDC floating label is CSS-positioned, so with no
 * stylesheet applied axe judges the (correctly `for`-associated) `<label>` as *hidden* and the
 * `label` rule false-fires. `ariaLabel` puts a direct, CSS-independent accessible name on the
 * inner control; the visible-label path is verified in the real browser (#240).
 */
import * as axe from 'axe-core';

import { animationsSettled } from './animation';

export interface A11yCheckOptions {
  /**
   * axe rule ids to disable for this run. Use sparingly and only for a rule that cannot be
   * meaningfully evaluated in jsdom — never to paper over a real violation. Every disabled
   * rule should carry a comment naming why (and, ideally, the ticket that will cover it in a
   * real browser).
   */
  readonly disableRules?: readonly string[];
  /** Extra axe {@link axe.RunOptions}, merged last (wins over `disableRules`). */
  readonly runOptions?: axe.RunOptions;
}

function formatViolations(violations: axe.Result[]): string {
  return violations
    .map((v) => {
      const nodes = v.nodes
        .map((n) => `      - ${n.target.join(' ')}\n${n.failureSummary ?? ''}`)
        .join('\n');
      return `  [${v.impact ?? 'n/a'}] ${v.id} - ${v.help}\n    ${v.helpUrl}\n${nodes}`;
    })
    .join('\n\n');
}

/**
 * Runs the axe engine against `root` and asserts **zero violations**, throwing a readable
 * report (impact + rule id + help URL + each failing node's selector) when any is found — a
 * merge gate, not a dashboard (Book 16 §3.2).
 *
 * `root` defaults to `document.body` so overlay content rendered *outside* the fixture (dialogs,
 * menus, tooltips, the picker panels of Book 09) is still covered; pass a specific element to
 * scope the scan to one component's subtree.
 *
 * **Why `document.body` and not `document`** (#773). The default was `document`, which no caller
 * could actually use: the unit harness's own page has no `<title>` and no `lang` on `<html>`, so
 * every default-root scan failed on `document-title` + `html-has-lang` before reaching the
 * component. Those are page-level rules — an app's responsibility, unsatisfiable by a component
 * library rendering into a test fixture — so scoping one level down drops exactly the noise and
 * keeps every rule that grades rendered content, overlays included (they attach under `<body>`).
 *
 * **Waits for the render to settle first** ({@link animationsSettled}, #779). axe judges
 * `color-contrast` from *composited* colours, so scanning mid-fade grades the blend rather than
 * the component — a settled 5.746:1 read as 4.408 and reddened an unrelated PR. The wait lives
 * here, not in each caller, because the hazard belongs to "run axe after a state change" in
 * general, not to any one overlay; it is a no-op in jsdom.
 */
export async function expectNoA11yViolations(
  root: Element | Document = document.body,
  options: A11yCheckOptions = {},
): Promise<void> {
  const runOptions: axe.RunOptions = {
    ...(options.disableRules?.length
      ? {
          rules: Object.fromEntries(options.disableRules.map((id) => [id, { enabled: false }])),
        }
      : {}),
    ...options.runOptions,
  };

  await animationsSettled(root);

  const results = await axe.run(root, runOptions);

  if (results.violations.length > 0) {
    throw new Error(
      `expected no accessibility violations but found ${results.violations.length}:\n\n` +
        formatViolations(results.violations),
    );
  }
}
