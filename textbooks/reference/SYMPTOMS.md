# SYMPTOMS — Plain-Language Troubleshooting Lookup

The "something's wrong, where do I start?" table, keyed on how a user actually describes the problem — "X is slow", "the output is wrong", "it's flaky", "it broke after I changed Y" — not on technical cause. Each row routes to the matching [ANTI_PATTERNS.md](ANTI_PATTERNS.md) entry and the book section that explains the fix.

> **Format.** A lookup table. Columns: **Symptom (user's words)** | **Likely cause** | **Go to**. Phrase the symptom the way a frustrated user would type it. "Go to" routes to an [ANTI_PATTERNS.md](ANTI_PATTERNS.md) entry name and/or a plain-text "Book NN §X". Group by surface (slow / wrong / flaky / broken / won't start) if the table grows. Write "Book NN" as plain text.

| Symptom (user's words) | Likely cause | Go to |
|---|---|---|
| "Tests pass but it's wrong — how did this get past the suite?" | the tests' only oracle is the code's own report of what it did | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The Self-Reporting Oracle" |
| "The validator let obviously bad input straight through — I thought we blocked that" | the refusal branch shipped without the tampered input that trips it; only the accept path is tested | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The Untested Refusal" |
| "It's wrong in production, but our tests for that rule are strict and they all pass" | the fixtures only visit configurations where the right and wrong readings of the rule agree — nothing discriminates them | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The Agreeable Fixture" |
| "The UI check was green but the values on screen were swapped / the opposite label showed" | substring / aggregate-text / count oracles are satisfiable by the wrong value | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The Satisfiable-by-Anything Assertion" |
| "The doc says five items but the list clearly has six — which is right?" | a hand-written count / prose enumeration of a growable list drifted from its source | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The Hand-Written Count" |
| "We always said it heals / stays ordered / is atomic — it doesn't, and the tests never noticed" | the invariant was only ever stated in prose; no test names it, so a green suite proves nothing about it | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The Prose Invariant" |
| "I added a new component and a test I never touched went red — in a different feature" | a shared class / prefix / key gained its second producer, widening an old harness's selector that was never scoped to its own section | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The Unscoped Selector" |
| "Files I never touched are suddenly missing / won't import — right after a check that passed" | a fixture's teardown was wider than its setup (`rm -rf` on a directory `mkdir -p` only *found*), so real content went with it | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The Wider Teardown" |
| "We fixed that bypass and added a regression test — how is it still getting through?" | the corpus grew by exactly one case, pinning the spelling the reviewer typed; the plainer members of the same class were never enumerated | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The Half-Closed Class" |
| "The check says it covers X, and I'm looking at an X it didn't catch" | the guard's prose claims reach its corpus never exercises — true of the matcher, false of what gets fed to it | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The Guard That Advertises More Than It Enforces" |
| "My uncommitted work is gone — and we have a rule against exactly this" | the safety check lives in the tool, but the hazard belongs to the moment, so the quick inline version skipped it | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The Guard That Lives in the Harness" |
<!-- ^ pre-seeded universal rows — keep (match ANTI_PATTERNS › Universal entries, #244/#346/#517/#518/#557/#568/#587/#736/#738/#759) -->
<!-- EXAMPLE — replace -->
| "`<EXAMPLE_SYSTEM>` is slow when I `<do X>`" | `<TERM>` recomputed every cycle; no caching | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "Premature `<TERM>`"; Book NN §X |
| "The `<output>` is wrong / off by `<amount>`" | `<wrong assumption — e.g. units, ordering, stale state>` | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "`<name>`"; Book NN §X |
| "It's flaky — passes sometimes, fails others" | `<non-determinism — e.g. unordered iteration, race, time dependence>` | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "`<name>`"; Book NN §X |
| "It broke right after I added `<feature>`" | `<the God <COMPONENT> — one change ripples>` | [ANTI_PATTERNS.md](ANTI_PATTERNS.md) "The God `<COMPONENT>`"; Book NN §X |
| "`<EXAMPLE_SYSTEM>` won't start / crashes on launch" | `<missing config / unmet assumption from the baseline>` | [STARTER_KIT.md](STARTER_KIT.md) M0; Book NN §X |
<!-- /EXAMPLE -->

---

> **Fill this in during onboarding.** Build this from the questions users *actually ask* and from the symptom field of each [ANTI_PATTERNS.md](ANTI_PATTERNS.md) entry — this doc is the user-vocabulary front door to that catalog. Every "Go to" must resolve to a real anti-pattern or a verified `§`. Favor the phrasing a non-expert would use ("it's slow", "it's wrong") over precise terminology; that is the whole point of this lookup.
