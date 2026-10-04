# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking

- `shared/ado` (Azure DevOps MCP) no longer hard-codes an organisation: set `ADO_ORG` (your
  organisation name) and `ADO_MCP_PERSONAL_TOKEN` in the environment your AI tool starts from, then
  run `sigil update`. The server is pinned to `@azure-devops/mcp@2.10.0` instead of the nightly
  `@next` tag.

### Added

- `sigil sync --check` checks every emitted file against the size limits its provider documents
  (new `provider-limits` rule): a skill's name (64 characters) and description (1024) per the Agent
  Skills spec on both tools, a Copilot custom agent's body (30,000 characters), and a warning for a
  `SKILL.md` body over 500 lines (Claude's guidance). The limits are data on each provider's emit
  spec, so a new provider declares its own.
- Skills now name their reference files with Markdown links (the visible text is still the
  backtick path), the form Claude's and VS Code's skill docs recommend; VS Code loads only the
  references `SKILL.md` references. The new `reference-links` rule fails `sigil sync --check` on a
  backtick-only mention, and `sigil sync --apply` rewrites it.
- MCP artifacts reference environment variables with a neutral `{sigil:env:NAME}` token, written
  as `${NAME}` for Claude Code and the portable `.mcp.json` and as `${env:NAME}` for VS Code's
  `mcp.json`. Before, `shared/ado` shipped VS Code's syntax to every tool, so Claude Code passed
  the literal text instead of the token. The filesystem MCP is now pinned to an exact version too.

- New `cli-builder` pack (and Claude plugin): the `cli` and `wizard` skills with their per-stack
  references, their rules and both auditor agents. Before it, no plugin carried them.

- `sigil sync --check` enforces the catalog layout standard with a new `catalog-layout` rule
  (error): an artifact outside `shared/` and `languages/<lang>/`, in another kind's folder, with
  an id prefix or `language:` out of step with its folder, in a language with no `language.yaml`,
  or a skill folder named differently from the skill; and skill-folder content that never ships
  (`assets/`, `scripts/`, nested reference folders), a reference `SKILL.md` never mentions, or a
  stack file not named `stack-<stack>.md`.

- `sigil import --shared` imports into `catalog/shared/` with no `language:` (`--language` and
  `--shared` are now exclusive, one required). A skill's flat `references/*.md` files are imported
  with it, held to the catalog's reference rules and trust-scanned; what can't ship (`assets/`,
  `scripts/`, nested reference folders) is listed instead of dropped silently.

- Home menu: "Search the catalog" shows the matches as a list to pick from (no copying an id), says
  plainly when nothing matches, and names the helpers an install brings. Remove asks whether to keep or
  delete files you edited; the `Equivalent command:` is printed after you confirm and includes
  `--yes` (and `--force` when chosen). Pickers say Ctrl+C goes back.
- Plainer wording: `sigil status` prints `[edited by you]`, `[no longer in the catalog]`, `[file deleted]`
  and `[newer version available]` (`--json` keeps the machine names); `sigil init` says "already exists"
  and points to the menu; the guided prune does not tell you to run `--apply` right before asking;
  a folder that cannot be written to says what to try; the menu header columns line up, and the
  recommended entry keeps its description. "Set up this project" stays until both tools are set up.
- Folder browser: a folder with over 200 subfolders checks only the first 200 for project markers
  (the rest are still listed), and a short Windows path (`KIEFER~1`) is recognised as the same folder
  as its long form, so the home-folder check cannot be fooled.
- Install wizard, for first-timers: a "How this works" note, "Pick specific items" preselected, and
  "Everything" asks for confirmation. Enter with nothing ticked asks again, and ticking "← Back"
  together with items warns instead of dropping them. Going back keeps your picks. The plan box counts
  only what the chosen tool can take, says what is already up to date, and offers only Back or Cancel
  when there is nothing new. "Replace existing files?" is asked only when something would be replaced,
  names each file and why, and says your edits are lost. Config scopes have plain names, and a scope
  stored in a home-folder file gets a note. After an install sigil prints a **Next:** line for the tool.
- Home menu: "Repair the install record" appears when `.sigil/manifest.json` cannot be read. It moves
  the damaged file aside (`manifest.damaged-<time>.json`), and the menu hides Install until then.
- Home menu: Install (and install from a search result) asks first in your home folder, the top of a
  drive, or a sigil catalog checkout. When both Claude Code and Copilot have installs, Update, Remove,
  Check, and Clean up ask which tool, and the header counts each.
- Folder browser in the home menu: "Work in a different folder" now lists folders to pick with the
  arrow keys (project folders first, step in, go up, use this one) instead of asking for a typed path.
  "New folder here" creates a project folder, and "Type a path" offers to create a folder that does
  not exist yet (it still rejects a file, or a path under one). Links to folders are listed, and a
  bare `D:` means the root of that drive.
- Guided home menu: `sigil` with no command, in a terminal, inspects the folder (targets, install
  health, catalog checkout, home folder), recommends the next step, and routes to set up, install,
  restore deleted files, update, remove, status, clean up, browse and search (then details, then
  install), author actions inside a catalog checkout, change folder, and help. Outside a terminal it
  prints the command list on stdout and exits 0.
- Guided commands in a terminal: `sigil uninstall` with no ids offers an installed-artifact picker;
  `sigil update` previews and asks (apply / overwrite my edits / choose / cancel) and gains `--yes`;
  `sigil prune` offers to apply after the preview; `sigil init` asks for the target when `--target`
  is omitted. Without a terminal all four behave as before.
- Root help is grouped by task (Start here, Browse, Author, Build and release) with one-line
  summaries and a getting-started footer.
- `sigil status` ends with a `Next:` list naming the command that fixes each problem.
- Shared (stack-agnostic) skills: a skill may omit `language:` and live under
  `catalog/shared/skills/`.
- `shared/cli` and `shared/wizard` skills (one reference per stack), with their path-scoped rules
  (`shared/cli-rules`, `shared/wizard-rules`) and auditor agents (`shared/cli-auditor`,
  `shared/wizard-auditor`).
- Decision record `docs/decisions/distribution-channels-2026-09.md` (scaffold vs. plugin
  marketplaces, token cost, capability model, roadmap).
- `shared/feature`: a user-invoked `/feature` conductor over the
  [agent-skills](https://github.com/addyosmani/agent-skills) collection, which is installed
  separately.
- Pack `spec-driven`: installs `shared/feature` alone.
- `package.json` `exports` map. Only `"."` and `"./package.json"` are exported; a deep import of
  `dist-cli/` fails with Node's `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- `sigil prune`: preview by default. `--apply` removes orphaned manifest entries (ids no longer in
  the bundled catalog) and the command also reports deprecated-but-installed artifacts.
- `docs/audits/2026-09-27/tools/live-probe.js`: installs catalog combinations into a target folder
  and sends real prompts through `claude -p` / `copilot -p` to check that each artifact takes effect.
  Manual and paid, so not part of `npm test`. The target directory is the `PROBE_TARGET`
  environment variable.

- Per-target capability tables (`src/targets/<provider>/capabilities.ts`): the single declaration of
  which kinds each target delivers on each channel (scaffold / plugin), and the generated
  `docs/reference/capabilities.md` matrix.

- Hooks accept `args` (exec form: `command` is spawned directly with these arguments, no shell).
- `claude: { skills: [<skill id>] }` on agents: emitted as Claude Code's subagent `skills:` preload
  field (skill names), validated like `uses:`.

- `validate` warns when a skill names a `references/<file>` it doesn't ship, or an `assets/` or
  `scripts/` path (not emitted by any target).
- Body-lexicon term `{sigil:skills-dir}` (`.claude/skills/` / `.github/skills/`).

- `docs/reference/architecture.md`: contributor internals (extension model, emit specs, templates,
  conformance engine) moved out of `spec.md`.
- `docs/reference/cli-flags.md`: per-command flags captured from `--help`. `test/cli-flags.test.ts`
  fails when it lacks a command section, omits a flag from `--help`, or documents an unregistered
  command.

### Changed

- `sigil new --language <lang>` refuses a language that has no `languages/<lang>/language.yaml` (a
  typo used to create a new, unregistered language folder) and lists the known ones. `sigil check`,
  and the authoring commands that run it, reject a shared artifact that sets `language:` and a
  language folder with no `language.yaml`.
- The `cli-auditor` and `wizard-auditor` agents find their brief in three places instead of five:
  the path the calling skill now passes, the preloaded skill, then the project and user skills
  folders.
- Catalog content: `python/py-generate-tests` and `react/react-generate-tests` now bring the
  language's own reviewer (`py-code-reviewer`, `react-code-reviewer`) instead of
  `shared/code-reviewer`, which is now described as the fallback for languages the catalog has no
  reviewer for. Existing installs keep `shared/code-reviewer`; re-adding the skill or pack brings
  the language reviewer. Python and React reviewer and auditor descriptions now start with their
  language; the Python and React security rules are `severity: required` like the others;
  `csharp/cs-git` is scoped to C# files instead of every file; `shared/explain-diff` now uses its
  `audience` argument.
- `sigil move` keeps the moved artifact's `language:` in step with its new namespace: it sets the
  language when moving into `languages/<lang>/` and removes it when moving to `shared/` (a moved
  shared artifact used to keep a stale `language:`).
- sigil finds catalog files with `tinyglobby` instead of `fast-glob`. That removes `micromatch` and `braces`
  (GHSA-vfj7-8cjw-p6xm, no fix released) from the runtime dependencies, so `npm audit --omit=dev` is clean
  again and CI fails on any severity.

- Home menu: files you edited on purpose no longer become the top recommendation forever (the header
  still counts them, and Update offers to keep or replace them). An artifact that left the catalog is
  classed as orphaned even when its files are gone, so Clean up handles it instead of Restore looping.
  The guided Update says "Everything is already up to date" instead of asking to apply nothing, and an
  edited config value now gets the same overwrite option as an edited file. `sigil update` points
  orphaned artifacts at `sigil prune`, as `status` does.
- Install wizard: the dependency step is worded as "Install these helpers too?", and the language
  question appears only when there are two or more languages. A stale language filter or config scope
  no longer survives a change of scope or tool.
- **For scripts:** the human-readable output of `status` (the bracketed words), `uninstall` (the note
  and summary about edited files), `update` (orphaned line), `init`, and the manifest-error message
  changed wording. `--json` output is unchanged. A repo with only a bare `.github/` folder (workflows)
  now resolves to Claude Code, not Copilot, when `--target` is omitted; pass `--target copilot`.
- Copilot is detected from its own files (`.github/copilot-instructions.md`, `instructions/`,
  `prompts/`, `agents/`, `skills/`), not from any `.github/` folder, so a repo that only uses GitHub
  Actions is no longer treated as a Copilot project. Any one marker is enough (it used to need all).
- `commander` upgraded to ^14.0.3 (adds help groups; 15 requires Node 22.12, sigil supports 20.19+).
- Bare `sigil` without a terminal now prints help on stdout and exits 0 (it was stderr, exit 1).
- `sigil uninstall [ids...]` and `sigil init [--target]` accept missing arguments (guided in a
  terminal; a clear error elsewhere).
- `Target.supportedKinds` replaced by `Target.capabilities`; kind support is read through
  `src/targets/capabilities.ts`. The Claude plugin assembler now derives plugin members from the
  plugin channel instead of a hard-coded kind filter. No change to emitted output.
- `provider-kind-coverage` checks every channel, honouring a spec's `variant`.
- README Quick Start restructured: fastest path, individual picks, a cost callout, and one
  collapsible section per tool.

- Agent descriptions that said "read-only" while granting `Bash` now say "Makes no edits (Bash is
  read-only by instruction, not sandboxed)": Bash can write files, and nothing enforces the claim.
- `shared/cli-rules` and `shared/wizard-rules` globs are scoped to source files (one glob per
  extension), so they no longer load for the skills' own markdown, build output, or `node_modules`.
- `shared/cli` / `shared/wizard` content fixes from an install audit: stale `stacks/` paths, a
  hijacked fuget.org link and a dead Spectre.Console API link, System.CommandLine usage errors on
  stdout, Typer ≥ 0.26 no longer running on the `click` package, one colour precedence across rule
  and references, a crash in the wizard engine sketch, and about 25 smaller accuracy fixes.
- The shared auditor agents preload their skill and find `references/auditor.md` by a fixed
  search order instead of an open-ended search.

- Reference docs, guides and `CLAUDE.md` corrected against the code (flags, paths, examples, error
  messages, build and test steps) and condensed; no invariant was removed. `spec.md` is shorter and
  has a table of contents. `docs/reference/capabilities.md` now opens with a breadcrumb, emitted by
  `renderCapabilityMatrix()` so the generated file and its staleness test agree.

### Fixed

- `sigil sync --apply` corrupted a file whose frontmatter closed with text on the same line
  (`---# Title`, which the loader accepts): it wrote an empty frontmatter block and moved the real
  one into the body. The closing fence is now found the way the loader finds it, and a file with no
  closing fence is refused instead of rewritten.
- An agent's tool restriction can no longer widen silently. `tools: []` and `disallowedTools: []` are
  schema errors (an empty list emitted no `tools:` line, which both tools read as "every tool"), and
  an agent whose `disallowedTools` would be dropped on a target it ships to (Copilot has no such
  field) is refused by `build`, `add` and `update` instead of being written with every tool; the new
  `tool-restriction-coverage` rule reports it earlier, at `sigil sync --check`.
- A tool name can no longer add or end a frontmatter key. `tools`, `disallowedTools` and
  `allowedTools` entries may use letters, digits, spaces and `_ . : * ( ) / -` only (a newline, `#`,
  quote, comma or bracket is a schema error), and the emitted `tools:` / `allowed-tools:` line is
  quoted whenever a name holds `:` or `*`, so it always parses back to the names authored. The same
  holds for every other emitted field: `argument-hint` (a backslash could end the quoted value),
  rule globs (`paths:` / `applyTo:`) and prompt argument names (now limited to the `{{name}}`
  placeholder characters) are escaped or constrained, and a test renders every provider's spec with
  hostile values to check that no frontmatter key can be added.
- A skill's `references/` files are now held to what ships safely: regular files in a real folder
  (no symbolic link or junction is followed, for a file, the `references/` folder or a skill
  folder), kebab-case `.md` names, at most 256 KiB each and 1 MiB per skill, each checked on the
  same open file it is read from. Anything
  else is skipped with a load warning. `sigil check --trust` now scans those files too, not only
  `SKILL.md`.
- Every file sigil takes from a catalog or an import source is read the same safe way: an artifact
  file that is a symbolic link is not followed (a cloned catalog or import source can't make sigil
  read a file such as `~/.ssh/config` into the catalog), and artifact files over 1 MiB are skipped.
  A non-Markdown file in `references/` is now reported instead of ignored. `sigil import` refuses a
  `--language` that isn't a plain name, writes no `language.yaml` on `--dry-run`, and won't write a
  file through a symbolic link already in the catalog.
- `sigil new settings` and `sigil move` of a settings artifact wrote into `settingss/` instead of
  `settings/`, and `sigil move` of a template (three-part id) computed a wrong path. Each kind's
  source folder and file ending are now declared once and every command derives from them;
  `sigil check` also recognises hook, settings and mcp files by name, and shell completion offers
  `kind:hook`, `kind:settings` and `kind:mcp`.
- After `sigil move`, `patch`, `edit` or `sync --apply` edited a file in a long-running session (the
  wizard), a later read of any file with the same text returned the edited values: the frontmatter
  parser's cache handed every caller the same object. Every read now gets its own copy.
- `sigil move` of a template still refused its three-part id, and its post-move check ignored the
  catalog root and parsed files more loosely than the loader. `move`, `patch`, `edit` and
  `retarget` also rewrote a quoted date such as `verifiedOn: "2026-08-05"` without quotes, turning
  it into a date that then failed the schema; any string that would read back as another type
  (a date, number, `true`, `null`, …) now stays quoted.
- `sigil check` reads an artifact's namespace from its path inside the catalog folder only. A catalog
  kept under a folder named `shared` or `languages/<x>` no longer reports a false
  "id prefix doesn't match path" error.
- `sigil help`, `--help` and `--version` could print nothing on a Windows console (`npm run sigil
  help`): the process exited right after writing. Commander's exits now return normally so Node
  flushes stdout first.
- `sigil status` said "Run `sigil update`" for every problem, but `update` does not recreate a
  deleted whole-file artifact. It now prints the command that works for each problem.
- `npm test` failed on Node 20 (the `engines` floor), so the Windows CI job never ran a test: it
  passed `--test-coverage-exclude` (Node 22.5+) and a glob that Node 20 and cmd.exe do not expand.
  `scripts/run-tests.cjs` lists the files itself and adds the flag only where it is supported.
- The hook `timeout` schema comment said milliseconds; Claude Code reads seconds.
- `sigil build --target copilot` folded every language-less rule into `copilot-instructions.md`,
  widening a narrowly scoped shared rule (e.g. `shared/cli-rules`) to the whole repository. Only
  repo-wide rules (no `appliesTo`, or every-file globs) go there now; scoped rules get their own
  `applyTo` instructions file.
- `shared/protect-config` never blocked anything: it read a `CLAUDE_TOOL_INPUT` environment
  variable that Claude Code does not set (hook input arrives as JSON on stdin), and its `.env`
  pattern missed `.env.local`. It now reads `tool_input.file_path`, resolves the real path, runs
  in exec form so a PowerShell-run hook still returns exit code 2, and allows `.env.*.example`
  templates and `secrets.*.ts` source files.
- Re-running `sigil add` for an installed hook appended a second copy, and `sigil update` never
  applied a changed hook, setting or MCP fragment from the catalog. Both now replace the recorded
  fragment (reverse it, then merge the new one).
- `sigil update` re-rendered files without the install set, stripping every Boundary ("See also")
  section, and `sigil add` counted only direct picks, so dependencies lost Boundary entries for each
  other. Both now use everything installed for the target, so an `update` right after `add` changes
  nothing.
- `resolveSelection` treated an empty supported-kind list as "everything supported"; omitting the
  list now means no filter, and `[]` means the target supports nothing.

- `sigil check` reported a wrong-kind `template:` reference as "only agents valid here".
- A config fragment whose top-level keys changed between catalog releases was never matched to
  its record, so `update` kept restoring the old one and re-`add` left it behind. Records are
  now matched by file and root.
- `update` and `uninstall` followed a config path from the manifest (`.sigil/manifest.json`, which
  is committed and editable) outside its root; they now refuse.
- `update` restored a missing config fragment from the manifest's copy, so an edited
  `.sigil/manifest.json` could add any hook command. It now writes only the catalog's fragment
  and skips a recorded one the catalog doesn't have.
- `add` recorded a config fragment even when it skipped the file (invalid JSON), so the next
  `update` stacked it beside the old one.
- `sigil add` warns when an agent preloads a skill that isn't installed, and `validate`
  rejects a preloaded skill whose name isn't its id's last segment (the emitted `skills:` entry
  would name a missing skill).
- `shared/protect-config` also blocks `*.env`, `.env-*`, `.netrc`, `.pgpass`, `*.ppk`, `*.jks`,
  `*.keystore`, and drive-relative Windows paths (`C:new.pem`).

Found by the live-prompt campaign (`docs/audits/2026-09-27/findings.md`), which ran real prompts
through Claude Code and Copilot CLI against seven install combinations:

- Copilot CLI never loaded an MCP server that `sigil add --target copilot` installed: sigil wrote only
  VS Code's `.vscode/mcp.json`, which the CLI doesn't read. A project-scope install now also merges
  the server into `.mcp.json` (`mcpServers`).
- Uninstalling an MCP server for one target also removed it for the other when both used
  `.mcp.json`. A fragment another installed entry still records is now kept.
- Copilot `.instructions.md` files had no `description`, so Copilot CLI's instruction index gave the
  model only a file name to decide whether to open a rule. They now carry the rule's description.
- Rule globs that leaked across stacks: `ts-git`/`ng-git` matched every file (a `.py` file got the
  TypeScript git rule, and `shared/git` loaded twice beside another language's git rule), and
  `react-async`/`react-logging` matched plain `.ts` utilities. They are now scoped to their own
  files.
- Models copied a legacy file's `console.log` instead of following the logging rule. `shared/clean-code`
  and the TypeScript, Python, C# and Angular logging rules now say that new code follows the rules
  even when the surrounding code doesn't.
- 15 language agents never named their language in `description` (the only field agents dispatch
  on), and Copilot chose its built-in reviewer over `ts-security-auditor`. Each now names it.
- `shared/allow-dev-tools` dropped `git status`/`diff`/`log`: Claude Code already runs read-only
  commands without a prompt, so those entries did nothing.

### Removed

- The internal `requiresLanguage` kind-descriptor flag (no kind requires a language any more).

## [0.1.0] - 2026-06-22

### Added

- Initial catalog: 3 skills (xUnit, pytest, React component testing), 4 agents, 4 rules, 2 prompts
- `sigil add` — interactive wizard + selector-based scaffold for Claude Code and GitHub Copilot
- `sigil new` — scaffold authoring templates for catalog contributors
- `sigil build` — compile catalog to `dist/claude/` (plugin layout) and `dist/copilot/`
- `sigil validate` — schema + reference-graph integrity checks (CI gate)
- `sigil list` — query artifacts by kind, language, pack, or ID
- `sigil check` — per-file source convention validation
- `sigil retarget` — update the `platforms:` field of any artifact
- `sigil edit` — update title, description, and tags via guided wizard or flags
- `sigil delete` — remove an artifact with reverse-dependency warnings
- Step-back navigation (`← Back`) in both interactive wizards
- Shell completion scripts for bash, zsh, and fish
- DRY `extends:` inheritance for rules and `uses:` closure for skills
- Claude Code native plugin layout with `marketplace.json` + per-pack `plugin.json`
- GitHub Copilot layout with `.github/` instructions, prompts, skills, and AGENTS.md
