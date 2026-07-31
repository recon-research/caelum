import { defineConfig } from 'vitest/config';

/**
 * Shared runner config for the unit-test targets (`caelum:test`, `forge:test`) — #886.
 *
 * One knob, deliberately: `testTimeout`. The suite ran at vitest's 5000 ms default — 81
 * `has no axe violations` tests and no configured headroom anywhere. The heaviest of them,
 * datepicker's open-calendar overlay scan, measured **4835 ms on a passing windows-latest run**
 * (run 30605794693, job 91079060625, 2026-07-31) — 3.4% under the default — and timed out
 * (>5000 ms) on two colder runs of the same code: #886's three observed occurrences, twice
 * red-blocking PR #914's merge.
 *
 * 15 000 ms ≈ 3× that measured worst green case. This is a **hang net, not a performance
 * budget** (#886): it exists to catch a genuinely wedged test, so the margin is deliberately
 * wide. Raising it again is legitimate only with a fresh measurement recorded in this comment —
 * a ceiling that needs repeated raises means the quantity being measured is wrong, not the
 * number (the repeated-gate-bumps rule). If axe-scan cost itself becomes the concern, that is a
 * perf ticket, not a wider timeout.
 */
export default defineConfig({
  test: {
    testTimeout: 15_000,
  },
});
