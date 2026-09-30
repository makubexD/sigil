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
import { resolveCatalog } from '../resolve';
import { getAllTargets } from '../targets';
import { ALL_KINDS, isArtifactKind } from '../kinds';
import {
  isInteractiveTTY,
  runNewWizard,
  buildEquivalentNewCommand,
  printEquivalentCommand,
} from '../wizard';
import { checkSourceArtifact } from '../authoring/check-source';
import { normPath } from '../paths';
import { SigilError } from '../errors';
import { requireValidCatalog } from '../cli-helpers';
import { headerFor } from '../authoring/header';
import { setPlatforms } from '../authoring/platforms';

export interface NewOptions {
  language?: string | undefined;
  name?: string | undefined;
  catalogDir: string;
  platforms?: string | undefined;
  yes?: boolean;
  interactive?: boolean;
}

export async function runNew(kind: string | undefined, opts: NewOptions): Promise<void> {
  // ALL_KINDS from kinds.ts — single source of truth for the full kind list.
  const validKinds = ALL_KINDS;

  // ── Wizard vs flags dispatch ──────────────────────────────────────────────
  const needsWizard = (!kind || opts.interactive) && !opts.yes;
  const isTTY = isInteractiveTTY();

  let effectiveKind: string = kind ?? '';
  let effectiveName: string | undefined = opts.name;
  let effectiveLanguage: string | undefined = opts.language;
  let effectiveTitle: string | undefined;
  let effectiveDescription: string | undefined;
  let restrictedPlatforms: string[] | undefined;

  if (needsWizard) {
    if (!isTTY) {
      throw new SigilError('No kind provided and stdin/stdout is not an interactive terminal.', {
        hint:
          `  Provide a kind: sigil new <kind> --name <name> --yes\n` +
          `  Valid kinds: ${validKinds.join(', ')}\n\n` +
          '  Or run in an interactive terminal to use the guided wizard.',
      });
    }
    // Load catalog for the wizard (language list + reference data)
    const rawCatalog = await requireValidCatalog(opts.catalogDir);
    const resolved = resolveCatalog(rawCatalog);
    const targets = getAllTargets();
    const wizardResult = await runNewWizard(resolved, targets);
    if (!wizardResult) return;
    effectiveKind = wizardResult.kind;
    effectiveName = wizardResult.name;
    effectiveLanguage = wizardResult.language;
    effectiveTitle = wizardResult.title;
    effectiveDescription = wizardResult.description;
    restrictedPlatforms = wizardResult.platforms;
  } else {
    // Flags path — validate inputs
    if (!effectiveKind) {
      throw new SigilError('No kind specified and --yes skips the wizard.', {
        hint:
          `  Provide a kind: sigil new <kind> --name <name> --yes\n` +
          `  Valid kinds: ${validKinds.join(', ')}`,
      });
    }
    if (!isArtifactKind(effectiveKind)) {
      throw new SigilError(
        `Unknown kind '${effectiveKind}'. Valid kinds: ${validKinds.join(', ')}`,
      );
    }
    // Parse --platforms flag
    if (opts.platforms) {
      const requestedPlatforms = opts.platforms
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);
      const targets = getAllTargets();
      const { platforms: normalized, errors } = setPlatforms(
        effectiveKind,
        requestedPlatforms,
        targets,
      );
      if (errors.length > 0) {
        throw new SigilError('Invalid --platforms.', {
          hint: errors.map(e => `  ✗  ${e}`).join('\n'),
        });
      }
      restrictedPlatforms = normalized;
    }
  }

  // ── Unified scaffolding (unchanged logic, now driven by effective* vars) ──
  const name = effectiveName ?? `new-${effectiveKind}`;
  const lang = effectiveLanguage ?? 'shared';
  const idPrefix = lang === 'shared' ? 'shared' : lang;
  const id = `${idPrefix}/${name}`;

  // Build the header from the schema-derived generator
  const header = headerFor(effectiveKind, {
    id,
    kind: effectiveKind,
    title: effectiveTitle ?? `TODO — ${name}`,
    description: effectiveDescription ?? 'TODO — one-line description used in catalog listings.',
    name: effectiveKind === 'skill' || effectiveKind === 'agent' ? name : undefined,
    language: lang !== 'shared' ? lang : undefined,
    platforms: restrictedPlatforms,
  });

  let outPath: string;

  if (effectiveKind === 'skill') {
    const dir =
      lang === 'shared'
        ? path.join(opts.catalogDir, 'shared', 'skills', name)
        : path.join(opts.catalogDir, 'languages', lang, 'skills', name);
    fs.mkdirSync(dir, { recursive: true });
    outPath = path.join(dir, 'SKILL.md');
  } else {
    const folder = `${effectiveKind}s`;
    const dir =
      lang === 'shared'
        ? path.join(opts.catalogDir, 'shared', folder)
        : path.join(opts.catalogDir, 'languages', lang, folder);
    fs.mkdirSync(dir, { recursive: true });
    outPath = path.join(dir, `${name}.${effectiveKind}.md`);
  }

  // Check for existing file
  if (fs.existsSync(outPath)) {
    throw new SigilError(`File already exists: ${outPath}`, {
      hint: '  Use a different --name, or delete the existing file first.',
    });
  }

  fs.writeFileSync(outPath, header, 'utf-8');
  console.log(`✓ Created: ${outPath}`);
  if (restrictedPlatforms) {
    console.log(
      `  platforms: [${restrictedPlatforms.join(', ')}]  (run: sigil retarget ${id} --to all to propagate to all AIs)`,
    );
  } else {
    console.log(
      `  platforms: all supporting AIs (DRY default — run: sigil retarget ${id} --add|remove <platform> to adjust)`,
    );
  }

  // ── Auto-validate the newly created file ─────────────────────────────────
  try {
    const catalog = await loadCatalog(opts.catalogDir);
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
  console.log(`  Next: fill in the body, then run: sigil check ${outPath}`);

  // ── Print equivalent non-interactive command (wizard path only) ──────────
  if (needsWizard) {
    const cmd = buildEquivalentNewCommand({
      kind: effectiveKind,
      name,
      language: effectiveLanguage,
      platforms: restrictedPlatforms,
    });
    printEquivalentCommand(cmd, isTTY);
  }
}
