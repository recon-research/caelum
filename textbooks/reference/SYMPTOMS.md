# SYMPTOMS — Plain-Language Troubleshooting Lookup

The "something's wrong, where do I start?" table, keyed on how a user actually describes the problem — "X is slow", "the output is wrong", "it's flaky", "it broke after I changed Y" — not on technical cause. Each row routes to the matching [ANTI_PATTERNS.md](ANTI_PATTERNS.md) entry and the book section that explains the fix.

> **Format.** A lookup table. Columns: **Symptom (user's words)** | **Likely cause** | **Go to**. Phrase the symptom the way a frustrated user would type it. "Go to" routes to an [ANTI_PATTERNS.md](ANTI_PATTERNS.md) entry name and/or a plain-text "Book NN §X". Group by surface (slow / wrong / flaky / broken / won't start) if the table grows. Write "Book NN" as plain text.

| Symptom (user's words) | Likely cause | Go to |
|---|---|---|
| "Tests pass but it's wrong — how did this get past the suite?" | the tests' only oracle is the code's own report of what it did | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The Self-Reporting Oracle" |
<!-- ^ pre-seeded universal row — keep (matches ANTI_PATTERNS › Universal entries, #244) -->
<!-- EXAMPLE — replace -->
| "`<EXAMPLE_SYSTEM>` is slow when I `<do X>`" | `<TERM>` recomputed every cycle; no caching | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "Premature `<TERM>`"; Book NN §X |
| "The `<output>` is wrong / off by `<amount>`" | `<wrong assumption — e.g. units, ordering, stale state>` | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "`<name>`"; Book NN §X |
| "It's flaky — passes sometimes, fails others" | `<non-determinism — e.g. unordered iteration, race, time dependence>` | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "`<name>`"; Book NN §X |
| "It broke right after I added `<feature>`" | `<the God <COMPONENT> — one change ripples>` | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The God `<COMPONENT>`"; Book NN §X |
| "`<EXAMPLE_SYSTEM>` won't start / crashes on launch" | `<missing config / unmet assumption from the baseline>` | [STARTER_KIT.md](STARTER_KIT.md) M0; Book NN §X |
<!-- /EXAMPLE -->

---

> **Fill this in during onboarding.** Build this from the questions users *actually ask* and from the symptom field of each [ANTI_PATTERNS.md](ANTI_PATTERNS.md) entry — this doc is the user-vocabulary front door to that catalog. Every "Go to" must resolve to a real anti-pattern or a verified `§`. Favor the phrasing a non-expert would use ("it's slow", "it's wrong") over precise terminology; that is the whole point of this lookup.
