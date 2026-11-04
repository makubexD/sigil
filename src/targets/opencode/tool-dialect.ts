/**
 * OpenCode's agent `ToolDialect` (../tool-dialect.ts) and the `permission` block an agent's
 * `tools` list becomes. D3 in docs/decisions/opencode-target-2026-11.md maps each neutral tool to
 * OpenCode's permission keys: `read` is `read`, `list`; `search` is `grep`, `glob`; `edit` is
 * `edit`; `shell` is `bash`; `web` is `webfetch`, `websearch`; `agent` is `task`; `todo` is
 * `todowrite`.
 *
 * Permission rules are ordered and the last match wins
 * ([Granular Rules](https://opencode.ai/docs/permissions/#granular-rules-object-syntax)), so the
 * catch-all `'*': deny` comes first and every allowed name is written after it.
 *
 * `read` is written as a rule object, not as the `read: allow` shorthand: P4 in the same ADR
 * returned a `.env` value when the shorthand replaced OpenCode's default rules. The four rules
 * in that object are OpenCode's own defaults (`*` allow, `*.env` ask, `*.env.*` ask,
 * `*.env.example` allow), read from `opencode debug agent build` on 1.19.4, kept in that order.
 * The object protects only the read tool, not shell: P4 also read `.env` through `bash: allow`.
 *
 * @module
 */
import { renderTools } from '../tool-dialect';
import type { ToolDialect } from '../tool-dialect';
import { yamlScalar } from '../yaml-util';

/** Agent `tools`: one OpenCode permission key per neutral tool (D3). */
export const OPENCODE_AGENT_TOOL_DIALECT: ToolDialect = {
  kind: 'names',
  names: {
    read: ['read', 'list'],
    search: ['grep', 'glob'],
    edit: ['edit'],
    shell: ['bash'],
    web: ['webfetch', 'websearch'],
    agent: ['task'],
    todo: ['todowrite'],
  },
};

/** OpenCode's default `read` rules, in order; the object form keeps the `.env` guard. */
const READ_RULES: readonly string[] = [
  "    '*': allow",
  "    '*.env': ask",
  "    '*.env.*': ask",
  "    '*.env.example': allow",
];

/** A plain tool name writes unquoted; anything else is a provider pattern, quoted by `yamlScalar`. */
const PLAIN_NAME_RE = /^[a-z]+$/;

/**
 * The `permission:` block for an authored tool list: `'*': deny` first, then each rendered name
 * in dialect order. `read` writes the four-rule object above; a provider pattern goes through
 * `yamlScalar()` so it stays one YAML key. No trailing newline.
 */
export function opencodePermissionBlock(authored: readonly string[]): string {
  const rendered = renderTools(OPENCODE_AGENT_TOOL_DIALECT, authored);
  if (rendered.kind !== 'names')
    throw new Error('OPENCODE_AGENT_TOOL_DIALECT must be a names dialect');
  const lines: string[] = ['permission:', "  '*': deny"];
  for (const name of rendered.names) {
    if (name === 'read') {
      lines.push('  read:', ...READ_RULES);
    } else if (PLAIN_NAME_RE.test(name)) {
      lines.push(`  ${name}: allow`);
    } else {
      lines.push(`  ${yamlScalar(name)}: allow`);
    }
  }
  return lines.join('\n');
}
