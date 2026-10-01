# Audit snapshots

Each dated folder here is the working record of one catalog audit round: the evidence the round
gathered and the register of what it found and did. They are project history, not user
documentation, and nothing in the user guides depends on them. The narrative and rationale for each
round live in the matching log under [`docs/decisions/`](../decisions/README.md); a folder here
holds the raw material behind it.

| Folder       | Round | Focus                                                                                |
| ------------ | ----- | ------------------------------------------------------------------------------------ |
| `2026-08-20` | 1     | Dogfood install plus SME and scripted lanes; verdict per artifact                    |
| `2026-08-21` | 2     | Usage and portability, repeatable measurement harness                                |
| `2026-08-22` | 3     | Project-health lane and findings F21 to F28                                          |
| `2026-08-23` | 4     | Adversarial benchmark: Copilot install, recall as well as precision                  |
| `2026-08-24` | 5     | First round that changed catalog content against the harness                         |
| `2026-08-25` | 6     | Follow-through on round 5's evidence                                                 |
| `2026-08-26` | 7     | Hardened dispatch probe, python/react coverage gap                                   |
| `2026-09-27` | -     | Live-prompt campaign against real Claude Code and Copilot CLI (not a numbered round) |

## What is in a folder

- `register.md` (rounds 1 to 7): the register of findings, each with its evidence, verdict, and
  what the round actually did (or left as backlog).
- `analysis/` and `baseline/` (round 1): raw lane output and the command output taken before any
  change, so a later run can be compared against it.
- `tools/`: the scripts that produced the evidence, kept so a round can be re-run. They are
  throwaway-grade maintainer scripts, not part of the shipped CLI, and are not covered by
  `npm test`.
- `2026-09-27/` has `findings.md` (the findings and improvement list), `live-probe-report.md`
  (the raw result matrix), `campaign.json` (the install combinations and prompts), and
  `fixtures/` and `results/` (inputs and per-run output).

## Reading the IDs

- **`F<n>`** is a finding number, assigned in order within a campaign. Numbers restart per round
  or campaign (round 2's F14 is not the live-prompt campaign's F1 to F5), so always read an `F<n>`
  together with the date of the folder or decision log that cites it.
- **Lane letters** (`Lane A`, `Lane P`, `Lane X`, ...) name a measurement script in the same folder's
  `tools/` (for example `lane-p-probe.js`, `lane-x-portability.js`).
- **`K<n>:P<n>`** (live-prompt campaign only) is one cell of the matrix: `K<n>` is an install
  combination (K1 to K7, defined in `campaign.json`) and `P<n>` is a probe type. `K1:P7` means
  probe 7 against install combination 1.

## The live-probe tool

`2026-09-27/tools/` holds the live-probe tool (`live-probe.js`, `live-probe-checks.js`,
`live-probe-report.js`). It is manual, makes real paid model calls, and is never part of `npm test`
or CI. It stays in this folder because it reads that snapshot's `campaign.json`, `fixtures/` and
`results/`. How to run it, the cost flags, and the `PROBE_TARGET` safeguard are documented in
[`docs/guides/operations.md`](../guides/operations.md#live-prompt-check-manual-costs-money).
