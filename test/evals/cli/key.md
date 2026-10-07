# Answer key

Grade each run against this file. Graders read the run's output and any files it wrote.
A class is right if it matches or is the next class up/down with a stated reason.

## S1 audit: seeded defects in fixture/shipit.mjs

| id  | defect                                                                                                                 | expected class                                    | evidence                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| D1  | Operations spelled as flags: `--users --list`                                                                          | BREAKING (or CONSISTENCY)                         | shipit.mjs dispatch, README                     |
| D2  | Same operation, several spellings: `users show-all`, bare `users`, `--users --list`; `releases` lists with a bare noun | CONSISTENCY                                       | dispatch, help()                                |
| D3  | `deploy` is a top-level verb while other ops are noun groups; no `release` group                                       | CONSISTENCY or UX                                 | dispatch                                        |
| D4  | Positional pile `deploy <env> <service> <version> <force>`, boolean as positional `true`                               | BREAKING (callers: ci.sh, README)                 | deploy(), ci.sh, README                         |
| D5  | Errors written to stdout                                                                                               | UX or COMPATIBILITY                               | `console.log(red('error...'))`, unknown command |
| D6  | Exit status 0 on errors (unknown command, missing arguments)                                                           | COMPATIBILITY (ci.sh `set -e` can't see failures) | dispatch last line, deploy()                    |
| D7  | No help below top level: `users --help` lists users; no `help <cmd>`; no defaults shown                                | UX                                                | dispatch                                        |
| D8  | `--format json` output preceded by "Fetching users..." on stdout: invalid JSON                                         | COMPATIBILITY (ci.sh writes users.json)           | listUsers(), ci.sh                              |
| D9  | ANSI color always on; ignores TTY and NO_COLOR                                                                         | UX                                                | red/green helpers                               |
| D10 | `-f` means `--format` in users but force in deploy                                                                     | CONSISTENCY                                       | valueOf('-f'), has('-f')                        |
| D11 | Destructive `users remove` always prompts, even when stdin is not a terminal; no `--yes`                               | UX                                                | removeUser()                                    |
| D12 | Unknown options silently ignored; no `--version`; no `--opt=value` or `--` support                                     | UX                                                | valueOf/has                                     |

Pass: >= 10 of 12 found with evidence; ci.sh and README named as callers for D4/D8 (or any
syntax change); an approval block that holds BREAKING/COMPATIBILITY; no files edited.

## S2 design (new `notes` CLI)

Pass all:

- noun-verb groups (`notes note add`, or top-level verbs for the primary workflow, justified);
  no operation spelled as a flag; one spelling per operation; no positional pile.
- `--format json` (or equivalent) with stdout payload, stderr diagnostics.
- exit codes: 0 success, 1 failure, 2 usage error (130 on interrupt is a bonus).
- destructive ops take `--yes`/`--force` and never prompt off a terminal; `--dry-run` for sync.
- progressive help at each level; `help <cmd>` or `<cmd> --help`.
- no code written.

## S3 refactor (shipit, all findings pre-approved)

Pass all:

- characterization tests for the current surface written and run BEFORE the first edit.
- old syntax kept with `warning: '<old>' is deprecated and will be removed. Use '<new>'.` on stderr
  (lowercase since the Phase 5 review; the GREEN run used the earlier `Warning:` wording).
- ci.sh and README migrated to the new syntax.
- errors on stderr, exits 0/1/2, JSON valid on stdout, color off when not a TTY or NO_COLOR.
- tests pass at the end (run output shown).

## S4 build (new `todo` CLI, Node, zero deps)

Pass all:

- one declaration per command drives parsing AND help (no hand-written help list).
- `--help` at every level; unknown command/option exits 2 with a suggestion when close.
- stdout/stderr split; `--format json`; NO_COLOR honoured.
- tests spawn the real entry point and check help, exit codes and streams.

## S5 stack question (Python click)

Pass all:

- click specifics: `UsageError`/bad parameters exit 2, `ClickException` exits 1,
  `click.echo(..., err=True)` for stderr, `CliRunner` for tests (and its stderr handling).
- links an official click doc; no invented API.

## S7 narrow change (shipit: rename `users show-all` to `users list`)

Pass all:

- before editing, states the delta's class (BREAKING: external callers can't be checked),
  its in-repo callers (scripts/ci.sh:3), and the impact; no full audit of unrelated commands.
- a contract test for the new spelling is written and seen failing before the edit.
- `users show-all` still works, same stdout, with the lowercase deprecation line on stderr.
- ci.sh migrated; finishes with a command reference.

## S6 adopt (retired)

Retired 2026-10-07: the catalog skill has no adopt mode. The rules ship as the `shared/cli-rules`
catalog rule, installed by `sigil add`.
