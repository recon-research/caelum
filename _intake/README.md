# _intake/ — Drop your planning docs here

This is where the planning work from Claude Chat (or anywhere else) enters the project. Put the documents you produced while scoping the project here, then tell Claude Code **"let's onboard"**.

## What to drop here

Anything that describes what you're building. The richer this is, the better the onboarding. Useful inputs:

- **A vision / brief** — what the project is, who it's for, why it matters, what "done" looks like.
- **Architecture notes** — the intended shape, key components, hard constraints, invariants, the stack you have in mind.
- **A roadmap / milestone sketch** — the order you imagine building things in.
- **Domain notes** — the body of knowledge the project rests on; this seeds the `textbooks/` library outline.
- **Decisions already made** — anything settled, so onboarding records it instead of re-asking.
- **Open questions** — forks you want to decide together; onboarding will surface them as `D-NN` decisions.

Markdown, PDFs, text, images — whatever you have. No particular structure is required; onboarding will read across all of it.

## What onboarding does with it

The [`onboard`](../.claude/skills/onboard/SKILL.md) skill reads everything here and:

1. Fills the [`CLAUDE.md`](../CLAUDE.md) **Status** block and the `<placeholders>`.
2. Drafts [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) (shape, invariants, the initial decision log) and [`docs/ROADMAP.md`](../docs/ROADMAP.md) (milestones `M0..`).
3. Proposes the **textbook/RAG library outline** (volumes → books) per [`textbooks/LIBRARY_SEED.md`](../textbooks/LIBRARY_SEED.md) and gets your approval before writing.
4. Surfaces any open forks as decisions with recommended (ambitious) defaults.

## After onboarding

Once the docs are populated and approved, this folder has done its job. Move its contents to `_intake/archive/` (or delete them) so they don't get confused with the living docs. The durable record now lives in `docs/`, `textbooks/`, and the issue tracker.
