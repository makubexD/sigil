# Plan: trim the root CLAUDE.md

The root `CLAUDE.md` is 28,394 bytes (about 7k tokens), and every session loads all of it. This plan shrinks it to
under 8 KB. It keeps only what every session needs: the project's purpose in two lines, the build, test and lint
commands, the hard rules (what must never happen, one line each), and pointers to the rest. The reference text moves
word for word into `.claude/rules/repo-<topic>.md` files, each with a `paths:` frontmatter, so Claude Code loads it
only when a session works on matching files. No rule is dropped. Every sentence of the old file must still exist
somewhere: a script in step 3 checks that before the commit that deletes anything. That commit's message lists where
each moved part landed.

Out of scope: `src/wizard/CLAUDE.md` (30 KB, already loaded only under `src/wizard/`), de-duplicating against
`docs/reference/architecture.md`, and rewording any moved rule. Moved text stays word for word. Prettier may rewrap
it.

Facts this plan rests on (checked 2026-11-03 at `944a13c`):

- `.gitignore:12` ignores all of `.claude/`. That's because `sigil add` dogfooding writes rules there, as the
  `.claude/rules/typescript-ts-*` rules did (`docs/decisions/README.md:52`). So the new files use a `repo-` prefix,
  and only that prefix is un-ignored.
- Headless Claude Code refuses writes under any `.claude/` directory, so `mk-exec` can't do the rules-file steps.
- `prettier --check .` respects `.gitignore`. Once the rules files are un-ignored, `format:check` covers them.
- Docs that describe the current file: `CONTRIBUTING.md:200` ("the authoritative list of invariants") and
  `docs/index.md:36` ("Invariants that must not break, architecture, doc map").

## Where each part goes

| Old `CLAUDE.md` part                                                                                                                                                                                                                                                                                                                                      | Destination                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intro paragraph                                                                                                                                                                                                                                                                                                                                           | Replaced by the two-line purpose. The verifier exempts it, and the commit message says so.                                                                                                                                                                          |
| Build & test (commands and the pointer paragraph)                                                                                                                                                                                                                                                                                                         | Stays in `CLAUDE.md`, with `npm run lint` and `npm run format:check` added to the block                                                                                                                                                                             |
| Invariants: path anchoring, lazy command modules, conflict handling (`partitionFiles`), `src/index.ts` public surface                                                                                                                                                                                                                                     | `.claude/rules/repo-cli.md`, with paths `src/cli.ts`, `src/cli-helpers.ts`, `src/index.ts`, `src/commands/**`, `test/cli-startup.test.ts`, `test/public-api.test.ts`                                                                                                |
| Invariants: platform-neutral pipeline, `yamlScalar` descriptions, `plugin.json` version, kind support in `capabilities.ts`, `KindEmitSpec` coverage, provider limits (the `KindEmitSpec.limits` sentence), MCP env syntax, `McpDialect`, `ConfigKindTable`, lexicon bodies                                                                                | `.claude/rules/repo-targets.md`, with paths `src/targets/**`, `src/load.ts`, `src/validate/**`, `src/resolve.ts`, `src/commands/sync/**`                                                                                                                            |
| Invariants: `claude:` namespace fields, neutral tool names and model hints, neutral hook events, `appliesTo` translation, every frontmatter field mapped (tool restriction included), agents have no `whenToUse`                                                                                                                                          | `.claude/rules/repo-vocabulary.md`, with paths `src/targets/**`, `src/tool-vocabulary.ts`, `src/hook-vocabulary.ts`, `src/schema/**`, `src/commands/sync/**`, `catalog/**`                                                                                          |
| Invariants: `serialize()` vs `canonicalize()`, config-kind writes merge and back up, drift classified, a recorded fragment is replaced, `add`/`update` co-install set                                                                                                                                                                                     | `.claude/rules/repo-config-merge.md`, with paths `src/config-merge/**`, `src/manifest/**`, `src/config-utils.ts`, `src/freshness.ts`, `src/install-state-prescaffold.ts`, `src/commands/add/**`, `src/commands/update*.ts`, `src/commands/uninstall*.ts`            |
| Invariants: `serializeScalar`, `KIND_ORDER` from `KIND_REGISTRY`, zod as the single schema source, kebab-case ids, `resolveSelection()`, `safe-read` and `frontmatter-parse`, `requireValidCatalog` cache, `packs.yaml` read through `parsePacksConfig` (the second sentence of the limits bullet), leaf modules `patch-types.ts` / `translate-shared.ts` | `.claude/rules/repo-schema-and-loading.md`, with paths `src/schema/**`, `src/kinds.ts`, `src/select/**`, `src/authoring/**`, `src/load.ts`, `src/load-references.ts`, `src/safe-read.ts`, `src/frontmatter-parse.ts`, `src/catalog-cache.ts`, `src/packs-config.ts` |
| Invariants: one family one skeleton, where an artifact goes                                                                                                                                                                                                                                                                                               | `.claude/rules/repo-catalog.md`, with paths `catalog/**`, `packs.yaml`, `src/catalog-standard.ts`, `src/catalog-readme.ts`, `src/catalog-vocabulary.ts`, `src/load-references.ts`, `src/stack-index.ts`, `src/commands/sync/conformance/**`                         |
| Architecture (4-stage pipeline, DRY resolution, two Claude delivery modes, templates and emit specs, `sigil sync`, `deprecated:` and `prune`, `outdated`, `errors.ts` / `kinds.ts` / `wizard/` line)                                                                                                                                                      | `.claude/rules/repo-architecture.md`, with paths `src/**`                                                                                                                                                                                                           |
| Where everything else lives (doc table)                                                                                                                                                                                                                                                                                                                   | Stays in `CLAUDE.md`, compressed, plus a row for each rules file                                                                                                                                                                                                    |

A bullet that names several files goes to the file for its main concern. Each step 2 file gets a `paths:` list in the
frontmatter, like this:

```markdown
---
paths:
  - 'src/config-merge/**'
---
```

A file without `paths:` would load in every session, so every rules file gets one.

## Steps

### 1. Un-ignore the repo's own rules files `[inline: tiny edit]`

In `.gitignore`, replace the line `.claude/` with:

```
.claude/*
!.claude/rules/
.claude/rules/*
!.claude/rules/repo-*.md
```

Test:

- `git check-ignore -q .claude/rules/repo-x.md` exits 1 (not ignored).
- `git check-ignore -q .claude/rules/typescript-ts-x.md` exits 0 (still ignored).
- `git check-ignore -q .claude/settings.local.json` exits 0 (still ignored).

### 2. Write the rules files `[inline: headless worker refuses writes under .claude/]`

Create the seven `.claude/rules/repo-*.md` files from the table. Each gets its `paths:` frontmatter, an H1 naming the
topic, one line saying it was moved from `CLAUDE.md` (and why: it loads only for these paths), and then the
moved text copied word for word from `CLAUDE.md` at `944a13c`. Keep each bullet whole, with its bold lead and its
`(see …)` citation. Don't change `CLAUDE.md` yet. For one commit the text exists in both places, so no commit leaves a
rule in neither.

Test:

- `npx prettier --write .claude/rules/repo-*.md`, then `npx prettier --check .claude/rules/repo-*.md`.
- Every `paths:` glob matches at least one tracked file:
  `for g in $(sed -n 's/^  - .\(.*\).$/\1/p' .claude/rules/repo-*.md); do git ls-files "$g" | grep -q . || echo "no match: $g"; done`
  prints nothing. `src/commands/update*.ts`-style globs go through git's pathspec matching; quote them in the
  command, as written above.
- Run the verifier from step 3 now. `CLAUDE.md` is unchanged, so it passes trivially. Then run it once more with
  `'CLAUDE.md'` removed from its destination list. The only sentences it may report missing are from `## Build & test`
  and `## Where everything else lives`, the two parts that stay in `CLAUDE.md`.

### 3. Rewrite `CLAUDE.md` `[inline: judgment, the wording of each one-line hard rule]`

The new `CLAUDE.md`, in this order:

1. The H1 and the purpose in two lines: what sigil is (a provider-neutral catalog of AI-agent artifacts, built and
   installed per target) and the four-stage pipeline in one clause.
2. `## Build, test, lint`: the old command block, plus `npm run lint` and `npm run format:check`, and the old pointer
   paragraph (heap size, `pretest`, `ci:local` before pushing, CONTRIBUTING § B).
3. `## Hard rules`: one line for each invariant, grouped under a short label naming its rules file (for example
   `Config merge (.claude/rules/repo-config-merge.md):`). Each line says what must never happen, in a few words,
   and names the function or file it guards. No rationale, no citations: those live in the rules file. Each of the
   35 invariants gets exactly one line.
4. `## Where the rest lives`: the rules files and their scopes (one compact list), the old doc table compressed to
   one line per doc (keeping every doc path and topic phrase), and `src/wizard/CLAUDE.md`.

Test:

- `wc -c < CLAUDE.md` prints less than 8192.
- `npx prettier --check CLAUDE.md`.
- Every path the file names exists:
  `grep -oE '(\.claude/rules|docs|src)/[A-Za-z0-9_./-]+\.(md|ts)' CLAUDE.md | sort -u | while read p; do test -e "$p" || echo "missing: $p"; done`
  prints nothing.
- 35 hard-rule lines: `git show 944a13c:CLAUDE.md | sed -n '/^## Invariants/,/^## Architecture/p' | grep -c '^- \*\*'`
  prints 35, and the review lists each bold lead next to its new line.
- The verifier passes. It splits the old file's body into blocks (bullets, paragraphs), then sentences, and requires each one, with whitespace
  normalized, to appear in the new `CLAUDE.md` or a rules file:

```bash
python3 -I - <<'PY2'
import glob, re, subprocess
old = subprocess.run(['git', 'show', '944a13c:CLAUDE.md'], capture_output=True, text=True, check=True).stdout
def norm(t):
    t = re.sub(r'\A---\n.*?\n---\n', '', t, flags=re.S)
    t = re.sub(r'^#+ .*$', '', t, flags=re.M)
    t = re.sub(r'^\|[\s:|-]*\|$', '', t, flags=re.M)
    t = t.replace('**', '').replace('|', ' ')
    return re.sub(r'\s+', ' ', t)
dest = ' '.join(norm(open(p).read()) for p in ['CLAUDE.md', *sorted(glob.glob('.claude/rules/repo-*.md'))])
blocks = re.split(r'\n(?=- )|\n\s*\n', old.split('## Build & test', 1)[1])
sents = [s.strip() for blk in blocks for s in re.split(r'(?<=[.;:])\s+(?=[A-Z`(*])', norm(blk).strip().removeprefix('- '))
         if len(s.strip()) > 20]
miss = [s for s in sents if s not in dest]
print(f'{len(sents)} sentences, {len(miss)} missing')
for s in miss: print('-', s[:160])
raise SystemExit(1 if miss else 0)
PY2
```

Expected: `0 missing`. If the compressed doc table reworded a cell, the old wording has to land in a rules file
or a doc instead. Never drop it.

Commit as `docs: trim CLAUDE.md to the hard rules, full text in .claude/rules`. The body says where every moved line
went: one paragraph per destination file listing the bold leads of the invariants it took (35 in all), the
Architecture subsections → `repo-architecture.md`, and "Intro paragraph: replaced by the two-line purpose".

### 4. Point the docs at the new layout `[inline: tiny edit]`

- `CONTRIBUTING.md:200`: `CLAUDE.md` holds the hard rules, and their full text is in `.claude/rules/repo-*.md`.
  Together, these are the authoritative list.
- `docs/index.md:36`: change the description to "Purpose, commands, hard rules, pointers (full rules in
  `.claude/rules/`)".
- In `CONTRIBUTING.md`, next to the line 200 text, add one line: a new repo rule goes in a
  `.claude/rules/repo-<topic>.md` file with `paths:`, plus a one-line hard rule in `CLAUDE.md`.

Test: `npx prettier --check CONTRIBUTING.md docs/index.md`, and `grep -n "repo-<topic>" CONTRIBUTING.md` finds the
new line.

### 5. Live load check and CI `[inline: probes Claude's own rule loading]`

- Run this with the Claude model this targets:
  `claude -p --permission-mode default --allowedTools Read --setting-sources project,local 'Read src/config-merge/primitives.ts. Then quote, word for word, the first sentence of any project rule loaded into your context that mentions canonicalize().'`
  Expected: it quotes the `serialize()` vs `canonicalize()` bullet from `repo-config-merge.md`. Then the same
  prompt without reading a file. Expected: it quotes the one-line hard rule from `CLAUDE.md` and nothing longer
  (the scoped rule didn't load). If the first run can't quote the bullet, the `paths:` form is wrong; fix it in a
  follow-up commit to step 2.
- `npm run ci:local` passes.

Test: both transcripts' summaries go in the step's commit message (`chore: verify scoped rules load`, empty commit
via `--allow-empty` if nothing changed), plus the `ci:local` result.
