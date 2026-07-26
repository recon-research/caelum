/**
 * Real-browser verification for {@link animationsSettled} (#779).
 *
 * **Why a browser.** jsdom implements neither CSS transitions nor the Web Animations timeline, so
 * the helper is a deliberate no-op there — every claim below is about behaviour only Chromium has.
 */
import { animationsSettled } from './animation';

describe('animationsSettled (real browser)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => host.remove());

  /** A box that transitions opacity 0 -> 1 over `ms`, started on the next frame. */
  const startFiniteFade = (ms: number): HTMLElement => {
    const box = document.createElement('div');
    box.style.cssText = `width:20px;height:20px;background:#000;opacity:0;transition:opacity ${ms}ms linear`;
    host.appendChild(box);
    void box.offsetWidth; // force style resolution so the transition has a start value
    box.style.opacity = '1';
    return box;
  };

  it('waits for an in-flight transition instead of sampling it mid-flight', async () => {
    const box = startFiniteFade(300);
    // Sampling immediately sees the un-settled value — this is the defect the helper exists for.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    expect(Number(getComputedStyle(box).opacity)).toBeLessThan(1);

    await animationsSettled(host);

    expect(getComputedStyle(box).opacity).toBe('1');
    expect(host.getAnimations({ subtree: true }).length).toBe(0);
  });

  it('does NOT hang on an infinite animation — the spinner case', async () => {
    // cae-progress-spinner's indeterminate arc never completes. Awaiting its `finished` promise
    // would hang the whole run rather than fail it, so infinite animations must be excluded.
    const sheet = document.createElement('style');
    sheet.textContent = '@keyframes cae-probe-spin { to { transform: rotate(360deg) } }';
    document.head.appendChild(sheet);
    const spinner = document.createElement('div');
    spinner.style.cssText = 'width:20px;height:20px;animation:cae-probe-spin 400ms linear infinite';
    host.appendChild(spinner);

    // Prove the hazard is actually present: an infinite animation IS running on this subtree.
    const running = host.getAnimations({ subtree: true });
    expect(running.length).toBeGreaterThan(0);
    expect(running.some((a) => !Number.isFinite(a.effect?.getComputedTiming().endTime ?? 0))).toBe(
      true,
    );

    // If the guard regresses this never resolves, and the suite dies by timeout rather than
    // reporting a failure — so the assertion that matters is simply that we get here.
    await animationsSettled(host);
    expect(true).toBe(true);

    sheet.remove();
  });

  it('still settles finite animations that run alongside an infinite one', async () => {
    const sheet = document.createElement('style');
    sheet.textContent = '@keyframes cae-probe-spin2 { to { transform: rotate(360deg) } }';
    document.head.appendChild(sheet);
    const spinner = document.createElement('div');
    spinner.style.cssText =
      'width:20px;height:20px;animation:cae-probe-spin2 400ms linear infinite';
    host.appendChild(spinner);
    const box = startFiniteFade(250);

    await animationsSettled(host);

    // The infinite one is skipped, but the finite one was genuinely awaited — not just ignored.
    expect(getComputedStyle(box).opacity).toBe('1');
    sheet.remove();
  });
});
