#!/usr/bin/env python3
"""Theming-invariant gate — D-04 token-only, mechanized (guard: #498).

Component styles must take every design value from the `--cae-*` token bridge.
This scans component sources under projects/caelum/*/ for hardcoded design
values — hex colors, rgb()/rgba()/hsl()/hsla() literals, and px font sizes —
the classes of breach that escaped skill-run review once (#496: file-upload
shipped 16 Material-palette literals as var() fallbacks).

Scope & exemptions:
  * scanned: *.ts / *.scss / *.css / *.html under projects/caelum/<entry>/
  * skipped: projects/caelum/styles/ (the token home — literals live there by
    design), *.spec.ts (test fixtures), and any line carrying an explicit
    `token-exempt: <why>` marker (the documented-exception mechanism; the
    marker itself is review surface, like the `no-ticket` label).
  * comments are stripped before matching, so prose about `#6750a4` is fine.

Catches append (fail-open) to .claude/metrics/guard_hits.jsonl per the guard
discipline (#253). Retire this gate only if D-04 is superseded by a recorded
decision — delete the script AND its preflight/ci/audit-map wiring together.

Exit 0 = clean; exit 1 = violations (printed as file:line: matched-text).
"""

from __future__ import annotations

import datetime
import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "projects" / "caelum"

EXEMPT_MARKER = "token-exempt:"

# Design-value literals.
# HEX, two alternatives: (1) hex after `:`, `,`, quotes, `=`, backtick, or space
# (template refs like `#fileInput` are dodged by the hex charset + \b, not the
# prefix); (2) hex right after `(`, where the `(#NNN)` issue-reference shape —
# all digits, closed by `)`, e.g. a string citing `(#177)` — is skipped. Known
# residuals, accepted: an all-digit color as a lone call arg (`gradient(#123)`),
# and 5+-digit issue refs will false-positive when the tracker gets there —
# widen `\d{1,4}` then. FUNC covers the classic + modern color functions,
# case-insensitively, prefix-guarded so TS calls like `this.lab(` don't match.
# Out of scope by design (say so, don't imply more): named colors, px/rem
# spacing, `font:` shorthand, and Angular `[style.x]` bindings.
HEX = re.compile(r"[:,\s\"'=`]#[0-9a-fA-F]{3,8}\b|\(#(?!\d{1,4}\))[0-9a-fA-F]{3,8}\b")
FUNC = re.compile(r"(?<=[:,(\s])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(", re.I)
FONT_PX = re.compile(r"font-size\s*:\s*\d+(?:\.\d+)?px")

# `/*` immediately followed by a quote is a string artifact (`endsWith('/*')`),
# not a comment opener — without the lookahead it would blank real code up to
# the next `*/` (a live case: file-upload.ts's MIME-group check). `url(//...)`
# reading as a line comment is an accepted fail-open residual.
BLOCK_COMMENT = re.compile(r"/\*(?!['\"]).*?\*/|<!--.*?-->", re.S)
LINE_COMMENT = re.compile(r"(?<!:)//.*$", re.M)  # keep `https://...` intact


def scan(path: Path) -> list[tuple[int, str]]:
    text = path.read_text(encoding="utf-8", errors="replace")
    # Blank out comments but keep line structure so reported numbers stay true.
    def blank(m: re.Match) -> str:
        return re.sub(r"[^\n]", " ", m.group(0))

    stripped = LINE_COMMENT.sub(" ", BLOCK_COMMENT.sub(blank, text))
    hits = []
    # split("\n"), not splitlines(): a U+2028-class separator inside a blanked
    # comment would desync splitlines() and silently drop trailing lines.
    for lineno, (line, raw) in enumerate(
        zip(stripped.split("\n"), text.split("\n")), start=1
    ):
        if EXEMPT_MARKER in raw:
            continue
        for pat in (HEX, FUNC, FONT_PX):
            m = pat.search(line)
            if m:
                hits.append((lineno, raw.strip()[:120]))
                break
    return hits


def main() -> int:
    violations = []
    for path in sorted(LIB.glob("*/**/*")):
        if not path.is_file() or path.suffix not in {".ts", ".scss", ".css", ".html"}:
            continue
        rel = path.relative_to(ROOT)
        parts = rel.parts
        if "styles" in parts[:3] or path.name.endswith(".spec.ts"):
            continue
        for lineno, snippet in scan(path):
            violations.append(f"{rel.as_posix()}:{lineno}: {snippet}")

    if violations:
        print(f"THEMING: RED - {len(violations)} hardcoded color/font-px literal(s) (D-04):")
        for v in violations:
            print(f"  FAIL  {v}")
        print(
            "Design values come from --cae-* tokens (projects/caelum/styles/"
            "_tokens.scss) — D-04. Justified exception? Put `token-exempt: <why>` "
            "on the line."
        )
        try:  # guard-hit ledger (#253) — fail-open, local-only
            mdir = ROOT / ".claude" / "metrics"
            mdir.mkdir(parents=True, exist_ok=True)
            with open(mdir / "guard_hits.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps({
                    "ts": datetime.datetime.now(datetime.timezone.utc)
                        .isoformat(timespec="seconds"),
                    "guard": "#498 theming-scan",
                    "rule": "token-only",
                    "hits": len(violations),
                }) + "\n")
        except Exception:
            pass
        return 1

    print("THEMING: GREEN - no hardcoded color / rgb-hsl / font-px literals in component sources (D-04).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
