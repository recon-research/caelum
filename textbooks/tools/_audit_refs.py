import re, glob, os, json, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # cwd-independent: data lives beside tools/
# Windows: cp1252 piped stdout would crash on the report's `§` notation (#503).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
M = json.load(open("MANIFEST.json", encoding="utf-8"))
# #70: per-book maturity. A citation into a book that is not yet `covered`
# asserts authority hollow headings don't have (scaffolds are indexed by
# SECTIONS.json the moment they exist, so heading-resolution alone would pass
# them). Missing field = covered (grandfathers pre-#70 manifests). Lifecycle
# scaffolded -> draft -> covered: LIBRARY_SEED.md section 6.1.
BOOK_STATUS = {b["number"]: b.get("status", "covered") for b in M["books"]}
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
GROUP=re.compile(r'(?<![\w.])(Book\s+)?(\d{1,2})\s*((?:§[A-Za-z0-9.]+)(?:\s*[,/&+]\s*§[A-Za-z0-9.]+)*)')
IDPART=re.compile(r'§([A-Za-z0-9.]+)')
CODE_SPAN=re.compile(r'`[^`]*`')   # an illustrative `Book NN §X` in inline code / fences is teaching, not citing (#70)
FENCE=chr(96)*3
DOCGROUP=re.compile(r'\b(' + '|'.join(DOCNAMES) + r')\s*((?:§[A-Za-z0-9.]+)(?:\s*[,/&]\s*§[A-Za-z0-9.]+)*)') if DOCNAMES else None
def disp(p):
    b=os.path.basename(p)
    return os.path.basename(os.path.dirname(p))+'/'+b if b=='SKILL.md' else b
bmiss=[]; dmiss=[]; hollow=[]; absent=[]; bn_checked=0
for p in (sorted(glob.glob("*.md")) + sorted(glob.glob("books/*.md")) + sorted(glob.glob("skills/*.md"))
          + sorted(glob.glob("../.claude/skills/*/SKILL.md"))   # project-layout skills cite books too
          + sorted(glob.glob("reference/*.md")) + sorted(glob.glob("vision/*.md"))):
    if os.path.basename(p) in ('CHANGELOG.md','LIBRARY_SEED.md'): continue
    # #70: a non-`covered` book is a PLAN — its own citations may point ahead
    # (assignment-sheet specs cite future sections by design, #68); authority
    # surfaces (covered books, reference docs, skills, root docs) may not.
    bdir = os.path.dirname(p).replace('\\','/').rstrip('/') == 'books'
    mnum = re.match(r'(\d+)_', os.path.basename(p)) if bdir else None
    src_is_plan = bool(mnum) and BOOK_STATUS.get(int(mnum.group(1)), "covered") != "covered"
    in_fence=False
    for i,raw in enumerate(open(p,encoding='utf-8'),1):
        if raw.lstrip().startswith(FENCE): in_fence = not in_fence; continue
        if in_fence: continue
        line=CODE_SPAN.sub('',raw)
        for g in GROUP.finditer(line):
            bn=int(g.group(2))
            if bn not in book_ids:
                # was a SILENT skip pre-#70: an explicit `Book NN` citation into
                # a book with no file now fails from authority surfaces.
                if g.group(1) and not src_is_plan:
                    absent.append((disp(p),i,bn,'MANIFEST entry but no file' if bn in BOOK_STATUS else 'no MANIFEST entry, no file'))
                continue
            if not src_is_plan and BOOK_STATUS.get(bn,"covered") != "covered":
                hollow.append((disp(p),i,bn,'status='+str(BOOK_STATUS.get(bn))))
            for idp in IDPART.findall(g.group(3)):
                bn_checked+=1
                if canon(idp) not in book_ids[bn]: bmiss.append((disp(p),i,bn,'§'+idp))
        if DOCGROUP:
            for g in DOCGROUP.finditer(line):
                dn=g.group(1)
                if dn not in DOC_IDS: continue
                for idp in IDPART.findall(g.group(2)):
                    if canon(idp) not in DOC_IDS[dn]: dmiss.append((disp(p),i,dn,'§'+idp))
print(f"Book refs checked: {bn_checked} | misses: {len(bmiss)} | doc misses: {len(dmiss)} | hollow cites: {len(hollow)} | absent cites: {len(absent)}")
for x in bmiss: print("  BOOK", x)
for x in dmiss: print("  DOC ", x)
for x in hollow: print("  HOLLOW", x, "-- authority surface cites a not-yet-covered book; fill + errata, flip status, then cite (#70)")
for x in absent: print("  ABSENT", x, "-- explicit 'Book NN' citation but no such book file (#70)")
raise SystemExit(1 if (bmiss or dmiss or hollow or absent) else 0)
