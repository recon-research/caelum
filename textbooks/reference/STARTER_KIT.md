# STARTER_KIT — Zero To A Shipped Result

The milestone path a newcomer follows to go from an empty repo to a first real, working result in `<DOMAIN>`. Each milestone has a concrete goal and a *verifiable* exit criterion, so you always know whether you can move on. The project's `docs/ROADMAP.md` mirrors these milestones; `definition_of_done` checks the exit criterion when a milestone closes.

> **Format.** Milestones numbered **M0, M1, M2, …**, each with a one-line **Goal**, a short **Build** note (what to do, citing books/skills as plain text), and an **Exit criterion** that is objectively checkable (not "understand X" but "X runs / passes / produces Y"). Write "Book NN" as plain text. Link sibling docs, e.g. [WORKFLOWS.md](WORKFLOWS.md).

## M0 — `<Environment & Hello-World>`

<!-- EXAMPLE — replace -->
- **Goal:** a runnable skeleton of `<EXAMPLE_SYSTEM>` that starts and exits cleanly.
- **Build:** set up the baseline stack; get the smallest possible thing running. (Book NN §X)
- **Exit criterion:** `<command>` runs and prints `<expected>`; the test harness executes with 0 tests.
<!-- /EXAMPLE -->

## M1 — `<First Real <CORE_CONCEPT>>`

<!-- EXAMPLE — replace -->
- **Goal:** one end-to-end `<CORE_CONCEPT>` working in isolation.
- **Build:** implement `<the minimal core>`; follow [WORKFLOWS.md](WORKFLOWS.md) (Workflow 1). (Book NN §X, Book MM §X)
- **Exit criterion:** `<a single <CORE_CONCEPT> produces the right <output>, covered by a passing test>`.
<!-- /EXAMPLE -->

## M2 — `<Compose Several <CORE_CONCEPT>s>`

<!-- EXAMPLE — replace -->
- **Goal:** multiple `<CORE_CONCEPT>`s interacting correctly.
- **Build:** wire them through `<the system seam>`; watch the [ANTI_PATTERNS.md](ANTI_PATTERNS.md) for this area. (Book NN §X)
- **Exit criterion:** `<the composed behavior is correct and deterministic; integration test green>`.
<!-- /EXAMPLE -->

## M3 — `<Ship It>`

<!-- EXAMPLE — replace -->
- **Goal:** a first result fit to show someone.
- **Build:** harden, document, run the full gate via `definition_of_done`.
- **Exit criterion:** `<the demoable artifact exists; all gates pass; a new user can reproduce it from the README>`.
<!-- /EXAMPLE -->

<!-- Add M4+ as the domain demands; keep each exit criterion objectively checkable. -->

---

> **Fill this in during onboarding.** Lay out the real shortest path from nothing to a first shipped result in `<DOMAIN>`, 4–8 milestones. The non-negotiable rule: every exit criterion must be something you can *run and observe*, not a feeling of understanding. Mirror this list into `docs/ROADMAP.md`. Cite the books/skills each milestone leans on (verify the `§`).
