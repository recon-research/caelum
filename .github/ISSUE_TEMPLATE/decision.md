---
name: Decision (awaiting the human)
about: An architectural / scope fork that is the human's call — filed by the agent per CLAUDE.md §3
title: "D-NN: <the fork, as a question>"
labels: decision
---

## The fork

<what must be decided, and why it surfaced now>

## Options

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
