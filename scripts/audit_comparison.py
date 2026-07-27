#!/usr/bin/env python3
"""audit_comparison.py -- the parity map keeps its own promise (#810; exits non-zero).

`textbooks/reference/COMPARISON.md` is the canonical PrimeNG -> Caelum migration
map, and it makes a written promise twice over:

  COMPARISON.md legend -- "Every ☐ row names its tracking issue, so a migrating
  team always has something to point at."
  COMPARISON.md tail   -- "all kept explicit, never a silent map hole."

`docs/MIGRATION.md` repeats it to consumers. Nothing enforced it. This gate does:
every table row whose **Status** cell carries a ☐ must name at least one `#NN`.

WHY IT EXISTS (calibrated against history, not assumed -- #810). The rule was
measured over all 32 revisions of COMPARISON.md. It looks clean in 31 of them,
but that reading is VACUOUS: the Status column did not exist before 1f7fe11
(2026-07-24, the #706 correction), so those revisions had no gradeable rows at
all. In the 1 revision where the rule was measurable it was BROKEN -- and the
commit that first wrote the promise is the same commit that violated it. The
hole then survived a milestone exit review. A promise no gate reads is prose.

WHY THE ZERO-ROW FLOOR IS A FAILURE, NOT A PASS. That vacuity is the live
failure mode of this very check, so it is guarded rather than trusted: rename
the Status column, restructure the tables, or point the gate at a moved file,
and a naive implementation grades nothing and reports OK forever. Grading zero
rows therefore FAILS. (The same trap the #413 density spec documents: an
assertion that measures nothing passes hardest.)

SCOPE -- deliberately textual. The gate proves a ☐ row *names* an issue; it does
not call the tracker to prove that issue is open (preflight runs offline and
must stay fast). A ☐ pointing at a closed issue therefore PASSES here while
breaking the promise -- tracked as #821, which notes the interesting case is
usually a stale row (the component shipped or was dropped), not a stale link.

Project-owned machinery: `scripts/audit_docs.py` is taken WHOLESALE from the
pyxis template (TEMPLATE_VERSION #518), so a Caelum-specific map check placed
there would be clobbered at the next sync or become a permanent hand-port
divergence. Hence its own script.

Mirrored three ways (change together): ci.yml > static gates > "Parity-map
audit" == preflight.sh / preflight.ps1 "parity map (COMPARISON tracking refs)"
stage. The canonical stage<->step map lives in scripts/audit_ops_config.py.
"""
import argparse
import re
import sys
from pathlib import Path

# Windows cp1252 stdout guard (#296): gate output carries non-ASCII (box glyphs,
# em-dashes); a cp1252-strict console mojibakes or crashes an otherwise-green
# run. Uniform across every gate script.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

MAP_PATH = Path("textbooks") / "reference" / "COMPARISON.md"
PLANNED = "☐"                     # ☐ -- mapped target, no code
STATUS_HEADER = "Status"
ISSUE_REF = re.compile(r"#\d+")
SEPARATOR_CELL = re.compile(r":?-{2,}:?")


def status_cells(text):
    """Yield (lineno, status_cell) for each data row of every table with a Status
    column. `idx` resets when a table ends, so a table WITHOUT a Status column
    contributes nothing rather than silently reusing the previous table's index."""
    idx = None
    for lineno, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if not stripped.startswith("|"):
            idx = None
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if any(SEPARATOR_CELL.fullmatch(c) for c in cells):
            continue                                    # |---|---| separator
        if STATUS_HEADER in cells:
            idx = cells.index(STATUS_HEADER)            # header row
            continue
        if idx is not None and idx < len(cells):
            yield lineno, cells[idx]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=".", help="repo root to audit (default: cwd)")
    args = ap.parse_args()
    path = Path(args.root) / MAP_PATH

    if not path.is_file():
        print(f"PARITY-MAP FAIL: {MAP_PATH} not found -- the canonical migration map is "
              "missing or moved. Update MAP_PATH here (and the docs that cite it) rather "
              "than letting the gate skip.")
        return 1

    graded = list(status_cells(path.read_text(encoding="utf-8", errors="replace")))
    planned = [(n, c) for n, c in graded if PLANNED in c]
    holes = [(n, c) for n, c in planned if not ISSUE_REF.search(c)]
    print(f"{MAP_PATH}: {len(graded)} mapped row(s) graded, {len(planned)} planned "
          f"({PLANNED}), {len(holes)} untracked")

    if not graded:
        print(f"\nPARITY-MAP FAIL: graded 0 rows -- the gate measured NOTHING and would "
              f"pass forever. Expected markdown tables with a '{STATUS_HEADER}' column in "
              f"{MAP_PATH}. Fix the column/table shape or this parser; never accept the "
              "silent pass (this is the exact vacuity that hid the #810 hole through a "
              "milestone exit).")
        return 1

    if holes:
        print()
        for lineno, cell in holes:
            print(f"PARITY-MAP FAIL: {MAP_PATH}:{lineno} is {PLANNED} but its Status cell "
                  f"({cell!r}) names no tracking issue. The map promises 'Every {PLANNED} "
                  "row names its tracking issue' -- give it a #NN (fold into a standing "
                  "on-demand list such as #667/#712, or file its own), or reclassify the "
                  "row if no target is actually planned.")
        print(f"\naudit_comparison: {len(holes)} untracked {PLANNED} row(s) -- a migrating "
              "team hitting one has nothing to point at. Fix the map, never the audit.")
        return 1

    print("audit_comparison: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
