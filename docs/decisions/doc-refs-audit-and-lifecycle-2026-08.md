# Doc-reference audit, commands→skills migration, and the artifact-lifecycle model (2026-08-06/07)

## What prompted this

A prior session (2026-08-05) wired `KindEmitSpec.docs` into `sigil sync --stale` and replaced four
dead GitHub Copilot URLs, verifying each replacement by checking for a 200 response and a few
expected substrings. The user pushed back twice: first asking whether a genuine per-provider source
of truth existed at all (it did, but was undocumented as such), then — after a first re-audit pass
still mis-framed `CLAUDE_RULES_DOC` — naming the actual standard: _"rules to me are rules... memory
instead is another thing... that's the level of analysis I'm looking for."_

## The standard that emerged

A citation is only valid if the page is the provider's **canonical home** for the artifact — the
page that provider's own navigation or file-reference table points to, not a page that merely
mentions the format. This is now stated as the verification standard in `src/targets/doc-refs.ts`'s
header. Concretely:

- Anthropic publishes an authoritative artifact→doc mapping in `claude-directory.md`'s "File
  reference" table. `.claude/rules/*.md` maps to `/docs/en/memory#organize-rules-with-claude/rules/`
  — a real citation, but our old one had no anchor and a title ("Memory (project rules)") that
  mis-framed it. `.claude/commands/*.md` maps to `/docs/en/skills` — our old `CLAUDE_SLASH_COMMANDS_DOC`
  pointed at `/docs/en/slash-commands`, which serves byte-identical content to `/docs/en/skills` and
  is absent from the docs index (`llms.txt`) — a dead alias, not a live page.
- Every `.github/*` file sigil emits is read by two products with genuinely divergent docs: GitHub's
  cloud agent and VS Code's local agent. The old citations picked one consumer per artifact with no
  stated rationale. Now every Copilot `KindEmitSpec.docs` cites both.

## What the audit found, that then had to be acted on

Re-reading the corrected pages against what each spec actually emits surfaced two real defects, not
just stale links:

1. **`.claude/commands/*.md` is a retired format.** Verbatim from Anthropic's Skills page: _"Custom
   commands have been merged into skills... Your existing `.claude/commands/` files keep working."_
   `CLAUDE_PROMPT_SPEC` and `CLAUDE_WORKFLOW_SPEC` (`src/targets/claude-code/spec/{prompt,workflow}.ts`)
   were switched to emit `.claude/skills/<slug>/SKILL.md` with `disable-model-invocation: true`
   (reproducing the old command's user-invoked-only semantics exactly), across all three emission
   call sites (`scaffold.ts`, `plugin-build.ts`/`plugin-assemble.ts`).

2. **A silent manifest-corruption bug would have made that migration destructive for existing
   installs.** `updateWholeFileEntry` (now split into `update-wholefile.ts` + `update-stale.ts`)
   refreshed manifest hashes by iterating the OLD recorded file paths — an emit-path change wrote
   the new file but never tracked it, and left the old file on disk and in the manifest forever.
   Fixed before the commands→skills switch shipped: `sigil update` now rebuilds `entry.files` from
   the current scaffold's path set, deleting a stale path only when its on-disk content still
   matches the recorded hash (a hand-edited stale file is reported and kept, never silently deleted).

That combination — no artifact-retirement mechanism, plus a bug that made retiring an emit path
actively unsafe — is why the user's cleanup request ("we should have a mechanism... mark as
deprecated or be more aggressive... a strong and smart way to cover all these scenarios") became:

- `deprecated: { since, reason, supersededBy? }` on `BaseFields` (`src/schema/shared.ts`) —
  catalog-artifact-level retirement, never a hard delete (existing `uses:`/`extends:` references and
  installs keep resolving); `validate` warns, never errors.
- `KindEmitSpec.supersededBy` (`src/targets/spec-types.ts`) — provider-format-level retirement,
  surfaced by `sigil sync --check` as an advisory notice that never fails the gate (acting on it is
  a deliberate migration, like the one just described, not an automatic one). First use:
  `COPILOT_PROMPT_SPEC` carries it, since VS Code's own prompt-files doc now says the Agent Host
  doesn't read `.prompt.md` and recommends converting to agent skills.
- `sigil prune` (`src/commands/prune.ts` + `prune-apply.ts`) — the consumer-side cleanup command.
  Preview by default like `sigil sync`; `--apply` removes orphaned manifest entries (reusing
  `uninstall.ts`'s refcount-aware `removeEntries` and drifted-file protection) and reports
  deprecated-but-installed ones with their `supersededBy` replacement, never removing those
  automatically.

## Verification

Live-fetched all 13 cited URLs (200, content-matched against each spec) on 2026-08-06. Full
migration rehearsal against a scratch project seeded with pre-migration manifest state (`.claude/
commands/*.md` recorded): `sigil update --dry-run` previewed the move and named the stale file;
`sigil update` moved it, removed the old file, and re-tracked the new path; `sigil prune` reported
clean. Hand-editing an installed file and re-running `update`/`prune` correctly reported-and-kept it
in both commands. `npm run check` green (475/475 tests, 8 new). `sigil sync --check` stays green
with `COPILOT_PROMPT_SPEC`'s supersession surfaced as advisory; `--stale 0` lists all 20 citations
across every provider spec, aggregate, and the new `claude-directory` provenance entry.

## Still open (deliberately out of scope)

- `.github/AGENTS.md`'s emit location: GitHub supports it anywhere in the repo, VS Code marks
  subfolder placement experimental (root is safe on both). Moving it would change output; recorded
  as a follow-up in `buildAgentsMd()`'s TSDoc rather than done here.
- Four adjacent bugs carried over from the prior session's audit, still untouched: `McpSchema`
  missing `template:`; `sync --changed-since` comparing a filename stem to a template id; the wrong
  `resolve.ts:16` comment; the missing `### template` subsection in `spec.md`.
