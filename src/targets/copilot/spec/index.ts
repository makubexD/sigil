/**
 * Every Copilot KindEmitSpec: the target's `emitSpecs`, which ../../emit-files.ts writes every
 * per-artifact file through, and the input to deriveContracts() and `sigil sync --stale`. Copilot has no `hook`/`settings` spec —
 * that absence is the unsupported-kind statement for those two config kinds. `workflow` DOES have
 * a spec (COPILOT_WORKFLOW_SPEC) even though it renders through the exact same shape as `prompt`
 * (see prompt.ts's buildPromptLikeSpec) — without its own entry here, `workflow` would be a
 * natively emitted kind (./capabilities.ts) with no contract and no doc citation, which
 * is exactly the gap the 2026-08-07 audit closed (see provider-kind-coverage conformance rule).
 */
import type { KindEmitSpec } from '../../spec-types';
import { COPILOT_SKILL_SPEC } from './skill';
import { COPILOT_RULE_SPEC } from './rule';
import { COPILOT_AGENT_SPEC } from './agent';
import { COPILOT_PROMPT_SPEC, COPILOT_WORKFLOW_SPEC } from './prompt';

export const COPILOT_EMIT_SPECS: readonly KindEmitSpec[] = [
  COPILOT_SKILL_SPEC,
  COPILOT_RULE_SPEC,
  COPILOT_AGENT_SPEC,
  COPILOT_PROMPT_SPEC,
  COPILOT_WORKFLOW_SPEC,
];
