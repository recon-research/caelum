---
name: snapshot_restore_test
description: For any subsystem that owns state — snapshot to bytes, restore, and assert equivalence. Mandatory for episode/session resets, replays, and "roll back for diagnosis" workflows. Use when the user says "snapshot test", "restore state", "rollback test", or "reset state".
---

# Snapshot / Restore Round-Trip Test

## When To Use

Whenever a subsystem owns state that survives across ticks/steps and must be able to **reset, replay, or roll back**: a simulation core, an entity store, a scripting/VM runtime, a cache or session store, an inference state, a streamer. The library makes snapshot/restore a first-class requirement for reproducible and agent-facing systems; the same machinery enables replays, bug repros, and counterfactual debugging. Route to the relevant book(s) via the library (MANIFEST) for the serialization and rollback patterns. Read paths/commands from `PROJECT_CONVENTIONS.md`.

## Procedure

1. **Identify the state to capture.** Anything that influences future steps. Excluded: derived caches, GPU/accelerator resources, anything purely recomputable from inputs.

2. **Implement `Snapshot()` for the subsystem.** Serialize the owned state to bytes (reflection-driven where the project supports it — snapshot is essentially "save without the UI"). Versioned; compressed; keep it as small as the state allows.

3. **Implement `Restore(bytes)`** that returns the subsystem to the snapshotted state. Side-effect-free: it should leave no traces of the in-between state.

4. **Write the round-trip test:**
   ```
   snap = subsystem.Snapshot()
   subsystem.Tick(100)                  // do arbitrary work
   subsystem.Restore(snap)
   snap2 = subsystem.Snapshot()
   assert snap == snap2                  // or structurally equivalent
   ```

5. **Write the determinism cousin:** restore from `snap`, step exactly K times with the same inputs, snapshot again, compare to a golden snapshot taken on a known-good machine.

6. **Wire into CI** for every subsystem that claims snapshot support.

7. **Add the "missed-field" lint** (optional): a scanner flags fields lacking the project's `saveable` annotation on subsystems registered as snapshottable.

8. **Document** the snapshot format version and migration path.

## Verify

- Round-trip is byte-identical (or structurally identical per the determinism level)
- Determinism test passes across at least two physical machines
- Snapshot size is within budget
- A subsystem that introduces non-deterministic state (hash-map iteration order, threading order) breaks the test immediately

## Don't

- Snapshot GPU / accelerator resources; rebuild them from CPU state on restore
- Capture and replay realtime clocks; use a logical step counter
- Use language-default serializers (`pickle`, `marshal`, native binary dumps) — opaque, brittle, insecure
- Forget the format version field — schema drift will silently corrupt restores
