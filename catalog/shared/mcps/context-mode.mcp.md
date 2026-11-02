---
id: shared/context-mode
kind: mcp
template: shared/templates/mcp-note
title: "Context Mode MCP Server"
description: >-
  Connects your AI tool to the local context-mode MCP server,
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

**Install target:** `sigil add` merges the server into each tool's MCP file and prints where. The files and
scopes per tool are in docs/reference/config-kinds.md.
