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

function main() {
  const argv = process.argv.slice(2);
  // `--check` resolves and reports, without running anything — preflight uses it
  // to decide between running the suite and skipping it loudly.
  const checkOnly = argv[0] === '--check';

  let choice;
  try {
    choice = resolveTestBrowser();
  } catch (error) {
    console.error(`\nreal-browser suite: ${error.message}\n`);
    process.exit(1);
  }

  console.log(`real-browser suite -> ${choice.browser} (${choice.reason})`);
  if (checkOnly) return;

  // `--headless` keeps a scripted local run from opening a window and the Vitest
  // UI: a bare browser name parses as headed. Under CI the builder already forces
  // headless, and passing it again only earns an "unnecessary option" notice.
  const args = [
    'ng',
    'run',
    'caelum:test-browser',
    `--browsers=${choice.browser}`,
    ...(process.env.CI ? [] : ['--headless']),
    ...argv,
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
