---
name: validate_headless_mode
description: Run the system with no window, audio device, or input hardware; assert every subsystem initializes, runs, and shuts down cleanly; gate merges on it. Use when the user says "headless test", "validate headless", "CI operability test", or "run it in CI".
---

# Validate Headless Mode

## When To Use

Applies to any system with a **run loop** — always: locally via preflight before every push, and in CI per the posture (the heavy matrix exercises it on `full` PRs, `full-ci` escalations, and milestone tags). The library names "untested headless path" as one of the most common ways a system that should run unattended ships broken: anything that *can* assume a window, audio device, controller, or interactive human *will* eventually do so, and only a continuously-exercised headless path keeps it CI- and agent-operable. Route to the relevant book(s) via the library (MANIFEST) for the headless / parallel-environment patterns. Read the CI system and the headless gate command from `PROJECT_CONVENTIONS.md`.

## Procedure

1. **Entry point with a `--headless` flag** that disables window creation, audio device acquisition, and human-input polling. Substitutes stubs that report success but do nothing.

2. **Subsystem initialization audit.** Every subsystem must accept a headless config or otherwise behave with no devices present. Common offenders: rendering (needs an offscreen target), audio (needs a device), input (needs a controller), platform (needs a window), telemetry (needs network — stub it).

3. **Add a smoke test** that:
   - Boots the system in headless mode
   - Loads a canonical "smoke" workload
   - Runs N steps (N=300 typical)
   - Asserts no crashes, no exceptions, no missing-resource warnings
   - Shuts down cleanly with zero leaks (via the project's memory/leak tracker)

4. **Add a speed-multiplier test** (if the system has a stepped clock): same smoke workload at high speed; assert step count consistent and no time-dependent assumptions broke.

5. **Add a parallel-environment test** (if the system supports it): several instances in parallel; assert no shared mutable state collisions.

6. **Snapshot/restore round-trip:** at the midpoint take a snapshot, reset, restore, run to the end, assert identical end state (see `snapshot_restore_test`).

7. **Wire into CI.** Failing this gate blocks merge. Per-platform variants per the project's CI matrix.

8. **Add a "no window subsystems" lint** (optional): a CI script that flags direct calls to windowing/device APIs outside the module that owns them. Surfaces hidden coupling.

## Verify

- The headless smoke test passes locally and in CI
- A new subsystem that forgets headless-mode breaks the test (test the test)
- The leak tracker reports zero leaks after shutdown
- Snapshot/restore is byte-identical (or structurally identical per the determinism level you target)

## Don't

- Skip headless CI "for now" — unattended-operability claims become hollow
- Mock the renderer entirely; render to an offscreen target so the device path is exercised
- Allow blocking `printf` / dialog prompts in headless mode — they hang CI
- Couple to a specific window size or device — an unattended runner shouldn't care
