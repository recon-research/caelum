// @ts-check
// Caelum ESLint flat config. Its load-bearing job (issue #4, D-03) is the
// ADAPTER-ISOLATION FENCE: an admitted third-party engine (grid / charts / editor)
// may be imported by EXACTLY ONE file — its adapter — and nowhere else. This is
// "the rule that defends itself" (Book 12 §3.3); it makes the adapter invariant
// mechanical instead of a review-time hope (Risk R6). The baseline angular-eslint
// rules ride along; the format stage + build/test matrix + required-check
// promotion are issue #6's scope.
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

// One group per admitted engine, cited to D-03 so a contributor learns the rule at
// the moment they hit it (Book 12 §3.3). Charts is D3-direct — visx is React-bound
// (D-08 → #11), so we fence `d3`, not visx. PrimeNG is fenced outright in Caelum's
// own source (nothing to grandfather here); the consumer-side migration ratchet
// lands at M4 (Book 20 §3.5). Each group includes the `…/**` subpath form so a deep
// import (`@tanstack/table-core/build/x`) can't slip past a single-segment glob.
const ADAPTER_FENCE = {
  patterns: [
    {
      group: ['@tanstack/*', '@tanstack/*/**'],
      message: 'Import the data grid only via grid.adapter.ts (D-03 adapter isolation).',
    },
    {
      group: ['d3', 'd3/**', 'd3-*', 'd3-*/**'],
      message: 'Import charts (D3) only via charts.adapter.ts (D-03 adapter isolation).',
    },
    {
      group: ['lexical', 'lexical/**', '@lexical/*', '@lexical/*/**'],
      message: 'Import the editor only via editor.adapter.ts (D-03 adapter isolation).',
    },
    {
      group: ['primeng', 'primeng/**'],
      message: 'PrimeNG is being removed — see reference/COMPARISON.md for the cae-* equivalent.',
    },
  ],
};

// `no-restricted-imports` only visits STATIC import/export. Dynamic `import()` — the
// idiomatic @defer / lazy-route path — and `require()` need a syntax rule, or the
// fence is trivially bypassed (`const d3 = await import('d3')`). This RE matches a
// bare or subpath specifier for any fenced engine; keep it in sync with the groups.
const ENGINE_RE = String.raw`^(@tanstack\/|@lexical\/|d3($|[-\/])|lexical($|\/)|primeng($|\/))`;
const DYNAMIC_FENCE = [
  {
    selector: `ImportExpression > Literal[value=/${ENGINE_RE}/]`,
    message: 'Import engines only via their *.adapter.ts (D-03) — dynamic import() included.',
  },
  {
    selector: `CallExpression[callee.name='require'] > Literal[value=/${ENGINE_RE}/]`,
    message: 'Import engines only via their *.adapter.ts (D-03) — require() included.',
  },
];

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.angular/**', 'coverage/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // Both library (`cae`) and Forge app (`app`) prefixes are accepted.
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: ['cae', 'app'], style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: ['cae', 'app'], style: 'kebab-case' },
      ],
      // The adapter fence. The typescript-eslint variant also catches `import type`,
      // so an engine's TYPES cannot leak past the adapter either.
      '@typescript-eslint/no-restricted-imports': ['error', ADAPTER_FENCE],
      // …and the dynamic-import / require escape hatches (see DYNAMIC_FENCE).
      'no-restricted-syntax': ['error', ...DYNAMIC_FENCE],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
  {
    // Adapter carve-outs (D-03). Scoped to the LIBRARY source (never Forge or a
    // consumer app), so a same-named file elsewhere is not auto-exempted. When the
    // real adapters land at M2, pin each to its exact single path (Book 12 §3.3, the
    // "one explicit file path" rule). Forward-declared: these match nothing until then.
    files: [
      'projects/caelum/src/**/grid.adapter.ts',
      'projects/caelum/src/**/charts.adapter.ts',
      'projects/caelum/src/**/editor.adapter.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);
