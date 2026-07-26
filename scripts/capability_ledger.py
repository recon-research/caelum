#!/usr/bin/env python3
"""Capability ledger (#733) — the artifact ARCHITECTURE §2 "evidence-gated done" and §3.4 name.

The invariant is *"a component is 'done' only with passing parity scenarios **plus** adversarial
sign-off, never because it renders"*. This makes that mechanically evaluable: it derives each
shipped entry point's state from evidence that already exists in the repo, so the ledger cannot
claim a state nothing backs.

## What is derived vs curated, and why

Three of §3.4's five states are **derived** from on-disk structure (below). The other two —
`untouched` / `mapped` — are the p-*->cae-* mapping that `textbooks/reference/COMPARISON.md`
already owns (it carries a Status column since #706); duplicating those rows here would be a
second copy that drifts, so the ledger cross-links instead (CLAUDE.md > single-home each fact).

**Adversarial sign-off is curated, not derived — that is a measurement, not a preference.**
Deriving it from git was tried first and abandoned on evidence (#733):

  1. The prose is unstructured and its phrasing is open-ended. Detectors calibrated over full
     history kept finding new forms: `2-lens adversarial review`, `Adversarially reviewed
     (4-lens: ...)`, `Adversarial review (3 lenses) applied`, `Adversarial review found four
     real defects`, and PR #203's `## Review - 4-lens ultracode (...)` which never uses the word
     "adversarial" at all. Each widening was the regex being fitted to history already seen.
  2. Worse, **attribution is ambiguous**. A component's directory is touched by dozens of later
     slices, so "the most recent commit touching this path that mentions a review" credits an
     unrelated slice's review to the component: measured, that rule marked avatar, breadcrumb,
     checkbox, input and menu as signed off by PR #692 — the *axe harness* PR, which reviewed the
     harness and merely added axe specs to their folders.

So sign-off lives in `docs/capability-ledger.json` with a **resolvable** pointer, and this script
verifies the pointer rather than trusting it: the cited commit must exist AND must touch that
entry point's directory (checked with git, offline). The seeded rows use the defensible
attribution rule — the review run on the slice that *shipped* the component (its introducing
commit) — and each carries a verbatim quote, so every claim is falsifiable at a glance.

## Derived states

  implemented       a shipped secondary entry point (has ng-package.json — the same marker
                    scripts/check-lib-exports.mjs derives from, so the two agree by construction)
  parity-verified   + a functional spec AND an axe assertion (`expectNoA11yViolations`), the bar
                    ARCHITECTURE §2 A11y parity commits built components to
  adversarial-passed + a verified sign-off pointer

Usage:
  python3 scripts/capability_ledger.py            # regenerate docs/CAPABILITY_LEDGER.md
  python3 scripts/capability_ledger.py --check    # gate: drift + unresolvable pointers (CI)
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join('projects', 'caelum')
CURATED = os.path.join('docs', 'capability-ledger.json')
LEDGER = os.path.join('docs', 'CAPABILITY_LEDGER.md')

STATES = ['implemented', 'parity-verified', 'adversarial-passed']


def git(*args):
    return subprocess.run(['git'] + list(args), cwd=ROOT, capture_output=True, text=True)


def entry_points():
    """Shipped secondary entry points — the ng-package.json marker, per check-lib-exports.mjs."""
    lib = os.path.join(ROOT, LIB)
    return sorted(d for d in os.listdir(lib)
                  if os.path.isfile(os.path.join(lib, d, 'ng-package.json')))


def evidence(name):
    """On-disk verification evidence for one entry point."""
    d = os.path.join(ROOT, LIB, name)
    specs = [f for f in os.listdir(d) if f.endswith('.spec.ts')]
    kind = lambda suffix: sorted(f for f in specs if f.endswith(suffix))
    browser, vr = kind('.browser.spec.ts'), kind('.vr.spec.ts')
    unit = sorted(set(specs) - set(browser) - set(vr))
    # the CALL, not the bare identifier — an import alone must not count as coverage
    axe = any('expectNoA11yViolations(' in read(os.path.join(d, f)) for f in specs)
    return {'unit': len(unit), 'axe': axe, 'browser': len(browser), 'vr': len(vr)}


def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def verify_pointer(name, entry):
    """A sign-off pointer is resolvable only if its commit exists AND touches this entry point.

    That second half is the one that matters: without it any real sha would 'resolve', including
    one from an unrelated slice — exactly the mis-attribution that ruled out deriving this field.
    """
    sha = (entry or {}).get('commit')
    if not sha:
        return 'no commit pointer'
    if git('cat-file', '-e', f'{sha}^{{commit}}').returncode != 0:
        return f'commit {sha} not found in history'
    # diff-tree asks what THIS commit changed. `git log -1 <sha> -- <path>` does not: it walks
    # history from <sha> and returns the first ANCESTOR touching the path, so a pointer to any
    # commit made after the component shipped would resolve against an unrelated ancestor and
    # pass — which would have hollowed out the one guarantee this function exists to make.
    r = git('diff-tree', '--no-commit-id', '--name-only', '-r', sha, '--', f'{LIB}/{name}')
    if not r.stdout.strip():
        return f'commit {sha} does not touch {LIB}/{name}'
    return None


def state_of(ev, signoff_ok):
    """The states are a cumulative ladder, not independent flags.

    The invariant is parity scenarios *plus* sign-off, so sign-off alone must not top a row out:
    checking it first would have read the five entry points with no axe assertion as fully done.
    """
    parity = bool(ev['unit'] and ev['axe'])
    if parity and signoff_ok:
        return 'adversarial-passed'
    if parity:
        return 'parity-verified'
    return 'implemented'


def build():
    curated = json.loads(read(os.path.join(ROOT, CURATED)))
    signoff = curated.get('signoff', {})
    rows, problems = [], []

    known = set(entry_points())
    for stale in sorted(set(signoff) - known):
        problems.append(f'{CURATED}: row "{stale}" has no entry point at {LIB}/{stale} '
                        '(renamed or removed — drop the row or fix the name)')

    for name in entry_points():
        ev = evidence(name)
        if name not in signoff:
            problems.append(f'{CURATED}: no row for shipped entry point "{name}" — every entry '
                            'point must appear (use null to record an unsigned-off gap)')
            entry = None
        else:
            entry = signoff[name]
        why = verify_pointer(name, entry) if entry else None
        if entry and why:
            problems.append(f'{CURATED}: "{name}" claims sign-off but {why}')
        rows.append({'name': name, 'ev': ev, 'signoff': entry,
                     'state': state_of(ev, bool(entry) and not why)})
    return rows, problems, curated.get('note', '')


def cell(row):
    ev = row['ev']
    mark = lambda v: '☑' if v else '—'
    return (f"| `{row['name']}` | {row['state']} | {mark(ev['unit'])} | {mark(ev['axe'])} "
            f"| {mark(ev['browser'])} | {mark(ev['vr'])} | {signoff_cell(row['signoff'])} |")


def signoff_cell(entry):
    if not entry:
        return '**none**'
    pr = f"#{entry['pr']}" if entry.get('pr') else '—'
    return f"PR {pr} · `{entry['commit']}`"


def render(rows, note):
    counts = {s: sum(1 for r in rows if r['state'] == s) for s in STATES}
    total = len(rows)
    passed = counts['adversarial-passed']
    out = [
        '<!-- GENERATED by scripts/capability_ledger.py — do not edit by hand.',
        '     Curated input: docs/capability-ledger.json · regenerate: python3 scripts/capability_ledger.py -->',
        '',
        '# Capability ledger',
        '',
        'The artifact behind the **evidence-gated done** invariant (`ARCHITECTURE.md` §2, §3.4): a',
        'component is "done" only with passing parity scenarios **plus** adversarial sign-off — never',
        'because it renders. Generated from evidence in the repo, so no row can claim a state nothing',
        'backs. **M4 exits when every shipped entry point reads `adversarial-passed`.**',
        '',
        f'**{passed}/{total} adversarial-passed** · '
        f"{counts['parity-verified']} parity-verified · {counts['implemented']} implemented",
        '',
        '`untouched` / `mapped` (§3.4\'s first two states) are the p-*→cae-* mapping tracked in',
        '[`textbooks/reference/COMPARISON.md`](../textbooks/reference/COMPARISON.md) (Status column,',
        '#706) — single-homed there, not duplicated here.',
        '',
    ]
    if note:
        out += [note, '']
    out += [
        '| Entry point | State | spec | axe | browser | VR | Adversarial sign-off |',
        '|---|---|---|---|---|---|---|',
    ]
    out += [cell(r) for r in rows]
    gaps = [r for r in rows if r['state'] != 'adversarial-passed']
    out += ['']
    if gaps:
        out += ['## Open gaps', '',
                'Each row below is M4-exit work, not a formatting nit.', '']
        for r in gaps:
            missing = []
            if not r['ev']['unit']:
                missing.append('no functional spec')
            if not r['ev']['axe']:
                missing.append('no axe assertion')
            if not r['signoff']:
                missing.append('no adversarial sign-off on record')
            out.append(f"- **`{r['name']}`** — {'; '.join(missing)}.")
        out += ['']
    else:
        out += ['## Open gaps', '', 'None — every shipped entry point is `adversarial-passed`.', '']
    return '\n'.join(out) + '\n'


def main():
    check = '--check' in sys.argv
    rows, problems, note = build()
    text = render(rows, note)
    path = os.path.join(ROOT, LEDGER)

    if check:
        current = read(path) if os.path.exists(path) else None
        if current != text:
            problems.append(f'{LEDGER} is stale — regenerate with '
                            '`python3 scripts/capability_ledger.py` and commit it')
        for p in problems:
            print(f'FAIL  {p}')
        if problems:
            return 1
        passed = sum(1 for r in rows if r['state'] == 'adversarial-passed')
        print(f'capability ledger: {passed}/{len(rows)} adversarial-passed, '
              f'{len(rows)} entry points, all sign-off pointers resolve')
        return 0

    for p in problems:
        print(f'warn  {p}')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(text)
    print(f'wrote {LEDGER} ({len(rows)} entry points)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
