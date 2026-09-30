/**
 * Flag-to-UpdateOps translation for `sigil patch` — maps the flat CLI flag namespace
 * (PatchOpts) onto the structured UpdateOps input buildFieldPatch expects.
 * Split out of patch.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import type { UpdateOps } from '../authoring/update';

export interface PatchOpts {
  catalogDir: string;
  yes: boolean;
  title?: string;
  description?: string;
  addTag?: string;
  removeTag?: string;
  setTags?: string;
  addAppliesTo?: string;
  removeAppliesTo?: string;
  setAppliesTo?: string;
  setAppliesToRationale?: string;
  severity?: string;
  addExtends?: string;
  removeExtends?: string;
  setExtends?: string;
  addUsesRule?: string;
  removeUsesRule?: string;
  setUsesRules?: string;
  addUsesAgent?: string;
  removeUsesAgent?: string;
  setUsesAgents?: string;
  addTool?: string;
  removeTool?: string;
  setTools?: string;
  addDisallowedTool?: string;
  removeDisallowedTool?: string;
  setDisallowedTools?: string;
  claudeModel?: string;
  claudeEffort?: string;
  claudeMaxTurns?: number;
  claudeIsolation?: string;
  addPlatform?: string;
  removePlatform?: string;
  toPlatforms?: string;
}

/** Splits a comma-separated flag value into a trimmed, non-empty string array. */
function splitList(s?: string): string[] | undefined {
  return s !== undefined
    ? s
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
    : undefined;
}

/** Wraps a single flag value in a one-element array, or undefined if the flag was omitted. */
function toSingleton(v?: string): string[] | undefined {
  return v ? [v] : undefined;
}

/** Builds the title/description/tags subset of UpdateOps. */
function buildCommonUpdateOps(
  opts: PatchOpts,
): Pick<UpdateOps, 'title' | 'description' | 'addTags' | 'removeTags' | 'setTags'> {
  return {
    title: opts.title,
    description: opts.description,
    addTags: toSingleton(opts.addTag),
    removeTags: toSingleton(opts.removeTag),
    setTags: splitList(opts.setTags),
  };
}

type RuleUpdateOps = Pick<
  UpdateOps,
  | 'addAppliesTo'
  | 'removeAppliesTo'
  | 'setAppliesTo'
  | 'appliesToRationale'
  | 'severity'
  | 'addExtends'
  | 'removeExtends'
  | 'setExtends'
>;

/** Builds the appliesTo/severity/extends subset of UpdateOps (rule-kind fields). */
function buildRuleUpdateOps(opts: PatchOpts): RuleUpdateOps {
  return {
    addAppliesTo: toSingleton(opts.addAppliesTo),
    removeAppliesTo: toSingleton(opts.removeAppliesTo),
    setAppliesTo: splitList(opts.setAppliesTo),
    appliesToRationale: opts.setAppliesToRationale,
    severity: opts.severity,
    addExtends: toSingleton(opts.addExtends),
    removeExtends: toSingleton(opts.removeExtends),
    setExtends: splitList(opts.setExtends),
  };
}

/** Builds the uses.rules/uses.agents subset of UpdateOps (skill-kind fields). */
function buildUsesUpdateOps(
  opts: PatchOpts,
): Pick<
  UpdateOps,
  | 'addUsesRules'
  | 'removeUsesRules'
  | 'setUsesRules'
  | 'addUsesAgents'
  | 'removeUsesAgents'
  | 'setUsesAgents'
> {
  return {
    addUsesRules: toSingleton(opts.addUsesRule),
    removeUsesRules: toSingleton(opts.removeUsesRule),
    setUsesRules: splitList(opts.setUsesRules),
    addUsesAgents: toSingleton(opts.addUsesAgent),
    removeUsesAgents: toSingleton(opts.removeUsesAgent),
    setUsesAgents: splitList(opts.setUsesAgents),
  };
}

/** Builds the tools/disallowedTools subset of UpdateOps (agent-kind fields). */
function buildToolUpdateOps(
  opts: PatchOpts,
): Pick<
  UpdateOps,
  | 'addTools'
  | 'removeTools'
  | 'setTools'
  | 'addDisallowedTools'
  | 'removeDisallowedTools'
  | 'setDisallowedTools'
> {
  return {
    addTools: toSingleton(opts.addTool),
    removeTools: toSingleton(opts.removeTool),
    setTools: splitList(opts.setTools),
    addDisallowedTools: toSingleton(opts.addDisallowedTool),
    removeDisallowedTools: toSingleton(opts.removeDisallowedTool),
    setDisallowedTools: splitList(opts.setDisallowedTools),
  };
}

/** Builds the `claude:` frontmatter namespace subset of UpdateOps (Claude-only agent fields). */
function buildClaudeUpdateOps(
  opts: PatchOpts,
): Pick<UpdateOps, 'claudeModel' | 'claudeEffort' | 'claudeMaxTurns' | 'claudeIsolation'> {
  return {
    claudeModel: opts.claudeModel,
    claudeEffort: opts.claudeEffort,
    claudeMaxTurns: opts.claudeMaxTurns,
    claudeIsolation: opts.claudeIsolation,
  };
}

/** Builds the buildFieldPatch `UpdateOps` input from raw CLI flags. */
export function buildUpdateOpsFromFlags(opts: PatchOpts): UpdateOps {
  return {
    ...buildCommonUpdateOps(opts),
    ...buildRuleUpdateOps(opts),
    ...buildUsesUpdateOps(opts),
    ...buildToolUpdateOps(opts),
    ...buildClaudeUpdateOps(opts),
  };
}
