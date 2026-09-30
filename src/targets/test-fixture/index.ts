/**
 * Synthetic third target adapter — exists ONLY for test/extensibility.test.ts, the acceptance
 * test proving a new provider needs zero edits outside this directory. It is deliberately never
 * imported by src/targets/index.ts (registering it there would make it a real, user-facing
 * target); the test constructs it directly and drives the pipeline stages by hand.
 *
 * What it exercises, and why each one matters:
 *   - `frontmatterExtensions` for 'skill' — the FIRST real use of this mechanism (see CLAUDE.md's
 *     "Templates + emit specs" section: no shipped target had declared an extension yet, so the
 *     rule that provider-specific fields live under a namespace was documented but untested).
 *   - `compile()` reads `resolvedSlots` directly and reorders them, instead of the default
 *     `resolvedBody` concatenation — proving BodySectionSpec's documented escape hatch
 *     (src/targets/spec-types.ts) is real, not aspirational.
 *   - `supportedKinds` excludes 'rule' — exercises resolveSelection's warn-and-skip path
 *     (src/select/selector-resolve.ts) for a kind this target does not scaffold.
 *
 * @module
 */
import { z } from 'zod';
import type { ArtifactKind, CompileOptions, FileMap, ResolvedCatalog, Target } from '../../types';

/**
 * The one provider-specific field this fixture contributes, under its own `test-fixture:`
 * namespace (catalog source authors it as `test-fixture: { priority: 7 }`, matching
 * TestFixtureTarget.name below — composeSchema, src/validate/schema-checks.ts, nests every
 * target's extension under `<target.name>:`). Value is a zod raw shape, per
 * Target.frontmatterExtensions' documented contract (src/types.ts).
 */
export const FIXTURE_FRONTMATTER_EXTENSION = {
  skill: {
    /** Arbitrary numeric field with no core-schema equivalent — proves the namespace round-trips. */
    priority: z.number(),
  },
};

/** Renders one skill's frontmatter + a slot order reversed from the template's declared order. */
function renderFixtureSkill(artifact: ResolvedCatalog['artifacts'][number]): string {
  const priority = (artifact.frontmatter['test-fixture'] as { priority?: number } | undefined)
    ?.priority;
  const slots = artifact.resolvedSlots ?? {};
  // Deliberately the REVERSE of the template's slot order (a, b) — proves an adapter can
  // rearrange resolvedSlots instead of taking the default resolvedBody concatenation.
  const reorderedBody = Object.keys(slots)
    .sort()
    .reverse()
    .map(key => slots[key])
    .join('\n\n');

  return `---\nx-priority: ${priority ?? 'unset'}\n---\n\n${reorderedBody}\n`;
}

export class TestFixtureTarget implements Target {
  readonly name = 'test-fixture';
  readonly displayName = 'Test Fixture';
  readonly supportedKinds: ArtifactKind[] = ['skill'];
  readonly frontmatterExtensions = FIXTURE_FRONTMATTER_EXTENSION;

  async compile(catalog: ResolvedCatalog, _options: CompileOptions): Promise<FileMap> {
    const files: FileMap = {};
    for (const artifact of catalog.artifacts) {
      if (artifact.kind !== 'skill') continue;
      files[`fixture/${artifact.id.replace('/', '-')}.md`] = renderFixtureSkill(artifact);
    }
    return files;
  }
}
