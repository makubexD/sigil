/**
 * Every Antigravity KindEmitSpec: the target's `emitSpecs`, which ../../emit-files.ts writes every
 * file through, and the input to deriveContracts() and `sigil sync --stale`. Each whole-file kind
 * has a scaffold and a plugin variant.
 */
import type { KindEmitSpec } from '../../spec-types';
import { ANTIGRAVITY_AGENT_SPEC, ANTIGRAVITY_PLUGIN_AGENT_SPEC } from './agent';
import { ANTIGRAVITY_PLUGIN_RULE_SPEC, ANTIGRAVITY_RULE_SPEC } from './rule';
import { ANTIGRAVITY_PLUGIN_SKILL_SPEC, ANTIGRAVITY_SKILL_SPEC } from './skill';

export const ANTIGRAVITY_EMIT_SPECS: readonly KindEmitSpec[] = [
  ANTIGRAVITY_RULE_SPEC,
  ANTIGRAVITY_PLUGIN_RULE_SPEC,
  ANTIGRAVITY_SKILL_SPEC,
  ANTIGRAVITY_PLUGIN_SKILL_SPEC,
  ANTIGRAVITY_AGENT_SPEC,
  ANTIGRAVITY_PLUGIN_AGENT_SPEC,
];
