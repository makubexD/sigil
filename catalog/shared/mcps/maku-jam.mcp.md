---
id: shared/maku-jam
kind: mcp
title: "MakuJam MCP Server"
description: >-
  Connects Claude Code (and Copilot) to the MakuJam remote MCP server
  over HTTP at mcp.jam.dev.
server:
  type: "http"
  url: "https://mcp.jam.dev/mcp"
tags: [mcp, remote, http, jam, shared]
# version:       # per-artifact semver (optional; package version is the default)
# platforms:     # omit to propagate to ALL supporting AIs (DRY default)
# defaultScope: project  # recommended install scope: project | local | user
---

<!-- Describe what this MCP server provides. The server: above is merged into .mcp.json. -->

Installs the MakuJam remote MCP server, connecting via HTTP to `https://mcp.jam.dev/mcp`.

**Install target:**
- Claude Code: merged into `.mcp.json` under `mcpServers.maku-jam`
- Copilot (VS Code): merged into `.vscode/mcp.json` under `servers.maku-jam`
