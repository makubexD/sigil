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
import { LEXICON_TERMS, type LexiconTerm, type ProviderLexicon } from '../../../../targets/lexicon';
import { splitFrontmatterBlock, extractOriginalBody } from '../frontmatter-patch';
import { shippedTexts } from '../../../../artifact-texts';

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
  // One entry per distinct literal: several providers or terms can share one (AGENTS.md is the
  // conventions file on two targets and a rules location on one). The first term in LEXICON_TERMS
  // order wins, so a finding and its fix are the same on every run.
  const byTermOrder = getAllTargets()
    .flatMap(target => (target.lexicon ? termsOf(target.lexicon) : []))
    .sort(([a], [b]) => LEXICON_TERMS.indexOf(a) - LEXICON_TERMS.indexOf(b));
  const seen = new Set<string>();
  return byTermOrder.filter(([, value]) => !seen.has(value) && seen.add(value));
}

/** Escapes a literal string for safe use inside a `RegExp` constructor. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Findings for one artifact's body and reference files against every known lexicon literal. */
function findingsForArtifact(
  artifact: Parameters<ConformanceRule['detect']>[0]['catalog']['artifacts'][number],
): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const shipped of shippedTexts(artifact)) {
    for (const [term, value] of allLexiconTerms()) {
      if (!new RegExp(escapeRegExp(value)).test(shipped.text)) continue;
      findings.push({
        ruleId: 'provider-term-leak',
        severity: 'error',
        artifactId: artifact.id,
        filePath: shipped.filePath,
        // term='<name>' prefix is fix()'s stable marker — same pattern as redundant-default's
        // key='<name>', needed because one artifact can leak more than one term.
        detail: `term='${term}' value='${value}' — ${shipped.label} contains the literal instead of {sigil:${term}}`,
      });
    }
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

/** The term and the exact literal a finding names (a term's value differs per provider). */
function leakOf(detail: string): { term: LexiconTerm; value: string } | undefined {
  const term = detail.match(/^term='([^']+)'/)?.[1] as LexiconTerm | undefined;
  const value = detail.match(/value='([^']*)'/)?.[1];
  return term && value ? { term, value } : undefined;
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
  const leak = leakOf(finding.detail);
  if (!leak) return undefined;

  const raw = fs.readFileSync(finding.filePath, 'utf-8');
  const replace = (text: string) =>
    text.replace(new RegExp(escapeRegExp(leak.value), 'g'), `{sigil:${leak.term}}`);
  // A reference file is all prose: rewrite it whole, never give it a frontmatter block.
  if (finding.filePath !== artifact.filePath) {
    return { artifactId: artifact.id, filePath: finding.filePath, newContent: replace(raw) };
  }
  const { bodyStart } = splitFrontmatterBlock(raw);
  const newBody = replace(extractOriginalBody(raw, bodyStart));
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
