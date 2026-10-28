# Plan: status backlog (benchmark v2, row 13 backlog)

Source: `docs/audits/2026-10-16/results.md` § Row 13 backlog. Branch: `fix/status-backlog`.

The invariant stays as it is: `outdated` means `sigil update` would rewrite the entry (`src/freshness.ts`). All
three fixes add information, and none of them changes which entries are `outdated`. The one exception is
(b): an entry whose retired config has no replacement no longer reads as `outdated`, because `update` cannot
change it.

| Gap | Today                                                                                                                                                                   | After                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| (a) | A render that throws reads as `up-to-date` (`isStale`'s bare `catch`, `src/freshness.ts:95`).                                                                           | Still `up-to-date`, with a `render failed: <msg>` note and a `renderError` field.                                |
| (b) | A retired config record with no catalog op at the new file stays `outdated (config moved …)` forever. `update` writes and prints nothing (`update-config-move.ts:119`). | `up-to-date` with a `retired, no replacement` note and a `retiredFiles` field. `update` prints the same warning. |
| (c) | `status` does not show the new `uses:` dependencies that `update` would install (`update-deps.ts`).                                                                     | A `newDependencies` field on each dependent, a note in the table, and a next step.                               |

`status --json` stays an array with the same fields. Each new field appears only when it is non-empty.

## Steps

### 1. RED tests `[inline: case (a) needed a design — a render that fails but still validates]`

**Done.** These tests fail on master for the right reason. Of the 24 tests in the three files, 20 pass and 4 fail.

- `test/commands/status-outdated.test.ts`, edge-cases block. It adds a `statusRows` helper, which
  `outdatedByStatus` now uses.
  - **(a)** "a render that fails…": installs `agent:typescript/ts-code-reviewer` for **copilot**, then adds
    `disallowedTools: [Write]` to its source. Copilot can't express that, so `assertRestrictionsCarried`
    throws at render, while `validate` still passes.
    - Expected: `update --dry-run` shows no `↑` (this passes today).
    - Expected: status `up-to-date` (this passes today).
    - Expected: `renderError` matches `/disallowedTools/`. **RED**, because the field is missing.
    - Expected: the tree is unchanged.
  - **(c)** "a dependency the skill gained…": `add skill:csharp/cs-generate-tests --no-deps` for claude.
    - Expected: `agree(…, [])`, meaning nothing is outdated (this passes today).
    - Expected: `newDependencies` is `['csharp/cs-code-reviewer', 'csharp/cs-testing']` (sorted).
      **RED**, because the field is undefined.
    - Expected: the table prints `Install new dependencies: sigil update`.
- **(b)** `test/manifest-status-config.test.ts`, "should not call a retired record outdated when update cannot
  move it": calls `computeStatus` with `{ retiredFor, canMove: () => false }`.
  - Expected: `up-to-date` and `retiredFiles: ['.vscode/mcp.json']`. **RED**: the status is `outdated`, and
    `tsc` errors on `canMove` and `retiredFiles` until step 4 lands.
  - The existing case without `canMove` still expects `outdated`.
- **(b)** `test/commands/update-config-move.test.ts`, "should warn, and change nothing, when the catalog has no
  replacement": calls `moveRetiredFragments(entry, opts, [], RETIRED)`.
  - Expected: `{ wrote: false, skipped: 0 }`, and the old file and the record are unchanged (both pass today).
  - Expected: `console.error` (captured with `mock.method`) matches
    `/shared\/probe.*\.vscode\/mcp\.json.*no replacement.*sigil uninstall/`. **RED**, because nothing is
    printed.

Test: `npm run build && npm run build:test` (it emits even though `tsc` reports the two expected errors), then
`node --test test-compiled/commands/status-outdated.test.js test-compiled/manifest-status-config.test.js test-compiled/commands/update-config-move.test.js`.

### 2. `src/freshness.ts`: one scan returns everything `[worker]`

- **Move `missingDependencies` and `MissingDependency` into `src/freshness.ts`.** Copy them verbatim from
  `src/commands/update-deps.ts:21-38`, together with the `computeClosure` import. Then make
  `update-deps.ts` import them from `../freshness`.
  - Why: importing them from `update-deps` would create a cycle. The chain is `freshness` → `update-deps` →
    `add/index` → `plan-ids` → `install-state` → `freshness`.
- **Replace the exported `isStale`** with a private `checkEntry(entry, ctx)`. It returns
  `{ stale: boolean, unmovable: string[] } | { error: string }`.
  - A throw becomes `{ error: message }`. Use `err instanceof Error ? err.message : String(err)`.
  - For a config entry, `unmovable` holds the files of the records at a retired destination (`scan.retiredFor`)
    where no fresh op has the same file as `move.to`. That is the same test as
    `src/commands/update-config-move.ts:117-118`. Reuse `sameFile`, exporting it from wherever it lives, and
    do not copy it.
  - For a whole-file entry, `unmovable` is `[]`.
- **`StaleScan` gains an optional `retiredFor?: (target: string) => readonly RetiredConfigDestination[]`.** When it
  is absent, nothing is unmovable.
- **`staleEntries` now returns a `Freshness` object.** Every map key is an `entryKey`:

  ```ts
  export interface Freshness {
    readonly stale: ReadonlySet<string>;
    readonly failed: ReadonlyMap<string, string>;
    readonly unmovable: ReadonlyMap<string, readonly string[]>;
    readonly newDependencies: ReadonlyMap<string, readonly string[]>;
  }
  ```

  - `newDependencies`, per target: run `missingDependencies(checked.map(e => e.id), scan.resolved, target,
ctx.installedIds)`.
  - Then, for each `{ id, via }`, add `id` under `entryKey({ target: name, id: v })` for every `v` in `via`.

- Update the TSDoc on `staleEntries` and on the module.

Files: `src/freshness.ts`, `src/commands/update-deps.ts`, and the file that defines `sameFile`.

Test: `npm run build`. Type errors are expected in the two callers until step 3; nothing else should fail.

### 3. Callers `[worker]`

- `src/install-state.ts:148-157`:
  - Pass `retiredFor: retiredConfigDestinationsOf` to `staleEntries`.
  - Use `fresh.stale.has(...)` for `isStale`.
  - Pass `canMove: (e, file) => !fresh.unmovable.get(entryKey(e))?.includes(file)` to `computeStatus`.
- `src/commands/status.ts` `buildStatuses` (:153-171): make the same three changes. Return
  `{ statuses, fresh }` so that step 4 can read `failed` and `newDependencies`.

Test: `npm run build` passes once step 4 lands. Do steps 3 and 4 as one mk-worker job if `computeStatus` does not
compile without step 4.

### 4. `src/manifest/` `[worker]`

- `ComputeStatusExtras` (`src/manifest/status.ts:26-37`) gains a doc-commented
  `canMove?: (entry: ManifestEntry, file: string) => boolean`. When it is absent, every retired record can be
  moved, which is today's behaviour.
- `ConfigFileFindings` (`src/manifest/status-config-check.ts:93-98`) gains
  `readonly retiredFiles: string[]`. Its doc comment: "Records at a retired file the catalog no longer replaces;
  `update` cannot move them".
- `checkConfigFiles` changes so that a retired record goes to `movedFiles` when
  `canMove?.(entry, cf.file) ?? true`, and to `retiredFiles` otherwise. Pass `canMove` in through the call in
  `checkEntryFiles` (`status.ts:62`).
- `StatusResult` (`src/manifest/types.ts:80-89`) gains three optional fields: `retiredFiles?: string[]`,
  `renderError?: string` and `newDependencies?: string[]`.
- `computeStatus` sets only `retiredFiles`, and only when it is non-empty. `status.ts` attaches the other two.
  The status precedence in `deriveStatus` does not change.

Test: `npm run build && npm test`. The (b) unit test from step 1 now passes.

### 5. User-facing output `[inline: user-facing copy]`

- **`src/commands/status.ts`:**
  - Attach `renderError` and `newDependencies` from `fresh`.
  - `printStatusJson` writes the three new fields when they are present.
  - `printStatusTable` prints notes under the entry:
    - `⚠ render failed: <msg>`
    - `⚠ <file>: retired, no replacement in the catalog`
    - `+ update would also install: <ids>`
- **`statusNextSteps`** adds three steps:
  - `Fix the catalog error behind a failed render, then check it: sigil validate`
  - `Remove <id>, whose config file was retired: sigil uninstall <id> --target <target>`
  - `Install new dependencies: sigil update`
- **`src/commands/update-config-move.ts:119`:** when `move` exists but `next` does not, write
  `⚠  <id>: <cf.file> is retired and the catalog has no replacement — remove it with sigil uninstall <id>` to
  stderr. Warnings already go there (CLI-6). Remove the comment that says the case is "reported elsewhere".

Test: `npm test`. All step 1 cases pass, and `test/commands/status-wording.test.ts` and
`status-next-steps.test.ts` still pass.

### 6. Docs and close-out `[inline: docs prose]`

- `docs/reference/config-kinds.md:135`: replace "`sigil status` does not yet report…" with the real behaviour.
- `docs/guides/consuming.md` § status: describe the three notes and the JSON fields.
- `docs/audits/2026-10-16/results.md`: mark the row 13 backlog done, with the PR number.
- `CHANGELOG.md` `### Fixed`: one entry covering the three gaps.
- `CLAUDE.md` still says "`staleEntries` … is the only source of `outdated`". That is still true, so leave it.

Test: `npm run ci:local`.

## Out of scope

- No new `ArtifactStatus` value. `broken` would touch every install-state switch in the wizard.
- Install states (`add`, the wizard) do not show `renderError` or `newDependencies`. They only take the
  `canMove` fix, so they agree with `status`.
