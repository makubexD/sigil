---
id: shared/context-mode
kind: mcp
template: shared/templates/mcp-note
title: "Context Mode MCP Server"
description: >-
  Connects Claude Code (and Copilot) to the local context-mode MCP server,
  which must be installed globally and available on PATH.
server:
  command: "context-mode"
tags: [mcp, context, tools, shared]
# version:       # per-artifact semver (optional; package version is the default)
# platforms:     # omit to propagate to ALL supporting AIs (DRY default)
# defaultScope: project  # recommended install scope: project | local | user
---
<!-- slot: details -->
Installs the `context-mode` MCP server. The `context-mode` binary must be available
on your system PATH (install it separately before using this artifact).

**Install target:**
- Claude Code: merged into `.mcp.json` under `mcpServers.context-mode`
- Copilot (VS Code, Copilot CLI): merged into `.mcp.json` under `mcpServers.context-mode` (user scope: `~/.copilot/mcp-config.json`)
