/**
 * `sigil edit <id>` command — update title, description, tags of a catalog artifact.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import { loadCatalog } from '../load';
import { getAllTargets } from '../targets';
import { isInteractiveTTY, runEditWizard } from '../wizard';
import { writeArtifactFrontmatter } from '../authoring/frontmatter';
import { checkSourceArtifact } from '../authoring/check-source';
import { SigilError } from '../errors';
import { requireArtifact } from './shared/artifact';
import { requireValidCatalog } from '../cli-helpers';

export interface EditOptions {
  title?: string | undefined;
  description?: string | undefined;
  tags?: string | undefined;
  catalogDir: string;
  yes?: boolean;
}

interface EditedFields {
  title: string;
  description: string;
  tags: string[];
}

/** Resolves the new field values from CLI flags, falling back to the artifact's current values. */
function resolveFieldsFromFlags(
  artifact: { frontmatter: Record<string, unknown> },
  opts: EditOptions,
): EditedFields {
  const fm = artifact.frontmatter;
  const title = opts.title ?? (fm.title as string | undefined) ?? '';
  if (!title) {
    throw new SigilError('--title is required in non-interactive mode when no title is set.');
  }
  const description = opts.description ?? (fm.description as string | undefined) ?? '';
  const tags = opts.tags
    ? opts.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
    : Array.isArray(fm.tags)
      ? (fm.tags as string[])
      : [];
  return { title, description, tags };
}

/** Prints re-validation results for the freshly-edited artifact. */
async function reportPostEditValidation(id: string, catalogDir: string): Promise<void> {
  const targets = getAllTargets();
  const updatedCatalog = await loadCatalog(catalogDir);
  const updatedArtifact = updatedCatalog.byId.get(id);
  if (!updatedArtifact) return;

  const violations = checkSourceArtifact(updatedArtifact, updatedCatalog, targets);
  if (violations.length === 0) {
    console.log('  ✓ source validation passed');
  } else {
    console.warn('  ✗ source validation found issues:');
    for (const viol of violations) console.warn(`     ${viol.problem}`);
  }
}

export async function runEdit(id: string, opts: EditOptions): Promise<void> {
  const catalog = await requireValidCatalog(opts.catalogDir);
  const artifact = requireArtifact(
    catalog.byId,
    catalog.artifacts.map(a => a.id),
    id,
  );

  const needsWizard = !opts.yes && isInteractiveTTY();
  const fields = needsWizard
    ? await runEditWizard(artifact)
    : resolveFieldsFromFlags(artifact, opts);
  if (!fields) return; // wizard cancelled

  // Write updated fields (body preserved verbatim)
  writeArtifactFrontmatter(artifact.filePath, { ...fields });
  console.log(`✓ Updated: ${artifact.filePath}`);

  await reportPostEditValidation(id, opts.catalogDir);
  console.log(`  Next: sigil check ${artifact.filePath}`);
}
