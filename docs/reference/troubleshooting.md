# Troubleshooting & FAQ

> **Back to:** [README](../../README.md) · [Documentation index](../index.md)

---

## `tsc` runs out of memory (heap OOM)

`npm run build` and `npm run build:watch` already set `NODE_OPTIONS=--max-old-space-size=8192` through
`cross-env`, so use them. The error only appears when you call `tsc` yourself. Pick the form for your shell:

```powershell
# PowerShell
$env:NODE_OPTIONS = "--max-old-space-size=8192"; npx tsc -p tsconfig.build.json
```

```bash
# any shell
npx cross-env NODE_OPTIONS=--max-old-space-size=8192 tsc -p tsconfig.build.json
```

More on building: [operations.md](../guides/operations.md#build-and-link).

---

## `npm run sigil --help` shows npm's help, not sigil's

Without `--`, npm keeps flags such as `--help` for itself. Put `--` before sigil's own arguments:

```bash
npm run sigil -- --help
npm run sigil -- add --help
```

Arguments that are not flags, such as `npm run sigil help` or `npm run sigil list`, pass through
either way. `npm link` removes the issue: then it is simply `sigil --help`.

---

## `sigil help` or `npm run sigil help` printed nothing (Windows)

Earlier builds exited the process straight after writing the help, and a Windows console could lose
the output. Rebuild (`npm run build`). Help, version, and usage errors now return normally, so Node
flushes the output before it exits. If it still prints nothing, run
`node dist-cli/cli.js --help` and report the console you used.

---

## The menu says my folder is the home folder or a sigil catalog checkout

That is the menu protecting you: installs go into the folder you run sigil from, so installing from
your home folder affects every project, and installing from a sigil checkout writes into sigil
itself. Choose **Work in a different folder** and type the path to your project, or `cd` there and run
`sigil` again.

---

## `sigil update` says "already up-to-date" but a file is gone

`update` refreshes files that still exist. It does not recreate a whole-file artifact you deleted.
`sigil status` prints the command that does, for example
`sigil add rule:shared/git --target claude --yes`, and the guided menu has a **Restore deleted
files** entry that does it for every missing artifact. Config artifacts (hook, settings, MCP) are
different: `sigil update <id>` re-merges a missing fragment.

---

## `sigil uninstall` or `sigil init` stops with a message outside a terminal

With no terminal there is nobody to ask, so these need their arguments: `sigil uninstall <id>...`
(`sigil status` lists the ids) and `sigil init --target claude` (or `copilot`). In a terminal the
same commands ask instead. See [consuming.md](../guides/consuming.md#guided-commands).

---

## `sigil add` with no selector outside a TTY

`add` does not hang. With no selector and stdin/stdout not a TTY, it throws and exits non-zero
(`src/commands/add/resolve-inputs.ts`):

```text
✗ No selectors provided and stdin/stdout is not an interactive terminal.
  Provide at least one selector (e.g. `add all` or `add skill:csharp/cs-generate-tests`)
  or use --yes to confirm non-interactive mode.
```

Pass a selector and `--yes`:

```bash
sigil add all --yes
sigil add skill:csharp/cs-generate-tests --yes
```

---

## `sigil add` skips files or refuses to overwrite

Two different cases:

**Already installed and unchanged.** Re-running `add` for an artifact whose manifest hashes still
match prints a skip line from `src/commands/add/plan-ids.ts` and then, when nothing remains to
write, `No artifacts to install` from `src/commands/add/index.ts`. It does not print the conflict
summary:

```text
  =  csharp/cs-generate-tests  (✓ already up to date — skipped)
No artifacts to install (all were filtered out or unsupported).
```

**A file is already on disk and is not an up-to-date sigil install.** Those paths are conflicts.
Without `--overwrite` they are not written. Dry-run (`src/commands/add/render.ts`), with only the
skill file pre-existing:

```text
Dry run — files that would be written:
  + .claude/rules/csharp-cs-testing.md
  + .claude/agents/cs-code-reviewer.md
  ~ .claude/skills/cs-generate-tests/SKILL.md  (exists — would be overwritten with --overwrite)

2 new, 1 conflict(s). No files were written.
```

A real install still writes the non-conflicting files and prints, via `printConflictAdvice`
(`src/wizard/command-strings.ts`, clack's `▲` warning):

```text
▲  1 file(s) already exist and were NOT overwritten:
     .claude/skills/cs-generate-tests/SKILL.md
   Re-run with --overwrite to replace them, or use --dry-run to preview first.
```

```bash
sigil add skill:csharp/cs-generate-tests --dry-run --yes
sigil add skill:csharp/cs-generate-tests --overwrite --yes
```

---

## `sigil validate` / `sigil check` report violations

`sigil validate` prints `✗ <n> error(s) found.` and one `✗  [<id>] <problem>` line per error.
`sigil check <file>` prints the per-file problem text. The strings below are what the code emits
(`src/validate/schema-checks.ts`, `src/authoring/check-source.ts`,
`src/authoring/check-source-conventions.ts`).

| What you see                                                                                                                                             | Command    | Fix                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `Schema: title — Required` (missing key) or `Schema: title — title is required` (empty string)                                                           | both       | Add a non-empty `title:`                                                  |
| `id prefix '<id>' doesn't match path inferred prefix '<path>' — keep id and file path in sync`                                                           | `check`    | Make `id:` `<language>/<name>` or `shared/<name>` and match the directory |
| `name '<name>' must match the id name segment '<segment>'`                                                                                               | `check`    | On a skill or agent, `name` is the id's last segment                      |
| `platforms: '<name>' is not a registered target. Known targets: claude, copilot`                                                                         | `check`    | Use only registered target names                                          |
| `Dangling uses.rules reference: '<id>' does not exist in the catalog`                                                                                    | `validate` | The id must be an existing rule                                           |
| `uses.rules: '<id>' does not exist in the catalog`                                                                                                       | `check`    | Same check, check's wording                                               |
| `Dependency coverage drift: rule '<id>' is restricted to [<platforms>] but this skill targets [<platforms>] — '<id>' won't be available on: <platforms>` | `check`    | Widen the dep's `platforms:` or narrow the skill's                        |

For a full description of each schema field → [spec.md](spec.md).

---

## Config-kind installs (`mcp` / `hook` / `settings`)

These merge into JSON. They do not write a standalone markdown file.

| What you see                                                                  | Meaning                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `✗ Cannot install '<id>': <path> exists but is not valid JSON. Fix it first.` | `sigil add` refused to merge because the destination file does not parse (`src/commands/add/execute-config.ts`)                                              |
| `✗  <id>: <file> exists but is not valid JSON. Skipped.`                      | `sigil update` skipped that fragment for the same reason (`src/commands/update-config-io.ts`)                                                                |
| `⊘ <file>  (sigil's values were changed — would skip without --force)`        | An `object-spread` value sigil wrote was edited. `sigil update --force` overwrites it. Array fragments (`array-union`, `array-append`) do not take this path |
| `⚠  Existing backup kept → <path>.sigil.bak  (compare before committing)`     | A home-scoped file (`~/.claude.json`, the VS Code user `mcp.json`) already has its one pristine backup                                                       |
| `⚠  Backup saved → <path>.sigil.bak`                                          | First write to that home-scoped file                                                                                                                         |

`--scope` is `project` (default), `local`, or `user`. See [config-kinds.md](config-kinds.md).

---

## Tests fail or pass against stale code when run with `node --test`

Compiled tests import from `dist-cli/`, not `src/`. If you run `node --test test-compiled/<file>.test.js`
after editing `src/` or a test without rebuilding, you test the old compiled output: a fixed bug still
fails, or a new test file is missing from `test-compiled/`. `npm test` avoids this because its `pretest`
step rebuilds both ([why](../guides/operations.md#tests-and-pretest)). To run one file, rebuild first:

```bash
npm run build && npm run build:test && node --test test-compiled/<path>.test.js
```

---

## `sigil release` fails at the verify gate

The gate runs `npm run build`, `npm run validate`, `npm test`, and `npm run catalog:build` (narrower than CI; see [operations.md](../guides/operations.md#release-a-new-version-sigil-release)), unless
you passed `--no-verify` (that flag skips the gate entirely; it does not skip the version write or
the commit). If any step fails, the version bump is already written but **not committed** — fix the
failing step, then either:

- Re-run `sigil release <explicit-version>` (use an explicit `x.y.z` to avoid double-bumping), or
- Restore and start fresh:

```bash
git checkout package.json package-lock.json
# fix the root cause, then re-run
sigil release patch
```
