# `src/` Deep Code Review — July 2026

This document records findings from the first self-hosted code review of the `sigil` source tree.
The codebase was reviewed against the TypeScript + shared catalog rules that were installed on this
repo during the same session:

- `typescript/ts-code-quality` (extends `shared/clean-code`) — God-Object limit, function-size cap,
  SOLID, DRY, error-handling, layering.
- `typescript/ts-conventions` — `unknown` over `any`, naming, imports, casting.
- `typescript/ts-async` — floating promises, rejection handling, event-loop.
- `typescript/ts-security` — secrets, shell injection, unsafe YAML deserialization.
- `typescript/ts-testing` — coverage, missing test modules.
- `typescript/ts-project-layout` — tsconfig strictness, module structure.

**No `src/` files were edited in this review.** This document is a findings report + prioritized
remediation roadmap presented for approval before implementation begins.

---

## Executive Summary

The pipeline core (`load.ts` → `validate.ts` → `resolve.ts` → `src/targets/`) is **clean, well-
structured, and tested** — a genuine strength. The `Target` interface is properly pluggable; the
zod schema layer is a single source of truth; strict tsconfig is enabled; 31 test files cover 348
cases with 0 failures.

The dominant architectural debt is concentrated in **one file: `src/cli.ts` (3191 lines)**. All 22
command implementations live as inline `.action()` closures in the CLI entry point, making it a
god file by every relevant metric. This violates SRP, the module and function limits in
`ts-code-quality`, and the Layering principle ("CLI handlers should delegate to domain functions,
not contain logic themselves"). This is the root cause of most findings below: tight coupling,
untestable helpers, inline `require()` calls, and accumulated duplicate logic all flow from the
fact that command logic has no home of its own.

One bug was **discovered and fixed** during this review session before the dogfooding install could
complete: `argument-hint` was incorrectly listed as a forbidden key in the SKILL.md output contract,
blocking every TypeScript skill scaffold. A regression test was added; all 348 tests pass.

---

## Findings

### P0 — Blocking / Immediate Action

| # | Rule | File : Location | Problem | Proposed Fix |
|---|---|---|---|---|
| P0-1 | `ts-code-quality` Layering + God Object | `src/cli.ts` (3191 lines, 22 commands) | All command business logic lives as inline `.action()` closures in the CLI entry point. The `add` action alone is ~500 lines (lines 421–919). Module limit: ~200 lines; function limit: 20 lines. Violates SRP and the Layering rule: "a CLI handler must not contain logic." | Extract each command into `src/commands/<name>.ts`. Each module exports a single `async function run(opts): Promise<void>`. `cli.ts` becomes a thin registration shell (`program.command(...).action(cmds.add.run)`) under ~200 lines. |
| P0-2 | `ts-code-quality` | `src/targets/claude-code/index.ts:184` | `argument-hint` was in SKILL.md `forbiddenKeys`, blocking all TypeScript skill installs. **Fixed this session** — removed from forbidden list, regression test added. | ✅ Already fixed. |

---

### P1 — Should Fix

| # | Rule | File : Location | Problem | Proposed Fix |
|---|---|---|---|---|
| P1-1 | `ts-conventions` / `ts-project-layout` | `src/cli.ts:1254,1781,1782,1783,1816,1817,1818,2268,2294,2391,2392,2399` | 8 inline `require('fs')`, `require('path')`, `require('gray-matter')`, `require('fast-glob')` calls scattered through command actions. The ESLint rule `@typescript-eslint/no-require-imports` is currently set to **off** specifically to allow these — eliminating the smell also lets the rule be re-enabled. | Move to top-level `import` statements. `fs` and `path` are already imported at the top of the file — the inline `require`s are redundant copies that bypass the import cache no differently. `gray-matter` and `fast-glob` are also already used elsewhere in the project (they can share the top-level import). |
| P1-2 | `ts-code-quality` / `ts-async` "Never swallow silently" | `src/cli.ts:567,602,796,1147,1376,1613,1975,2412,3023,3036` | 10 bare `} catch {` or `} catch (_e) {` blocks. Several are legitimate safe-fallbacks with a comment (`// State detection failed — proceed without skip logic` at line 567), but most are silent drops with no logging, no cause-wrapped rethrow, and no indication of what failed. This makes debugging impossible without adding breakpoints. | Per `ts-code-quality`: at every `catch` boundary either log with context or rethrow with `cause`. Audit each site: (a) true safe-fallbacks → `} catch { /* intentional: <reason> */ }` comment is fine but add at least `console.warn` in verbose mode; (b) unexpected errors → rethrow or `console.error` with the error object. Enable the `no-empty` ESLint rule for catch blocks. |
| P1-3 | `ts-conventions` — `as` casting | `src/cli.ts` (71 `as` occurrences), `plugin-build.ts` (23), `claude-code/index.ts` (21), `query/detail.ts` (17), `wizard/add.ts` (16) | Heavy use of `as string`, `as Error`, `as ConfigScope`, `as Record<string, unknown>` to access frontmatter fields. Frontmatter is `Record<string, unknown>` from gray-matter; every consumer casts it ad-hoc rather than narrowing once at the boundary. | Add per-kind typed accessor helpers, e.g. `getFrontmatterString(fm, key): string \| undefined` using `typeof value === 'string'`. Better: use `z.infer<typeof AgentSchema>` from the already-defined zod schemas to derive typed frontmatter — the schema layer exists, it's just not consumed by the adapters. |
| P1-4 | `ts-security` — Unsafe YAML deserialization | `src/cli.ts:1374,2846,2903`, `src/load.ts:46` | Four `yaml.load()` calls with the default js-yaml schema. The default schema can construct arbitrary JavaScript objects (tagged YAML like `!!js/function …`). Per `ts-security`: "When using js-yaml, always use `yaml.load(input, { schema: yaml.FAILSAFE_SCHEMA })` or `yaml.JSON_SCHEMA`." The catalog source YAML never needs JS-object construction. | Add `{ schema: yaml.JSON_SCHEMA }` as the second argument to all four calls. `JSON_SCHEMA` is the safest superset that still supports all data types used (strings, numbers, booleans, nulls, arrays, objects). Also add `z.object(...).parse(parsed)` (reuse existing zod schemas) at the `loadAndValidate` parse site instead of the bare `as PacksConfig` cast. |
| P1-5 | `ts-testing` — Coverage gap | `src/cli.ts`, `src/registry.ts`, `src/config-utils.ts` | `src/cli.ts` (3191 lines, 22 commands, 28 catch blocks) has **no dedicated test file**. It is exercised only via the compiled integration tests. `src/registry.ts` and `src/config-utils.ts` are similarly untested in isolation. Per `ts-testing`: every module should have a paired test file exercising its exported surface. | Once P0-1 (command extraction) is complete, each `src/commands/<name>.ts` becomes testable in isolation without spawning a full process. Add `test/commands/add.test.ts`, `test/registry.test.ts`, `test/config-utils.test.ts` covering the happy path and key error branches. |
| P1-6 | `ts-code-quality` DRY / `ts-async` | `src/cli.ts:596-617` and `src/cli.ts:698-743` | The `add` action calls `target.scaffold!()` **three times** per artifact: once to pre-compute primary paths (lines 596–606), once to collect all files (608–616), and once more inside the manifest-building loop (700–744). Scaffold functions are async and currently side-effect-free, but triple invocation for every artifact is fragile and wasteful; if scaffold gains logging or I/O it will triple those too. | Collect the scaffold result once per artifact, keying by ID. Pass the pre-collected `FileMap` to the manifest-building helper instead of re-running `scaffold`. Extract a `buildInstallPlan(ids, target, resolved, opts)` function that returns `{ primaryPaths, allFiles, depMap }` — used by both the write path and the manifest path. |

---

### P2 — Nice to Have / Longer Horizon

| # | Rule | File : Location | Problem | Proposed Fix |
|---|---|---|---|---|
| P2-1 | `ts-code-quality` God Object | `src/wizard/add.ts` (874 lines) | Over the ~200-line module limit. The wizard is a cohesive state machine (defensible), but the step implementations (`narrow`, `kindPicker`, `crossKindPicker`, `deps`) are each 80–150 lines — above the 40-line config-function limit. | Extract each wizard step into a named module-level function. The state-machine coordinator (`runWizard`) can remain in `add.ts` as a thin orchestrator calling step-functions. Each step is then independently testable. |
| P2-2 | `ts-project-layout` — tsconfig strictness | `tsconfig.json` | Missing `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` which `ts-conventions` recommends. These two flags would statically catch many of the ad-hoc `as string | undefined` casts in the frontmatter-access pattern. | Add both flags in `tsconfig.json` and resolve the resulting errors (likely in adapter `frontmatter[]` access sites). Run `tsc --noEmit` and address each error with a proper narrow or typed accessor. |
| P2-3 | `ts-code-quality` / `ts-async` — Sequential independent work | `src/cli.ts:608-616` | The `wholeFileIds` scaffold loop is sequential (`for (const id of wholeFileIds)`). Scaffold operations are independent; they could run concurrently. Per `ts-async`: "When multiple async operations are independent, run them concurrently with `Promise.all`." | `const allFilesEntries = await Promise.all(wholeFileIds.map(id => target.scaffold!(id, resolved, scaffoldOpts).then(f => [id, f] as const)))`. The catalog is small enough that current latency is imperceptible, but this aligns with the rule and makes the pattern correct for future growth. |
| P2-4 | `ts-code-quality` — Hidden helper | `src/cli.ts:99-112` | `mergeOpSection()` is a pure function (no side effects, no I/O) trapped inside `cli.ts` with no test. Its logic (which computes the section suffix for config-merge display) is subtle enough to warrant a unit test. | Move to `src/config-merge/index.ts` or `src/config-utils.ts` as an exported function. Add a test in `test/config-utils.test.ts`. |
| P2-5 | `ts-code-quality` — Inconsistent validate call | `src/cli.ts:2892` | `loadAndValidate` calls `validateCatalog(catalog)` without passing `targets`. The second overload with targets enables platform reference checks. The standalone `validate` command passes `getAllTargets()`. | Pass `getAllTargets()` to `validateCatalog` inside `loadAndValidate` to make the shared helper as strict as the dedicated command. |
| P2-6 | `ts-security` — `execSync` with string interpolation | `src/cli.ts:3135-3136` | `execSync(\`git add ${filesToAdd.join(' ')}\`)` and `execSync(\`git commit -m "release: v${nextVersion}"\`)`. `filesToAdd` is internally constructed (low risk); `nextVersion` is semver-validated. Risk is low but the pattern technically violates `ts-security`'s "use argument array" guideline. | Refactor to `execFileSync('git', ['add', ...filesToAdd])` and `execFileSync('git', ['commit', '-m', \`release: v${nextVersion}\`])`. Also import `execFile` instead of `execSync`. No behavior change; eliminates the pattern entirely. |
| P2-7 | `ts-project-layout` — ESLint scope creep | `eslint.config.js` | `npm run lint` (`eslint src`) reports ~540 errors across 52 files, predominantly `@typescript-eslint/no-require-imports` violations. The project override correctly sets this rule `'off'` for `src/**/*.ts` — but ESLint is picking up `.js` files (compiled test artifacts in `test-compiled/`, root scripts) that are not in the `ignores` list and match the `tseslint.configs.recommended` rules. Individual `.ts` source files in `src/` are clean (verified per-file). | Add `'test-compiled/**'`, `'scripts/**/*.js'`, and `'**/*.js'` (or restrict to `src/**/*.ts test/**/*.ts`) to the `ignores` list so `npm run lint` covers only authored TypeScript source. Re-enable `@typescript-eslint/no-require-imports: 'error'` once the P1-1 inline-require fix is complete. |

---

## What Is Already Good

- **4-stage pipeline** (`load → validate → resolve → targets`) is cleanly separated with no cross-
  stage leakage. Each stage is independently importable and testable.
- **`Target` interface** is pluggable by design — adding a new platform is one file + one
  `registerTarget()` call, no core changes.
- **Zod schema layer** (`src/schema/index.ts`) is the single source of truth for all frontmatter
  shapes; `schema/*.schema.json` is auto-generated from it. Strong foundation for the typed-accessor
  improvement above.
- **Strict TypeScript** — `strict: true`, `esModuleInterop`, `resolveJsonModule`, all enabled.
  No `as unknown as` patterns found. No `any` in the core pipeline.
- **31 test files / 348 tests** — pipeline, targets (compile + scaffold), authoring, wizard, select,
  config-merge, trust, manifest, install-state all have dedicated coverage.
- **Formatting/lint CI** — Prettier and ESLint run in CI on every PR; `format:check` fails the
  build on drift.
- **Config-merge subsystem** (`src/config-merge/`) is cleanly separated with its own types,
  apply/reverse/drift/serialize split. An excellent model for other subsystems.
- **`src/authoring/`** — the six authoring sub-modules (check-source, frontmatter, header, import,
  move, update) are each well-focused and have test coverage.

---

## Remediation Roadmap

**P0 (this sprint — unblock scalability):**

1. Extract `cli.ts` command actions into `src/commands/<name>.ts` (22 modules). Make `cli.ts` a
   pure registration file under ~200 lines. Suggested extraction order: `add`, `build`, `validate`,
   `import`, `patch`, `move` (highest-complexity first). Keep helpers (`resolveDefault`,
   `loadAndValidate`, `writeFilesSync`, `partitionFiles`, `detectProjectTarget`, `mergeOpSection`)
   in a new `src/cli-helpers.ts`.

**P1 (next sprint — correctness and security):**

2. Replace inline `require()` with top-level imports; re-enable `@typescript-eslint/no-require-imports`.
3. Audit 10 silent catch blocks; add `console.warn`/cause-wrapped rethrows as appropriate.
4. Add `{ schema: yaml.JSON_SCHEMA }` to all 4 `yaml.load()` calls; add zod parse for `PacksConfig`.
5. Refactor triple-scaffold: extract `buildInstallPlan()`, collect scaffold results once per artifact.
6. Add `test/commands/add.test.ts`, `test/registry.test.ts` (after P0-1 extraction makes them testable).

**P2 (backlog — quality polish):**

7. Enable `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` in tsconfig; fix fallout.
8. Replace `as` casts with typed frontmatter accessors (leveraging zod inferred types).
9. Extract `wizard/add.ts` step functions.
10. `execSync` → `execFileSync` in `release` command.

---

## Verification Criteria (after implementation)

- `npm run lint` → 0 violations (including `no-require-imports` now **error**).
- `npm run build && npm run validate && npm test` → 0 failures.
- `src/cli.ts` < 200 lines (thin registration shell).
- `src/commands/*.ts` — each file < 200 lines; each command action function < 40 lines.
- `npm run sigil -- status` from repo root → 31 artifacts up-to-date (self-hosting unaffected).
- `grep -rn "require(" src/ --include="*.ts"` → 0 matches outside `allowlist.ts` (intentional lazy-require for trust scanner).
