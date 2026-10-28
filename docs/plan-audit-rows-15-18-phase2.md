# Phase 2 step plan: reviewer Bash guard (audit row 15)

## Context

Spike verdict **go, route (a)** (`docs/decisions/reviewer-bash-guard-2026-10.md`): a project-level PreToolUse hook
receives `agent_type` (the agent's `name`, or `plugin:name`) for a subagent's Bash call, and no `agent_type` for the
main session. The owner widened the scope to all 21 read-only agents that carry Bash (code-reviewer, security-auditor,
architecture-reviewer, api-compat-reviewer families, plus `angular/ng-template-reviewer`).

Goal: `shared/reviewer-bash-guard`, a Claude-only PreToolUse hook on `Bash` that blocks write-shaped commands when the
caller is one of those agents, and lets everything else through. Same exec-form shape and exit-2 block as
`shared/protect-config`.

Execute one step at a time: "execute step N of docs/plan-audit-rows-15-18-phase2.md". Branch:
`feat/reviewer-bash-guard`.

## Steps

1. **RED tests** `[worker:medium]`
   - New `test/catalog/reviewer-bash-guard-hook.test.ts`, modelled on `test/catalog/protect-config-hook.test.ts`:
     install through `ClaudeCodeTarget.scaffoldConfig('shared/reviewer-bash-guard', …)`, spawn the entry in exec form
     with stdin `{tool_name:'Bash', agent_type, tool_input:{command}}`.
   - Matcher is `Bash`.
   - With `agent_type: 'cs-code-reviewer'`, exit 2 for: `echo x > out.txt`, `cat a >> b`, `ls | tee out.txt`,
     `sed -i s/a/b/ f`, `perl -pi -e s/a/b/ f`, `rm -rf dist`, `mv a b`, `cp a b`, `mkdir x`, `touch x`,
     `chmod +x f`, `ln -s a b`, `git commit -m x`, `git push`, `git add .`, `git checkout -- f`, `git restore f`,
     `git reset --hard`, `git stash`, `git clean -fd`, `git apply p.diff`, `npm install`, `npm ci`, `pnpm add x`,
     `yarn add x`, `pip install x`, `dotnet add package X`, `npm audit fix`, `eslint . --fix`, `prettier --write .`,
     `ruff format .`, `ruff check --fix .`, `dotnet format`, `git diff && rm x`, `node -e "x"`, `python -c "x"`,
     `bash -c "ls"`, `sh -c "ls"`.
   - Same agent, exit 0 for: `git diff HEAD`, `git log --oneline -10`, `git status`, `git show HEAD`,
     `grep -rn foo src`, `cat package.json`, `npm audit --omit=dev`, `npx tsc --noEmit`, `eslint .`,
     `ruff format --check .`, `ruff check .`, `dotnet format --verify-no-changes`, `ng test --watch=false`,
     `pytest -q`, `npm test 2>&1`, `ls > /dev/null`, `ls 2>/dev/null`.
   - Scope, command `echo x > out.txt`: exit 0 with no `agent_type`, with `''`, with `cs-debugger`, with
     `ts-refactor-specialist`; exit 2 with `csharp-starter:cs-code-reviewer` and with `ng-template-reviewer`.
   - Exit 0 when `tool_name` is not `Bash`, and for unparseable stdin.
   - On a block, stderr names the agent and the reason.
   - Catalog coverage (loads the resolved catalog): every agent whose `tools` include `Bash` but neither `Edit` nor
     `Write`, and whose description says "makes no edits", is blocked on `echo x > out.txt` both as `name` and as
     `some-plugin:name`. No agent whose `tools` include `Edit` or `Write` is blocked.
   - Test: `npm test`. Confirm the new tests fail because the artifact doesn't exist yet.

2. **The hook artifact** `[inline: design + user-facing copy]`
   - New `catalog/shared/hooks/reviewer-bash-guard.hook.md`: `event: PreToolUse`, `matcher: Bash`, `command: node`,
     `args: ["-e", <script>]`, `platforms: [claude]`, tags. The script strips a `plugin:` prefix, matches the name
     against the five family suffixes, splits the command on `&&`, `||`, `;`, `|`, newlines and `$(`, and checks each
     segment (after leading `VAR=x` and `sudo`) against the denylist from step 1.
   - Body: what it blocks, why it sits beside `protect-config`, and a "Not covered" list: commands that write as a
     side effect (`ng build`, `tsc` without `--noEmit`, test caches), `npm run <script>` and other indirection,
     obfuscated commands (variables, base64, aliases), heredocs, MCP tools, Copilot (no agent identity), and that
     unparseable input is let through.
   - Test: step 1 tests pass; `npm run sigil -- sync --check` clean.

3. **Packs and generated files** `[worker:medium]`
   - `packs.yaml`: add `shared/reviewer-bash-guard` after `shared/protect-config` in every pack that lists it.
   - `npm run build`, then `npm run snapshot:update`; check that the snapshot diff only adds the new artifact.
   - Test: `npm run sigil -- validate`, `npm run sigil -- sync --check`, `npm test`.

4. **Docs and close-out** `[worker:medium]`
   - `CHANGELOG.md` entry under Unreleased → Added.
   - `docs/audits/2026-10-16/results.md` row 15 → `done (feat/reviewer-bash-guard)` (the PR number replaces it when
     the PR opens); keep the column alignment.
   - `docs/plan-audit-rows-15-18.md`: tick the Phase 2 step-plan box; note the scope was widened to 21 agents.
   - Test: `npx prettier --check` on the changed files.

## Not in this phase

- The 21 agent descriptions keep "Bash is read-only by instruction, not sandboxed": that stays true wherever the
  guard isn't installed.

## Verification

- `npm run ci:local` green.
- Live check `[inline: model behavior]`: in a temp project, `sigil add --target claude` the guard and
  `csharp/cs-code-reviewer`, then `claude -p` asks the reviewer to run `echo x > out.txt` (blocked, no file) and the
  main session to run the same command (allowed).
- Close-out: `workflow-report sigil`, `/agent-skills:review`, then delete this step plan after merge.
