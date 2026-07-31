#!/usr/bin/env python3
"""session_close_contract.py -- the Stop-event gate behind the landing block (#749).

WHY THIS IS MACHINERY AND NOT PROSE. The owner reads this project from a phone.
Before this hook a work turn ended in whatever the session felt like writing, and the
two things he actually needed -- "does this want something from me?" and "do I say
continue, or paste a /compact?" -- had to be reverse-engineered out of it every time,
across several of his projects. The contract already existed in prose: `prepare_compaction`
carries a proactive "run me unprompted at a clean checkpoint" contract and a `next
session:` opener line (#487) that answers exactly the does-this-wait-on-you question.
Prose is what failed. All of it sat behind a skill a session had to *choose* to invoke,
and sessions didn't -- so the fix cannot be another sentence asking them to.

WHAT IT ENFORCES. A turn that used a work tool must end with four labelled fields, in
the owner's order (surveyed 2026-07-29, #749 -- he wrote this shape himself after
declining all three offered):

    **Session**    what changed AND why it was built that way, in plain speak
    **Cost**       spend + context %, from `slice_telemetry.py status`
    **Needs you**  the ask, or the explicit word "nothing"
    **Next**       "continue here: <why>" | "compact: <why>"

Verdict rule, his: context under 25% AND a next slice that is small or needs this
one's context => continue here; otherwise compact. The 25% is about OUTPUT QUALITY
("the model gets dumber with too much context"), NOT about running out of room --
do not let it drift into a compact-when-full rule, which would fire far later.

That rule keys on a number no agent can introspect, so this gate also holds the
stated figure to the ledger's (#765; see CTX_PCT). It is the second half of a rule
whose first half was already mechanical -- #487's opener line derives its ticket
count from ready_work.py, while the context figure was left to a feeling.

A `compact` verdict pulls in two further obligations, both checkable and both the
literal content of the owner's complaint: the message must actually carry the
`/compact` block (his words: "I run into issues where it hasn't prepared a compaction
message"), and the turn must have surveyed him (#749 answer: the end-of-session
survey fires *always*, standing question = what's next). Both are reported in the
SAME nudge as any missing field, so one round-trip repairs everything.

FAIL-SOFT EVERYWHERE EXCEPT THE ONE JUDGEMENT. Unparseable stdin, missing transcript,
unreadable ledger -> exit 0. It blocks on exactly one thing: work happened and the
contract is unmet. Blocking is exit 2 with the reason on stderr, which Claude Code
feeds back to the model. `stop_hook_active` guarantees at most ONE nudge per turn, so
a session can never be trapped here -- the gate costs a retry, never a deadlock.

WHY THE TRANSCRIPT AND NOT A FLAG FILE. Deciding "did this turn do work" wants
per-turn tool history. A PostToolUse hook writing a flag file would supply it at the
cost of another hook and another piece of state; the transcript already records
tool_use blocks as they happen (verified live 2026-07-29 -- the current turn's Bash
calls are present in the file when Stop fires). The documented caveat that the
transcript "may lag the current turn" is about the FINAL assistant message, which is
why the message text is read from `last_assistant_message` instead of from the file.

Windows/ASCII: the nudge reaches a cp1252 console through the hook error path, so it
carries no non-ASCII -- same discipline as every sibling in this directory.
"""
import json
import os
import re
import sys

# The four fields, in the owner's order. Their spelling is the contract: the agent
# writes them, this hook greps them, and docs/AUTOMATION.md s8 documents them --
# change one and change all three in the same commit.
FIELDS = ("**Session**", "**Cost**", "**Needs you**", "**Next**")
VERDICTS = ("continue here", "compact")

# #765: the verdict keys on a number an agent CANNOT introspect. Everything a
# session can feel -- how much it read, how long it worked, how much it wrote --
# tracks effort, not residual window, and after a compaction those diverge hard:
# the window resets, the sense of having-worked does not. The error is therefore
# one-directional and always expensive, because over-estimating ends a good
# window early and pays a full re-onboard to return, while under-estimating is
# caught by the harness. Observed twice: at #729 a self-estimate of ~50% against
# an actual 20% (three slices shipped in the window that would have been thrown
# away), and again at #777 -- ~25-30% guessed against an actual 15%.
# So the figure is READ, not felt, and this hook holds the message to the ledger
# it was supposed to read. The same regex parses both sides, so a wording change
# in format_status moves them together instead of silently failing one.
CTX_PCT = re.compile(r"(?:ctx|context)\D{0,12}(\d{1,3})\s*%", re.I)
# Slack for the window growing while a long block is being composed. Wide enough
# that honest staleness never blocks; far tighter than either observed miss.
CTX_TOLERANCE = 5


def ctx_pct(text):
    """The first context percentage stated in `text`; None when it names none.
    None means "unknown", which never accuses -- the ledger being unreadable must
    not turn into a wrong finding (the same rule slice_telemetry applies to its
    own markers)."""
    m = CTX_PCT.search(text or "")
    return int(m.group(1)) if m else None

# Tools that make a turn "real work". Read-only tools (Read/Grep/Glob/WebFetch/
# WebSearch/ToolSearch) are deliberately ABSENT: a turn that only read files to
# answer a question is the pure-conversation case the owner exempted. Bash is IN
# even though plenty of Bash is read-only -- misfiring costs the owner four lines
# he can skim, while a missed hand-back costs exactly the thing this hook exists to
# prevent, so the bias is chosen, not sloppy.
WORK_TOOLS = frozenset({"Edit", "Write", "NotebookEdit", "Bash",
                        "Agent", "Task", "Workflow"})

TAIL_BYTES = 2_000_000   # transcripts reach tens of MB; the current turn is at the end
TAIL_LINES = 400         # ~200 tool calls -- far past any real turn


def read_tail(path):
    """Parsed JSONL rows from the end of the transcript; [] on any failure (fail-soft).

    Bounded on purpose: a mature session's transcript is tens of megabytes and this
    runs at every Stop. Reading from the end can split a line, so the first row of a
    truncated read is dropped rather than guessed at.
    """
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            if size > TAIL_BYTES:
                f.seek(size - TAIL_BYTES)
                f.readline()  # discard the partial line the seek landed inside
            raw = f.read().decode("utf-8", "replace")
    except Exception:
        return []
    rows = []
    for line in raw.splitlines()[-TAIL_LINES:]:
        try:
            rows.append(json.loads(line))
        except ValueError:
            pass
    return rows


def is_user_turn(row):
    """True for a genuine owner message -- not a tool result, not an injected meta row."""
    # `"toolUseResult" in row`, never `row.get(...)`: a tool that returns nothing
    # records an EMPTY dict, which is falsy, so a truthiness test would read that
    # result as a fresh owner turn and truncate the work scan right there. Found by
    # the mutation battery's fixture, not by review.
    if row.get("type") != "user" or row.get("isMeta") or "toolUseResult" in row:
        return False
    content = (row.get("message") or {}).get("content")
    if isinstance(content, list):
        return not any(isinstance(b, dict) and b.get("type") == "tool_result"
                       for b in content)
    return True


def turn_tools(rows):
    """Tool names used since the last genuine user turn.

    No user turn inside the bounded tail means a very long turn, so the whole tail is
    treated as the current one: that over-counts tools, which biases toward nudging.
    Erring that way is the point -- a spurious nudge costs a retry, a missed one costs
    the owner the hand-back.
    """
    start = 0
    for i, row in enumerate(rows):
        if is_user_turn(row):
            start = i
    names = []
    for row in rows[start:]:
        content = (row.get("message") or {}).get("content")
        if not isinstance(content, list):
            continue
        for b in content:
            if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name"):
                names.append(b["name"])
    return names


def check_block(text, tools=(), cost_line=""):
    """None when the contract is met; else a list of what's wrong, owner-legible.

    Pure: every input is passed in, so the selftest drives the real decision function
    rather than a copy of it (#319). The verdict is read from the tail of the message
    -- after the **Next** label -- so the word "compact" appearing in ordinary prose
    higher up cannot be mistaken for a verdict.

    `cost_line` is the ledger's own reading, passed in so the stated context figure
    can be checked against it rather than trusted (#765).
    """
    text = text or ""
    missing = [f for f in FIELDS if f not in text]
    if missing:
        return ["missing field(s): " + ", ".join(missing)]

    # Checked before the verdict, because the verdict is DERIVED from this number:
    # a wrong figure here makes a wrong continue-vs-compact call downstream.
    # Scoped to the **Cost** LINE, not the whole message: a hand-back that quotes
    # the rule it is applying ("under 25% context and the next slice is small")
    # would otherwise be read as reporting 25%, and this gate blocks a hand-back
    # -- a false positive here costs the owner the very message it exists to get.
    cost_field = text[text.index(FIELDS[1]):].split("\n", 1)[0]
    stated, actual = ctx_pct(cost_field), ctx_pct(cost_line)
    if stated is not None and actual is not None and abs(stated - actual) > CTX_TOLERANCE:
        return [f"the **Cost** field states ctx {stated}% but the ledger reads "
                f"{actual}% -- the figure is read from `slice_telemetry.py status`, "
                "never estimated from how much work the session did (#765). Fix the "
                "number, then re-check the verdict: it keys on this."]

    tail = text[text.rindex(FIELDS[-1]):].lower()
    verdict = next((v for v in VERDICTS if v in tail), None)
    if not verdict:
        return ['**Next** names no verdict -- write "continue here: <why>" or '
                '"compact: <why>". This is the one thing the owner cannot infer, '
                "and inferring it is what he asked us to stop making him do."]
    if verdict != "compact":
        return None

    # A compact verdict ends the session, so it owes the two things a session end owes.
    owed = []
    if "/compact" not in text:
        owed.append("the verdict is `compact` but the message carries no /compact "
                    "block -- run prepare_compaction and end with its fenced command "
                    "(the owner's literal complaint: it hasn't prepared one)")
    if "AskUserQuestion" not in tools:
        owed.append("the verdict is `compact` but no survey ran this turn -- #749 "
                    "answer was survey ALWAYS at session end, standing question "
                    "'what's next' over the ready set")
    return owed or None


def meters(sid):
    """The **Cost** field's value from the statusline ledger; '' when unavailable.

    Imports the formatter from scripts/slice_telemetry.py rather than re-deriving it,
    so the number this nudge quotes and the number the agent reads for itself cannot
    disagree. Hooks are fail-open: any import or read problem degrades to the command
    the agent can run, never to a guessed figure.
    """
    if not sid:
        return ""
    try:
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        sys.path.insert(0, os.path.join(root, "scripts"))
        from slice_telemetry import format_status, session_snapshot
        return format_status(session_snapshot(sid, root=root))
    except Exception:
        return ""


def nudge(problems, cost_line):
    """The blocking message. ASCII only -- it surfaces through a cp1252 console."""
    cost = cost_line or "run: python3 scripts/slice_telemetry.py status"
    return "\n".join([
        "BLOCKED: this turn did real work, but the reply does not close with the "
        "landing block (#749).",
        "",
    ] + [f"  - {p}" for p in problems] + [
        "",
        "End the message with these four fields, in this order:",
        "",
        "  **Session** - what changed AND why it was built that way, in plain speak.",
        "                The owner's own example of the register he wants: \"we added",
        "                machinery since the prose kept being ignored and was wasting",
        "                tokens when agents tried to fix the issue.\" A file list is",
        "                not this; the judgement is the deliverable.",
        f"  **Cost** - {cost}",
        "  **Needs you** - the ask, or the explicit word \"nothing\".",
        "  **Next** - \"continue here: <why>\" or \"compact: <why>\".",
        "",
        "Verdict rule: context under 25% AND the next slice is small or needs this",
        "one's context => continue here. Otherwise compact: run prepare_compaction,",
        "survey the owner on what's next, and end with the fenced /compact block.",
        "(The 25% is about output quality, not about running out of room.)",
        "READ the context figure from the Cost line above -- never estimate it from",
        "how much work this session did. Effort and residual window diverge, and a",
        "compaction resets the window without resetting the feeling (#765).",
        "",
        "Full contract: docs/AUTOMATION.md s8.",
    ])


def selftest():
    """Offline, side-effect-free corpus over the pure core (#319; SELFTEST_HOOKS)."""
    failed = 0

    def check(name, got, want):
        nonlocal failed
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} {name}"
              + ("" if ok else f" -> got {got!r}, want {want!r}"))

    def msg(session=True, cost=True, needs=True, nxt="continue here: #729 is small",
            extra=""):
        parts = []
        if session:
            parts.append("**Session** - shipped the thing, because the prose was ignored")
        if cost:
            parts.append("**Cost** - $1.00 this session, ctx 7% used")
        if needs:
            parts.append("**Needs you** - nothing")
        if nxt is not None:
            parts.append(f"**Next** - {nxt}")
        return "\n".join(parts) + extra

    # --- turn_tools: which tools ran since the owner last spoke
    def user(text="go"):
        return {"type": "user", "message": {"role": "user", "content": text}}

    def result():
        return {"type": "user", "toolUseResult": {}, "message":
                {"role": "user", "content": [{"type": "tool_result"}]}}

    def uses(*names):
        return {"type": "assistant", "message": {"role": "assistant", "content":
                [{"type": "tool_use", "name": n} for n in names]}}

    check("tools: collected after the last user turn",
          turn_tools([user(), uses("Bash"), result()]), ["Bash"])
    check("tools: an earlier turn's tools are NOT this turn's",
          turn_tools([user(), uses("Write"), result(), user(), uses("Read")]), ["Read"])
    # A tool_result row is a user-ROLE row but not a user TURN; reading it as one
    # would truncate the turn at the first tool call and blind the work check.
    check("tools: a tool result does not start a new turn",
          turn_tools([user(), uses("Bash"), result(), uses("Edit")]), ["Bash", "Edit"])
    check("tools: an injected meta row does not start a new turn",
          turn_tools([user(), uses("Bash"),
                      dict(user(), isMeta=True), uses("Edit")]), ["Bash", "Edit"])
    # The `toolUseResult` key guard, isolated: this row carries no tool_result content
    # block, so the content check cannot catch it and only the key check can.
    check("tools: a result row without a content list is still not a turn",
          turn_tools([user(), uses("Bash"),
                      {"type": "user", "toolUseResult": {},
                       "message": {"role": "user", "content": "ok"}},
                      uses("Edit")]), ["Bash", "Edit"])
    check("work: read-only turn is not work",
          any(t in WORK_TOOLS for t in turn_tools([user(), uses("Read", "Grep")])), False)
    check("work: an edit is work",
          any(t in WORK_TOOLS for t in turn_tools([user(), uses("Read", "Edit")])), True)
    # Bash on its own, because it is both the commonest work tool and the deliberate
    # over-trigger -- the membership every future trim of WORK_TOOLS will reach for.
    check("work: a shell-only turn is work",
          any(t in WORK_TOOLS for t in turn_tools([user(), uses("Bash")])), True)
    check("work: a delegated turn is work",
          any(t in WORK_TOOLS for t in turn_tools([user(), uses("Agent")])), True)

    # --- check_block: the contract itself
    check("block: complete continue-block passes", check_block(msg()), None)
    check("block: every field missing is named at once",
          check_block("nothing here"),
          ["missing field(s): **Session**, **Cost**, **Needs you**, **Next**"])
    check("block: a missing Cost is caught (the phone-visible number)",
          check_block(msg(cost=False)), ["missing field(s): **Cost**"])
    check("block: a missing Needs-you is caught -- silence is not an answer",
          check_block(msg(needs=False)), ["missing field(s): **Needs you**"])
    check("block: fields present but no verdict is a failure",
          bool(check_block(msg(nxt="see above"))), True)
    # The scoping case. It has to DISCRIMINATE, not merely fail: a fixture asserting
    # "some problem was returned" passes under both readings, because reading the
    # whole message finds a verdict too -- just the wrong one. So the message says
    # `compact` at **Next** while the prose above mentions continuing, and meets
    # neither compact obligation. Correct: verdict=compact, 2 problems. Whole-text
    # mutant: reads "continue here" from the prose and returns None, silently
    # dropping both obligations. (First attempt here was the Agreeable Fixture --
    # same class as #735/#739, caught by the battery rather than by review.)
    check("block: a verdict word in prose above **Next** is not the verdict",
          len(check_block("continue here is tempting, but no\n"
                          + msg(nxt="compact: heavy"), tools=("Bash",)) or []), 2)
    check("block: compact verdict without a /compact block is caught",
          check_block(msg(nxt="compact: heavy session"), tools=("AskUserQuestion",)),
          ["the verdict is `compact` but the message carries no /compact block -- run "
           "prepare_compaction and end with its fenced command (the owner's literal "
           "complaint: it hasn't prepared one)"])
    # `or []` throughout: a mutation that disables a check returns None, and an
    # assertion that CRASHES on None aborts the suite instead of reporting a failure
    # -- the battery read that as a kill when it was really a brittle fixture.
    check("block: compact verdict without a survey is caught",
          len(check_block(msg(nxt="compact: heavy", extra="\n/compact Keep verbatim"),
                          tools=("Bash",)) or []), 1)
    check("block: compact verdict missing BOTH reports both, one round-trip",
          len(check_block(msg(nxt="compact: heavy"), tools=("Bash",)) or []), 2)
    check("block: a complete compact hand-back passes",
          check_block(msg(nxt="compact: heavy session",
                          extra="\n\n```text\n/compact Keep verbatim -- Resume: ...\n```"),
                      tools=("Bash", "AskUserQuestion")), None)
    # continue-here owes neither obligation: it is not a session end.
    check("block: continue verdict owes no /compact and no survey",
          check_block(msg(), tools=()), None)

    # --- #765: the stated context figure is held to the ledger's
    LEDGER = "$1.00 this session, ctx 7% used (peak 28%)"
    # The used figure, never the peak beside it -- the verdict keys on used.
    check("ctx: the first figure is read, not the peak that follows it",
          ctx_pct("ctx 7% used (peak 28%)"), 7)
    check("ctx: a spelled-out label is read too", ctx_pct("context: 30%"), 30)
    check("ctx: a line naming no percentage is unknown, not zero",
          ctx_pct("$1.00 this session"), None)
    # Must-not-match: a percentage that is not a context reading.
    check("ctx: an unrelated percentage is not a context figure",
          ctx_pct("$1.00 this session, 25% of the budget"), None)
    check("ctx: agreement passes", check_block(msg(), cost_line=LEDGER), None)
    check("ctx: staleness inside the tolerance passes (a long block takes time)",
          check_block(msg(), cost_line="$1.00 this session, ctx 11% used"), None)
    check("ctx: exactly at the tolerance still passes",
          check_block(msg(), cost_line="$1.00 this session, ctx 12% used"), None)
    check("ctx: one point past the tolerance is caught",
          bool(check_block(msg(), cost_line="$1.00 this session, ctx 13% used")), True)
    # The two live misses this gate exists for, as fixtures. #729: ~50% felt against
    # 20% actual. #777: ~28% felt against 15% actual, one message from a needless
    # compact -- and note 28 is also the session PEAK, the likeliest thing to grab.
    check("ctx: the #729 miss (50% felt, 20% actual) is caught",
          bool(check_block(msg(cost=True).replace("ctx 7%", "ctx 50%"),
                           cost_line="$1.00 this session, ctx 20% used")), True)
    check("ctx: the #777 miss (28% felt, 15% actual) is caught",
          bool(check_block(msg(cost=True).replace("ctx 7%", "ctx 28%"),
                           cost_line="$1.00 this session, ctx 15% used (peak 28%)")), True)
    # Symmetric: the ticket's defect is one-directional, the check must not be.
    check("ctx: an UNDER-estimate is caught too, not only an over-estimate",
          bool(check_block(msg(cost=True).replace("ctx 7%", "ctx 5%"),
                           cost_line="$1.00 this session, ctx 40% used")), True)
    # Fail-open, both sides: never accuse from an unknown (the slice_telemetry rule).
    check("ctx: an unreadable ledger accuses nothing",
          check_block(msg(), cost_line=""), None)
    check("ctx: a Cost line stating no figure accuses nothing",
          check_block(msg(cost=False).replace(
              "**Session**", "**Cost** - $1.00 this session\n**Session**"),
              cost_line=LEDGER), None)
    # The scoping case, and it has to DISCRIMINATE. First attempt put the decoy
    # figure in **Next**, AFTER the Cost line -- an Agreeable Fixture (#735/#739),
    # because `search` takes the first match and finds the honest Cost figure
    # either way. It passed under both readings and the battery said so. The decoy
    # has to sit BEFORE the Cost line to discriminate, and a **Session** field
    # describing this very slice is the realistic way that happens.
    check("ctx: a percentage in **Session** is not the Cost reading",
          check_block("**Session** - explained why writing ctx 50% from a feeling "
                      "is a guess\n" + msg(), cost_line=LEDGER), None)
    # ...and the same shape for a figure quoted in **Next**, which is where the
    # rule itself gets restated. Kept as a second case, not a replacement: the two
    # fail for different reasons under a widened search.
    check("ctx: quoting the 25% rule after the Cost line changes nothing",
          check_block(msg(nxt="continue here: context 25% is the threshold, #783 small"),
                      cost_line=LEDGER), None)
    # Ordering: a wrong figure is reported INSTEAD of the downstream verdict
    # problems, because the verdict is derived from it -- fixing the number may
    # change the verdict, so re-deciding beats reporting both.
    check("ctx: a wrong figure preempts the verdict checks it feeds",
          len(check_block(msg(nxt="compact: heavy").replace("ctx 7%", "ctx 50%"),
                          tools=("Bash",),
                          cost_line="$1.00 this session, ctx 9% used") or []), 1)

    # --- nudge: it has to carry the numbers, or it costs another round-trip
    text = nudge(["missing field(s): **Cost**"], "$5.00 this session, ctx 9% used")
    check("nudge: quotes the live meters so one retry suffices",
          "$5.00 this session, ctx 9% used" in text, True)
    check("nudge: falls back to the command when the ledger is unreadable",
          "slice_telemetry.py status" in nudge(["x"], ""), True)
    check("nudge: ASCII only (cp1252 consoles)", text.isascii(), True)

    print(f"session-close contract selftest: {'FAIL' if failed else 'PASS'} "
          f"({failed} failure(s))")
    return 1 if failed else 0


def main():
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8", "replace"))
    except Exception:
        return 0
    # Never block twice on one turn: the retry has already been asked for, and a
    # second refusal is how a Stop hook traps a session.
    if data.get("stop_hook_active"):
        return 0
    # A subagent's hand-back is not the owner's; Stop is converted to SubagentStop
    # there, but the identity fields are the belt-and-braces check.
    if data.get("agent_id") or data.get("agent_type"):
        return 0
    tools = turn_tools(read_tail(data.get("transcript_path") or ""))
    if not any(t in WORK_TOOLS for t in tools):
        return 0
    # Read once, before the check: the ctx comparison needs it (#765) and the nudge
    # quotes the same string, so the two can never disagree.
    # Dropping this argument is the one #765 mutation the corpus cannot kill, and
    # it cannot be closed there either: in CI there is no statusline ledger, so
    # meters() returns "" and any main()-level fixture would be inert whatever the
    # wiring did. It is covered by the fire test instead -- the #319 division
    # (pure core gets the corpus, wiring gets a side-effect-isolated fire test).
    cost_line = meters(data.get("session_id"))
    problems = check_block(data.get("last_assistant_message"), tools, cost_line)
    if not problems:
        return 0
    sys.stderr.write(nudge(problems, cost_line) + "\n")
    return 2


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    sys.exit(main())
