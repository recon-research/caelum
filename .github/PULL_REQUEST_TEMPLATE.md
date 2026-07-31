<!-- PR title convention: M<n> <slice>: <imperative summary> (closes #<issue>) -->

## What & why

<!-- A closing keyword fires from ANYWHERE in this body — GitHub's parser reads no
     context, so "does not close 12", "close 12 on the freeze", a quoted sighting,
     and "already fixed: 12" all retire ticket 12 when this merges. The prose ref
     below is fine BECAUSE the PR title declares the same issue. The rule is set
     equality: every closing ref must also appear in a subject line (this PR's
     title or a commit subject) or on a trailer line of nothing but closing refs.
     Discussing another ticket? Drop the keyword. Gate: scripts/audit_closing_keywords.py (727). -->
<one short paragraph. Closes #NN.>

## Definition-of-done evidence

<!-- Except where the gate's finding IS the forbidden thing (a codename, a closing
     keyword, a credential): paste its summary line and counts, never the echoed
     matches — pasting those here commits the defect instead of reporting it.
     Rule: .claude/skills/definition_of_done/SKILL.md › Output carve-out (728). -->
<output, not assertion — paste the relevant summaries>

- **Build / tests / lint:** <result>
- **Domain gates** (state round-trip · headless · determinism — as applicable): <PASS / N/A + evidence>
- **Performance claims:** <profile reference, or "none claimed">
- **Library:** citations verified against SECTIONS.json; frontier claims cite research/ notes (sourced + tiered); audits green if textbooks/ or research/ changed

## Tracker hygiene

- [ ] No naked TODO/FIXME introduced — `TODO(#NN)` only (the `static gates` hygiene step enforces)
- [ ] Deferred work filed as issues: <#… / none>
- [ ] Decisions touched: <D-NN recorded in ARCHITECTURE Appendix A / none>
- [ ] Provisional work declared: <`Provisional on #NN` if this builds on an unratified default — the overrule path greps for this / none>
- [ ] Merge-time checkpoint done: Status line + ROADMAP state reflect this merge
