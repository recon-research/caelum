# CLAUDE.md — working under research/

Auto-loaded while you edit files in this folder. The **full** discipline + lifecycle is in [README.md](README.md) (canonical — this file is the short auto-injected reminder, not a second copy). The non-negotiable core, so you write it right the first time (`tools/_audit_research.py` gates these on every commit — a clean preflight beats a red CI):

- **Fetched, or not cited.** Every present-tense claim carries `(source: <URL>, accessed YYYY-MM-DD)` **on the same line**, from a page actually fetched this session — never from model memory. No consulted source → no claim.
- **Tier every claim**: `[production-proven]` / `[published]` / `[experimental]`. The tag is the audit's enforcement hook (an untagged **quantitative** claim — a `%`, an `N×` — also warns). Don't launder experimental into proven.
- **Cite this layer as `research/notes/<file>.md` / `EXP-NN` / `RR-NN` — never as a `Book NN §X`** (different trust model; notes carry `> reviewed:` and stale ~180 days).
- **Experiments are pre-registered** (metrics + success criteria written before running; negative results recorded) and **every figure regenerates** from a committed script + committed data.

Authoring goes through the skills: [`research_topic`](../.claude/skills/research_topic/SKILL.md) (survey) · [`run_experiment`](../.claude/skills/run_experiment/SKILL.md) · [`write_research_report`](../.claude/skills/write_research_report/SKILL.md).
