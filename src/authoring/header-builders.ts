/**
 * Per-kind header builders for src/authoring/header.ts — split out to keep header.ts under the
 * project's max-lines cap. Each builder returns only the kind-specific YAML lines; shared fields
 * (id/kind/title/description/tags/version/platforms) are added by headerFor() in header.ts.
 *
 * Record<ArtifactKind, …> in header.ts enforces that every kind has a builder here — adding a
 * kind to the ArtifactKind union without adding a builder is a compile error.
 */
import type { HeaderValues } from './header-types';

/** Wrap a string value for safe YAML emission (double-quote to handle special chars). */
function yamlStr(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}

/** Builds the `uses:` block (rules + agents) for a skill header, or a comment placeholder. */
function buildSkillUsesLines(v: HeaderValues): string[] {
  if (!v.usesRules || v.usesRules.length === 0) {
    return ['# uses:          # rules: [<rule-id>, ...] agents: [<agent-id>, ...]'];
  }
  const lines: string[] = ['uses:', '  rules:'];
  for (const r of v.usesRules) lines.push(`    - ${r}`);
  if (v.usesAgents && v.usesAgents.length > 0) {
    lines.push('  agents:');
    for (const a of v.usesAgents) lines.push(`    - ${a}`);
  } else {
    lines.push('  # agents: []');
  }
  return lines;
}

export function buildSkillLines(v: HeaderValues): string[] {
  return [
    `name: ${v.name ?? 'TODO'}`,
    `language: ${v.language ?? 'TODO'}`,
    `# whenToUse:   # trigger phrases the model matches, e.g. "add tests for", "this file has no tests"`,
    ...buildSkillUsesLines(v),
  ];
}

/** Builds the `claude:` hints block for an agent header, or a comment placeholder. */
function buildAgentClaudeLines(v: HeaderValues): string[] {
  if (!v.claudeModel && !v.claudeEffort && !v.claudeMaxTurns) {
    return [
      '# claude:        # model: sonnet | effort: medium | maxTurns: 15 | isolation: worktree',
    ];
  }
  const lines: string[] = ['claude:'];
  if (v.claudeModel) lines.push(`  model: ${v.claudeModel}`);
  if (v.claudeEffort) lines.push(`  effort: ${v.claudeEffort}`);
  if (v.claudeMaxTurns) lines.push(`  maxTurns: ${v.claudeMaxTurns}`);
  return lines;
}

export function buildAgentLines(v: HeaderValues): string[] {
  const languageLine = v.language
    ? `language: ${v.language}`
    : '# language:     # omit for shared agents that work across all languages';
  return [
    `name: ${v.name ?? 'TODO'}`,
    languageLine,
    ...buildAgentClaudeLines(v),
    '# tools:          # vendor-neutral capabilities: codebase, terminal, web-search ...',
  ];
}

export function buildRuleLines(v: HeaderValues): string[] {
  const lines: string[] = [];
  if (v.language) {
    lines.push(`language: ${v.language}`);
  } else {
    lines.push('# language:     # omit for cross-language rules');
  }
  lines.push(`severity: ${v.severity ?? 'recommended'}`);
  if (v.extendsRules && v.extendsRules.length > 0) {
    lines.push('extends:');
    for (const r of v.extendsRules) lines.push(`  - ${r}`);
  } else {
    lines.push(
      '# extends:       # parent rule IDs for DRY inheritance — bodies prepended at build',
    );
  }
  lines.push('# appliesTo:     # file globs — default ["**/*"] (see appliesToRationale)');
  return lines;
}

export function buildPromptLines(v: HeaderValues): string[] {
  const lines: string[] = [];
  if (v.args && v.args.length > 0) {
    lines.push('args:');
    for (const arg of v.args) {
      lines.push(`  - name: ${arg.name}`);
      if (arg.description) lines.push(`    description: ${yamlStr(arg.description)}`);
      if (arg.required) lines.push(`    required: true`);
    }
  } else {
    lines.push('# args:          # - name: input  description: "..."  required: true');
  }
  lines.push('# appliesTo:     # file globs for context-aware auto-suggestion (optional)');
  return lines;
}

export function buildWorkflowLines(_v: HeaderValues): string[] {
  return ['steps:', '  - ref: TODO    # artifact ID to run', '  # - ref: <another-artifact-id>'];
}

export function buildHookLines(_v: HeaderValues): string[] {
  return [
    `event: PreToolUse   # PreToolUse | PostToolUse | UserPromptSubmit | SubagentStop | Stop | SessionStart | Notification`,
    `matcher: "*"        # tool-name regex (used for PreToolUse/PostToolUse). "*" = all tools`,
    `command: "TODO — shell command to run when the hook fires"`,
    `# timeout:        # milliseconds before the command is killed (optional)`,
    `# language:       # scope to a language (omit for shared/all-language hooks)`,
    `# defaultScope: project  # recommended install scope: project | local | user (overridable by --scope)`,
  ];
}

export function buildSettingsLines(_v: HeaderValues): string[] {
  return [
    '# permissions:    # Claude Code permissions fragment (array-union merged):',
    '#   allow: []     #   - "Bash(npm run *)" etc.',
    '#   deny:  []',
    '#   ask:   []',
    '# env:            # Environment variables (object-spread merged):',
    '#   MY_VAR: "value"',
    '# model:          # e.g. claude-opus-4-8  (overwrites existing)',
    '# language:       # scope to a language (omit for global settings)',
    '# defaultScope: project  # recommended install scope: project | local | user',
  ];
}

export function buildTemplateLines(_v: HeaderValues): string[] {
  return [
    'appliesToKind: [skill]   # artifact kinds this template may be attached to',
    'revision: 1              # bump on any structural or shared-prose change',
    'slots:',
    '  - { key: TODO, required: true, description: "TODO — what goes in this slot" }',
    'docs:',
    '  # Official documentation this structure follows — required. See docs/reference/spec.md',
    '  # for the review cadence `sigil sync --stale` checks this against.',
    '  - { url: "https://TODO", verifiedOn: "TODO-YYYY-MM-DD", covers: "TODO" }',
  ];
}

export function buildMcpLines(_v: HeaderValues): string[] {
  return [
    'server:',
    '  # Stdio form (launch a local process):',
    '  command: "npx"',
    '  args: ["-y", "@modelcontextprotocol/server-example"]',
    '  # env:          # optional environment variables for the server process',
    '',
    '  # Remote form (connect to an HTTP/SSE endpoint):',
    '  # type: "http"  # or "sse"',
    '  # url: "https://your-mcp-server.example.com/mcp"',
    '  # headers:      # optional HTTP headers (e.g. Authorization)',
    '  #   Authorization: "Bearer YOUR_TOKEN"',
    '# language:       # scope to a language (omit for shared MCP servers)',
    '# defaultScope: project  # recommended install scope: project | local | user',
  ];
}
