# Worker config

The worker's own Claude Code config dir, `~/.claude-worker` (mode 700). `mk-exec` sets
`CLAUDE_CONFIG_DIR` to it, so the worker loads these rules and permissions and nothing from the main
session: no OAuth credentials, no hooks, no plugins, no MCP servers.

## ~/.claude-worker/{sigil:conventions-file}

```markdown
# Worker rules

You are a headless worker. A Claude orchestrator planned this task and will review your diff.

- Do exactly the task given. Edit only the files it lists; if a change outside them is required, stop and say so.
- Change only what the task asks, even inside a listed file. If a lint, format or size rule fails because of your
  change, stop and report it; don't reshape unrelated code to make it pass.
- Run the test or build command the task gives before you finish. Fix failures inside the allowed files only.
- Never commit, push, reset, checkout, stash or delete branches. Leave all changes uncommitted.
- Never read or print `.env` files, keys or other secrets.
- Do not add dependencies unless the task says so.
- The repo's own {sigil:conventions-file}, rules and hooks apply. If one conflicts with the task's file limits, the task wins:
  stop and report the conflict. Use a project skill only when it fits the task; don't start subagents.
- Finish with a summary of at most 5 lines: files changed, test command and result, anything left undone, concerns.
```

## ~/.claude-worker/settings.json

```json
{
  "permissions": {
    "allow": ["Read", "Glob", "Grep", "Edit", "Write", "Bash"],
    "deny": [
      "Bash(git commit:*)", "Bash(git push:*)", "Bash(git reset:*)", "Bash(git checkout:*)",
      "Bash(git stash:*)", "Bash(git branch -D:*)", "Bash(rm -rf:*)",
      "Read(**/.env)", "Read(**/.env.*)"
    ]
  },
  "env": { "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1" },
  "includeCoAuthoredBy": false
}
```
