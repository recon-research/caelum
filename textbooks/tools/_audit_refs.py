import re, glob, os, json
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # cwd-independent: data lives beside tools/
M = json.load(open("MANIFEST.json", encoding="utf-8"))
DOCNAMES = sorted({d["id"].upper() for d in M["reference_docs"]}, key=len, reverse=True)
def canon(idtok):
    idtok = idtok.strip().rstrip('.').strip()
    if re.fullmatch(r'[0-9]+(\.[0-9]+)*', idtok): return idtok
    return re.sub(r'[.\s]', '', idtok).upper()
def prefixes(idtok):
    out=set(); c=canon(idtok); out.add(c)
    if re.fullmatch(r'[0-9]+(\.[0-9]+)*', c):
        p=c.split('.')
        for i in range(1,len(p)): out.add('.'.join(p[:i]))
    else:
        m=re.match(r'^([0-9]*[A-Z]+)([0-9]+)?$', c)
        if m and m.group(2): out.add(m.group(1))
        m2=re.match(r'^([0-9]+)([A-Z]+)$', c)
        if m2: out.add(m2.group(1))
    return out
HEAD=re.compile(r'^#{2,5}\s+(.*)$')
def ids_of(path):
    ids=set()
    for line in open(path, encoding='utf-8'):
        m=HEAD.match(line.rstrip('\n'))
        if not m: continue
        toks=m.group(1).strip().split()
        if not toks: continue
        first=toks[0]
        cand = toks[1].rstrip(':.') if (first.rstrip(':.').lower() in ('section','appendix','part','chapter') and len(toks)>=2) else first.rstrip(':.')
        if re.fullmatch(r'([0-9]+[A-Za-z]*|[A-Za-z]+[0-9]*)(\.[0-9A-Za-z]+)*', cand) and (re.search(r'[0-9]',cand) or len(cand)<=3):
            ids |= prefixes(cand)
    return ids
book_ids={}
for p in sorted(glob.glob("books/*.md")):
    mm=re.match(r'(\d+)_', os.path.basename(p))
    if mm: book_ids[int(mm.group(1))] = ids_of(p)
DOC_IDS={d["id"].upper(): ids_of(d["path"]) for d in M["reference_docs"] if os.path.exists(d["path"])}
GROUP=re.compile(r'(?<![\w.])(?:Book\s+)?(\d{1,2})\s*((?:§[A-Za-z0-9.]+)(?:\s*[,/&+]\s*§[A-Za-z0-9.]+)*)')
IDPART=re.compile(r'§([A-Za-z0-9.]+)')
DOCGROUP=re.compile(r'\b(' + '|'.join(DOCNAMES) + r')\s*((?:§[A-Za-z0-9.]+)(?:\s*[,/&]\s*§[A-Za-z0-9.]+)*)') if DOCNAMES else None
def disp(p):
    b=os.path.basename(p)
    return os.path.basename(os.path.dirname(p))+'/'+b if b=='SKILL.md' else b
bmiss=[]; dmiss=[]; bn_checked=0
for p in (sorted(glob.glob("*.md")) + sorted(glob.glob("books/*.md")) + sorted(glob.glob("skills/*.md"))
          + sorted(glob.glob("../.claude/skills/*/SKILL.md"))   # project-layout skills cite books too
          + sorted(glob.glob("reference/*.md")) + sorted(glob.glob("vision/*.md"))):
    if os.path.basename(p) in ('CHANGELOG.md','LIBRARY_SEED.md'): continue
    for i,line in enumerate(open(p,encoding='utf-8'),1):
        for g in GROUP.finditer(line):
            bn=int(g.group(1))
            if bn not in book_ids: continue
            for idp in IDPART.findall(g.group(2)):
                bn_checked+=1
                if canon(idp) not in book_ids[bn]: bmiss.append((disp(p),i,bn,'§'+idp))
        if DOCGROUP:
            for g in DOCGROUP.finditer(line):
                dn=g.group(1)
                if dn not in DOC_IDS: continue
                for idp in IDPART.findall(g.group(2)):
                    if canon(idp) not in DOC_IDS[dn]: dmiss.append((disp(p),i,dn,'§'+idp))
print(f"Book refs checked: {bn_checked} | misses: {len(bmiss)} | doc misses: {len(dmiss)}")
for x in bmiss: print("  BOOK", x)
for x in dmiss: print("  DOC ", x)
raise SystemExit(1 if (bmiss or dmiss) else 0)
