---
id: shared/maku-jam
kind: mcp
template: shared/templates/mcp-note
title: "MakuJam MCP Server"
description: >-
  Connects your AI tool to the MakuJam remote MCP server
  over HTTP at mcp.jam.dev.
server:
  type: "http"
  url: "https://mcp.jam.dev/mcp"
tags: [mcp, remote, http, jam, shared]
# version:       # per-artifact semver (optional; package version is the default)
# platforms:     # omit to propagate to ALL supporting AIs (DRY default)
# defaultScope: project  # recommended install scope: project | local | user
---
<!-- slot: details -->
Installs the MakuJam remote MCP server, connecting via HTTP to `https://mcp.jam.dev/mcp`.

**Install target:** `sigil add` merges the server into each tool's MCP file and prints where. The files and
scopes per tool are in https://github.com/makubexD/sigil/blob/master/docs/reference/config-kinds.md.
