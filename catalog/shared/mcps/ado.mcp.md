---
id: shared/ado
kind: mcp
template: shared/templates/mcp-note
title: "Azure DevOps MCP Server"
description: >-
  Connects Claude Code (and Copilot) to the Azure DevOps MCP server,
  enabling structured access to ADO boards, work items, and core APIs.
server:
  command: "npx"
  args:
    - "-y"
    - "@azure-devops/mcp@2.10.0"
    - "{sigil:env:ADO_ORG}"
    - "--authentication"
    - "pat"
    - "-d"
    - "core"
    - "work"
    - "work-items"
  env:
    ADO_MCP_PERSONAL_TOKEN: "{sigil:env:ADO_MCP_PERSONAL_TOKEN}"
tags: [mcp, azure-devops, ado, work-items, shared]
# version:       # per-artifact semver (optional; package version is the default)
# platforms:     # omit to propagate to ALL supporting AIs (DRY default)
# defaultScope: project  # recommended install scope: project | local | user
---
<!-- slot: details -->
Installs the `@azure-devops/mcp` server (pinned to 2.10.0) for the Azure DevOps organisation named
in `ADO_ORG`, authenticated via Personal Access Token, exposing the `core`, `work`, and
`work-items` ADO modules.

**Requires environment variables:**
- `ADO_ORG` — your Azure DevOps organisation name (the `<org>` in `dev.azure.com/<org>`).
- `ADO_MCP_PERSONAL_TOKEN` — a PAT with read access to that organisation.

Set them in the environment your AI tool starts from; sigil writes each tool's own syntax for
reading them into its config file.

**Install target:**
- Claude Code: merged into `.mcp.json` under `mcpServers.ado`
- Copilot (VS Code): merged into `.vscode/mcp.json` under `servers.ado`
