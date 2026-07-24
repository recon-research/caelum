import { expectNoA11yViolations } from './a11y';

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
