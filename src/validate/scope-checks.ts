/**
 * §4 (no-op appliesTo) and §6 (duplicate-ancestor scope) checks — both about a rule's
 * `appliesTo` scoping and what ends up resident in context as a result.
 */
import type { Artifact } from '../types';
import type { ValidateCtx } from './types';

/**
 * `appliesTo: ["**\/*"]` matches every file, so `paths:` scoping (Claude) / `applyTo:`
 * scoping (Copilot) buys nothing — the rule is always resident regardless. Not an error
 * (it may be deliberate for a genuinely universal rule — set `appliesToRationale` to say
 * so and suppress this warning), but worth a warning since it is also the shape produced
 * by forgetting to narrow a copy-pasted rule template.
 */
const UNSCOPED_APPLIES_TO = ['**/*'];

/**
 * §4: warns when a rule's `appliesTo` is the no-op `["**\/*"]` scope, unless the author
 * has set a non-empty `appliesToRationale` explaining why it's deliberate.
 */
export function checkUnscopedAppliesTo(ctx: ValidateCtx, artifact: Artifact): void {
  if (artifact.kind !== 'rule') return;
  const appliesTo = artifact.frontmatter.appliesTo as string[] | undefined;
  const rationale = artifact.frontmatter.appliesToRationale as string | undefined;
  if (rationale && rationale.trim().length > 0) return;
  if (
    appliesTo &&
    appliesTo.length === UNSCOPED_APPLIES_TO.length &&
    appliesTo.every((g, i) => g === UNSCOPED_APPLIES_TO[i])
  ) {
    ctx.warnings.push(
      `[${artifact.id}] appliesTo: ["**/*"] matches every file — this rule is always resident ` +
        `with no scoping benefit. If that's deliberate, set 'appliesToRationale' to say so; ` +
        `otherwise narrow it.`,
    );
  }
}

/** Groups rules by each `extends` ancestor id — a rule with 2 ancestors appears in 2 groups. */
function groupRulesByAncestor(rules: Artifact[]): Map<string, Artifact[]> {
  const byAncestor = new Map<string, Artifact[]>();
  for (const rule of rules) {
    const extendsIds = (rule.frontmatter.extends as string[] | undefined) ?? [];
    for (const ancestorId of extendsIds) {
      const group = byAncestor.get(ancestorId) ?? [];
      group.push(rule);
      byAncestor.set(ancestorId, group);
    }
  }
  return byAncestor;
}

/** True when two rules share both `language` and an identical `appliesTo` array. */
function sameLanguageAndScope(a: Artifact, b: Artifact): boolean {
  const aLang = (a.frontmatter.language as string | undefined) ?? null;
  const bLang = (b.frontmatter.language as string | undefined) ?? null;
  if (aLang !== bLang) return false; // different languages never co-install — not a real dup
  const aScope = (a.frontmatter.appliesTo as string[] | undefined) ?? [];
  const bScope = (b.frontmatter.appliesTo as string[] | undefined) ?? [];
  return aScope.length === bScope.length && aScope.every((g, k) => g === bScope[k]);
}

/** Warns once per (a, b) pair of siblings extending `ancestorId` into the same scope. */
function warnDuplicateSiblings(ctx: ValidateCtx, ancestorId: string, siblings: Artifact[]): void {
  const warnedPairs = new Set<string>();
  for (const a of siblings) {
    for (const b of siblings) {
      if (a.id >= b.id || !sameLanguageAndScope(a, b)) continue;
      const pairKey = `${a.id}|${b.id}`;
      if (warnedPairs.has(pairKey)) continue;
      warnedPairs.add(pairKey);
      const scope = JSON.stringify((a.frontmatter.appliesTo as string[] | undefined) ?? []);
      ctx.warnings.push(
        `[${a.id}] and [${b.id}] both extend '${ancestorId}' and share the identical appliesTo ` +
          `scope (${scope}) — '${ancestorId}''s body is prepended into both, so it loads twice ` +
          `for any matching file. Drop the extends from one of them.`,
      );
    }
  }
}

/**
 * §6: two rules with identical `appliesTo` that also share a common `extends` ancestor will
 * both get that ancestor's body prepended by resolve.ts — so any file matching the shared
 * scope loads the ancestor's content twice. Only flags direct `extends` (not the full
 * transitive chain) — deep accidental duplication is rare enough that a false negative there
 * is preferable to false positives from loosely related rules sharing a distant ancestor.
 *
 * Scoped to same-`language` pairs only (or both shared/languageless): rules from different
 * languages (e.g. `angular/ng-git` and `csharp/cs-git`) never install into the same project —
 * only one language's rule set is ever selected — so flagging them would be a false positive.
 * The real hazard this catches is two rules of the *same* language, installed together, both
 * extending the same ancestor into the same scope (found in this audit: `ts-code-quality` and
 * `ts-conventions` both extended `shared/clean-code` while both scoped `**\/*.ts`).
 */
export function checkDuplicateAncestorScope(ctx: ValidateCtx): void {
  const rules = ctx.catalog.artifacts.filter(a => a.kind === 'rule');
  const byAncestor = groupRulesByAncestor(rules);
  for (const [ancestorId, siblings] of byAncestor) {
    if (siblings.length > 1) warnDuplicateSiblings(ctx, ancestorId, siblings);
  }
}
