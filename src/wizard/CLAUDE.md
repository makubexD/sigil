# Wizard internals (`src/wizard/`)

This file loads automatically whenever you work under `src/wizard/`. It holds the design
invariants and shipped-bug history for the `add`/`new` interactive wizards. The user-facing `add` command contract
(selectors, flags, TTY/CI guard) lives in `docs/reference/spec.md` (CLI reference), `docs/reference/cli-flags.md`, and
`docs/guides/consuming.md`.

**Home menu (`home.ts`, `home-menu.ts`, `home-actions.ts`, `home-browse.ts`):** what bare `sigil` opens in a
TTY. `cli.ts` handles bare `sigil` _before_ `parseAsync` (non-TTY prints help on stdout, exit 0); a root
`.action()` would swallow mistyped commands, because Commander runs it before its unknown-command check.

- The content is pure: `buildMenu(ctx)` and `describeContext(ctx)` depend only on a `ProjectContext`
  (`src/project-context.ts`: `detectProjectContext`, `recommendNext`), so each folder state is a test fixture.
  The menu is the `ENTRIES` table in `home-menu.ts`; each row has a `shown(ctx)` predicate. The top
  recommendation is moved first and marked.
- **Every entry needs a handler** in `defaultHomeDeps` (`home-actions.ts`); `test/wizard/home.test.ts` fails
  on a gap. `quit` and `change-folder` are the loop's own. A handler calls the same `run*` function as the
  CLI verb, with the folder the menu is looking at. Never copy command logic into the menu.
- **The folder picker** (`folder-list.ts`, `folder-picker.ts`) is arrow-key navigation, not a typed path. Folder
  entries carry absolute paths as values and navigation entries carry `FOLDER_CHOICE` sentinels; it returns an
  existing folder, a folder it just created after the user confirmed (`New folder here`, or a typed path
  that did not exist), or `null`, never an unchecked string. Do not swap it for `text`. Live path typeahead needs
  `@clack/prompts` 1.x, which is ESM-only and breaks `mockClack`'s `require.cache` approach.
- **Targets are never silently narrowed to one.** `ProjectContext` counts installs for every target
  (`installedByTarget`), so the header and the "hide Update/Remove when nothing is installed" rule never
  lose a second tool's installs. The commands still act on one target, so Update, Remove, Check, and
  Clean up go through `chooseInstalledTarget` (`home-target.ts`): the only tool with installs is used,
  and two tools get a "Which tool?" question. Copilot is detected by its own files, matched with
  "any marker" (`detectedTargetsIn`, shared with `detectProjectTarget`); never a bare `.github/`.
- **Recommendations must not loop.** Every entry in `HEALTH_ADVICE` (`project-advice.ts`) must be
  something the action can actually resolve. Edited files (`drifted`) are therefore not recommended: no
  action "fixes" an edit. `deriveStatus` (`manifest/status.ts`) checks orphaned before missing, so an
  artifact the catalog dropped goes to Clean up and never to Restore, which cannot bring it back.
  A preview (`--dry-run`) reports `pending`/`pendingCount`, never `updated`, so the guided update can
  say "nothing to apply".
  The loop also protects itself at runtime: `runHome` keeps a per-folder `dismissed` set. When the user picks the
  recommended action and the next turn would still put that same action first, it is added to `dismissed` (with one
  `log.info` line) and `buildMenu(ctx, { dismissed })` stops marking it. Going ahead past the risky-folder guard
  dismisses `change-folder` the same way. The set is cleared when the folder changes. The entry itself stays in the
  menu. `buildMenu` stays pure.
- **Set up offers only the tools not set up yet.** The `init` entry's label names the tool it adds ("Also set up for
  GitHub Copilot") once another is detected, and its handler passes `only: toolsToSetUp(...)`
  (`project-context.ts`) to `runInit`, so a single remaining tool is set up without a question and a tool already
  shown in the header is never offered again. `sigil init` run by hand still lists every tool, not-yet-set-up first.
  `--target` ignores `only`.
- **A damaged manifest is its own state, not "nothing installed".** `recommendNext` returns only
  `repair` then (`project-advice.ts`), and the menu hides Install until `runRepair`
  (`commands/repair-manifest.ts`) moves the file aside. Never delete the damaged file.
- **The folder list is capped, and comparisons use real paths.** `listSubfolders` checks only the
  first `MAX_PROBED` (200) folders by name for project markers; the rest are listed without a check, because
  each check is file reads and a huge or networked folder would hang. `samePath` compares
  `realpathSync.native` results, so 8.3 short names and links cannot defeat the home-folder check.
- **Install or set up in a risky folder asks once, and offers the way out** (`folder-guard.ts` `guardFolder`, the
  `GUARDED` table in `home.ts`): the home folder, a drive root, or a catalog checkout, from the Install and Set up
  entries and from search→install. The reason is a `log.warn` (from `riskyFolderReason`, the text the recommendation
  shows) and the question is one line: pick another folder (default) / use this one anyway / back. Picking another
  folder runs the same action there, and the new folder is checked in turn. The picker gets `leaving` so the folder
  is labelled and not preselected: Enter alone must never lead back into it, and choosing it again is refused.
- **Never put a newline in a prompt message.** clack draws its `│` gutter only on the first line, so a second line
  starts at column 0. Use `log.*` for the explanation and keep the question to one line. The journey tests assert it
  on every prompt.
- **A folder that already answers "which tool?" is not asked again.** `resolveViaWizard` (`commands/add/resolve-inputs.ts`)
  fixes the tool to `--target`, or to the only detected tool, and `runWizardAt` skips `targetStep` (its
  `shouldShow`) after `adoptTarget`, logging one line. `runSteps` returns `null` on "back" with no history, so
  "← Back" on the first visible step leaves the wizard instead of repeating it.
- **Provider lists in prose come from the registry** (`src/tool-names.ts`: `toolName`, `toolList`,
  `setUpToolNames`). Never write "Claude Code or Copilot" or "both tools"; `toolList` caps a list ("A, B, C or 2
  more"). `test/wizard/home-many-tools.test.ts` registers extra tools to prove it.
- **Everything the user sees goes through `wizard/prompts.ts`, never clack** (`test/wizard/frame.test.ts` scans `src/`:
  only `prompts.ts`, `say.ts`, `frame.ts` may import `@clack/prompts`, and only `prompt-run.ts` and `picker/index.ts`
  `@clack/core`). The four prompts are our own, built on `@clack/core` (`prompt-run.ts`) with pure renderers
  (`prompt-views.ts`, `prompt-fit.ts`): the window is read when each frame is drawn (`terminal.ts`), every line is cut to it
  with `…`, an answered prompt collapses to one line (a multi-select says "N selected", never a list of ids), and `text`
  scrolls sideways around the cursor. `log.*` and `note` wrap (`say.ts`); a wrapped line keeps the level of its first row (no hanging indent). **Cut, never wrap, a prompt line**: clack
  redraws by erasing a logical line count, so a line the terminal splits in two leaves leftovers behind (the overlapping
  text on a small or zoomed-in window). A `label (recommended)` keeps its marker. Never wrap, cut or measure by hand, and
  never read `process.stdout.columns` directly (a scan fails): `terminalWidth()` / `terminalHeight()` re-read the real
  size, because Node's cached one goes stale in ConPTY terminals on Windows (VS Code, Windows Terminal), and
  `watchWindowSize()` keeps an open prompt following a zoom. `SIGIL_COLUMNS` overrides a terminal that misreports and
  `SIGIL_DEBUG=terminal` prints cached vs live size. With no terminal (pipes, CI, tests) nothing is changed.
  Plain verbs (`build`, `list`, `status`, `--json` …) are deliberately not wrapped: they have no gutter, the terminal's
  soft wrap is right, and wrapping would corrupt copied JSON or code.
- **Tests for width.** `test/helpers/window.ts` (`withWindow`), `assertFits` and `inTerminal` (`home-flow.ts`), and the
  mock (`clack-mock.ts`), which replaces our four prompts and records what a person would see. **`all-paths.test.ts` runs
  every interactive path in five window sizes** and a scan fails when a source file that draws a prompt is in neither a
  scenario nor the exemption list: **add a scenario (or a reasoned exemption) when you add a prompt to a new file.**
- **The command to repeat is in the text column and pasteable** (`printRepeatCommand` → `wrapCommand` → `copyableLine`;
  used by `Repeat non-interactively` and every `Equivalent command:`; a scan fails on a log line). Indented with 3 spaces
  and no `│` bar (a selection would copy the bar, and `│` is an error in every shell), every line at one level. One line
  when it fits; otherwise wrapped **between words only** (never inside an id), each line but the last ending in the
  continuation of the shell the user is probably in (`detectShell`, `src/invocation.ts`): PowerShell backtick, cmd `^`,
  bash backslash. The label names the shell. Detection is best effort, in order: `SIGIL_SHELL`; not Windows is bash;
  `MSYSTEM`/`SHELL` is Git Bash; the per-user PowerShell folder in `PSModulePath` is PowerShell (a fresh cmd lacks it);
  else cmd. Known miss: cmd started inside PowerShell reads as PowerShell, and `SIGIL_SHELL=cmd` fixes it. Not in a
  terminal (pipes, CI) the command stays one plain line. `copyable-command.test.ts` checks every catalog id against
  `[A-Za-z0-9:/_.,@= -]`. After `npm run sigil`, or `node …/cli.js` with no `sigil` on PATH, `launcherPrefix` (from
  `npm_command`, `npm_lifecycle_event`, `npm_lifecycle_script`, `PATH`) prints `node <absolute cli.js> …` instead of
  `sigil …`, which runs from any folder (`npm run` only works inside the repo). It falls back to `npm run sigil -- …` when the path holds a
  character the shells read differently.
- **The whole menu session is one frame.** `runHome` opens the only `intro` and closes the only `outro`. Wizards
  and guided verbs use `intro`, `outro` and `cancel` from `wizard/frame.ts` (re-exported by `prompts.ts`):
  inside the menu they print a log line instead of drawing a second
  `┌`/`└`, and outside it they call clack as before. A note that would repeat ("How this works") goes through
  `noteOnce`. `runHandler` runs each handler under `withGutter`, so a verb's plain `console.log` lines get the `│`
  gutter: a new verb needs no change for that. A custom prompt must also collapse when answered (`picker/render.ts`
  has a `submit` and a `cancel` frame) and start with a `│` line.
- **After an install or a set up, a short "What next?" menu** (`buildNextMenu`, `nextSummary` in `home-next.ts`;
  `Session.after` in `home.ts`) replaces the box and the full list: Done first after an install, Install first after
  a set up, then check, add another tool, "Show all options". It shows only when the handler succeeded and nothing
  more urgent than Install is advised (repair, restore, update…); then the full menu shows. A cancelled or failed
  handler gets the full menu. In the full menu `init` sits after `prune`, so with no advice Enter lands on Install,
  never on adding a second tool.
- **The risky-folder question is asked once per folder.** `Session.riskAccepted` is set when the user goes ahead and
  cleared when the folder changes; `settleFolder` skips the guard while it is set.
- **A skip says why.** `SkippedArtifact.cause` is `kind`, `platform` or `inlined`. An inlined base rule is "already
  included", never "not supported by <tool>" (`plan-box.ts`, `commands/add/render.ts`).
- **A handler that was cancelled returns `'cancelled'`** (`HomeHandler`, `runAdd`, `runInit`, `runRepair`), so
  backing out of a recommended action is not treated as "ran and changed nothing".
- `runHome` never exits on an action's failure: a `SigilError` is shown (message plus hint) and the menu
  returns. Ctrl+C at the menu leaves quietly. Handlers are injected so the loop is tested without installing.
- Author entries (`new`, `edit`, `validate`) show only inside a catalog checkout and use that checkout's
  `catalog/` and `packs.yaml`; consumer entries use the bundled catalog (`resolveDefault`).
- "Restore deleted files" is menu-only (`src/commands/restore-missing.ts`): `sigil update` does not recreate a
  deleted whole-file artifact, so whole files come back through `add`, config fragments through `update`.

**Guided verbs.** `uninstall`, `update`, `prune` and `init` each have a `<verb>-guided.ts` beside the command.
The rule: ask only when `isInteractiveTTY()` is true and the user did not already decide (`--yes`, `--dry-run`,
`--apply`, `--json`, explicit ids or `--target`); every non-TTY path is byte-for-byte what it was. Outside a
terminal a missing argument is a `SigilError` whose hint shows the command to run. Each guided flow logs an
`Equivalent command:` line, logged AFTER the user confirms and complete enough to paste into a script
(`uninstall` includes `--yes`, plus `--force` when edited files are deleted). Removing an artifact with
edited files asks keep-or-delete in a terminal (`uninstall-confirm.ts`); a script keeps them unless `--force`. `update-guided.ts` receives `applyUpdate` as a parameter so it and `update.ts` do not
import each other. The shared picker is `installed-picker.ts` (`installedOptions` is pure; `pickInstalled`
returns `null` on cancel).

**Testing the home menu.** Four layers, each catching a different class of bug; add a case to the right one
instead of a one-off test.

1. `home-matrix.test.ts` / `home-many-tools.test.ts`: `buildMenu` over folder kind × tools × installs × damaged
   record (`test/helpers/menu-matrix.ts` holds the rules). A new state is a new value on an axis.
2. `home-journeys.test.ts` and `home-after-setup.test.ts` (the real install wizard against a one-rule pack): scripted end-to-end flows with the real handlers for a beginner (Enter every time), an
   experienced user (`--target`, shortcuts) and an indecisive one (Back, Ctrl+C, change of mind). They assert the exact
   list of questions (`flow(rec)`), the files and the header.
3. `home-walk-<n>.test.ts` (four shards of `helpers/home-walk.ts`, so they run in parallel): a seeded random walk (also checks one frame, the gutter, the guard asked once, and the short menu after a set up); a failure prints the seed and steps, replay with
   `SIGIL_WALK_SEED=<n>` (`SIGIL_WALK_SEEDS` sets the count, default 60).
4. Targeted unit tests next to each module.

`mockClack` takes a queue or a driver function, records prompts, logs and notes into a `Recorder`, and accepts
`ENTER` for "press Enter".

**Testing guided flows.** `fakeTTY()` (`test/helpers/tty.ts`) makes `isInteractiveTTY()` true; `mockClack`
answers prompts from a queue, and a queued `symbol` simulates Ctrl+C (`isCancel` is true only for symbols).
An empty queue throws, which is how a test proves "this path asks nothing".

**Wizard (`src/wizard/add.ts`):** triggered when run with no selector in an interactive TTY. Uses
`@clack/prompts` for a step-machine guided flow; every prompt maps 1:1 to a CLI flag so guided and
scripted paths are equivalent. After install, `printEquivalentCommand()` prints the copy-pasteable
`sigil add … --yes` line (boxed in a TTY, plain text in CI), only after a wizard install: a command the user
typed is not echoed back. Picks that install nothing (cause `inlined`) are left out of it. The plan box shows summary + artifact
preview only — never the command — so it is never printed twice.

**Cancel/back handling (`src/wizard/steps/add/prompt-helpers.ts`):** every step under
`src/wizard/steps/add/` shares one `isCancel → cancel(...) → return 'cancel'` triad and one
`{ value: BACK, label: '← Back', hint: '' }` back-option object — never re-declare either inline.
Use `BACK_OPTION`, `CANCEL_MESSAGE`, and `resolveOutcome(answer)` (returns `'cancel' | 'back' |
undefined`, performing the `isCancel` check and the `cancel()` side effect) so each step reduces to
`const o = resolveOutcome(a); if (o) return o;`.

**Equivalent-command invariant:** the "Repeat non-interactively" command printed after install must be
the _complete, faithful equivalent_ of the wizard session — every consequential choice reflected,
nothing silently dropped. `buildEquivalentCommand` (`src/wizard/command-strings.ts`) builds the string; its call
site in `src/commands/add/render.ts` (`printOutcomeEquivalentCommand`) must pass
`hasConfigKinds: plan.configIds.length > 0`, `configScope: plan.effectiveScope`, and
`language: plan.effectiveLanguage` so that when config kinds (mcp/hook/settings) are involved,
`--scope` is **always** emitted — even for the `project` default — pinning the destination file +
JSON section. Non-config defaults (overwrite, deps, language) may still be omitted. Any new wizard
step must extend `buildEquivalentCommand` + that call site + a case in `test/wizard/add.test.ts`
in the same change. The step list itself is `ADD_STEPS` in `src/wizard/steps/add/index.ts`.

**Top menu (scope step):** the top-level "What would you like to install?" menu has three entries. "Pick
specific items" is the preselected one, and `all` asks for a confirmation (default No) because it
includes hooks and MCP servers:

| Entry               | Value    | Next                                        | When             |
| ------------------- | -------- | ------------------------------------------- | ---------------- |
| Pick specific items | `browse` | kind sub-menu (led by "All types") → picker | always           |
| Recommended         | `pack`   | which bundle? → deps                        | when packs exist |
| Everything          | `all`    | confirm → optional language filter → deps   | always           |

**Three-level information architecture** — type is the spine; language is never a top-level choice:

```
Level 1 — WHAT (type/intent only):
  Everything · Recommended · Pick specific items

Level 2 — TYPE sub-menu (only under "Pick specific items"):
  All types (mix anything) · Skills · Agents · Commands · Rules
  MCP servers · Hooks · Settings

Level 3 — LANGUAGE (injected only where relevant):
  · Code kinds (skill / agent / rule / prompt / workflow) → "Narrow to a language? (optional)";
    language-less (shared) artifacts group under `shared`
  · Config kinds (MCP / Hooks / Settings) → straight to picker, NEVER asked about language
  · "Everything" → same optional skippable filter with note that MCPs/hooks/settings always included
```

**Wizard answers must stay consistent.** `applyScope` (`scope.ts`) clears `language`, `selectors`,
`kindPick` and `browseAll` when the scope changes, and `resetAfterTarget` clears `configScope`; a stale
filter would otherwise install 0 items. Every count or list a step shows comes from `previewSelection`
(`plan-preview.ts`), which applies the target's supported kinds and platform, so the plan never promises
what the install will skip. The overwrite step has a `shouldShow` (`conflictsFor`): it is asked only for
`foreign`/`drifted`/`outdated` picks, and `s.overwrite` defaults to `false` in `buildInitialState`.
Pickers go through `pickUntilUsable` (`pick.ts`), which re-asks on an empty answer or a ticked
"← Back" next to picks, and starts with the earlier picks ticked. `Target.afterInstallHint` feeds the
`Next:` line after an install; never hardcode a tool name in `render.ts`.

**History invariant:** pass-through / auto-forward steps must **never** push a history frame — only
steps that actually rendered a prompt do. Violating this causes back-navigation to return the wrong
step and produces "← Back" loops (the bug that was originally found in the hand-rolled `narrow` step's
`all` branch). As of the step-registry rewrite (`src/wizard/engine.ts`), this is enforced structurally
rather than by convention: `history.push` exists in exactly one place — inside `runSteps`, on the
`'next'` outcome, for a step whose `run()` actually executed. A step skipped via `shouldShow` never
runs, so it can never push a stale frame. See `src/wizard/steps/add/` for the step list and
`src/wizard/steps/new/fields-confirm.ts` for the one case (text-entry + confirm) modeled as a single
step with its own internal loop because the original never gave that transition its own history frame.

**`Browse & pick` → kind sub-menu:** shows "All types (mix anything)" first, then each present kind
with its artifact count (Skills, Agents, Rules, Commands, Workflows, Hooks, Settings, MCPs).

- **"All types" (`crossKindPicker` step):** cross-kind grouped picker. `Config — agnostic` group
  always appears first (mcp/hook/settings, language-agnostic). Code artifacts follow in language
  groups. Language is an optional, skippable refinement shown only when ≥2 languages are present.
  Config kinds are never touched by the language filter. Goes through deps → overwrite → scope.
- **Specific kind (`kindPicker` step):**
  - **Config kinds (mcp/hook/settings):** flat `pickArtifacts` (single group); **skips language and
    deps steps**; proceeds directly to overwrite → scope (where the blast-radius warning fires if
    needed).
  - **Code kinds (skill/agent/rule/prompt/workflow):** optional "Narrow by language?" (`initialValue:''`
    — Enter = all), then a flat or language-grouped `pickArtifacts`. Proceeds to deps → overwrite → proceed.

**The picker (`src/wizard/picker/`) — constant frame height is the invariant, never break it.**
`crossKindPicker` and `kindPicker` render through `pickArtifacts()`, not `@clack/prompts`'
`groupMultiselect`/`multiselect` — those have no viewport (draw every option every frame) and no
bound on the active row's inline hint text, so at catalog scale (~150 artifacts) the frame outgrows
the terminal and `@clack/core`'s cursor-relative repaint desyncs: phantom "pre-selected" checkboxes
and duplicated blocks. `pickArtifacts` is built directly on `@clack/core`'s `GroupMultiSelectPrompt`
with a custom `render()` (`render.ts`, backed by the pure `layout.ts`) whose **output row count is a
function of `viewportRows` alone** — never of cursor position, selection state, or description
length. `layout.ts`'s `buildListRows` is the function that must hold this property;
`test/wizard/picker-layout.test.ts` asserts it directly (identical array length across every cursor
position, including the catalog's longest description). Any change to the renderer that makes row
count depend on content, not just `viewportRows`, reintroduces the bug — verify against that test.

Structural shape: a fixed-height scrolling list (with `↑ N more` / `↓ N more` sentinel rows and a
pinned group header when scrolled mid-group) + a **fixed 3-line detail pane** below it showing the
active row's full id/kind/state/description, so the row itself stays short. `toArtifactOption`
(`steps/add/options.ts`) returns structured fields (`id`, `kindNoun`, `stateGlyph`, `stateLabel`,
`description`) that the row and the pane each render.
A flat (single-group) picker is just `pickArtifacts` called with one descriptive group key — there
is no separate flat-vs-grouped implementation.

**Testing the wizard through `pickArtifacts`:** `test/wizard/add.test.ts` mocks
`src/wizard/picker/index.ts`'s `pickArtifacts` export the same way it mocks `@clack/prompts` — by
mutating the already-loaded module's `require.cache` exports object — since `pickArtifacts` no
longer goes through `@clack/prompts` at all. Only the `pickArtifacts` key is saved/restored (not the
whole exports object): the module also re-exports `@clack/core`'s `isCancel` as a getter-only
property, which throws on reassignment; call sites import `isCancel`/`cancel` from `@clack/prompts`
directly (mocked separately), so the picker module's `isCancel` re-export is never touched by tests.

**Install-state legend + colored markers.** The picker's detail pane names the active row's state in
words (see above), so there is no separate `note('Legend')` box. State markers are colored via
`picocolors`: `＋ new` (green), `✓ installed` (dim), `↑ update available` (cyan), `✎ you edited this`
(yellow), `⚠ not sigil's` (yellow), `! missing from disk` (cyan) — see `stateLabelParts` in
`state-display.ts` for the raw glyph/label pairs the picker colors at render time. Option hints use
`stateHintSuffix` in the same file, whose wording differs slightly (`↑ new version available`,
`⚠ not installed by sigil`). Nothing is pre-checked — glyphs are informational only; the user checks
every item they want to install.

**Six install states** (`InstallState` in `src/install-state.ts`). `computeInstallStates` builds one
state per candidate from the manifest plus `computeStatus` (`src/manifest/status.ts`). Config kinds
(`mcp` / `hook` / `settings`) store `files: []`; `resolveConfigOutdatedState` compares each recorded
`fragmentSha256` with the freshly scaffolded fragment and can flip an otherwise `up-to-date` config
entry to `outdated`. An untracked config kind is `new` even when the shared JSON file already exists
— only whole-file kinds can be `foreign` (`resolveUntrackedState`).

| State        | manifest | disk                        | content                         | Default `add` action                 |
| ------------ | -------- | --------------------------- | ------------------------------- | ------------------------------------ |
| `new`        | no       | no                          | —                               | write                                |
| `foreign`    | no       | yes (whole-file paths only) | —                               | conflict (files sigil did not write) |
| `up-to-date` | yes      | yes                         | matches manifest and catalog    | skip (`✓ already up to date`)        |
| `drifted`    | yes      | yes                         | differs from the manifest hash  | conflict (user edited it)            |
| `outdated`   | yes      | yes                         | matches manifest, catalog moved | conflict (suggest `sigil update`)    |
| `missing`    | yes      | no                          | —                               | write (restore)                      |

The default-action column is the non-interactive `add` path. The wizard does not pre-check from it.

**Install-plan box labels.** The plan box (before "Proceed?") uses `Install:` (not `Scope:`) for
the selection, and always shows `Config scope: <value>` + `Destination: <fullPath  › section>` when
config kinds are in the selection — even when scope equals the `project` default.

**`ScopeChoice`** (`src/wizard/steps/add/state.ts`): `'all' | 'pack' | 'browse'`. State
`kindPick?: ArtifactKind` is set when `browse` is chosen and a specific kind is selected; `browseAll?:
boolean` records which of the two "Pick specific items" sub-pickers (all-types vs. single-kind) ran.

**Curated packs (`packs.yaml`):** packs are mix-anything bundles expressed with explicit bare-id
`artifacts:` lists (e.g. `csharp/cs-generate-tests`, no `kind:` prefix) or a `languages:` set. When
a pack contains skills their rule/agent dependency closure is resolved by the wizard's `deps` step —
you do not need to list deps manually. The shipped names and membership live in
[`packs.yaml`](../../packs.yaml) at the repo root; do not keep a second inventory here. Kinds the
Claude plugin channel doesn't package (see [`docs/reference/capabilities.md`](../../docs/reference/capabilities.md))
are skipped during `catalog:build`; they are installed only via `sigil add` / `sigil update`.

**Dependency closure UX (plan box):** the `uses:` dependency is purely authored YAML frontmatter
in each SKILL.md (e.g. `uses: { rules: [csharp/cs-conventions], agents: [shared/code-reviewer] }`) —
not a hard technical requirement. The wizard surfaces this concretely:

- `computeClosure(primaryIds, catalog)` (`src/select/closure.ts`) walks `resolvedRules` and
  `resolvedAgentIds` on each skill to compute the exact rules/agents that would be added.
- **Deps note** names each dependency with its kind, ID, and title, plus the `via` skill that
  declares it. The lead sentence frames it as "the skill author recommends" (not a hard requirement).
- **Install-plan box** (before "Proceed?") shows the full resolved artifact set: each primary pick
  tagged `(your pick)` and each dependency tagged `(dependency of <skill>)`. When deps are excluded
  (answered No), the box shows only primary picks + a `(N deps excluded)` line.
- The **post-install file listing** is `printWrittenFileListing` in `src/commands/add/render.ts`. It
  tags each written file `(dependency)` when the path is outside the primary selection, consistent
  with the pre-confirm preview.

**`WizardResult.language`** is only set via the `all` scope path (the global language filter step).
Browse/pick-specific paths use explicit `${kind}:${id}` selectors, so `language` stays undefined.
`fromWizardResult` in `src/commands/add/resolve-inputs.ts` copies that value onto the add inputs.
`buildEffectiveFields` in `src/commands/add/plan.ts` stores it as `effectiveLanguage`, and
`buildAddPlan` passes `filters.language` from the same input into `resolveSelection()`.

> **Search deferred:** add a `Search by keyword` top-level entry (wired to the existing
> `sigil search` ranking → multiselect of matches) when a kind exceeds ~30 items.
