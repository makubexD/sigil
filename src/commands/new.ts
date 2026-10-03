/**
 * `sigil new [kind]` command — scaffold an authoring template for a new catalog artifact.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../load';
import { getAllTargets } from '../targets';
import { ALL_KINDS, isArtifactKind, sourceRelPath } from '../kinds';
import { namespaceDir } from '../catalog-layout';
import { isInteractiveTTY, buildEquivalentNewCommand, printEquivalentCommand } from '../wizard';
import { checkSourceArtifact } from '../authoring/check-source';
import { normPath } from '../paths';
import { SigilError } from '../errors';
import { headerFor } from '../authoring/header';
import { resolveWizardInputs, resolveFlagsInputs } from './new-inputs';
import type { NewOptions, EffectiveNewInputs } from './new-inputs';

export type { NewOptions };

/**
 * Computes the destination path for the new artifact (folder and file name from KIND_REGISTRY's
 * sourceDir/sourceSuffix), creating parent dirs as needed.
 */
function computeOutPath(
  effectiveKind: string,
  name: string,
  lang: string,
  catalogDir: string,
): string {
  if (!isArtifactKind(effectiveKind)) throw new SigilError(`Unknown kind '${effectiveKind}'`);
  const outPath = path.join(namespaceDir(catalogDir, lang), sourceRelPath(effectiveKind, name));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  return outPath;
}

/** Prints the post-create platforms note (restricted vs. DRY-default all-platforms). */
function printPlatformsNote(restrictedPlatforms: string[] | undefined, id: string): void {
  if (restrictedPlatforms) {
    console.log(
      `  platforms: [${restrictedPlatforms.join(', ')}]  (run: sigil retarget ${id} --to all to propagate to all AIs)`,
    );
  } else {
    console.log(
      `  platforms: all supporting AIs (DRY default — run: sigil retarget ${id} --add|remove <platform> to adjust)`,
    );
  }
}

/** Reloads the catalog and runs checkSourceArtifact against the newly created file. */
async function autoValidateNewFile(catalogDir: string, outPath: string): Promise<void> {
  try {
    const catalog = await loadCatalog(catalogDir);
    const targets = getAllTargets();
    const artifact = catalog.artifacts.find(a => normPath(a.filePath) === normPath(outPath));
    if (artifact) {
      const violations = checkSourceArtifact(artifact, catalog, targets);
      if (violations.length === 0) {
        console.log('  ✓ source validation passed');
      } else {
        console.log('  ✗ source validation found issues:');
        for (const v of violations) console.log(`    ${v.problem}`);
      }
    }
  } catch (_e) {
    // Catalog reload failed (unlikely) — point to manual check
  }
}

/** Derives the artifact's name/lang/id from the resolved inputs. */
function computeArtifactIdentity(inputs: EffectiveNewInputs): {
  name: string;
  lang: string;
  id: string;
} {
  const name = inputs.name ?? `new-${inputs.kind}`;
  const lang = inputs.language ?? 'shared';
  const idPrefix = lang === 'shared' ? 'shared' : lang;
  return { name, lang, id: `${idPrefix}/${name}` };
}

/** The new artifact's identity fields, computed once and shared by header-building + path-writing. */
interface NewArtifactIdentity {
  effectiveKind: string;
  id: string;
  name: string;
  lang: string;
}

/** Builds the schema-derived header text for the new artifact. */
function buildNewArtifactHeader(identity: NewArtifactIdentity, inputs: EffectiveNewInputs): string {
  const { effectiveKind, id, name, lang } = identity;
  return headerFor(effectiveKind, {
    id,
    kind: effectiveKind,
    title: inputs.title ?? `TODO — ${name}`,
    description: inputs.description ?? 'TODO — one-line description used in catalog listings.',
    name: effectiveKind === 'skill' || effectiveKind === 'agent' ? name : undefined,
    language: lang !== 'shared' ? lang : undefined,
    platforms: inputs.platforms,
  });
}

/** Builds the header, writes it to the computed path, and returns that path. Throws if it exists. */
function writeNewArtifactFile(
  identity: NewArtifactIdentity,
  inputs: EffectiveNewInputs,
  catalogDir: string,
): string {
  const header = buildNewArtifactHeader(identity, inputs);
  const outPath = computeOutPath(identity.effectiveKind, identity.name, identity.lang, catalogDir);

  if (fs.existsSync(outPath)) {
    throw new SigilError(`File already exists: ${outPath}`, {
      hint: '  Use a different --name, or delete the existing file first.',
    });
  }

  fs.writeFileSync(outPath, header, 'utf-8');
  return outPath;
}

/** Prints the "Repeat non-interactively" equivalent command (wizard path only). */
function printEquivalentIfWizard(
  needsWizard: boolean | undefined,
  inputs: EffectiveNewInputs,
  name: string,
  isTTY: boolean,
): void {
  if (!needsWizard) return;
  const cmd = buildEquivalentNewCommand({
    kind: inputs.kind,
    name,
    language: inputs.language,
    platforms: inputs.platforms,
  });
  printEquivalentCommand(cmd, isTTY);
}

export async function runNew(kind: string | undefined, opts: NewOptions): Promise<void> {
  // ALL_KINDS from kinds.ts — single source of truth for the full kind list.
  const validKinds = ALL_KINDS;

  // ── Wizard vs flags dispatch ──────────────────────────────────────────────
  const needsWizard = (!kind || opts.interactive) && !opts.yes;
  const isTTY = isInteractiveTTY();

  const inputs = needsWizard
    ? await resolveWizardInputs(opts, isTTY, validKinds)
    : resolveFlagsInputs(kind, opts, validKinds);
  if (!inputs) return;

  const { name, lang, id } = computeArtifactIdentity(inputs);
  const identity: NewArtifactIdentity = { effectiveKind: inputs.kind, id, name, lang };
  const outPath = writeNewArtifactFile(identity, inputs, opts.catalogDir);

  console.log(`✓ Created: ${outPath}`);
  printPlatformsNote(inputs.platforms, id);

  // ── Auto-validate the newly created file ─────────────────────────────────
  await autoValidateNewFile(opts.catalogDir, outPath);
  console.log(`  Next: fill in the body, then run: sigil check ${outPath}`);

  printEquivalentIfWizard(needsWizard, inputs, name, isTTY);
}
