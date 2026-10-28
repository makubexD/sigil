# Plan: friendlier "not found" errors

Source brief: `docs/ideas/friendlier-errors.md`. Branch: `feat/friendlier-errors`. One PR.

## Context

Audit-rows 15–18 roadmap is closed except the owner's Copilot CLI live check (row 17). The user picked the
`friendlier-errors` brief next. Evidence re-verified 2026-10-28: `notFoundError` (`src/errors.ts:35-42`) joins
every catalog id into the message (~150 ids, >5 KB). It is reached through `requireArtifact`
(`src/commands/shared/artifact.ts`) from `get`, `edit`, `patch`, `retarget`, `delete`. `move` throws its own
message (`src/authoring/move/plan.ts:75`, "Run `sigil list`…") with no suggestions.

Outcome: a mistyped id prints at most five close matches plus a browse hint; no full dump.

## Design

- New pure function `suggestIds(id, availableIds, max = 5): string[]` in `src/errors.ts` (next to its only
  consumer; no new module, not exported from `src/index.ts`).
  - Rank 1: ids whose name part (after the last `/`) equals the query's name part, different prefix
    (wrong namespace, e.g. `typescript/clean-code` → `shared/clean-code`).
  - Rank 2: Levenshtein distance on the full id ≤ `max(2, floor(id.length / 4))`, ascending; ties by id.
  - Rank 3: ids whose name part contains the query's name part (or the reverse), length ≥ 3.
  - Deduped, capped at `max`. Case-insensitive.
  - Not `searchArtifacts`: it is substring-only, so a typo like `protect-confg` scores 0.
- `notFoundError(label, id, availableIds)` keeps its signature (callers unchanged). Message:
  `Artifact 'x' not found. Did you mean: a, b, c?` or `Artifact 'x' not found.` when there are no matches.
  The hint goes in `SigilError.hint` (printed on its own line by `src/cli-error.ts:28`):
  `Run sigil list or sigil search <word> to browse.`
- `move/plan.ts` builds its message from `suggestIds(oldId, [...catalog.byId.keys()])` with the same text
  (it throws plain `Error`, wrapped by `move.ts:153`, so the hint goes inline in the message).
- Exit codes and `SigilError` shape unchanged (brief's out of scope).

## Steps

1. `[worker:medium]` RED tests, `test/errors.test.ts` (new). Cases with a fixed id list
   (`shared/clean-code`, `shared/protect-config`, `csharp/cs-conventions`, `typescript/ts-conventions`,
   plus 10 filler ids `shared/filler-a`…`j`):
   - `suggestIds('shared/protect-confg', ids)` → first item `shared/protect-config`.
   - `suggestIds('typescript/clean-code', ids)` → first item `shared/clean-code`.
   - `suggestIds('zzz/nothing-like-it', ids)` → `[]`.
   - `suggestIds('shared/filler', ids)` → length 5 (cap).
   - `notFoundError('Artifact', 'shared/protect-confg', ids)`: message matches `/Did you mean: shared\/protect-config/`,
     does not contain `Available:` or `shared/filler-a`; `.hint` contains `sigil list` and `sigil search`.
   - No match: message is exactly `Artifact 'zzz/nothing-like-it' not found.`
   - `test/authoring/move.test.ts`: a missing id close to an existing one includes `Did you mean`.
     Test: `npm test -- --test-name-pattern="suggestIds|notFoundError|move"` fails on missing export / text.
2. `[worker:medium]` Implement `suggestIds` and the new `notFoundError` in `src/errors.ts`; use it in
   `src/authoring/move/plan.ts:75`; update the module comment in `src/commands/shared/artifact.ts` if it
   mentions "listing availableIds". Test: step 1 tests pass; `test/characterization.test.ts` (`/not found/i`)
   still passes; `npm run check`.
3. `[inline: user-facing copy + close-out]` Live check `node dist-cli/cli.js get shared/protect-confg` and
   `get typescript/clean-code`; review the wording. `CHANGELOG.md` Unreleased → Changed entry. Close the brief:
   delete `docs/ideas/friendlier-errors.md`, drop its row from `docs/ideas/README.md`. Note in
   `docs/reference/troubleshooting.md` only if it documents the old output (grep found none).

## Verification

`npm run ci:local` green; the two live commands print ≤5 suggestions and the hint;
`workflow-report sigil`; `/agent-skills:review` of the branch; PR, merge on green CI.

## Housekeeping (separate, any time)

- Delete 8 local branches already merged into master.
- After the owner's Copilot live check: row 17 in `docs/audits/2026-10-16/results.md` → `done (PR #102)`,
  delete `docs/plan-audit-rows-15-18.md`.
