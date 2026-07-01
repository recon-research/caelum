# WORKFLOWS — Recipe-Style Task Guides

Step-by-step recipes for the multi-step tasks that span several books or skills — the "how do I actually do X end to end?" guides. Where a single book teaches one idea, a workflow stitches the ideas into a procedure you can follow. For the milestone path from zero, see [STARTER_KIT.md](STARTER_KIT.md); for atomic one-shot operations, see the project's skills.

> **Format.** One recipe per `## Workflow N` heading, numbered. Give it a goal line, then an ordered list of steps. Each step says what to do and cites the book section or skill that backs it (plain-text "Book NN §X", or a skill name). End with a short "Done when" check. Write "Book NN" as plain text. Link sibling docs, e.g. [DECISION_TREES.md](DECISION_TREES.md).

## Workflow 1 — `<Add A New <THING> To <EXAMPLE_SYSTEM>>`

<!-- EXAMPLE — replace -->
**Goal:** `<the end state — e.g. a working, tested <THING> wired into the system>`.

1. Decide `<the relevant fork>` — see [DECISION_TREES.md](DECISION_TREES.md) (`D1`). (Book NN §X)
2. Pre-mortem: read the `<area>` entries in [ANTI_PATTERNS.md](ANTI_PATTERNS.md).
3. Scaffold the `<THING>` using the `<add_thing>` skill. (Book NN §X)
4. Wire it into `<the system point>`. (Book MM §X)
5. Add tests for `<the invariants>` with the `add_test` skill. (Book PP §X)
6. Verify with the `definition_of_done` skill.

**Done when:** `<the verifiable outcome — builds, tests pass, the <THING> does X>`.
<!-- /EXAMPLE -->

## Workflow 2 — `<Diagnose And Fix A <PROBLEM>>`

<!-- EXAMPLE — replace -->
**Goal:** `<root-cause and resolve a reported <PROBLEM>>`.

1. Start from the complaint in [SYMPTOMS.md](SYMPTOMS.md) to get a candidate cause.
2. Confirm the cause against the matching [ANTI_PATTERNS.md](ANTI_PATTERNS.md) entry.
3. Apply the fix; if it is a hot-path issue, profile first. (Book NN §X)
4. Add a regression test. (Book PP §X)

**Done when:** `<the symptom is gone and a test guards it>`.
<!-- /EXAMPLE -->

<!-- Add Workflow 3, 4, … for each recurring multi-step task. -->

---

> **Fill this in during onboarding.** Write a workflow for each multi-step task that comes up repeatedly and touches more than one book or skill. Keep steps imperative and each one cited (verify the `§`); a workflow that just narrates without pointing at the backing material is not pulling its weight. If a task is a single atomic operation, make it a skill instead of a workflow.
