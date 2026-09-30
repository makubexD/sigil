/**
 * `sigil patch` command — business logic.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 * `cli.ts` keeps only the option declarations and wires `.action(runPatch)`.
 *
 * Alias: `sigil edit` (title/description/tags subset) and `sigil retarget`
 * (platforms subset) both delegate here via the same option flags.
 *
 * @module
 */

import { loadCatalog } from '../load';
import { getAllTargets } from '../targets';
import { checkSourceArtifact } from '../authoring/check-source';
import { writeArtifactFrontmatter } from '../authoring/frontmatter';
import { addPlatforms, removePlatforms, setPlatforms } from '../authoring/platforms';
import { buildFieldPatch, getEditableFields } from '../authoring/update';
import { resolveDefault } from '../cli-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatchOpts {
  catalogDir: string;
  yes: boolean;
  title?: string;
  description?: string;
  version?: string;
  addTag?: string;
  removeTag?: string;
  setTags?: string;
  addAppliesTo?: string;
  removeAppliesTo?: string;
  setAppliesTo?: string;
  severity?: string;
  addExtends?: string;
  removeExtends?: string;
  setExtends?: string;
  addUsesRule?: string;
  removeUsesRule?: string;
  setUsesRules?: string;
  addUsesAgent?: string;
  removeUsesAgent?: string;
  setUsesAgents?: string;
  addTool?: string;
  removeTool?: string;
  setTools?: string;
  addDisallowedTool?: string;
  removeDisallowedTool?: string;
  setDisallowedTools?: string;
  claudeModel?: string;
  claudeEffort?: string;
  claudeMaxTurns?: number;
  claudeIsolation?: string;
  addPlatform?: string;
  removePlatform?: string;
  toPlatforms?: string;
}

// ─── Command function ─────────────────────────────────────────────────────────

export async function runPatch(id: string, opts: PatchOpts): Promise<void> {
  // resolveDefault is used for the --catalog-dir default; already applied by Commander.
  void resolveDefault; // imported for documentation — default is set in cli.ts option declaration

  const catalog = await loadCatalog(opts.catalogDir);
  const targets = getAllTargets();

  const artifact = catalog.byId.get(id);
  if (!artifact) {
    const available = catalog.artifacts.map(a => a.id).join(', ');
    console.error(`✗ Artifact '${id}' not found. Available: ${available || '(none)'}`);
    process.exit(1);
  }

  // ── Build UpdateOps from CLI flags ─────────────────────────────────────────
  const splitList = (s?: string): string[] | undefined =>
    s !== undefined
      ? s
          .split(',')
          .map(x => x.trim())
          .filter(Boolean)
      : undefined;

  const updateOps = {
    title: opts.title,
    description: opts.description,
    version: opts.version,
    addTags: opts.addTag ? [opts.addTag] : undefined,
    removeTags: opts.removeTag ? [opts.removeTag] : undefined,
    setTags: splitList(opts.setTags),
    addAppliesTo: opts.addAppliesTo ? [opts.addAppliesTo] : undefined,
    removeAppliesTo: opts.removeAppliesTo ? [opts.removeAppliesTo] : undefined,
    setAppliesTo: splitList(opts.setAppliesTo),
    severity: opts.severity,
    addExtends: opts.addExtends ? [opts.addExtends] : undefined,
    removeExtends: opts.removeExtends ? [opts.removeExtends] : undefined,
    setExtends: splitList(opts.setExtends),
    addUsesRules: opts.addUsesRule ? [opts.addUsesRule] : undefined,
    removeUsesRules: opts.removeUsesRule ? [opts.removeUsesRule] : undefined,
    setUsesRules: splitList(opts.setUsesRules),
    addUsesAgents: opts.addUsesAgent ? [opts.addUsesAgent] : undefined,
    removeUsesAgents: opts.removeUsesAgent ? [opts.removeUsesAgent] : undefined,
    setUsesAgents: splitList(opts.setUsesAgents),
    addTools: opts.addTool ? [opts.addTool] : undefined,
    removeTools: opts.removeTool ? [opts.removeTool] : undefined,
    setTools: splitList(opts.setTools),
    addDisallowedTools: opts.addDisallowedTool ? [opts.addDisallowedTool] : undefined,
    removeDisallowedTools: opts.removeDisallowedTool ? [opts.removeDisallowedTool] : undefined,
    setDisallowedTools: splitList(opts.setDisallowedTools),
    claudeModel: opts.claudeModel,
    claudeEffort: opts.claudeEffort,
    claudeMaxTurns: opts.claudeMaxTurns,
    claudeIsolation: opts.claudeIsolation,
  };

  const { patch, noOp, errors } = buildFieldPatch(artifact, updateOps);

  // ── Platform ops (delegates to platforms.ts set-math) ─────────────────────
  const platformPatch: Record<string, unknown> = {};
  let platformChanged = false;

  if (opts.addPlatform || opts.removePlatform || opts.toPlatforms) {
    const currentPlatforms = artifact.frontmatter.platforms as string[] | undefined;
    let mutResult: {
      platforms: string[] | undefined;
      noOp: boolean;
      errors: string[];
      warnings: string[];
    };

    if (opts.toPlatforms) {
      const toVal =
        opts.toPlatforms === 'all'
          ? undefined
          : opts.toPlatforms
              .split(',')
              .map(p => p.trim())
              .filter(Boolean);
      mutResult = setPlatforms(artifact.kind, toVal, targets);
    } else if (opts.addPlatform) {
      mutResult = addPlatforms(
        artifact.kind,
        currentPlatforms,
        opts.addPlatform
          .split(',')
          .map(p => p.trim())
          .filter(Boolean),
        targets,
      );
    } else {
      mutResult = removePlatforms(
        artifact.kind,
        currentPlatforms,
        opts
          .removePlatform!.split(',')
          .map(p => p.trim())
          .filter(Boolean),
        targets,
      );
    }

    for (const w of mutResult.warnings) console.warn(`  ⚠  ${w}`);
    if (mutResult.errors.length > 0) {
      for (const e of mutResult.errors) console.error(`  ✗  ${e}`);
      errors.push(...mutResult.errors);
    } else if (!mutResult.noOp) {
      platformPatch.platforms = mutResult.platforms;
      platformChanged = true;
    }
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
  }

  const effectivePatch = { ...patch, ...platformPatch };
  const effectiveNoOp = (noOp || Object.keys(patch).length === 0) && !platformChanged;

  // ── No-op: list editable fields when no flags were provided ───────────────
  if (effectiveNoOp) {
    console.log(`  → No changes to ${id}.`);

    const hasAnyOp = Object.values(updateOps).some(v => v !== undefined);
    if (!hasAnyOp && !opts.addPlatform && !opts.removePlatform && !opts.toPlatforms) {
      const fields = getEditableFields(artifact.kind);
      console.log(
        `\n  Editable fields for '${artifact.kind}': ${fields.map(f => f.field).join(', ')}`,
      );
      console.log('  Platforms: --add-platform, --remove-platform, --to-platforms');
    }
    return;
  }

  // ── Transactional apply: write → validate → rollback on error ─────────────
  if (Object.keys(effectivePatch).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const originalContent = require('fs').readFileSync(artifact.filePath, 'utf-8') as string;
    try {
      writeArtifactFrontmatter(artifact.filePath, effectivePatch);
    } catch (err) {
      console.error(`✗ Write failed: ${(err as Error).message}`);
      process.exit(1);
    }

    // Post-write validation — reload from disk so Zod sees the new content.
    const updatedCatalog = await loadCatalog(opts.catalogDir);
    const updatedArtifact = updatedCatalog.byId.get(id);
    if (updatedArtifact) {
      const violations = checkSourceArtifact(updatedArtifact, updatedCatalog, targets);
      const blocking = violations.filter(
        v =>
          !v.problem.includes('Dependency coverage drift') &&
          !v.problem.includes("won't be available"),
      );
      const warnings = violations.filter(
        v =>
          v.problem.includes('Dependency coverage drift') ||
          v.problem.includes("won't be available"),
      );

      if (blocking.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('fs').writeFileSync(artifact.filePath, originalContent, 'utf-8');
        console.error('✗ Patch rolled back — would break validation:');
        for (const v of blocking) console.error(`  ${v.problem}`);
        process.exit(1);
      }

      for (const w of warnings) console.warn(`  ⚠  ${w.problem}`);
    }

    console.log(`✓ Patched: ${artifact.filePath}`);
    console.log(`  Next: sigil check ${artifact.filePath}`);
  }
}
