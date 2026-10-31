# Plan: Copilot plugin channel, Phase 2 (agent layout)

Roadmap: [plan-copilot-plugin-channel.md](plan-copilot-plugin-channel.md#phase-2-scope). Record:
[copilot-plugin-channel-2026-10](decisions/copilot-plugin-channel-2026-10.md). Written 2026-10-30
against `6442133`. Branch: `feat/copilot-build-agents`, one PR. This plan's commit opens the branch.

Goal: `sigil build --target copilot` writes `.github/agents/<name>.agent.md`, the same files `add`
writes, so the two commands stop disagreeing. Route A adds no emitter; this only moves `build` onto
the spec `add` already uses.

## Decision: drop `.github/AGENTS.md`

**The owner confirmed this on 2026-10-30: `build` stops writing it.** Steps 3 and 4 carry it out.

The roadmap's reason needs correcting. It said a project that commits the file "may pay for it on
every request". The docs read today say otherwise, and the case for dropping is stronger for it:

- **It is a nested file, so it usually never loads.** Copilot CLI finds `AGENTS.md` at the repo root,
  the working directory, the directories between them, and directories on the path of a file it is
  working on ([CLI instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)).
  VS Code's Copilot sessions match, and its Local harness needs an experimental setting that is off by
  default ([VS Code instructions](https://code.visualstudio.com/docs/agent-customization/custom-instructions)).
  Neither page mentions `.github/AGENTS.md`. Not tested on a live client.
- **When it does load, it costs 195 KB.** By those rules, that's when Copilot works on a file under
  `.github/`, such as a workflow, and the content has nothing to do with that work.
- **It carries no tool limits.** All 39 agents declare `tools`; the aggregate drops them. The per-file
  agents keep them.
- **Its own header is wrong.** It says to invoke agents by `@name`, but custom agents come from
  `.github/agents/*.agent.md`, not this file.
- **Little depends on it.** `dist/` isn't in the npm package (`package.json` `files`) and no workflow
  reads `dist/copilot`. Only someone who copied the file by hand has it, and `CHANGELOG.md` tells them
  to delete it.

## Measured before planning

A read-only probe against `dist-cli` at `6442133` rendered every agent through `COPILOT_AGENT_SPEC`
with `build`'s context, and compared the result with a real `sigil add` of everything Copilot installs:

| Check                                      | Result                                                 |
| ------------------------------------------ | ------------------------------------------------------ |
| Agents in the catalog / shipped to Copilot | 39 / 39, none `platforms`-restricted                   |
| Render failures                            | 0                                                      |
| Output contract violations                 | 0                                                      |
| Duplicate names                            | 0                                                      |
| Size                                       | 197 KB in 39 files, largest 9,234 chars (limit 30,000) |
| Byte differences from `add`                | **0 of 39**                                            |

**The one expected difference:** an install smaller than the whole catalog gets a narrower Boundary
section, by design. `build` treats everything as co-installed, and `add` lists only what's installed.
So files match for a shared install set, as the roadmap's success line asks, and step 6 says so.

**`provider-kind-coverage` proves nothing here.** It passes today, because `COPILOT_AGENT_SPEC` already
exists. Cases 1 and 2 in step 1 are the real guard.

## Steps

Run one file with `npm run build && npm run build:test && node --test test-compiled/targets/<file>.js`
(written below as `TEST <file>`). The suite stays red on the output snapshot from step 2 until step 5,
so each step runs only the files it names, and the full suite runs in step 8.

### 1. RED tests `[worker:medium]`

**File:** `test/targets/copilot.test.ts`. Replace `emits AGENTS.md with all agents` (`:165`) with the
cases below, in a new `describe('full build agents')`. Use the bundled catalog through the file's
existing `loadBundledCatalog` / `resolveCatalog`. Derive the agent list from the catalog; never
hard-code 39.

| #   | Case                                                                                                                                                                            | Expected after step 3 | Today                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------- |
| 1   | `compile` writes exactly one `.github/agents/<name>.agent.md` per `kind === 'agent'` artifact: the set of paths under `.github/agents/` equals the set derived from the catalog | pass                  | fails: no such paths        |
| 2   | Each of those files equals `target.scaffold(id, resolved, { coInstallSet: <every artifact id>, includeDeps: false })` at the same path, compared with `assert.equal`            | pass                  | fails: file undefined       |
| 3   | `'.github/AGENTS.md' in files` is false                                                                                                                                         | pass                  | fails: file is written      |
| 4   | For every agent, the built file's frontmatter has the line `tools: ${JSON.stringify(frontmatter.tools)}`, so a read-only agent stays read-only                                  | pass                  | fails: file undefined       |
| 5   | `checkOutputContract(files, target.outputContracts ?? [])` returns `[]` for the whole `compile` output                                                                          | pass                  | passes; guards the change   |
| 6   | Each built agent body contains no `{sigil:` token                                                                                                                               | pass                  | fails on `undefined` access |

Case 6 must assert each file exists before reading it, so it fails with a clear message today.

**Test:** `TEST copilot.test`. Cases 1, 2, 3, 4 and 6 fail for the reasons above; case 5 and every other
test in the file pass. Check the failure reasons before accepting.

### 2. Build writes per-file agents `[worker:medium]`

**Files:** `src/targets/copilot/target-helpers.ts`, `src/targets/copilot/spec/agent.ts`.

- `target-helpers.ts:140`: add `'agent'` to `COMPILED_FILE_KINDS`.
- `:138-139`: replace both comment lines with `/** The per-file kinds `compile` writes. */`. The
  `Globs that mean` line is an orphan left by an earlier move.
- `:150-151`: end the doc comment with "`ctx` co-installs the whole catalog, so every Boundary section
  resolves." and add agents to the list of what it writes.
- `spec/agent.ts:1-6`: replace the header with: the Copilot `agent` spec, the per-file
  `.github/agents/<name>.agent.md` that `build` and `add` both write. Frontmatter is `name`,
  `description` and `tools`. This also fixes the stale "`name` + `description` only".

**Test:** `TEST copilot.test`. Cases 1, 2, 4, 5 and 6 pass; case 3 still fails.

### 3. Drop the aggregate `[worker:medium]`

**Files:** `src/targets/copilot/index.ts`, `src/targets/copilot/build-helpers.ts`.

- `index.ts`: delete the `AGENTS.md` block in `compile` (`:121-125`) and the `buildAgentsMd` import
  (`:46`). In the header, replace `AGENTS.md` (`:11`) with `agents/<name>.agent.md`, and change the
  `build-helpers` line (`:22`) to name only `buildCopilotInstructions`, with "the aggregate".
- `build-helpers.ts`: delete `renderAgentSection` and `buildAgentsMd`, then the imports that leaves
  unused (`ResolvedCatalog`, `renderBoundarySection`, `applyLexicon`). Keep `COPILOT_LEXICON` and
  `renderRulesDocument`.
- `build-helpers.ts:1-6`: the file header now names the one aggregate.
- `build-helpers.ts:18-20`: drop "Same reasoning as renderAgentSection above"; say this bypasses
  `renderArtifact`, so it passes the lexicon itself.

**Test:** `TEST copilot.test`: every case passes. `npx tsc --noEmit -p .` and `npm run lint` are clean.

### 4. Remove the aggregate's citations `[worker:medium]`

**Files:** `src/targets/copilot/aggregate-docs.ts`, `src/targets/doc-refs.ts`,
`test/targets/doc-refs.test.ts`.

- `aggregate-docs.ts`: delete the three `copilot AGENTS.md aggregate` rows, the two imports that leaves
  unused (`VSCODE_INSTRUCTIONS_DOC`, `AGENTS_MD_STANDARD_DOC`), and `AGENTS.md` and its parenthesis from
  the header. Keep `COPILOT_INSTRUCTIONS_DOC`. `VSCODE_INSTRUCTIONS_DOC` stays cited by
  `spec/rule.ts`, and `AGENTS_MD_STANDARD_DOC` by `agents-standard`.
- `doc-refs.ts:163`: the comment and `covers` (`:169-172`) stop naming `buildAgentsMd`. Say the standard
  specifies no frontmatter or per-agent sections, and keep the pointer to the two consumer docs. Leave
  `verifiedOn` alone: no source was re-read for this citation.
- `doc-refs.test.ts`: delete the `copilot AGENTS.md aggregate` assertion (`:51-54`), and rename the test
  to `plus the copilot-instructions aggregate`.

**Test:** `TEST doc-refs.test` passes, and `npx tsc --noEmit -p .` and `npm run lint` are clean.

### 5. Regenerate the snapshot `[inline: removes a baseline path, so the hash diff needs judgment]`

**Files:** `test/fixtures/output-snapshot/build.json`, `test/targets/output-contract.test.ts`.

- `output-contract.test.ts:215-217`: change the unmatched-file fixture to root `AGENTS.md`, a file no
  Copilot contract matches, and fix its comment.
- Run `SIGIL_SNAPSHOT_ALLOW_REMOVAL=1 npm run snapshot:update`. The plain command refuses the removal.

**Review the diff, which must be exactly:** 39 lines added under `copilot/.github/agents/`, one removed
(`copilot/.github/AGENTS.md`), and no other hash changed. `add-*.json` and `ids.json` stay unchanged.
Anything else means a render moved, so stop.

**Test:** `TEST output-snapshot.test` and `TEST output-contract.test`: both pass.

### 6. Reference docs `[worker:medium]`

**Files:** `docs/guides/publishing.md`, `docs/reference/spec.md`, `docs/reference/architecture.md`.

- `publishing.md:183-184`: delete the known limit. Under section 3, after the `.sigil/manifest.json`
  sentence, add: "`sigil build --target copilot` writes the same agent files; they match `add` for the
  same install set. A smaller install gets a shorter Boundary section."
- `spec.md:306`: change the Agents cell to `Written to `.github/agents/<name>.agent.md``.
- `architecture.md:133`: change to "(Copilot's `copilot-instructions.md`, the open standard's
  `AGENTS.md`)", and keep the `copilot/build-helpers.ts` pointer.
- `architecture.md:164`: change "Copilot's `AGENTS.md` and `copilot-instructions.md`" to "Copilot's
  `copilot-instructions.md`, the open standard's `AGENTS.md`".

Leave every other `AGENTS.md` mention alone: those are the conventions file, the open-standard target
or generic examples that stay true (`emit-files.ts:6`, `types.ts:470,487`, `output-contract.ts:14`).

**Test:** `npx prettier --check docs/guides/publishing.md docs/reference/spec.md docs/reference/architecture.md`
passes, and `git grep -n "\.github/AGENTS\.md" -- src test docs/guides docs/reference CLAUDE.md` finds
only the negative assertion in `copilot.test.ts`.

### 7. CLAUDE.md and changelog `[inline: user-facing copy]`

**Files:** `CLAUDE.md`, `CHANGELOG.md`.

- `CLAUDE.md:171`: change the example to "(Copilot `copilot-instructions.md` in
  `targets/copilot/build-helpers.ts`)".
- `CHANGELOG.md`, under `[Unreleased]`, a `### Changed` entry: `sigil build --target copilot` now writes
  each agent to `.github/agents/<name>.agent.md`, the same files `sigil add` writes, with their tool
  limits. `.github/AGENTS.md` is no longer written; delete any copy you committed.

**Test:** `npx prettier --check CLAUDE.md CHANGELOG.md` passes.

### 8. Verify the phase `[inline: review gate]`

- `npm run ci:local` passes, including `sync --check` and the strict plugin validation.
- `npm run catalog:build`, then `dist/copilot/.github/agents/` holds 39 files and
  `dist/copilot/.github/AGENTS.md` doesn't exist. `dist/claude` and `dist/agents-standard` are covered by
  the snapshot diff in step 5.
- Repeat the probe in [Measured before planning](#measured-before-planning), this time against the
  real `build` output: 0 byte differences from a full `add`.

No Copilot run is needed: these are the same bytes `add` already installs, and nothing whose result is
Copilot's behaviour changes. A `platforms: [claude]` agent stays out through `filterForTarget`
(`build.ts:31`), which this phase doesn't touch and which no agent uses today, so it gets no new test.

Then the roadmap's close-out: `workflow-report .`, `/agent-skills:review`, tick Phase 2 in the roadmap
and correct its "every request" sentence, PR, merge on green CI, and delete this plan after merge.
