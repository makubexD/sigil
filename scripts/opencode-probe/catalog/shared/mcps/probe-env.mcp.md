---
id: shared/probe-env
kind: mcp
title: Probe Environment MCP Server
description: Records PROBE_TOKEN so the OpenCode probe can read what the server received.
server:
  command: node
  args: ['__PROBE_SERVER__', '__PROBE_OUT__']
  env:
    PROBE_TOKEN: '{sigil:env:PROBE_HOST_TOKEN}'
---

A wrapper around `scripts/antigravity-probe/mcp-server.mjs` used by
`scripts/probe-opencode.mjs`. It appends `TOKEN=<PROBE_TOKEN>` to the file named by its second
argument so the probe can read what the server received.
