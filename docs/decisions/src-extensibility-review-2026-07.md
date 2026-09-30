# src/ Extensibility Review — July 2026

## Context

This review answers a focused question from the project owner: **"I see a lot of `if` blocks — imagine later we have more artifacts or more paths (targets). Will the code support everything easily?"**

The prior session's clean-code review (`src-code-review-2026-07.md`) graded the codebase on function
size, naming, and the god-file pattern. This review answers a sharper question: is the code
**Open/Closed** — can you extend by adding data, not by editing scattered conditionals?

A three-band sweep of `src/` found the core is genuinely pluggable but carries three concentrated
extensibility debts.

---

## Already-good patterns

These patterns are textbook and require no change.

### Target plugin registry (`src/targets/index.ts`)

`registerTarget(new TargetImpl())` is all it takes to add a new platform. The `Target` interface
declares a clean contract (`compile`, `scaffold`, `scaffoldConfig`, `configScopes`, `vocabulary`),
and every command delegates to `getAllTargets()` or `getTarget(name)`. The registry is the
canonical entry point and carries no hard-coded names.

### Kind-scoped `switch` tables in adapters

Both `ClaudeCodeTarget.scaffold()` and `CopilotTarget.scaffold()` end with
`default: throw new Error(...)`, which means adding a new kind that isn't handled is a loud runtime
error — not a silent no-op. This is the correct pattern.

### `Record<ArtifactKind, …>` tables in `schema/index.ts`

Zod schema tables keyed by `ArtifactKind` use TypeScript's `Record<K, V>` type, which requires an
entry for every member of the union `K`. Adding a kind to the `ArtifactKind` type without updating
the table is a **compile error**, not a silent gap. This is the intended safety net.

---

## Findings: three bands of extensibility debt

### Band 1 — Adding an artifact kind touches ~15 raw conditionals

| File                      | Site                                 | Problem                                                       |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| `src/authoring/header.ts` | `switch(kind)` L87–225 (8 cases)     | No compile-time check; omitting a case produces a broken stub |
| `src/authoring/header.ts` | Ternary ladder L245–262 (8 branches) | Hard-coded body-comment per kind                              |
| `src/types.ts`            | `ArtifactKind` union                 | Correct — compiler enforces updates here                      |
| `src/select/selection.ts` | `KIND_PREFIXES = [...]` (8 literals) | Independent re-declaration                                    |
| `src/schema/emit.ts`      | 8-element inline array               | Independent re-declaration                                    |
| `src/cli.ts`              | 8-element `validKinds` array         | Independent re-declaration                                    |
| `src/wizard/add.ts`       | `displayOrder = [...]` (8 literals)  | Independent re-declaration                                    |

**Total**: the 8-kind list was independently re-typed in **5 files** with no shared authority.

### Band 2 — Config-kind trio duplicated in 3 places

`hook | settings | mcp` (the kinds that merge into JSON rather than write whole files) were enumerated
independently in:

1. `src/types.ts:114` — as the `ConfigKind` type (correct authoritative type)
2. `src/select/selection.ts:57` — as a runtime `Set` (intended single source)
3. `src/manifest/status.ts:19` — as `CONFIG_ENTRY_KINDS` (a silent duplicate)

Drift between these three would cause config artifacts to be treated as whole-file artifacts in some
code paths while behaving correctly in others — a subtle, hard-to-reproduce bug.

### Band 3 — CLI leaks target names in three places

The `Target` interface defined the runtime contract but the CLI presentation layer still hardcoded
names, meaning adding a third target required edits in multiple CLI locations:

1. `init` command — `switch(opts.target)` with two hardcoded dir-lists
2. `detectProjectTarget` — two hardcoded `.claude` / `.github` dir probes
3. `__complete` — hardcoded `'claude\ncopilot\n'` completion output

---

## Remediations applied (this session)

All phases ran `npm run build && npm test` → **348/348 green** before proceeding to the next phase.

### Phase 1 — Kind registry: `src/kinds.ts`

**New file `src/kinds.ts`** — the single authority for kind metadata:

```typescript
export const KIND_REGISTRY: Record<ArtifactKind, KindDescriptor> = {
  mcp: { kind: 'mcp', isConfig: true, displayOrder: 0, bodyComment: '…' },
  hook: { kind: 'hook', isConfig: true, displayOrder: 1, bodyComment: '…' },
  settings: { kind: 'settings', isConfig: true, displayOrder: 2, bodyComment: '…' },
  prompt: { kind: 'prompt', isConfig: false, displayOrder: 3, bodyComment: '…' },
  skill: { kind: 'skill', isConfig: false, displayOrder: 4, bodyComment: '…' },
  agent: { kind: 'agent', isConfig: false, displayOrder: 5, bodyComment: '…' },
  rule: { kind: 'rule', isConfig: false, displayOrder: 6, bodyComment: '…' },
  workflow: { kind: 'workflow', isConfig: false, displayOrder: 7, bodyComment: '…' },
};
```

`Record<ArtifactKind, KindDescriptor>` forces a compile error if a kind is added to the union but
omitted from the registry. Consumers re-export from here:

- `select/selection.ts` — thin re-export of `KIND_ORDER` and `CONFIG_KINDS`
- `manifest/status.ts` — deleted `CONFIG_ENTRY_KINDS`; imports `isConfigKind` guard
- `cli.ts` — `ALL_KINDS` replaces the 8-element `validKinds` array; `isArtifactKind` replaces the `.includes()` call
- `wizard/add.ts` — `ALL_KINDS` replaces the hand-kept `displayOrder` array

### Phase 2 — `authoring/header.ts`: switch → `Record<ArtifactKind, Builder>`

The 8-case `switch` became a `KIND_HEADER_BUILDERS: Record<ArtifactKind, KindHeaderBuilder>` lookup:

```typescript
const KIND_HEADER_BUILDERS: Record<ArtifactKind, KindHeaderBuilder> = {
  skill: buildSkillLines,
  agent: buildAgentLines,
  rule: buildRuleLines,
  prompt: buildPromptLines,
  workflow: buildWorkflowLines,
  hook: buildHookLines,
  settings: buildSettingsLines,
  mcp: buildMcpLines,
};
```

Each builder is a small, single-purpose function (< 20 lines). The body-comment ternary ladder was
replaced with `KIND_REGISTRY[kind].bodyComment` (one lookup). Omitting a kind from either table is
now a compile error.

### Phase 3 — Config-scope single source: `CONFIG_SCOPES` in `types.ts`

```typescript
export const CONFIG_SCOPES = ['project', 'local', 'user'] as const;
export type ConfigScope = (typeof CONFIG_SCOPES)[number];
```

All `z.enum(['project', 'local', 'user'])` calls in `schema/index.ts` (×3) and
`allowedValues: ['project', 'local', 'user']` in `authoring/update/descriptors.ts` (×3) now
reference `CONFIG_SCOPES`. Adding a new scope is a single-site change.

### Phase 4 — Target-declared project layout

Two new optional fields on the `Target` interface:

```typescript
/** Dirs this target scaffolds on `sigil init`. */
initDirs?: string[];
/** Directory markers that signal this target is active in a project. */
projectMarkers?: string[];
```

Both adapters now declare their own lists (`ClaudeCodeTarget.initDirs`, `CopilotTarget.projectMarkers`).
Three CLI sites rewritten to iterate the registry:

- `init` — `for (const dir of target.initDirs ?? []) mkdir(…)`
- `detectProjectTarget` — scans `getAllTargets()` for matching `projectMarkers`
- `__complete --target` — emits `getAllTargets().map(t=>t.name).join('\n')`

A third target now requires **zero** edits in `cli.ts`.

### Phase 5 — Structural extraction: `src/commands/` + `src/cli-helpers.ts`

**New `src/cli-helpers.ts`** — shared utilities with no Commander dependency:

- `pkg`, `PKG_ROOT`, `resolveDefault` — catalog root anchoring
- `loadAndValidate` — catalog load + validation gate + packs parsing
- `writeFilesSync`, `partitionFiles` — file I/O helpers
- `detectProjectTarget` — registry-driven target auto-detection
- `mergeOpSection` — config-merge display helper

**New `src/commands/add.ts`** — exports `runAdd(selectors, opts)`. Faithful extraction of the
`add` action (~500 lines). `cli.ts` wires it with `.action(runAdd)`.

**New `src/commands/patch.ts`** — exports `runPatch(id, opts)`. Faithful extraction of the
`patch` action (~210 lines). `cli.ts` wires it with `.action(runPatch)`.

`cli.ts` now contains only Commander option declarations and `.action()` wiring for these two
commands — the business logic lives where it can be unit-tested in isolation.

---

## Adding a new artifact kind — what it takes now

1. Add the literal to `ArtifactKind` in `src/types.ts` → compiler immediately flags every
   `Record<ArtifactKind, …>` table that needs an entry.
2. Add a `KindDescriptor` entry to `KIND_REGISTRY` in `src/kinds.ts`.
3. Add a builder function to `KIND_HEADER_BUILDERS` in `src/authoring/header.ts`.
4. Add scaffold cases to `ClaudeCodeTarget.scaffold()` and `CopilotTarget.scaffold()` — both
   end with `default: throw`, so omission is a loud runtime error.
5. Add Zod schema to `src/schema/index.ts`.
6. Declare `supportedKinds` on any target that handles the new kind.

**No hunt-and-edit across 15+ files.** Omissions are compile errors or loud runtime errors.

## Adding a new target — what it takes now

1. Create `src/targets/<name>/index.ts` implementing `Target`.
2. Declare `initDirs`, `projectMarkers`, `vocabulary`, `supportedKinds` on the class.
3. Register: `registerTarget(new MyTarget())` in `src/targets/index.ts`.

**No edits to `cli.ts`.** The `init`, `detectProjectTarget`, and `__complete` handlers iterate
`getAllTargets()` and pick up the new target automatically.

---

## Follow-up roadmap (deferred)

| Priority | Work                                                                   | Payoff                                                                                                                                          |
| -------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| High     | Extract the remaining ~20 `cli.ts` command closures to `src/commands/` | `cli.ts` becomes a pure Commander wiring file; each command is independently testable                                                           |
| High     | Typed `Record<StepName, StepHandler>` step-table for `wizard/add.ts`   | Eliminates 11 `if (step === …)` string-dispatched branches, ~13 cancel guards, ~11 back-unwind blocks                                           |
| Medium   | Kind-driven import pipeline (`src/authoring/import/`)                  | Currently locked to `skill                                                                                                                      | agent | rule`; adding `workflow`or`hook` import requires editing the pipeline |
| Low      | `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` in tsconfig  | Surfaces index-access nullability bugs statically; estimate ~30 annotation sites                                                                |
| Low      | Collapse triple-scaffold in `commands/add.ts`                          | Currently calls `target.scaffold!()` up to 3× per artifact (primary-paths, all-files, manifest); one pre-computed pass reduces network/disk I/O |

---

_Session: 2026-07-30 · Phases 1–5 implemented · 348/348 tests green_
