// capture_ui — render project UI specimens to PNGs for the design_review pixel gate.
//
// Template machinery (#150): the browser-capable capture path a React downstream gets
// out of the box, so design_review gate mode isn't stuck in degraded/manual mode.
// Generalized verbatim from the EXP-03 render harness that produced the frozen
// design-canon-transfer results — the capture logic is unchanged; only the specimen
// source, geometries, and themes are parameterized. Exercised in-repo by the #149
// exemplar-register captures, which caught and fixed two generalization defects
// (node_modules reachability; false-green on unmounted specimens) — see README.md.
//
// Usage:  node scripts/capture_ui/capture.mjs [outDir]
// Env:
//   CAPTURE_SPECIMENS  dir of *.jsx specimens, each default-exporting a component composed
//                      with real props and real copy (design_review Pass-1). Default: ./specimens
//   CAPTURE_WIDTHS     comma list of viewport widths; a width <500 is shot full-page. Default:
//                      1280,375 — mirrors the PROJECT_CONVENTIONS › Screenshot capture web default,
//                      which OWNS the list; override here to match a project that changed the knob.
//   CAPTURE_THEMES     comma list of theme names to loop; each is set as <html data-theme=…> and a
//                      ?theme= param + component prop. Default: none (single pass — single-theme is legit).
//   CAPTURE_PORT       vite dev port. Default: 5199
// Prereq: node + `npm i -D react react-dom vite @vitejs/plugin-react playwright`
//         then `npx playwright install chromium`. Full bootstrap (no system install): README.md.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { readdirSync, mkdirSync, mkdtempSync, copyFileSync, symlinkSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] || join(here, "shots"));
const specimens = resolve(process.env.CAPTURE_SPECIMENS || "specimens");
const widths = (process.env.CAPTURE_WIDTHS || "1280,375").split(",").map((s) => parseInt(s.trim(), 10));
const themes = (process.env.CAPTURE_THEMES || "").split(",").map((s) => s.trim()).filter(Boolean);
const port = parseInt(process.env.CAPTURE_PORT || "5199", 10);

// Assemble an ephemeral vite root from the shipped harness (index.html + mount.jsx) plus a
// symlink to the project's specimens, so mount.jsx's proven `./specimens/*.jsx` glob resolves
// wherever specimens live — and a specimen's outward relative imports (../tokens, ../primitives)
// still resolve, because vite reads realpaths through the symlink (a copy would break them).
// The project's node_modules is symlinked in too: the root lives under tmpdir, so vite's
// walk-up resolution would never reach the invoking project's deps (found live in #149's
// first in-repo run — bare `react` imports 500'd, and the shots were the error overlay).
mkdirSync(outDir, { recursive: true });
let deps = process.cwd();
while (!existsSync(join(deps, "node_modules")) && dirname(deps) !== deps) deps = dirname(deps);
if (!existsSync(join(deps, "node_modules"))) {
  console.log("ERROR: no node_modules found walking up from cwd — run the README bootstrap first");
  process.exit(1);
}
const root = mkdtempSync(join(tmpdir(), "capture-ui-"));
copyFileSync(join(here, "index.html"), join(root, "index.html"));
copyFileSync(join(here, "mount.jsx"), join(root, "mount.jsx"));
symlinkSync(specimens, join(root, "specimens"), "dir");
symlinkSync(join(deps, "node_modules"), join(root, "node_modules"), "dir");

const server = await createServer({
  root,
  plugins: [react()],
  server: { port, strictPort: true },
  logLevel: "error",
});
await server.listen();
const browser = await chromium.launch();
const ids = readdirSync(specimens)
  .filter((f) => f.endsWith(".jsx"))
  .map((f) => f.replace(".jsx", ""))
  .sort();
const themeList = themes.length ? themes : [null];
let shot = 0,
  failed = 0;
for (const id of ids) {
  for (const theme of themeList) {
    for (const w of widths) {
      const full = w < 500; // narrow = mobile = full-page; wide = fixed 800h viewport (EXP-03 heuristic)
      const suffix = theme ? `${theme}-${w}` : `${w}`;
      const query = `screen=${id}` + (theme ? `&theme=${theme}` : "");
      const page = await browser.newPage({ viewport: { width: w, height: 800 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await page.goto(`http://localhost:${port}/?${query}`, { waitUntil: "networkidle", timeout: 30000 });
        // Liveness: the specimen must actually mount. A failed module load (e.g. an unresolved
        // import) fires no pageerror — it leaves #root empty under vite's error overlay, which
        // screenshots "successfully". Found as a false green in #149's first in-repo run.
        await page.waitForFunction(
          () => { const r = document.getElementById("root"); return r && r.childElementCount > 0; },
          { timeout: 15000 }
        );
        await page.waitForTimeout(1200);
        if (errors.length) {
          console.log(`ERROR ${id} (${suffix}): ${errors[0]}`);
          failed++;
        } else {
          await page.screenshot({ path: join(outDir, `${id}-${suffix}.png`), fullPage: full });
          console.log(`shot ${id}-${suffix}`);
          shot++;
        }
      } catch (e) {
        console.log(`ERROR ${id} (${suffix}): ${String(e).slice(0, 200)}`);
        failed++;
      }
      await page.close();
    }
  }
}
await browser.close();
await server.close();
rmSync(root, { recursive: true, force: true });
console.log(`DONE — ${shot} shot, ${failed} failed → ${outDir}`);
process.exit(failed ? 1 : 0);
