# Troubleshooting & FAQ

> **Back to:** [README](../../README.md) · [Documentation index](../index.md)

---

## `npm run build` runs out of memory (heap OOM)

`npm run build` already sets `NODE_OPTIONS=--max-old-space-size=8192` via `cross-env`. If you
invoke `tsc` directly (e.g. in `build:watch`), prefix it yourself:

```bash
NODE_OPTIONS=--max-old-space-size=8192 tsc -p tsconfig.build.json --watch
```

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

## Tests fail after editing a test file

`npm test` builds everything. Its `pretest` script runs `npm run build` and compiles `test/` into
`test-compiled/` (`tsc -p tsconfig.test.json`). Run:

```bash
npm test
```

---

## `sigil release` fails at the verify gate

The gate runs `npm run build`, `npm run validate`, `npm test`, and `npm run catalog:build`, unless
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
