# capture_ui — the React pixel-capture harness (#150)

The browser-capable capture path a React downstream gets **out of the box**, so [`design_review`](../../.claude/skills/design_review/SKILL.md) gate mode has real pixels instead of degrading to `manual`. EXP-03 proved the degraded path is where finish quality dies (the canon lost the duels it lost on defects that pixels would have caught); this makes the load-bearing half of the design vertical ship by default.

Generalized verbatim from the [EXP-03 render harness](../../research/experiments/EXP-03_design-canon-transfer/tools/harness/README.md) that produced the frozen results — the capture logic is unchanged; only the specimen source, geometries, and themes are parameterized. **Exercised in-repo** by the #149 exemplar-register captures (2026-07-10), which caught and fixed the two defects the generalization had introduced: the ephemeral vite root lived under the OS tmpdir, so bare imports (`react`) could never reach the invoking project's `node_modules`; and a specimen that failed to mount still screenshotted "successfully" (the shot was vite's error overlay). The harness now symlinks the nearest `node_modules` (walking up from cwd) into the ephemeral root, and fails any shot whose `#root` never mounts children.

## What it does

For every `*.jsx` **specimen** it finds, it serves the component through vite and shoots it with playwright/chromium at each configured width — wide fixed-viewport + narrow full-page — optionally once per theme. Files land as `<specimen>-<theme>-<width>.png` (theme omitted when single-theme).

A **specimen** is a tiny `.jsx` that default-exports your component composed with **real props and real copy** (the design_review Pass-1 discipline — no lorem, no empty stubs). It lives in your project's own specimens dir and may import your tokens/primitives with normal relative paths; the harness symlinks it in, so those imports still resolve.

## Usage

```
node scripts/capture_ui/capture.mjs [outDir]        # outDir default: scripts/capture_ui/shots/
```

Knobs (env — all optional):

| Var | Default | Meaning |
|-----|---------|---------|
| `CAPTURE_SPECIMENS` | `./specimens` | dir of `*.jsx` specimens (project-owned; keep it **outside** this synced harness dir) |
| `CAPTURE_WIDTHS` | `1280,375` | viewport widths; a width `<500` is shot full-page. **Mirrors the [Screenshot capture knob](../../PROJECT_CONVENTIONS.md) web default, which owns the list** — override to match a project that changed it |
| `CAPTURE_THEMES` | *(none)* | comma list looped as `<html data-theme=…>` + `?theme=` + a `theme` prop; leave unset for a single-theme surface |
| `CAPTURE_PORT` | `5199` | vite dev-server port |

Exit code is non-zero if any specimen errored (the mechanical gate), and each failure is logged and skipped so one bad specimen doesn't sink the batch. A shot only counts if the specimen actually mounted children into `#root` — an unmounted page (e.g. a broken import) is a failure, not a blank "success." Benign noise: vite's dependency pre-scan may warn about `react/jsx-dev-runtime` for out-of-tree specimens — the runtime resolves it; ignore the warning.

## Bootstrap (no system install)

As run for the EXP-03 results, with **zero system footprint** — everything user-space:

1. A standalone node tarball (e.g. node v22.x) unpacked into your home; put its `bin/` on `PATH` for the session.
2. From your project (or a scratch dir holding the specimens): `npm i -D react react-dom vite @vitejs/plugin-react playwright`, then `npx playwright install chromium` (downloads a user-space chromium — no root).
3. `node scripts/capture_ui/capture.mjs` — the two PNGs per specimen appear in `outDir`.

`configure_project` wires the knob to this command for React stacks. Every other stack builds its own command against the [capture contract](../../.claude/skills/design_review/CAPTURE_CONTRACT.md) — contract + per-family recipes (#202, D-217); unit-only stacks record `manual` (degraded mode) until a browser runner lands.
