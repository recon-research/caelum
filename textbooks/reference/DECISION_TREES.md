# DECISION_TREES — The Recurring Architectural Forks

The handful of decisions you make over and over in `<DOMAIN>`, resolved once here with their trade-offs and a recommended default. When the build loop hits a fork, come here before re-litigating it from scratch. Each tree is numbered **D1, D2, …** so it maps onto the project's `D-NN` decision log (a choice recorded as `D-07` cites the tree `D7` it came from).

> **Format.** One fork per `## Dn` heading. State the **Question**, the **Options** with their trade-offs, and a **Recommended default** with the condition under which you'd deviate. A small text flowchart or bullet tree is fine — keep it skimmable. Write "Book NN" as plain text. Link sibling docs, e.g. [ANTI_PATTERNS.md](ANTI_PATTERNS.md).

## D1 — `<The First Recurring Question>`

<!-- EXAMPLE — replace -->
**Question:** When you need `<capability>`, do you `<Option A>` or `<Option B>`?

```
Is <key condition X> true?
├─ yes ──▶ does <secondary condition Y> hold?
│          ├─ yes ─▶ Option A  (<TERM>-based)
│          └─ no  ─▶ Option B  (<other TERM>-based)
└─ no  ──▶ Option B
```

**Options & trade-offs:**
- **Option A — `<name>`:** + `<upside, e.g. simpler, faster to ship>`; − `<downside, e.g. doesn't scale past N>`.
- **Option B — `<name>`:** + `<upside, e.g. flexible, scales>`; − `<downside, e.g. more moving parts, slower start>`.

**Recommended default:** `<Option A>` unless `<the condition that flips it>` — then `<Option B>`. The classic failure here is in [ANTI_PATTERNS.md](ANTI_PATTERNS.md). Taught in Book NN §X.
<!-- /EXAMPLE -->

## D2 — `<The Second Recurring Question>`

<!-- EXAMPLE — replace -->
**Question:** `<e.g. Build <THING> in-house or adopt <EXTERNAL_OPTION>?>`

**Options & trade-offs:**
- **In-house:** + control, fit; − cost, maintenance burden.
- **Adopt:** + speed, batteries-included; − lock-in, may not fit `<DOMAIN>` edge cases.

**Recommended default:** Adopt for `<the common case>`; build in-house only when `<the differentiating requirement>`. Taught in Book NN §X, Book MM §X.
<!-- /EXAMPLE -->

<!-- Add D3, D4, … for each fork the domain keeps hitting. -->

---

> **Fill this in during onboarding.** Harvest these from the "Architecture & design" sections of the books, where alternatives are compared. A good tree captures a decision the domain *actually keeps making*, names the real options, and commits to a default (a tree with no recommendation is just a list). Keep the `Dn` numbers stable — the project's `D-NN` log and `plan_work` reference them. Verify every cited `§`.
