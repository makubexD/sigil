# Plan: Antigravity target, Phase G (close-out)

Phase G of [plan-antigravity-target.md](plan-antigravity-target.md). Evidence:
[antigravity-target-2026-11.md](decisions/antigravity-target-2026-11.md) (B1, C1, D1/D2, E1, F1/F2, and G1/G2 below).
The phase follows [Rules for every target](reference/architecture.md#rules-for-every-target). Branch
`docs/plan-antigravity-target-g`, one PR.

Phases A-F and H are merged (#168-#174). Phase G owes four things: an answer to F1h (does `agy plugin install` take a
GitHub URL that points at one plugin's subfolder), the probes kept as one re-runnable command (the ADR's maintenance
note: every `agy` update needs them re-run), a live check of every shipped kind on the current `agy`, and the paperwork
(ADR status, the brief deleted, references repointed so the plan files can go).

## Decisions

1. **The probe command.** `npm run probe:antigravity` runs `scripts/probe-antigravity.mjs`. It is not part of
   `npm test`, `check` or `ci:local`, because every probe is a model call. Without `agy` on PATH it prints a skip
   notice and exits 0. It exits 1 when any probe's result differs from the recorded one, so an `agy` update that
   changes a finding is loud.
2. **It probes sigil's real output, not hand-written files.** The script copies `catalog/` to a temp dir, adds the
   probe artifacts from `scripts/antigravity-probe/catalog/` to that copy, and installs them with
   `sigil add --catalog-dir <copy>` or builds them with `sigil build --target antigravity --catalog-dir <copy> --packs
scripts/antigravity-probe/packs.yaml --out-dir <tmp>`. So one run is both the binary re-check and the live check of
   each kind. The one exception is B1's `trigger: glob` rule, which sigil does not emit (it is skipped by
   `skipReason`); the script writes that file itself, so the probe tells us when the skip can go.
3. **Codewords, as in every phase.** Each probe artifact carries its own codeword (`SKILL-G`, `RULE-G`, `GLOB-G`,
   `AGENT-G`, `FILE-G`, `PLUGIN-G`). A pass needs the codeword in the model's final answer, not just a file read.
4. **Probe rules** (as in Phases B-F): record `agy --version`; runs use
   `agy --model <model> --output-format stream-json --print-timeout 90s [--settings …] -p "…"` with `-p` last, and
   `<model>` defaulting to `gemini-3.8-flash-low` (`--model` overrides). Each probe runs in a fresh `git init` repo in
   its own `mkdtemp` folder under `os.tmpdir()`, never in this repo. Writes need the session-only allow
   `write_file(*)`, shell `command(*)`, MCP `mcp(*)`. Plugin cleanup: `agy plugin uninstall <name>`, then
   `agy plugin list --json` must be `[]`; remove `~/.gemini/config/plugins/` if empty and
   `~/.gemini/config/import_manifest.json`. Never touch anything else in `~/.gemini/`.
5. **Expected results are data.** Each probe in the script has `id`, `adr` (the ADR row it re-checks), `expect`
   (`pass` or `fail`, the result recorded on `1.4.12`), and a `check(stream, repo)` returning `pass`/`fail` plus one
   evidence line. G-glob expects `fail` (B1: never attaches). A result different from `expect` prints `CHANGED` with
   the ADR row to revisit.
6. **F1h decides the setup page's install routes.** If a GitHub subfolder URL installs, the setup page documents it
   as the route once a release publishes the built plugins on a branch (that publishing is release work, not this
   phase). If not, the page says the routes are a local path or a workspace copy, and the roadmap's release note drops
   the branch idea.
7. **Plan files go after merge**, in a follow-up PR, as Codex did (#150). This phase only repoints every reference
   to them (code comments, the ADR, other decisions) so the deletion leaves no dead link.

## Step 1 `[inline: probe measures agy's GitHub install route]`: G1 (F1h) in the ADR

1. On a throwaway branch `probe/antigravity-plugin-url` of `makubexD/sigil` (public), commit only a hand-built plugin
   at `probe/plugins/sigil-url-probe/` (`plugin.json` with `name`, and `skills/url-probe/SKILL.md` answering
   `URL-G1` for "the url-probe marker"). Push it.
2. Read [Plugins](https://antigravity.google/docs/plugins) for the documented GitHub URL form. Try, in a scratch
   repo, each of: the documented form; `https://github.com/makubexD/sigil/tree/probe/antigravity-plugin-url/probe/plugins/sigil-url-probe`;
   and the repo URL with the subfolder in whatever separate flag or `#`/`//` form the docs or `agy plugin install
--help` name.
3. For the form that installs (if any): ask for the url-probe marker; pass is `URL-G1`.
4. Clean up (decision 4), then delete the remote branch (`git push origin --delete probe/antigravity-plugin-url`)
   and the local one.

| Case | Action                                     | Pass                                        |
| ---- | ------------------------------------------ | ------------------------------------------- |
| G1a  | the documented GitHub form, if any         | installs, `URL-G1` answered                 |
| G1b  | `/tree/<branch>/<subfolder>` URL           | installs, `URL-G1` answered                 |
| G1c  | repo URL plus a subfolder flag/suffix form | installs, `URL-G1` answered; else the error |

Record a `### Phase G` subsection after `### Phase F` in the ADR's probe log with row G1 (each form tried, its exact
output, the version). Then apply decision 6 to `docs/setup/antigravity.md` (install routes) and to the roadmap's Phase
G paragraph.

Test: `npx prettier --check docs/decisions/antigravity-target-2026-11.md docs/setup/antigravity.md docs/plan-antigravity-target.md`;
`git ls-remote origin probe/antigravity-plugin-url` prints nothing.

## Step 2 `[worker:medium]`: probe fixtures

New folder `scripts/antigravity-probe/` (no other file changes):

- `catalog/shared/skills/probe-skill/SKILL.md`: a skill named `probe-skill`, description "Answers the probe-skill
  marker question.", body: "When asked for the probe-skill marker, answer exactly `SKILL-G`." Model the frontmatter on
  an existing `catalog/shared/skills/*/SKILL.md`, with only the required fields.
- `catalog/shared/rules/probe-rule.rule.md`: a repo-wide rule (no `appliesTo`), id `shared/probe-rule`, body: "When
  asked for the probe-rule marker, answer exactly `RULE-G`." Model it on an existing shared rule.
- `catalog/shared/agents/probe-agent.agent.md`: agent `probe-agent`, `tools: [read]`, `model: fast`, body: "You are
  the probe agent. When asked for your marker, answer exactly `AGENT-G`. When asked to read a file, read it with your
  file tool and repeat its content."
- `catalog/shared/mcps/probe-env.mcp.md`: a stdio server, key `probe-env`, command `node`, args
  `["__PROBE_SERVER__"]` (the runner replaces it with the absolute path of `mcp-server.mjs`), and an identity env
  entry `PROBE_G: "{sigil:env:PROBE_G}"`. Model it on `catalog/shared/mcps/filesystem.mcp.md`.
- `mcp-server.mjs`: a dependency-free MCP stdio server (newline-delimited JSON-RPC) that answers `initialize`,
  `notifications/initialized` (no reply), `tools/list` with one tool `probe_env` (no arguments), and `tools/call` of
  it with text `PROBE_G=<process.env.PROBE_G>`. Any other method gets a JSON-RPC `-32601` error.
- `packs.yaml`: one pack, `name: probe`, `displayName: Probe`, a one-line description, `artifacts:` the skill, rule
  and agent above, and nothing else.
- `glob-rule.md`: the raw `.agents/rules/` file B1 used, `trigger: glob`, `globs: "src/**/*.ts"`, body "When asked
  for the probe-glob marker, answer exactly `GLOB-G`."

Test (from the repo root, after `npm run build`):

```bash
T=$(mktemp -d) && cp -r catalog "$T/catalog" && cp -r scripts/antigravity-probe/catalog/. "$T/catalog/" \
  && sed -i "s#__PROBE_SERVER__#$PWD/scripts/antigravity-probe/mcp-server.mjs#" "$T/catalog/shared/mcps/probe-env.mcp.md" \
  && node dist-cli/cli.js validate --catalog-dir "$T/catalog" \
  && node dist-cli/cli.js build --target antigravity --catalog-dir "$T/catalog" --packs scripts/antigravity-probe/packs.yaml --out-dir "$T/dist" \
  && ls "$T/dist/antigravity/plugins/probe/skills/probe-skill/SKILL.md" "$T/dist/antigravity/plugins/probe/rules" "$T/dist/antigravity/plugins/probe/agents/probe-agent.md" "$T/dist/antigravity/plugins/mcp-probe-env/mcp_config.json"
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"probe_env","arguments":{}}}' \
  | PROBE_G=x node scripts/antigravity-probe/mcp-server.mjs   # prints a result whose text is PROBE_G=x
npm run check
```

Every command exits 0; validate reports no error.

## Step 3 `[worker:medium]`: the runner, with the skill and rule probes

`scripts/probe-antigravity.mjs` (ESM, Node built-ins only), plus `"probe:antigravity": "node
scripts/probe-antigravity.mjs"` in `package.json` scripts:

- **Flags:** `--model <id>` (default `gemini-3.8-flash-low`), `--only <id,…>`, `--dry-run` (set up every probe
  repo and print each command it would run, run no `agy`), `--keep` (leave the temp folders and print their paths).
- **Setup, once per run:** `agy --version` (absent → print `skip: agy not on PATH` and exit 0, even with
  `--dry-run`); the catalog copy and overlay exactly as in step 2's test, into one `mkdtemp`; the sigil CLI is
  `node <repo>/dist-cli/cli.js` (fail with "run npm run build first" if it is missing).
- **Per probe:** a fresh `mkdtemp` repo with `git init -q`; `setup(repo)`; then `agy` per decision 4 with the
  probe's prompt and allow list, `cwd: repo`, `env` = process env plus the probe's own; collect stdout lines, parse
  each as JSON (skip lines that don't parse); the final answer is the concatenated text of the assistant message
  events (read one `--dry-run`-free run's stream to confirm the event shape and write it down in a comment).
  `check()` per decision 5. A probe's `teardown()` runs in `finally`.
- **Output:** one line per probe, `<id>  <adr>  expect=<pass|fail>  got=<pass|fail>  OK|CHANGED  <evidence>`, then
  `agy <version>, model <model>`. Write each stream to `<tmp>/<id>.jsonl` and print that folder. Exit 1 if any
  `CHANGED` or any `agy` exit that is not 0, else 0.
- **Probes in this step:**
  - `G-skill` (adr P1/B): setup `sigil add shared/probe-skill --target antigravity --scope local --yes --catalog-dir
<copy>`; prompt "What is the probe-skill marker? Answer with the marker only."; pass: answer contains `SKILL-G`.
  - `G-rule` (adr B): setup `sigil add shared/probe-rule …` (same flags); prompt "What is the probe-rule marker?
    Answer with the marker only."; pass: `RULE-G`.

Use the actual ids `sigil list --catalog-dir <copy>` shows for the step 2 artifacts if they differ.

Test: `node scripts/probe-antigravity.mjs --dry-run` exits 0 and prints two probe lines with their `agy` commands;
`PATH=/usr/bin:/bin node scripts/probe-antigravity.mjs` prints the skip line and exits 0 (adjust so `node` resolves,
e.g. `PATH=$(dirname $(which node)):/usr/bin:/bin`, as long as `agy` is not on it); `npm run check` green.

## Step 4 `[worker:medium]`: the remaining probes

Add to the runner's probe list, same shape as step 3:

| id           | adr   | expect | setup                                                                                                                                                                                | run                                                                                                                                     | pass                                                                             |
| ------------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `G-glob`     | B1    | fail   | copy `glob-rule.md` to `.agents/rules/probe-glob.md`; write `src/app.ts` with `export const a = 1;`                                                                                  | allow `write_file(*)`, `edit_file(*)`: "Add the line `export const b = 2;` to src/app.ts, then tell me the probe-glob marker, or NONE." | answer contains `GLOB-G`                                                         |
| `G-agent`    | D1/D2 | pass   | `sigil add shared/probe-agent …`; write `note.txt` holding `FILE-G`                                                                                                                  | `agy … --agent probe-agent -p "Say your marker, then read note.txt and repeat its content."`                                            | answer contains `AGENT-G` and `FILE-G`                                           |
| `G-mcp`      | C1/P5 | pass   | `sigil add shared/probe-env …`                                                                                                                                                       | env `PROBE_G=g-ok`; allow `mcp(*)`: "Call the probe_env tool of the probe-env MCP server and repeat its result."                        | answer contains `PROBE_G=g-ok`                                                   |
| `G-hook`     | E1    | pass   | `sigil add shared/protect-config …` (the real catalog hook)                                                                                                                          | allow `write_file(*)`: "Use your file-writing tool to create .env holding A=1."                                                         | no `.env` in the repo, and the stream contains `blocked write to protected file` |
| `G-plugin`   | F1/F2 | pass   | `sigil build --target antigravity --catalog-dir <copy> --packs scripts/antigravity-probe/packs.yaml --out-dir <tmp>/dist`; `agy plugin install <tmp>/dist/antigravity/plugins/probe` | "What is the probe-skill marker? Answer with the marker only." (repo has no `.agents/`)                                                 | answer contains `SKILL-G`; teardown uninstalls and cleans up per decision 4      |
| `G-validate` | F2d   | pass   | the same build                                                                                                                                                                       | `node scripts/validate-antigravity-plugins.cjs` with `SIGIL_ANTIGRAVITY_DIST=<tmp>/dist/antigravity/plugins` (no model call)            | exit 0                                                                           |

`G-agent` runs `agy` with `--agent probe-agent` before `-p`. `G-plugin`'s teardown must run even when the probe throws,
and must fail the run loudly if `agy plugin list --json` is not `[]` afterwards.

Test: `node scripts/probe-antigravity.mjs --dry-run` exits 0 and prints eight probe lines; `node
scripts/probe-antigravity.mjs --dry-run --only G-hook,G-mcp` prints two; `npm run check` green.

## Step 5 `[inline: live check measures Antigravity]`: G2, the probe run

Run `npm run build && npm run probe:antigravity` (the auto-mode classifier may need the exact command added to
`.claude/settings.local.json`; on a denial, stop and report). Expected: every line `OK`, exit 0, `agy plugin list
--json` is `[]` afterwards.

Record G2 in the ADR's `### Phase G` subsection: `agy` version, model, one row per probe with its evidence line. A
`CHANGED` line is a stop: report it with the stream lines and don't merge, unless it is `G-glob` passing, which is good
news: record it and open a follow-up to remove the scoped-rule `skipReason` (B1).

Test: `npx prettier --check docs/decisions/antigravity-target-2026-11.md`.

## Step 6 `[inline: user-facing docs and ADR prose]`: close-out docs

- ADR: Status line → "shipped 2026-11-02 (Phases A-H): skills, rules (always-on), MCP, agents and hooks on the
  scaffold and plugin channels. Probed on Antigravity CLI `<version>`, Linux." The brief link in the header becomes
  "The brief it started from was deleted once this record covered it." The maintenance-cost bullet names
  `npm run probe:antigravity` as the re-run.
- Delete `docs/ideas/antigravity-cli-target.md`; remove its row from `docs/ideas/README.md`; in
  `docs/ideas/cursor-target.md`, point the `antigravity-cli-target` link at the ADR.
- `docs/setup/antigravity.md`: a short "After an `agy` update" section: run `npm run probe:antigravity`; any
  `CHANGED` line names the ADR row to revisit.
- `docs/reference/cli-flags.md`: paste the current `sigil build --help` (its `--target` list lacks `antigravity`),
  and any other command whose `--help` output differs.
- Roadmap: `### Phase G: close-out (done <date>)` with a paragraph (G1 answer, the probe command, G2), the G row in
  the phase table marked done, and one line: the plan files are deleted in a follow-up PR after merge.

Test: `npx prettier --write` on every touched doc, then `npm run check` green and `grep -rn
"antigravity-cli-target" docs src test README.md | grep -v "^docs/plan-"` prints nothing.

## Step 7 `[worker:medium]`: repoint references to the plan files

Every reference to `docs/plan-antigravity-*.md` outside those files must point somewhere that survives their
deletion. Replace each one as follows, keeping the rest of the comment or sentence:

| Reference                                         | Becomes                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `plan-antigravity-target-b.md …` (decision/step)  | `docs/decisions/antigravity-target-2026-11.md` (probe A1 or B1, as the text says) |
| `plan-antigravity-target-c.md …`                  | the ADR, probe C1                                                                 |
| `plan-antigravity-target-e.md …`                  | the ADR, probe E1                                                                 |
| `plan-antigravity-target-f.md …`                  | the ADR, probe F1 (F2 for the validator)                                          |
| `plan-antigravity-target-h.md …`                  | `docs/decisions/neutral-hook-contract-2026-11.md`                                 |
| `plan-antigravity-eval.md`, the roadmap (in docs) | the ADR's probe log, or plain text "the eval" with no link                        |

Files: `src/targets/antigravity/{index,hook-ops,hook-dialect}.ts`, `scripts/validate-antigravity-plugins.cjs`,
`test/schema/hook.test.ts`, `test/targets/{antigravity-plugin-build,antigravity-mcp,antigravity-hooks,cursor-hooks}.test.ts`,
`test/commands/antigravity-hooks-install.test.ts`, `docs/decisions/{antigravity-target-2026-11,neutral-hook-contract-2026-11,target-neutrality-regression-2026-11}.md`.
Where a comment cited a plan decision for its reasoning, keep the reasoning as one sentence in the comment.

Test: `grep -rn "plan-antigravity" src test scripts docs/decisions docs/setup docs/guides docs/reference README.md
CLAUDE.md` prints nothing; `npm run check` green.

## Done when

Steps 1-7 are committed, `npm run ci:local` is green, and the PR is merged. Then the follow-up PR deletes
`docs/plan-antigravity-*.md`, and memory records the target as closed out.
