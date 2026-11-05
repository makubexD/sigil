# Plan: first npm publish

Brief: [npm-first-publish.md](ideas/npm-first-publish.md). This plan answers its open questions from the checks below, run on
2026-11-04. Paid-gated items stay after this plan, so the `shared/ado` tool call is still unproven when it ships.

## What the checks found

| Fact                                                                                                                  | Source                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `sigil` on the registry is a tombstone: 0.0.1 and 0.0.2, created 2013, unpublished 2024-10-09                         | `https://registry.npmjs.org/sigil`                                                                                 |
| After a full unpublish the only written bar is a 24-hour wait, and a used `name@version` can never be reused          | [Unpublish policy](https://docs.npmjs.com/policies/unpublish)                                                      |
| npm can block a name it reads as a typosquat, and an unscoped name must not be spelled like another one (`sigil-cli`) | [Threats](https://docs.npmjs.com/threats-and-mitigations), [names](https://docs.npmjs.com/package-name-guidelines) |
| Trusted publishing needs npm 11.5.1+ and Node 22.14+; `release.yml` pins Node 20, so the job would fail               | [Trusted publishing](https://docs.npmjs.com/trusted-publishers)                                                    |
| Provenance is automatic under trusted publishing on a public repo, so `--provenance` isn't needed                     | Same page                                                                                                          |
| npm's example turns caching off for release builds; `release.yml` has `cache: npm`                                    | Same page                                                                                                          |
| `repository.url` must match the repo exactly. It does, and the repo is public                                         | Same page, `package.json`, `gh repo view`                                                                          |
| The tarball is 1.6 MB with 1323 files, including 156 from `docs/audits` plus plans and ideas                          | `npm pack --dry-run`                                                                                               |
| Nothing under `src/` reads `docs/` at run time. `build` writes there, but only in this repo                           | `grep` over `src/`                                                                                                 |
| No test installs the packed tarball, so `PKG_ROOT` has never been proven from an install                              | `grep` over `test/`, `scripts/`                                                                                    |
| Not logged in to npm on this machine, and `NPM_PUBLISH` is unset                                                      | `npm whoami`, `gh variable list`                                                                                   |

## Decisions

- **Name: try unscoped `sigil` first.** No written rule refuses it, and it's the shorter command. Only a real publish can prove
  it: nothing tests a name ahead of time. The fallback is `@<npm-user>/sigil`, and the `sigil` bin stays either way. Step 5 holds
  that path.
- **Account:** the owner's personal npm account, free, with 2FA.
- **Package docs:** ship `docs/guides/`, `docs/reference/`, `docs/setup/`, `docs/assets/` and `docs/index.md`. Audits, decisions,
  ideas and plans stay on GitHub.
- **Two releases.** v0.11.0 is the manual first publish, with no provenance. The next release goes through trusted publishing
  and restores `author-artifact`, so a plugin never points at a CLI that isn't on npm yet.

## Order

Steps 1 to 3 are one PR. It changes `release.yml`, so `pr-ready` refuses it and the owner merges it. Steps 4 to 6 are release and
account work on `master`. Steps 7 and 8 are a second PR and release. Steps 5 and 6 need the owner in a separate terminal or the
npm website: `npm login` and the 2FA prompts are interactive, and Claude never holds npm credentials.

## Step 1: Trim the package and smoke-test the tarball `[worker:medium]`

Files: `package.json`, `scripts/pack-smoke.cjs`.

In `files`, replace `docs/` with the five paths under Decisions. Add `scripts/pack-smoke.cjs` and a `pack:smoke` script, and run
it in `ci:local` right after `npm run catalog:build`. The script runs `npm pack` into a fresh temp folder, reads the tarball's
file list, installs it with `npm install --prefix <temp> <tarball>`, runs the installed bin, then removes the folder in a
`finally`. It exits non-zero with the failed check's name. It uses only Node built-ins and works on Windows.

| Case                                                                                         | Expected                                                                                     |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Tarball file list                                                                            | Holds `dist-cli/cli.js`, `catalog/`, `packs.yaml`                                            |
| Tarball file list                                                                            | No `docs/audits/`, `docs/decisions/`, `docs/ideas/`, `docs/plan-`, `test-compiled/`, `dist/` |
| Installed `sigil --version`                                                                  | Prints `package.json`'s version                                                              |
| Installed `sigil add prompt:shared/explain-diff --target claude --yes`, from an empty folder | Exit 0, and the prompt's file exists in that folder, not in the install                      |
| A removed file: drop `packs.yaml` from `files` by hand, then run it                          | Fails naming that check. Put the file back                                                   |

Test: `npm run build && npm run pack:smoke`.

## Step 2: Make the release job fit trusted publishing `[worker:medium]`

Files: `.github/workflows/release.yml`.

In the `publish` job only: set `node-version` to `'24'`, replace `cache: npm` with `package-manager-cache: false`, and change the
run line to `npm publish`, since provenance is automatic and `publishConfig.access` is already `public`. Rename the step to
`Publish to npm (OIDC)`. Update the comment block above it: the Node and npm minimums, and the trusted publisher's fields,
including that npm doesn't check them on save and they're case-sensitive (`makubexD`). Leave the `gate`, `marketplace` and
`skills` jobs alone.

| Case                                                                                                  | Expected                                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `git diff --stat`                                                                                     | Only `release.yml`                                             |
| The `publish` job                                                                                     | Still gated on `vars.NPM_PUBLISH`, still has `id-token: write` |
| `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/release.yml','utf8'))"` | No error                                                       |

Test: the node command above, then `npm run lint`.

## Step 3: Say how to install it `[inline: user-facing copy]`

Files: `README.md`, `docs/guides/consuming.md`, `docs/guides/publishing.md`, `CHANGELOG.md`.

Change `README.md:44-45` and `docs/guides/consuming.md:12-18` to present tense, with `npm install -g sigil` and `npx sigil` first
and clone-and-link kept for contributors. Add a short npm section to `publishing.md`: the manual first publish, the trusted
publisher fields, `NPM_PUBLISH`. Add a CHANGELOG line for the npm package, and one saying the `shared/ado` tool call after a real
`az login` is still unproven. Everything assumes the name `sigil`; step 5 corrects it if npm refuses.

Test: `npm run format:check`.

## Step 4: Release v0.11.0 without npm `[inline: release, owner's GO is the /next on this plan]`

After the owner merges the PR, on `master`: `npm run sigil -- release minor --yes`, then `git push origin master` and
`git push origin v0.11.0`. `NPM_PUBLISH` is still unset, so the `publish` job is skipped and that is expected. Check that gate,
marketplace and skills pass. A classifier denial here stops the step: alert the owner, who runs the same commands.

Test: `gh run list --workflow release.yml --limit 1` shows success.

## Step 5: First publish `[inline: the owner runs it, interactive login and 2FA]`

In a separate terminal, with a free npm account that has 2FA on:

```bash
npm login
git switch --detach v0.11.0 && npm ci
npm publish
git switch master
```

Then, from an empty folder: `npx sigil@0.11.0 --version`.

Claude checks `https://registry.npmjs.org/sigil` for the version and records the result in this plan.

If npm refuses the name (a 403 or a similarity error), stop and do not retry under another unscoped name. Then, on a new branch:
set `name` to `@<npm-user>/sigil`, keep `bin` as is, update the install lines in `README.md`, `docs/guides/consuming.md`,
`publishing.md` and the hint at `src/manifest/io.ts:41`, release a patch, and repeat this step with `npm publish --access public`
for that version. The tag and marketplace for v0.11.0 stay as they are.

Test: `npx <name>@<version> --version` prints the version.

## Step 6: Connect trusted publishing `[inline: the owner runs it on npmjs.com]`

On the package's settings page, add a GitHub Actions trusted publisher: user `makubexD`, repository `sigil`, workflow
`release.yml`, no environment, and allow `npm publish`. npm doesn't check these when saved, so a typo only shows up at step 8.

Then set the variable, which Claude can do with the owner's OK: `gh variable set NPM_PUBLISH --body true`.

Leave **Require two-factor authentication and disallow tokens** for after step 8 proves the route.

Test: `gh variable list` shows `NPM_PUBLISH true`.

## Step 7: Put `author-artifact` back in the plugin `[worker:medium]`

Files: `packs.yaml`, `docs/guides/consuming.md`, `test/fixtures/output-snapshot/ids.json`,
`test/fixtures/output-snapshot/build.json`, and any test that fails on the exclusion.

Remove `pluginExclude` and its comment from `essentials` (`packs.yaml:34-35`). Rewrite the last sentence of its description
(`packs.yaml:26`) so the plugin names `/essentials:author-artifact` and says it needs the `sigil` CLI. Change
`docs/guides/consuming.md:530-533` the same way. Regenerate the snapshot with the repo's own script, and read its diff: it may
only add this one artifact.

| Case                                                            | Expected                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| `dist/claude` after `npm run catalog:build`                     | `essentials` carries `author-artifact`, plus `explain-diff` |
| Snapshot diff                                                   | Only the `author-artifact` lines                            |
| `sigil sync --check`                                            | Passes                                                      |
| `sigil add pack:essentials --target claude`, in an empty folder | Same files as before this step                              |

Test: `npm run build && npm run build:test && node --test test-compiled/select/pack-members.test.js test-compiled/targets/plugin-prompts.test.js`.

## Step 8: Prove the automatic route `[inline: release, then close out]`

After that PR merges: `npm run sigil -- release minor --yes`, then push `master` and the tag by name. This is the first run of the
`publish` job.

| Check                                               | Expected                                              |
| --------------------------------------------------- | ----------------------------------------------------- |
| `publish` job                                       | Success. An `ENEEDAUTH` means a step 6 field is wrong |
| `npm view <name> dist.attestations --json`          | Has a provenance entry                                |
| `npx <name>@latest --version`, from an empty folder | Prints the new version                                |
| Marketplace `essentials`                            | Carries `author-artifact`                             |

Then ask the owner to turn on **Require two-factor authentication and disallow tokens**. Close out: delete
`docs/ideas/npm-first-publish.md` and its row in `docs/ideas/README.md`, moving what's still true to `publishing.md`.

Test: the table above.
