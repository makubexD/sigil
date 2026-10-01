# GitHub issue form to propose an artifact

## Objective

A GitHub issue form lets someone propose a skill, agent, rule or prompt without writing YAML or
cloning the repo; a maintainer triages it and turns it into a catalog file with `sigil new`.
Shipped as `.github/ISSUE_TEMPLATE/*.yml` plus a short triage section in the contributing docs.
No per-target output.

## Evidence

- `.github/` holds only `workflows/` and `PULL_REQUEST_TEMPLATE.md`; `.github/ISSUE_TEMPLATE/` does
  not exist (verified by listing).
- `.github/PULL_REQUEST_TEMPLATE.md` already asks for the artifact kind (skill / agent / rule /
  prompt), so the form can reuse its vocabulary.
- `sigil new [kind]` is registered at `src/cli.ts:133` with `--catalog-dir`; it has a wizard
  (`src/wizard/new.ts`), so triage can run it interactively.
- `catalog/shared/prompts/author-artifact.prompt.md` (the `shared/author-artifact` prompt in the
  `essentials` pack, `packs.yaml`) already helps author an artifact from a description.

## Out of scope

- Automating issue-to-PR conversion with an agent or Action.
- Moderation or labelling bots.
- Changing the catalog schema.

## Success criteria

- `.github/ISSUE_TEMPLATE/propose-artifact.yml` with fields: kind, language or shared, title, what
  it should do, when it should trigger, example prompt, sources.
- `config.yml` for the template chooser (decide whether to disable blank issues).
- A documented triage flow: label, run `sigil new <kind>`, `sigil check`, open a PR that closes
  the issue; placed in CONTRIBUTING.md or `docs/guides/authoring.md`.
- The form's fields map to the `sigil new` inputs; each field is checked against `src/commands/new*.ts`.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That proposers can state what an artifact should do well enough that a maintainer does not need a
follow-up interview for most issues.

## Open questions

- Should there also be a bug-report form and a "request support for a new AI tool" form?
- Does the repo want issue forms enabled before the project has external contributors?
- Free text only, or ask for a draft `description` in the YAML-free form?
