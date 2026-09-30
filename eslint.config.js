// ESLint 9 flat config (CommonJS — package.json has no "type": "module").
// Docs: https://eslint.org/docs/latest/use/configure/
// @ts-check
'use strict';

const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  // Base recommended rules
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Project-specific overrides (src + test TypeScript) — type-aware lint rules
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        // Explicit project list: tsconfig.json's `exclude` omits test/, so projectService's
        // single-nearest-tsconfig discovery can't resolve type info there. Listing both
        // projects lets typescript-eslint match each file against whichever tsconfig's
        // `include` covers it.
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Ignore underscore-prefixed params, vars, and caught errors (_overwrite, _e, etc.)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Allow `require()` in the schema emitter, other build-time CJS files, and tests.
      // Note: verbatimModuleSyntax is deferred (ESM migration) so CJS require() stays.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // src only: every Promise must be awaited, returned, or handled — no silent fire-and-forget.
  // Commander .action(async cb) is handled internally by Commander; those are safe.
  // src only: `any` must be explicitly suppressed with @ts-expect-error — one site in
  // schema/emit.ts already has a suppression comment; all others are errors.
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // Phase 1 of the clean-code ratchet (see docs/decisions/clean-code-audit-2026-07.md):
      // every bare numeric literal must be a named constant. 0/1/-1 are exempted as
      // universally self-explanatory (empty-check, increment, not-found sentinel);
      // array indices are exempted since `arr[0]` needs no named constant to be clear.
      'no-magic-numbers': [
        'error',
        { ignore: [0, 1, -1], ignoreArrayIndexes: true, enforceConst: true },
      ],
      // Phase 2: functions over 4 params now take a single options object instead —
      // see docs/decisions/clean-code-audit-2026-07.md for the call sites converted.
      'max-params': ['error', { max: 4 }],
      // Phase 3: the 6 files over 200 lines were split by concern (contracts/metadata/
      // field-family modules); cli.ts is exempted via its own file-level
      // /* eslint-disable max-lines */ — it's a single flat sequence of Commander
      // .command() registrations by deliberate design (see that disable comment).
      'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      // Phase 4: every function over 20 lines (40 for config/builder functions is the stated
      // guideline, but 20 is what's enforced here — see docs/decisions/clean-code-audit-2026-07.md)
      // or over complexity 10 was extracted into guard-clause helpers, behavior-preserving.
      'max-lines-per-function': ['error', { max: 20, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 10],
    },
  },

  // test only: node:test's describe()/it() intentionally return an unawaited Promise —
  // the test runner schedules and awaits them internally, so this is the framework's
  // idiom, not a fire-and-forget bug. no-floating-promises has no way to recognize that,
  // so it is scoped off for the test tree only (all other type-aware rules above still apply).
  // `any` is also scoped off here: tests routinely construct deliberately malformed or
  // partial fixtures (e.g. `entries: [] as any[]`) to exercise runtime validation paths —
  // `unknown` would just force a repetitive cast back at each call site with no added safety.
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Ignore generated and non-source files (eslint.config.js is CJS, not linted as source)
  {
    ignores: [
      'dist-cli/**',
      'dist/**',
      'node_modules/**',
      'schema/**',
      'test-compiled/**',
      'test/*.js',
      'eslint.config.js',
    ],
  },
);
