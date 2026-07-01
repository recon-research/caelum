#!/usr/bin/env python3
"""Dependency-provenance gate — the M0-2 scan, automated (issue #4, D-11).

Reconciles the RESOLVED dependency tree (package-lock.json, lockfile v3 — the
`packages` map carries both `license` and the `dev` classification) against the
checked-in curated allowlist (provenance/allowlist.json). No `node_modules`
needed, so this runs in CI's node-free `static-gates` job and in preflight.

Two surfaces, two strictnesses (Book 03 §3.3):
  - RUNTIME (not dev): license ∈ permissive allowlist  AND  the package is
    vetted in the allowlist  AND  its curated origin is US/allied (D-11). A new
    runtime dependency absent from the allowlist FAILS — that is the forward-only
    ratchet (Book 03 §3.4, Book 12 §3.3): a human must vet + record it.
  - DEV (devDependencies tree): license must still be permissive; copyleft is
    rejected UNLESS the package has an explicit devCopyleftExceptions row
    (weak/file-level copyleft, never shipped — the axe-core precedent, Book 16 §3.2).

Exit 0 = GREEN (provenance purity invariant holds). Exit 1 = a violation
(hard-block per docs/ARCHITECTURE.md §2). Exit 2 = the gate itself is broken
(missing/garbled input) — treated as a failure, never a silent pass.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCKFILE = ROOT / "package-lock.json"
ALLOWLIST = ROOT / "provenance" / "allowlist.json"
# The manifests whose dependencies/peerDependencies/optionalDependencies define the
# SHIPPED-runtime surface — the workspace root AND the published library (whose peers
# a consumer installs; Book 03 §3.3 counts peerDependencies as runtime).
ROOT_MANIFEST = ROOT / "package.json"
LIB_MANIFEST = ROOT / "projects" / "caelum" / "package.json"

# Dependency-class edges that carry a package into the shipped tree.
RUNTIME_EDGE_KEYS = ("dependencies", "peerDependencies", "optionalDependencies")

# Defense-in-depth backstop (the allowlist is an editable file; these are not). A
# policy edit that tries to slip one of these licenses into a permissive set, or one
# of these origins into alliedNations, is a hard error regardless of the allowlist.
# A floor, not an exhaustive denylist.
_NEVER_PERMISSIVE = {
    "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "GPL-3.0-or-later",
    "AGPL-3.0-only", "AGPL-3.0-or-later", "BUSL-1.1", "SSPL-1.0", "Elastic-2.0",
}
_NEVER_ALLIED = {"CN", "RU", "IR", "KP", "BY", "SY", "CU", "VE"}

RESET, RED, GREEN, YELLOW = "\033[0m", "\033[31m", "\033[32m", "\033[33m"


def _load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"{RED}FATAL{RESET} missing input: {path}", file=sys.stderr)
        sys.exit(2)
    except json.JSONDecodeError as exc:
        print(f"{RED}FATAL{RESET} could not parse {path}: {exc}", file=sys.stderr)
        sys.exit(2)


def normalize_license(raw) -> str:
    """A lockfile `license` is a string, a {'type': ...} object, or absent."""
    if isinstance(raw, dict):
        raw = raw.get("type") or raw.get("license") or ""
    if not raw or not isinstance(raw, str):
        return "UNKNOWN"
    return raw.strip()


# Split an SPDX expression into (operator, terms). We only need OR/AND at the top
# level for the licenses that actually occur in this tree; nested parens degrade
# gracefully to a conservative token scan.
_SPDX_SPLIT = re.compile(r"\s+(?:OR|AND)\s+", re.IGNORECASE)


def _terms(expr: str) -> list[str]:
    return [t.strip("() \t") for t in _SPDX_SPLIT.split(expr.strip("() \t")) if t.strip("() \t")]


def license_admissible(expr: str, allowed: set[str]) -> bool:
    """SPDX-expression aware: `A OR B` admits if EITHER arm is allowed; `A AND B`
    admits only if EVERY arm is allowed. `SEE LICENSE IN ...`, UNKNOWN, UNLICENSED
    (no readable grant) never admit."""
    expr = expr.strip()
    if not expr or expr.upper().startswith("SEE ") or expr.upper() in {"UNKNOWN", "UNLICENSED"}:
        return False
    is_or = bool(re.search(r"\bOR\b", expr, re.IGNORECASE))
    is_and = bool(re.search(r"\bAND\b", expr, re.IGNORECASE))
    terms = _terms(expr)
    if not terms:
        return False
    if is_or and not is_and:
        return any(t in allowed for t in terms)
    # `AND`, mixed, or a single token: require all terms admissible (conservative).
    return all(t in allowed for t in terms)


def pkg_name(path: str) -> str:
    """`node_modules/@scope/name` -> `@scope/name`; handles nesting."""
    return path.split("node_modules/")[-1]


def manifest_roots(path: Path) -> set[str]:
    """The shipped roots a manifest declares — dependencies + peerDependencies +
    optionalDependencies (NOT devDependencies)."""
    try:
        m = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return set()
    roots: set[str] = set()
    for key in RUNTIME_EDGE_KEYS:
        roots |= set(m.get(key) or {})
    return roots


def build_runtime_closure(lock: dict, roots: set[str]) -> set[str]:
    """Names reachable from the shipped roots via RUNTIME edges. This is the strict
    surface — a peerDependency dev-installed at the workspace root is flagged `dev`
    by npm, yet ships into the consumer's bundle, so we classify off the manifests'
    dependency *kinds*, not npm's `dev` flag (Book 03 §3.3, R5)."""
    by_name: dict[str, list[dict]] = {}
    for path, meta in lock.get("packages", {}).items():
        if path:
            by_name.setdefault(pkg_name(path), []).append(meta)
    seen: set[str] = set()
    frontier = list(roots)
    while frontier:
        name = frontier.pop()
        if name in seen:
            continue
        seen.add(name)
        for meta in by_name.get(name, []):
            for key in RUNTIME_EDGE_KEYS:
                for dep in meta.get(key) or {}:
                    if dep not in seen:
                        frontier.append(dep)
    return seen


def main() -> int:
    allowlist = _load(ALLOWLIST)
    lock = _load(LOCKFILE)
    policy = allowlist["policy"]
    lic = policy["license"]

    runtime_permissive = set(lic["runtimePermissive"])
    dev_permissive = runtime_permissive | set(lic["devAdditionalPermissive"])
    weak_copyleft = set(lic["weakCopyleftDevOnly"])
    hard_reject = set(lic["hardRejectAlways"])
    allied = set(policy["origin"]["alliedNations"])

    runtime_allow = allowlist["runtime"]
    optional_peers = allowlist.get("optionalPeers", {})
    dev_exceptions = allowlist.get("devCopyleftExceptions", {})
    vetted_runtime = {**runtime_allow, **optional_peers}

    # The shipped-runtime surface, derived from manifest dependency kinds (not npm's
    # `dev` flag): the transitive closure of the root + library deps/peers/optional.
    shipped_roots = manifest_roots(ROOT_MANIFEST) | manifest_roots(LIB_MANIFEST)
    runtime_closure = build_runtime_closure(lock, shipped_roots)

    errors: list[str] = []
    notices: list[str] = []

    # --- Backstop: the policy sets themselves must not admit the un-admittable ---
    leaked = (runtime_permissive | dev_permissive) & _NEVER_PERMISSIVE
    if leaked:
        errors.append(f"policy backstop: forbidden license(s) in a permissive set — {sorted(leaked)}")
    bad_allied = allied & _NEVER_ALLIED
    if bad_allied:
        errors.append(f"policy backstop: adversarial-nation origin(s) in alliedNations — {sorted(bad_allied)}")

    # --- Pass 0: the allowlist must itself obey the policy (catch a bad edit) ---
    for name, meta in vetted_runtime.items():
        if not license_admissible(meta["license"], runtime_permissive):
            errors.append(f"allowlist self-check: `{name}` license {meta['license']!r} is not in runtimePermissive")
        if meta["origin"] not in allied:
            errors.append(f"allowlist self-check: `{name}` origin {meta['origin']!r} is not an allied nation")

    # --- Pass 1: walk the resolved tree ---
    packages = lock.get("packages", {})
    runtime_seen: set[str] = set()
    n_runtime = n_dev = 0

    for path, meta in packages.items():
        if path == "" or meta.get("link"):
            continue  # workspace root / local symlink — not a fetched dependency
        name = pkg_name(path)
        license_str = normalize_license(meta.get("license"))
        # Runtime if it reaches the shipped tree via a runtime edge, OR npm marks it
        # non-dev. A dev-installed library peer (dev:true) is still runtime here.
        is_runtime = name in runtime_closure or not (meta.get("dev") or meta.get("devOptional"))

        if not is_runtime:
            n_dev += 1
            if license_admissible(license_str, dev_permissive):
                continue
            if license_str in weak_copyleft:
                exc = dev_exceptions.get(name)
                if exc and exc.get("license") == license_str:
                    notices.append(f"dev copyleft admitted (ledgered): {name} [{license_str}] — {exc['reason'][:60]}…")
                    continue
                errors.append(
                    f"DEV copyleft WITHOUT a ledger exception: {name}@{meta.get('version','?')} [{license_str}] "
                    f"— add a provenance/allowlist.json devCopyleftExceptions row (Book 16 §3.2) or remove the dep"
                )
                continue
            bucket = "hard-reject" if license_str in hard_reject else "unrecognized/unreadable"
            errors.append(f"DEV license rejected ({bucket}): {name}@{meta.get('version','?')} [{license_str}]")
            continue

        # runtime / shipped surface — the strict gate
        n_runtime += 1
        runtime_seen.add(name)
        vetted = vetted_runtime.get(name)

        if not license_admissible(license_str, runtime_permissive):
            errors.append(
                f"RUNTIME license rejected: {name}@{meta.get('version','?')} [{license_str}] "
                f"— a shipped dependency must be permissive (Book 03 §3.3)"
            )
        if vetted is None:
            errors.append(
                f"RUNTIME dep NOT in the allowlist: {name}@{meta.get('version','?')} [{license_str}] "
                f"— unvetted origin. Vet it and add a provenance/allowlist.json `runtime` row (the D-11 ratchet)"
            )
        else:
            if vetted["license"] != license_str and license_str != "UNKNOWN":
                errors.append(
                    f"RUNTIME license DRIFT: {name} resolves to [{license_str}] but the allowlist vetted [{vetted['license']}] "
                    f"— re-vet and update provenance/allowlist.json"
                )
            if vetted["origin"] not in allied:
                errors.append(f"RUNTIME origin not allied: {name} [{vetted['origin']}] — see D-11")

    # --- Pass 2: allowlist rows with no matching resolved package (removed dep) ---
    for name in runtime_allow:
        if name not in runtime_seen:
            notices.append(f"allowlist `runtime` row `{name}` has no resolved package — dependency removed? prune the allowlist row")

    # --- Report ---
    print(f"provenance gate — {n_runtime} runtime + {n_dev} dev packages · policy {policy['decision']} ({policy['scope']})")
    for n in notices:
        print(f"  {YELLOW}note{RESET}  {n}")
    if errors:
        for e in errors:
            print(f"  {RED}FAIL{RESET}  {e}")
        print(f"{RED}PROVENANCE: RED — {len(errors)} violation(s). See provenance/README.md.{RESET}")
        return 1
    print(f"{GREEN}PROVENANCE: GREEN — every runtime dep is permissive + US/allied-origin and vetted; dev tree license-clean.{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
