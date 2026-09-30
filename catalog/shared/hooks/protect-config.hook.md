---
id: shared/protect-config
kind: hook
title: "Protect Config Files"
description: >-
  Blocks writes to sensitive configuration files (.env, secrets, credentials)
  before any Edit/Write/MultiEdit tool call.
event: PreToolUse
matcher: "Edit|Write|MultiEdit"
command: |
  PROTECTED="\.env$|secrets\.|credentials\.|id_rsa|\.pem$|\.key$"
  if echo "$CLAUDE_TOOL_INPUT" | grep -qiE "$PROTECTED"; then
    echo "sigil-hook: blocked write to protected config file" >&2
    exit 2
  fi
tags: [security, safety]
# version:       # per-artifact semver (optional; package version is the default)
# platforms:     # omit to propagate to ALL supporting AIs (DRY default)
---

<!-- Describe what this hook does and when it fires. The command: above is executed. -->

Fires before every Edit, Write, or MultiEdit tool call and checks whether the target
path matches a set of sensitive file patterns. If a match is found, the command exits
with code 2, which Claude Code interprets as a hard block.

**Patterns blocked:**
- `.env` and `.env.*` files
- Files named `secrets.*` or `credentials.*`
- Private key files (`id_rsa`, `*.pem`, `*.key`)

Add `<!-- sigil-allow: config/dangerous-command -->` to suppress the security scanner
for the pipe-to-exit pattern in the command above if needed.
