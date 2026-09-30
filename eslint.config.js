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
        // Automatic tsconfig discovery (typescript-eslint v8+). Discovers tsconfig.json
        // and tsconfig.test.json via projectService so type-aware rules work on all files.
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // All `any` uses must be explicitly suppressed with @ts-expect-error — one site in
      // schema/emit.ts already has a suppression comment; all others are errors.
      '@typescript-eslint/no-explicit-any': 'error',
      // Every Promise must be awaited, returned, or handled — no silent fire-and-forget.
      // Commander .action(async cb) is handled internally by Commander; those are safe.
      '@typescript-eslint/no-floating-promises': 'error',
      // Ignore underscore-prefixed params, vars, and caught errors (_overwrite, _e, etc.)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Allow `require()` in the schema emitter, other build-time CJS files, and tests.
      // Note: verbatimModuleSyntax is deferred (ESM migration) so CJS require() stays.
      '@typescript-eslint/no-require-imports': 'off',
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
