import json, re, os, glob
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # cwd-independent: data lives beside tools/
M = json.load(open("MANIFEST.json", encoding="utf-8"))
EV = json.load(open("ROUTING_EVAL.json", encoding="utf-8"))
STOP=set("with that this into from your you should what does mean give make build using like want need have them and the for are can how why when which who your our its was just then than also more most some any all into onto over under via per each both these those an to of in on is it do i me my we us be as at or if so no not new use used uses".split())
SHORT_OK=set("ui vr ar xr 2d 3d ai ml ip rl gi io os db ui ux api sql".split())
def norm(s): return re.sub(r"[^a-z0-9]+"," ",s.lower())
corpus={}
for b in M["books"]:
    corpus[b["id"]] = norm(" ".join([b["title"]," ".join(b["topics"])," ".join(b["key_concepts"]),b["summary"]]))
for d in M["reference_docs"]:
    corpus[d["id"]] = norm(" ".join([d["id"]," ".join(d.get("topics",[]))," ".join([d.get("summary","")])]))
def add(key, targets):
    for t in targets:
        tid = t if t.startswith("book_") else t.lower()
        if tid in corpus: corpus[tid] += " " + norm(key.replace("_"," "))
for k,v in M.get("topic_to_books",{}).items(): add(k,v)
for k,v in M.get("rag_hints",{}).items(): add(k,[t for t in v if isinstance(t,str) and not t.startswith("skills/")])
cwords={t:set(c.split()) for t,c in corpus.items()}
def match(t,ws):
    for w in ws:
        if t==w: return True
        if len(t)>=4 and t in w: return True
        if len(w)>=4 and w in t: return True
        if len(t)>=5 and len(w)>=5 and t[:4]==w[:4]: return True
    return False
def sig(q):
    toks=[t for t in norm(q).split() if (len(t)>=4 or t in SHORT_OK) and t not in STOP]
    return toks, [toks[i]+" "+toks[i+1] for i in range(len(toks)-1)]
def score(q,tid):
    toks,bg=sig(q); ws=cwords[tid]; c=corpus[tid]
    return sum(1 for t in toks if match(t,ws)) + sum(2 for b in bg if b in c)
passed=0; fails=[]
for case in EV["cases"]:
    q=case["query"]; expect=[e if e.startswith("book_") else e.lower() for e in case["expect"]]
    ranked=sorted(corpus, key=lambda t: score(q,t), reverse=True)
    top=[t for t in ranked if score(q,t)>0][:3]
    if any(e in top for e in expect): passed+=1
    else: fails.append((q,expect,[(t,score(q,t)) for t in ranked[:3]]))
print(f"Routing eval: {passed}/{len(EV['cases'])} passed")
for q,e,t in fails: print(f"\nQ: {q}\n  expected {e}\n  got {t}")
# --- #68 eval-first: every covered book must be routable (>=1 case targets it) ---
# A covered book no query routes to is dead weight the routing layer can't serve.
# status != covered is exempt: specs/drafts aren't routable product yet (#70).
cov_fails=[]
expected_all={x if x.startswith("book_") else x.lower() for c in EV["cases"] for x in c["expect"]}
for b in M["books"]:
    if b.get("status","covered")=="covered" and b["id"] not in expected_all:
        cov_fails.append(f"covered book with no ROUTING_EVAL case targeting it -> {b['id']} ({b['title']}) (#68)")
for x in cov_fails: print("  EVAL", x)
# --- skills catalog: MANIFEST skills[] is the single catalog; it must match disk ---
# (Skipped when no ../.claude/skills exists — e.g. a standalone library checkout.)
sk_fails=[]; sk_warns=[]
sk_listed={str(s.get("path","")).replace("\\","/") for s in M.get("skills",[])}
sk_disk={p.replace("\\","/") for p in glob.glob("../.claude/skills/*/SKILL.md")}
if sk_disk:
    sk_fails += [f"MANIFEST skills[] path missing on disk -> {p}" for p in sorted(sk_listed) if p.startswith("../.claude/") and not os.path.exists(p)]
    sk_fails += [f"skill on disk not in MANIFEST skills[] -> {p}" for p in sorted(sk_disk - sk_listed)]
    # Frontmatter must PARSE (#48): a SKILL.md whose YAML breaks silently falls out
    # of routing -- Claude Code then shows the bare title instead of the description,
    # and conversational activation dies. Known-fatal shape caught live in #52's
    # follow-up slice: an UNQUOTED description containing ": " (colon+space), which
    # YAML reads as a mapping indicator inside a plain scalar. Stdlib-only lint for
    # the fatal shapes, not a YAML parser.
    for p in sorted(sk_disk):
        try:
            text = open(p, encoding="utf-8").read()
        except Exception as e:
            sk_fails.append(f"unreadable SKILL.md -> {p} ({e})"); continue
        fm = re.match(r"^---\n(.*?)\n---(\n|$)", text, re.S)
        if not fm:
            sk_fails.append(f"missing/unterminated frontmatter -> {p}"); continue
        fields = {}
        for line in fm.group(1).splitlines():
            km = re.match(r"^([A-Za-z_][\w-]*):\s?(.*)$", line)
            if km: fields[km.group(1)] = km.group(2)
        name, desc = fields.get("name", "").strip(), fields.get("description", "").strip()
        dirname = os.path.basename(os.path.dirname(p)).replace("\\", "/")
        if not name: sk_fails.append(f"frontmatter missing name -> {p}")
        elif name != dirname: sk_fails.append(f"frontmatter name '{name}' != directory '{dirname}' -> {p}")
        if not desc: sk_fails.append(f"frontmatter missing description -> {p}")
        elif desc[0] not in "\"'>|" and ": " in desc:
            sk_fails.append(f"unquoted description contains ': ' (YAML plain-scalar breaker -- quote the value or drop the colon+space) -> {p}")
        # #72: the harness truncates skill descriptions at 1,536 chars in the
        # session listing; since #45 the proactive triggers live in descriptions,
        # so an over-budget one silently loses its cues. Fail past the cap,
        # warn past 1,200 (headroom). Length is the scalar's, minus one layer
        # of surrounding quotes if present.
        dlen = len(desc[1:-1]) if len(desc) >= 2 and desc[0] in "\"'" and desc[-1] == desc[0] else len(desc)
        if dlen > 1536:
            sk_fails.append(f"description is {dlen} chars > 1536 harness cap -- it gets truncated and the proactive triggers die invisibly; tighten it -> {p}")
        elif dlen > 1200:
            sk_warns.append(f"description is {dlen} chars (warn > 1200; hard cap 1536) -- trim before it hits the truncation cliff -> {p}")
        # #87: the BODY lazy-loads into context on EVERY invocation, so cost =
        # size x invocation count -- the priciest journaling surface after
        # CLAUDE.md, and "agents appending lessons-learned" is the observed
        # failure shape (that material belongs in a #48 skill-defect ticket;
        # procedure detail belongs in the owning doc the skill links). Line
        # budget: warn > 120, fail > 200 (largest real body at calibration:
        # 78 lines). Char warn > 16000 catches dense long-line bodies the
        # line count misses (onboard: 76 lines but ~17k chars -- already the
        # cost of a fail-length body at normal density).
        body = text[fm.end():]
        blines, bchars = len(body.splitlines()), len(body)
        if blines > 200:
            sk_fails.append(f"skill body is {blines} lines > 200 -- it reloads on every invocation; move procedure detail to the owning doc and lessons-learned to a #48-style skill-defect ticket, never body appends -> {p}")
        elif blines > 120:
            sk_warns.append(f"skill body is {blines} lines (warn > 120; fail > 200) -- trim: procedure detail to the owning doc, lessons to tickets -> {p}")
        if bchars > 16000:
            sk_warns.append(f"skill body is {bchars} chars (warn > 16000: dense long-line body, already fail-length cost) -- move procedure detail to the owning doc, lessons to tickets -> {p}")
    # guard: #261 -- the README's prose skill count must match the catalog; it went
    # stale twice (30 vs 32) because nothing asserted prose, only catalog<->disk.
    # Same class as a stale MANIFEST total_books (the COUNTS check below).
    # #274 (intakes #271/#272/#273): anchor on the subject-independent tail --
    # the original "This template's" literal forced awkward wording on every
    # downstream (one forked the regex, re-patching it each sync). Any subject
    # works: "This template's / This project's / <Name>'s N skills total ...".
    rp = "../.claude/skills/README.md"
    rm = re.search(r"(\d+) skills total", open(rp, encoding="utf-8").read()) if os.path.exists(rp) else None
    if not rm:
        sk_fails.append(f"README prose count phrase missing (\"<N> skills total\") -- keep that anchor, the count is audit-asserted (#261/#274) -> {rp}")
    elif int(rm.group(1)) != len(sk_disk):
        sk_fails.append(f"README prose says {rm.group(1)} skills but {len(sk_disk)} are on disk -- update the prose (and re-measure its token figure) -> {rp}")
for x in sk_fails: print("  SKILLS", x)
for x in sk_warns: print("  SKILLS warn:", x)
print(f"Skills catalog: {len(sk_listed)} listed, {len(sk_disk)} on disk, {len(sk_fails)} problem(s), {len(sk_warns)} warning(s)")
# --- #72: MANIFEST count self-consistency -- build_library says "don't trust
# counts from memory; grep and verify"; make the machine do it on every run. ---
cnt_fails=[]
for total_key, list_key in (("total_books","books"), ("total_volumes","volumes")):
    if total_key in M and isinstance(M.get(list_key), list) and M[total_key] != len(M[list_key]):
        cnt_fails.append(f"MANIFEST {total_key}={M[total_key]} but len({list_key})={len(M[list_key])} -- fix the count (or the list)")
for x in cnt_fails: print("  COUNTS", x)
raise SystemExit(1 if (fails or cov_fails or sk_fails or cnt_fails) else 0)
