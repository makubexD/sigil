# Decision Log: src/ Conformance Pass (July 2026)

**Date:** 2026-07-30  
**Scope:** Full `src/` audit against the project's own TypeScript rules  
**Commits:** d7e928c → cdf276b

---

## What changed and why

This pass enforced the project's own `.claude/rules/typescript-ts-*` rules against `src/` itself —
"eating our own cooking." Every finding was measured against a rule file the project ships; no
external style guides were introduced.

### WS1 — CLAUDE.md drift (d7e928c)

**Problem:** 14+ paths in CLAUDE.md pointed to files that no longer existed after the module split
(e.g., `src/select.ts`, `src/wizard.ts`, `src/manifest.ts`). Caused the docs to actively mislead.

**Fix:** Rewrote stale paths to current directory/module names; added a `src/` module map table.

**Why logged:** User memory "keep docs/manifests in sync" — every structural change must be
immediately reflected in CLAUDE.md and other docs.

---

### WS2 — Domain module extraction (fb9993d) + CLI handler extraction (2026-07-30)

**Problem:** `src/cli.ts` was 2329 lines with 20 of 22 command handlers containing inline business
logic inside `.action()` callbacks. Violated `ts-code-quality` §Layering and §Code Structure Limits
(≤200 lines/module). Zero tests imported `cli.ts` — untestable.

#### WS2a — Domain module extraction (fb9993d, partial)

Extracted supporting domain modules (NOT the cli.ts handlers):

- `src/commands/add.ts`, `src/commands/patch.ts` (2 of 22 handlers — only ones actually extracted)
- `src/select/` (4 modules: selection, closure, grouping, vocabulary)
- `src/wizard/` (7 modules: add, new, edit, state-display, command-strings, types, index)
- `src/manifest/` (5 modules: io, hash, mutate, status, types)
- `src/authoring/import/`, `src/authoring/move/`, `src/authoring/update/` (sub-modules)
- `src/query/`, `src/kinds.ts`, `src/registry.ts`, `src/install-state.ts`, `src/config-utils.ts`
- `src/targets/claude-code/{plugin-build,scaffold}.ts` and copilot counterparts
- `src/trust/scan/{allowlist,rules,types,index}.ts`

**⚠ Correction:** This commit's message claimed "split the 2329-line cli.ts monolith into commands/"
but `cli.ts` actually **grew from 1559 → 2333 lines** in that commit. Only `runAdd` and `runPatch`
were extracted to `commands/`; the other 20 handlers remained inline. This was a factual error in
the commit message and in the original version of this decision log.

#### WS2b — CLI handler extraction, completed 2026-07-30

**Fix (the real one):** Extracted all remaining 20 inline handlers to `src/commands/*.ts`:

| New module               | Exported function             | Key fix beyond extraction                                                                     |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `commands/build.ts`      | `runBuild`                    | —                                                                                             |
| `commands/check.ts`      | `runCheck`                    | Replaced `require('fs')` at cli.ts:705                                                        |
| `commands/complete.ts`   | `runComplete`                 | —                                                                                             |
| `commands/completion.ts` | `runCompletion`               | `CompletionOptions` → `Record<string,never>` (ESLint)                                         |
| `commands/delete.ts`     | `runDelete`                   | —                                                                                             |
| `commands/edit.ts`       | `runEdit`                     | —                                                                                             |
| `commands/get.ts`        | `runGet`                      | —                                                                                             |
| `commands/import.ts`     | `runImport`                   | Replaced `await import('gray-matter')` with static `import`                                   |
| `commands/index.ts`      | `runIndex`                    | —                                                                                             |
| `commands/init.ts`       | `runInit`                     | —                                                                                             |
| `commands/list.ts`       | `runList`                     | —                                                                                             |
| `commands/move.ts`       | `runMove` + `loadCatalogSync` | Replaced 3 inline `require('gray-matter'/'fast-glob'/'fs')`                                   |
| `commands/new.ts`        | `runNew`                      | —                                                                                             |
| `commands/release.ts`    | `runRelease`                  | Replaced `await import('@clack/prompts')` with static `import`; `ISO_DATE_LEN` named constant |
| `commands/retarget.ts`   | `runRetarget`                 | —                                                                                             |
| `commands/search.ts`     | `runSearch`                   | —                                                                                             |
| `commands/status.ts`     | `runStatus`                   | —                                                                                             |
| `commands/uninstall.ts`  | `runUninstall`                | —                                                                                             |
| `commands/update.ts`     | `runUpdate` + `isFileDrifted` | DRY fix: `isFileDrifted()` pure helper; replaces 7 inline `require()` calls                   |
| `commands/validate.ts`   | `runValidate`                 | —                                                                                             |

**Additional fix — `trust/scan/allowlist.ts`:** The file used `require('fs')` / `require('path')`
inside a try/catch with the incorrect comment "Dynamic require keeps this module importable in
test environments without real FS." Node.js built-ins never throw on require; the pattern was a
misunderstanding. Replaced with top-level `import fs from 'node:fs'`.

**`cli.ts` after extraction:** 310 lines (after Prettier reflow) of pure Commander wiring —
`.command().description().option().action(runX)` only. No inline business logic. No `process.exit`
calls. Zero `require()` calls in all of `src/`.

**Trade-off documented:** The `ts-code-quality` rule sets 20-line function and 200-line module
limits as **enforced-going-forward** targets. We did not mechanically shred every existing helper
to ≤20 lines — the same rule's DRY/KISS caveat warns that over-abstraction is worse than mild
duplication. The God Object splits above are the meaningful ones; cosmetic splits of
already-cohesive helpers would add noise without value.

---

### WS3 — Tighten tsconfig strict flags (fb9993d)

**Problem:** `tsconfig.json` was missing three safety flags: `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, and `noImplicitOverride`. Also target was ES2020 which didn't
support `Error({ cause })`.

**Fix:**

- ES2020 → ES2022 target/lib (committed separately in a612499)
- Added all three flags to `tsconfig.json`
- Fixed ~35 resulting type errors by adding `| undefined` to optional interface fields across
  `UpdateOps`, `CatalogFrontmatter`, `TranslateResult`, `ImportItem`, `WizardResult`,
  `NewWizardResult`, `ConfigScopeDestination`, `ConfigMergeOp`, `SelectionFilters`,
  `SearchFilters`, `HeaderValues`, and the internal wizard state types
- Added bounds guards for `noUncheckedIndexedAccess` hits: `lines[i] ?? ''` pattern in
  `discover.ts` and `scanner.ts`; non-null assertion where the bound is already proven (e.g.
  `steps[i]!` in `execute.ts`, `langKeys[0]!` in `wizard/add.ts`); default-in-destructure in
  `release.ts` (`[, maMajor = 0, miMinor = 0, paPatch = 0] = match.map(Number)`)

**`verbatimModuleSyntax` deferred — documented:** This flag requires `module: NodeNext` + `.js`
import specifiers + replacing `require()`/`__dirname` throughout. The change would affect the
published CLI `bin` path, which is a release-path risk. Per the rule's own caveat ("never silently
disable a strict check without a documented reason"), the deferral is recorded here and in a comment
in `tsconfig.json`. Revisit when ready to migrate to ESM-first packaging.

---

### WS4 — Type-aware ESLint (cdf276b)

**Problem:** ESLint was running without type information, so `no-floating-promises` was unavailable.
`no-explicit-any` was a warning (rule says: error). No `import/order` enforcement.

**Fix:**

- Enabled `parserOptions.projectService: true` for automatic tsconfig discovery
- Added `@typescript-eslint/no-floating-promises: error`
- Raised `@typescript-eslint/no-explicit-any: warn → error` (the single remaining `any` in
  `src/schema/emit.ts` already has an `eslint-disable-next-line` suppression comment)
- Removed dead `preserve-caught-error: 'off'` directive (this rule does not exist in ESLint 10)

**`import/order` deferred:** `eslint-plugin-import` is not installed and wasn't present in
`devDependencies`. Adding it was a separate install decision. The rule is low-impact compared to
the type-safety rules already enabled; import ordering is enforced by convention and Prettier-style
grouping comments in the existing code. Add when `eslint-plugin-import` is added.

---

### WS5 — Cause-chain throws (a612499 + fb9993d)

**Problem:** 27 `throw new Error(...)` sites with no `{ cause: err }` — dropping upstream stack
traces and making errors harder to diagnose.

**Finding after audit:** Of the 27 sites, only 3 were true catch-rethrows (throw inside catch,
creating a new Error instead of re-throwing the original). The rest were either:

- **CLI boundary exits** (`console.error + process.exit(1)`) — terminal, not rethrows, no cause needed
- **Error-return patterns** (`return { ok: false, errors: [err.message] }`) — proper typed returns

The 3 true rethrows were fixed in a612499 (`manifest/io.ts`, `load.ts` ×2).

---

### WS6 — Security hardening (d1d5b53)

Three vulnerabilities against `ts-security`:

1. **YAML unsafe deserialization** — `yaml.load(raw)` with default schema allows arbitrary JS object
   construction via YAML `!!js/object` tags. Fixed: `yaml.load(raw, { schema: yaml.JSON_SCHEMA })` at
   all 4 call sites. Centralised a safe `loadYaml<T>` wrapper to prevent future omissions.

2. **Shell injection** — `execSync(\`git add ${files}\`)`(string interpolation). Fixed: replaced 3`execSync`interpolated calls in the release command with`execFileSync('git', [...args])`.

3. **Prototype pollution** — `deepMerge` assigned every incoming key (including `__proto__`,
   `constructor`, `prototype`) to the target object. Fixed: added `FORBIDDEN_KEYS` set guard in
   `config-merge/primitives.ts`. Added test verifying `Object.prototype` is not mutated.

---

### WS6b — Name magic literals (a140191)

Named previously-bare string literals that controlled JSON file destinations and display paths:

- `CLAUDE_JSON_FILE`, `PROJECT_MCP_FILE`, `PROJECT_SETTINGS_FILE`, `LOCAL_SETTINGS_FILE`,
  `CLAUDE_MCP_SERVERS_KEY = 'mcpServers'` in `targets/claude-code/config.ts`
- `COPILOT_MCP_SERVERS_KEY = 'servers'` in `targets/copilot/index.ts`
- `SECRET_MASK_PREFIX_LEN = 4`, `SECRET_MASK_SUFFIX_LEN = 2`, `SNIPPET_MAX_LEN = 80` in
  `trust/scan/scanner.ts`
- `ISO_DATE_LEN = 10` in `commands/release.ts` (moved from `cli.ts` with WS2b handler extraction)

**Explicitly NOT touched:** `ArtifactKind` union members (`'skill'`, `'agent'`, etc.) — these are
type-checked discriminated union members sourced in `kinds.ts`. "Constant-ifying" them would be
churn that contradicts `ts-conventions` §Constants (only module-level mutable state is banned, not
discriminated union literals).

---

### WS8 — Quality-gate script (cdf276b)

Added `"check": "tsc --noEmit && npm run lint && npm run format:check && npm test"` to
`package.json` scripts. Required by `ts-git` §Pre-Push Checklist: "Discover from `package.json`
scripts (`npm run check` or equivalent)."

---

## What was ruled out

| Item                                          | Rationale                                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verbatimModuleSyntax`                        | Requires ESM migration; risks published bin path. Deferred, documented in tsconfig.json.                                                                                                          |
| `import/order` ESLint rule                    | `eslint-plugin-import` not installed; low-impact vs. other fixes.                                                                                                                                 |
| Mechanically shred all functions to ≤20 lines | Over-abstraction is worse than mild duplication (ts-code-quality §DRY/KISS). Limit enforced going-forward on new code.                                                                            |
| WS7 — further God Object splits               | Deferred; existing God Objects (wizard/add.ts 866L, targets/claude-code/index.ts 435L) are internally cohesive with clear naming. Split when the natural next extension creates a second concern. |

---

## Post-pass state

```
tsc --noEmit            → 0 errors (strict bundle + 3 extra flags)
npm run lint            → 0 errors, 0 warnings
npm run format:check    → clean
npm test                → 350/350 pass
npm run validate        → catalog schema + reference graph intact
npm run catalog:build   → dist/claude + dist/copilot emit correctly
```
