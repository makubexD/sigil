# Repo benchmark → catalog code-quality: resume file (never on master; carried on branch `wip/handoff`)

Plan (approved 2026-10-14): `tasks/plan.md` (copy of `~/.claude/plans/yesterday-i-was-working-dazzling-toucan.md`).
To resume: say "continue from tasks/todo.md, Resume here" (section near the end; guard drafts are in `tasks/guard-drafts/`).

On another machine: `git fetch origin && git checkout master && git pull`, then
`git checkout origin/wip/handoff -- tasks _Others/Req.md && git reset -q tasks _Others/Req.md` (the files come back as
local, unstaged changes; never merge `wip/handoff` into master). `.mcp.json` is not pushed (it may hold tokens): copy
it by hand. Claude memory (`~/.claude/projects/<project>/memory/`) is per machine and not pushed either. Owner OK'd
pushing this branch publicly on 2026-10-20; delete it (`git push origin --delete wip/handoff`) once work resumes.
Evidence lives in `docs/audits/2026-10-14/evidence/` once PR0 is merged. Before that, it's in the session scratchpad.

## Checklist

- [x] PR0 chore/repo-benchmark-report: merged #57 (2a0bfbe)
- [x] GATE A2: all PR1–9; Claude runs evals headless
- [x] PR1 merged #58 (9c54940); baseline TS 39.6 Angular 47.8 C# 35.8 React 31.3 Python 30.8 KB
- [x] PR2 merged #59; bytes after: TS 39.9 Angular 48.1 C# 36.1 React 31.7 Python 31.1 KB
- [x] PR3 merged #60; B0: H1 false (no surface inflation); exploratory: +LOC 13/17, 2.5x declarations, 2.4x cost
- [x] PR3b #61 registered round 2 (declarations, judge); B1 running
- [x] PR4 REJECTED (H2b: 8 decided pairs, p=0.363); branch feat/scope-to-request 8a80bc2 kept, not merged; B1 + c-pr4 recorded on PR5 branch
- [x] PR5 REJECTED (H3b: 10 decided, p=0.377; decl 161->145); branch kept; results merged #62
- [x] Round 3 ablation: A1 driver (p=0.000122), A2/A3/A4 not; recorded + merged #64
- [x] Round 4 D1 REJECTED (p=0.172; T1 retry moved to own module, inflation 0->14, loc up 13/17); merged #65 (also fixed split results table). Branch feat/split-by-responsibility unmerged; worktree ../sigil-d1 removable
- [x] Round 5 D2 ACCEPTED (H7: decl 161->120, 14 decided, p=0.0287; 18/18; inflation 0; judge readability p=0.500): record #67, catalog #68. D2 (master eb1f3a2) is the next baseline. Exploratory: literal constants 23->38, held-out T6 18->26 (round 6 candidate: magic-number line; needs registration + user go)
- [x] Round 6 (named-constant line) NOT registered: A1 (line absent) named as many constants in T1/T2; D2 rise is all T6. Recorded #71
- [x] PR6 REJECTED on R1: base mean 5.0 (6,4,5), cand 6.0 (6,6,6), gate +2; merged record #66; branch feat/reviewer-design-simplicity unmerged
- [x] PR7 dispatch probe merged #70: D0 24/24 correct, H8 holds, no "Not for" clause added. check-skill-evals coverage now reads description. Audit 2026-10-14 statuses updated in #70
- [x] PR8 merged #69 (d285808): naming (role/predicate/unit) + `shortcut:` marker; TS bytes 40,536->40,865 (B1 budget 40,872); not eval-gated, measure in next candidate run
- [x] PR9 overlays doc + spike: GO, merged #63
- [x] PR9 v1 merged #72: overlays.yaml narrows rule scope (add/update/wizard preview, deps rewired, comma/backslash refused); review found 2 critical, fixed; ci 1493 green
- [x] Housekeeping 2026-10-16: 27 merged local branches deleted; CI after #72 within noise (ubuntu 32/33s vs 27 avg, windows 64/56 vs 52 avg; overlays e2e file ~1s warm)
- [x] B2 baseline (H9): PR8 kept, p = 0.613, inflation 0, 18/18 (PR 73). B2 is the baseline. Strengthen candidate: count distinct tasks, not runs (dotnet rule)

## Part 2: full benchmark per \_Others/Req.md (plan file updated 2026-10-16)

Verdicts per capability: have / adopt / adapt / strengthen / reject. All 4 repos MIT.

- [x] R: 6 recon agents done (159 capabilities; citations spot-checked). Self-recon over-counted nothing but said 15/44 negative triggers: real is 19/44
- [x] M: draft verdicts in scratchpad bench2/M/verdicts.md. Key: D2 is p=0.188 at task level (6 tasks underpowered); F1 unbounded Promise.all, F2 react testid contradiction confirmed
- [x] P: 4-role panel + rebuttal done 2026-10-19 (16 more defects F5-F20; eval v2 design; owner-decision list)
- [x] V: 13/16 senior defects re-read at source (all real; F11 TS only; F16/F20 debatable); Claude Code facts: A2 reject, H3 have; D2 sign-flip 0.0625 abs / 0.125 rel
- [x] D: merged #74 docs/audits/2026-10-16/ (deliverables 1-14, traceability, roadmap, D2 note, PR9 row)
- [x] I: roadmap items 2-11 done (register: docs/audits/2026-10-16/results.md)
  - #2-#8 merged #75-#81
  - #9 trap calibration merged #82, #83: H10 false (0/12 kept; unguided model avoids all traps), stop
  - #10 not run (H10 stopped it)
  - #11 skill-firing probe merged #84, S0 #85: H13 holds, 54/54; no listing changes
- [x] Owner decisions 2026-10-19: A1 delete eval-gated; F16 discover everywhere; S1 leave feature; H0 keep fail-open;
      start Bash guard, C1-C5, Copilot hooks, H1/H2; fix status gap (status said 35/36 up to date, update refreshed 15)
- [x] Housekeeping 2026-10-19: local .claude/ refreshed (15 artifacts); all local branches deleted (unmerged 5 are on origin)
- [x] O1 F16 merged #86
- [x] O2 status = what update would rewrite, one staleness check (src/freshness.ts) for status/add/wizard; merged #87 (2 review rounds; backlog in register row 13)
- [x] O3 A1 merged #88 (6500ccf) 2026-10-20: **H14 holds** (tests 14/15 vs 15/15, the one miss is the borderline 500k timing check on an LRU identical to master's; declarations p = 0.938, 113 -> 104; inflation 0/30). Worktrees and branch removed. CI tests on #88: ubuntu 37 s, windows 71 s vs prior averages ~29 / ~52 (master windows was 88 once): likely runner noise for a prose deletion; check the next 2 runs. Register row 14 still says "(this PR)": set to merged #88 in O4's PR.
- [ ] O4 reviewer Bash guard (approved; drafts ready in `tasks/guard-drafts/`)
- [ ] O5 H1 bar-lowering guard, H2 Stop typecheck (approved; evidence says no effect today, see below)
- [ ] O6 Copilot hook target (approved; verify format first; live check by user)
- [ ] O7 C1-C5 (approved as "probe first"; H10 already suggests nothing to write)
- [ ] Last (low priority): WIZ-3 live check (user), then npm release

## Resume here (written 2026-10-20)

### Are we still on the main idea? Yes.

The brief (`_Others/Req.md`): benchmark ECC, dotnet/skills, agent-skills and ponytail; give every capability one
verdict (have / adopt / adapt / strengthen / reject); implement the result in sigil; publishing and release last.
Done so far: the full benchmark, panel and verification (`docs/audits/2026-10-16/`, #74), roadmap items 1-13 merged
(#74-#87), A1 measured. Remaining rows 15-18 of `docs/audits/2026-10-16/results.md` are the last implementation
items, all owner-approved on 2026-10-19. What we learnt that steers them: prose added to rules showed no measurable
effect (PR4-PR7, H10: 0 of 12 traps caught the unguided model); removing prose helped (D2) or held (H14).
So prefer deterministic checks (hooks, tests) over new prose, and gate any prose with an eval.

### Step 1: O3 done (#88). Only left: row 14 -> merged #88, and a glance at the next CI timings.

### Step 2: O4 reviewer Bash guard, `shared/read-only-agent-guard` (register row 15)

Problem: 27 catalog reviewers/auditors/profilers get `Read, Grep, Glob, Bash`; "Bash is read-only" is only an
instruction. Design: a PreToolUse hook (matcher `Bash`, exec form `command: node` + `args: ["-e", script]`) that reads
`agent_type` from the hook input (plugin agents arrive as `plugin:name`, prefix stripped) and exits 2 with a
`sigil-hook:` stderr message when a guarded agent runs a writing command. Denylist, fail-open (H0 decision).

Drafts (copied from the lost session scratchpad):

- `tasks/guard-drafts/read-only-agent-guard.hook.md` -> `catalog/shared/hooks/read-only-agent-guard.hook.md`
- `tasks/guard-drafts/read-only-agent-guard-hook.test.ts` -> `test/catalog/read-only-agent-guard-hook.test.ts`
  (modelled on `test/catalog/protect-config-hook.test.ts`; includes a catalog-derived name-list check: agents whose
  tools are exactly Bash/Glob/Grep/Read minus EXEMPT `cli-auditor`, `wizard-auditor`)
- `tasks/guard-drafts/guard.js` + `cases.cjs` (59 block/allow cases, all pass) + `own-commands.cjs` (372 command
  lines from the 27 agents' bodies: no real command blocked, only template placeholders)

Order:

1. **Live probe first (costs a few `claude -p` calls).** Confirm Claude Code really puts `agent_type` in a subagent's
   PreToolUse input. Temp dir, install the hook with `sigil add` (or hand-write `.claude/settings.json` with the
   hook plus a copied `ts-code-reviewer` agent), then
   `claude -p "Use the ts-code-reviewer subagent to run: touch x" --permission-mode bypassPermissions` and check that
   `x` does not exist and the agent reports the block. Also log the raw stdin once (a debug hook that appends stdin to a
   file) to see the exact `agent_type` value. If `agent_type` is absent, stop and record "spike: no agent identity"
   in row 15 (the design does not work without it).
2. Branch `feat/read-only-agent-guard` from master after A1 merges. RED: add the test, run it, show it fails (hook id
   unknown). GREEN: add the hook file. Run `npm run snapshot:update` if output snapshots change.
3. Consider adding `shared/read-only-agent-guard` to the starter packs in `packs.yaml` that pull in reviewers
   (`shared/protect-config` is the precedent: essentials + 5 starters). Product-surface choice: ask the user, or
   keep it opt-in and say so in the PR.
4. CHANGELOG `[Unreleased]` Added line; short decision note in `docs/decisions/read-only-agent-guard-2026-10.md`
   (why a denylist, why fail-open, what it does not cover, the plugin-channel gap: plugins carry no hooks).
5. Optional: agent descriptions say "Bash is read-only by instruction, not sandboxed". Leave as is unless the hook
   ships by default (it still isn't a sandbox).
6. Review pass (`code-reviewer` / security-auditor agent) on the regexes: bypasses are accepted (denylist), false
   blocks of legit read-only commands are the real risk.
7. ci:local, PR, green CI, merge. Row 15 -> merged; also row 14 -> merged #N.

### Step 3: O5 H1 + H2 (row 16): check the evidence before building

The audit verdicts were H1 "strengthen, deferred: 0 suppressions in 183 files, build only if a pressure task shows
suppressions and the owner approves" and H2 "defer: 0 type errors in 180 runs". H14 adds 30 more runs with 0 and 0.
The owner said "start", so:

- **H1 bar-lowering guard** (PreToolUse on Edit/Write/MultiEdit and Bash writes): block only _unjustified_ forms
  that lower the bar: new `@ts-ignore`/`eslint-disable`/`# type: ignore`/`#pragma warning disable` without a reason,
  a skipped/deleted test, a loosened tsconfig/eslint setting. Diff old vs new content (only additions count).
  Acceptance-tested like O4, no eval. Precedents: ECC `config-protection.js`, agent-skills
  `constraint-driven-development/SKILL.md:206-214`, sigil `shared/protect-config`.
- **H2 Stop typecheck**: a Stop hook that runs the project's typecheck and blocks (exit 2) on errors. Must detect the
  command per language (tsc --noEmit, dotnet build, mypy/pyright) or take it from config; must not loop forever
  (respect `stop_hook_active`). Opt-in, never in a default pack: it costs time on every stop.
- Before writing either: tell the user the evidence shows no current effect and confirm they still want them built
  as opt-in hooks (one AskUserQuestion). Each is its own PR.

### Step 4: O6 Copilot hook target (row 17)

`hook` is scaffold-native only for Claude (`src/targets/*/capabilities.ts`). Read `docs/ideas/copilot-hooks.md`
first; the audit marks Copilot hook support as an **unchecked claim**. Verify the current Copilot hooks format
(coding agent `.github/hooks/*.json`? CLI?) from official docs, cite it on the spec (`docs:`), then add the
capability row + emit/merge path, TDD. Live check by the user on their free Copilot account (memory: the user runs
it; Claude says when it is needed). Then the `ownedBy` flag on `hook` in KIND_REGISTRY may go (second target).

### Step 5: O7 C1-C5 new coverage (row 18): probe only

C1 Node runtime, C2 ASP.NET/EF, C3 FastAPI/Django, C4 React perf/security, C5 API/DB/observability/e2e. Rule:
probe the unguided model first, write only what it gets wrong. H10 (12 traps, 0 caught) predicts little or nothing.
Cheap plan: 2-3 trap tasks per area in the `test/evals/code-quality` C-task format, `none` arm, 3 runs each,
hypothesis registered first. Nothing is written for an area the model already gets right; record that in row 18.
This is the most eval-expensive item: do it last and in small batches (session limits invalidated runs before).

### Backlog to keep (not dropped)

- Row 13 backlog in `docs/audits/2026-10-16/results.md` (render failure shows up-to-date; moved config with no op;
  status omits new `uses:` deps).
- Wizard home health backlog: to add to the register.
- Last, low priority: WIZ-3 live check (user), npm release.

## Standing rules

TDD with RED shown; one commit per task; stage by name; branch per PR; snapshot:update + changelog [Unreleased];
ci:local green; push → PR → green CI → `gh pr merge N --merge`; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
