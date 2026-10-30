---
name: react-release
description: "Prepare an npm release for a shared component library — verify quality gates, generate a changelog from git log, and propose a version bump with SemVer classification (React)"
when_to_use: "Run manually via `/react-release <version>` before cutting a release tag for a published component library — e.g. \"prepare a release\", \"cut version 2.1.0\", \"generate a release checklist\". Pass the target version number as the argument; omit it to get a suggested bump from recent commits. Does not tag, push, or publish — produces a checklist and changelog draft for human review. Complements react-api-compat-reviewer, which determines the correct SemVer bump from the exported component/hook diff."
allowed-tools: Read, Bash, Glob, Grep
argument-hint: "<version> (e.g. 2.1.0)"
disable-model-invocation: true
---

# Release Preparation

**Target version:** $ARGUMENTS

> This skill is **user-invoked only** (`disable-model-invocation: true`). It prepares
> the release but does **not** create a tag, push to remote, or publish to a registry.
> All final actions require human confirmation.

## Step 1 — Verify quality gates

Discover the combined gate from `package.json` scripts (`check`/`validate`/`ci`) and run it; fall
back to lint + type-check + `vitest run`/`jest` + `npm run build` separately only if none exists.
Building is part of the gate — a release with a build-breaking change must never ship.

**If any gate fails: stop and report.** A release with failing gates is blocked.

## Step 2 — Check the working tree

```bash
git status --porcelain
git stash list
```

If there are uncommitted changes or stashes, **report and stop** — a release must be cut from a
clean working tree.

Note the current branch and whether it is ahead of or behind the remote:
```bash
git log --oneline origin/main..HEAD
```

## Step 3 — Determine the version

**If `$ARGUMENTS` is provided:** use that as the target version.

**If `$ARGUMENTS` is empty:**
1. Read the current version from `package.json`'s `"version"` field.
2. Read recent commits (Step 4) and suggest a version bump:
   - Any `feat:` commit → **minor** bump (`X.Y+1.0`).
   - Only `fix:` / `refactor:` / `chore:` / `perf:` commits → **patch** bump (`X.Y.Z+1`).
   - A commit body containing `BREAKING CHANGE:` → **major** bump (`X+1.0.0`).
   - A `react-api-compat-reviewer` report with Breaking findings → **major** bump regardless.
Ask the user to confirm the version before proceeding.

## Step 4 — Generate changelog

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges
```

If no tag exists: `git log --oneline --no-merges`.

Group commits by type and produce a changelog section:

```markdown
## [<version>] — <today's date>
### ⚠️ Breaking Changes
- <summary of BREAKING CHANGE commits or react-api-compat-reviewer Breaking findings>
### Features
- <summary of feat: commits>
### Bug Fixes
- <summary of fix: commits>
### Performance
- <summary of perf: commits>
### Refactoring / Other
- <refactor, chore, docs, ci, test commits>
```

Omit sections with no entries.

## Step 5 — Check API compatibility

If a `react-api-compat-reviewer` report was produced for this branch, include its SemVer
recommendation and confirm it matches the proposed version bump. If not, suggest running it:

```
Note: react-api-compat-reviewer was not run. For a published component library, run it before
releasing to confirm no unintentional breaking changes to exported components/hooks.
```

## Output Release Checklist

```
## Release Checklist — v<version>

### Quality gates
✅ <gate command>: passed  /  ❌ <failure detail>
✅ type-check: passed  /  ❌ <failure detail>
✅ tests: passed  /  ❌ <failure detail>
✅ build: passed  /  ❌ <failure detail>

### Working tree
✅ clean  /  ❌ uncommitted changes — resolve before releasing

### Version
Current: <current-version>
Proposed: <target-version>
Bump type: <major / minor / patch>
API compat: <react-api-compat-reviewer SemVer recommendation, or "not run">

### Changelog draft
<markdown changelog section from Step 4>

### Next steps (human action required)
1. Review and edit the changelog above; paste into CHANGELOG.md.
2. Update "version" in package.json to <target-version>.
3. Commit: git commit -m "chore: release v<target-version>"
4. Tag:    git tag -a v<target-version> -m "Release v<target-version>"
5. Push:   git push origin main --tags
6. Publish: npm publish --provenance
```

---

## Applied Rules

### Conventions (React)

- **Function components only.** Never write class components for new code. Use function components with hooks.
- **One component per file.** Each file exports one primary component. Co-located sub-components are fine if small and not reused elsewhere.
- **Props typed with interfaces.** Define a `Props` interface at the top of each component file. Never use inline anonymous types in function signatures.
- **Destructure props at the top.** `const { title, onClick, children } = props;` — do not access `props.x` throughout the body.
- **Explicit return types.** `function MyComponent(props: Props): React.ReactElement` — helps catch accidental `undefined` returns.
- **`useCallback` and `useMemo` with intention.** Only memoize when the profiler shows a real problem or when a callback is passed to a child wrapped in `React.memo`. Premature memoization adds noise.
- **Keep effects minimal.** Each `useEffect` does one thing. If an effect has two unrelated cleanup paths, split into two effects.
- **No direct state mutation.** Treat all state as immutable. Use spread (`[...arr, item]`) or `immer` — never `arr.push(item)`.
- **Avoid prop drilling beyond two levels.** Use Context, or the state library the project already uses, when data flows more than two component levels down.
- **Key props on lists.** Always provide a stable, unique `key` on list items — never the array index unless the list is static and unordered.
- **Naming.** Follow the table below. The `use` prefix on hooks is not cosmetic — the Rules of Hooks lint relies on it.

| Symbol | Style | Example |
|---|---|---|
| Components (function and file) | `PascalCase` | `UserCard`, `UserCard.tsx` |
| Custom hooks | `use` + `PascalCase` | `useUserData`, `useDebounce` |
| Props interfaces | `Props` or `<Component>Props` | `Props`, `UserCardProps` |
| Event-handler props / handlers | `on<Event>` / `handle<Event>` | `onSelect`, `handleSubmit` |
| Functions, variables | `camelCase` | `formatDate`, `selectedRows` |
| Boolean props and state | `is`/`has`/`should` prefix | `isOpen`, `hasError` |
| Module-level constants | `UPPER_SNAKE` | `MAX_RETRY_COUNT` |

### npm (React)

## Commit the Lockfile

Commit `package-lock.json` (or `pnpm-lock.yaml`/`yarn.lock`, whichever the project's package
manager produces) — it is the reproducibility guarantee across every developer machine and CI run.
Use `npm ci` (not `npm install`) in CI: it installs strictly from the lockfile and fails if
`package.json`/lockfile are out of sync, instead of silently re-resolving.

Never hand-edit the lockfile. Pin a problematic transitive dependency with `overrides` in
`package.json`:

```json
{
  "overrides": {
    "vulnerable-transitive-dep": ">=2.1.0"
  }
}
```

## Semver Ranges in `package.json`

Use caret ranges (`^18.2.0`) for dependencies to accept non-breaking updates automatically, but rely
on the **lockfile**, not the range, for what's actually installed — the range is a policy for
`npm update`, the lockfile is the reproducible truth for `npm ci`. Pin exact versions (no `^`/`~`)
only for tooling where an unexpected minor bump has bitten the project before.

## `npm audit`

Run `npm audit` after adding or updating any dependency; run it in CI as a non-blocking report at
minimum, blocking on `high`/`critical` findings once the project's baseline is clean:

```bash
npm audit --omit=dev              # production dependency tree only
npm audit fix                     # auto-applies safe, non-breaking fixes
```

`npm audit fix --force` can introduce breaking major-version bumps silently — never run it without
reviewing the diff and re-running the full test suite + build afterward.

## Separate `dependencies` from `devDependencies`

Runtime libraries (anything imported into code that ships to the browser or runs the server) go in
`dependencies`. Build tooling, test runners, type stubs, and linters go in `devDependencies` — a
build tool accidentally in `dependencies` bloats a production install that doesn't need it (though
frontend builds typically bundle everything regardless, so this mostly matters for a Next.js
server/API-route dependency graph and for install-time cost in CI).

## Monorepo Workspaces

If the project uses npm/pnpm/yarn workspaces, add a dependency to the **specific package** that
needs it (`npm install <pkg> --workspace=apps/web`), never to the workspace root unless it is
genuinely shared tooling (a repo-wide linter config, a build orchestrator). A dependency hoisted to
the root that only one package actually uses obscures that package's real dependency graph.

## Remove Unused Dependencies

Audit with `depcheck` or `knip` periodically. An unused dependency still gets installed, still gets
audited, and — if it's ever imported by mistake through a barrel file — still ships to the client
bundle. Remove it and run `npm install` to refresh the lockfile.

See `react-add-package` for the automated vet-and-wire skill and `react-dependencies` for the
broader bundle-size and peer-dependency guidance this rule's mechanics support.
