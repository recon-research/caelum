# PATTERNS — Named Recurring Techniques

The reusable techniques of `<DOMAIN>`, each given a name so the library and its readers share vocabulary ("just use `<PATTERN>` here"). A pattern is a solution shape that recurs; naming it makes designs discussable and reviews faster. The inverse catalog — techniques to *avoid* — lives in [ANTI_PATTERNS.md](ANTI_PATTERNS.md).

> **Format.** One pattern per `###` heading, each with three short parts:
> - **What it is** — the technique in one or two sentences.
> - **When to use** — the situation that calls for it (and when *not* to).
> - **Taught in** — where the book covers it, as plain-text "Book NN §X".
>
> Give each a crisp, memorable name. Write "Book NN" as plain text. Link a related fork with [DECISION_TREES.md](DECISION_TREES.md).

<!-- EXAMPLE — replace -->
### `<Pattern Name>` (e.g. "`<TERM>` Pooling")

- **What it is:** `<one-sentence technique — e.g. reuse a fixed set of <TERM> objects instead of allocating per use>`.
- **When to use:** `<the trigger — e.g. when <TERM> creation is hot and lifetimes are short>`. Not worth it when `<the counter-case>`.
- **Taught in:** Book NN §X.Y.
<!-- /EXAMPLE -->

<!-- EXAMPLE — replace -->
### `<Second Pattern Name>` (e.g. "`<TERM>` as `<role>`")

- **What it is:** `<technique>`.
- **When to use:** `<situation>`. Pairs with the `<D-n>` fork — see [DECISION_TREES.md](DECISION_TREES.md).
- **Taught in:** Book NN §X, Book MM §X.
<!-- /EXAMPLE -->

<!-- Add one ### per recurring technique. -->

---

> **Fill this in during onboarding.** Harvest these from the "Implementation" sections of the books — the moves that show up again and again. A good pattern has a name worth saying out loud, a clear "use it / don't" boundary, and a cited home section (verify the `§`). If a technique only appears once, it is probably not a pattern yet.
