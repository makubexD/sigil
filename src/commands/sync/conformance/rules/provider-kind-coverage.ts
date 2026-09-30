/**
 * `provider-kind-coverage` — every whole-file kind (skill/agent/rule/prompt/workflow) a target
 * emits `native` on a channel (its capability table, src/targets/<provider>/capabilities.ts) must
 * have a matching `KindEmitSpec` for that channel: one with no `variant`, or with `variant` equal
 * to the channel id (Claude's skill has distinct `plugin`/`scaffold` layouts). This is a
 * catalog/target-level check, not a per-artifact one — the finding names the (provider, channel,
 * kind) gap, not an artifact.
 *
 * The concrete defect this rule exists to catch: `copilot/workflow` was declared supported with no
 * `KindEmitSpec` at all — it emitted through `buildPromptFile` with no derived output contract and
 * no doc citation (fixed 2026-08-07 by adding `COPILOT_WORKFLOW_SPEC`, see copilot/spec/prompt.ts).
 * No `fix()` here: closing a coverage gap means authoring a new spec file, not something safe to
 * generate unattended.
 *
 * Config kinds (hook/settings/mcp) are JSON merges, not markdown renders — their citation coverage
 * is asserted by the AGGREGATE_DOC_REFS wiring itself (src/targets/all-emit-specs.ts), not by this
 * rule, which is scoped to the whole-file kinds where a KindEmitSpec is the right coverage unit.
 * `via`/`none` rows need no spec: `via` carries its own citation, `none` emits nothing.
 *
 * @module
 */
import type { ArtifactKind, Target } from '../../../../types';
import type { ConformanceRule, ConformanceFinding } from '../types';
import { ALL_PROVIDER_SPECS } from '../../../../targets/all-emit-specs';
import { CHANNELS, type ChannelId } from '../../../../targets/capability-types';
import { nativeKinds } from '../../../../targets/capabilities';

const WHOLE_FILE_KINDS: ReadonlySet<ArtifactKind> = new Set([
  'skill',
  'agent',
  'rule',
  'prompt',
  'workflow',
]);

/** Kinds that have a KindEmitSpec usable on `channel` for `target`. */
function specKindsFor(target: Target, channel: ChannelId): Set<ArtifactKind> {
  return new Set(
    ALL_PROVIDER_SPECS.filter(s => s.source.startsWith(`${target.name}/`))
      .filter(s => s.spec.variant === undefined || s.spec.variant === channel)
      .map(s => s.spec.kind),
  );
}

/** (provider, channel, kind) gaps: whole-file kinds emitted `native` with no spec for the channel. */
function findingsForChannel(target: Target, channel: ChannelId): ConformanceFinding[] {
  const specKinds = specKindsFor(target, channel);
  return nativeKinds(target, channel)
    .filter(kind => WHOLE_FILE_KINDS.has(kind) && !specKinds.has(kind))
    .map(kind => ({
      ruleId: 'provider-kind-coverage',
      severity: 'error' as const,
      provider: target.name,
      detail:
        `target '${target.name}' emits '${kind}' natively on its ${channel} channel but no ` +
        `KindEmitSpec exists for (${target.name}, ${kind}, ${channel}) — no derived contract, ` +
        'no doc citation',
    }));
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  return ctx.targets.flatMap(target =>
    CHANNELS.flatMap(channel => findingsForChannel(target, channel)),
  );
}

export const providerKindCoverageRule: ConformanceRule = {
  id: 'provider-kind-coverage',
  title: 'Every natively emitted whole-file kind must have a KindEmitSpec per channel',
  class: 'mechanical',
  appliesTo: {},
  rationale:
    'A kind a capability table marks native with no KindEmitSpec emits with no derived output ' +
    'contract and no doc citation — a silent gap that only an audit like this one catches ' +
    'otherwise.',
  detect,
};
