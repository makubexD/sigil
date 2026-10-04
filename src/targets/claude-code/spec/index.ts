/**
 * Every Claude Code KindEmitSpec: the target's `emitSpecs`, which ../../emit-files.ts writes every
 * file through, and the input to deriveContracts() and `sigil sync --stale`.
 */
import type { KindEmitSpec } from '../../spec-types';
import { CLAUDE_PLUGIN_SKILL_SPEC, CLAUDE_SCAFFOLD_SKILL_SPEC } from './skill';
import { CLAUDE_SCAFFOLD_RULE_SPEC } from './rule';
import { CLAUDE_AGENT_SPEC } from './agent';
import { CLAUDE_PROMPT_SPEC } from './prompt';
import { CLAUDE_WORKFLOW_SPEC } from './workflow';

export const CLAUDE_EMIT_SPECS: readonly KindEmitSpec[] = [
  CLAUDE_PLUGIN_SKILL_SPEC,
  CLAUDE_SCAFFOLD_SKILL_SPEC,
  CLAUDE_SCAFFOLD_RULE_SPEC,
  CLAUDE_AGENT_SPEC,
  CLAUDE_PROMPT_SPEC,
  CLAUDE_WORKFLOW_SPEC,
];
