---
name: ng-document
description: "Generate or update TSDoc and module-level documentation for Angular code, following the project's documented documentation style"
when_to_use: "Run via `/ng-document [file]` when public symbols, components, or services are missing TSDoc — e.g. \"document this service\", \"find undocumented public API\". Omit the argument to scan the whole source for undocumented symbols."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "[file-or-module] (optional)"
---

# Document

**Target:** $ARGUMENTS

## Step 1 — Resolve target

**If `$ARGUMENTS` is provided:** treat it as the target file or module.

**If `$ARGUMENTS` is empty:**
1. Discover the source root (from `angular.json` or `package.json`).
2. Scan for exported symbols, components, and services that lack TSDoc:
   ```bash
   grep -rn "export \(class\|function\|const\|interface\|type\|enum\)" <source-root> --include="*.ts"
   ```
3. List the top candidates (most undocumented symbols) and ask the user to choose.

## Step 2 — Discover documentation style

Do **not** assume a style. Discover it:
- Read `CLAUDE.md` and any rules files present.
- Check for Compodoc config (`.compodocrc*`, a `compodoc` script in `package.json`) and any TSDoc/eslint-jsdoc config.
- Read 2–3 existing doc comments to match the in-use tag conventions.
- If no style is in use, default to **TSDoc** (`@param` / `@returns` / `@throws` / `@remarks` / `@deprecated`).

## Step 3 — Read the target

Read the target file fully. Identify:
- Exported classes, functions, methods, interfaces, types, enums that are **missing** TSDoc — primary targets.
- Component **`@Input`/`@Output`** and signal **`input()`/`output()`/`model()`** — document each contract (range, units, default, required).
- Public service methods and any `InjectionToken` — document what they provide and the expected lifetime.
- Items with **incomplete** docs (missing `@param`, `@returns`, or `@throws`).
- Module/file header: present and accurate, or absent/stale.

Do not touch private helpers unless their purpose is genuinely non-obvious.

## Step 4 — Write documentation

For each missing or incomplete doc comment:

**One-liner (trivial):**
```ts
/** Return true if `d` falls on Saturday or Sunday. */
export function isWeekend(d: Date): boolean { … }
```

**Full TSDoc (non-trivial):**
```ts
/**
 * Merge calendar and dev-activity rows into a unified daily timeline.
 *
 * Calendar rows are preserved verbatim. Dev-activity rows fill the remaining
 * time up to the daily cap, in ticket order; rows crossing the cap are truncated.
 *
 * @param calRows - Ordered calendar rows.
 * @param devRows - Ordered dev-activity rows.
 * @returns A merged list sorted by start time.
 * @throws RangeError if the inputs contain overlapping time ranges.
 */
export function mergeTimeline(calRows: CalRow[], devRows: DevRow[]): TimesheetRow[] { … }
```

**Component contract:**
```ts
/** Current rating, 0–5 inclusive. Values outside the range are clamped. */
readonly value = input.required<number>();
```

**Rules:**
- Never restate the symbol name as the entire summary (`getUser()` + `/** Get the user. */`).
- Document *why* and *what contract*, not *how* (implementation details drift).
- Keep the summary line ≤ 72 characters.
- `@throws`: only document errors the caller must handle.

## Step 5 — Run and report

Run the project's lint/type command to verify the new docs compile and satisfy any doc lint rules
(check `package.json` scripts; fallback `ng lint` / `npx eslint <file>` and `tsc --noEmit`).

```
## Documentation Report

Target: <file-or-module>
Doc comments added: <N>
Doc comments updated: <N>
Still undocumented: <N> (list them)
Lint / type check: ✅ passed / ❌ failed
```

---

## Applied Rules

### Documentation (Angular)

## TSDoc Style
Document every exported symbol with TSDoc. Use the standard block tags — `@param`, `@returns`,
`@throws`, `@remarks`, `@deprecated` — so editors, `tsc`, and Compodoc render them:

```ts
/**
 * Parse raw text into a list of entries.
 *
 * @param raw - The raw input string (may be multi-line).
 * @returns A list of parsed entries; empty array if the input is blank.
 * @throws ParseError if the input is structurally invalid.
 */
export function parse(raw: string): Entry[] { … }
```

## What Requires Documentation
- Every **public** (exported) class, function, method, interface, type alias, and enum.
- Every component **`@Input()`** / **`@Output()`** and every signal `input()` / `output()` /
  `model()` — state the contract: expected values, units, defaults, and whether it is required.
- Every public service method and every `InjectionToken` (what it provides and its expected lifetime).
- Every non-obvious parameter, even when annotated.

```ts
@Component({ selector: 'app-rating' /* … */ })
export class RatingComponent {
  /** Current rating, 0–5 inclusive. Values outside the range are clamped. */
  readonly value = input.required<number>();

  /** Emits the new rating when the user selects a star. */
  readonly ratingChange = output<number>();
}
```

Private helpers warrant a brief one-liner only if their purpose is non-obvious; skip the full
tag block for trivial ones.

## What Must Not Go in Docs
- Implementation detail that will drift from the code and become misleading.
- Commented-out code (see the no-commented-code rule in `ng-code-quality`).
- A restatement of the symbol name (`getUser()` + `/** Get the user. */` adds nothing).

## Comments
Use comments to explain **why**, not **what** — the code already shows what. A comment restating the
operation (`// increment counter`) is noise; a comment explaining intent (`// 1-based because the API
pages from 1`) is signal. Never comment out code — delete it; git history is the backup (see `ng-git`).

## Module / File Headers
A file whose responsibility is not obvious from its name starts with a one-line summary comment,
optionally followed by an extended description. This is what Compodoc and module listings surface.

```ts
/**
 * Normalise calendar events from ICS format into local-timezone rows.
 *
 * Applies status filtering, same-start deduplication, and daily-cap rounding.
 */
```

## README Expectations
Every project should have a top-level `README.md` containing:
- What the project does (one paragraph).
- Installation / quickstart (`npm ci`, `ng serve`).
- Required environment / runtime config (names only, never secret values).
- How to run the tests and the quality gate.

Do not create or update the README inside a normal coding task — maintain it deliberately.

## Keeping Docs Current
When a public symbol's signature, return contract, thrown error, or behaviour changes — or when a
component's `@Input`/`@Output`/signal surface changes:
1. Update the TSDoc in the **same commit**.
2. Update the file/module header if the file's stated responsibility changed.
3. Update the `README` if the change affects installation, usage, or runtime configuration.

A stale doc actively misleads — it describes the wrong contract.

## Types as Documentation
Fully annotated public signatures are documentation. Prioritise keeping annotations and template
types accurate (with `strict` and `strictTemplates`) over voluminous prose — a wrong comment
misleads silently, but a wrong type fails the compiler.
