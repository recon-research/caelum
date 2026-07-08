#!/usr/bin/env python3
"""audit_repo_links.py -- relative-link audit for the non-library docs (#73; exits non-zero).

textbooks/tools/_audit_links.py chdirs into textbooks/ and owns library
markdown; research/tools/_audit_research.py owns research/. Nothing checked
the links agents navigate by every session -- root *.md, docs/ (the anchor
docs), .claude/ (skills link to agents, to each other, and to docs; a rename
breaks the workflow layer silently), _intake/. This closes that gap with the
same regex/fence/skip logic as the library checker (kept intentionally
identical -- if you change one, mirror the other).
"""
import glob
import os
import re
import sys

# cwd-independent: the script lives in scripts/, the repo root is its parent.
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

LINK = re.compile(r'\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)')
CODE_SPAN = re.compile(r'`[^`]*`')   # inline code -- an illustrative [text](x) inside it is not a real link
SKIP = ('http://', 'https://', 'mailto:', '#')
FENCE = chr(96) * 3

# Root docs + the doc trees textbooks/ and research/ do NOT own.
files = sorted(set(
    glob.glob("*.md")
    + glob.glob("docs/**/*.md", recursive=True)
    + glob.glob(".claude/**/*.md", recursive=True)
    + glob.glob(".github/**/*.md", recursive=True)
    + glob.glob("_intake/**/*.md", recursive=True)
))

broken = []
checked = 0
for f in files:
    in_fence = False
    for i, line in enumerate(open(f, encoding='utf-8'), 1):
        if line.lstrip().startswith(FENCE):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for m in LINK.finditer(CODE_SPAN.sub('', line)):
            tgt = m.group(1).strip()
            if tgt.startswith(SKIP) or tgt.startswith('/'):
                continue
            path = tgt.split('#', 1)[0]
            if not path:
                continue
            checked += 1
            if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), path))):
                broken.append((f.replace("\\", "/"), i, tgt))

print(f"Repo-docs links checked: {checked} in {len(files)} files | broken: {len(broken)}")
for b in broken:
    print(f"  BROKEN  {b[0]}:{b[1]}  ->  {b[2]}")
sys.exit(1 if broken else 0)
