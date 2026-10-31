# Plan: artifact proposal issue form

Source: `docs/ideas/artifact-proposal-issue-form.md`. One branch and one PR:
`feat/artifact-proposal-issue-form`. Commit this plan on that branch, because `master` takes PRs only.

## Evidence check (2026-10-30)

Every claim was checked against the code. Scaffolding was probed on a scratch copy of `catalog/`.

| Brief claim                                                       | Result                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `.github/` holds only `workflows/` and `PULL_REQUEST_TEMPLATE.md` | True; no `ISSUE_TEMPLATE/`                                                                   |
| The PR template asks for skill / agent / rule / prompt            | True; it also has a free-text `Language:` line that the form reuses                          |
| `sigil new [kind]` is at `src/cli.ts:133`                         | Drifted: `src/cli.ts:128`, `--catalog-dir` at `:134`                                         |
| `sigil new` has a wizard, so triage can run it interactively      | True for bare `sigil new`, but see finding 1                                                 |
| `shared/author-artifact` is in `essentials`                       | True; `packs.yaml` also lists it in `pluginExclude`, so it needs `sigil add`, not the plugin |
| Triage is `sigil new <kind>`, `sigil check`, PR                   | Wrong in two ways: findings 1 and 3                                                          |
| Form fields map to `sigil new` inputs                             | Partly: finding 4                                                                            |

Findings the brief doesn't have:

1. **`sigil new <kind>` does not open the wizard.** `needsWizard` needs no kind or `-i`
   (`src/commands/new.ts`). Without `--name` it writes a placeholder `new-<kind>`. Probed:
   `sigil new skill` created `shared/new-skill`. Triage has to say `sigil new` with no arguments.
2. **A shared skill can't pass `sigil check` as scaffolded.** `buildSkillLines` writes
   `language: TODO` when no language is given (`src/authoring/header-builders.ts:35`), which `check`
   and `sync --check` reject. The agent, rule and prompt scaffolds pass. Step 1 fixes this.
3. **`sigil check` passing is not enough.** A scaffolded skill passed `check` and `validate`, then
   failed `sync --check`: no family in `standard.yaml`, name lacks the `cs-` prefix, description
   doesn't name its language. Agents, rules and skills fail the family check, shared ones too;
   prompts don't, as they have no family. Every language artifact needs the prefix and the language
   in its description. Triage has to cover all of that.
4. **Flags can't carry title or description.** Only the wizard takes them; `--yes` leaves TODO text.
   Nothing in `sigil new` takes a trigger, an example or sources.
5. **GitHub Discussions is off** on this repo (`hasDiscussionsEnabled: false`), yet `CONTRIBUTING.md`
   (lines 9, 21) and `docs/index.md:53` send people to "an issue or discussion". Steps 4 and 5 fix those.
6. **A form's `labels:` needs the label to exist**, or GitHub drops it silently. `artifact-proposal`
   doesn't exist yet. Step 6 creates it.
7. **`whenToUse` is skill-only.** It's on `SkillSchema` (`src/schema/index.ts:118`) and not on
   `PromptSchema`, so a prompt's trigger goes in `description`, like an agent's.
8. **The wizard has no "keep the default" answer for platforms.** Selecting nothing goes back a step
   (`src/wizard/steps/new/platforms.ts`). Selecting every AI gives the DRY default, because
   `normalizePlatforms` drops a full set.
9. **Plain `sigil check` doesn't scan for injection.** A body with "Ignore all previous instructions"
   passed `sigil check` and failed `sigil check --trust` (`injection/ignore-previous`). This matters
   because proposal text comes from strangers and catalog bodies become AI instructions.

## Decisions (edit these in review)

- **Bug-report and new-AI-tool forms: no.** Only the proposal form ships.
- **Enable it now: yes.** The repo is public with issues on, and `CONTRIBUTING.md` already says a
  form is planned.
- **Free text only.** No draft `description` field; "What should it do?" feeds it at triage.
- **`blank_issues_enabled: true`.** Without bug and feature forms, disabling blank issues would
  leave proposals as the only way to open an issue.
- **`title` is the issue title, not a body field.** A second title field would duplicate it. This
  differs from the brief's field list.
- **No `name` or `platforms` field.** Names follow catalog prefixes a proposer doesn't know, and the
  DRY default is all platforms. `CONTRIBUTING.md` stops asking which AI tool it's for.
- **`language` is free text**, as in the PR template. A dropdown would drift from `catalog/languages/`
  and couldn't express a stack such as "EF Core". Unknown languages are refused by `sigil new`.
- **Kind gets a `not sure` option**, because the proposer may not know the difference. The other
  kinds stay out: the wizard offers only these four.
- **Proposal text is untrusted input.** The maintainer writes the body in their own words instead of
  pasting from the issue, and triage runs `sigil check --trust`. Sources may also be licensed text.
- **The form promises a review, not an artifact.** Its copy says a maintainer reviews each proposal,
  and it links the catalog so people look for an existing artifact first.
- **The triage flow goes in `CONTRIBUTING.md`**, next to the PR step it ends in.
- **Fixing finding 2 is in scope**: the documented flow fails on a shared skill without it.

Field map, also written into `CONTRIBUTING.md` by step 4:

| Form field              | `sigil new` wizard input | Rest of the mapping                                                   |
| ----------------------- | ------------------------ | --------------------------------------------------------------------- |
| Issue title             | title                    |                                                                       |
| Kind                    | kind                     | `not sure`: the maintainer picks                                      |
| Language or shared      | language                 | A new language needs its `language.yaml` first                        |
| What should it do?      | description              | Also the body                                                         |
| When should it trigger? | none                     | Skill: `whenToUse`. Agent, prompt: `description`. Rule: `appliesTo`   |
| Example prompt          | none                     | Use it to try the artifact; goes in the PR's testing notes            |
| Sources                 | none                     | Reference while writing the body                                      |
| (maintainer picks)      | name, platforms          | Name takes the language `prefix`; select every AI for the DRY default |

## Steps

### 1. Stop scaffolding `language: TODO` on shared skills `[worker:medium]`

Files: `test/authoring/header.test.ts`, `src/authoring/header-builders.ts`, `CHANGELOG.md`.

Add tests first:

| Case                                                      | Expected                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `headerFor('skill', …)` with no `language` (`shared/foo`) | no line matches `/^language:/m`; the output contains `# language:` |
| `headerFor('skill', …)` with `language: 'csharp'`         | the output contains the line `language: csharp`                    |

The first must fail on `language: TODO` before the fix. Then, in `buildSkillLines`, replace
`` `language: ${v.language ?? 'TODO'}`, `` with the same shape `buildAgentLines` uses:

```ts
v.language
  ? `language: ${v.language}`
  : '# language:     # omit for shared skills that work across all languages',
```

Under `## [Unreleased]` `### Fixed` in `CHANGELOG.md` (add the heading if a release emptied the section):

```md
- `sigil new skill` without `--language` no longer writes `language: TODO`, which failed `sigil check`.
```

Test: `npm test -- --test-name-pattern="headerFor"`. Then, on a temporary copy of `catalog/`:
`node dist-cli/cli.js new skill --name probe --yes --catalog-dir <copy>` prints `✓ source validation passed`.

### 2. Write the form guard test (RED) `[worker:medium]`

File: `test/issue-form.test.ts` (new). Use `import yaml from 'js-yaml'`, `ALL_KINDS` from
`../dist-cli/kinds`, and `path.dirname(CATALOG_DIR)` from `./helpers/catalog` as the repo root. Name
the suite `describe('issue form', …)`. No other CI check reads these files.

| Case                                                         | Expected                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `.github/ISSUE_TEMPLATE/propose-artifact.yml` top-level keys | `name` and `description` are non-empty; `labels` is `['artifact-proposal']`      |
| Non-markdown `body` ids, in order                            | `kind, language, what, trigger, example, sources`                                |
| Every `body` item `type`                                     | one of `markdown, dropdown, input, textarea`                                     |
| Every non-markdown item                                      | non-empty `attributes.label`; `id` matches `/^[A-Za-z0-9_-]+$/`                  |
| `kind` options                                               | exactly `skill, agent, rule, prompt, not sure`                                   |
| `kind` options except `not sure`                             | each is in `ALL_KINDS`                                                           |
| `validations.required`                                       | true for `kind, language, what, trigger`; false or absent for `example, sources` |
| `.github/ISSUE_TEMPLATE/config.yml`                          | `blank_issues_enabled === true`                                                  |
| Each `contact_links` entry                                   | non-empty `name` and `about`; `url` starts with `https://`                       |

Test: `npm test -- --test-name-pattern="issue form"`. All cases fail with `ENOENT`, for that reason only.

### 3. Add the form and the chooser config `[worker:medium]`

Files: `.github/ISSUE_TEMPLATE/propose-artifact.yml`, `.github/ISSUE_TEMPLATE/config.yml` (both new).
Use this text exactly; it's user-facing copy. Review it here.

`propose-artifact.yml`:

```yaml
name: Propose an artifact
description: Suggest a skill, agent, rule or prompt for the catalog. No YAML or clone needed.
title: 'Propose: '
labels: [artifact-proposal]
body:
  - type: markdown
    attributes:
      value: >-
        Describe the artifact in plain words and give it a short title above. Check the
        [catalog](https://github.com/makubexD/sigil/tree/master/catalog) first in case it already
        exists. A maintainer reviews each proposal and may ask a follow-up question here.
  - type: dropdown
    id: kind
    attributes:
      label: Kind
      description: >-
        skill: a how-to workflow the AI follows on request. agent: an AI persona with an ongoing
        role. rule: an always-on coding convention. prompt: a one-shot command.
      options:
        - skill
        - agent
        - rule
        - prompt
        - not sure
    validations:
      required: true
  - type: input
    id: language
    attributes:
      label: Language or shared
      description: For example csharp, python or react. Write "shared" if it works in any language.
    validations:
      required: true
  - type: textarea
    id: what
    attributes:
      label: What should it do?
      description: The result you want from the AI, and anything it must avoid.
    validations:
      required: true
  - type: textarea
    id: trigger
    attributes:
      label: When should it trigger?
      description: What someone would ask for, or which files it applies to.
    validations:
      required: true
  - type: textarea
    id: example
    attributes:
      label: Example prompt
      description: Something you would type to use it. Skip this for a rule.
  - type: textarea
    id: sources
    attributes:
      label: Sources
      description: Links to docs, standards or prompts it builds on.
```

`config.yml`:

```yaml
blank_issues_enabled: true
contact_links:
  - name: Write the artifact yourself
    url: https://github.com/makubexD/sigil/blob/master/CONTRIBUTING.md#a-contributing-an-artifact
    about: Scaffold it, validate it and open a pull request.
```

Test: `npx prettier --write .github/ISSUE_TEMPLATE && npm test -- --test-name-pattern="issue form"`
passes every case from step 2.

### 4. Document the proposal path and triage `[worker:medium]`

Files: `CONTRIBUTING.md`, `docs/guides/authoring.md`.

In `CONTRIBUTING.md`:

- Line 9: change `Open an issue or discussion and describe what you want` to
  `Open an issue and describe what you want`.
- Lines 21-24: replace the paragraph with:

  ```md
  You can contribute an idea without writing the artifact. Fill in the
  [artifact proposal form](https://github.com/makubexD/sigil/issues/new?template=propose-artifact.yml):
  it asks what the artifact should do, when it should trigger, and its language (or "shared"). A
  maintainer reviews each proposal and, if it fits the catalog, writes the artifact.
  ```

- Between section 7 and `# B. Contributing code`, add this section with a `---` rule after it:

  ```md
  ## Triage a proposal

  For maintainers. Proposals arrive with the `artifact-proposal` label.

  1. Read the issue and run `sigil search <term>`. If the catalog already covers it or it doesn't
     fit, close the issue with the reason. If what it should do or when it triggers is unclear, ask
     in a comment before scaffolding.
  2. Pick the kind and [where it goes](docs/guides/authoring.md#where-an-artifact-goes), then a
     kebab-case name. A language artifact's name starts with the `prefix` in its `language.yaml`.
  3. Run `sigil new` with no arguments. The wizard takes the kind, language, name, title and
     description. When it asks which AIs, select all of them unless the artifact needs a
     restriction; selecting none goes back a step. `sigil new <kind>` skips the wizard: without
     `--name` it writes a placeholder `new-<kind>`, and `--yes` leaves the title and description as
     TODO.
  4. Fill in what the wizard doesn't take, then write the body in your own words. Don't paste from
     the issue: catalog bodies become AI instructions on every install, and sources may be licensed.

     | Form field              | Where it goes                                                         |
     | ----------------------- | --------------------------------------------------------------------- |
     | When should it trigger? | Skill: `whenToUse`. Agent or prompt: `description`. Rule: `appliesTo` |
     | Example prompt          | Try the artifact with it; quote the result in the PR's testing notes  |
     | Sources                 | Reference while writing the body                                      |

  5. Add an agent, rule or skill to a family in `catalog/standard.yaml`
     ([how](docs/guides/authoring.md#add-a-new-skill-that-reuses-an-existing-rule-and-agent));
     prompts have no family. A language artifact's `description` must also name its language. If a
     pack in `packs.yaml` fits, add the artifact there.
  6. Run `sigil check <file> --trust`, `sigil sync --check` and `npm run ci:local`. `--trust` scans
     for secrets and injection phrases, and `sync --check` catches a missing family or a wrong
     prefix. Plain `sigil check` catches neither. Commit the `catalog/README.md` that the build
     regenerates.
  7. Open the PR as in [step 7](#7-submit-a-pull-request), with `Closes #<issue>` in its description.
  ```

In `docs/guides/authoring.md:63`, change `Every language agent, rule and skill belongs to` to
`Every agent, rule and skill (shared ones too, except the rules listed as `bases`) belongs to`, and
re-wrap the paragraph. The shared probe in the evidence check showed the old wording is too narrow.

Test: `npx prettier --write CONTRIBUTING.md docs/guides/authoring.md`, then
`grep -c "discussion" CONTRIBUTING.md` prints `0`.

### 5. Close out the brief `[worker:medium]`

Files: `docs/index.md`, `docs/ideas/README.md`, `docs/ideas/artifact-proposal-issue-form.md`, `CHANGELOG.md`.

- `docs/index.md:53`: set the S6 status to `Supported` and its details to:

  ```md
  Fill in the [issue form](https://github.com/makubexD/sigil/issues/new?template=propose-artifact.yml), or run the `sigil new` wizard from a clone. `sigil import` reads Claude layouts only. [Copilot import](ideas/import-copilot-layout.md)
  ```

- `docs/ideas/README.md`: remove the `artifact-proposal-issue-form.md` table row.
- Delete `docs/ideas/artifact-proposal-issue-form.md`. Its lasting facts now live in `CONTRIBUTING.md`.
- `CHANGELOG.md`, under `## [Unreleased]`, add a `### Added` heading above `### Changed` with:

  ```md
  - A GitHub issue form lets you propose a skill, agent, rule or prompt without writing YAML or
    cloning the repo.
  ```

Test: `npx prettier --write docs/index.md docs/ideas/README.md`, then
`grep -rn "artifact-proposal-issue-form" README.md CONTRIBUTING.md docs --include=*.md --exclude=plan-artifact-proposal-issue-form.md`
prints nothing.

### 6. Create the label and open the PR `[inline: outward-facing repo change]`

1. `gh label create artifact-proposal --description "Proposed catalog artifact" --color 0e8a16`.
2. `npm run ci:local` is green.
3. Run `workflow-report .` and `/agent-skills:review` over the branch; the form and the triage copy
   get the hardest look.
4. Open the PR and merge on green CI.

### 7. Live check and cleanup `[inline: owner check on GitHub]`

GitHub only serves the form from the default branch, so this waits for the merge.

1. The owner opens `https://github.com/makubexD/sigil/issues/new/choose`: the form and the
   "Write the artifact yourself" link both show, and so does the blank-issue option.
2. The owner opens the form: all six fields render, and `Propose: ` prefills the title.
3. Delete this plan in a follow-up PR.
