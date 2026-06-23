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

  // Project-specific overrides
  {
    files: ['src/**/*.ts'],
    rules: {
      // Warn rather than error on `any` — the codebase uses it in a few places for flexibility
      '@typescript-eslint/no-explicit-any': 'warn',
      // preserve-caught-error (ESLint 10 built-in) requires Error({ cause: err }) but
      // our TypeScript target is ES2020; ES2022.error is not yet in the lib config.
      // Defer until the lib target is updated to include ES2022.error.
      'preserve-caught-error': 'off',
      // Ignore underscore-prefixed params, vars, and caught errors (_overwrite, _e, etc.)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Allow `require()` in the schema emitter and other build-time CJS files
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Ignore generated and non-source files
  {
    ignores: ['dist-cli/**', 'dist/**', 'node_modules/**', 'schema/**', 'test/*.js'],
  },
);
