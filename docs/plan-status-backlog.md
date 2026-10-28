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

### 1. RED tests `[worker]`

Already landed in `ead13bd`. Re-running this step against that commit should change nothing.

Files: `test/commands/status-outdated.test.ts`, `test/manifest-status-config.test.ts` and
`test/commands/update-config-move.test.ts`. Do not touch `src/`.

**Helper, in `status-outdated.test.ts`**

Add `interface StatusRow { id; status; renderError?: string; newDependencies?: string[] }` and
`statusRows(dir, catalog, target): StatusRow[]`, which parses `sigil status --json --target <target>`. Then make
`outdatedByStatus` filter `statusRows(...)` instead of parsing the output itself.

**Case 1: "a render that fails: update writes nothing, so it stays up to date, naming the error"**

It goes at the end of the `status and update agree on the edge cases` block.

- Arrange:
  - In a temp dir, copy the catalog to `src/` (`copyCatalog`) and create `project/`.
  - Run `sigil add agent:typescript/ts-code-reviewer --target copilot --yes`.
  - In `src/catalog/languages/typescript/agents/ts-code-reviewer.agent.md`, replace the line `tools:` with
    `disallowedTools:\n  - Write\ntools:`. Assert that the text changed.
  - Why this works: Copilot's agent spec has no `disallowedTools` mapping, so `assertRestrictionsCarried`
    throws when rendering, but `validate` still passes.
- Assert:

  | Check                                              | Expected                    | Today                           |
  | -------------------------------------------------- | --------------------------- | ------------------------------- |
  | `changedByUpdate(project, catalog, 'copilot')`     | `[]`                        | passes                          |
  | the entry's `status` in `statusRows(…, 'copilot')` | `'up-to-date'`              | passes                          |
  | the entry's `renderError`                          | matches `/disallowedTools/` | **fails: the field is missing** |
  | `treeHash(project)`                                | the same before and after   | passes                          |

**Case 2: "a dependency the skill gained: status names what update would install"**

It goes at the end of the same block.

- Arrange: `setUp(work, ['skill:csharp/cs-generate-tests', '--no-deps'])`, which installs for claude. The skill
  `uses:` the rule `csharp/cs-testing` and the agent `csharp/cs-code-reviewer`.
- Assert:

  | Check                                         | Expected                                                       | Today                |
  | --------------------------------------------- | -------------------------------------------------------------- | -------------------- |
  | `agree(project, catalog, [])`                 | passes: nothing is outdated, nothing is written                | passes               |
  | the skill's `newDependencies`                 | deep-equals `['csharp/cs-code-reviewer', 'csharp/cs-testing']` | **fails: undefined** |
  | `sigil status --target claude` (human output) | matches `/Install new dependencies: sigil update/`             | fails                |

**Case 3: "should not call a retired record outdated when update cannot move it"**

It goes in `manifest-status-config.test.ts`, after the existing retired-file case.

- Arrange:
  - Write `.vscode/mcp.json` with `{ servers: { probe: SERVER } }`.
  - Create the entry with `mcpEntry('.vscode/mcp.json', undefined, 'servers')`.
  - `retiredFor` returns `[{ from: {file:'.vscode/mcp.json', root:'project'}, to: {file:'.mcp.json', root:'project'} }]`.
- Act: `computeStatus(manifestOf(entry), dir, new Set(['shared/probe']), { retiredFor, canMove: () => false })`.
- Assert:

  | Check          | Expected                           | Today                   |
  | -------------- | ---------------------------------- | ----------------------- |
  | `status`       | `'up-to-date'`                     | **fails: `'outdated'`** |
  | `retiredFiles` | deep-equals `['.vscode/mcp.json']` | fails                   |

  The type errors on `canMove` and `retiredFiles` are expected until step 4.

- The existing case, with no `canMove`, keeps expecting `outdated`.

**Case 4: "should warn, and change nothing, when the catalog has no replacement"**

It goes in `update-config-move.test.ts`, before "should leave a fragment alone…". Add `mock` to the
`node:test` import.

- Arrange:
  - Write `.vscode/mcp.json` with `{ servers: { probe: SERVER } }`.
  - Create the entry with `entryAt('.vscode/mcp.json')`.
  - Capture output with `mock.method(console, 'error', () => {})`, and restore it in a `finally`.
- Act: `moveRetiredFragments(entry, opts(dir), [], RETIRED)`. The empty list means no fresh op exists.
- Assert:

  | Check                             | Expected                                                                        | Today                      |
  | --------------------------------- | ------------------------------------------------------------------------------- | -------------------------- |
  | the return value                  | `{ wrote: false, skipped: 0 }`                                                  | passes                     |
  | the captured `console.error` text | matches `/shared\/probe.*\.vscode\/mcp\.json.*no replacement.*sigil uninstall/` | **fails: nothing printed** |
  | `.vscode/mcp.json` `servers`      | still `{ probe: SERVER }`                                                       | passes                     |
  | `entry.configFiles.length`        | `1`                                                                             | passes                     |

**Test**

Run `npm run build && npm run build:test`. It reports exactly two `tsc` errors, both in
`manifest-status-config.test.ts`, and still emits the compiled tests. Then run:

`node --test test-compiled/commands/status-outdated.test.js test-compiled/manifest-status-config.test.js test-compiled/commands/update-config-move.test.js`

Expected: 24 tests, 20 pass and 4 fail. The failures are cases 1–4, each at the assertion marked **fails**
above. `npx prettier --check` and `npx eslint` pass on all three files.

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
