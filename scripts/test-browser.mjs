#!/usr/bin/env node
/**
 * Real-browser test runner (#240) — picks a browser that is actually installed,
 * then runs the browser-only spec suite (`*.browser.spec.ts`) through Vitest
 * browser mode.
 *
 * WHY a resolver exists at all: `@angular/build:unit-test` takes `browsers` as a
 * STATIC list and does no auto-selection. Naming a browser whose Playwright build
 * was never downloaded fails deep inside the provider with an "Executable doesn't
 * exist" stack trace — so this picks one that is present, and says which and why.
 *
 * Preference order IS `SUPPORTED`: Chromium first (what CI installs, and the
 * engine most consumers ship against), Firefox as the fallback so a machine
 * without the Chromium build still runs the suite. `CAELUM_TEST_BROWSER` pins the
 * choice, and a pin is honoured STRICTLY — if the pinned browser is missing this
 * fails instead of falling back, because a silent fallback would report a Firefox
 * run that never happened.
 *
 * Dev-tier only: `playwright` and `@vitest/browser-playwright` are
 * devDependencies and never reach the published package (D-11's runtime-vs-dev
 * split; grounding in `research/notes/angular-22-testing.md`).
 */
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';

/** Supported browsers **in preference order** — the first installed one wins. */
export const SUPPORTED = ['chromium', 'firefox'];

const LAUNCHERS = { chromium, firefox };

/**
 * True when `name` can actually be launched here.
 *
 * Playwright's `executablePath()` returns the path it WOULD use whether or not
 * the build was downloaded, so presence is an fs check rather than a try/catch.
 * Chromium additionally honours `CHROME_BIN`, which `@angular/build` forwards to
 * the provider as `launchOptions.executablePath` — so a system Chrome counts even
 * with no Playwright download, and this must agree with the builder or we would
 * fall back to Firefox on a machine where Chromium was runnable all along.
 *
 * `name` reaches here from an env var, so the registry lookup gates on OWN keys:
 * a bare index (or an `in` guard) would resolve `toString` to a real function.
 */
export function browserIsInstalled(name, env = process.env) {
  if (!Object.hasOwn(LAUNCHERS, name)) return false;
  if (name === 'chromium' && env.CHROME_BIN) return existsSync(env.CHROME_BIN);
  return existsSync(LAUNCHERS[name].executablePath());
}

/**
 * Decides which browser to drive. Pure: `env` and `isInstalled` are injected so
 * the fallback arm is testable on a machine where only one browser is present.
 *
 * @returns `{ browser, reason }` — `reason` is the human log line.
 * @throws when a pin is unusable, or when no supported browser is installed.
 */
export function resolveTestBrowser({
  env = process.env,
  isInstalled = (name) => browserIsInstalled(name, env),
} = {}) {
  const raw = env.CAELUM_TEST_BROWSER;
  const pinned = raw?.trim().toLowerCase();

  if (pinned) {
    if (!SUPPORTED.includes(pinned)) {
      throw new Error(
        `CAELUM_TEST_BROWSER="${raw}" is not a supported browser — use one of: ${SUPPORTED.join(', ')}.`,
      );
    }
    if (!isInstalled(pinned)) {
      throw new Error(
        `CAELUM_TEST_BROWSER pins "${pinned}", but its browser build is not installed here.\n` +
          `  Install it:  npx playwright install ${pinned}\n` +
          `  A pin is honoured strictly — falling back would report a "${pinned}" run that never happened.`,
      );
    }
    return { browser: pinned, reason: 'pinned by CAELUM_TEST_BROWSER' };
  }

  const found = SUPPORTED.find((name) => isInstalled(name));
  if (!found) {
    throw new Error(
      `No supported browser is installed — looked for: ${SUPPORTED.join(', ')}.\n` +
        `  Install one:  npx playwright install ${SUPPORTED[0]}\n` +
        `  Then re-run:  npm run test:browser`,
    );
  }

  return {
    browser: found,
    reason:
      found === SUPPORTED[0]
        ? `${SUPPORTED[0]} is installed (preferred)`
        : `${SUPPORTED[0]} is not installed — fell back`,
  };
}

/** The one engine visual-regression goldens are maintained for. */
export const VR_BROWSER = 'chromium';
/** The one platform they are maintained for — `process.platform` values. */
export const VR_PLATFORM = 'linux';

/**
 * Decides which browser drives the **visual-regression** target.
 *
 * Unlike {@link resolveTestBrowser} this has no fallback, and the reason is the same in both
 * halves of the check: **a missing golden is silently created, not failed.** So anything that
 * changes the golden's filename does not produce a red test — it produces a second, parallel set
 * that passes locally forever and that CI can never compare against.
 *
 * The filename carries `${browserName}` and `${platform}`, so both are pinned here:
 *  - **engine** — Firefox rasterizes differently, so its output is not a golden, it is a different
 *    golden. A `CAELUM_TEST_BROWSER` pin naming anything else is an error, not an override.
 *  - **platform** — a macOS or Windows checkout would mint `-darwin` / `-win32` goldens beside the
 *    committed `-linux` ones and report green having compared against nothing.
 *
 * @returns `{ browser, reason }` — `reason` is the human log line.
 * @throws when Chromium is unavailable, the env pins a different browser, or the host platform is
 *   not the one goldens are maintained for.
 */
export function resolveVrBrowser({
  env = process.env,
  platform = process.platform,
  isInstalled = (name) => browserIsInstalled(name, env),
} = {}) {
  const pinned = env.CAELUM_TEST_BROWSER?.trim().toLowerCase();
  if (pinned && pinned !== VR_BROWSER) {
    throw new Error(
      `CAELUM_TEST_BROWSER pins "${pinned}", but visual-regression goldens exist only for ${VR_BROWSER}.\n` +
        `  Goldens are engine-specific — a "${pinned}" run would write a parallel set CI never compares.\n` +
        `  Unset the pin, or run the behavioural suite instead:  npm run test:browser`,
    );
  }
  if (platform !== VR_PLATFORM) {
    throw new Error(
      `visual-regression goldens are maintained for ${VR_PLATFORM} only, and this is "${platform}".\n` +
        `  A missing golden is CREATED, not failed — so running here would mint a parallel\n` +
        `  "-${platform}" set that passes locally and is never compared in CI.\n` +
        `  Run the behavioural suite instead (npm run test:browser); CI covers the goldens.`,
    );
  }
  if (!isInstalled(VR_BROWSER)) {
    throw new Error(
      `visual regression needs ${VR_BROWSER}, whose browser build is not installed here.\n` +
        `  Install it:  npx playwright install ${VR_BROWSER}\n` +
        `  There is no fallback: another engine rasterizes differently, so its output is not a golden.`,
    );
  }
  return { browser: VR_BROWSER, reason: `${VR_BROWSER} is required for goldens` };
}

function main() {
  const argv = process.argv.slice(2);
  // Leading flags, order-independent, so preflight can ask "would VR run here?"
  // as `--vr --check`:
  //   `--check` resolves and reports without running anything — preflight uses it
  //     to decide between running a suite and skipping it loudly.
  //   `--vr` drives the visual-regression target (#732) instead of the
  //     behavioural one, under the stricter resolver.
  const flags = new Set();
  let i = 0;
  while (argv[i] === '--check' || argv[i] === '--vr') flags.add(argv[i++]);
  const checkOnly = flags.has('--check');
  const vr = flags.has('--vr');
  const rest = argv.slice(i);
  const label = vr ? 'visual-regression suite' : 'real-browser suite';

  let choice;
  try {
    // A golden is engine-specific — Chromium and Firefox rasterize differently, so
    // the same DOM yields two different images and only one set is maintained here.
    // The behavioural suite may fall back to Firefox; VR must not, or a dev would
    // silently generate a parallel golden set that CI can never match.
    choice = vr ? resolveVrBrowser() : resolveTestBrowser();
  } catch (error) {
    console.error(`\n${label}: ${error.message}\n`);
    process.exit(1);
  }

  console.log(`${label} -> ${choice.browser} (${choice.reason})`);
  if (checkOnly) return;

  // `--headless` keeps a scripted local run from opening a window and the Vitest
  // UI: a bare browser name parses as headed. Under CI the builder already forces
  // headless, and passing it again only earns an "unnecessary option" notice.
  const args = [
    'ng',
    'run',
    vr ? 'caelum:test-vr' : 'caelum:test-browser',
    `--browsers=${choice.browser}`,
    ...(process.env.CI ? [] : ['--headless']),
    ...rest,
  ];

  const child = spawn('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('error', (error) => {
    console.error(`real-browser suite: could not start "npx ng" — ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

// Import-safe: the resolver is unit-tested, so only run when invoked directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
