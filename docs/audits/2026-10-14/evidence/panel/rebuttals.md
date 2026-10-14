# Rebuttal round (summaries of each role's answers to R1–R7)

The prompt asked each role to answer seven contested points after reading the other three positions.

| Point | CTO | Senior | Principal | SME |
| --- | --- | --- | --- | --- |
| R1 overlays (in scope per owner) | Drop "kill"; design doc only (drift hashing, update/uninstall, build triggers), no code | Design doc plus a worked example using a consumer-owned rule; machinery only if that fails | Decision doc plus a spike: a manifest-recorded consumer fragment, replace-then-apply like `replaceMerge`; one target, one kind | Design doc only; concrete merge model reusing `replaceMerge` |
| R2 red flags | Reviewer and code-quality families only | Same, enforced by family-skeleton | Same; generators wait for eval evidence | Same; the only place with a plausible effect |
| R3 sequencing | G1 exempt, ship now; baseline before G2–G5 | G1 and wording-only catch/log fixes exempt; behaviour changes after baseline | G1 exempt; G2–G5, M1, M2 wait for baseline as separate arms | G1 exempt; G3–G5, M1, M2 wait |
| R4 G2 mechanism | Template/shared block fills content, H2 optional | Family H2 (one skeleton channel) | Both: H2 in `standard.yaml` plus template text | Family H2; template only if wording proves identical |
| R5 missed points | P0: scope-to-request, remove logger licence; P1: DI at I/O, config vs constants | M1 in P0; M2, M4, scope line in P1 as ablation arms | M1 and scope line P0; M2, M4 P1 | M1, M2 and scope line P0; M4 P1 |
| R6 git globs | Narrow now | Narrow now | Narrow now, all 5 languages | Narrow now |
| R7 byte budget | Cap: per-file load must not grow after P0 | Budget per release, not per edit | Target: each PR reports net bytes | Net non-positive per release per language |

Note: R6 was decided on the 6.7 KB figure, which later verification showed to be double-counted
(see the README, "Corrections after the panel"). The panel's consensus on R6 was therefore reversed.
