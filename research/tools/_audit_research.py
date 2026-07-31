# Audit for the research/ frontier layer. Run from research/: python3 tools/_audit_research.py
# Flags: --strict-staleness (stale notes fail instead of warn) · --live (HEAD-check cited URLs; local use, not CI)
# Exits non-zero on errors, so CI can gate on it. See README.md for the discipline this enforces.
#
# The 'banked' collection kind (frozen generation data, README.md layout table) is a
# TEMPLATE-OPTIONAL content feature: a downstream without a banked/ dir or MANIFEST key
# loses nothing — every banked touchpoint below no-ops on absence by construction
# (M.get(kind, []) default, empty globs). Keep or delete the three banked lines when
# porting; either is a fine adaptation, not drift (#197, one downstream's recorded deviation).
import json
import re
import glob
import os
import sys
import datetime
# Windows cp1252 stdout guard (#296): gate output carries non-ASCII
# (em-dashes, section signs, file text); a cp1252-strict console mojibakes
# or crashes an otherwise-green run. Uniform across every gate script.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # cwd-independent: data lives beside tools/

errs, warns = [], []
STRICT_STALE = "--strict-staleness" in sys.argv
LIVE = "--live" in sys.argv
STALE_DAYS = 180

def is_template(p): return "TEMPLATE" in os.path.basename(p).upper()

# --- MANIFEST: valid, paths exist, everything on disk is routed ---
try:
    M = json.load(open("MANIFEST.json", encoding="utf-8"))
except Exception as e:
    print(f"  FAIL MANIFEST.json: invalid JSON ({e})")
    raise SystemExit(1)

listed = set()
for kind in ("notes", "experiments", "reports", "banked"):
    for e in M.get(kind, []):
        p = str(e.get("path", "")).replace("\\", "/")
        listed.add(p)
        if not os.path.exists(p):
            errs.append(f"MANIFEST {kind}: path missing on disk -> {p}")
        st = e.get("status")
        if st and st not in M.get("status_values", []) and st != "template":
            errs.append(f"MANIFEST {kind} {p}: status {st!r} not in status_values")
for k, targets in M.get("topic_to_notes", {}).items():
    for t in targets:
        if not os.path.exists(t):
            errs.append(f"MANIFEST topic_to_notes[{k!r}]: target missing -> {t}")

for p in (sorted(glob.glob("notes/*.md")) + sorted(glob.glob("reports/RR-*.md"))
          + sorted(glob.glob("experiments/EXP-*/EXPERIMENT.md"))
          + sorted(glob.glob("banked/*/README.md"))):
    q = p.replace("\\", "/")
    if is_template(q):
        continue
    if q not in listed and os.path.dirname(q) not in listed:
        errs.append(f"unrouted artifact (add a MANIFEST entry): {q}")

# The tier vocabulary is CLOSED and single-homed here — README.md rule 2 explains
# each tag, this set decides what the gate accepts, and the unknown-tag check below
# makes a typo or an invented tag loud instead of silent. Prose docs point at the
# legend rather than re-listing it (ANTI_PATTERNS "The Hand-Written Count").
SOURCED_TIERS = ("production-proven", "published", "experimental")
# [analysis]: a DERIVATION, not a fetched finding — a conclusion drawn from premises
# already established on the line (a cited artifact's documented semantics, a repo
# mechanic). There is no page to fetch, so it is exempt from the source/accessed
# requirement; the honesty condition is that the premise is stated. It is NOT an
# escape hatch for an unsourced empirical claim -- that stays a source-gate failure
# (#564: the tag was being written ad-hoc as '[analysis from git semantics]', outside
# the audited scheme entirely).
DERIVED_TIERS = ("analysis",)
KNOWN_TIERS = SOURCED_TIERS + DERIVED_TIERS
TIER = re.compile(r"\[(" + "|".join(SOURCED_TIERS) + r")\]")
# Tier-SHAPED bracket tokens: lowercase-led, no markdown-link parenthesis after.
# Anything matching that isn't a known tier is an ad-hoc tag that reads as a trust
# signal while escaping every check -- the exact gap #564 found.
#
# ADOPTION CLAIM, SCOPED (#692, intake #682): this flagged zero legitimate prose
# across THIS repo's corpus at adoption -- a claim about one corpus, never a
# universal, which is exactly the shape the blocking-guard adoption note warns
# about (README > blocking guards, #601/#611/#645). A downstream with quote-heavy
# notes proved the point: bracketed editorial insertion inside a quotation is
# standard scholarly convention, and "...a better detector of light [but] reduces
# the spatial resolution" tripped it. Same class as #473 -- a rule validated on
# one corpus behaving differently on another.
TAGLIKE = re.compile(r"\[([a-z][a-z0-9 ,\-—]{2,60})\](?!\()")
# Quoted spans, stripped for the TAGLIKE scan ONLY (#692). Exact rather than a
# length heuristic: a tier tag never appears inside a quotation, so removing
# quoted text cannot hide a real tag -- while TIER/QUANT keep reading the whole
# line, because a quoted claim still carries its tier and its numbers.
QUOTED = re.compile("[“\"][^“”\"]{0,400}[”\"]")
SRC = re.compile(r"\(sources?:\s*<?https?://")
ACC = re.compile(r"accessed \d{4}-\d{2}-\d{2}")
# Untagged-claim backstop (#5, warn-only): the tier tag is the enforcement hook,
# so an UNtagged quantitative claim escapes the source gate entirely. This catches
# the lowest-noise, highest-value slice of that gap — bare percentages and N×
# multipliers (47%, 2.5x, ×3), which are almost always empirical and rarely
# incidental in prose. A line is flagged only when it carries NEITHER a tier tag
# NOR a source: sourced-but-untiered lines stay traceable, and prose claims remain
# the tag-discipline-plus-review boundary (README discipline 1-2). Warn, never fail
# — a noisy gate trains the agent to ignore gates.
QUANT = re.compile(r"\d+(?:\.\d+)?\s?%"
                   r"|\d+(?:\.\d+)?\s?[xX×](?![A-Za-z0-9])"      # 2.5x  3×  (not 1920x1080, not 2xy)
                   r"|(?<![A-Za-z0-9])[xX×]\s?\d+(?:\.\d+)?")    # x2
REV = re.compile(r"^>\s*reviewed:\s*(\d{4}-\d{2}-\d{2})", re.M)
LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
CODE_SPAN = re.compile(r"`[^`]*`")
FENCE = chr(96) * 3


def taglike_hits(line):
    """Ad-hoc tier-shaped tags on one line. Pure, so --selftest drives it (#319).

    Strips inline code THEN quoted spans; a `[published]` inside code and a
    "[but]" inside a quotation are both prose, not trust signals. The callers'
    TIER/QUANT scans deliberately do NOT share this stripping.
    """
    return [t.group(1) for t in TAGLIKE.finditer(QUOTED.sub("", CODE_SPAN.sub("", line)))
            if t.group(1) not in KNOWN_TIERS]


# Gate placement: this must sit AFTER the constants above and BEFORE the
# MANIFEST load below, which exits(1) on a missing/invalid manifest -- a
# --selftest that needs the repo's data is not offline (#319).
if "--selftest" in sys.argv:
    # Both must-fire/must-not-fire cases come from the downstream that found
    # the defect (#682); the third is the one that matters, because a fix that
    # blinds the scan inside quotes would pass the first two.
    _cases = [
        ("editorial insertion inside a quotation is prose, not a tag",
         'Convergence makes rods "a better detector of light [but] reduces acuity"', []),
        ("a genuine ad-hoc tag still fires",
         "throughput rose [made-up-tier] per the vendor", ["made-up-tier"]),
        ("quoted insertion AND a real tag on one line: the tag still fires",
         'quote "a [sic] b" then a real bad tag [made-up-tier] here', ["made-up-tier"]),
        ("a known tier is never an ad-hoc tag", "finding [published] holds", []),
        ("a tag inside inline code is not a claim", "write `[published]` in prose", []),
        ("a markdown link is not a tag", "see [the note](notes/x.md)", []),
        ("straight-quoted insertion is stripped too",
         'he wrote "the rods [sic] pool" in 1966', []),
    ]
    _bad = 0
    for _name, _line, _want in _cases:
        _got = taglike_hits(_line)
        _ok = _got == _want
        _bad += 0 if _ok else 1
        print(f"{'PASS' if _ok else 'FAIL'} taglike: {_name}"
              + ("" if _ok else f" -> {_got!r} (want {_want!r})"))
    print(f"_audit_research selftest: {len(_cases) - _bad}/{len(_cases)} PASS")
    raise SystemExit(1 if _bad else 0)

def fenced_lines(lines):
    in_f = False
    for i, line in enumerate(lines, 1):
        if line.lstrip().startswith(FENCE):
            in_f = not in_f
            continue
        if not in_f:
            yield i, line

def scan_links(path, lines):
    for i, line in fenced_lines(lines):
        for m in LINK.finditer(CODE_SPAN.sub("", line)):
            tgt = m.group(1).strip()
            if tgt.startswith(("http://", "https://", "mailto:", "#")) or tgt.startswith("/"):
                continue
            p2 = tgt.split("#", 1)[0]
            if p2 and not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(path), p2))):
                errs.append(f"{path}:{i}: broken relative link -> {tgt}")

today = datetime.date.today()

# --- notes: reviewed-date + staleness; every tiered claim line is sourced + dated ---
for p in sorted(glob.glob("notes/*.md")):
    if is_template(p):
        continue
    lines = open(p, encoding="utf-8").read().split("\n")
    text = "\n".join(lines)
    m = REV.search(text)
    if not m:
        errs.append(f"{p}: missing '> reviewed: YYYY-MM-DD' header")
    else:
        try:
            age = (today - datetime.date.fromisoformat(m.group(1))).days
            if age > STALE_DAYS:
                (errs if STRICT_STALE else warns).append(
                    f"{p}: stale (reviewed {m.group(1)}, {age}d > {STALE_DAYS}d) — re-verify before planning against it")
        except ValueError:
            errs.append(f"{p}: unparseable reviewed date {m.group(1)!r}")
    for i, line in fenced_lines(lines):
        stripped = CODE_SPAN.sub("", line)   # a `[published]` / `2x` inside inline code is not a claim
        for tag in taglike_hits(line):
            errs.append(f"{p}:{i}: unknown tier-shaped tag [{tag}] -- the vocabulary is "
                        f"closed: {', '.join('[' + k + ']' for k in KNOWN_TIERS)} (README rule 2). "
                        "An ad-hoc tag reads as a trust signal but is checked by nothing; "
                        "use a real tier, or rephrase the line as a re-check question.")
        if TIER.search(stripped):
            if not SRC.search(line):
                errs.append(f"{p}:{i}: tiered claim without inline '(source: https://...)' on the same line")
            if not ACC.search(line):
                errs.append(f"{p}:{i}: tiered claim without 'accessed YYYY-MM-DD'")
        elif (q := QUANT.search(stripped)) and not SRC.search(line) \
                and not stripped.lstrip().startswith(("#", ">")):
            warns.append(f"{p}:{i}: quantitative claim {q.group(0).strip()!r} with no tier tag or source "
                         f"-- tag it `[tier]` + (source: URL, accessed YYYY-MM-DD), or rephrase (heuristic, warn-only)")
    scan_links(p, lines)

# --- reports: required sections; reference entries carry URLs ---
for p in sorted(glob.glob("reports/RR-*.md")):
    if is_template(p):
        continue
    lines = open(p, encoding="utf-8").read().split("\n")
    text = "\n".join(lines)
    for sec in ("## References", "## Reproducibility", "## Results", "## Discussion & limitations"):
        if sec not in text:
            errs.append(f"{p}: missing required section '{sec}'")
    in_refs = False
    for i, line in fenced_lines(lines):
        if line.startswith("## "):
            in_refs = line.strip() == "## References"
        elif in_refs and line.lstrip().startswith("- ") and "http" not in line:
            errs.append(f"{p}:{i}: reference entry without a URL")
    scan_links(p, lines)

# --- experiments: EXPERIMENT.md exists with the pre-registration sections ---
for d in sorted(glob.glob("experiments/EXP-*/")):
    f = os.path.join(d, "EXPERIMENT.md").replace("\\", "/")
    if not os.path.exists(f):
        errs.append(f"{d}: missing EXPERIMENT.md")
        continue
    lines = open(f, encoding="utf-8").read().split("\n")
    text = "\n".join(lines)
    for sec in ("## Hypothesis", "## Metrics & success criteria", "## Method", "## Reproducibility", "## Results", "## Outcome"):
        if sec not in text:
            errs.append(f"{f}: missing required section '{sec}'")
    scan_links(f, lines)

# --- banked collections: frozen generation data — README routed above; links must resolve ---
for p in sorted(glob.glob("banked/*/README.md")):
    scan_links(p, open(p, encoding="utf-8").read().split("\n"))

# --- optional: URL liveness (never a CI gate; flaky by nature) ---
if LIVE:
    import urllib.request
    urls = set()
    for p in glob.glob("**/*.md", recursive=True):
        if is_template(p):
            continue
        for m in re.finditer(r"https?://[^\s)\]>\"'`]+", open(p, encoding="utf-8").read()):
            urls.add(m.group(0).rstrip(".,;"))
    for u in sorted(urls):
        try:
            urllib.request.urlopen(urllib.request.Request(u, method="HEAD", headers={"User-Agent": "research-audit/1.0"}), timeout=15)
        except Exception:
            try:
                urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "research-audit/1.0"}), timeout=20)
            except Exception as e2:
                warns.append(f"--live: unreachable {u} ({type(e2).__name__})")

for w in warns:
    print("  WARN", w)
for e in errs:
    print("  FAIL", e)
print(f"research audit: {len(errs)} error(s), {len(warns)} warning(s)")
raise SystemExit(1 if errs else 0)
