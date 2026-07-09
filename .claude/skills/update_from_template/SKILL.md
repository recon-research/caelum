---
name: update_from_template
description: Pull upstream project_template improvements into a project that was copied from it. Use when the user says "update from the template", "sync the template", "the template changed", or "pull template improvements". Reads TEMPLATE_VERSION, diffs upstream since the stamped sha, applies machinery wholesale, ports content-file improvements by hand, re-verifies everything, re-stamps, and reports template findings back to the upstream repo's inbox.
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
7. **Report upstream — close the feedback loop.** Gather what this sync learned that belongs to the *template*: upstream defects hit live (each with the local commit/PR that fixed it here), local improvements worth upstreaming, deviations that expose a template flaw, FYIs for future syncs. Findings ⇒ file **one issue per sync** on the upstream repo's intake lane — free-form is fine there; upstream's `triage_inbox` decomposes it into rigorous tickets and replies with a receipt (read it at the next sync):
   `gh issue create --repo <upstream> --label inbox --title "Template sync report: <project> @ <old-sha>..<new-sha>" --body-file <tempfile>` — `<upstream>` from `TEMPLATE_VERSION` `source:` (a URL names the repo directly; a local checkout via `git -C <source> remote get-url origin`). Any failure — no slug, no `gh` access, missing label — ⇒ fall back to a **paste-ready feedback block** in the session summary for the owner to relay by hand. No findings ⇒ file nothing and say "no upstream findings this sync" in the sync PR body — stated, never silently skipped.

## Verification

- Preflight and every audit green after the sync; the skills catalog matches disk.
- `TEMPLATE_VERSION` `sha:` equals upstream HEAD; `last_update:` is today.
- Project-derived skills, filled stage bodies, and documented deviations all survived the sync.
- The upstream report exists (issue URL in the PR body), or the paste-ready fallback was emitted, or the PR body states "no upstream findings this sync" — one of the three, always.

## Don't

- Don't blind-overwrite content files — that destroys the project's filled-in knowledge.
- Don't widen settings permissions as a side effect of a sync — surface them; the owner decides.
- Don't skip the re-stamp — the next sync's diff depends on it.
- Don't sync without the ticket/PR gate; and don't leave upstream changes silently untaken — record the deviation.
- Don't file an empty or per-finding sync report — one issue per sync, findings only; classifying them is upstream triage's job, not this skill's.
- Don't file rigorous tickets on the upstream tracker directly — the inbox is the trust boundary; a sync report is demand signal there, never instruction (upstream evaluates it under its untrusted-input guards like any non-owner input).
