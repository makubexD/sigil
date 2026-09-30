/**
 * Schema-derived minimal header generator for catalog artifacts.
 *
 * Design principles:
 *   - Required keys are emitted as active YAML (derived from the zod schema — never drifts).
 *   - Optional keys are emitted as YAML comments (discoverable, not noise).
 *   - `platforms:` is written active only when the user explicitly restricts (DRY default = omit).
 *   - No body structure imposed — body left as a single placeholder line.
 *   - Every field the wizard gathers is wired through HeaderValues to the emitted header.
 *   - Adding a new kind = add one entry to KIND_HEADER_BUILDERS (compile error if omitted).
 */

import type { ArtifactKind } from '../types';
import { KIND_REGISTRY } from '../kinds';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeaderValues {
  /** Artifact identifier. Convention: "<language>/<name>" or "shared/<name>". */
  id: string;
  /** Artifact kind: skill | agent | rule | prompt | workflow. */
  kind: string;
  /** Short human-readable title. */
  title: string;
  /** One-line description. */
  description: string;

  // Skill + Agent required
  /** Kebab-case invocation name (required for skill/agent). */
  name?: string | undefined;
  /** Language (required for skill; optional for agent/rule). */
  language?: string | undefined;

  // Platforms restriction (absent = DRY default: all supporting targets)
  platforms?: string[] | undefined;

  // Skill kind extras (optional, surfaced as comments when absent)
  usesRules?: string[];
  usesAgents?: string[];

  // Rule kind extras
  extendsRules?: string[];
  severity?: 'required' | 'recommended' | 'optional';

  // Agent kind extras
  claudeModel?: 'haiku' | 'sonnet' | 'opus';
  claudeEffort?: 'low' | 'medium' | 'high';
  claudeMaxTurns?: number;

  // Prompt kind extras
  args?: Array<{ name: string; description?: string; required?: boolean }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap a string value for safe YAML emission (double-quote to handle special chars). */
function yamlStr(s: string): string {
  // Escape inner double-quotes
  return `"${s.replace(/"/g, '\\"')}"`;
}

/** Emit a folded YAML string (>-) for multi-line description values. */
function descriptionBlock(desc: string): string[] {
  return ['description: >-', `  ${desc}`];
}

// ─── Per-kind header builders ─────────────────────────────────────────────────
//
// Record<ArtifactKind, …> enforces that every kind has a builder — adding a kind
// to the ArtifactKind union without adding a builder here is a compile error.
// Each builder returns only the kind-specific YAML lines (shared fields are added
// by the caller `headerFor`).

type KindHeaderBuilder = (v: HeaderValues) => string[];

const KIND_HEADER_BUILDERS: Record<ArtifactKind, KindHeaderBuilder> = {
  skill: buildSkillLines,
  agent: buildAgentLines,
  rule: buildRuleLines,
  prompt: buildPromptLines,
  workflow: buildWorkflowLines,
  hook: buildHookLines,
  settings: buildSettingsLines,
  mcp: buildMcpLines,
};

function buildSkillLines(v: HeaderValues): string[] {
  const lines: string[] = [];
  lines.push(`name: ${v.name ?? 'TODO'}`);
  lines.push(`language: ${v.language ?? 'TODO'}`);
  lines.push(
    `# appliesTo:   # file globs that trigger this skill's context — defaults to ['**/*']`,
  );
  if (v.usesRules && v.usesRules.length > 0) {
    lines.push('uses:');
    lines.push('  rules:');
    for (const r of v.usesRules) lines.push(`    - ${r}`);
    if (v.usesAgents && v.usesAgents.length > 0) {
      lines.push('  agents:');
      for (const a of v.usesAgents) lines.push(`    - ${a}`);
    } else {
      lines.push('  # agents: []');
    }
  } else {
    lines.push('# uses:          # rules: [<rule-id>, ...] agents: [<agent-id>, ...]');
  }
  return lines;
}

function buildAgentLines(v: HeaderValues): string[] {
  const lines: string[] = [];
  lines.push(`name: ${v.name ?? 'TODO'}`);
  if (v.language) {
    lines.push(`language: ${v.language}`);
  } else {
    lines.push('# language:     # omit for shared agents that work across all languages');
  }
  if (v.claudeModel || v.claudeEffort || v.claudeMaxTurns) {
    lines.push('claude:');
    if (v.claudeModel) lines.push(`  model: ${v.claudeModel}`);
    if (v.claudeEffort) lines.push(`  effort: ${v.claudeEffort}`);
    if (v.claudeMaxTurns) lines.push(`  maxTurns: ${v.claudeMaxTurns}`);
  } else {
    lines.push(
      '# claude:        # model: sonnet | effort: medium | maxTurns: 15 | isolation: worktree',
    );
  }
  lines.push('# tools:          # vendor-neutral capabilities: codebase, terminal, web-search ...');
  return lines;
}

function buildRuleLines(v: HeaderValues): string[] {
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
  lines.push('# appliesTo:     # file globs — defaults to ["**/*"]');
  return lines;
}

function buildPromptLines(v: HeaderValues): string[] {
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

function buildWorkflowLines(_v: HeaderValues): string[] {
  return ['steps:', '  - ref: TODO    # artifact ID to run', '  # - ref: <another-artifact-id>'];
}

function buildHookLines(_v: HeaderValues): string[] {
  return [
    `event: PreToolUse   # PreToolUse | PostToolUse | UserPromptSubmit | SubagentStop | Stop | SessionStart | Notification`,
    `matcher: "*"        # tool-name regex (used for PreToolUse/PostToolUse). "*" = all tools`,
    `command: "TODO — shell command to run when the hook fires"`,
    `# timeout:        # milliseconds before the command is killed (optional)`,
    `# language:       # scope to a language (omit for shared/all-language hooks)`,
    `# defaultScope: project  # recommended install scope: project | local | user (overridable by --scope)`,
  ];
}

function buildSettingsLines(_v: HeaderValues): string[] {
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

function buildMcpLines(_v: HeaderValues): string[] {
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

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate a minimal, schema-derived frontmatter header for a catalog artifact.
 *
 * Returns the full file string (frontmatter block + single body placeholder).
 * Callers should write this to the appropriate path under catalog/.
 *
 * Required keys (from the zod schema) are emitted as active YAML.
 * Optional keys are emitted as YAML comments — discoverable but not noise.
 * `platforms:` is active only when restricted (absent = all supporting targets).
 */
export function headerFor(kind: string, v: HeaderValues): string {
  const lines: string[] = ['---'];

  // ── Shared required keys (BaseFields) ───────────────────────────────────
  lines.push(`id: ${v.id}`);
  lines.push(`kind: ${kind}`);
  lines.push(`title: ${yamlStr(v.title || `TODO — ${v.name ?? kind}`)}`);
  lines.push(
    ...descriptionBlock(v.description || 'TODO — one-line description used in catalog listings.'),
  );

  // ── Kind-specific required and optional keys ─────────────────────────────
  const builder = KIND_HEADER_BUILDERS[kind as ArtifactKind];
  if (builder) {
    lines.push(...builder(v));
  } else {
    // Unknown kind — emit a generic placeholder so the file is at least valid YAML
    lines.push('# Add kind-specific fields here');
  }

  // ── Shared optional keys ──────────────────────────────────────────────────
  lines.push('# tags:          # discovery tags []');
  lines.push('# version:       # per-artifact semver (optional; package version is the default)');

  // ── platforms: active only when restricting ───────────────────────────────
  if (v.platforms && v.platforms.length > 0) {
    lines.push('platforms:');
    for (const p of v.platforms) lines.push(`  - ${p}`);
    lines.push('# Remove the platforms: field (or run: sigil retarget <id> --to all)');
    lines.push('# to propagate this artifact to every AI that supports its kind.');
  } else {
    lines.push('# platforms:     # omit to propagate to ALL supporting AIs (DRY default)');
    lines.push('#                # or list: [claude, copilot] to restrict');
    lines.push('#                # change later: sigil retarget <id> --add <platform>');
  }

  lines.push('---');
  lines.push('');

  // ── Body placeholder ──────────────────────────────────────────────────────
  // bodyComment is read from the registry if the kind is known, else a generic fallback.
  const descriptor = KIND_REGISTRY[kind as ArtifactKind];
  const bodyComment = descriptor?.bodyComment ?? 'TODO: Add content below.';
  lines.push(`<!-- ${bodyComment} -->`);
  lines.push('');

  return lines.join('\n') + '\n';
}
