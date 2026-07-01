import re, glob, os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # cwd-independent: data lives beside tools/
LINK = re.compile(r'\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)')
CODE_SPAN = re.compile(r'`[^`]*`')   # inline code — an illustrative [text](x) inside it is not a real link
SKIP = ('http://', 'https://', 'mailto:', '#')
FENCE = chr(96) * 3   # the code-fence marker, written via chr() so this snippet embeds safely
broken = []; checked = 0
for f in glob.glob("**/*.md", recursive=True):
    in_fence = False
    for i, line in enumerate(open(f, encoding='utf-8'), 1):
        if line.lstrip().startswith(FENCE):
            in_fence = not in_fence; continue
        if in_fence:
            continue
        for m in LINK.finditer(CODE_SPAN.sub('', line)):
            tgt = m.group(1).strip()
            if tgt.startswith(SKIP) or tgt.startswith('/'): continue
            path = tgt.split('#', 1)[0]
            if not path: continue
            checked += 1
            if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), path))):
                broken.append((f.replace("\\", "/"), i, tgt))
print(f"Markdown links checked: {checked} | broken: {len(broken)}")
for b in broken: print(f"  BROKEN  {b[0]}:{b[1]}  ->  {b[2]}")
raise SystemExit(1 if broken else 0)
