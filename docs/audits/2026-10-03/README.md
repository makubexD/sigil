# 2026-10-03: does Copilot load a skill's reference files?

Task V1 of the catalog layout standard (`docs/decisions/catalog-layout-standard-2026-10.md`,
"Copilot reference loading"). VS Code documents that a skill's reference file is loaded only when
`SKILL.md` references it, and recommends Markdown links. This probe tells the three cases apart:

| Codeword       | Reference file        | How `SKILL.md` names it |
| -------------- | --------------------- | ----------------------- |
| TANGERINE-4817 | `references/alpha.md` | a backtick path         |
| HARBOR-2290    | `references/beta.md`  | a Markdown link         |
| QUARTZ-5531    | `references/gamma.md` | not named at all        |

The skill tells the model never to guess, so a codeword in the answer means that file was loaded.

## Run it (needs a machine signed in to GitHub Copilot)

1. `git pull`, then open the folder `docs/audits/2026-10-03/probe` **as its own workspace** in
   VS Code (File → Open Folder). The skill lives at `.github/skills/probe-refs/`.
2. Open Copilot Chat and switch the mode to **Ask** (Ask can't open files on its own, so only what
   the skill loader loads reaches the model).
3. Send: `What are the probe codewords?`
4. Optional, if Copilot CLI is installed: in that folder run
   `copilot -p "What are the probe codewords?"`.
5. Write what came back in `results.md` (or paste it to Claude, who records it).

## What the result decides

- **TANGERINE and HARBOR:** backtick paths load too. The `catalog-layout` rule may accept either
  form; links stay the catalog's own style.
- **HARBOR only:** only Markdown links load. The rule keeps requiring links (already the catalog's
  style after T13).
- **QUARTZ appears:** unnamed references load as well; the "mentioned" check is a style rule, not a
  loading requirement.
- **Nothing:** the skill was not picked up. Check the folder was opened as its own workspace.
