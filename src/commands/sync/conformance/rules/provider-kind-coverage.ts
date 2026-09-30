/**
 * `provider-kind-coverage` — every whole-file kind (skill/agent/rule/prompt/workflow) a target
 * declares in `supportedKinds` must have a matching `KindEmitSpec`. This is a catalog/target-level
 * check, not a per-artifact one — the finding names the (provider, kind) gap, not an artifact.
 *
 * The concrete defect this rule exists to catch: `copilot/workflow` was declared supported in
 * `COPILOT_SUPPORTED_KINDS` with no `KindEmitSpec` at all — it emitted through `buildPromptFile`
 * with no derived output contract and no doc citation (fixed 2026-08-07 by adding
 * `COPILOT_WORKFLOW_SPEC`, see copilot/spec/prompt.ts). No `fix()` here: closing a coverage gap
 * means authoring a new spec file, not something safe to generate unattended.
 *
 * Config kinds (hook/settings/mcp) are JSON merges, not markdown renders — their citation coverage
 * is asserted by the AGGREGATE_DOC_REFS wiring itself (src/targets/all-emit-specs.ts), not by this
 * rule, which is scoped to the whole-file kinds where a KindEmitSpec is the right coverage unit.
 *
 * @module
 */
import type { ArtifactKind } from '../../../../types';
import type { ConformanceRule, ConformanceFinding } from '../types';
import { ALL_PROVIDER_SPECS } from '../../../../targets/all-emit-specs';

const WHOLE_FILE_KINDS: ReadonlySet<ArtifactKind> = new Set([
  'skill',
  'agent',
  'rule',
  'prompt',
  'workflow',
]);

/** (provider, kind) gaps for one target: whole-file kinds it declares supported with no spec. */
function findingsForTarget(
  target: Parameters<ConformanceRule['detect']>[0]['targets'][number],
): ConformanceFinding[] {
  const specKinds = new Set(
    ALL_PROVIDER_SPECS.filter(s => s.source.startsWith(`${target.name}/`)).map(s => s.spec.kind),
  );
  return (target.supportedKinds ?? [])
    .filter(kind => WHOLE_FILE_KINDS.has(kind) && !specKinds.has(kind))
    .map(kind => ({
      ruleId: 'provider-kind-coverage',
      severity: 'error' as const,
      provider: target.name,
      detail:
        `target '${target.name}' declares supportedKinds including '${kind}' but no ` +
        `KindEmitSpec exists for (${target.name}, ${kind}) — no derived contract, no doc citation`,
    }));
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  return ctx.targets.flatMap(findingsForTarget);
}

export const providerKindCoverageRule: ConformanceRule = {
  id: 'provider-kind-coverage',
  title: 'Every supported whole-file kind must have a KindEmitSpec',
  class: 'mechanical',
  appliesTo: {},
  rationale:
    'A kind declared in supportedKinds with no KindEmitSpec emits with no derived output ' +
    'contract and no doc citation — a silent gap that only an audit like this one catches ' +
    'otherwise.',
  detect,
};
