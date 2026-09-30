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

export async function runEdit(id: string, opts: EditOptions): Promise<void> {
  const catalog = await requireValidCatalog(opts.catalogDir);
  const targets = getAllTargets();

  const artifact = requireArtifact(
    catalog.byId,
    catalog.artifacts.map(a => a.id),
    id,
  );

  let newTitle: string;
  let newDescription: string;
  let newTags: string[];

  const isTTY = isInteractiveTTY();
  const needsWizard = !opts.yes && isTTY;

  if (needsWizard) {
    const result = await runEditWizard(artifact);
    if (!result) return; // cancelled
    newTitle = result.title;
    newDescription = result.description;
    newTags = result.tags;
  } else {
    // Flags path — fall back to current values for any unspecified field
    const fm = artifact.frontmatter as Record<string, unknown>;
    newTitle = opts.title ?? (fm.title as string | undefined) ?? '';
    newDescription = opts.description ?? (fm.description as string | undefined) ?? '';
    newTags = opts.tags
      ? opts.tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)
      : Array.isArray(fm.tags)
        ? (fm.tags as string[])
        : [];

    if (!newTitle) {
      throw new SigilError('--title is required in non-interactive mode when no title is set.');
    }
  }

  // Write updated fields (body preserved verbatim)
  writeArtifactFrontmatter(artifact.filePath, {
    title: newTitle,
    description: newDescription,
    tags: newTags,
  });

  console.log(`✓ Updated: ${artifact.filePath}`);

  // Validate the edited artifact
  const updatedCatalog = await loadCatalog(opts.catalogDir);
  const updatedArtifact = updatedCatalog.byId.get(id);
  if (updatedArtifact) {
    const violations = checkSourceArtifact(updatedArtifact, updatedCatalog, targets);
    if (violations.length === 0) {
      console.log('  ✓ source validation passed');
    } else {
      console.warn('  ✗ source validation found issues:');
      for (const viol of violations) console.warn(`     ${viol.problem}`);
    }
  }

  console.log(`  Next: sigil check ${artifact.filePath}`);
}
