/**
 * `platform-path-leak` — a body naming a folder only one provider reads (that target's
 * `privateDirs`, e.g. Claude's `.claude/`: "Read any .md files under .claude/") ships that path
 * verbatim to every other provider, where it doesn't exist. A kind `ownedBy` that provider
 * (src/kinds.ts: hook, settings) is exempt, since only that provider installs it.
 * Rewriting to provider-neutral phrasing needs judgment (what to say instead) — `editorial`.
 *
 * Covers free-form `.claude/` prose that needs real rewriting (varied phrasing, no fixed
 * replacement). The two specific, exact-substitution leaks found in the same 2026-08-10 audit —
 * `CLAUDE.md` and `$ARGUMENTS` — are covered instead by `provider-term-leak`, which is mechanical
 * with a `fix()` because those have one correct neutral token each (`{sigil:conventions-file}`,
 * `{sigil:arguments}`), no judgment needed. This rule's REWRITE_INSTRUCTION previously told the
 * model "CLAUDE.md itself is fine to keep since Claude Code, not sigil, defines that convention" —
 * backwards: who defines a convention says nothing about whether it is true on every other
 * provider's output. Corrected below; `CLAUDE.md` is now caught by `provider-term-leak`.
 *
 * @module
 */
import type { Target } from '../../../../types';
import type { ConformanceRule, ConformanceFinding, EditorialTask } from '../types';
import { getAllTargets } from '../../../../targets/index';
import { KIND_REGISTRY } from '../../../../kinds';
import { shippedTexts, type ShippedText } from '../../../../artifact-texts';

type Artifact = Parameters<ConformanceRule['detect']>[0]['catalog']['artifacts'][number];

/** The private folders (Target.privateDirs) of other providers that `text` names. */
function leakedDirs(
  artifact: Artifact,
  text: string,
  targets: readonly Target[],
): Array<[Target, string]> {
  return targets.flatMap(owner =>
    KIND_REGISTRY[artifact.kind].ownedBy.includes(owner.name)
      ? [] // a kind only this provider installs (hook, settings) may name its folders
      : (owner.privateDirs ?? [])
          .filter(dir => text.includes(dir))
          .map((dir): [Target, string] => [owner, dir]),
  );
}

/** Whether `artifact`'s kind installs on `target` at all (an `ownedBy` kind only on its owners). */
function shipsTo(artifact: Artifact, target: Target): boolean {
  const owners = KIND_REGISTRY[artifact.kind].ownedBy;
  return owners.length === 0 || owners.includes(target.name);
}

/** One finding per other provider that receives `shipped`, which names `owner`'s folder `dir`. */
function findingsFor(
  artifact: Artifact,
  shipped: ShippedText,
  [owner, dir]: [Target, string],
  targets: readonly Target[],
): ConformanceFinding[] {
  return targets
    .filter(other => other.name !== owner.name && shipsTo(artifact, other))
    .map(other => ({
      ruleId: 'platform-path-leak',
      severity: 'warning' as const,
      artifactId: artifact.id,
      filePath: shipped.filePath,
      provider: other.name,
      detail:
        `${shipped.label} references ${dir} verbatim — ships unchanged into ` +
        `${other.name}'s output where the path does not exist`,
    }));
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const targets = getAllTargets();
  return ctx.catalog.artifacts.flatMap(artifact =>
    shippedTexts(artifact).flatMap(shipped =>
      leakedDirs(artifact, shipped.text, targets).flatMap(leak =>
        findingsFor(artifact, shipped, leak, targets),
      ),
    ),
  );
}

/** The editorial rewrite for a body that names `dir`, a folder only one provider reads. */
const rewriteInstruction = (dir: string) =>
  `Rewrite every mention of "${dir}" in the body to provider-neutral phrasing — e.g. ` +
  `"the project's documented conventions and any rules files present". Use the ` +
  '{sigil:conventions-file}, {sigil:rules-dir} and {sigil:skills-dir} lexicon tokens (see ' +
  'src/targets/lexicon.ts) when the sentence is naming those specific paths — do not hardcode ' +
  "any provider's literal filename or directory anywhere in the rewrite. Preserve the " +
  "surrounding sentence's meaning. Do not change anything else in the body.";

function editorialTask(
  finding: ConformanceFinding,
  ctx: Parameters<ConformanceRule['detect']>[0],
): EditorialTask | undefined {
  if (!finding.artifactId || !finding.filePath) return undefined;
  const artifact = ctx.catalog.byId.get(finding.artifactId);
  // The editorial pass rewrites an artifact's body; a reference file stays report-only.
  if (!artifact || finding.filePath !== artifact.filePath) return undefined;
  return {
    artifactId: finding.artifactId,
    filePath: finding.filePath,
    kind: artifact.kind,
    instruction: rewriteInstruction(
      leakedDirs(artifact, artifact.body, getAllTargets())[0]?.[1] ??
        'the provider-specific folder',
    ),
    ownedFields: ['body'],
  };
}

export const platformPathLeakRule: ConformanceRule = {
  id: 'platform-path-leak',
  title: "Body prose must not hardcode a provider's private folder",
  class: 'editorial',
  appliesTo: {},
  rationale:
    'An artifact emitting to several providers must read correctly on each — a folder only one ' +
    'provider reads (Target.privateDirs, e.g. .claude/) is accurate there and nonsense elsewhere.',
  detect,
  editorialTask,
};
