---
name: Decision (awaiting the human)
about: An architectural / scope fork that is the human's call — filed by the agent per CLAUDE.md §3
title: "D-NN: <the fork, as a question>"
labels: decision
---

## The fork

<what must be decided, and why it surfaced now>

## Options

<trade-offs stated as end-state consequences — what the owner's week looks like after this ships (support burden, recurring cost, legal exposure) — not implementation attributes; options genuinely distinguishable. Where options are close, a consequence grid: rows = the questions the owner would ask about living with it (`understand_intent` step 4; research/notes/intent-elicitation.md)>

1. **<option A — the recommended default, listed first>** — <trade-off>; grounding: <Book NN §X / DECISION_TREES Dn / research note or RR-NN>
2. **<option B>** — <trade-off>; grounding: <…>
3. <option C, if real>

## Recommended default

<the most ambitious / complete end-state — or the staged route toward it — and the one-paragraph why.
A cheaper FINAL scope must be argued here explicitly; a cheaper FIRST STEP toward the same end-state is just staging.>

## Reversibility & interim behavior

<pick one:>
- **Reversible** — proceeding **provisionally** on the recommended default; objection window until <date / next checkpoint>. Every PR built on this default carries `Provisional on #NN` in its body. Overrule here async and the work re-routes; **silence past the window ratifies the default** (recorded as D-NN "ratified by silence", issue closed).
- **Hard to reverse** (API shape / schema / migration / external commitment / money) — **blocked**; the slice is parked and work switched to the next independent slice.

## On decision

A comment here **is** the decision — `onboard` reads comments on every open `decision` issue. Record it as `D-NN` in docs/ARCHITECTURE.md Appendix A (decision · choice · grounding), reflect it in docs/ROADMAP.md, then close this issue. If the answer overrules a provisional default, file a re-route slice referencing every PR marked `Provisional on #NN`.
