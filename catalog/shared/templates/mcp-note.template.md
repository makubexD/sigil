---
id: shared/templates/mcp-note
kind: template
title: "MCP Server Note"
description: >-
  Shared authoring-hint comment for MCP server artifacts. Scoped to `mcp` only —
  hook and settings each have their own one-off authoring comment with no sibling
  to duplicate against, so they stay hand-authored rather than templated.
appliesToKind:
  - mcp
revision: 1
slots:
  - key: details
    required: true
    description: >-
      What this MCP server provides, any required environment variables, and the
      "Install target" block naming the .mcp.json / .vscode/mcp.json key it merges under.
docs:
  - url: "https://modelcontextprotocol.io/introduction"
    verifiedOn: "2026-08-05"
    covers: "MCP server configuration shape (server.command/args/env/url) that catalog/shared/mcps/*.mcp.md frontmatter mirrors."
tags: [shared, mcp, template]
---
<!-- Describe what this MCP server provides. The server: above is merged into .mcp.json. -->

<!-- slot: details -->
