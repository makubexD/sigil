/**
 * The `language:` and `name:` patches `sigil move` applies to the moved artifact, so both always match
 * the id the artifact lands at (catalog layout standard).
 *
 * @module
 */
import type { MovePlan } from './plan';
import { SCHEMAS } from '../../schema';
import { SHARED_NAMESPACE, splitId } from '../../catalog-layout';

/**
 * Keeps `language:` in step with the namespace the artifact moves to: the language for a language
 * folder, none for shared/. Only for kinds whose schema has a `language` field (prompts have none).
 */
export function languagePatch(plan: MovePlan): { language?: string | undefined } {
  const schema = SCHEMAS[plan.artifact.kind as keyof typeof SCHEMAS];
  if (!('language' in schema.shape)) return {};
  const prefix = splitId(plan.newId, plan.artifact.kind)?.prefix;
  return { language: prefix && prefix !== SHARED_NAMESPACE ? prefix : undefined };
}

/**
 * Keeps `name:` in step with the new id: a skill's or agent's name must equal the id's last segment
 * (checkNameConsistency), so a rename that kept the old name would fail its own post-move check.
 */
export function namePatch(plan: MovePlan): { name?: string } {
  if (plan.artifact.frontmatter.name === undefined) return {};
  return { name: plan.newId.split('/').pop() ?? plan.newId };
}

/** Everything that names the moved artifact: its new id, plus the language and name patches. */
export function identityPatch(plan: MovePlan): Record<string, unknown> {
  return { id: plan.newId, ...languagePatch(plan), ...namePatch(plan) };
}
