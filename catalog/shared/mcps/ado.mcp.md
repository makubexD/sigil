---
id: shared/ado
kind: mcp
template: shared/templates/mcp-note
title: "Azure DevOps MCP Server"
description: >-
  Connects your AI tool to the Azure DevOps MCP server,
  enabling structured access to ADO boards, work items, and core APIs.
vars:
  ADO_ORG:
    title: "Azure DevOps organization"
    description: "The <org> in dev.azure.com/<org>"
server:
  command: "npx"
  args:
    - "-y"
    - "--allow-scripts=keytar"
    - "@azure-devops/mcp@2.10.0"
    - "{sigil:var:ADO_ORG}"
    - "--authentication"
    - "azcli"
    - "-d"
    - "core"
    - "work"
    - "work-items"
tags: [mcp, azure-devops, ado, work-items, shared]
# version:       # per-artifact semver (optional; package version is the default)
# platforms:     # omit to propagate to ALL supporting AIs (DRY default)
# defaultScope: project  # recommended install scope: project | local | user
---
<!-- slot: details -->
Installs the `@azure-devops/mcp` server (pinned to 2.10.0) for one Azure DevOps organization, exposing the `core`, `work`, and
`work-items` ADO modules.

**Before you install:** the server signs in through the Azure CLI, so `az` must be on `PATH` and `az login` must have run.

**Organization:** `sigil add` asks for the organization (the `<org>` in `dev.azure.com/<org>`), or takes `--var ADO_ORG=<org>`. The
value is written to the config file as plain text and recorded in the manifest. A plugin install asks when the plugin is enabled.

**Install target:** `sigil add` merges the server into each tool's MCP file and prints where. The files and
scopes per tool are in https://github.com/makubexD/sigil/blob/master/docs/reference/config-kinds.md.
