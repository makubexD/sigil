/**
 * Schema-derived minimal header generator for catalog artifacts.
 *
 * Design principles:
 *   - Required keys are emitted as active YAML (derived from the zod schema — never drifts).
 *   - Optional keys are emitted as YAML comments (discoverable, not noise).
 *   - `platforms:` is written active only when the user explicitly restricts (DRY default = omit).
 *   - No body structure imposed — body left as a single placeholder line.
 *   - Every field the wizard gathers is wired through HeaderValues to the emitted header.
 */

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
  name?: string;
  /** Language (required for skill; optional for agent/rule). */
  language?: string;

  // Platforms restriction (absent = DRY default: all supporting targets)
  platforms?: string[];

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
  switch (kind) {
    case 'skill': {
      // Required
      lines.push(`name: ${v.name ?? 'TODO'}`);
      lines.push(`language: ${v.language ?? 'TODO'}`);
      // Optional (commented hints)
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
      break;
    }
    case 'agent': {
      // Required
      lines.push(`name: ${v.name ?? 'TODO'}`);
      // Optional
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
      lines.push(
        '# tools:          # vendor-neutral capabilities: codebase, terminal, web-search ...',
      );
      break;
    }
    case 'rule': {
      // Optional
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
      break;
    }
    case 'prompt': {
      // Optional
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
      break;
    }
    case 'workflow': {
      lines.push('steps:');
      lines.push('  - ref: TODO    # artifact ID to run');
      lines.push('  # - ref: <another-artifact-id>');
      break;
    }
    default: {
      lines.push('# Add kind-specific fields here');
    }
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
  lines.push(
    `<!-- ${kind === 'rule' ? 'Add rule bullets below. Extend with extends: for DRY inheritance.' : kind === 'skill' ? 'Describe what the AI should do when this skill is invoked.' : kind === 'agent' ? 'Define the agent persona and instructions below.' : kind === 'prompt' ? 'Write the prompt body. Use {{placeholder}} for args.' : 'TODO: Add content below.'} -->`,
  );
  lines.push('');

  return lines.join('\n') + '\n';
}
