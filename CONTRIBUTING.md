# Contributing to Sigil

Thanks for helping. There are two ways to contribute:

- **[A. Contributing an artifact](#a-contributing-an-artifact)** — add or improve a skill, agent, rule,
  prompt, or other catalog item. No TypeScript needed.
- **[B. Contributing code](#b-contributing-code)** — change the `sigil` CLI, the build pipeline, or the tests.

Not sure where to start? Open an issue or discussion and describe what you want; we will point you
to the right place.

---

# A. Contributing an artifact

This part is for catalog authors. The lifecycle is: scaffold, fill, validate, build, submit a PR.
You need a clone with the CLI built — see [Build and link](docs/guides/operations.md#build-and-link).

### No code? Suggest an artifact

You can contribute an idea without writing the artifact. Open an issue or discussion that says what
the artifact does, which AI tool it is for (Claude Code, GitHub Copilot, or both), and the language
or stack (or "shared"). A guided issue form is planned:
[docs/ideas/artifact-proposal-issue-form.md](docs/ideas/artifact-proposal-issue-form.md).

If you cloned the repo, `sigil new` runs a wizard that scaffolds the file for you (step 3 below).
`sigil import <dir> --language <lang>` converts an existing Claude-style template folder into
catalog artifacts; it reads Claude-style folders only and needs `--language <lang>` or `--shared`. See
[authoring.md](docs/guides/authoring.md#import-an-existing-portable-template-directory).

---

## 1. Pick the kind

Skill, agent, rule, prompt, workflow, mcp, hook, settings, or template. The full table of kinds, what
each is for, and their frontmatter is in [docs/reference/spec.md](docs/reference/spec.md). If unsure,
use a **skill**; it is the most flexible. `template` is catalog structure, not something `sigil add`
installs.

---

## 2. Understand platform targeting (the DRY rule)

By default, every artifact propagates to **all AIs that support its kind**. The registered targets
are Claude Code and GitHub Copilot. Which kinds each target delivers is the generated matrix in
[docs/reference/capabilities.md](docs/reference/capabilities.md); do not assume both support every kind.

Restrict an artifact when you create it, or change it later:

```bash
sigil new skill --name ef-core --language csharp --platforms claude --yes

sigil retarget csharp/ef-core --add copilot    # widen to both
sigil retarget csharp/ef-core --remove claude  # restrict back
sigil retarget csharp/ef-core --to all         # reset to the DRY default
```

---

## 3. Scaffold the file

Interactive wizard:

```bash
sigil new
```

Or scripted (non-interactive):

```bash
sigil new skill --name ef-core-migrations --language csharp --yes   # language-specific skill (most common)
sigil new agent --name sql-reviewer --yes                           # shared agent
sigil new prompt --name explain-diff --platforms claude --yes       # Claude-only prompt
```

This creates a file under `catalog/` with a schema-derived frontmatter header and a placeholder body.
For end-to-end walkthroughs (new skill, new rule, new language) see
[docs/guides/authoring.md](docs/guides/authoring.md).

---

## 4. Fill in the body

Fill in the title, description, and body.

**The most important rule: write the body once, in neutral language.** Never add "For Claude only:"
or "For Copilot:" sections; that defeats the DRY design. The adapters translate format and
vocabulary. (Bodies use `{sigil:<term>}` tokens for provider-specific words; see
[authoring.md](docs/guides/authoring.md#provider-neutral-bodies-sigilterm).)

Suggested body shape:

- **Skill:** what it covers (one sentence), when to invoke it, then ordered steps or patterns.
- **Rule:** bullets of the form `- **Convention name.** Explanation. Example if helpful.`
- **Agent:** persona (who you are, what you know), when to be invoked, behaviour rules and constraints.
- **Prompt:** the instruction text, with `{{placeholder}}` for arguments, such as
  `Explain the following diff, focusing on {{aspect}}:`.

Reuse instead of copying: a rule `extends:` another rule, and a skill `uses:` rules and agents. Never
paste their text. How `extends` and `uses` resolve is specified in
[docs/reference/spec.md](docs/reference/spec.md).

---

## 5. Validate

```bash
sigil check catalog/languages/csharp/skills/ef-core-migrations/SKILL.md   # one file
npm run validate                                                           # whole catalog (CI gate)
```

Fix every violation before continuing. Common ones, with fixes:
[troubleshooting](docs/reference/troubleshooting.md#sigil-validate--sigil-check-report-violations).

---

## 6. Build and inspect output

```bash
npm run catalog:build
```

Inspect `dist/claude/` (Claude Code plugin layout) and `dist/copilot/` (GitHub Copilot layout).

---

## 7. Submit a pull request

Branch name: `artifact/<kind>-<name>`, for example `artifact/skill-ef-core-migrations`,
`artifact/agent-sql-reviewer`, `artifact/rule-csharp-async-patterns`.

**Include** the new catalog source file(s) under `catalog/`. **Do not include** `dist/` or `dist-cli/`
(both are gitignored build output).

Fill in the artifact checklist in [the PR template](.github/PULL_REQUEST_TEMPLATE.md). Reviewers check:

- `sigil check <file>` reports 0 violations and `npm run validate` reports 0 errors
- The body is neutral language with no AI-specific sections
- `platforms:` is intentional (omit for the DRY default, or justify the restriction)
- The `id` matches the path convention (`<language>/<name>` or `shared/<name>`)
- `extends:` / `uses:` are used rather than copied content

---

# B. Contributing code

## Set up

Follow [Build and link](docs/guides/operations.md#build-and-link): Node `>=20.19.0`, clone,
`npm install`, `npm run build`. That page also covers the three ways to run the CLI and the Windows notes.

## Dev loop

1. Edit `src/`.
2. `npm run build:watch` in one terminal keeps `dist-cli/` current (or re-run `npm run build`).
3. Try your change with `node dist-cli/cli.js <args>` (or a linked `sigil`).
4. Run the relevant tests (below), then `npm run ci:local` before you push.

## Code invariants and architecture

[CLAUDE.md](CLAUDE.md) is written for AI coding agents, but it is also the authoritative list of
invariants the code must keep (path anchoring, the platform-neutral pipeline, what may write files, and
so on). Read its **Invariants** section before changing `src/`. For how the pieces fit, and how to add a
platform target, see [docs/reference/architecture.md](docs/reference/architecture.md).

## Testing

- **Layout:** tests live in `test/`, grouped by area (`test/commands/`, `test/targets/`,
  `test/validate/`, and so on), plus some top-level files such as `test/cli-help-accuracy.test.ts`.
  Name files `*.test.ts`.
- **Style:** `node:test` with `node:assert/strict`. There is no Jest or Vitest.
- **Compiled, not run from source:** `npm run build:test` compiles `test/` to `test-compiled/`, and the
  compiled tests import from `../dist-cli/...`, never from `src/`. So rebuild after changing `src/`.
  `npm test` does both for you through `pretest` ([explained here](docs/guides/operations.md#tests-and-pretest)).
- **Helpers** in `test/helpers/` (import them instead of re-declaring):
  - `temp-dir.ts`: `makeTempDir`, `withTempDir`, `withTempDirAsync` (temp dir removed afterwards)
  - `fixtures.ts`: in-memory `makeRule`, `makeAgent`, `makeSkill`, `makeCatalog`, `buildFakeCatalog`
  - `catalog.ts`: `loadResolvedCatalog` (memoized real catalog, read-only), `CATALOG_DIR`, `clearCatalogCache`
  - `clack-mock.ts`: `mockClack(queue)` answers wizard prompts from a queue and returns `restore()`
  - `config.ts`: `makeConfigOp`; `ansi.ts`: `stripAnsi`

**Run everything** (with coverage, which `npm test` prints via `--experimental-test-coverage`; CI sets
`SIGIL_TEST_COVERAGE=0` because it instruments every test process and nothing enforces a threshold):

```bash
npm test
```

**Run one file** (rebuild first, otherwise you test stale output; skip the build step only if
`dist-cli/` and `test-compiled/` are already current):

```bash
npm run build && npm run build:test && node --test test-compiled/cli-help-accuracy.test.js
```

**Run one test by name** (matches test or suite names):

```bash
node --test --test-name-pattern "help" test-compiled/cli-help-accuracy.test.js
```

**Debug:** attach an inspector with `node --inspect-brk --test test-compiled/<path>.test.js`. Compiled
tests are emitted with `sourceMap: false` (`tsconfig.test.json`), so the debugger shows the compiled
JavaScript in `test-compiled/`, not your TypeScript. Set breakpoints there. Stack traces from
`dist-cli/` are compiled code too.

**Output snapshot:** `test/targets/output-snapshot.test.ts` hashes every file that `build` and `add` write
for the bundled catalog and compares the hashes with `test/fixtures/output-snapshot/`. A refactor must
leave it green. When you change emitted content on purpose, run `npm run snapshot:update`, check that
only the files you meant to change moved (`git diff test/fixtures/output-snapshot/`), and commit the
new baseline with the change.

**Existing installs:** `test/fixtures/installs/master-8882c86/` is a project an older sigil set up, and
`test/commands/install-migration.test.ts` checks that `status`, `update` and `prune` still treat it
correctly. Never regenerate that fixture: it stands for what users already have on disk.
`test/wizard/real-packs-smoke.test.ts` installs every pack in `packs.yaml` through the wizard for both
tools, so a new or changed pack is covered automatically.

## Before you push

```bash
npm run ci:local
```

This runs every CI step in order (audit, lint, format check, build, validate, `sync --check`, tests,
catalog build, CLI smoke test). `npm run check` is a faster subset that skips several of them and is
not enough on its own. The CI step list is in [operations.md](docs/guides/operations.md#ci).

## Changelog and docs

- Add an entry under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), in the matching
  [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) subsection (`### Added`, `### Changed`,
  `### Fixed`, ...).
- Update the docs in the same PR when behavior changes. Flag and option reference
  (`docs/reference/cli-flags.md`) and `docs/reference/capabilities.md` are generated or guarded by
  tests, so rebuild and commit them. If you change a zod schema, `npm run build` regenerates
  `schema/*.schema.json`; commit both.

Then open the PR and fill in the **code** checklist in [the PR template](.github/PULL_REQUEST_TEMPLATE.md).

---

## Reference

- Authoring recipes (new skill / rule / language): [docs/guides/authoring.md](docs/guides/authoring.md)
- Frontmatter schema and kinds: [docs/reference/spec.md](docs/reference/spec.md)
- Build, CI, release: [docs/guides/operations.md](docs/guides/operations.md)
- Errors and FAQ: [docs/reference/troubleshooting.md](docs/reference/troubleshooting.md)
- Interactive authoring prompt: install `shared/author-artifact`, then invoke it in your AI tool
