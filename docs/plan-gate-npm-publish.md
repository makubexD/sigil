# Plan: gate the npm publish job, then cut the first marketplace release

Goal: a `v*.*.*` tag ships the Claude marketplace with a green Release run, while npm publishing stays off until the
npm first-publish brief (`docs/ideas/npm-first-publish.md`, the last backlog item) turns it on. Today `release.yml`
runs `publish` (`npm publish --provenance`) on every tag; with no Trusted Publisher it fails and turns the run red, and
once credentials exist a tag would publish to npm unasked.

Mechanism: a repository variable `NPM_PUBLISH`. The `publish` job runs only when it is `'true'`; unset, the job is
skipped (not failed), so the Release run concludes `success`. `marketplace` already depends only on `gate`.

Branch: `feat/gate-npm-publish`.

## Step 1 — gate the job and guard it with a test `[worker:medium]`

Files: `.github/workflows/release.yml`, `test/workflows.test.ts`.

- `release.yml`, `publish` job: add `if: vars.NPM_PUBLISH == 'true'` directly under `needs: gate`.
- `release.yml`, the `# ── Gate ──` header comment (lines ~12-16): say `publish` also requires the repository variable
  `NPM_PUBLISH` set to `true`, and is skipped otherwise, so a release before npm is set up still concludes green.
- `release.yml`, the `RECOMMENDED PATH` comment block: add step `3. In GitHub → Settings → Secrets and variables →
Actions → Variables, set NPM_PUBLISH = true.` and note the same applies to the token fallback.
- `test/workflows.test.ts`: add a case in the existing `describe`:
  `it('should skip npm publish unless the NPM_PUBLISH repository variable is true', …)` — slice `release.yml` from
  `/^  publish:\s*$/m` to the next `/^  [a-z-]+:\s*$/m` job header and assert it matches
  `/^\s{4}if:\s*vars\.NPM_PUBLISH == 'true'\s*$/m`.
  Expected: passes with the change; fails (no match) if the `if:` line is removed.
- Also assert the `marketplace` job block does **not** contain `NPM_PUBLISH` (it must never wait on npm).

Test: `npm test` — all pass, including the two new assertions. Then remove the `if:` line locally, rerun
`node --test test-compiled/test/workflows.test.js` (path as `pretest` emits it), confirm the new case fails, restore.

## Step 2 — release guide and CLI copy `[worker:medium]`

Files: `docs/guides/operations.md`, `src/commands/release.ts`.

- `operations.md` § after "Pushing a `v*.*.*` tag triggers …" (line ~225): say the workflow runs the gate, then the
  marketplace publish, and runs `npm publish --provenance --access public` only when the repository variable
  `NPM_PUBLISH` is `true`; until then the npm job is skipped.
- `operations.md` § "One-time npm setup": add step 3, set repository variable `NPM_PUBLISH` to `true`
  (Settings → Secrets and variables → Actions → Variables). Change "After that, tag pushes publish automatically" to
  "After all three, tag pushes publish to npm automatically".
- `src/commands/release.ts` `printReleaseSummary`: replace the last line with
  `'This triggers release.yml: the CI gate, the Claude marketplace publish, and npm publish when NPM_PUBLISH is set.'`

Test: `npm run check` passes; `grep -rn 'NPM_PUBLISH' docs/guides/operations.md src/commands/release.ts` shows both.

## Step 3 — decision record and npm brief `[worker:medium]`

Files: `docs/decisions/publish-claude-marketplace-2026-10.md`, `docs/ideas/npm-first-publish.md`.

- Decision doc § Drift gate, the sentence "since npm publish can fail while the marketplace job succeeds": change to
  "since the npm publish job can fail or be skipped (it runs only when the `NPM_PUBLISH` repository variable is
  `true`) while the marketplace job succeeds".
- npm brief § Evidence, the `release.yml` bullet: add that the `publish` job is gated on `vars.NPM_PUBLISH == 'true'`.
  § Success criteria: add "`NPM_PUBLISH` repository variable set to `true`" after "Trusted Publisher configured".

Test: `npx prettier --check docs/decisions/publish-claude-marketplace-2026-10.md docs/ideas/npm-first-publish.md`.

## Step 4 — ship the PR `[inline: release judgment]`

`npm run ci:local`, push, open the PR, wait for CI, merge. Do not set `NPM_PUBLISH`.

## Step 5 — cut `v0.1.0` `[inline: owner action]`

Owner runs `sigil release` (or tags `v0.1.0` on `master`) and pushes the commit and tag.

## Step 6 — verify the release `[inline: verification]`

- Release run for `v0.1.0`: `gate` ✓, `publish` **skipped**, `marketplace` ✓, run conclusion `success`.
- `git ls-remote origin marketplace refs/tags/marketplace-v0.1.0`: both exist, the tag points at the branch tip.
- Marketplace drift run triggered by that Release run: concluded `success` (not the "no marketplace branch yet" skip).

## Step 7 — owner clean-machine install `[inline: owner action]`

`/plugin marketplace add makubexD/sigil#marketplace`, install one pack, confirm it loads.

## Step 8 — mark the channel supported `[worker:medium]` (only after step 7 is confirmed)

Files: `README.md`, `docs/setup/claude-code.md`, `docs/index.md`, `docs/decisions/publish-claude-marketplace-2026-10.md`.

- `README.md:86-88`: delete the "First publish pending" blockquote and the blank line after it.
- `docs/setup/claude-code.md:10-11`: same.
- `docs/index.md` S2 row: status `Supported (first publish pending)` → `Supported`; in the notes cell replace
  "From the next release on, each release pushes" with "Each release pushes".
- Decision doc `Status:` paragraph: → "Status: shipped; first published with `v0.1.0` (2026-MM-DD), clean-machine
  install confirmed by the owner." keeping the ADR sentence that follows.

Test: `npx prettier --check` on the four files; `grep -rn -i 'first publish pending' README.md docs/` returns nothing.
