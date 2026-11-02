#!/usr/bin/env node
/**
 * Dependency-free MCP stdio server for the Antigravity probe (scripts/probe-antigravity.mjs).
 *
 * Newline-delimited JSON-RPC 2.0 on stdin/stdout. It answers `initialize`, ignores
 * notifications (so `notifications/initialized` gets no reply), lists one no-argument tool,
 * `probe_env`, whose call returns `PROBE_G=<process.env.PROBE_G>` — the codeword the probe
 * checks for (ADR C1/P5). Any other request method gets a -32601 error.
 */
import { createInterface } from 'node:readline';

const TOOL = {
  name: 'probe_env',
  description: 'Returns the PROBE_G environment variable of the server process.',
  inputSchema: { type: 'object', properties: {} },
};

/** Writes one JSON-RPC message as a newline-terminated line. */
function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/** Answers a request with a result. */
function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

/** Answers a request with a JSON-RPC error. */
function fail(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

/** The single result the probe's codeword rides on. */
function callProbeEnv(id) {
  reply(id, { content: [{ type: 'text', text: `PROBE_G=${process.env.PROBE_G ?? ''}` }] });
}

/** Dispatches one parsed JSON-RPC message. */
function handle(message) {
  // Notifications carry no id and take no reply (`notifications/initialized` included).
  if (message.id === undefined) return;
  switch (message.method) {
    case 'initialize':
      reply(message.id, {
        protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'probe-env', version: '0.0.0' },
      });
      break;
    case 'tools/list':
      reply(message.id, { tools: [TOOL] });
      break;
    case 'tools/call':
      if (message.params?.name === 'probe_env') callProbeEnv(message.id);
      else fail(message.id, -32602, `unknown tool: ${message.params?.name}`);
      break;
    default:
      fail(message.id, -32601, `method not found: ${message.method}`);
  }
}

const lines = createInterface({ input: process.stdin });
lines.on('line', line => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return; // Not a JSON-RPC line; nothing to answer.
  }
  handle(message);
});
