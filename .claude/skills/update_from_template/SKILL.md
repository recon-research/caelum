---
name: update_from_template
description: Pull upstream project_template improvements into a project that was copied from it. Use when the user says "update from the template", "sync the template", "the template changed", or "pull template improvements". Reads TEMPLATE_VERSION, diffs upstream since the stamped sha, applies machinery wholesale, ports content-file improvements by hand, re-verifies everything, and re-stamps.
disable-model-invocation: true
---

# Update From Template

> **Invocation:** this skill sets `disable-model-invocation: true` — a deliberate command you run explicitly (`/update_from_template`), never auto-routed from plain English. It's the worked example for the skill-listing token convention in [`.claude/skills/README.md`](../README.md) › *Authoring conventions* (resolves #6) — don't strip the flag without reading that note.

The template is two kinds of files — the boundary lives in its README (§ *Machinery vs content*): **machinery** (skills, hooks, agents, audit tools, scripts, CI structure, authoring templates) is taken from upstream wholesale; **content** (the filled-in docs and books) is never overwritten — improvements to its *structure* are ported by hand from the diff. This skill makes the first mechanical and the second explicit.

## Procedure

1. **Locate upstream + the baseline.** Read `TEMPLATE_VERSION` (`source:` + `sha:`). No stamp? Reconstruct: find the template (ask if unknown), identify the closest baseline by diffing a few machinery files against its history, write the stamp, then proceed. Run `git -C <source> log --oneline <sha>..HEAD` — empty means up to date; report and stop.
2. **Ticket + branch.** File the sync as a tracker issue and branch per conventions — a template update rides the normal PR gate like any other change.
3. **Machinery — overwrite from upstream** (the README boundary table is authoritative; re-check it each sync, it can grow):
   - `.claude/skills/` — then re-create the project's own derived skills and re-register them in `textbooks/MANIFEST.json` `skills[]` (the routing audit fails on any catalog↔disk mismatch).
   - `.claude/hooks/`, `.claude/agents/`, `textbooks/tools/`, `research/tools/`, `textbooks/LIBRARY_SEED.md`, `textbooks/books/00_TEMPLATE.md`, `research/*/00_TEMPLATE.md`.
   - `scripts/` and `.github/` — take upstream's structure, then re-apply the project's filled stage bodies / real CI commands on top (structure is upstream's; commands are the project's).
   - `.claude/settings.json` — hook/deny updates apply; **never widen `permissions.allow` beyond the project's current grants as a side effect of a sync** — surface upstream allowlist changes to the owner and let them say yes in their own words.
4. **Content — port by diff, never overwrite:** root `CLAUDE.md`, `PROJECT_CONVENTIONS.md`, `docs/`, the filled `textbooks/` docs (`CLAUDE` / `README` / `AGENT_GUIDE` / `MANIFEST` beyond `skills[]`), the books, and everything in `research/` that isn't a template. Read the upstream diff for each and port the structural improvements into the filled versions, respecting the project's documented deviations.
5. **Verify.** Full preflight green; all audits green (library + research + skills catalog); spot-check that re-applied stage bodies still execute. Fix before proceeding — a half-applied sync is worse than none.
6. **Re-stamp + ship.** Update `TEMPLATE_VERSION` (`sha:` = upstream HEAD, `last_update:` = today). PR with the evidence; the body notes which upstream changes were deliberately **not** taken and why (those are the project's deviations — future syncs read them).

## Verification

- Preflight and every audit green after the sync; the skills catalog matches disk.
- `TEMPLATE_VERSION` `sha:` equals upstream HEAD; `last_update:` is today.
- Project-derived skills, filled stage bodies, and documented deviations all survived the sync.

## Don't

- Don't blind-overwrite content files — that destroys the project's filled-in knowledge.
- Don't widen settings permissions as a side effect of a sync — surface them; the owner decides.
- Don't skip the re-stamp — the next sync's diff depends on it.
- Don't sync without the ticket/PR gate; and don't leave upstream changes silently untaken — record the deviation.
