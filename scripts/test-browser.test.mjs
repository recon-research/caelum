/**
 * Unit tests for the real-browser runner's resolver (#240).
 *
 * `node --test` (no new dependency — Node ships the runner). These live here
 * rather than in the Vitest suite because the subject is build tooling, not
 * library code, and because the arm that matters most — falling back to Firefox
 * when Chromium is absent — cannot be observed on a machine that has Chromium
 * installed. Injecting `isInstalled` is the only way to exercise both arms.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORTED,
  VR_BROWSER,
  browserIsInstalled,
  resolveTestBrowser,
  resolveVrBrowser,
} from './test-browser.mjs';

/** An `isInstalled` stub reporting exactly `names` as present. */
const installed =
  (...names) =>
  (name) =>
    names.includes(name);

test('prefers chromium when both browsers are installed', () => {
  const { browser } = resolveTestBrowser({
    env: {},
    isInstalled: installed('chromium', 'firefox'),
  });
  assert.equal(browser, 'chromium');
});

test('falls back to firefox when chromium is not installed', () => {
  const { browser, reason } = resolveTestBrowser({ env: {}, isInstalled: installed('firefox') });
  assert.equal(browser, 'firefox');
  assert.match(reason, /fell back/);
});

test('fails with install instructions when no browser is installed', () => {
  assert.throws(
    () => resolveTestBrowser({ env: {}, isInstalled: () => false }),
    /playwright install/,
  );
});

test('honours a pin, trimmed and case-insensitively', () => {
  const { browser, reason } = resolveTestBrowser({
    env: { CAELUM_TEST_BROWSER: ' FireFox ' },
    isInstalled: installed('chromium', 'firefox'),
  });
  assert.equal(browser, 'firefox');
  assert.match(reason, /pinned/);
});

test('a pin never silently falls back to an installed browser', () => {
  // The whole point of pinning: a Firefox pin on a Chromium-only box must fail
  // loudly, not report a Firefox run that actually executed in Chromium.
  assert.throws(
    () =>
      resolveTestBrowser({
        env: { CAELUM_TEST_BROWSER: 'firefox' },
        isInstalled: installed('chromium'),
      }),
    /not installed here/,
  );
});

test('rejects an unsupported pin', () => {
  assert.throws(
    () => resolveTestBrowser({ env: { CAELUM_TEST_BROWSER: 'lynx' }, isInstalled: () => true }),
    /not a supported browser/,
  );
});

test('an empty pin is ignored rather than treated as a browser name', () => {
  const { browser } = resolveTestBrowser({
    env: { CAELUM_TEST_BROWSER: '  ' },
    isInstalled: installed('chromium'),
  });
  assert.equal(browser, 'chromium');
});

test('browserIsInstalled gates on own keys, not the prototype chain', () => {
  // `toString` indexes to a real function on a bare lookup — and `in` would pass
  // it too, so both the index and the guard have to be own-key checks.
  for (const inherited of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
    assert.equal(browserIsInstalled(inherited, {}), false, inherited);
  }
});

test('CHROME_BIN makes chromium available without a Playwright download', () => {
  // Agrees with @angular/build, which forwards CHROME_BIN to the provider as
  // launchOptions.executablePath — process.execPath stands in for a real binary.
  assert.equal(browserIsInstalled('chromium', { CHROME_BIN: process.execPath }), true);
  assert.equal(browserIsInstalled('chromium', { CHROME_BIN: '/nonexistent/chrome' }), false);
});

test('SUPPORTED is the preference order, chromium first', () => {
  assert.deepEqual(SUPPORTED, ['chromium', 'firefox']);
});

// --- Visual-regression resolver (#732) ------------------------------------
// Every arm here guards the same failure: a missing golden is CREATED, not
// failed, so anything that changes the golden's filename (engine, platform)
// yields a parallel set that passes locally and is never compared in CI.

test('vr resolves chromium on linux when it is installed', () => {
  const { browser } = resolveVrBrowser({
    env: {},
    platform: 'linux',
    isInstalled: installed('chromium'),
  });
  assert.equal(browser, VR_BROWSER);
});

test('vr does NOT fall back to firefox — goldens are engine-specific', () => {
  assert.throws(
    () => resolveVrBrowser({ env: {}, platform: 'linux', isInstalled: installed('firefox') }),
    /no fallback/,
  );
});

test('vr rejects a pin naming another engine rather than honouring it', () => {
  assert.throws(
    () =>
      resolveVrBrowser({
        env: { CAELUM_TEST_BROWSER: 'firefox' },
        platform: 'linux',
        isInstalled: installed('chromium', 'firefox'),
      }),
    /parallel set CI never compares/,
  );
});

test('vr accepts a pin that names the golden engine', () => {
  const { browser } = resolveVrBrowser({
    env: { CAELUM_TEST_BROWSER: 'Chromium' },
    platform: 'linux',
    isInstalled: installed('chromium'),
  });
  assert.equal(browser, VR_BROWSER);
});

test('vr refuses a non-linux host even with chromium present', () => {
  for (const platform of ['darwin', 'win32']) {
    assert.throws(
      () => resolveVrBrowser({ env: {}, platform, isInstalled: installed('chromium') }),
      /maintained for linux only/,
      `expected ${platform} to be refused`,
    );
  }
});
