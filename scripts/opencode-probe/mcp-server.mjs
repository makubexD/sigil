#!/usr/bin/env node
/* global process */
/**
 * MCP server wrapper for the OpenCode probe (scripts/probe-opencode.mjs).
 *
 * It appends `TOKEN=<PROBE_TOKEN>` to the file named by `process.argv[2]` — the probe's
 * `token.txt`, reached through the `__PROBE_OUT__` placeholder — and then hands the stdio
 * protocol to the Antigravity probe's dependency-free server, which answers `initialize` and its
 * one tool without needing a model.
 */
import { appendFileSync } from 'node:fs';

appendFileSync(process.argv[2], `TOKEN=${process.env.PROBE_TOKEN ?? ''}\n`);

await import('../antigravity-probe/mcp-server.mjs');
