---
id: shared/filesystem
kind: mcp
title: "Filesystem MCP Server"
description: >-
  Connects Claude Code (and Copilot) to the official MCP filesystem server,
  enabling structured read/write access to local directories via the MCP protocol.
server:
  command: "npx"
  args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
tags: [mcp, filesystem, tools]
# version:       # per-artifact semver (optional; package version is the default)
# platforms:     # omit to propagate to ALL supporting AIs (DRY default)
---

<!-- Describe what this MCP server provides. The server: above is merged into .mcp.json. -->

Installs the official `@modelcontextprotocol/server-filesystem` MCP server scoped to
the current directory (`.`).

**Provides tools:**
- `read_file` / `write_file` — structured file access
- `list_directory` / `create_directory`
- `move_file` / `delete_file`
- `search_files` / `get_file_info`

**Install target:**
- Claude Code: merged into `.mcp.json` under `mcpServers.filesystem`
- Copilot (VS Code): merged into `.vscode/mcp.json` under `servers.filesystem`

**Security note:** The server has access to the directory path you pass as its argument.
Scope it to a specific subdirectory if you want to restrict access (replace `.` with
`./src` or similar).
