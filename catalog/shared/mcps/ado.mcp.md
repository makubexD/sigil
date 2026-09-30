---
id: shared/ado
kind: mcp
title: "Azure DevOps MCP Server"
description: >-
  Connects Claude Code (and Copilot) to the Azure DevOps MCP server,
  enabling structured access to ADO boards, work items, and core APIs.
server:
  command: "npx"
  args:
    - "-y"
    - "@azure-devops/mcp@next"
    - "cr360dev"
    - "--authentication"
    - "pat"
    - "-d"
    - "core"
    - "work"
    - "work-items"
  env:
    ADO_MCP_PERSONAL_TOKEN: "${env:ADO_MCP_PERSONAL_TOKEN}"
tags: [mcp, azure-devops, ado, work-items]
# version:       # per-artifact semver (optional; package version is the default)
# platforms:     # omit to propagate to ALL supporting AIs (DRY default)
# defaultScope: project  # recommended install scope: project | local | user
---

<!-- Describe what this MCP server provides. The server: above is merged into .mcp.json. -->

Installs the `@azure-devops/mcp` server connected to the `cr360dev` organisation,
authenticated via Personal Access Token, exposing the `core`, `work`, and `work-items`
ADO modules.

**Requires environment variable:**
- `ADO_MCP_PERSONAL_TOKEN` — a PAT with read access to the target ADO organisation.

**Note on environment variable syntax:** The value `${env:ADO_MCP_PERSONAL_TOKEN}` is
VS Code input-variable syntax (resolved by Copilot). For a Claude-only install, use
`${ADO_MCP_PERSONAL_TOKEN}` instead. Sigil stores the value verbatim as authored.

**Install target:**
- Claude Code: merged into `.mcp.json` under `mcpServers.ado`
- Copilot (VS Code): merged into `.vscode/mcp.json` under `servers.ado`
