# Consuming the Catalog — Install Skills into Your Project

This guide covers everything you do as a **user** of sigil: getting the command, installing
artifacts into your project, keeping them healthy, and using the Claude plugin build. If you want to
write or change catalog artifacts instead, see [authoring.md](authoring.md).

Run `sigil` from **your project directory**. The catalog source ships inside the sigil package, so
you never need to be inside the sigil repo to use it.

## Get the `sigil` command

sigil is **not published to npm yet**, so `npm install -g sigil` and `npx sigil` do not work today.

| Form                                    | Status      | Use when                                                       |
| --------------------------------------- | ----------- | -------------------------------------------------------------- |
| Clone, build, `npm link`, then `sigil`  | Works today | You want a normal `sigil <cmd>` command from any folder        |
| `node <abs-path>/dist-cli/cli.js <cmd>` | Works today | You want no global command, or a script pinned to one checkout |
| `npm install -g sigil` / `npx sigil`    | Planned     | Not available until the package is published                   |

The clone, build, and link steps live in one place:
[operations.md § Build and link](operations.md#build-and-link). Every example below writes `sigil`;
if you did not link, replace it with `node <abs-path>/dist-cli/cli.js`.

> **Gotcha: `npm run sigil -- add ...`** runs from the sigil package folder, so `--project-dir`
> (which defaults to the current directory) points at the **sigil repo itself**, not your project. If
> you use that form, always pass `--project-dir <absolute path to your project>`.

---

## Using the guided menu

You do not have to know any command. In a terminal, run `sigil` with nothing after it:

```bash
sigil
```

sigil looks at the folder you are in and shows what it found:

```
Folder:      C:\work\acme-api
Set up for:  Claude Code
Installed:   12 installed · 1 missing, 2 edited
```

It then lists what you can do, with the most useful step first and marked **(recommended)**. The
recommendation follows the state of the folder:

| What sigil finds in the folder                                    | What it recommends                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| Your home folder, the top of a drive, or a sigil catalog checkout | Work in a different folder (installs would land here)  |
| The install record is damaged                                     | Repair the install record                              |
| No AI tool set up in the folder                                   | Set up this project                                    |
| Set up, nothing installed                                         | Install artifacts                                      |
| Files sigil installed were deleted                                | Restore deleted files                                  |
| Installed files you edited                                        | Nothing (an edit is your choice; the header counts it) |
| A newer catalog version of something installed                    | Update installed artifacts                             |
| Installed artifacts that have left the catalog                    | Clean up leftovers (even if their files were deleted)  |
| Everything installed and healthy                                  | No recommendation; the list is there when you need it  |

The entries are Set up, Install, Repair, Restore, Update, Remove, Check status, Clean up, Browse the
catalog, Search the catalog, Work in a different folder, Show all commands, and Quit. Entries that
cannot apply are hidden (there is no "Remove" in an empty project). Inside a sigil catalog checkout
the menu also shows the author actions: Create a new artifact, Edit an artifact, Validate the catalog.
After each action you return to the menu, so one session can set up, install, and check. An error in
one action is shown and the menu stays open. Ctrl+C leaves quietly.

**Choosing a folder.** "Work in a different folder" opens a folder browser, so you never have to type
a path from memory. It starts one level up, where your other projects usually are, and lists folders
that look like projects first. Move with the arrow keys: pick a folder to step into it, "Up one level"
to go back, and "Use <folder>" to choose the one on screen. Starting a new project? Pick "New folder
here" and type a name, and sigil creates it for you. "Type a path" is there for another drive or a
pasted path; if the folder does not exist yet, sigil asks whether to create it. A path that is a
file, or sits under a file, is rejected with a message.

**Claude Code and Copilot in one folder.** The header counts what is installed for each tool
(`3 Claude Code, 2 GitHub Copilot`). Update, Remove, Check, and Clean up act on one tool at a time, so
when both have installs the menu asks "Which tool?" first. When only one has installs, it is used
without asking.

**What counts as "set up".** Claude Code is set up when the folder has `.claude/`. Copilot is set up
when it has one of `.github/copilot-instructions.md`, `.github/instructions/`, `.github/prompts/`,
`.github/agents/`, or `.github/skills/`. A `.github/` folder that only holds workflows or issue
templates does not count, so a normal GitHub repo is not mistaken for a Copilot project.

**Installing in the wrong place.** Choosing Install, Set up (or installing from a search result) in your
home folder, the top of a drive, or a sigil catalog checkout first says why that is probably a mistake
and asks "Where should sigil install?" with three answers: "Pick another folder" (the default; it opens the
folder browser, with the folder you are leaving labelled, and carries on there), "Use this folder anyway",
and "Back to the menu". Going ahead is remembered for that folder, so the menu stops recommending a different
folder and does not ask again until you switch folders.

**After an install or a set up.** The menu does not repeat its full list. A short "What next?" menu follows:
"Done" first after an install, "Install artifacts" first after a set up, then "Check what's installed", "Also set up
for <tool>" while a tool is left, and "Show all options" for the full menu. If something more urgent is advised
(a damaged record, deleted files), the full menu shows instead. The whole session is one frame, and the output of
each command stays inside it.

**Which tool?** When the folder is set up for exactly one tool, Install does not ask which tool: it says
"Installing for Claude Code, the tool set up in this folder" and goes straight to "What would you like to
install?". `sigil add --target <name>` does the same for any folder. The question appears only when
no tool, or more than one, is set up. "← Back" on the first question returns to the menu.

**A damaged install record.** If `.sigil/manifest.json` cannot be read, the header says so and the
menu offers "Repair the install record". It moves the damaged file aside as
`.sigil/manifest.damaged-<time>.json` (nothing is deleted) and starts a fresh record. Files that were
already installed stay where they are, but sigil stops tracking them, so installing them again asks
before replacing anything.

**Setting up another tool.** The set-up entry stays in the menu until every tool has its folders. Once one
tool is set up it reads "Also set up for GitHub Copilot" and creates those folders without asking; with
several tools left it reads "Set up another AI tool" and asks which. Lists of tools in the menu are
short ("A, B, C or 2 more"), so a new provider never makes a line longer. `sigil init` run by hand still
lists every tool, the ones not set up first. It says when a folder already exists and points to "Install
artifacts" next. The recommended entry's hint says what the entry does as well as why it is first.

**When something cannot be written.** A read-only or locked folder shows the system's message plus a
line telling you to pick another folder or check what is holding it.

**Search.** "Search the catalog" asks for a word, then shows the matches as a list. Pick one to see its
details; sigil then offers to install it, and says which helper rules or agents come with it. No
match is said plainly. "Browse the catalog" lists by kind and points you to Install or Search.

**Removing something you edited.** Remove asks what to do with files you changed after installing:
keep them (they stay active, and sigil stops tracking them) or delete them too. The `Equivalent
command:` it prints, such as `sigil uninstall <id> --yes --force`, matches what you chose.

Each entry runs the same code as the matching command. The guided flows print an
`Equivalent command:` line, so you learn the command as you go and can repeat it in a script.

**Outside a terminal** (a pipe, CI, a script) `sigil` with no command prints the command list on
standard output and exits 0, so nothing changes for automation.

### Guided commands

You can also reach the guided flows directly. These ask questions only in a terminal; in a script or CI
each behaves exactly as before.

| Command           | Guided when                                                  | What it asks                                                                                    |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `sigil add`       | No selector (`-i` forces)                                    | The install wizard below                                                                        |
| `sigil init`      | No `--target`                                                | Which AI tool the project is for (the one already in the folder is first)                       |
| `sigil uninstall` | No ids                                                       | Tick what to remove; if you edited any of its files, keep them or delete them too; then confirm |
| `sigil update`    | No `--yes` and no `--dry-run`                                | Shows what would change, then: apply / apply and overwrite my edits / choose which / cancel     |
| `sigil prune`     | No `--apply` and no `--json`, and something would be removed | After the preview: remove them now?                                                             |
| `sigil new`       | No kind (`-i` forces)                                        | Scaffolds a new catalog artifact (authors)                                                      |
| `sigil edit <id>` | No `--yes`                                                   | Edits title, description, and tags (authors)                                                    |

In a script, pass what the command needs: `sigil uninstall <ids...>`, `sigil init --target claude`,
`sigil update --yes`, `sigil prune --apply --yes`, `sigil add <selectors> --yes`. Without a terminal and
without those, `uninstall` and `init` stop with a message that shows the command to run.

`new` and `edit` are for catalog authors; see [authoring.md](authoring.md). The rest of this section
is about the install wizard, `sigil add`.

```bash
sigil add
```

Use the arrow keys and Enter. A short "How this works" note comes first. Every step has a **← Back**
row, and Ctrl+C cancels without writing anything. In the picker, Space ticks an item and Enter
confirms; Enter with nothing ticked asks again instead of going back. The steps run in this order; a
step that does not apply to your choices is skipped:

1. **Which AI tool** — Claude Code or GitHub Copilot. The question says what sigil found in the
   folder; with nothing found, Claude Code is preselected and the question says so.
2. **Scope** — Pick specific items (preselected), Recommended (a curated pack), or Everything.
   Everything asks "Install all N artifacts?" (default No) because it includes hooks and MCP servers,
   which run commands and connect to services.
3. **Pack** — only under Recommended: which bundle.
4. **Browse and pick** — only under Pick specific items: choose a type (skills, agents, rules,
   commands, MCP servers, hooks, settings) or "All types", then tick the items you want.
5. **Language** — for code artifacts, an optional "Narrow by language?" step. Press Enter to keep all.
   It appears only when there are at least two languages to choose between.
6. **Helpers** (dependencies) — shows the rules and agents your picks refer to through `uses:`. These
   are the author's recommendation. Yes installs them (recommended); No installs only what you picked,
   like `--no-deps`.
7. **Replace existing files?** — asked only when a pick would meet a file that is already there and is
   not an untouched sigil install: one you edited, one sigil did not write, or one the catalog has
   updated. The step names each one and why. No keeps your files and installs the rest (default);
   Yes replaces them, and your edits to them are lost (`--overwrite`). With nothing to replace there
   is no question.
8. **Where to save config** — only when you picked an MCP server, hook, or settings artifact:
   "This project, shared with your team" (`project`, recommended), "This project, just me" (`local`),
   or "All my projects" (`user`). Each choice shows the file it writes. A note appears when that file
   is in your home folder, and a stronger warning when it affects every project.
9. **Proceed** — an Install plan box lists your picks (`your pick`), the extra artifacts pulled in
   (`dependency of <skill>`), which are already up to date and will be skipped, and which the chosen
   tool cannot take (for example hooks on Copilot). If there is nothing new to install it says so and
   offers only Back or Cancel. Confirm to write.

When it finishes, sigil prints a **Next:** line (open a new Claude Code session, or reload the VS
Code window for Copilot) and a ready-to-paste `sigil add ... --yes` line so you can repeat the same
install in a script or CI.

**What the markers in the picker mean.** Nothing is pre-ticked; the markers only tell you where each
item stands in your project:

| Marker                | Meaning                                            |
| --------------------- | -------------------------------------------------- |
| `＋ new`              | Not installed yet                                  |
| `✓ installed`         | Installed and unchanged                            |
| `↑ update available`  | The catalog has a newer version than you installed |
| `✎ you edited this`   | You changed an installed file                      |
| `⚠ not sigil's`       | A file is already there that sigil did not write   |
| `! missing from disk` | sigil installed it, but the file was deleted       |

Developers who change the wizard can read the full state model in
[`src/wizard/CLAUDE.md`](../../src/wizard/CLAUDE.md).

In a script or CI there is no wizard: `sigil add` without a selector exits with an error, so always
pass a selector and `--yes` (for example `sigil add all --yes`).

### Getting help and defaults

```bash
sigil --help                 # every command, grouped by task (same as: sigil help)
sigil add --help             # one command: its options, and the default of each
sigil help add               # the same thing
```

`sigil <command> --help` prints every option with its default in parentheses. Two defaults are written
as placeholders because they depend on where you run it: `<cwd>` is the folder you ran sigil from (the
default of `--project-dir`), and `<package>/catalog` is the catalog that ships with sigil (the default of
`--catalog-dir`). The same text, for every command, is in the
[CLI flags reference](../reference/cli-flags.md).

If you run sigil from a clone with `npm run sigil`, put `--` before sigil's own arguments:
`npm run sigil -- --help`. Without it, npm treats `--help` as its own flag and prints npm's help.

---

## Try it in a scratch project

The safest way to learn sigil is to install into a throwaway folder, break something on purpose, and
watch each lifecycle command respond. Nothing here touches your real projects. Every command below
runs from the scratch folder, so `--project-dir` defaults to it. Replace `sigil` with
`node <abs-path>/dist-cli/cli.js` if you did not link.

**1. Make a scratch folder and prepare it for Claude Code.**

```bash
mkdir sigil-scratch
cd sigil-scratch
sigil init --target claude
```

```
  created .claude/skills/
  created .claude/rules/
  created .claude/agents/

✓ claude project structure initialised.
```

**2. Install a skill.** It brings along its rule and agent.

```bash
sigil add skill:csharp/cs-generate-tests --yes
```

```
✓ 3 operation(s) applied to .
  .claude/skills/cs-generate-tests/SKILL.md
  .claude/rules/csharp-cs-testing.md  (dependency)
  .claude/agents/cs-code-reviewer.md  (dependency)
```

sigil also wrote `.sigil/manifest.json`, its record of what it installed.

**3. Check health.**

```bash
sigil status
```

```
  ✓  csharp/cs-generate-tests  [up-to-date]
  ✓  csharp/cs-testing  [up-to-date]  (dep of csharp/cs-generate-tests)
  ✓  csharp/cs-code-reviewer  [up-to-date]  (dep of csharp/cs-generate-tests)

  3 artifact(s): 3 up-to-date
```

**4. Edit an installed file, then check again.**

```bash
# bash
echo "<!-- my edit -->" >> .claude/rules/csharp-cs-testing.md
```

```powershell
# PowerShell
Add-Content .claude/rules/csharp-cs-testing.md "<!-- my edit -->"
```

```bash
sigil status
```

```
  ~  csharp/cs-testing  [drifted]  (dep of csharp/cs-generate-tests)
     local edits differ from installed content: .claude/rules/csharp-cs-testing.md

  3 artifact(s): 2 up-to-date, 1 drifted
```

sigil compares each file's SHA-256 with the hash it recorded at install. `drifted` means "you changed
this", not "something is wrong".

**5. Run `update`.**

```bash
sigil update --dry-run   # preview only, writes nothing
sigil update
```

```
  =  csharp/cs-generate-tests  (already up-to-date)
  =  csharp/cs-testing  (already up-to-date)
  =  csharp/cs-code-reviewer  (already up-to-date)

✓ 0 artifact(s) updated.
```

Nothing changed, and **your edit is still there**. That is by design: `update` re-renders each
artifact from the catalog bundled with your sigil version and only writes files whose catalog output
changed since you installed. This catalog has not changed, so there is nothing to write, and your edit
is neither overwritten nor reported by `update`.

When a newer sigil does change a file you also edited, `update` skips that file and says
`drifted — run with --force to overwrite`. `--force` then replaces your version with the catalog's.
`--dry-run` shows what would be written or skipped (`⊘ ... drifted — would skip without --force`).
`update` also takes ids (`sigil update csharp/cs-testing`) to limit it to one artifact.

To throw away your edits and reset a file right now, reinstall it with `--overwrite`:

```bash
sigil add skill:csharp/cs-generate-tests --overwrite --yes
```

That rewrote all three files, and `sigil status` went back to `3 up-to-date`.

**6. Remove what you installed.**

```bash
sigil uninstall csharp/cs-generate-tests --dry-run   # preview
sigil uninstall csharp/cs-generate-tests --yes
```

```
Dry run — would remove 1 file(s) and reverse 0 JSON merge(s):
  - .claude/skills/cs-generate-tests/SKILL.md

✓ Uninstalled: csharp/cs-generate-tests  (1 file(s) removed)
```

Three things to know. `uninstall` needs the **bare id** (`csharp/cs-generate-tests`, no `skill:`
prefix). Outside a terminal it refuses to run without `--yes` and prints
`stdin/stdout is not interactive. Re-run with --yes to confirm.` And it removed only the skill: the
rule and agent it had pulled in stay installed as their own entries, so uninstall them by id too
(`sigil uninstall csharp/cs-testing csharp/cs-code-reviewer --yes`) if you want them gone. It will not
remove a file you edited unless you add `--force`.

**7. Tidy up with `prune`.**

```bash
sigil prune
```

```
✓ Nothing to prune — no orphaned or deprecated artifacts installed.
```

`prune` handles artifacts that no longer exist in the catalog (for example after you upgrade sigil
and the catalog dropped one). It only previews until you add `--apply`. When something is orphaned,
the preview looks like this:

```
1 orphaned artifact(s) — no longer in the bundled catalog:
  ✗  csharp/gone-rule

Run `sigil prune --apply` to remove the orphaned artifact(s).
```

`sigil prune --apply --yes` then removes the entry and its files (still protecting files you edited
unless `--force`). Artifacts that are deprecated but still in the catalog are only reported.

**8. Clean up.** Delete the folder.

```bash
cd ..
rm -r sigil-scratch
```

---

## Add a skill to a Claude Code project

The walkthrough above is exactly this. In your real project root:

```bash
sigil init --target claude        # optional if .claude/ already exists
sigil add skill:csharp/cs-generate-tests
```

Files written:

```
.claude/skills/cs-generate-tests/SKILL.md
.claude/rules/csharp-cs-testing.md          ← C# testing rule (path-scoped via paths:)
.claude/agents/cs-code-reviewer.md          ← C# code-reviewer agent
```

Claude Code loads `.claude/rules/*.md` natively on every session. The rule and agent come from the
skill's `uses:` dependency closure automatically.

---

## Add a skill to a GitHub Copilot project

```bash
sigil init --target copilot
sigil add skill:python/py-generate-tests --target copilot
```

Files written:

```
.github/skills/py-generate-tests/SKILL.md
.github/skills/py-generate-tests/references/fixtures.md
.github/instructions/python-py-conventions.instructions.md   ← applyTo: "**/*.py"
.github/agents/code-reviewer.agent.md
```

What Copilot targets receive, by kind:

| Catalog kind   | Written to                                                             |
| -------------- | ---------------------------------------------------------------------- |
| skill          | `.github/skills/<name>/SKILL.md` (plus any `references/` files)        |
| rule           | `.github/instructions/<id>.instructions.md`                            |
| agent          | `.github/agents/<name>.agent.md`                                       |
| prompt         | `.github/prompts/<id>.prompt.md`                                       |
| mcp            | merged into `.vscode/mcp.json` (VS Code) and `.mcp.json` (Copilot CLI) |
| hook, settings | **Not supported** for Copilot. `add` skips them with a warning         |

Copilot Chat applies `.github/instructions/*.instructions.md` to files matching `applyTo`, and loads
`.github/skills/*/SKILL.md` as native Agent Skills. There is no Copilot plugin or marketplace channel
yet. See the full per-kind table in [capabilities.md](../reference/capabilities.md) and the proposal in
[ideas/copilot-plugin-channel.md](../ideas/copilot-plugin-channel.md).

---

## Install a pack as a Claude plugin

Besides copying files into your project with `sigil add`, sigil can compile the catalog into **Claude
Code plugins** that you install from a local marketplace. This is the only plugin flow today, and it
needs a local clone of sigil, because the marketplace is built on your machine. A published
marketplace you could add without a clone is planned
([ideas/publish-claude-marketplace.md](../ideas/publish-claude-marketplace.md)).

```bash
# 1. In your sigil clone (see operations.md#build-and-link): build the Claude plugins.
sigil build --target claude
# → writes dist/claude/ (marketplace + one plugin per pack)

# 2. In Claude Code, add that folder as a marketplace (use the absolute path), then install a pack:
#    /plugin marketplace add <abs-path-to-sigil>/dist/claude
#    /plugin install dotnet-tooling@sigil
```

The marketplace is named `sigil`, and each pack in `packs.yaml` becomes a plugin of the same name,
for example `essentials`, `dotnet-starter`, `dotnet-tooling`, `python-starter`, `react-starter`,
`typescript-starter`, `typescript-tooling`, `angular-starter`, `angular-tooling`, and `spec-driven`.
`dist/claude/.claude-plugin/marketplace.json` lists them all. Without `--target`, `sigil build` builds
**both** targets (`dist/claude/` and `dist/copilot/`).

**What a plugin carries.** Skills, agents, and workflows. Rules cannot ride in a plugin as loose
files, so each rule a skill uses is **inlined** into that skill's `SKILL.md` under `## Applied Rules`.
MCP servers, hooks, settings, and prompts are not packaged into plugins yet; install those with
`sigil add`. The per-kind table is in [capabilities.md](../reference/capabilities.md).

```
dist/claude/
  .claude-plugin/marketplace.json
  plugins/dotnet-tooling/
    .claude-plugin/plugin.json          ← version = sigil package version
    skills/cs-generate-tests/SKILL.md   ← rule bodies inlined under ## Applied Rules
    agents/cs-code-reviewer.md
    agents/cs-architecture-reviewer.md
    …
```

Every plugin's `version` is written from the sigil package version at build time
(`src/targets/claude-code/plugin-assemble.ts`), so after pulling a newer sigil, rebuild and run
`/plugin update` in Claude Code.

**Plugin or `add`?** Use `sigil add` when you want files you can see, edit, and commit in your
project, and for hooks, settings, MCP servers, and prompts. Use the plugin when you want Claude Code to
manage skills and agents as an installable unit.

---

## Browse the catalog

```bash
sigil list                      # all artifacts
sigil list --language python    # filter by language
sigil list --kind skill         # skill | agent | rule | prompt | workflow | mcp | hook | settings | template
sigil search "generate tests"   # free-text search
sigil get csharp/cs-generate-tests   # one artifact: dependencies, targets, destination paths
```

**Expected output (`sigil list --kind skill --language csharp`):**

```
SKILL (7)
  csharp/cs-add-package [csharp] — Vet and wire a NuGet package through Central Package Management — checks CVEs, maintenance, transitive footprint, and license before adding
  csharp/cs-audit-deps [csharp] — Audit NuGet dependencies — known CVEs, outdated versions, deprecated packages, unused references, and license compliance
  csharp/cs-document [csharp] — Generate or update XML doc comments and module-level documentation following the project's documented docstring style
  csharp/cs-release [csharp] — Prepare a .NET release — verify quality gates, generate a changelog from git log, and propose a version bump with SemVer classification
  csharp/cs-scaffold-project [csharp] — Scaffold a new .NET project with the solution's standards pre-wired — NRT, analyzers, CPM, file-scoped namespaces, correct src/tests layout — and add it to the .sln
  csharp/cs-generate-tests [csharp] — Generate an xUnit + Moq test suite for a C# file or class following the project's documented test conventions
  csharp/cs-sync-tests [csharp] — Sync the xUnit test suite with source code — add missing tests, update stale ones, and remove orphaned tests (with confirmation before deletion)
```

An unfiltered `sigil list` has the same shape: a `KIND (N)` header, then
`  <id> [<language>] — <description>` per artifact. `template` is a catalog kind that `list` can filter,
but neither target installs it.

---

## Bulk install

```bash
# Full catalog — Claude Code
sigil add all --target claude --yes

# All artifacts from one pack
sigil add pack:dotnet-tooling --target claude --yes

# Full catalog except prompts — GitHub Copilot
sigil add all --target copilot --exclude prompt --yes

# Only agents and rules, no skills or prompts
sigil add all --kind agent,rule --target claude --yes
sigil add kind:agent kind:rule --target claude --yes

# --kind also accepts workflow, mcp, hook, and settings (comma-separated)
sigil add all --kind mcp,hook,settings --target claude --scope project --yes
```

---

## Install a skill without its dependencies

By default `add skill:...` writes the skill **plus** the rules and agents it references. Use
`--no-deps` if you manage those separately:

```bash
sigil add skill:csharp/cs-generate-tests --no-deps --target claude --yes
# Writes only the skill folder: .claude/skills/cs-generate-tests/SKILL.md
```

"Skill folder" means `SKILL.md` plus any `references/*.md` files that skill ships. Some skills have
reference files and `cs-generate-tests` happens to have none, so only `SKILL.md` appears here.

---

## Preview before writing (dry run)

```bash
sigil add skill:csharp/cs-generate-tests --target claude --dry-run --yes
```

`+` marks new files and `~` marks conflicts. Nothing is written. With
`.claude/skills/cs-generate-tests/SKILL.md` already on disk and no sigil record of it:

```
Dry run — files that would be written:
  + .claude/rules/csharp-cs-testing.md
  + .claude/agents/cs-code-reviewer.md
  ~ .claude/skills/cs-generate-tests/SKILL.md  (exists — would be overwritten with --overwrite)

2 new, 1 conflict(s). No files were written.
```

---

## Handle conflicts

Existing files are **never overwritten** unless you pass `--overwrite`:

- An artifact that is already installed and unchanged is a skip, not a conflict:
  `=  csharp/cs-generate-tests  (✓ already up to date — skipped)`. When every requested id is
  up to date the command prints `No artifacts to install (all were filtered out or unsupported).`
  Those skips do not change the exit code.
- A file that exists but that sigil does not own is a conflict. The other new files are still
  written, and sigil lists the ones it left alone and tells you to re-run with `--overwrite` or
  `--dry-run`.
- `--overwrite` also reinstalls an up-to-date artifact, which makes it the way to reset a file you
  edited.
- A file sigil installed that you then **deleted** is written again by `sigil add <that file's own id>` (or
  `add --overwrite`). Adding a skill that depends on it does not restore it: the dependency is already recorded as
  installed, so `add` skips it.

```bash
sigil add skill:csharp/cs-generate-tests --target claude --overwrite --yes
```

---

## Keep installs healthy over time

sigil records what it wrote in `.sigil/manifest.json`: each artifact, its files, and the SHA-256 hash
of every file at install time.

> **Commit this file.** `.sigil/manifest.json` is project state, not a build artifact. Committing it
> lets every teammate and CI run use the commands below with the full install history.

| Command                    | What it does                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `sigil status`             | Reports each installed artifact's health. Writes nothing                                         |
| `sigil update [ids...]`    | Re-renders installed artifacts from the current catalog; skips files you edited unless `--force` |
| `sigil uninstall <ids...>` | Removes artifacts and their files; a file another entry still uses is kept                       |
| `sigil prune`              | Previews removal of entries whose ids left the catalog; `--apply` removes them                   |

All four accept `--project-dir` and `--target`. Step-by-step output for each is in
[Try it in a scratch project](#try-it-in-a-scratch-project).

**Status values:**

| Status       | Meaning                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `up-to-date` | Files match what sigil installed                                                                                                                   |
| `outdated`   | The artifact's shared template was revised since you installed. Run `sigil update`                                                                 |
| `drifted`    | You edited a file. `update` keeps your version unless the catalog changed it too, and then needs `--force`                                         |
| `missing`    | A file sigil installed was deleted. `sigil add <that entry's own id>` writes it again; `update` restores only config entries (MCP, hook, settings) |
| `orphaned`   | The artifact is no longer in the catalog. `sigil prune` reports it and `--apply` removes it                                                        |

A non-`up-to-date` row prints its reason on the next line. `status` is diagnostic only: a catalog
change that is not a template revision still shows `up-to-date` here, and `sigil update` applies it
anyway. Config entries (MCP servers, hooks, settings) never show as `outdated`; a changed JSON
fragment shows as `drifted` or `missing`. Catalog **authors**, not consumers, run `sigil sync` to fix
artifacts that drifted from their own template; see
[authoring.md § Keeping artifacts in sync with their template](authoring.md#keeping-artifacts-in-sync-with-their-template).

---

## Enable tab-completion

```bash
# Bash — add to ~/.bashrc
eval "$(sigil completion)"

# Zsh — add to ~/.zshrc
eval "$(sigil completion zsh)"

# Fish
sigil completion fish | source
```

After sourcing, `sigil add <Tab>` suggests `all`, `pack:dotnet-tooling`, `kind:skill`,
`skill:csharp/cs-generate-tests`, and so on. Flag values complete too: `--target <Tab>` gives
`claude copilot`.

---

## Where files go

- **Catalog source** is embedded in the package, so you can run `sigil` from any directory.
- **Output root** defaults to the current directory. Override it with `--project-dir`.

```bash
# Monorepo: install into one package
sigil add skill:csharp/cs-generate-tests --project-dir packages/my-api --yes
```

Claude Code writes to `.claude/` and Copilot writes to `.github/`. Auto-detection looks for `.claude/`
and for Copilot's own files (see "What counts as set up" above) at the project root; when both are
there it picks `claude`, and when neither is it defaults to `claude`. Override with `--target`.

---

> **Troubleshooting** (wizard hangs, conflicts, schema errors): [reference/troubleshooting.md](../reference/troubleshooting.md)
> **Full flag reference**: [reference/spec.md § CLI reference](../reference/spec.md#cli-reference)
