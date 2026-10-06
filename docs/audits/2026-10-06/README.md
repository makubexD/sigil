# 2026-10-06: do Copilot's MCP files expand environment variables?

Task F4 of the end block (`tasks/todo.md`). sigil writes MCP env values as `{sigil:env:NAME}` and
each target expands it into its own syntax (`src/targets/env-reference.ts`). For Copilot, sigil
writes only the portable `.mcp.json` (VS Code and Copilot CLI both read it; `.vscode/mcp.json` is
deprecated), with `${NAME}`, as GitHub's MCP JSON reference documents. This probe checks that
live in both tools, and that a server whose config lists no `tools` gets all of its tools.

The probe server is the MCP project's public test server (`@modelcontextprotocol/server-everything`),
which has a tool that prints its environment. No token or account is involved: the value is a
made-up codeword.

## Run it (needs a machine signed in to GitHub Copilot; the free plan is enough for VS Code)

1. `git pull`. In a terminal, set the codeword, then start the tool **from that terminal** so it
   inherits it:
   - PowerShell: `$env:SIGIL_PROBE_VALUE = "LANTERN-6604"; code docs/audits/2026-10-06/probe`
   - bash: `SIGIL_PROBE_VALUE=LANTERN-6604 code docs/audits/2026-10-06/probe`
2. **VS Code** (reads `.mcp.json`): open Copilot Chat in **Agent** mode, start the
   `sigil-env-probe` server if VS Code asks, and send:
   `Use the sigil-env-probe server's tool that prints environment variables. What is SIGIL_PROBE? Also list every tool that server offers.`
3. **Copilot CLI** (reads `.mcp.json`), if your plan includes it: from the same terminal,
   `cd docs/audits/2026-10-06/probe` and run `copilot`, then send the same message.
4. Write what came back in `results.md` (or paste it to Claude, who records it).

## What the result decides

- **`LANTERN-6604`:** the file expands the variable; the target's `EnvSyntax` is right.
- **The literal text `${SIGIL_PROBE_VALUE}`:** that tool does not expand it; change the Copilot
  target's `EnvSyntax` value (one line) and re-run.
- **Empty:** the tool was not started from the terminal that set the variable.
- **Tool list:** every tool the server offers (more than ten, including `echo`) means a server
  with no `tools` key gets all its tools; only some means sigil must write `tools: ["*"]`.
