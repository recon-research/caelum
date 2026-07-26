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
  exempt            a type-only entry point, which axe cannot scan because it renders nothing.
                    Outside the ladder (see below), not a rung on it.

## Exemptions are PROVEN, not trusted (#773)

An exemption field is the obvious way to let anything be waved through, which is why #733 shipped
without one. This one is safe for a narrower reason than "we promise to be careful": the only
claim it can make is one this script **re-derives from the source**. `exempt` records a *reason*
for the reader, but what actually grants the exemption is {@link runtime_exports} finding no
runtime export anywhere in the entry point — a type-only entry point compiles to nothing, so
there is provably no DOM for axe to scan.

The consequence that matters is what happens when the premise stops holding. Add a component to
an exempt entry point and the exemption does not quietly persist: `runtime_exports` finds it, the
gate fails with the offending file named, and the row drops back onto the ladder as a visible gap.
So the mechanism cannot outlive the fact it rests on, and it cannot be pointed at an entry point
that renders anything — the reason string is documentation, never the grant.

Usage:
  python3 scripts/capability_ledger.py            # regenerate docs/CAPABILITY_LEDGER.md
  python3 scripts/capability_ledger.py --check    # gate: drift + unresolvable pointers (CI)
  python3 scripts/capability_ledger.py --selftest # corpus-test the runtime-export detector

`--check` runs that corpus too (quietly), so the detector's teeth are re-proven by every preflight
and CI run without a separate stage anyone could forget to wire up.
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

# A line that puts a VALUE into the bundle, which is what makes an entry point scannable. Anchored
# at line start so prose ("...without importing the CaeMenu class") cannot trip it, and `type` is
# excluded because `export type {...}` / `export type X` erase at build. Deliberately eager
# otherwise — `export {` is counted without checking whether every specifier is inline-`type`,
# because the two error directions are not symmetric: over-matching only refuses an exemption
# (the entry point falls back to needing a real axe assertion), while under-matching would grant
# one to something that renders. Fail toward "not exempt".
RUNTIME_EXPORT = re.compile(
    r'^\s*export\s+(?!type\b)'
    r'(?:default\b|declare\b|abstract\s+class\b|class\b|function\b|const\b|let\b|var\b|enum\b|\{)',
    re.M)
# `export * from 'caelum/menu'` re-exports another entry point's RUNTIME code without declaring
# anything locally, so the check above would miss it entirely. A relative specifier is fine: that
# target is a sibling file in this same directory and is scanned on its own.
FOREIGN_REEXPORT = re.compile(r"^\s*export\s+(?!type\b)[^;\n]*\bfrom\s+['\"](?!\.)", re.M)


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


def emits_runtime(src):
    """Does this TypeScript source put anything into the bundle? (corpus-tested by --selftest)"""
    return bool(RUNTIME_EXPORT.search(src) or FOREIGN_REEXPORT.search(src))


def runtime_exports(name):
    """Source files in this entry point that emit runtime code — the exemption's proof obligation.

    Returns a sorted list of filenames (empty ⇒ type-only ⇒ nothing renders ⇒ axe has no subject).
    Specs are excluded: they are not shipped, and every entry point's tests are full of runtime
    exports, so counting them would make the type-only case unrepresentable.
    """
    d = os.path.join(ROOT, LIB, name)
    return [f for f in sorted(os.listdir(d))
            if f.endswith('.ts') and not f.endswith('.spec.ts')
            and emits_runtime(read(os.path.join(d, f)))]


# Each case is a real shape from this library's sources or its docstrings. The corpus exists
# because this detector's failure mode is SILENT: weaken it and every exemption still passes,
# the ledger still reads green, and the only symptom is a rubber stamp where a proof used to be.
DETECTOR_CORPUS = [
    ('class', 'export class CaeTooltip {}', True),
    ('abstract class', 'export abstract class CaeFormFieldControlBase<T> {}', True),
    ('const', "export const tanStackGridAdapterFactory = () => 1;", True),
    ('function', 'export function provideTanStackGrid() {}', True),
    ('enum', 'export enum Mode { A }', True),
    ('default', 'export default thing;', True),
    ('named value re-export', "export { CaeMenu } from './menu';", True),
    ('foreign star re-export', "export * from 'caelum/menu';", True),
    ('relative star re-export', "export * from './appearance';", False),
    ('type alias', "export type CaeFormFieldAppearance = 'fill' | 'outline';", False),
    ('interface', 'export interface CaeMenuPanelHost { x(): void }', False),
    ('type-only re-export', "export type { CaeErrorMessages } from 'caelum/shared';", False),
    # Prose must never trip it: `shared` is nothing but docstrings and types, and a false positive
    # there would silently revoke the one exemption the library actually has.
    ('prose naming a class', ' * without importing the `CaeMenu` *class*.', False),
    ('commented-out export', '// export const x = 1;', False),
    ('prose starting mid-line', ' * A file may export class-like types.', False),
]


def selftest(verbose=True):
    """Returns the number of corpus mismatches. Quiet mode prints only the failures — a guard that
    chatters on the clean path teaches the reader to skim past it on the day it finally fires."""
    failed = 0
    for name, src, want in DETECTOR_CORPUS:
        got = emits_runtime(src)
        ok = got == want
        failed += 0 if ok else 1
        if verbose or not ok:
            print(f"{'PASS' if ok else 'FAIL'} runtime-export detector: {name} -> {got}"
                  + ('' if ok else f' (want {want})'))
    return failed


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


def state_of(ev, signoff_ok, exempt_ok=False):
    """The states are a cumulative ladder, not independent flags.

    The invariant is parity scenarios *plus* sign-off, so sign-off alone must not top a row out:
    checking it first would have read the five entry points with no axe assertion as fully done.

    `exempt` sits OUTSIDE that ladder rather than at the top of it, and only when the type-only
    premise still holds (`exempt_ok`) — so an exempt entry point that grows a component falls
    straight back to `implemented` and reappears as a gap, instead of keeping a state it earned
    under different facts.
    """
    if exempt_ok:
        return 'exempt'
    parity = bool(ev['unit'] and ev['axe'])
    if parity and signoff_ok:
        return 'adversarial-passed'
    if parity:
        return 'parity-verified'
    return 'implemented'


def build():
    curated = json.loads(read(os.path.join(ROOT, CURATED)))
    signoff = curated.get('signoff', {})
    exempt = curated.get('exempt', {})
    rows, problems = [], []

    known = set(entry_points())
    for stale in sorted(set(signoff) - known):
        problems.append(f'{CURATED}: row "{stale}" has no entry point at {LIB}/{stale} '
                        '(renamed or removed — drop the row or fix the name)')
    for stale in sorted(set(exempt) - known):
        problems.append(f'{CURATED}: exemption "{stale}" has no entry point at {LIB}/{stale} '
                        '(renamed or removed — drop the exemption or fix the name)')

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

        # The exemption is re-derived here, every run — the recorded reason never grants it.
        reason, exempt_ok = exempt.get(name), False
        if reason:
            emitting = runtime_exports(name)
            if emitting:
                problems.append(
                    f'{CURATED}: "{name}" claims an axe exemption ("{reason}") but emits runtime '
                    f'code in {", ".join(emitting)} — it renders, so it needs a real axe '
                    'assertion, not an exemption')
            elif ev['axe']:
                problems.append(f'{CURATED}: "{name}" is covered by an axe assertion, so its '
                                'exemption is dead weight — drop it')
            else:
                exempt_ok = True

        rows.append({'name': name, 'ev': ev, 'signoff': entry, 'exempt': reason if exempt_ok else None,
                     'state': state_of(ev, bool(entry) and not why, exempt_ok)})
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
    exempt_rows = [r for r in rows if r['state'] == 'exempt']
    # Exempt entry points leave the denominator rather than counting as passes: a type-only entry
    # point was never a component to verify, so folding it in either way misreports the fraction.
    total = len(rows) - len(exempt_rows)
    passed = counts['adversarial-passed']
    tally = (f'**{passed}/{total} adversarial-passed** · '
             f"{counts['parity-verified']} parity-verified · {counts['implemented']} implemented")
    if exempt_rows:
        tally += f' · {len(exempt_rows)} exempt (below)'
    out = [
        '<!-- GENERATED by scripts/capability_ledger.py — do not edit by hand.',
        '     Curated input: docs/capability-ledger.json · regenerate: python3 scripts/capability_ledger.py -->',
        '',
        '# Capability ledger',
        '',
        'The artifact behind the **evidence-gated done** invariant (`ARCHITECTURE.md` §2, §3.4): a',
        'component is "done" only with passing parity scenarios **plus** adversarial sign-off — never',
        'because it renders. Generated from evidence in the repo, so no row can claim a state nothing',
        'backs. **M4 exits when every shipped entry point reads `adversarial-passed`**, bar a recorded',
        'exemption — and an exemption is re-proven from the source on every run, never taken on trust',
        '(#773).',
        '',
        tally,
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
    gaps = [r for r in rows if r['state'] not in ('adversarial-passed', 'exempt')]
    out += ['']
    if exempt_rows:
        out += ['## Exemptions', '',
                'Not a waiver — each is re-derived on every run from the entry point\'s own source,',
                'and the gate fails the moment one starts emitting runtime code (#773).', '']
        out += [f"- **`{r['name']}`** — {r['exempt']}" for r in exempt_rows]
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
        out += ['## Open gaps', '',
                'None — every shipped entry point is `adversarial-passed` or recorded above.', '']
    return '\n'.join(out) + '\n'


def main():
    if '--selftest' in sys.argv:
        return 1 if selftest() else 0

    check = '--check' in sys.argv
    rows, problems, note = build()
    # Run the corpus inside --check rather than as a separate stage: preflight and CI already call
    # --check, so the detector's teeth get re-proven on every run with no wiring left to forget.
    # Silent only when clean — a passing corpus prints nothing.
    if check and selftest(verbose=False):
        problems.append('the runtime-export detector failed its own corpus (run '
                        '`python3 scripts/capability_ledger.py --selftest`) — exemptions are '
                        'unsafe until it passes')
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
        exempt_n = sum(1 for r in rows if r['state'] == 'exempt')
        print(f'capability ledger: {passed}/{len(rows) - exempt_n} adversarial-passed, '
              f'{len(rows)} entry points ({exempt_n} exempt, each re-proven type-only), '
              'all sign-off pointers resolve')
        return 0

    for p in problems:
        print(f'warn  {p}')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(text)
    print(f'wrote {LEDGER} ({len(rows)} entry points)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
