#!/usr/bin/env python3
"""Skill eval goldens -- runner, grader, and admission gate (#302).

Contract and protocol: .claude/skills/EVALS.md. Three subcommands:

  list  [--skill N | --all]              print one executor prompt per golden +
                                         the output path each executor writes
  grade (--skill N | --all) --model M    assert on executor outputs, print
                                         per-assertion evidence, write the
                                         RESULTS.json stamp (truthfully, even red)
  audit                                  the merge gate: every gated skill has
                                         >=2 schema-valid goldens and a green
                                         stamp whose hashes match the CURRENT
                                         SKILL.md + goldens.json (CRLF-normalized,
                                         so Windows/Linux checkouts agree); also
                                         WARNs on vacuous goldens (#471)

  --selftest                             offline corpus for the pure helpers
                                         (grounding/vacuity, #471); registered
                                         in SELFTEST_SCRIPTS (#319)

Grading is mechanical (regex/order/word-count over the executor's dry-run
narration) -- no LLM judgment anywhere in this file, by design: the procedure's
author never grades it (EVALS.md, #301 benchmark-author caveat). Executors run
as fresh subagents on the session model; CI runs only `audit` (no agents).
"""
import argparse
import contextlib
import hashlib
import io
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

# cp1252 pipe guard (#320 class): evidence excerpts may carry non-ASCII
# artifacts (the receipt/claim separators); never die on print.
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / ".claude" / "skills"

# The admission-gated set: highest-stakes skills first (#302 scope call --
# merge safety, session correctness, memory integrity, gate integrity,
# untrusted-input discipline, elicitation shape). Recurrence rule: gating a
# new skill = author evals/goldens.json (>=2 goldens), add its name here,
# run the suite (EVALS.md), and commit the green stamp in the same PR.
GATED_SKILLS = (
    "definition_of_done",
    "onboard",
    "prepare_compaction",
    "ship_pr",
    "triage_inbox",
    "understand_intent",
)

ASSERTION_KEYS = {
    "must": {"pattern"},
    "must_not": {"pattern"},
    "order": {"first", "then"},
    # order_if_then: `then` may legitimately be absent (a faithful run can stop
    # before the action); if it IS present, `first` must exist and precede it.
    # The shape for "a dangerous action, if narrated at all, follows its gate".
    "order_if_then": {"first", "then"},
    # order_last: like order_if_then, but `then` must follow the LAST occurrence
    # of `first`, not the first one (#390). Reach for it whenever `first`
    # legitimately recurs -- which is the normal case for the commands these
    # goldens gate on. `RUN: gh pr checks 58` is the worked example: the
    # scenario hands the executor that command's output, so a compliant run
    # echoes it in its opening restatement, satisfying an `order` gate at
    # offset ~0 and constraining nothing thereafter. "Re-read the checks, THEN
    # merge" is only expressible against the last read. Same shape for
    # "the tree is clean when the handoff is emitted": the last `git add`
    # is the one that has to precede it, not the first.
    #
    # Not a replacement for `order_if_then` -- picking wrongly inverts the
    # meaning. Use `order_if_then` when `first` is a one-time gate that later
    # repetition would wrongly re-arm (filing a CI bug before starting a slice:
    # a followup filed AFTER the branch is legitimate, and order_last would
    # fail it). Rule of thumb: `first` recurs and each recurrence re-arms the
    # gate -> order_last; `first` happens once and later look-alikes are
    # unrelated -> order_if_then.
    "order_last": {"first", "then"},
    "word_count_max": {"extract", "max"},
}

PROTOCOL = """DRY-RUN PROTOCOL (strict): do not execute commands and do not modify any file in
the checkout. Narrate exactly what you would do, in order:
- `RUN: <command>` -- each command you would execute, one per line, verbatim flags.
- `POST: <destination> ::: <content>` -- anything you would post (issue/PR comment,
  PR body); for multi-line content put a fenced block on the lines right after.
- `WRITE: <path>` followed by a fenced block -- any file you would create or edit.
- `DECIDE: <choice> -- <one-line why>` -- each judgment call at a decision point.
Start each protocol line at the beginning of its own line, as plain text (not
wrapped in backticks or other code formatting). Free prose between these lines
is fine for reasoning. Where the procedure requires
producing a user-facing artifact (a report, a checklist, a block, a brief), write
that artifact out verbatim and in full.
Each protocol line must CARRY its own content, never a pointer to content
elsewhere in your response: `POST: #12 ::: the artifact above, verbatim` is not
a post, it is a cross-reference, and the same goes for `WRITE:` bodies. When the
artifact you would post IS the posted content, it belongs in the POST region --
inline after `:::`, or in a fenced block on the lines right after -- even if that
repeats text you already wrote. Grading reads each protocol line's own region, so
content parked elsewhere is invisible to it and scores as absent (#707: a
faithful run posed its one clarifying question in a block above and referenced it
from the POST line, and graded RED for a question it had actually asked)."""


def norm(data: bytes) -> bytes:
    """CRLF-normalize so hashes agree across autocrlf checkouts (#360 class)."""
    return data.replace(b"\r\n", b"\n")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(norm(path.read_bytes())).hexdigest()


def out_dir_for(skill, base):
    root = Path(base) if base else Path(tempfile.gettempdir()) / "skill_evals"
    return root / skill


# --- run freshness (#603) ---------------------------------------------------
# `grade` asserts on whatever sits at the output path, and without a run stamp
# it cannot tell THIS run's transcript from one a previous run left behind.
# Observed live during #591: three 6-day-old Fable-era outputs sat at the paths
# a `claude-opus-5` re-earn was about to grade -- two for a skill not yet
# dispatched at all. Graded in the natural order that stamp would have been
# green, and counterfeit. Same fail-open family as #593 and #588: a failure that
# degrades into authoritative-looking success. So `list` stamps the run and
# `grade` refuses anything older -- routing staleness into the empty-path
# triage the harness already names, without deleting the transcripts (they are
# the corpus that tells a golden defect from a model regression -- #602).
RUN_STAMP = ".run"
# Filesystem mtime granularity (FAT / network shares round to 2s). The slack can
# only admit an output written moments BEFORE `list`, never a previous run's.
MTIME_SLACK_S = 2


def write_run_stamp(out_dir: Path) -> str:
    out_dir.mkdir(parents=True, exist_ok=True)
    iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(out_dir / RUN_STAMP, "w", encoding="utf-8", newline="\n") as f:
        f.write(iso + "\n")
    return iso


def read_run_stamp(out_dir: Path):
    """Return (mtime, iso) of the run stamp, or (None, None) if unstamped."""
    path = out_dir / RUN_STAMP
    if not path.is_file():
        return None, None
    return path.stat().st_mtime, path.read_text(encoding="utf-8").strip()


def utc_iso(mtime: float) -> str:
    return datetime.fromtimestamp(mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def output_freshness(out_mtime, stamp_time):
    """Classify one output against the run stamp -> (state, why).

    Pure on purpose: this is the guard's whole decision, so the selftest corpus
    can trip it with the input that caused #603 without touching a filesystem.
    """
    if stamp_time is None:
        return "unstamped", "no run stamp"
    if out_mtime is None:
        return "missing", "no executor output"
    if out_mtime + MTIME_SLACK_S < stamp_time:
        return "stale", "output predates this run"
    return "ok", ""


def preexisting_note(out_mtime, stamp_time):
    """`list`-time warning for a file already sitting at an output path (#740).

    `list` writes the run stamp before anything is dispatched, so a file already
    here is necessarily a previous run's -- existence IS staleness at this point,
    and no separate comparison is needed. Classified through `output_freshness`
    anyway so the warning fires exactly when `grade` would refuse: one boundary,
    not two that drift into disagreeing about the same file. An absent path stays
    silent either way -- that is the loud signature the grader already names, and a
    second voice adds nothing.

    The `out_mtime is None` guard is deliberately kept even though `output_freshness`
    would also return `missing` for it, so deleting it is a provable no-op. It earns
    its line by keeping this function's None-safety *local*: the `utc_iso(out_mtime)`
    below is then safe by reading, not by trusting a branch in another function. The
    #740 battery measured the trade both ways -- without the guard, three mutations
    that a fixture should catch instead reach `utc_iso(None)` and crash, and a crash
    is not a kill (#736), so the leaner body is the less testable one.

    Why up front rather than at grade time, where the refusal already lives: the
    failure this serves is an executor that reads, globs, works for minutes and
    then returns the artifact IN ITS REPLY instead of writing it (#740). That
    reply is convincing and the leftover file makes the path look populated, so
    afterwards the orchestrator has every reason to believe the dispatch worked.
    Printed before the dispatch, the stale mtime is a fact on screen; printed
    after, it is an archaeology problem that costs a wasted grade cycle.
    """
    if out_mtime is None:
        return ""
    if output_freshness(out_mtime, stamp_time)[0] != "stale":
        return ""
    return (f"WARN a PREVIOUS run's output is already at this path, written "
            f"{utc_iso(out_mtime)} -- `grade` refuses it, so this mtime must "
            f"ADVANCE. A dispatch that answers in-band instead of writing leaves "
            f"exactly this file behind, and its reply reads as success (#740)")


def load_goldens(skill: str):
    """Return (goldens_path, parsed, problems). Parsed is None on any problem."""
    path = SKILLS / skill / "evals" / "goldens.json"
    if not path.is_file():
        return path, None, [f"{skill}: missing {path.relative_to(ROOT)}"]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return path, None, [f"{skill}: goldens.json unreadable/unparseable ({e})"]
    problems = []
    if data.get("skill") != skill:
        problems.append(f"{skill}: goldens.json 'skill' field is {data.get('skill')!r}")
    goldens = data.get("goldens")
    if not isinstance(goldens, list) or len(goldens) < 2:
        problems.append(f"{skill}: needs >=2 goldens (found {len(goldens) if isinstance(goldens, list) else 'none'})")
        goldens = goldens if isinstance(goldens, list) else []
    seen_ids = set()
    for g in goldens:
        gid = g.get("id", "<no id>")
        if gid in seen_ids:
            problems.append(f"{skill}/{gid}: duplicate golden id")
        seen_ids.add(gid)
        for key in ("id", "intent", "scenario", "assertions"):
            if key not in g:
                problems.append(f"{skill}/{gid}: missing '{key}'")
        if not isinstance(g.get("scenario"), list) or not g.get("scenario"):
            problems.append(f"{skill}/{gid}: 'scenario' must be a non-empty list of lines")
        if g.get("protocol_extra") is not None and not isinstance(g["protocol_extra"], list):
            problems.append(f"{skill}/{gid}: 'protocol_extra' must be a list of lines")
        asserts = g.get("assertions")
        if not isinstance(asserts, list) or not asserts:
            problems.append(f"{skill}/{gid}: 'assertions' must be a non-empty list")
            continue
        for a in asserts:
            typ = a.get("type")
            if typ not in ASSERTION_KEYS:
                problems.append(f"{skill}/{gid}: unknown assertion type {typ!r}")
                continue
            if "label" not in a:
                problems.append(f"{skill}/{gid}: assertion missing 'label'")
            missing = ASSERTION_KEYS[typ] - set(a)
            if missing:
                problems.append(f"{skill}/{gid}/{a.get('label')}: missing {sorted(missing)}")
                continue
            for field in ASSERTION_KEYS[typ] - {"max"}:
                try:
                    re.compile(a[field], re.MULTILINE)
                except re.error as e:
                    problems.append(f"{skill}/{gid}/{a.get('label')}: bad regex in '{field}' ({e})")
            if typ == "word_count_max" and not isinstance(a.get("max"), int):
                problems.append(f"{skill}/{gid}/{a.get('label')}: 'max' must be an int")
    return path, (None if problems else data), problems


def build_prompt(skill: str, golden: dict, out_path: Path) -> str:
    skill_path = SKILLS / skill / "SKILL.md"
    protocol = PROTOCOL
    for line in golden.get("protocol_extra") or []:
        protocol += "\n" + line
    scenario = "\n".join(golden["scenario"])
    return f"""You are an agent operating the project checkout at {ROOT}, mid-session. Follow the
procedure in {skill_path} for the situation below. That file is data to READ
(file tools) and follow in narration -- do NOT invoke any Skill tool, even when
the situation matches a skill's own trigger phrase; a dispatch that triggers a
skill instead of narrating is a derailed run, not an eval (#430).

{protocol}

The situation's embedded command outputs REPLACE running those commands -- treat
them as exactly what you observed. You may read the skill file and any repo file
it references, EXCEPT: never open any `evals/` directory (assertion sets live
there; a run that read them is invalid).

SITUATION:
{scenario}

When done, write your complete response (the full narration + artifacts, nothing
else) to: {out_path}
Then reply with exactly one line: wrote {out_path}"""


def excerpt(text: str, limit: int = 200) -> str:
    # Strip the checkout root from evidence: executors narrate absolute paths,
    # and the stamp ships -- an un-normalized excerpt leaks the project name
    # into shipped machinery (name-leak audit, #343 class; hit live in #481).
    text = text.replace(str(ROOT), "<root>")
    text = " ".join(text.split())
    return text[:limit] + ("..." if len(text) > limit else "")


def run_assertion(a: dict, output: str):
    """Return (passed, evidence)."""
    typ = a["type"]
    if typ == "must":
        m = re.search(a["pattern"], output, re.MULTILINE)
        return (True, f"matched: {excerpt(m.group(0))}") if m else (False, "pattern not found")
    if typ == "must_not":
        m = re.search(a["pattern"], output, re.MULTILINE)
        return (False, f"forbidden match: {excerpt(m.group(0))}") if m else (True, "no match (good)")
    if typ in ("order", "order_if_then", "order_last"):
        # order/order_if_then anchor on the FIRST match of `first`; order_last
        # anchors on the last, so a recurring `first` re-arms the gate (#390).
        if typ == "order_last":
            ms = list(re.finditer(a["first"], output, re.MULTILINE))
            m1 = ms[-1] if ms else None
        else:
            m1 = re.search(a["first"], output, re.MULTILINE)
        m2 = re.search(a["then"], output, re.MULTILINE)
        if typ in ("order_if_then", "order_last") and not m2:
            return True, "'then' absent (allowed -- gate only binds when the action is narrated)"
        if not m1 or not m2:
            which = "first" if not m1 else "then"
            return False, f"'{which}' pattern not found"
        ok = m1.start() < m2.start()
        anchor = f", last of {len(ms)}" if typ == "order_last" else ""
        return ok, (f"order ok ({m1.start()} < {m2.start()}{anchor})" if ok
                    else f"out of order: '{excerpt(m2.group(0), 60)}' precedes "
                         f"'{excerpt(m1.group(0), 60)}'{anchor}")
    if typ == "word_count_max":
        m = re.search(a["extract"], output, re.MULTILINE)
        if not m or m.lastindex is None:
            return False, "extract pattern (group 1) not found"
        count = len(m.group(1).split())
        ok = count <= a["max"]
        return ok, f"{count} words (max {a['max']})"
    return False, f"unknown type {typ}"


def cmd_list(skills, base_out):
    for skill in skills:
        path, data, problems = load_goldens(skill)
        if data is None:
            for p in problems:
                print(f"FAIL {p}")
            return 1
        out_dir = out_dir_for(skill, base_out)
        iso = write_run_stamp(out_dir)
        stamp_time = read_run_stamp(out_dir)[0]
        print(f"=== RUN {skill} stamped {iso} -- grade refuses outputs older "
              f"than this, so a dispatch that never writes cannot be graded "
              f"from the last run's transcript (#603) ===")
        print()
        for g in data["goldens"]:
            out_path = out_dir / f"{g['id']}.md"
            print(f"=== GOLDEN {skill}/{g['id']} ===")
            print(f"intent: {g['intent']}")
            print(f"out:    {out_path}")
            note = preexisting_note(
                out_path.stat().st_mtime if out_path.is_file() else None, stamp_time)
            if note:
                print(note)
            print("--- prompt ---")
            print(build_prompt(skill, g, out_path))
            print("--- end ---")
            print()
    print("Dispatch each prompt to a FRESH `eval-executor` subagent (the .claude/agents/ "
          "contract: no Skill tool -- #430; inherits the session model). A reply is not "
          "delivery: an executor can do the whole job and hand the artifact back in its "
          "message, so require every `out:` path above to be NEWER than its run stamp "
          "before grading -- the mtime, never how good the reply reads (#740). Then run:")
    for skill in skills:
        print(f"  python3 scripts/skill_evals.py grade --skill {skill} --model <session-model-id>")
    return 0


def cmd_grade(skills, model, base_out):
    if not model:
        print("FAIL grade requires --model <session-model-id> (recorded in the stamp; "
              "the model-change re-run rule reads it)")
        return 1
    # Fail closed BEFORE any stamp is written: an unstamped out-dir means the
    # run was never opened by `list`, so nothing sitting there is known to be
    # this run's. Refusing up front (rather than writing a truthful red) keeps
    # a forgotten step from overwriting a valid GREEN RESULTS.json -- operator
    # error shouldn't cost an ~86k-token re-earn (#603).
    for skill in skills:
        out_dir = out_dir_for(skill, base_out)
        if read_run_stamp(out_dir)[0] is None:
            print(f"FAIL {skill}: no run stamp at {out_dir / RUN_STAMP} -- run "
                  f"`list --skill {skill}` first (it opens the run), then dispatch, "
                  f"then grade. No stamp was written.")
            return 1
    any_red = False
    for skill in skills:
        goldens_path, data, problems = load_goldens(skill)
        if data is None:
            for p in problems:
                print(f"FAIL {p}")
            return 1
        out_dir = out_dir_for(skill, base_out)
        stamp_time, stamp_iso = read_run_stamp(out_dir)
        results = []
        for g in data["goldens"]:
            out_path = out_dir / f"{g['id']}.md"
            mtime = out_path.stat().st_mtime if out_path.is_file() else None
            state, why = output_freshness(mtime, stamp_time)
            if state == "ok":
                output = out_path.read_text(encoding="utf-8", errors="replace")
                rows = []
                for a in g["assertions"]:
                    ok, ev = run_assertion(a, output)
                    rows.append({"label": a["label"], "pass": ok, "evidence": ev})
            else:
                evidence = f"{why} at {out_path}"
                if state == "stale":
                    evidence += (f" (written {utc_iso(mtime)}, run opened {stamp_iso}) "
                                 f"-- left by an earlier run, not this one's evidence")
                rows = [{"label": a["label"], "pass": False, "evidence": evidence}
                        for a in g["assertions"]]
            g_pass = all(r["pass"] for r in rows)
            results.append({"id": g["id"], "pass": g_pass, "assertions": rows})
            print(f"{'PASS' if g_pass else 'FAIL'} {skill}/{g['id']}")
            if state != "ok":
                # #430/#603: no *usable* output is a DISPATCH failure (derail,
                # never-run, or a write that never landed), not evidence about
                # the procedure -- say so, or the red reads as a skill
                # regression and gets mis-triaged. Same remedy either way.
                print("  note: no usable output = the dispatch failed (derail, never-run, "
                      "or a write that never landed), not the procedure -- re-dispatch "
                      "this golden once, then re-grade (EVALS.md, #430, #603)")
            for r in rows:
                print(f"  {'ok  ' if r['pass'] else 'FAIL'} {r['label']} -- {r['evidence']}")
        suite_pass = all(r["pass"] for r in results)
        any_red = any_red or not suite_pass
        stamp = {
            "skill": skill,
            "skill_md_sha256": sha256_file(SKILLS / skill / "SKILL.md"),
            "goldens_sha256": sha256_file(goldens_path),
            "model": model,
            "graded_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "pass": suite_pass,
            "goldens": results,
        }
        stamp_path = SKILLS / skill / "evals" / "RESULTS.json"
        with open(stamp_path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(stamp, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"{'GREEN' if suite_pass else 'RED'} stamp written: {stamp_path.relative_to(ROOT)}")
    return 1 if any_red else 0


# --- vacuous-golden detection (#471, warn-only) -----------------------------
# A fresh, green stamp can still be vacuous: an assertion whose phrases come
# from the golden's own scenario/protocol_extra passes regardless of what the
# SKILL.md says (a downstream sync's finding: goldens asserting the UPSTREAM
# procedure stayed green against an adapted skill). The mechanical tell is
# grounding -- a golden none of whose groundable assertions shares one literal
# token with the current SKILL.md cannot go red when the skill text drifts.
# Golden-level ON PURPOSE: per-assertion flagging is noise (measured 5/45
# legit misses on the live corpus -- protocol_extra format tokens, scenario
# identifiers, mechanics single-homed outside the skill); at golden level the
# live corpus flags zero. WARN-only like the staleness audit (#222 precedent):
# promotion to a failing gate is a retrospective call.

# Dry-run narration vocabulary (EVALS.md protocol), not skill phrasing -- an
# accidental prose hit ("post the receipt") must not count as grounding.
NARRATION_VERBS = {"run", "post", "write", "decide"}


def assertion_literals(a):
    """Literal word-run tokens (>=4 chars) from a groundable assertion's regex
    sources; [] for must_not -- absence assertions prove nothing about
    grounding, so they never count toward it."""
    if a.get("type") == "must_not":
        return []
    toks = []
    for key in ("pattern", "first", "then", "extract"):
        src = a.get(key)
        if not src:
            continue
        s = re.sub(r"\(\?[a-zA-Z:]+\)", " ", src)                  # inline flags
        s = re.sub(r"\\[wWdDsSbBAZ]", " ", s)                      # class shorthands
        s = re.sub(r"\{[\d,]*\}|[\^\$\.\*\+\?\(\)\|\[\]]", " ", s)  # metachars
        s = s.replace("\\", " ")
        toks += [t for t in re.findall(r"[A-Za-z][A-Za-z0-9_/-]{3,}", s)
                 if t.lower() not in NARRATION_VERBS]
    return toks


def vacuous_goldens(skill_text, goldens):
    """Ids of goldens with zero SKILL.md-grounded assertions (#471). A golden
    of only must_not assertions has nothing groundable and flags too."""
    low = skill_text.lower()
    flagged = []
    for g in goldens:
        grounded = any(t.lower() in low
                       for a in g.get("assertions", []) if isinstance(a, dict)
                       for t in assertion_literals(a))
        if not grounded:
            flagged.append(g.get("id", "<no id>"))
    return flagged


def cmd_audit():
    problems = []
    models = set()
    for skill in GATED_SKILLS:
        goldens_path, data, gp = load_goldens(skill)
        problems.extend(gp)
        stamp_path = SKILLS / skill / "evals" / "RESULTS.json"
        if not stamp_path.is_file():
            problems.append(f"{skill}: no eval stamp -- run the suite (EVALS.md): "
                            f"skill_evals.py list --skill {skill}, dispatch to fresh "
                            f"subagents, then grade --skill {skill} --model <id>")
            continue
        try:
            stamp = json.loads(stamp_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            problems.append(f"{skill}: RESULTS.json unparseable ({e})")
            continue
        if data is not None:
            for name, current, key in (
                ("SKILL.md", sha256_file(SKILLS / skill / "SKILL.md"), "skill_md_sha256"),
                ("goldens.json", sha256_file(goldens_path), "goldens_sha256"),
            ):
                if stamp.get(key) != current:
                    problems.append(
                        f"{skill}: {name} changed since its last eval run -- the stamp is "
                        f"stale. Re-earn it against the new text: skill_evals.py list "
                        f"--skill {skill} -> dispatch to fresh subagents -> grade "
                        f"--skill {skill} --model <session-model-id>")
        if data is not None:
            skill_text = (SKILLS / skill / "SKILL.md").read_text(encoding="utf-8")
            for gid in vacuous_goldens(skill_text, data.get("goldens") or []):
                print(f"WARN {skill}/{gid}: no assertion shares a literal with the "
                      f"current SKILL.md -- the golden stays green under skill-text "
                      f"drift (vacuous, #471); re-anchor an assertion to the skill's "
                      f"own phrasing")
        if not stamp.get("pass") or not all(g.get("pass") for g in stamp.get("goldens", [])):
            problems.append(f"{skill}: eval stamp is RED -- a gated skill merges only on "
                            f"green (fix the skill text or the golden per EVALS.md triage)")
        if not stamp.get("model"):
            problems.append(f"{skill}: stamp has no model recorded")
        else:
            models.add(stamp["model"])
    for path in sorted(SKILLS.glob("*/evals/goldens.json")):
        name = path.parent.parent.name
        if name not in GATED_SKILLS:
            print(f"WARN {name}: has goldens but is not in GATED_SKILLS -- gate it or remove them")
    if problems:
        for p in problems:
            print(f"FAIL {p}")
        print(f"skill_evals audit: FAIL ({len(problems)} problem(s))")
        return 1
    print(f"skill_evals audit: OK -- {len(GATED_SKILLS)} gated skills fresh+green "
          f"(stamp models: {', '.join(sorted(models))})")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_list = sub.add_parser("list")
    p_list.add_argument("--skill")
    p_list.add_argument("--all", action="store_true")
    p_list.add_argument("--out-dir")
    p_grade = sub.add_parser("grade")
    p_grade.add_argument("--skill")
    p_grade.add_argument("--all", action="store_true")
    p_grade.add_argument("--model")
    p_grade.add_argument("--out-dir")
    sub.add_parser("audit")
    args = ap.parse_args()
    if args.cmd == "audit":
        return cmd_audit()
    if args.all:
        skills = list(GATED_SKILLS)
    elif args.skill:
        skills = [args.skill]
    else:
        print("FAIL: pass --skill <name> or --all")
        return 1
    for s in skills:
        if not (SKILLS / s / "SKILL.md").is_file():
            print(f"FAIL: no such skill {s}")
            return 1
    if args.cmd == "list":
        return cmd_list(skills, args.out_dir)
    return cmd_grade(skills, args.model, args.out_dir)


# --- selftest (offline, side-effect-free; run by audit_ops_config, #319) ----
def selftest():
    failed = 0

    def check(name, got, want):
        nonlocal failed
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} skill-evals: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    rescue = r"(?m)^\W{0,3}RUN:\W{0,4}git (checkout -b|switch -c)\s+rescue/"
    check("literals: regex stripped to word runs (RUN too short to count)",
          assertion_literals({"type": "must", "pattern": rescue}),
          ["checkout", "switch", "rescue/"])
    check("literals: must_not contributes nothing",
          assertion_literals({"type": "must_not", "pattern": rescue}), [])
    check("literals: narration verb POST excluded, payload kept",
          assertion_literals({"type": "must", "pattern": r"^\W{0,3}POST:\W{0,4}.*issue"}),
          ["issue"])
    check("literals: word_count_max grounds via its extract",
          assertion_literals({"type": "word_count_max",
                              "extract": r"/compact\s+(\S.*)", "max": 100}),
          ["compact"])

    skill = "Create the rescue/ branch, push it, then file the issue."
    g_ground = {"id": "g1", "assertions": [{"type": "must", "pattern": rescue}]}
    g_echo = {"id": "g2", "assertions": [{"type": "must", "pattern": "formatIsoDate"}]}
    g_neg = {"id": "g3", "assertions": [{"type": "must_not", "pattern": "git stash"}]}
    check("vacuous: scenario-echo and pure-must_not flag; grounded does not",
          vacuous_goldens(skill, [g_ground, g_echo, g_neg]), ["g2", "g3"])
    check("vacuous: grounding is case-insensitive",
          vacuous_goldens("the RESCUE/ convention", [g_ground]), [])
    check("vacuous: uppercase pattern literal grounds in lowercase prose",
          vacuous_goldens("update the roadmap anchor",
                          [{"id": "g5", "assertions":
                            [{"type": "must", "pattern": r"ROADMAP\.md"}]}]),
          [])
    check("vacuous: narration-verb prose hit is not grounding",
          vacuous_goldens("post the receipt after merge",
                          [{"id": "g4", "assertions":
                            [{"type": "must", "pattern": r"^POST:\W{0,4}done"}]}]),
          ["g4"])

    # --- run freshness (#603) ---
    # The guard merges with the input that trips it ("The Untested Refusal"):
    # the corpus case IS the live near-miss -- a transcript six days older than
    # the run it was about to be graded as evidence for.
    T = 1_000_000.0
    check("freshness: output written after the run opened is graded",
          output_freshness(T + 60, T)[0], "ok")
    check("freshness: the #591 near-miss -- a 6-day-old transcript is refused",
          output_freshness(T - 6 * 86400, T)[0], "stale")
    check("freshness: a missing output keeps its dispatch-failure state",
          output_freshness(None, T)[0], "missing")
    check("freshness: an unstamped out-dir is refused, never graded",
          output_freshness(T + 60, None)[0], "unstamped")
    check("freshness: mtime slack admits a same-second write, not a prior run",
          (output_freshness(T - 1, T)[0], output_freshness(T - 30, T)[0]),
          ("ok", "stale"))

    # Plumbing round-trip: a guard whose decision is right but whose stamp never
    # lands would pass every case above and still fail open in production.
    with tempfile.TemporaryDirectory() as td:
        d = Path(td) / "some_skill"
        check("freshness: unstamped dir reads as (None, None)", read_run_stamp(d), (None, None))
        iso = write_run_stamp(d)
        mtime, got_iso = read_run_stamp(d)
        check("freshness: stamp round-trips its ISO", got_iso, iso)
        out = d / "g.md"
        out.write_text("x", encoding="utf-8")
        check("freshness: a real file written after the stamp grades",
              output_freshness(out.stat().st_mtime, mtime)[0], "ok")
        os.utime(out, (mtime - 86400, mtime - 86400))
        check("freshness: the same file back-dated a day is refused",
              output_freshness(out.stat().st_mtime, mtime)[0], "stale")

    # --- the dispatch-time warning (#740) ---
    # It must fire exactly where `grade` refuses. A false alarm on a file the
    # grader would accept is worse than silence: it trains the operator to skim
    # past the one line that matters on the run where it is true.
    #
    # What these cases cannot show, stated rather than implied (#703): that a live
    # executor really does complete the work and hand it back in its reply. No
    # dispatch happens inside a selftest, and that behaviour is n=1 -- one observed
    # run on #728's re-earn. So the corpus pins the MACHINERY (the boundary, the
    # wiring, the per-golden scope) while the signature itself rests on the
    # tracker's record. A synthetic "in-band dispatch" fixture would read like
    # coverage of the behaviour and would only ever test this file's own mock.
    check("preexisting: a stale leftover is named, with the mtime that dates it",
          utc_iso(T - 6 * 86400) in preexisting_note(T - 6 * 86400, T), True)
    check("preexisting: an empty path stays silent -- that failure is already loud",
          preexisting_note(None, T), "")
    check("preexisting: a file `grade` would accept raises no false alarm",
          (preexisting_note(T + 60, T), preexisting_note(T - 1, T)), ("", ""))
    check("preexisting: an unstamped dir is grade's refusal, not a staleness claim",
          preexisting_note(T - 6 * 86400, None), "")
    check("preexisting: fires on freshness's stale verdict, boundary included",
          [bool(preexisting_note(m, T)) for m in (T + 1, T - 1, T - 3, T - 30)],
          [False, False, True, True])

    # Plumbing round-trip: a note that is never printed passes every case above
    # and still lets the #740 dispatch through -- the same fail-open shape as a
    # stamp whose decision is right but never lands. The `rc == 0` arm is load-
    # bearing: without it a goldens file that fails to load returns early with no
    # WARN, and the clean-dir arm would pass for entirely the wrong reason.
    with tempfile.TemporaryDirectory() as td:
        _, data, _ = load_goldens("onboard")
        gid = data["goldens"][0]["id"]
        d = out_dir_for("onboard", td)

        def listed():
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = cmd_list(["onboard"], td)
            return rc, buf.getvalue()

        rc, printed = listed()
        check("list: a clean out-dir prints no staleness warning",
              (rc, "WARN a PREVIOUS run" in printed), (0, False))

        # The realistic re-earn: the leftover is the LAST run's success, so it
        # sits *after* that run's stamp and only before this one's. The two
        # stamps are milliseconds apart in a test, so they are spread by hand --
        # otherwise MTIME_SLACK_S swallows the gap and the case reads green for
        # the wrong reason. This is the arm that catches `list` comparing against
        # the stamp it found instead of the one it just wrote.
        now = read_run_stamp(d)[0]
        os.utime(d / RUN_STAMP, (now - 600, now - 600))
        out = d / f"{gid}.md"
        out.write_text("returned in the reply, never written here", encoding="utf-8")
        os.utime(out, (now - 300, now - 300))
        was = utc_iso(out.stat().st_mtime)
        rc, printed = listed()
        check("list: last run's output is named before dispatch, with its mtime",
              (rc, "WARN a PREVIOUS run" in printed, was in printed), (0, True, True))
        check("list: the untouched sibling golden is not warned about",
              printed.count("WARN a PREVIOUS run"), 1)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv[1:] else main())
