/**
 * `provider-term-leak` — a body containing another provider's literal lexicon value (e.g.
 * `CLAUDE.md`, `$ARGUMENTS`) instead of the neutral `{sigil:<term>}` token — see
 * src/targets/lexicon.ts for what the lexicon is and why it exists.
 *
 * The concrete defect this rule exists to catch: `_Others/Req.md` reported a Copilot-targeted
 * install of `angular/ng-security-auditor` telling **Copilot** to "Read CLAUDE.md" — a body string
 * hardcoded for one provider, shipped unchanged to every provider, because the body layer had no
 * translation mechanism at all (unlike frontmatter, which every FieldMapping already routes
 * through). 29 files leaked `CLAUDE.md`, 18 leaked `$ARGUMENTS`; both passed `sigil sync --check`
 * before this rule existed. See docs/decisions/provider-neutral-body-lexicon-2026-08.md.
 *
 * Detection is derived from every registered target's `lexicon` values (getAllTargets()) — not a
 * hand-listed string set — so adding a provider or a
 * lexicon term automatically extends what this rule catches, the same "derive from the live
 * source of truth" shape as `declared-but-unemitted` (mapped keys) and `redundant-default`
 * (zod schema defaults).
 *
 * Unlike `platform-path-leak` (editorial — free `.claude/` prose needs judgment about the
 * replacement wording), this is `mechanical` with a `fix()`: the replacement is an exact 1:1
 * substitution (this provider's literal value → the neutral token), no judgment required.
 *
 * Scoped to the same `WHOLE_FILE_KINDS` as `declared-but-unemitted` — `hook`/`settings`/`mcp` are
 * config kinds that merge into user-owned JSON and never render through a `KindEmitSpec`/lexicon
 * pipeline at all (their bodies are human-facing install notes, not per-provider output). A hook's
 * `$CLAUDE_TOOL_INPUT` and an mcp note's "Claude Code (and Copilot)" symmetric documentation are
 * both correct as authored, not leaks — flagging them would be a scoping bug in this rule, not a
 * real gap (the same reasoning `declared-but-unemitted`'s header gives for the same exemption).
 *
 * @module
 */
import fs from 'fs';
import type { ArtifactKind } from '../../../../types';
import type { ConformanceRule, ConformanceFinding, ArtifactEdit } from '../types';
import { getAllTargets } from '../../../../targets/index';
import type { LexiconTerm, ProviderLexicon } from '../../../../targets/lexicon';
import { splitFrontmatterBlock, extractOriginalBody } from '../frontmatter-patch';

const WHOLE_FILE_KINDS: ReadonlySet<ArtifactKind> = new Set([
  'skill',
  'agent',
  'rule',
  'prompt',
  'workflow',
]);

/** One provider's lexicon entries flattened to (term, literal value) pairs — the leak candidates. */
function termsOf(lexicon: ProviderLexicon): Array<[LexiconTerm, string]> {
  return (Object.entries(lexicon) as Array<[LexiconTerm, ProviderLexicon[LexiconTerm]]>).map(
    ([term, entry]) => [term, entry.value],
  );
}

/**
 * Every (term, literal value) pair across every registered provider — a body matching ANY
 * provider's literal is a leak, regardless of which provider that literal "belongs" to, because
 * the catalog source is meant to be provider-neutral (the leak is the hardcoding itself).
 */
function allLexiconTerms(): Array<[LexiconTerm, string]> {
  return getAllTargets().flatMap(target => (target.lexicon ? termsOf(target.lexicon) : []));
}

/** Escapes a literal string for safe use inside a `RegExp` constructor. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Findings for one artifact's body against every known lexicon literal. */
function findingsForArtifact(
  artifact: Parameters<ConformanceRule['detect']>[0]['catalog']['artifacts'][number],
): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const [term, value] of allLexiconTerms()) {
    if (!new RegExp(escapeRegExp(value)).test(artifact.body)) continue;
    findings.push({
      ruleId: 'provider-term-leak',
      severity: 'error',
      artifactId: artifact.id,
      filePath: artifact.filePath,
      // term='<name>' prefix is fix()'s stable marker — same pattern as redundant-default's
      // key='<name>', needed because one artifact can leak more than one term.
      detail: `term='${term}' — body contains the literal '${value}' instead of {sigil:${term}}`,
    });
  }
  return findings;
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    if (!WHOLE_FILE_KINDS.has(artifact.kind)) continue;
    findings.push(...findingsForArtifact(artifact));
  }
  return findings;
}

/**
 * Replaces every occurrence of the leaked literal with its neutral token. Reads the term back out
 * of `finding.detail` rather than recomputing "which literal leaked" from `ctx` — mirrors
 * redundant-default's fix() for the identical reason: all findings are computed once, up front.
 *
 * Reads the CURRENT body off disk (not `ctx.catalog`'s in-memory snapshot) — unlike
 * redundant-default's frontmatterPatch, which merges per-key and so is safe when an artifact has
 * more than one finding, `newBody` is a full-body replacement: two findings on the same artifact
 * (e.g. both `conventions-file` and `arguments` leak in one file) each call `fix()` against the
 * same stale in-memory `ctx.catalog` snapshot, so computing `newBody` from it would make the
 * second write clobber the first fix, silently reverting it (caught by re-running `sigil sync
 * --check` after `--apply` on a file with two leaks — it still failed).
 */
function fix(
  finding: ConformanceFinding,
  ctx: Parameters<ConformanceRule['detect']>[0],
): ArtifactEdit | undefined {
  if (!finding.artifactId || !finding.filePath) return undefined;
  const artifact = ctx.catalog.byId.get(finding.artifactId);
  if (!artifact) return undefined;
  const term = finding.detail.match(/^term='([^']+)'/)?.[1] as LexiconTerm | undefined;
  if (!term) return undefined;
  const entry = allLexiconTerms().find(([t]) => t === term);
  if (!entry) return undefined;
  const [, value] = entry;

  const raw = fs.readFileSync(finding.filePath, 'utf-8');
  const { bodyStart } = splitFrontmatterBlock(raw);
  const currentBody = extractOriginalBody(raw, bodyStart);
  const newBody = currentBody.replace(new RegExp(escapeRegExp(value), 'g'), `{sigil:${term}}`);
  return { artifactId: artifact.id, filePath: artifact.filePath, newBody };
}

export const providerTermLeakRule: ConformanceRule = {
  id: 'provider-term-leak',
  title: "Body prose must not hardcode another provider's literal lexicon value",
  class: 'mechanical',
  appliesTo: { kinds: ['skill', 'agent', 'rule', 'prompt', 'workflow'] },
  rationale:
    'An artifact body is shared verbatim across every provider it emits to — a literal like ' +
    'CLAUDE.md or $ARGUMENTS is correct on the provider that defines it and wrong on every other ' +
    'one. The neutral {sigil:<term>} token lets renderArtifact() substitute the right text per ' +
    'provider, the same job FieldMapping already does for frontmatter.',
  detect,
  fix,
};
