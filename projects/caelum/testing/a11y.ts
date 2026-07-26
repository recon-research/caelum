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

/**
 * The focusable element a `mat-form-field` hangs `aria-describedby` on, across all five control
 * families: `<input>` (input/autocomplete), `<textarea>`, and the `role="combobox"` host that
 * `mat-select` renders (select/multi-select). Deliberately a union rather than a per-call
 * parameter — the point of this helper is that all five share one contract.
 */
const FIELD_CONTROL = 'input, textarea, [role="combobox"]';

/**
 * Asserts a `mat-form-field`-wrapping control **announces** its validation failure, then scans the
 * subtree with axe. Use it in the control's error state — never the pristine one (#785).
 *
 * **Why this exists as a helper** (#785). The error state is where the `CaeFormFieldControlBase`
 * family's least-obvious contract lives: `matInput` *suppresses* `aria-invalid` on an empty
 * required field, so the linked `<mat-error>` text is the only thing that announces the failure.
 * Break the link and the field is silently invalid to a screen-reader user while looking perfectly
 * correct to everyone else. All five subclasses inherit that same bridge, so the check is
 * identical five times over — and the half that would rot silently (*referenced*, not merely
 * *rendered*) is the half a copy-paste is most likely to drop.
 *
 * **Both assertions are anti-vacuity guards, in opposite directions:**
 * - *rendered* — without it, axe below would grade a pristine field and prove nothing;
 * - *referenced* — the actual contract; an unlinked `<mat-error>` looks fine and is inaudible.
 *
 * Matching is on the whole `aria-describedby` token list, not a substring: `mat-mdc-error-1` is a
 * substring of `mat-mdc-error-10`, so a `contains` check can pass against the wrong id.
 *
 * Note for the capability ledger: it greps specs for a literal `expectNoA11yViolations(` call, so a
 * spec whose *only* axe coverage came through this wrapper would read as uncovered. That direction
 * is the safe one (a false gap, never a false pass), and no spec is in that position today.
 */
export async function expectAnnouncedErrorState(
  root: HTMLElement,
  expectedMessage: string,
  options: A11yCheckOptions = {},
): Promise<void> {
  const control = root.querySelector(FIELD_CONTROL);
  if (!control) {
    throw new Error(
      `expectAnnouncedErrorState found no form-field control under the given root (looked for: ` +
        `${FIELD_CONTROL}). Pass the fixture's nativeElement; a control that matches none of these ` +
        `would make every assertion below vacuous, so this fails loudly rather than skipping.`,
    );
  }

  const error = root.querySelector('mat-error');
  const rendered = error?.textContent?.trim();
  if (rendered !== expectedMessage) {
    throw new Error(
      `expected the error message ${JSON.stringify(expectedMessage)} to be rendered, but found ` +
        `${error ? JSON.stringify(rendered) : 'no <mat-error> at all'}. The control is not in its ` +
        `error state, so the axe scan would grade a pristine field and prove nothing.`,
    );
  }

  const describedBy = error!.id ? (control.getAttribute('aria-describedby') ?? '') : '';
  if (!error!.id || !describedBy.split(/\s+/).includes(error!.id)) {
    throw new Error(
      `<mat-error id=${JSON.stringify(error!.id)}> is rendered but NOT referenced by the control: ` +
        `<${control.tagName.toLowerCase()} aria-describedby=${JSON.stringify(describedBy)}>. The ` +
        `message is visible but inaudible — a screen-reader user gets no announcement, which is ` +
        `the whole defect class this assertion exists to catch.`,
    );
  }

  await expectNoA11yViolations(root, options);
}
