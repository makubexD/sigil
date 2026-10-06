/**
 * `stack-leak` — `shared/` holds only language-neutral text (catalog-layout-standard-2026-10.md,
 * case c), so a shared artifact's own text that names one stack's library or tool
 * (`stacks[].terms` in `catalog/standard.yaml`, e.g. `cobra` for go) belongs in that stack's part,
 * `languages/<home>/stack-parts/`. A warning, not an error: a term can be a fair mention (a neutral
 * sentence comparing ecosystems), which the author decides. Stack parts and deprecated artifacts
 * are not scanned; terms match whole words only.
 *
 * @module
 */
import type { Artifact } from '../../../../types';
import type { ConformanceRule, ConformanceFinding } from '../types';
import { loadCatalogStandard, type CatalogStandard } from '../../../../catalog-standard';
import { shippedTexts } from '../../../../artifact-texts';
import { SHARED_NAMESPACE, LANGUAGES_DIR } from '../../../../catalog-layout';
import { STACK_PARTS_DIR } from '../../../../load-references';

const RULE_ID = 'stack-leak';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (term: string) => new RegExp(`(?<![\\w@/-])${escape(term)}(?![\\w-])`);
const isPart = (filePath: string) => /[\\/]stack-parts[\\/]/.test(filePath);

/** One warning per term of one stack that a shared artifact's own text names. */
function leaks(artifact: Artifact, standard: CatalogStandard): ConformanceFinding[] {
  const texts = shippedTexts(artifact).filter(t => !isPart(t.filePath));
  return standard.stacks.flatMap(stack =>
    (stack.terms ?? []).flatMap(term => {
      const hit = texts.find(t => wordRe(term).test(t.text));
      if (!hit) return [];
      const home = `${LANGUAGES_DIR}/${stack.home ?? '<home>'}/${STACK_PARTS_DIR}/`;
      return [
        {
          ruleId: RULE_ID,
          severity: 'warning' as const,
          artifactId: artifact.id,
          filePath: hit.filePath,
          detail: `${hit.label} names '${term}' (${stack.id} stack): move it to ${home}`,
        },
      ];
    }),
  );
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const { catalog } = ctx;
  if (!catalog.root) return [];
  const standard = loadCatalogStandard(catalog.root);
  if (!standard) return [];
  return catalog.artifacts
    .filter(a => a.id.startsWith(`${SHARED_NAMESPACE}/`) && !a.frontmatter.deprecated)
    .flatMap(artifact => leaks(artifact, standard));
}

export const stackLeakRule: ConformanceRule = {
  id: RULE_ID,
  title: "Shared text names no stack's library",
  class: 'editorial',
  appliesTo: {},
  rationale:
    'shared/ holds only language-neutral text; a sentence about one stack belongs in that ' +
    "stack's part, in the language that owns the stack, where only that stack's users read it.",
  detect,
};
