---
name: profile_subsystem
description: Capture a profile of the project, analyze a named subsystem's time/cost, and report bottlenecks. Use when the user says "profile X", "why is X slow", or asks about budget regressions. Optimize only against captured data, never a hunch.
---

# Profile a Subsystem

Uses the profiler and profiling build from `PROJECT_CONVENTIONS.md` — never hard-code a specific tool here. The procedure (capture → analyze → report bottleneck) is the same regardless of which profiler the project uses.

## Procedure

1. **Confirm the scope.** Ask:
   - Which subsystem / module?
   - Which workload? (a specific test case / scenario, or the user's current one)
   - What's "slow"? (over budget? a specific spike/hitch? consistent slowdown?)

2. **Build with profiling enabled.** Use the **profiling build** from `PROJECT_CONVENTIONS.md` (e.g. an optimized-with-debug-info build plus any profiler flag). Never profile a debug/unoptimized build — the numbers are meaningless.

3. **Run the workload under the profiler.** Launch the project on the chosen workload (via the **run command** from `PROJECT_CONVENTIONS.md`) and attach / enable **the profiler named in `PROJECT_CONVENTIONS.md`**.

4. **Capture.** Let the workload run long enough to be representative under normal load. Save the capture.

5. **Analyze.**
   - Open the capture in the profiler.
   - Filter to the subsystem under review (by zone / symbol / module prefix).
   - Compute statistics:
     - Mean / median / p95 / p99 of the relevant cost (frame time, latency, throughput) for the subsystem
     - Top 5 hottest zones within the subsystem
     - Lock contention or queue waits
   - For accelerator/GPU work, cross-reference a device-level capture if the project's tooling provides one.

6. **Compare to budget.**
   - Look up the subsystem's budget in the project's budgets doc (path per `PROJECT_CONVENTIONS.md`); if the project has none yet, set one using the library's budget methodology (route via MANIFEST).
   - Compute over/under.
   - For the top hot zones, check git blame — when did they get slow?

7. **Identify the bottleneck class.**
   - CPU-bound: hot loop, allocation, lock contention
   - GPU/accelerator-bound: shader/kernel, fill rate, bandwidth, sync stalls
   - Memory-bound: cache misses, false sharing
   - IO-bound: streaming / disk / network stalls

8. **Recommend fixes.** Order by leverage (algorithmic > data layout > SIMD/vectorization > parallel > micro-opts). Reference [PATTERNS.md](../../../textbooks/reference/PATTERNS.md) by name.

9. **Report.**
   - Markdown summary: budget, actual, top hotspots, recommended fixes
   - Include a flame-graph / timeline screenshot if the profiler can export one

## Verification

- Reported numbers match what the profiler shows
- Recommended fixes target the actual bottleneck class
- No optimization recommended without profiling data backing it

## Don't

- Profile an unoptimized / debug build — numbers are meaningless
- Optimize the second-slowest path; always start with the top hotspot
- Suggest "make it faster" — be specific about the fix
- Skip checking validation / debug layers — if they're on in dev, that's part of the cost
- Confuse mean and tail — a smooth mean with bad p99 still feels janky
