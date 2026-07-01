---
name: configure_project
description: Inspect this repository and fill in PROJECT_CONVENTIONS.md so the other skills use the project's real paths, build/test commands, and stack instead of the template's example defaults. Use once when setting up the skills in a new project, or when the build system / source layout changes. Triggers - "configure the skills", "set up skills for this project", "fill project conventions", "adapt skills to my repo".
---

# Configure Project Conventions

Run once to adapt the drop-in skills to *this* project. It detects the build system, source layout, and stack and writes them to `PROJECT_CONVENTIONS.md`, which every other skill reads — so you never hard-code paths into individual skills.

## Procedure

1. **Detect the build system & commands.** Look for the build manifest (`CMakeLists.txt` / `Cargo.toml` / `build.zig` / `package.json` / `pyproject.toml` / `go.mod` / Makefile, etc.); derive the build, run, and test commands. Note any profiling build flag.
2. **Detect the source layout.** Find where the project's main unit types and tests live (grep for one existing example of each — the recurring "add a X" artifacts this project actually has). Record the path patterns.
3. **Detect the stack.** The project's key tools, libraries, formats, and runtimes — from dependencies / imports / config. (For the template's example domain these were graphics API, shading language, physics, scripting, audio, profiler, ML runtime; record whatever the *actual* project uses.)
4. **Detect conventions.** Units / coordinate system (if applicable and discoverable), naming style, and any reflection / codegen mechanism.
5. **Find agent tooling.** MCP server name(s), the CI system, the headless / validate gate command.
6. **Write PROJECT_CONVENTIONS.md.** Fill every field you detected; leave a clearly-marked `<TODO>` for anything you couldn't, and tell the user which lines need confirmation.
7. **Make the gates real.** Replace the `skip_stage` / `Skip-Stage` placeholder stages in `scripts/preflight.sh`, `scripts/preflight.ps1`, **and** the `SKIP (unconfigured)` steps in `.github/workflows/ci.yml` with the detected commands — the three are mirrors; change all or none. Heavy commands belong in the posture-gated jobs (`build-test` / `lint`), never in `static gates`, which must stay ~1 minute in every project; trim the build matrix to the platforms the project ships (Windows bills ~1.7× Linux — `docs/AUTOMATION.md` §6). Then delete the two preflight-script exemptions from ci.yml's hygiene step, and run `scripts/preflight.*` to prove the stages actually execute (its summary must report **0 skipped**). If the CI posture is `light`/`manual`, label the configure PR **`full-ci`** so the newly-real heavy jobs run once in CI before anything relies on them. Until this step, a green run verifies only the audits — the SKIP lines say so.
8. **Confirm with the user** the project name and anything ambiguous before the other skills rely on it.

## Verification

- `PROJECT_CONVENTIONS.md` exists and every field is either filled or marked `<TODO>`.
- The build / test commands you recorded actually run.
- `scripts/preflight.*` and `ci.yml` contain no unconfigured SKIP-placeholder stages if the repo has real code; preflight executes end-to-end and reports 0 skipped.
- No example default left in place that doesn't match this project (especially the project name).

## Don't

- Don't guess paths / commands — detect them from the repo, or mark `<TODO>` and ask.
- Don't leave the project name as the template's example if this project has a different name.
- Don't edit the other skills to hard-code paths — project specifics go in `PROJECT_CONVENTIONS.md`.
