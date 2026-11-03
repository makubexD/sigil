# Plan: Agent Skills conformance (ADR Phase 3, the install route)

Roadmap: [distribution-channels-2026-09.md](decisions/distribution-channels-2026-09.md) § 6, Phase 3: "checks built,
install route unproven". This plan proves `npx skills add … --skill <name>` and ships the tree it installs from.

## What is already done (not in this plan)

- `provider-limits` enforces `name` ≤ 64 and `description` ≤ 1024 chars through `AGENT_SKILLS_LIMITS`
  (`src/targets/agent-skills-limits.ts`) on every provider's skill spec, since `e5939bd` (2026-10-03).
- `name` equals the folder: `AGENTS_STANDARD_SKILL_SPEC.outputPath` (`src/targets/agents-standard/spec/skill.ts`)
  builds the path from `frontmatter.name`. The 500-line body limit is a warning on the same spec.
- Measured 2026-10-30: 0 mismatches across agents-standard (45 skills), Claude plugins (55), Copilot (45). Rebuilt
  2026-11-03: `build --target agents-standard` writes 45 `.agents/skills/<name>/SKILL.md`, the `references/` of `cli`,
  `feature` and `wizard`, a root `AGENTS.md`, and no `{sigil:` token.

## Sources (read 2026-11-03)

[`vercel-labs/skills`](https://github.com/vercel-labs/skills) README, `docs/commands.md`, `docs/creating-skills.md`:

- Source formats: `owner/repo` (default branch), a full GitHub URL, a `…/tree/<ref>/<path>` URL, any git URL, a local
  path. No `owner/repo#ref` form is documented.
- `-s, --skill <names…>` picks skills by `name`; `-l, --list` lists without installing; `-a <agent>` picks the agent;
  `-g` installs globally; `-y` skips prompts; `--copy` copies instead of symlinking.
- Discovery: a root `SKILL.md`, then container folders (`skills/`, `.agents/skills/`, `.claude/skills/` and about 40
  more), each walked three levels deep. Skills declared in `.claude-plugin/marketplace.json` or `plugin.json` are
  discovered too. **If no standard location holds a skill, it searches the whole repo recursively.** Two skills with one
  name: the first found is kept.

## Decisions (settled from the docs, per the decide-from-docs rule)

1. **Publish the agents-standard build, not the Claude marketplace tree.** `npx skills` would discover the `marketplace`
   branch through its `marketplace.json`, but those skills carry the Claude lexicon, and 8 names appear in two plugins
   each (`cs-generate-tests`, `ng-generate-component`, `ng-generate-tests`, `py-generate-tests`, `react-generate-tests`,
   `ts-document`, `ts-generate-tests`, `ts-release`; first one kept, so which copy installs is unspecified). The
   agents-standard skill is the open-standard rendering, with each skill's rules inlined.
2. **Location: an orphan `skills` branch**, holding the build's `.agents/` folder only (no `AGENTS.md`: `npx skills`
   installs skills, and repo-wide rules belong to `sigil add`). Same rules as the marketplace
   ([publish-claude-marketplace-2026-10](decisions/publish-claude-marketplace-2026-10.md)): published by `release.yml`
   with `GITHUB_TOKEN`, newest release only, a re-run is a no-op, each publish tagged `skills-v<version>`, branch and tag
   pushed atomically, a drift gate after every Release run. Rejected: `master` (catalog source, generated files in
   history, unreleased changes), adding `.agents/` to the `marketplace` branch (the CLI would see both the neutral and
   the Claude copies of each name).
3. **Install command**: `npx skills add https://github.com/makubexD/sigil/tree/skills --skill <name>`, if step 1 proves a
   tree URL at a branch root works. If it doesn't, the fallback is `…/tree/skills/.agents/skills` (a direct path, also
   documented); step 1 picks one and the docs use only that one.
4. **`npx skills add makubexD/sigil` on `master` is a known hazard**: no standard location holds a skill there, so the
   recursive search would find the 56 catalog-source `SKILL.md` files, with unexpanded `{sigil:…}` tokens. Step 1
   measures it. sigil can't block it without moving catalog source, so the setup page warns, and the README never shows
   the bare form.

## Step 1 `[inline: live probe, results need judgment]`: prove the route on today's trees

Run in a fresh `git init` repo in the scratchpad, never in this repo. Pin and record the CLI version
(`npx skills@<version>`, the newest at the time). Build first: `npm run build && node dist-cli/cli.js build --target
agents-standard --out-dir <scratch>/as`.

| Case | Command                                                                                          | Expected                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| P1   | `npx skills add <scratch>/as/agents-standard --list`                                             | 45 skills, each listed by its folder name; no warning                                       |
| P2   | `npx skills add <scratch>/as/agents-standard --skill ts-generate-tests -a claude-code -y --copy` | `.claude/skills/ts-generate-tests/SKILL.md` byte-equal to the built file                    |
| P3   | P2 with `--skill cli`                                                                            | `references/` installed too, 12 files, byte-equal                                           |
| P4   | P2 with `--skill ts-generate-tests --skill py-generate-tests`                                    | both installed, nothing else                                                                |
| P5   | P2 with `-a codex` (or the CLI's name for it)                                                    | `.agents/skills/ts-generate-tests/SKILL.md`                                                 |
| P6   | `npx skills add https://github.com/makubexD/sigil/tree/marketplace --list`                       | a tree URL at a branch root is accepted (lists the Claude skills); proves decision 3's form |
| P7   | `npx skills add makubexD/sigil --list`                                                           | records decision 4: does it list catalog source, and how many                               |
| P8   | P1 against `<scratch>/as/agents-standard/.agents/skills`                                         | the fallback path form works                                                                |

Record the results as a `### Phase 3 probes (2026-11-<dd>)` subsection of ADR § 6, one bold verdict per case, with the
CLI version. **Gate:** if P1-P4 fail on our output, stop: the gap is a conformance fix, which gets its own step here
before step 2. If P6 fails and P8 passes, decision 3 switches to the P8 form; write that into this plan before step 4.

Commit: `docs(adr): record the npx skills probes`.

## Step 2 `[worker:medium]`: drift check takes a target

Files: `scripts/check-marketplace-drift.cjs`, `package.json`, `test/scripts/check-marketplace-drift.test.ts`.

- Add `--target <claude|agents-standard>` (default `claude`, so the existing call is unchanged). A per-target table
  gives the build subfolder and what the fresh tree leaves out: `claude` → `<tmp>/claude`, nothing left out;
  `agents-standard` → `<tmp>/agents-standard` with the top-level `AGENTS.md` left out. Build with `--target <name>`.
- Messages name the target (`✓ agents-standard branch matches a fresh build (N files)`); update the header comment and
  usage text.
- `package.json`: add `"skills:check": "node scripts/check-marketplace-drift.cjs --target agents-standard"`.

Tests (add to the existing file; every existing case must still pass unchanged):

| Case                                                                  | Expected                                      |
| --------------------------------------------------------------------- | --------------------------------------------- |
| `--target agents-standard`, published = fresh build minus `AGENTS.md` | exit 0                                        |
| same, published also holds `AGENTS.md`                                | exit 1, `added   AGENTS.md`                   |
| same, one `SKILL.md` edited                                           | exit 1, `changed .agents/skills/<x>/SKILL.md` |
| `--target copilot`                                                    | exit 2, usage printed                         |
| `--target` with no value                                              | exit 2                                        |

Test command: `npm run build && npm run build:test && node --test test-compiled/scripts/check-marketplace-drift.test.js`.

## Step 3 `[worker:medium]`: one publish script for both branches

Files: `scripts/publish-branch.sh` (new), `.github/workflows/release.yml`, `test/workflows.test.ts`.

- Move the body of the `Publish to the marketplace branch` step into `scripts/publish-branch.sh <branch> <tag-prefix>
<source-dir>`, unchanged in behavior: newest-release check, existing-tag no-op, orphan branch on first publish, wipe
  all but `.git/`, copy `<source-dir>/.`, commit only on a change, tag `<tag-prefix>$GITHUB_REF_NAME`, `git push
--atomic`. Messages use `<branch>` where they said "marketplace". `set -euo pipefail`; exit 2 on a wrong argument
  count.
- The marketplace step becomes `bash scripts/publish-branch.sh marketplace marketplace- "$RUNNER_TEMP/mp/claude"`.

Tests in `test/workflows.test.ts`:

| Case                                                                                       | Expected |
| ------------------------------------------------------------------------------------------ | -------- |
| release.yml's `marketplace` job calls `scripts/publish-branch.sh marketplace marketplace-` | passes   |
| `publish-branch.sh` holds `git push --atomic` and the `versionsort` newest-tag check       | passes   |
| `bash scripts/publish-branch.sh` with no arguments                                         | exit 2   |

Test command: `npm run build && npm run build:test && node --test test-compiled/workflows.test.js && bash -n scripts/publish-branch.sh`.

## Step 4 `[worker:medium]`: publish the `skills` branch on release

Files: `.github/workflows/release.yml`, `test/workflows.test.ts`.

- New job `skills`, a copy of `marketplace`'s shape: `needs: gate`, `permissions: contents: write`, its own concurrency
  group `skills-publish` (`cancel-in-progress: false`), same pinned actions and Node 20. Steps: `npm ci`, `npm run
build`, `node dist-cli/cli.js build --target agents-standard --out-dir "$RUNNER_TEMP/sk"`, delete
  `"$RUNNER_TEMP/sk/agents-standard/AGENTS.md"`, then `bash scripts/publish-branch.sh skills skills-
"$RUNNER_TEMP/sk/agents-standard"`.
- A header comment like `marketplace`'s, naming the install command from decision 3 and this plan's ADR.

Tests: the job exists, needs only `gate`, has `contents: write`, calls `publish-branch.sh skills skills-`, and the
existing pinned-SHA test still passes.

Test command: `npm run build && npm run build:test && node --test test-compiled/workflows.test.js`.

## Step 5 `[worker:medium]`: drift gate for the `skills` branch

Files: `.github/workflows/marketplace-drift.yml`, `test/workflows.test.ts`.

- Turn the job into a matrix over `{ branch: marketplace, tag_prefix: marketplace-, target: claude }` and
  `{ branch: skills, tag_prefix: skills-, target: agents-standard }`, `fail-fast: false`. Every literal `marketplace`
  in the resolve step reads the matrix value; the compare step runs `node scripts/check-marketplace-drift.cjs --target
${{ matrix.target }} "$RUNNER_TEMP/branch"`. A missing branch stays a notice, not a failure.
- Amended during the step: the job runs the checked-out release tag's own script, and tags before this plan have no
  `--target`, so the matrix carries `target_args` (empty for `marketplace`, `--target agents-standard` for `skills`),
  passed through `env:`, never inlined into `run:`.
- Rename the workflow `Published branch drift`; keep the file name, so links still work. Update the header comment.

Tests: both matrix entries exist; the compare step passes `--target`; `on:` still lists `workflow_run` on `Release`.

Test command: `npm run build && npm run build:test && node --test test-compiled/workflows.test.js`.

## Step 6 `[inline: user-facing copy]`: document the route

Files: `docs/setup/skills-cli.md` (new), `README.md` (Quick Start `<details>` block), `docs/guides/consuming.md`,
`docs/index.md`, `CHANGELOG.md` (`[Unreleased]` → Added), ADR § 6 Phase 3 paragraph.

- Setup page, the shape of `docs/setup/codex.md`: the install command (decision 3), `--list`, `-a`, `-g`; what the
  skills carry (rules inlined) and what they don't (agents, hooks, MCP, settings, `AGENTS.md`: use `sigil add`); no
  manifest, so `sigil status` / `update` / `uninstall` don't see these installs (`npx skills update` / `remove` do);
  pinning with `…/tree/skills-v<version>`; the decision 4 warning against the bare `makubexD/sigil` form; the branch
  exists from the first release after this plan merges.
- README: one collapsible block in the per-tool list, fastest path first.

Test command: `npm run check` (format and doc-comment checks).

## Step 7 `[inline: release, needs the owner's GO]`: prove it live and close Phase 3

- Ask for the release GO (the global rules ask before a release). After the Release run: the `skills` job published
  `skills` and `skills-v<version>`; the drift workflow passes both matrix legs.
- Live run in a scratch repo: P6 with `…/tree/skills --list` (45 skills), then `--skill ts-generate-tests -a claude-code -y`
  byte-equal to a local build of the tag.
- ADR § 6: Phase 3 row and paragraph say **done <date>**, with the live result. Update the memory note that points at
  the next brief.

Commit trailers per step as the global rules say (`Plan-Step: docs/plan-agent-skills-conformance.md#<n>`).
