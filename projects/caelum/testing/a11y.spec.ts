import { expectAnnouncedErrorState, expectNoA11yViolations } from './a11y';

/**
 * The harness's own teeth-test (Book 16 §3.2). A gate that cannot fail is worse than none —
 * these prove `expectNoA11yViolations` PASSES on a clean subtree, THROWS (naming the rule) on a
 * genuine violation, and honours `disableRules`. The subtrees are attached to the document so
 * axe evaluates them the way a component fixture would.
 */
describe('expectNoA11yViolations (Layer 1 axe harness)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => root.remove());

  it('passes on an accessible subtree', async () => {
    root.innerHTML = `<button type="button">Save</button>`;
    await expectNoA11yViolations(root);
  });

  it('throws, naming the failing rule, on a real violation (an <img> with no alt)', async () => {
    root.innerHTML = `<img src="logo.png" />`;
    await expect(expectNoA11yViolations(root)).rejects.toThrow(/image-alt/);
  });

  it('disableRules suppresses a named rule (for what jsdom cannot judge)', async () => {
    root.innerHTML = `<img src="logo.png" />`;
    // With image-alt disabled, the same bad DOM no longer fails the gate.
    await expectNoA11yViolations(root, { disableRules: ['image-alt'] });
  });
});

/**
 * The same teeth-test, for the error-state assertion five control specs now lean on (#785). Raw
 * DOM rather than a fixture on purpose: the point is the *rule*, not any one control's markup, and
 * every branch here is a way the helper could silently pass on a field that announces nothing.
 */
describe('expectAnnouncedErrorState (the error-announcement contract)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => root.remove());

  it('passes when the message is rendered, referenced, and the subtree is clean', async () => {
    root.innerHTML = `
      <input aria-label="Email" aria-describedby="err-1" />
      <mat-error id="err-1">Email is required</mat-error>`;
    await expectAnnouncedErrorState(root, 'Email is required');
  });

  it('throws when the subtree holds no form-field control (the assertion would be vacuous)', async () => {
    root.innerHTML = `<mat-error id="err-1">Email is required</mat-error>`;
    await expect(expectAnnouncedErrorState(root, 'Email is required')).rejects.toThrow(
      /no form-field control/,
    );
  });

  it('throws on a pristine field — axe alone would grade it clean and prove nothing', async () => {
    root.innerHTML = `<input aria-label="Email" />`;
    await expect(expectAnnouncedErrorState(root, 'Email is required')).rejects.toThrow(
      /no <mat-error> at all/,
    );
  });

  it('throws when the message is rendered but NOT referenced — visible, inaudible', async () => {
    root.innerHTML = `
      <input aria-label="Email" />
      <mat-error id="err-1">Email is required</mat-error>`;
    await expect(expectAnnouncedErrorState(root, 'Email is required')).rejects.toThrow(
      /rendered but NOT referenced/,
    );
  });

  // The id is matched as a whole token, not a substring: "err-1" IS a substring of "err-10", so a
  // `contains` check would report this field as correctly linked when it references another id
  // entirely. Material numbers its error ids sequentially, so reaching 10 in one form is ordinary.
  it('does not accept an id that merely appears inside another describedby token', async () => {
    root.innerHTML = `
      <input aria-label="Email" aria-describedby="err-10" />
      <mat-error id="err-1">Email is required</mat-error>`;
    await expect(expectAnnouncedErrorState(root, 'Email is required')).rejects.toThrow(
      /rendered but NOT referenced/,
    );
  });
});
