# ANTI_PATTERNS — Failure Modes And Their Fixes

The catalog of ways work in `<DOMAIN>` goes wrong, and how to fix each. This is the pre-mortem reference: read the relevant entry *before* building something in an area, and again when it breaks. [SYMPTOMS.md](SYMPTOMS.md) routes plain-language complaints here.

> **Format.** One named anti-pattern per `###` heading, each with four labelled parts:
> - **Symptom** — what you observe (the externally visible bad behavior).
> - **Diagnosis** — the underlying cause, stated honestly.
> - **Fix** — the concrete corrective action (and the better pattern to adopt).
> - **Books** — where the right approach is taught, as plain text "Book NN §X".
>
> Give each entry a memorable name. Write "Book NN" as plain text, never a link. To cross-reference a technique, link the doc: [PATTERNS.md](PATTERNS.md).

<!-- EXAMPLE — replace -->
### `<Catchy Anti-Pattern Name>` (e.g. "Premature `<TERM>`")

- **Symptom:** `<what the developer or user sees — "X is slow / wrong / flaky after Y">`.
- **Diagnosis:** `<the real cause — e.g. the <TERM> is recomputed every cycle instead of cached; the design coupled A to B>`.
- **Fix:** `<the corrective move — e.g. hoist the computation; introduce <PATTERN>; invert the dependency>`. Adopt `<the recommended pattern>` instead.
- **Books:** Book NN §X.Y, Book MM §X.
<!-- /EXAMPLE -->

<!-- EXAMPLE — replace -->
### `<Second Anti-Pattern Name>` (e.g. "The God `<COMPONENT>`")

- **Symptom:** `<one <COMPONENT> grows to own everything; every change touches it>`.
- **Diagnosis:** `<responsibilities were never split; <DOMAIN> boundaries were not drawn>`.
- **Fix:** `<split along <the natural seam>; extract <sub-responsibilities>>`. See [DECISION_TREES.md](DECISION_TREES.md) for the boundary decision.
- **Books:** Book NN §X.
<!-- /EXAMPLE -->

---

> **Fill this in during onboarding.** Mine these from the "Gaps & opportunities" sections of the books and from real mistakes the domain is known for. Aim for the 8–15 failure modes practitioners actually hit, not a theoretical taxonomy. Each entry must name a real fix and cite a verified section. Keep symptoms in the *user's* vocabulary so [SYMPTOMS.md](SYMPTOMS.md) can route to them.
