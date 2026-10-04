/**
 * The `language:` patch `sigil move` applies to the moved artifact, so the field always matches
 * the namespace the artifact lands in (catalog layout standard).
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
