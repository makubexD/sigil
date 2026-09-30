---
id: shared/cli-rules
kind: rule
title: CLI Rules (Small-Language Grammar)
description: >-
  Everyday rules for any change to a command-line interface — grammar, positionals, help,
  stdout/stderr split, error format, exit codes, color and prompts, compatibility, and tests.
  The condensed, path-scoped form of the shared/cli skill.
appliesTo:
  - "**/cli/**/*.ts"
  - "**/cli/**/*.js"
  - "**/cli/**/*.mjs"
  - "**/cli/**/*.py"
  - "**/cli/**/*.go"
  - "**/cli/**/*.rs"
  - "**/cli/**/*.cs"
  - "**/cli.ts"
  - "**/cli.js"
  - "**/cli.mjs"
  - "**/cli.py"
  - "**/cli.go"
  - "**/cli.rs"
  - "**/cli.cs"
  - "**/commands/**/*.ts"
  - "**/commands/**/*.js"
  - "**/commands/**/*.mjs"
  - "**/commands/**/*.py"
  - "**/commands/**/*.go"
  - "**/commands/**/*.rs"
  - "**/commands/**/*.cs"
  - "**/cmd/**/*.go"
  - "**/bin/*"
appliesToRationale: >-
  Scoped to source files where CLI entry points and command modules conventionally live, one
  glob per source extension (Copilot joins applyTo globs with commas, so brace sets can't be
  used). Extension-scoped so it doesn't load for the cli skill's own markdown, .NET bin/ build
  output, or node_modules; bin/* keeps only top-level launcher scripts. Generic defaults: narrow
  them to the project's entry point and command-registration files after install.
tags:
  - cli
  - shared
---


This project's command-line interface is a public, small language. Apply these rules to any
change in command registration, arguments, options, help, output, or errors.

- **Grammar:** `app <noun> <verb> [<object>] [--modifier value]`. One verb vocabulary
  (`list`, `get`, `create`, `update`, `delete`, plus domain verbs), one spelling per
  operation, nouns all singular or all plural. No operation spelled as a flag.
- **Positionals** are identities only; every other input is a long option. Never a boolean
  positional. Short aliases only for common interactive flags, one meaning tree-wide.
- **Help** is generated from the same declarations the parser uses, at every level, shows
  defaults, and never has side effects.
- **stdout is the payload** only. Errors, warnings, progress, and prompts go to stderr.
  `--format json` prints one valid JSON document and nothing else.
- **Errors** start with `error:`, name the bad input, suggest the fix when there is one.
- **Exit codes:** 0 success, 1 failure or a declined prompt, 2 usage error (including a
  missing `--yes` when there is no terminal to prompt), 130 interrupted (unless this project
  documents a different contract; then keep that one).
- **Color**, decided per stream, first match wins: a `--color`/`--no-color` flag; then
  `FORCE_COLOR` (`0`/`false` off, anything else on); then a non-empty `NO_COLOR` (off); then
  `TERM=dumb` (off); otherwise on only when that stream is a terminal.
- **Prompts** only on a terminal; destructive commands take `--yes`, and changes to shared
  state offer `--dry-run`.
- **Compatibility:** before changing a command or option, search the repository for callers
  and update them in the same change. Keep old syntax with
  `warning: '<old>' is deprecated and will be removed. Use '<new>'.` on stderr unless the
  user approved a hard break.
- **Tests** run the real entry point and cover help, exit codes, the stdout/stderr split,
  and each deprecation path.

For design, audits, and refactors, use the `cli` skill. The path globs that load this rule are
generic defaults; narrow them to this project's layout.
