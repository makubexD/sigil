# Plan: use Sigil for real

Decided by the owner on 2026-11-04. The MVP already exists: the catalog, the Claude and Copilot targets, and `npm link` work
today. What's missing is real use, so the next work comes from real use, not from more tests or more targets.

## Direction

- **The catalog is the product.** The aim is a strong, flexible catalog that each target layer turns into what its AI expects.
- **Claude and Copilot come first.** They're the only targets that get proactive work.
- **Issues drive the work.** A change starts from something that broke or got in the way on a real repo. New evals and new
  features wait for that evidence.
- **Current CI checks stay.** They catch silent failures that real use won't show, such as a guard that didn't load. They just
  don't grow without a reason.
- **Unproven stays labelled unproven.** The other targets are built from official docs and aren't priorities, but nobody should
  read that as proven.

## Parked

Each item stays parked until its trigger happens.

| Item                                 | Trigger                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------- |
| npm first-publish                    | Someone who can't clone the repo wants the CLI                            |
| `shared/ado` live test               | The owner has a personal Azure DevOps org                                 |
| Codex, Cursor, Antigravity, OpenCode | The owner uses that tool, or an issue comes from it                       |
| Cursor F and G                       | The same, plus Cursor usage                                               |
| Plugin-rules eval                    | Real use shows plugin token cost hurting, and there is spare Claude quota |

The npm work is on branch `docs/plan-npm-first-publish`: the plan, the tarball trim, `pack:smoke` and the Node 24 publish job. It
was [PR #204](https://github.com/makubexD/sigil/pull/204), closed unmerged because its docs say `npm install -g sigil` works.

## Step 1: Install on real repos `[inline: the owner picks the repos]`

The owner names one or two repos they really work in. Install the packs they'd actually want, on Claude and Copilot, with the
wizard or `sigil add`. Create a `real-usage` issue label, and list the repos and packs in this plan.

Test: `sigil status` in each repo shows the install, and a Claude and a Copilot session each load it.

Done on 2026-11-04. The owner left the choice to Claude, which picked repos that get real work and a stack the catalog covers.

| Repo                    | Packs                                      | Targets         | Where it lives                                                                                |
| ----------------------- | ------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------- |
| `MakuVisaApptScheduler` | `python-starter`, `python-tooling`         | Claude, Copilot | Local branch `chore/sigil-real-usage`, not pushed                                             |
| `sigil`                 | `typescript-starter`, `typescript-tooling` | Claude          | Skills, agents and rules only, all gitignored. Hooks would block this repo's own config edits |

Left out: `SyncSettings` is bash and config, which the catalog doesn't cover, and it holds `.user-values.json`. `mk-trial` is a
scratch repo.

## Step 2: Use it `[inline: the owner's real work]`

About two weeks of normal work on those repos. Open a `real-usage` issue when:

- Something breaks or doesn't load.
- Something gets in the way, or an AI follows a rule badly.
- You hand-edit installed output. That edit is usually a catalog fix.
- You wanted a skill, agent or rule that isn't there.

At the end, note which installed skills and agents were never used.

Test: two weeks have passed, and the issues are open under the label.

## Step 3: Choose the next work `[inline: judgment on what real use showed]`

Read the `real-usage` issues and the never-used list. Group them, then write the next plan from what they show: fixes, catalog
changes, things to remove. Check the Parked triggers, and move any that fired.

Test: the next plan is committed, and each of its steps links an issue.
