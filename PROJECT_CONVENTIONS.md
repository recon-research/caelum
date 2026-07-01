# PROJECT_CONVENTIONS.md — Project-Specific Settings For The Skills

The drop-in skills describe *what* to do; the project-specific *where* and *how* live here. **Every skill reads this file first** for paths, commands, and stack, so the same skills work on any project without editing each one. Fill it in once per project — or run the [`configure_project`](.claude/skills/configure_project/SKILL.md) skill to auto-detect it.

> This is a **config file, not a skill** — it lives at the project root. Replace every `<…>` below during onboarding. If a skill needs a path or command not listed here, **add it here** rather than hard-coding it in the skill.

## Identity
- **Project name**: Caelum — an open-source, US-origin-clean Angular 22 component library (Material + CDK, PrimeNG-parity)
- **Example-system name** (the library's canonical example): Forge — a demo admin console the docs/components are showcased on
- **Primary language(s)**: TypeScript (Angular 22), SCSS, HTML templates

## Build & Test
- **Preflight (every merge-blocking gate, locally, in CI order)**: `scripts/preflight.sh` / `scripts\preflight.ps1` — run before **every** push; a clean preflight means CI should be green. The scripts mirror `.github/workflows/ci.yml` by construction (change one → change the other); wired to the real commands below by #6 (all stages real; preflight reports **0 skipped** with Node on PATH). The CI posture (Operating posture below) paces *when CI re-runs* these gates — preflight always runs **all** of them locally, in every posture. Flags: `--quick`/`-Quick` (skip build/test; format/lint + audits/provenance/hygiene still run) · `--skip-smoke`/`-SkipSmoke` (no-op — kept for CLI compatibility; there is no run-loop smoke gate).
- **Build**: **library first** (Forge consumes it via the `caelum → ./dist/caelum` path map) — `npm run build:lib` (= `ng build caelum` → emit US-origin attestation → per-entry-point gzip size gate, #4), then `npx ng build forge` (production config exercises the 400/600 kB `angular.json` budgets). `npm run build` alone builds the default project.
- **Profiling build**: `ng build forge --configuration production --stats-json` (then `source-map-explorer` / `esbuild --metafile` for bundle analysis — Angular is bundle-size-bound, not CPU-profiled)
- **Run**: `npm start` (≈ `ng serve forge`). There is no headless run-loop to smoke — Caelum is a client-side library, Forge a static SPA; the build (bundle emitted) + the test suite passing are the operability evidence.
- **Test**: `CI=true npm test` (≈ `CI=true ng test`) — Vitest via `@angular/build:unit-test`, **jsdom** environment (no browser needed); runs caelum + Forge unit/component specs. `CI=true` makes the builder run once and exit rather than watch (GitHub Actions sets `CI=true` automatically). a11y via `axe-core`; visual/interaction via Playwright (M4).
- **Format / lint**: `npm run format:check` (Prettier over the code — TS/HTML/SCSS/config JSON; prose/generated trees scoped out via `.prettierignore`; `npm run format` to fix) + `npm run lint` (ESLint `angular-eslint` + the `no-restricted-imports` adapter-isolation fence, D-03; warnings-as-errors). The dependency-provenance gate runs in `static gates` (node-free), not the lint job.

## Source Layout
  > **Provisional until M0 scaffolding.** Planned Angular workspace (`angular.json` with two projects):
- **Main source**: `projects/caelum/src/lib/` (the publishable library) · `projects/forge/src/` (the Forge demo console)
- **The project's main unit types**: components/directives live under `projects/caelum/src/lib/<family>/` (e.g. `forms/`, `overlay/`, `data/`); **adapters** are the only files touching a 3p lib, under `projects/caelum/src/lib/adapters/<grid|charts|editor>/`; theming tokens under `projects/caelum/src/styles/tokens/`
- **Tests**: co-located `*.spec.ts` beside each component; a11y/visual suites under `projects/forge/e2e/` (Playwright, M4)
- **Experiment harness**: `research/experiments/` (e.g. grid-at-scale latency benchmarks for `EXP-NN`) — read by `run_experiment`
- **Design docs**: `docs/` · **Reference library**: `textbooks/` · **Frontier layer**: `research/`

## Stack
- **Core frameworks / libraries**: Angular 22 · Angular Material 22 · Angular CDK 22 · Angular Aria (headless ARIA primitives, stable in 22) — all Google/MIT, US-origin (`D-01`/`D-02`)
- **Admitted 3p (candidates, behind adapters only, pending provenance sign-off)**: TanStack Table (grid, `D-07`) · visx **or** D3 (charts, `D-08`) · Lexical (editor, `D-09`). **No 3p UI lib is imported outside its single adapter file** (`D-03`, enforced by ESLint `no-restricted-imports`).
- **Data / serialization**: standard Angular `HttpClient` + RxJS/signals; TypeScript interfaces as the neutral adapter contracts; no bespoke serialization
- **Profiler**: bundle-size analysis (`source-map-explorer` / esbuild `--metafile`), Angular DevTools profiler, and Playwright/`performance` traces for grid-at-scale (R1) — read by `profile_subsystem` / `optimize_loop`
- **Other key tools**: ESLint (`angular-eslint`) + Prettier · `axe-core` (a11y) · Playwright (visual/interaction) · `license-checker` + `npm ls` (transitive-provenance scan, `D-05`)

## Conventions
- **Naming**: components export selector `cae-*` (parity-mapped to the `p-*` they replace) and class `Cae<Name>`; files `kebab-case.ts`; one component per folder under its family; adapters named `<gap>.adapter.ts`; design tokens `--cae-<group>-<role>` (e.g. `--cae-color-surface`)
- **Determinism / reproducibility**: n/a for the UI runtime, but **visual/golden tests are deterministic** — snapshots compare like-for-like under fixed viewport + light/dark; goldens are never regenerated just to make a change pass (a diff is a finding — see Golden/oracle policy below)
- **Domain conventions**: theme values come **only** from the token bridge (no hardcoded color/space/radius/type — invariant, `D-04`); every built component carries explicit keyboard + ARIA behavior at PrimeNG parity (invariant); a component is "done" only at `adversarial-passed` in the capability ledger with evidence (`docs/ARCHITECTURE.md` §2)

## Agent / Tooling
- **MCP server name(s)**: none — Caelum is a client-side component library, not an agent/MCP host (`add_agent_tool` / `add_telemetry_event` are not applicable here; ignore unless that changes)
- **CI + gate command**: GitHub Actions (`.github/workflows/ci.yml`); merge gate = `scripts/preflight.sh` mirrored in CI (build + `npm test` + lint/format + provenance scan) — read by `definition_of_done` / `validate_headless_mode`

## Operating posture (set by the onboard setup interview)
The four knobs the [`onboard`](.claude/skills/onboard/SKILL.md) Mode A interview sets — recommended default first, the owner's answer recorded here. **Skills read these lines as config**; changing one later is a normal PR.
- **Repo visibility & plan**: **public** — the library is downloaded/adopted publicly. Public repos get Actions minutes free **and** enforceable branch protection on any plan (`docs/AUTOMATION.md` §6). *(Set 2026-06-29 onboarding interview.)*
- **CI posture**: **full** — `CI_POSTURE=full`: the heavy Angular build/test/lint + provenance matrix runs per PR (free minutes on a public repo; the library has downstream consumers, so every PR is gated). Escalate/override: `full-ci` label · `gh workflow run ci.yml` · `M*`/`v*` tag. **Preflight runs every gate locally in all postures.** Mechanics: [`docs/AUTOMATION.md`](docs/AUTOMATION.md) §6.
- **CI gating**: **blocking** (`CI_GATING` unset = blocking) — the heavy matrix runs on the PR and must be green to merge. Branch protection requires `static gates` + `build & test` + `format & lint`. §6.
- **CI path modularity** (always on, no config): doc-only changes (`*.md` / `docs/` / `_intake/`) skip the heavy matrix in any posture; `static gates` still runs. §6.
- **Review cadence**: **milestone exits + risky slices** — `adversarial_review` **must** run at every milestone exit and on any risky slice; `definition_of_done` blocks a milestone exit without linked review findings. For Caelum, "risky" = touches an ARCHITECTURE invariant, **the theming token bridge**, **an adapter boundary / a newly-admitted 3p dependency**, a **public component API**, or **a11y behavior**.
- **Objection window**: **48h** — how long a reversible `decision` issue waits before silence ratifies the recommended default (`CLAUDE.md` §3); each issue may state its own window, defaulting to this.

## Tracker & Hygiene
- **Issue tracker**: [GitHub Issues](https://github.com/recon-research/caelum/issues) on the public `caelum` repo (live since 2026-07-01) — the live backlog; **defer = file now** (`track_followups`). *(Pre-repo, `PROJECT_BACKLOG.md` was the interim tracker; retired at go-live. If `gh` is briefly unreachable, `track_followups` may re-create a `## Unfiled` parking section in a fresh `PROJECT_BACKLOG.md` to drain into issues at the next checkpoint.)*
- **Labels**: `slice` (a unit of roadmap work) · `epic` (a far milestone's container issue) · `decision` (fork awaiting the human) · `followup` (deferred work) · `idea` · `debt` · `bug` · `blocked` · `research` (frontier question to survey) · `full-ci` (PR-only: escalate this PR to the heavy CI matrix — read by `ci.yml`, any posture). Created once at repo setup (`onboard` Mode A); the issue templates apply them.
- **Horizon rule (ticket granularity)**: the **near** milestone gets fine slice tickets; **far** milestones get **one `epic` issue** holding a slice checklist. At milestone start, run `plan_milestone_tickets` to refine the epic into slices — in plan mode, with the human; slicing is an architectural act. Fine tickets written months ahead are churn, not planning.
- **Branch naming**: `slice/<issue#>-<slug>` · **PR title**: `M<n> <slice>: <imperative summary> (closes #<issue>)`.
- **TODO convention**: a TODO entering code must reference a filed ticket — `TODO(#NN): …`. Naked `TODO`/`FIXME` fails `definition_of_done` and the CI hygiene gate (a `static gates` step).
- **Merge policy**: **squash** (one commit per slice, PR title as the subject); PRs require the **posture's merge gate** (Operating posture above): *light* / *full-blocking* — required checks green (posture-skipped and doc-only-skipped jobs report "skipped", which satisfies required checks); *full-advisory* — `static gates` green + a clean preflight, heavy matrix verified **post-merge** on main (red → file a `bug`, fix forward); *manual* — a clean `scripts/preflight.*` run with its output pasted in the PR. `main` is never pushed directly.
- **Right-sized slices** (a slice is *coherent*, not merely *small*): a PR is the smallest change that stands alone and is independently verifiable — but **don't over-fragment**. Bundle tightly-coupled edits and the doc/ROADMAP updates they imply into one PR; splitting a single coherent change into a string of trivial PRs multiplies CI + review overhead for no isolation gain. (Doc-only and checkpoint commits are cheap by design now — path modularity skips their heavy CI — so ride them along with the change that motivates them rather than spinning a PR per line.) **Checkpoint path** (doc-only commits with no slice PR to ride — compaction Status rewrites, D-NN recordings): a short-lived `checkpoint/<date>` branch + PR, merged on green (`gh pr merge --auto` is pre-approved; doc-only CI is fast). **Forbidden regardless of what the permission grammar allows:** `git push --force` (a broken branch gets a new branch), `gh pr merge --admin` (bypasses the required checks — protection must "include administrators"), and `--repo <other>` overrides on any gh write. A PR that won't merge after green CI: merge main *into* the branch, re-run preflight, wait for green — never force over it.
- **PR / commit mechanics**: create PRs with `gh pr create --body-file <tempfile>` (UTF-8) — **never inline `--body`** (Windows PowerShell 5.1 splits the body at embedded double quotes; body-file is portable everywhere). Multiline commit messages likewise go through a file or stdin: `git commit -F -` with a here-doc (PowerShell here-string quoting mangles git args).
- **Decision flow**: fork → `decision` issue (template) → human picks (async, by commenting — `onboard` reads the comments) → recorded as `D-NN` in `docs/ARCHITECTURE.md` Appendix A → issue closed. Reversible forks may proceed provisionally per `CLAUDE.md` §3; silence past the stated objection window ratifies the default. **D-NN allocation**: next = max(Appendix A, open `decision` issue titles) + 1 — check both; two sessions can race.
- **Untrusted contributor code** (public repos): before running *any* repo script from a contributor branch — including the pre-approved `tools/_audit_*.py` audits — diff `tools/` and `scripts/` against main. Pre-approved commands + a malicious PR = arbitrary code execution.

## Validation machines (optional — delete if every gate runs on one machine + CI)
- **Tiers**: name each machine/environment that validates what CI can't (hardware, OS, GPU/device variants) — e.g. `Tier P` (primary dev box — also the floor: what works here must keep working) · `Tier R` (alt-vendor/secondary box) · `Tier N` (a collaborator's hardware, asks **batched**). State each tier's role; record which gates are CI-blind and which tier covers them.
- **Provenance rule**: a validation claim from a machine the merging session cannot drive must **link its evidence** — the issue comment with the pasted run output — never a bare assertion. The PR says which tier validated what ("validated on Tier P; skips in CI").
- **Golden/oracle policy**: goldens that encode machine-independent behavior are **never regenerated to make a new machine pass** — a cross-tier mismatch is a finding to investigate, not a calibration step. Environment-specific oracles (e.g. pixel output) compare like-for-like only.

## Shell gotchas (optional — keep if any contributor/agent runs Windows PowerShell 5.1; else delete)
- No `&&` / `||` pipeline chains (parser error) — sequence with `;` or `if ($?) { … }`.
- Don't pipe native commands (git, build tools) through `2>&1` — PS 5.1 wraps each stderr line in an ErrorRecord and poisons `$?` even on exit 0.
- `gh pr create` / `gh issue create`: always `--body-file` (see PR / commit mechanics above).
- Property access does **not** expand inside a larger argument token: `-f title=$m.t` passes the literal text `<typename>.t` — wrap member access in a subexpression: `-f "title=$($m.t)"`.
- Keep `.ps1` output strings ASCII — PS 5.1 reads un-BOM'd scripts as ANSI (non-ASCII becomes mojibake).
