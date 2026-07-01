---
name: optimize_loop
description: Apply profile-driven optimization to a hot loop or function. Use when the user identifies a perf hotspot, or after `profile_subsystem` recommends a specific function. Walks through the optimization ladder algorithmic → layout → SIMD → parallel, with measurement at each step.
---

# Optimize a Hot Loop

## Procedure

1. **Establish the baseline.**
   - Run `profile_subsystem` if you haven't already
   - Confirm the loop is actually on the hot path (a top hotspot in the profiler)
   - Record current timing: mean, p95, p99
   - Capture a representative workload size

2. **Check the algorithm first.**
   - Is this O(N²) when O(N log N) would work?
   - Is there caching that could turn repeated work into lookup?
   - Algorithmic wins are typically 10–1000×; layout/SIMD are 2–10×

   If algorithmic improvement exists, apply it first. Re-measure.

3. **Inspect data layout.**
   - Is this AoS where SoA would help?
   - Are hot/cold fields mixed in one struct?
   - Cache line analysis: how many lines per iteration?

   Apply hot/cold split and SoA where beneficial. Re-measure.

4. **Look for incidental cost.**
   - Per-iteration allocation? Move out of the loop.
   - String formatting? Move out or pre-format.
   - Virtual calls? Devirtualize via templates or remove indirection.
   - Std::hash_map? Swap for flat hash map.
   - Re-measure after each.

5. **Apply SIMD / vectorization if shape allows.**
   - Prefer the project's portable SIMD wrappers over raw intrinsics
   - Width depends on target: e.g. AVX2 (8 floats), AVX-512 (16), NEON (4)
   - Re-measure; reject if not at least 2× speedup (otherwise the complexity isn't worth it)

6. **Parallelize.**
   - Can iterations run independently?
   - Split into chunks; dispatch to job system
   - Job size: target 50µs–500µs per job
   - Re-measure on multi-core; verify scaling

7. **Memory access patterns.**
   - Add prefetch hints for large strides
   - Cache-line pad per-thread output buffers
   - Re-measure

8. **Micro-ops as a last resort.**
   - Branchless tricks
   - Bit twiddling
   - Compiler hints (`[[likely]]`, `[[unlikely]]`)
   - These are 5–20% wins at best; only after the above

9. **Verify correctness throughout.**
   - Each step: run unit tests; diff the golden / reference output if the domain has one
   - A faster wrong loop is worse than a slower right one

10. **Document the optimization.**
    - Comment why the surprising bits (the `// surprising and load-bearing` ones)
    - Update the perf baseline where the project keeps it (per `PROJECT_CONVENTIONS.md`)
    - Note the speedup in the commit message

## Verification

- Final timing meets target
- Tests still pass (correctness preserved)
- Golden / reference output still matches (where applicable)
- Documentation explains non-obvious choices

## Don't

- Skip measurement — every step needs before/after numbers
- Optimize without profile data ("I think this is hot")
- Apply SIMD to non-bottleneck code (cost > benefit)
- Use thread pools for cheap loops (< 10µs each — overhead exceeds the work)
- Leave the loop in an over-optimized state when 2× would have sufficed
