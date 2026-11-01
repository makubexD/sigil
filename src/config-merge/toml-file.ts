/**
 * TOML config-file rendering for Codex's `config.toml`.
 *
 * smol-toml parses the file, but re-serializing it would drop the user's comments and hand-kept
 * ordering, which breaks the "merge into user-owned config, never overwrite" rule. So sigil reads
 * with smol-toml and writes by splicing text: it owns whole `[mcp_servers.<key>]` tables and
 * replaces them in place, leaving every other line — comments, `model`, other tables —
 * byte-for-byte. Anything outside `mcp_servers`, or a shape it can't splice safely, is refused.
 *
 * @module
 */
import { parse, stringify } from 'smol-toml';
import { deepEqual, isPlainObject } from './primitives';
import { isBlank, isComment, isHeaderLine, joinLines, splitLines } from './toml-lines';
import { SigilError } from '../errors';

const MCP_SERVERS = 'mcp_servers';

/** The error every unsafe edit raises: sigil refuses rather than risk clobbering the file. */
function unsafeEdit(): SigilError {
  return new SigilError("this TOML config file couldn't be edited safely — nothing was written", {
    hint: 'Keep MCP servers in [mcp_servers.<name>] tables, or edit the file by hand.',
  });
}

/** True when `obj` holds `key` as an own property (works on smol-toml's null-prototype tables). */
function hasKey(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** A shallow copy of `obj` with `key` removed (also normalizes null-prototype parse output). */
function withoutKey(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const result = { ...obj };
  delete result[key];
  return result;
}

/** `value` as a table of servers, or `{}` when it isn't one. */
function tableOf(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

/** The `mcp_servers` table a single header line defines, or `undefined`. */
function parseHeader(line: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = parse(line);
  } catch {
    return undefined;
  }
  if (!isPlainObject(parsed)) return undefined;
  const servers = parsed[MCP_SERVERS];
  return isPlainObject(servers) ? servers : undefined;
}

/** True when `line` is the direct `[mcp_servers.<key>]` header for `key` (not a sub-table). */
function isServerHeader(line: string, key: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('[[')) return false;
  if (!trimmed.startsWith(`[${MCP_SERVERS}.`)) return false;
  const servers = parseHeader(trimmed);
  if (servers === undefined) return false;
  const value = servers[key];
  return (
    Object.keys(servers).length === 1 && isPlainObject(value) && Object.keys(value).length === 0
  );
}

/** True when `line` is a header that still lives under server `key` (its own or a sub-table). */
function headerBelongsToServer(line: string, key: string): boolean {
  const servers = parseHeader(line.trim());
  return servers !== undefined && hasKey(servers, key);
}

/** Index of server `key`'s direct header, or -1 when it has none (e.g. written inline). */
function serverHeaderIndex(lines: string[], key: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (isServerHeader(lines[i] ?? '', key)) return i;
  }
  return -1;
}

/**
 * The end of server `key`'s block starting at `start`: the next header that isn't part of `key`,
 * minus the comment/blank block that belongs directly above that header (left in place).
 */
function blockEnd(lines: string[], start: number, key: string): number {
  let next = start + 1;
  while (next < lines.length) {
    const line = lines[next] ?? '';
    if (isHeaderLine(line) && !headerBelongsToServer(line, key)) break;
    next++;
  }
  let topmostComment = -1;
  for (let i = next - 1; i > start; i--) {
    const line = lines[i] ?? '';
    if (isComment(line)) {
      topmostComment = i;
      continue;
    }
    if (isBlank(line)) continue;
    break;
  }
  return topmostComment >= 0 ? topmostComment : next;
}

/** Appends one `stringify`-rendered server table, separated by a blank line when needed. */
function appendTable(text: string, table: string): string {
  if (text.trim() === '') return table;
  return text.endsWith('\n') ? text + '\n' + table : text + '\n\n' + table;
}

/** Cuts each removed/changed server's block out of `lines`. */
function cutRemovedServers(
  lines: string[],
  beforeServers: Record<string, unknown>,
  mergedServers: Record<string, unknown>,
): void {
  for (const key of Object.keys(beforeServers)) {
    if (hasKey(mergedServers, key) && deepEqual(beforeServers[key], mergedServers[key])) continue;
    const start = serverHeaderIndex(lines, key);
    if (start < 0) throw unsafeEdit();
    lines.splice(start, blockEnd(lines, start, key) - start);
  }
}

/** Appends each added/changed server's freshly rendered table. */
function appendChangedServers(
  text: string,
  beforeServers: Record<string, unknown>,
  mergedServers: Record<string, unknown>,
): string {
  let out = text;
  for (const key of Object.keys(mergedServers)) {
    if (hasKey(beforeServers, key) && deepEqual(beforeServers[key], mergedServers[key])) continue;
    out = appendTable(out, stringify({ [MCP_SERVERS]: { [key]: mergedServers[key] } }));
  }
  return out;
}

/** Drops a bare `[mcp_servers]` header that ends up with nothing (but blanks) under it. */
function dropEmptyMcpServersHeader(text: string): string {
  const trailing = text.endsWith('\n');
  const lines = splitLines(text);
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() !== `[${MCP_SERVERS}]`) continue;
    let next = i + 1;
    while (next < lines.length && isBlank(lines[next] ?? '')) next++;
    if (next < lines.length) continue; // a comment/table/key still sits under it
    lines.splice(i, next - i);
    return joinLines(lines, trailing);
  }
  return text;
}

/** Parses the spliced result, treating blank text as `{}`; a parse failure is an unsafe edit. */
function parseResult(text: string): Record<string, unknown> {
  if (text.trim() === '') return {};
  try {
    return parse(text) as Record<string, unknown>;
  } catch {
    throw unsafeEdit();
  }
}

/** A copy with an empty `mcp_servers` table treated as absent, for the final deep-equal. */
function normalizeEmptyMcpServers(obj: Record<string, unknown>): Record<string, unknown> {
  const result = { ...obj };
  const servers = result[MCP_SERVERS];
  if (isPlainObject(servers) && Object.keys(servers).length === 0) delete result[MCP_SERVERS];
  return result;
}

/** Throws when `merged` differs from `before` anywhere outside the `mcp_servers` table. */
function assertOwnsOnlyMcpServers(
  before: Record<string, unknown>,
  merged: Record<string, unknown>,
): void {
  if (deepEqual(withoutKey(before, MCP_SERVERS), withoutKey(merged, MCP_SERVERS))) return;
  throw unsafeEdit();
}

/**
 * Renders the merged config into TOML by splicing `before` (the file's current text, empty for a
 * missing file). Removed or changed servers are cut out; added or changed servers are appended;
 * a bare `[mcp_servers]` header left empty is dropped; and the result must parse back to `merged`.
 */
export function renderToml(before: string, merged: Record<string, unknown>): string {
  const beforeParsed = before.trim() === '' ? {} : (parse(before) as Record<string, unknown>);
  assertOwnsOnlyMcpServers(beforeParsed, merged);

  const beforeServers = tableOf(beforeParsed[MCP_SERVERS]);
  const mergedServers = tableOf(merged[MCP_SERVERS]);
  const lines = splitLines(before);

  cutRemovedServers(lines, beforeServers, mergedServers);
  let text = joinLines(lines, before.endsWith('\n'));
  text = appendChangedServers(text, beforeServers, mergedServers);
  text = dropEmptyMcpServersHeader(text);

  if (!deepEqual(normalizeEmptyMcpServers(parseResult(text)), normalizeEmptyMcpServers(merged))) {
    throw unsafeEdit();
  }
  return text;
}
