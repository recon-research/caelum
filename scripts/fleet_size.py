#!/usr/bin/env python3
# fleet_size.py -- "how many builder sessions can the current tickets support?"
# The #332 sizing query behind the fleet protocol (D-330; evidence:
# research/notes/parallel-builder-fleet.md).
#
#   N = min( largest pairwise-disjoint-Surfaces subset of the ready set,
#            floor(ready_total / TICKETS_PER_BUILDER),   # queue-depth floor
#            attention ceiling (--ceiling, default 4) )  # field consensus 3-5
# clamped to >= 1 (solo always works).
#
# Certify-safe (D-330): a ticket with no `Surfaces:` line counts as
# overlapping-with-everything -- it can seed a lane alone, it never
# parallelizes. Disjointness is path-prefix overlap: `scripts/` collides with
# `scripts/metrics.py`, not with `docs/`. The disjoint-subset search is greedy
# (smallest footprint first, ties by issue number -- deterministic); at
# advisory scale an approximation only ever under-reports parallelism, the
# conservative direction.
#
# Hot-file exclusion (#349): a ticket whose Surfaces overlap a merge-owned
# hot file (HOT_FILES -- conventions > Concurrent writers > Doc caches under
# concurrency) never seeds a lane; it is listed with a hot annotation instead
# of silently hidden. Conservative: exclusion only shrinks the advertised
# fleet. Observed live 2026-07-17: #346 offered as a seed despite Surfaces
# containing textbooks/SECTIONS.json.
#
# Consumers: the fleet_size skill (owner query), onboard when fleet mode is
# being considered. Advisory like ready_work.py: exits nonzero on a dead
# tracker rather than printing a wrong answer.
#
# Single-implementation Python (D-210), stdlib only, cwd-independent.
import json
import re
import sys
import os

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ready_work  # noqa: E402  (chdirs to repo root on import)

TICKETS_PER_BUILDER = 5  # field heuristic: 5-6 ready tickets queued per builder

# Merge-owned hot files in fleet mode: Status / ROADMAP / SECTIONS.json never
# ride feature branches (conventions > Concurrent writers > Doc caches under
# concurrency, D-330). Mirror constant, single conventions home (#294 rule,
# update_from_template's SYNC_REFERENCE.md roster): a downstream with additional every-slice files
# extends this to match its own conventions list.
HOT_FILES = ("CLAUDE.md", "docs/ROADMAP.md", "textbooks/SECTIONS.json")

SURFACES_RE = re.compile(r"^Surfaces:\s*(.+?)\s*$", re.M)


def surfaces_of(body):
    """Sorted path list from the ticket's Surfaces line; None when unscoped.

    A placeholder line (`Surfaces: <the files/dirs ...>`) is unscoped too
    (#479): angle brackets mean the template was never filled, and parsing
    the fragments would mint phantom "paths" disjoint from every real
    surface -- a fake lane, the anti-certify-safe direction."""
    m = SURFACES_RE.search(body or "")
    if not m:
        return None
    if "<" in m.group(1) or ">" in m.group(1):
        return None
    return sorted({p.strip().rstrip("/") for p in m.group(1).split() if p.strip()})


def parse_ceiling(argv, default=4):
    """--ceiling N from argv; a missing or non-integer value is a usage
    error, not a traceback (#479)."""
    if "--ceiling" not in argv:
        return default
    try:
        return int(argv[argv.index("--ceiling") + 1])
    except (IndexError, ValueError):
        sys.exit("fleet_size: --ceiling needs an integer value "
                 "(e.g. --ceiling 3)")


def compute_bounds(n_ready, n_lanes, ceiling):
    """(bounds, n). n is 0 on an empty ready set -- reporting "1 supportable"
    with nothing to claim was the #479 nit; the >=1 clamp holds otherwise
    (solo always works)."""
    if n_ready == 0:
        return {"disjoint": 0, "queue_depth": 0, "ceiling": ceiling}, 0
    bounds = {"disjoint": max(n_lanes, 1),
              "queue_depth": max(n_ready // TICKETS_PER_BUILDER, 1),
              "ceiling": ceiling}
    return bounds, min(bounds.values())


def paths_overlap(p, q):
    return p == q or p.startswith(q + "/") or q.startswith(p + "/")


def sets_overlap(a, b):
    if a is None or b is None:  # unscoped overlaps everything (certify-safe)
        return True
    return any(paths_overlap(p, q) for p in a for q in b)


def hot_hits(surfaces):
    """Hot files the ticket's Surfaces overlap (path-prefix, both directions).

    Unscoped (None) returns [] -- those tickets already never parallelize;
    the hot annotation is for scoped tickets that would otherwise look
    lane-safe."""
    if surfaces is None:
        return []
    return [h for h in HOT_FILES if any(paths_overlap(p, h) for p in surfaces)]


def disjoint_lanes(tickets):
    """Greedy largest pairwise-disjoint subset -- the lane seeds."""
    scoped = [t for t in tickets if t["surfaces"] is not None]
    scoped.sort(key=lambda t: (len(t["surfaces"]), t["number"]))
    lanes = []
    for t in scoped:
        if all(not sets_overlap(t["surfaces"], lane["surfaces"]) for lane in lanes):
            lanes.append(t)
    return lanes


def main():
    ceiling = parse_ceiling(sys.argv)
    ready, stats = ready_work.ready_items()
    tickets = [{"number": t["number"], "title": t["title"],
                "surfaces": surfaces_of(t["body"])} for t in ready]
    for t in tickets:
        t["hot"] = hot_hits(t["surfaces"])
    hot = [t for t in tickets if t["hot"]]
    lanes = disjoint_lanes([t for t in tickets if not t["hot"]])
    unscoped = [t for t in tickets if t["surfaces"] is None]

    bounds, n = compute_bounds(stats["ready"], len(lanes), ceiling)
    limiting = sorted(k for k, v in bounds.items() if v == n)

    if "--json" in sys.argv:
        print(json.dumps({"n": n, "bounds": bounds, "limiting": limiting,
                          "lanes": [{"number": t["number"], "title": t["title"],
                                     "surfaces": t["surfaces"]} for t in lanes],
                          "hot": [{"number": t["number"], "title": t["title"],
                                   "hot_files": t["hot"]} for t in hot],
                          "unscoped": [t["number"] for t in unscoped],
                          "ready": stats["ready"]}, indent=2))
        return

    if n == 0:
        print("fleet_size: 0 builder sessions -- the ready set is empty "
              "(file or unblock work first)")
        return
    print(f"fleet_size: {n} concurrent builder session(s) supportable "
          f"(limited by {', '.join(limiting)})")
    print(f"  bounds: disjoint-lanes={bounds['disjoint']} "
          f"queue-depth={bounds['queue_depth']} "
          f"(ready {stats['ready']} / {TICKETS_PER_BUILDER} per builder) "
          f"ceiling={ceiling}")
    if lanes:
        print("  lane seeds (pairwise-disjoint Surfaces):")
        for t in lanes:
            print(f"    #{t['number']}  {t['title']}  [{' '.join(t['surfaces'])}]")
    if hot:
        print("  hot-file overlap (merge-owned in fleet mode -- serialize, "
              "never a lane seed):")
        for t in hot:
            print(f"    #{t['number']}  {t['title']}  (hot: {', '.join(t['hot'])})")
    if unscoped:
        print(f"  unscoped (no Surfaces line -- serialize, or scope them to "
              f"widen the fleet): {', '.join('#' + str(t['number']) for t in unscoped)}")


def selftest():
    """Offline, side-effect-free (#319): pure helpers + the hot/lane split."""
    failed = 0

    def check(name, got, want):
        nonlocal failed
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} fleet-size: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    check("surfaces: parsed, deduped, dir slash stripped",
          surfaces_of("x\nSurfaces: scripts/ scripts docs/a.md\ny"),
          ["docs/a.md", "scripts"])
    check("surfaces: no line -> None (unscoped)", surfaces_of("no line here"), None)
    check("surfaces: placeholder line -> None, not phantom paths (#479)",
          surfaces_of("Surfaces: <the files/dirs this will touch>"), None)

    check("ceiling: default when absent", parse_ceiling(["fleet_size.py"]), 4)
    check("ceiling: parses value", parse_ceiling(["x", "--ceiling", "3"]), 3)
    for name, argv in (("missing value", ["x", "--ceiling"]),
                       ("non-integer value", ["x", "--ceiling", "lots"])):
        try:
            parse_ceiling(argv)
            got = "no exit"
        except SystemExit:
            got = "usage exit"
        check(f"ceiling: {name} is a usage error, not a traceback (#479)",
              got, "usage exit")

    check("bounds: empty ready set reports 0, not 1 (#479)",
          compute_bounds(0, 0, 4), ({"disjoint": 0, "queue_depth": 0,
                                     "ceiling": 4}, 0))
    check("bounds: >=1 clamp holds on a non-empty set",
          compute_bounds(2, 1, 4)[1], 1)

    # Every hot: case DERIVES from HOT_FILES instead of restating its members.
    # HOT_FILES is project-mirrored (see the constant): a downstream re-keys it
    # to its own every-slice files -- exactly what its comment instructs -- and
    # a corpus written against upstream's literal then goes RED ON ARRIVAL for
    # doing the right thing (#693, intake #682 finding 3). That is #473's own
    # lesson pointed at #473's own file. The invariants below hold for any
    # non-empty constant, so re-keying cannot redden the suite; the case COUNT
    # scales with the constant, which is the visible sign it is derived.
    for h in HOT_FILES:
        check(f"hot: exact match '{h}'", hot_hits([h]), [h])
    # The #346 shape generalized: a parent-dir Surface covers every hot file
    # beneath it. Both the parent and the expectation come from the constant.
    for p in sorted({h.split("/")[0] for h in HOT_FILES if "/" in h}):
        check(f"hot: parent dir '{p}' covers its hot files", hot_hits([p]),
              [h for h in HOT_FILES if h.split("/")[0] == p])
    check("hot: all surfaces at once -> every hot file, in constant order",
          hot_hits(list(HOT_FILES)), list(HOT_FILES))
    # Sentinel, not a real repo path: guaranteed disjoint under ANY re-keying.
    # The literal this replaced ("scripts/fleet_size.py") is a path a downstream
    # could legitimately make hot, which would flip this case to a false red.
    check("hot: clean scoped ticket", hot_hits(["__not_a_hot_surface__/x"]), [])
    check("hot: unscoped -> [] (already never parallelizes)", hot_hits(None), [])

    # Lane split as main() composes it: the hot ticket is filtered before
    # seeding even though its Surfaces are disjoint from every other ticket.
    fake = [
        {"number": 3, "surfaces": ["textbooks/SECTIONS.json"]},
        {"number": 1, "surfaces": ["scripts/a.py"]},
        {"number": 2, "surfaces": ["docs2/b.md"]},
        {"number": 4, "surfaces": None},
    ]
    for t in fake:
        t["hot"] = hot_hits(t["surfaces"])
    lanes = disjoint_lanes([t for t in fake if not t["hot"]])
    check("lanes: hot ticket excluded, disjoint rest seed",
          sorted(t["number"] for t in lanes), [1, 2])
    check("lanes: hot list names the ticket",
          [t["number"] for t in fake if t["hot"]], [3])
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv[1:] else main())
