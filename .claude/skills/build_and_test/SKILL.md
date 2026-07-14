---
name: build_and_test
description: Run a full incremental build of the project and execute the test suite. Use when the user says "build", "run tests", "make sure it compiles", or after non-trivial code changes. Reports build errors, test failures, and performance regressions clearly.
---

# Build and Test

Uses the build / test / lint commands from `PROJECT_CONVENTIONS.md` — never hard-code them here. The structure (detect → build → test → lint → report) is the same on any project; only the commands differ.

## Procedure

1. **Detect the build system.** Identify the project's build system and build directory from `PROJECT_CONVENTIONS.md` (and confirm by what's in the repo). If the build uses an out-of-tree build directory and it doesn't exist yet, create it per the configure step there.

2. **Run incremental build.**
   - Use the **build command** from `PROJECT_CONVENTIONS.md` (incremental by default).
   - For a full rebuild on request, use its clean/reconfigure form.
   - Capture stderr; surface compilation errors with file:line.

3. **Run tests.**
   - Use the **test command** from `PROJECT_CONVENTIONS.md`, with failure output enabled.
   - Mid-development iteration or narrowing on a failure: use the **Test (targeted)** knob instead — the full suite is the gate, not the inner loop (`PROJECT_CONVENTIONS.md` › Build & Test, #233).
   - Report failures with test name, expected vs actual.

4. **Run perf benchmarks if changed.** If files in a subsystem with benchmarks changed, run that subsystem's benchmarks (per the benchmark command / location in `PROJECT_CONVENTIONS.md`) and flag regressions beyond the project's threshold against the recorded baseline.

5. **Run any domain-specific validation the change touches.** If `PROJECT_CONVENTIONS.md` defines an asset / schema / shader (or similar) validation step and the change touches those inputs, run it and surface errors.

6. **Run lint / format on changed files.** Use the **format / lint commands** from `PROJECT_CONVENTIONS.md`, scoped to the changed files.

7. **Report.** A short summary:
   - Build: success / N errors
   - Tests: N passed, M failed (with names)
   - Perf: regressions if any
   - Lint: issues if any

## Verification

The build is "green" only when:
- The build command returns success (exit 0)
- The test command reports all passed
- No new warnings beyond a baseline (if the project configures one)

## Don't

- Skip steps if build fails — fix the build first, don't try to test broken code
- Disable tests to make them pass
- Use `--no-verify` on git hooks
- Bypass the perf regression check by editing the baseline without explanation
- Hard-code build/test/lint commands here — read them from `PROJECT_CONVENTIONS.md`
