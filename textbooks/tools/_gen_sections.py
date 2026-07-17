import re, json, os, sys
# Windows cp1252 stdout guard (#296): gate output carries non-ASCII
# (em-dashes, section signs, file text); a cp1252-strict console mojibakes
# or crashes an otherwise-green run. Uniform across every gate script.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # cwd-independent: data lives beside tools/
M = json.load(open("MANIFEST.json", encoding="utf-8"))
by_num = {b["number"]: b for b in M["books"]}
HEAD = re.compile(r'^(#{2,5})\s+(.*?)\s*$')
def parse_id(title):
    toks = title.split()
    if not toks: return None, title
    lead = toks[0]
    if lead.rstrip(':.').lower() in ('section','appendix','part','chapter') and len(toks) >= 2:
        sid = toks[1].rstrip(':.')
        if re.fullmatch(r'[0-9A-Za-z]+', sid):
            rest = title.split(toks[1], 1)[1].lstrip(' :.-—').strip()
            return sid, (rest or title)
        return None, title
    m = re.match(r'^([0-9]+[A-Za-z]*(?:\.[0-9A-Za-z]+)*|[A-Za-z]+[0-9]+(?:\.[0-9]+)*)\.?\s+(.*)$', title)
    if m:
        sid = m.group(1).rstrip('.')
        if re.search(r'[0-9]', sid) or len(sid) <= 2:
            return sid, m.group(2).strip()
    return None, title
out = {"generated_from": "MANIFEST.json", "books": {}}
for num in sorted(by_num):
    b = by_num[num]; secs = []
    for i, line in enumerate(open(b["path"], encoding="utf-8"), 1):
        m = HEAD.match(line.rstrip("\n"))
        if not m: continue
        sid, clean = parse_id(m.group(2).strip())
        if sid is None: continue
        secs.append({"id": sid, "title": clean, "line": i, "level": len(m.group(1))})
    out["books"][str(num)] = {"path": b["path"], "title": b["title"], "section_count": len(secs), "sections": secs}
json.dump(out, open("SECTIONS.json", "w", encoding="utf-8", newline="\n"), indent=1, ensure_ascii=False)
print(f"Wrote SECTIONS.json: {len(out['books'])} books, {sum(b['section_count'] for b in out['books'].values())} sections")
