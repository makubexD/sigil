---
id: shared/probe-env
kind: mcp
title: Probe Environment MCP Server
description: Reports the PROBE_G environment variable as the result of its one tool.
server:
  command: node
  args: ["__PROBE_SERVER__"]
  env:
    PROBE_G: "{sigil:env:PROBE_G}"
---

A dependency-free stdio server used by `scripts/probe-antigravity.mjs`. Its `probe_env` tool returns
`PROBE_G=<value>` from the server process environment.
