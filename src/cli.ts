#!/usr/bin/env node
/**
 * maku-catalog CLI
 * Commands:
 *   build    — compile the catalog to dist/<target>/
 *   validate — schema + reference-graph checks (CI gate)
 *   list     — query the catalog
 *   add      — scaffold artifact(s) + their dependency closure into a consumer project
 *              Supports: individual IDs, `all`, `pack:<name>`, `kind:<kind>` selectors,
 *              --kind/--exclude/--language filters, --no-deps, --dry-run, --overwrite.
 *              Interactive guided installer when run with no selector in a TTY.
 *   init     — prepare a consumer project for a target platform
 *   new      — scaffold an authoring template for catalog contributors
 *   completion [bash|zsh|fish] — print shell tab-completion script
 */
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadCatalog } from './load';
import { validateCatalog } from './validate';
import { resolveCatalog } from './resolve';
import { getAllTargets, getTarget } from './targets';
import { resolveSelection } from './select';
import { isInteractiveTTY, runWizard, buildEquivalentCommand, printEquivalentCommand, printConflictAdvice, printSkippedAdvice } from './wizard';
import { checkOutputContract } from './targets/output-contract';
import { checkSourceArtifact } from './authoring/check-source';
import { headerFor } from './authoring/header';
import { addPlatforms, removePlatforms, setPlatforms } from './authoring/platforms';
import { artifactTargetsPlatform } from './select';
import type { FileMap, PacksConfig } from './types';

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'),
) as { version: string };

/**
 * The package root — the directory that contains catalog/, packs.yaml, schema/, etc.
 * All catalog-source defaults anchor here so the CLI works from any directory.
 * Consumer-project destinations (--project-dir) stay on process.cwd() separately.
 */
const PKG_ROOT = path.resolve(__dirname, '..');

const program = new Command();

program
  .name('maku-catalog')
  .description('Vendor-neutral AI skills, agents, and rules — compile to Claude Code, Copilot, and more.')
  .version(pkg.version);

// ─── build ────────────────────────────────────────────────────────────────────

program
  .command('build')
  .description('Compile the catalog to dist/<target>/.')
  .option(
    '--target <name>',
    `Which platform to emit. Options: ${getAllTargets().map(t => t.name).join(', ')}, all`,
    'all',
  )
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--out-dir <dir>', 'Output root directory', resolveDefault('dist'))
  .action(async (opts: {
    target: string;
    catalogDir: string;
    packs: string;
    outDir: string;
  }) => {
    const { catalog, packsConfig } = await loadAndValidate(opts.catalogDir, opts.packs);
    const resolved = resolveCatalog(catalog);

    const targets = opts.target === 'all'
      ? getAllTargets()
      : [getTarget(opts.target)];

    /** Filter a resolved catalog to only artifacts targeting a given platform. */
    const filterForTarget = (name: string) => {
      const filtered = resolved.artifacts.filter(a => artifactTargetsPlatform(a, name));
      return { ...resolved, artifacts: filtered, byId: new Map(filtered.map(a => [a.id, a])) };
    };

    const compileOpts = { version: pkg.version, packs: packsConfig.packs };

    for (const target of targets) {
      console.log(`\nBuilding target: ${target.name}`);
      const files = await target.compile(filterForTarget(target.name), compileOpts);

      // Output-conformance check: verify emitted file shapes match the target's contracts.
      const violations = checkOutputContract(files, target.outputContracts ?? []);
      if (violations.length > 0) {
        for (const v of violations) {
          console.error(`  ✗  [${v.label}] ${v.file}`);
          console.error(`       ${v.problem}`);
        }
        console.error(`\n✗ ${violations.length} output-conformance error(s) in target '${target.name}'. Fix the catalog source or adapter before shipping.`);
        process.exit(1);
      }

      writeFilesSync(files, path.join(opts.outDir, target.name), true);
      const count = Object.keys(files).length;
      console.log(`  ✓ ${count} file(s) written to dist/${target.name}/`);
    }
    console.log('\nBuild complete.');
  });

// ─── validate ─────────────────────────────────────────────────────────────────

program
  .command('validate')
  .description('Validate all catalog artifacts (schema + reference integrity). Exits non-zero on errors.')
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .action(async (opts: { catalogDir: string; packs: string }) => {
    console.log(`Validating catalog at: ${opts.catalogDir}`);
    const catalog = await loadCatalog(opts.catalogDir);
    const result = validateCatalog(catalog, getAllTargets());

    for (const w of result.warnings) console.warn(`  ⚠  ${w}`);
    for (const e of result.errors) {
      console.error(`  ✗  [${e.artifactId}] ${e.error}`);
      console.error(`     ${e.filePath}`);
    }

    if (result.valid) {
      console.log(`\n✓ All ${catalog.artifacts.length} artifact(s) are valid.`);
    } else {
      console.error(`\n✗ ${result.errors.length} error(s) found.`);
      process.exit(1);
    }
  });

// ─── list ─────────────────────────────────────────────────────────────────────

program
  .command('list')
  .description('List catalog artifacts, optionally filtered by language and/or kind.')
  .option('--language <lang>', 'Filter by language (e.g. csharp, python, react)')
  .option('--kind <kind>', 'Filter by kind (skill, agent, rule, prompt, workflow)')
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .action(async (opts: { language?: string; kind?: string; catalogDir: string }) => {
    const catalog = await loadCatalog(opts.catalogDir);

    let artifacts = catalog.artifacts;
    if (opts.language) {
      artifacts = artifacts.filter(
        a => (a.frontmatter.language as string | undefined) === opts.language,
      );
    }
    if (opts.kind) {
      artifacts = artifacts.filter(a => a.kind === opts.kind);
    }

    if (artifacts.length === 0) {
      console.log('No artifacts match the given filters.');
      return;
    }

    const byKind = new Map<string, typeof artifacts>();
    for (const a of artifacts) {
      const list = byKind.get(a.kind) ?? [];
      list.push(a);
      byKind.set(a.kind, list);
    }

    // `list` runs without a chosen target so it intentionally shows neutral catalog-kind
    // names (SKILL, AGENT, RULE, PROMPT) — not platform-specific terms like "command".
    for (const [kind, list] of byKind) {
      console.log(`\n${kind.toUpperCase()} (${list.length})`);
      for (const a of list) {
        const lang = (a.frontmatter.language as string | undefined);
        const langTag = lang ? ` [${lang}]` : '';
        console.log(`  ${a.id}${langTag} — ${a.frontmatter.description}`);
      }
    }
  });

// ─── add ──────────────────────────────────────────────────────────────────────

program
  .command('add [selectors...]')
  .description(
    'Scaffold one or more artifacts (+ their dependency closure) into a project.\n\n' +
    'Selector forms:\n' +
    '  skill:csharp/xunit-testing   — explicit artifact (kind-prefixed ID)\n' +
    '  csharp/xunit-testing         — bare artifact ID\n' +
    '  pack:dotnet-pack             — every artifact in a named pack\n' +
    '  kind:agent                   — every artifact of a given kind\n' +
    '  all                          — the entire catalog\n\n' +
    'Multiple selectors can be combined: add all pack:dotnet-pack kind:rule\n\n' +
    'Run with no selector in a TTY to launch the interactive guided installer.',
  )
  .option(
    '--target <name>',
    'Target platform (auto-detected from project structure if omitted)',
  )
  .option('--project-dir <dir>', 'Consumer project root (destination)', process.cwd())
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option(
    '--kind <list>',
    'Comma-separated kinds to include (e.g. skill,agent). Applied after selector expansion.',
  )
  .option(
    '--exclude <list>',
    'Comma-separated kinds to exclude (e.g. prompt). Applied after selector expansion.',
  )
  .option('--language <lang>', 'Restrict to a specific language (e.g. csharp, python)')
  .option(
    '--no-deps',
    'Install selected artifact(s) without their dependency closure (rules/agents)',
  )
  .option('--dry-run', 'Preview what would be written without writing any files', false)
  .option('-i, --interactive', 'Force the interactive guided installer', false)
  .option(
    '--yes',
    'Non-interactive mode: skip the wizard, require explicit selectors. Safe for CI.',
    false,
  )
  .option('--overwrite', 'Replace existing files (default: warn and skip conflicts)', false)
  .action(async (selectors: string[], opts: {
    target?: string;
    projectDir: string;
    catalogDir: string;
    packs: string;
    kind?: string;
    exclude?: string;
    language?: string;
    deps: boolean;       // commander flips --no-deps to opts.deps = false
    dryRun: boolean;
    interactive: boolean;
    yes: boolean;
    overwrite: boolean;
  }) => {
    const { catalog, packsConfig } = await loadAndValidate(opts.catalogDir, opts.packs);
    const resolved = resolveCatalog(catalog);

    // ── Wizard vs flags dispatch ───────────────────────────────────────────
    const needsWizard = (selectors.length === 0 || opts.interactive) && !opts.yes;
    const isTTY = isInteractiveTTY();

    let effectiveSelectors = selectors;
    let effectiveTarget = opts.target;
    let effectiveIncludeDeps = opts.deps !== false;  // --no-deps sets opts.deps=false
    let effectiveOverwrite = opts.overwrite;
    let effectiveLanguage = opts.language;

    if (needsWizard) {
      if (!isTTY) {
        console.error(
          '✗ No selectors provided and stdin/stdout is not an interactive terminal.\n' +
          '  Provide at least one selector (e.g. `add all` or `add skill:csharp/xunit-testing`)\n' +
          '  or use --yes to confirm non-interactive mode.\n\n' +
          '  Available selectors:\n' +
          '    all                         install the full catalog\n' +
          '    pack:<name>                 install a named pack\n' +
          '    kind:<kind>                 install all of a kind (skill/agent/rule/prompt)\n' +
          '    <kind>:<id>                 install a specific artifact\n\n' +
          '  Run `maku-catalog list` to browse available artifacts.',
        );
        process.exit(1);
      }

      const detectedTarget = detectProjectTarget(opts.projectDir, { verbose: false });
      const wizardResult = await runWizard(resolved, packsConfig.packs, detectedTarget);
      if (!wizardResult) return; // user cancelled

      effectiveSelectors = wizardResult.selectors;
      effectiveTarget = wizardResult.target;
      effectiveIncludeDeps = wizardResult.includeDeps;
      effectiveOverwrite = wizardResult.overwrite;
      // Language from wizard takes precedence over --language flag; flag overrides wizard if
      // used with -i / --interactive.
      effectiveLanguage = wizardResult.language ?? opts.language;
    }

    // ── Target resolution ──────────────────────────────────────────────────
    const targetName = effectiveTarget ?? detectProjectTarget(opts.projectDir, { verbose: true });
    const target = getTarget(targetName);

    if (!target.scaffold) {
      console.error(`✗ Target '${targetName}' does not support the add command.`);
      process.exit(1);
    }

    // ── Selection + filtering ──────────────────────────────────────────────
    const effectiveKinds = opts.kind?.split(',').map(k => k.trim()).filter(Boolean);
    const effectiveExclude = opts.exclude?.split(',').map(k => k.trim()).filter(Boolean);

    const filters = {
      kinds: effectiveKinds,
      exclude: effectiveExclude,
      language: effectiveLanguage,
    };

    let ids: string[];
    let skipped: Array<{ id: string; kind: string; reason: string }>;

    try {
      const result = resolveSelection(
        effectiveSelectors,
        filters,
        resolved,
        packsConfig.packs,
        target.supportedKinds ?? [],
        targetName,
      );
      ids = result.ids;
      skipped = result.skipped;
    } catch (err) {
      console.error(`✗ ${(err as Error).message}`);
      process.exit(1);
    }

    printSkippedAdvice(skipped, target);

    if (ids.length === 0) {
      console.log('No artifacts to install (all were filtered out or unsupported).');
      return;
    }

    // ── Collect files from scaffold for all selected IDs ───────────────────
    const scaffoldOpts = {
      projectDir: opts.projectDir,
      overwrite: effectiveOverwrite,
      includeDeps: effectiveIncludeDeps,
    };

    // Pre-compute the primary file paths (no deps) so we can tag dependency files
    // in the listing. Only needed when deps are included; cheap since catalog is small.
    const primaryPaths = new Set<string>();
    if (effectiveIncludeDeps) {
      const primaryScaffoldOpts = { ...scaffoldOpts, includeDeps: false };
      for (const id of ids) {
        try {
          const pFiles = await target.scaffold!(id, resolved, primaryScaffoldOpts);
          for (const k of Object.keys(pFiles)) primaryPaths.add(k);
        } catch { /* ignore — the main loop below will surface real errors */ }
      }
    }

    const allFiles: FileMap = {};
    for (const id of ids) {
      try {
        const files = await target.scaffold!(id, resolved, scaffoldOpts);
        Object.assign(allFiles, files);
      } catch (err) {
        console.error(`✗ Failed to scaffold '${id}': ${(err as Error).message}`);
        process.exit(1);
      }
    }

    // ── Output-conformance check ───────────────────────────────────────────
    // Validate emitted file shapes before writing anything to disk.
    const violations = checkOutputContract(allFiles, target.outputContracts ?? []);
    if (violations.length > 0) {
      for (const v of violations) {
        console.error(`  ✗  [${v.label}] ${v.file}`);
        console.error(`       ${v.problem}`);
      }
      console.error(`\n✗ ${violations.length} output-conformance error(s). Install aborted — no files were written.`);
      process.exit(1);
    }

    // ── Conflict detection ─────────────────────────────────────────────────
    const { toWrite, conflicting } = partitionFiles(allFiles, opts.projectDir);

    if (opts.dryRun) {
      console.log('\nDry run — files that would be written:');
      const toWritePaths = Object.keys(toWrite);
      const conflictPaths = Object.keys(conflicting);
      for (const f of toWritePaths)   console.log(`  + ${f}`);
      for (const f of conflictPaths)  console.log(`  ~ ${f}  (exists — would be overwritten with --overwrite)`);
      console.log(
        `\n${toWritePaths.length} new, ${conflictPaths.length} conflict(s). No files were written.`,
      );
      return;
    }

    // ── Write new files ────────────────────────────────────────────────────
    writeFilesSync(toWrite, opts.projectDir, true);

    // ── Handle conflicts ───────────────────────────────────────────────────
    let overwrittenCount = 0;
    const conflictPaths = Object.keys(conflicting);

    if (conflictPaths.length > 0) {
      if (effectiveOverwrite) {
        writeFilesSync(conflicting, opts.projectDir, true);
        overwrittenCount = conflictPaths.length;
      } else {
        printConflictAdvice(conflictPaths, targetName);
      }
    }

    // ── Summary ───────────────────────────────────────────────────────────
    const written = Object.keys(toWrite).length + overwrittenCount;
    const skippedConflict = effectiveOverwrite ? 0 : conflictPaths.length;

    console.log(
      `\n✓ ${written} file(s) written to ${opts.projectDir}` +
      (skippedConflict > 0 ? `, ${skippedConflict} skipped (conflicts)` : '') +
      (skipped.length > 0 ? `, ${skipped.length} artifact(s) not supported by '${targetName}'` : ''),
    );

    if (written > 0) {
      // Tag files that came from the dependency closure, not from the user's selection directly.
      const isDep = (f: string) => primaryPaths.size > 0 && !primaryPaths.has(f);
      for (const f of Object.keys(toWrite)) {
        console.log(`  ${f}${isDep(f) ? '  (dependency)' : ''}`);
      }
      if (overwrittenCount > 0) {
        for (const f of conflictPaths) {
          console.log(`  ${f}  (overwritten)${isDep(f) ? '  (dependency)' : ''}`);
        }
      }
      // Explain dependency files so users aren't surprised by "extra" artifacts.
      const depCount = [
        ...Object.keys(toWrite),
        ...(overwrittenCount > 0 ? conflictPaths : []),
      ].filter(isDep).length;
      if (depCount > 0) {
        console.log(
          `\n  (${depCount} dependency file${depCount !== 1 ? 's' : ''} pulled in via uses: references` +
          ` — re-run with --no-deps to install selected artifacts only)`,
        );
      }
    }

    // Print a copy-pasteable command to reproduce this install non-interactively.
    // Appears once here (boxed in a TTY, plain text in CI) — not in the wizard plan box.
    printEquivalentCommand(
      buildEquivalentCommand({
        selectors: effectiveSelectors,
        target: targetName,
        language: effectiveLanguage,
        kinds: effectiveKinds,
        exclude: effectiveExclude,
        includeDeps: effectiveIncludeDeps,
        overwrite: effectiveOverwrite,
      }),
      isInteractiveTTY(),
    );
  });

// ─── init ─────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Prepare a consumer project for a target platform.')
  .requiredOption('--target <name>', 'Target platform: claude or copilot')
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .action((opts: { target: string; projectDir: string }) => {
    switch (opts.target) {
      case 'claude': {
        const dirs = ['.claude/skills', '.claude/rules', '.claude/agents', '.claude/commands'];
        for (const dir of dirs) {
          const full = path.join(opts.projectDir, dir);
          fs.mkdirSync(full, { recursive: true });
          console.log(`  created ${dir}/`);
        }
        console.log('\n✓ Claude Code project structure initialised.');
        console.log('  Next: maku-catalog add  (interactive) or  maku-catalog add skill:<language>/<name>');
        break;
      }
      case 'copilot': {
        const dirs = ['.github/instructions', '.github/prompts', '.github/agents'];
        for (const dir of dirs) {
          const full = path.join(opts.projectDir, dir);
          fs.mkdirSync(full, { recursive: true });
          console.log(`  created ${dir}/`);
        }
        console.log('\n✓ GitHub Copilot project structure initialised.');
        console.log('  Next: maku-catalog add --target copilot  (interactive) or  maku-catalog add skill:<language>/<name> --target copilot');
        break;
      }
      default:
        console.error(`✗ Unknown target '${opts.target}'. Valid options: claude, copilot`);
        process.exit(1);
    }
  });

// ─── new ──────────────────────────────────────────────────────────────────────

program
  .command('new <kind>')
  .description('Scaffold an authoring template for a new catalog artifact.')
  .option('--language <lang>', 'Language (e.g. csharp, python, react)')
  .option('--name <name>', 'Artifact name (kebab-case)')
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--platforms <list>', 'Comma-separated target platforms to restrict to (e.g. claude,copilot). Omit for all (DRY default).')
  .action(async (kind: string, opts: { language?: string; name?: string; catalogDir: string; platforms?: string }) => {
    const validKinds = ['skill', 'agent', 'rule', 'prompt', 'workflow'];
    if (!validKinds.includes(kind)) {
      console.error(`✗ Unknown kind '${kind}'. Valid kinds: ${validKinds.join(', ')}`);
      process.exit(1);
    }

    const name = opts.name ?? `new-${kind}`;
    const lang = opts.language ?? 'shared';
    const idPrefix = lang === 'shared' ? 'shared' : lang;
    const id = `${idPrefix}/${name}`;

    // Parse platforms restriction (absent = all supporting targets)
    let restrictedPlatforms: string[] | undefined;
    if (opts.platforms) {
      const requestedPlatforms = opts.platforms.split(',').map(p => p.trim()).filter(Boolean);
      const targets = getAllTargets();
      const { platforms: normalized, errors } = setPlatforms(kind, requestedPlatforms, targets);
      if (errors.length > 0) {
        for (const e of errors) console.error(`  ✗  ${e}`);
        process.exit(1);
      }
      restrictedPlatforms = normalized;
    }

    // Build the header from the schema-derived generator
    const header = headerFor(kind, {
      id,
      kind,
      title: `TODO — ${name}`,
      description: 'TODO — one-line description used in catalog listings.',
      name: (kind === 'skill' || kind === 'agent') ? name : undefined,
      language: lang !== 'shared' ? lang : undefined,
      platforms: restrictedPlatforms,
    });

    let outPath: string;

    if (kind === 'skill') {
      const dir = lang === 'shared'
        ? path.join(opts.catalogDir, 'shared', 'skills', name)
        : path.join(opts.catalogDir, 'languages', lang, 'skills', name);
      fs.mkdirSync(dir, { recursive: true });
      outPath = path.join(dir, 'SKILL.md');
    } else {
      const folder = `${kind}s`;
      const dir = lang === 'shared'
        ? path.join(opts.catalogDir, 'shared', folder)
        : path.join(opts.catalogDir, 'languages', lang, folder);
      fs.mkdirSync(dir, { recursive: true });
      outPath = path.join(dir, `${name}.${kind}.md`);
    }

    // Check for existing file
    if (fs.existsSync(outPath)) {
      console.error(`✗ File already exists: ${outPath}`);
      console.error('  Use a different --name, or delete the existing file first.');
      process.exit(1);
    }

    fs.writeFileSync(outPath, header, 'utf-8');
    console.log(`✓ Created: ${outPath}`);
    if (restrictedPlatforms) {
      console.log(`  platforms: [${restrictedPlatforms.join(', ')}]  (run: maku-catalog retarget ${id} --to all to propagate to all AIs)`);
    } else {
      console.log(`  platforms: all supporting AIs (DRY default — edit frontmatter or run: maku-catalog retarget ${id} --add|remove <platform> to adjust)`);
    }
    console.log(`  Fill in the title, description, and body, then run: maku-catalog check ${outPath}`);
  });

// ─── check ────────────────────────────────────────────────────────────────────

program
  .command('check [files...]')
  .description(
    'Validate one or more catalog source artifact files against schema + source conventions.\n\n' +
    'Checks: zod schema, id↔path↔language consistency, kebab-case names,\n' +
    'duplicate ids, reference integrity, valid platforms: values, and dependency coverage drift.\n\n' +
    'Exits non-zero when any violation is found.\n\n' +
    'Examples:\n' +
    '  maku-catalog check catalog/languages/csharp/skills/xunit-testing/SKILL.md\n' +
    '  maku-catalog check catalog/shared/rules/clean-code.rule.md\n' +
    '  maku-catalog check catalog/  # check all artifacts in a directory',
  )
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--schema-only', 'Only run zod schema validation (skip path/id/reference checks)', false)
  .action(async (files: string[], opts: { catalogDir: string; schemaOnly: boolean }) => {
    // Load the full catalog for reference-integrity and dup-id checks
    const catalog = await loadCatalog(opts.catalogDir);
    const targets = getAllTargets();

    // Normalize path separators (fast-glob returns forward slashes; path.resolve returns OS-native)
    const normPath = (p: string) => p.replace(/\\/g, '/');

    // Resolve which files to check
    let filesToCheck: string[] = files;
    if (filesToCheck.length === 0) {
      console.error('✗ No files specified. Pass file path(s) as arguments.');
      console.error('  Example: maku-catalog check catalog/languages/csharp/skills/xunit-testing/SKILL.md');
      process.exit(1);
    }

    // Expand directories to all artifact files within them
    const expandedFiles: string[] = [];
    for (const f of filesToCheck) {
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
        const resolvedDir = normPath(path.resolve(f));
        const found = catalog.artifacts
          .filter(a => normPath(a.filePath).startsWith(resolvedDir))
          .map(a => a.filePath);
        expandedFiles.push(...found);
      } else {
        expandedFiles.push(path.resolve(f));
      }
    }

    let totalViolations = 0;
    let checkedCount = 0;

    for (const filePath of expandedFiles) {
      // Find this artifact in the loaded catalog (normalize separators for Windows compat)
      const artifact = catalog.artifacts.find(a => normPath(a.filePath) === normPath(filePath));
      if (!artifact) {
        console.warn(`  ⚠  ${filePath}: not found in catalog (not a recognized artifact file?)`);
        continue;
      }

      const violations = checkSourceArtifact(artifact, catalog, targets, { schemaOnly: opts.schemaOnly });
      checkedCount++;

      if (violations.length === 0) {
        console.log(`  ✓  ${artifact.id}  (${path.relative(process.cwd(), filePath)})`);
      } else {
        console.error(`  ✗  ${artifact.id}  (${path.relative(process.cwd(), filePath)})`);
        for (const viol of violations) {
          console.error(`       ${viol.problem}`);
        }
        totalViolations += violations.length;
      }
    }

    if (checkedCount === 0) {
      console.warn('  ⚠  No artifact files found to check.');
      return;
    }

    console.log(`\n${totalViolations === 0 ? '✓' : '✗'} ${checkedCount} artifact(s) checked, ${totalViolations} violation(s) found.`);
    if (totalViolations > 0) process.exit(1);
  });

// ─── retarget ─────────────────────────────────────────────────────────────────

program
  .command('retarget <id>')
  .description(
    'Change the platform targeting of an existing catalog artifact without touching its body.\n\n' +
    'DRY lifecycle: an artifact starts targeting all AIs (no platforms: field). Use retarget\n' +
    'to restrict it, expand it, or reset it — body and content never changes.\n\n' +
    'Normalization rule: when the set reaches all kind-supporting targets, the platforms:\n' +
    'field is automatically removed (= neutral auto-propagate, back to DRY default).\n\n' +
    'Examples:\n' +
    '  maku-catalog retarget csharp/xunit-testing --add copilot\n' +
    '  maku-catalog retarget shared/explain-diff --remove claude\n' +
    '  maku-catalog retarget csharp/dotnet-style --to all      # reset to all AIs\n' +
    '  maku-catalog retarget csharp/dotnet-style --to claude   # restrict to Claude only',
  )
  .option('--add <platforms>', 'Comma-separated platforms to add to the targeting set')
  .option('--remove <platforms>', 'Comma-separated platforms to remove from the targeting set')
  .option('--to <platforms>', 'Set the targeting to exactly these platforms (comma-separated), or "all" to reset')
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--yes', 'Skip confirmation prompt', false)
  .option('--with-deps', 'Also apply the same targeting change to the artifact\'s uses: closure (rules/agents)', false)
  .action(async (id: string, opts: {
    add?: string;
    remove?: string;
    to?: string;
    catalogDir: string;
    yes: boolean;
    withDeps: boolean;
  }) => {
    if (!opts.add && !opts.remove && !opts.to) {
      console.error('✗ Specify at least one of: --add, --remove, --to');
      process.exit(1);
    }
    if ((opts.add ? 1 : 0) + (opts.remove ? 1 : 0) + (opts.to ? 1 : 0) > 1) {
      console.error('✗ Use only one of --add, --remove, or --to per invocation.');
      process.exit(1);
    }

    const catalog = await loadCatalog(opts.catalogDir);
    const targets = getAllTargets();

    const artifact = catalog.byId.get(id);
    if (!artifact) {
      const available = catalog.artifacts.map(a => a.id).join(', ');
      console.error(`✗ Artifact '${id}' not found. Available: ${available || '(none)'}`);
      process.exit(1);
    }

    const kind = artifact.kind;
    const currentPlatforms = artifact.frontmatter.platforms as string[] | undefined;
    let mutResult: { platforms: string[] | undefined; noOp: boolean; errors: string[]; warnings: string[] };

    if (opts.to) {
      const toVal = opts.to === 'all' ? undefined : opts.to.split(',').map(p => p.trim()).filter(Boolean);
      mutResult = setPlatforms(kind, toVal, targets);
    } else if (opts.add) {
      const toAdd = opts.add.split(',').map(p => p.trim()).filter(Boolean);
      mutResult = addPlatforms(kind, currentPlatforms, toAdd, targets);
    } else {
      const toRemove = opts.remove!.split(',').map(p => p.trim()).filter(Boolean);
      mutResult = removePlatforms(kind, currentPlatforms, toRemove, targets);
    }

    // Print warnings
    for (const w of mutResult.warnings) console.warn(`  ⚠  ${w}`);

    // Fail on errors
    if (mutResult.errors.length > 0) {
      for (const e of mutResult.errors) console.error(`  ✗  ${e}`);
      process.exit(1);
    }

    if (mutResult.noOp) {
      console.log(`  → No change to ${id} (already at the requested state).`);
      return;
    }

    // Read the current file
    const matter = await import('gray-matter');
    const raw = fs.readFileSync(artifact.filePath, 'utf-8');
    const parsed = matter.default(raw);

    // Update or remove the platforms field
    if (mutResult.platforms === undefined) {
      delete parsed.data.platforms;
    } else {
      parsed.data.platforms = mutResult.platforms;
    }

    // Stringify back — preserve body
    const newFrontmatter = Object.entries(parsed.data)
      .map(([k, val]) => {
        if (Array.isArray(val)) {
          return `${k}:\n${(val as unknown[]).map(item => {
            if (typeof item === 'object' && item !== null) {
              return Object.entries(item as Record<string,unknown>).map(([ik, iv]) => `    ${ik}: ${iv}`).join('\n');
            }
            return `  - ${item}`;
          }).join('\n')}`;
        }
        if (typeof val === 'object' && val !== null) {
          const objLines = Object.entries(val as Record<string, unknown>).map(([ik, iv]) => `  ${ik}: ${iv}`).join('\n');
          return `${k}:\n${objLines}`;
        }
        if (typeof val === 'string' && (val.includes('\n') || val.includes(':'))) {
          return `${k}: "${val.replace(/"/g, '\\"')}"`;
        }
        return `${k}: ${val}`;
      })
      .join('\n');

    const newContent = `---\n${newFrontmatter}\n---${parsed.content}`;
    fs.writeFileSync(artifact.filePath, newContent, 'utf-8');

    const newLabel = mutResult.platforms === undefined
      ? 'all supporting AIs (DRY default — platforms: field removed)'
      : `[${mutResult.platforms.join(', ')}]`;
    console.log(`✓ ${id}: platforms updated → ${newLabel}`);
    console.log(`  File: ${artifact.filePath}`);

    // Validate the changed artifact
    const updatedCatalog = await loadCatalog(opts.catalogDir);
    const updatedArtifact = updatedCatalog.byId.get(id);
    if (updatedArtifact) {
      const violations = checkSourceArtifact(updatedArtifact, updatedCatalog, targets);
      if (violations.length > 0) {
        console.warn('  ⚠  Post-retarget validation warnings:');
        for (const viol of violations) console.warn(`     ${viol.problem}`);
      }
    }

    if (mutResult.platforms === undefined) {
      console.log(`\n  → Next: maku-catalog build  (will now emit to all supporting platforms)`);
    } else {
      console.log(`\n  → Next: maku-catalog build  (or: maku-catalog retarget ${id} --to all to widen back)`);
    }

    console.log('  ℹ  Consumers who already ran \'add\' must re-run it to pick up the changed targeting.');
  });

// ─── completion ───────────────────────────────────────────────────────────────

program
  .command('completion [shell]')
  .description('Print a shell tab-completion script. Source it to enable `add <Tab>` completions.\n' +
    '  Shells: bash (default), zsh, fish\n\n' +
    '  Usage:\n' +
    '    eval "$(maku-catalog completion)"            # bash (add to ~/.bashrc)\n' +
    '    eval "$(maku-catalog completion zsh)"        # zsh  (add to ~/.zshrc)\n' +
    '    maku-catalog completion fish | source        # fish')
  .action((shell = 'bash') => {
    const binPath = process.argv[1];

    switch (shell) {
      case 'bash':
        console.log(buildBashCompletion(binPath));
        break;
      case 'zsh':
        console.log(buildZshCompletion(binPath));
        break;
      case 'fish':
        console.log(buildFishCompletion(binPath));
        break;
      default:
        console.error(`✗ Unknown shell '${shell}'. Valid options: bash, zsh, fish`);
        process.exit(1);
    }
  });

// ─── __complete (hidden — called by completion scripts) ───────────────────────

program
  .command('__complete', { hidden: true })
  .argument('[word]', 'Current word being completed', '')
  .option('--prev <value>', 'Previous word/flag on the command line', '')
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .action(async (word: string, opts: { prev: string; catalogDir: string; packs: string }) => {
    const prev = opts.prev ?? '';

    // Flag-value completions
    if (prev === '--target') { process.stdout.write('claude\ncopilot\n'); return; }
    if (prev === '--kind' || prev === '--exclude') {
      process.stdout.write('skill\nagent\nrule\nprompt\nworkflow\n');
      return;
    }

    const catalog = await loadCatalog(opts.catalogDir).catch(() => null);
    const packsConfig = fs.existsSync(opts.packs)
      ? (yaml.load(fs.readFileSync(opts.packs, 'utf-8')) as PacksConfig)
      : { packs: [] };

    if (prev === '--language' && catalog) {
      process.stdout.write([...catalog.languages.keys()].join('\n') + '\n');
      return;
    }

    // Completions for the `add` command selectors
    const completions: string[] = ['all'];

    // pack: completions
    for (const pack of packsConfig.packs) {
      completions.push(`pack:${pack.name}`);
    }

    // kind: completions
    completions.push('kind:skill', 'kind:agent', 'kind:rule', 'kind:prompt', 'kind:workflow');

    // artifact IDs
    if (catalog) {
      for (const a of catalog.artifacts) {
        completions.push(`${a.kind}:${a.id}`);
      }
    }

    const filtered = completions.filter(c => !word || c.startsWith(word));
    process.stdout.write(filtered.join('\n') + '\n');
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves a catalog-source default path against the package root.
 * This ensures `--catalog-dir`, `--packs`, and `--out-dir` defaults always point at
 * the installed package regardless of the caller's working directory.
 */
function resolveDefault(relative: string): string {
  return path.resolve(PKG_ROOT, relative);
}

async function loadAndValidate(
  catalogDir: string,
  packsFile: string,
): Promise<{ catalog: Awaited<ReturnType<typeof loadCatalog>>; packsConfig: PacksConfig }> {
  const catalog = await loadCatalog(catalogDir);
  const result = validateCatalog(catalog);

  if (!result.valid) {
    for (const e of result.errors) {
      console.error(`  ✗  [${e.artifactId}] ${e.error}`);
    }
    console.error('\nCatalog has validation errors. Fix them before building.');
    process.exit(1);
  }

  const packsRaw = fs.readFileSync(packsFile, 'utf-8');
  const packsConfig = yaml.load(packsRaw) as PacksConfig;
  return { catalog, packsConfig };
}

/**
 * Writes a FileMap to outputDir, creating parent directories as needed.
 * Always overwrites (caller is responsible for calling partitionFiles first).
 */
function writeFilesSync(files: FileMap, outputDir: string, _overwrite = true): void {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(outputDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
}

/**
 * Partitions a FileMap into files that don't exist yet (toWrite) and files that
 * would conflict with existing content (conflicting).
 */
function partitionFiles(
  files: FileMap,
  outputDir: string,
): { toWrite: FileMap; conflicting: FileMap } {
  const toWrite: FileMap = {};
  const conflicting: FileMap = {};

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(outputDir, relPath);
    if (fs.existsSync(fullPath)) {
      conflicting[relPath] = content;
    } else {
      toWrite[relPath] = content;
    }
  }

  return { toWrite, conflicting };
}

/**
 * Detects the target platform from the consumer project structure.
 * Falls back to 'claude' (most common default).
 * When verbose, prints the detected target and how to override it.
 */
function detectProjectTarget(
  projectDir: string,
  opts: { verbose: boolean } = { verbose: false },
): string {
  const hasClaude  = fs.existsSync(path.join(projectDir, '.claude'));
  const hasCopilot = fs.existsSync(path.join(projectDir, '.github'));

  let detected: string;
  let reason: string;

  if (hasClaude && hasCopilot) {
    detected = 'claude';
    reason = 'both .claude/ and .github/ exist; defaulting to claude';
  } else if (hasClaude) {
    detected = 'claude';
    reason = '.claude/ directory found';
  } else if (hasCopilot) {
    detected = 'copilot';
    reason = '.github/ directory found';
  } else {
    detected = 'claude';
    reason = 'no .claude/ or .github/ found; defaulting to claude';
  }

  if (opts.verbose) {
    console.log(`  target: ${detected}  (${reason})`);
    console.log('  Override with --target claude|copilot if needed.');
  }

  return detected;
}

/** Returns a template file body for the `new` command. */
function buildTemplate(
  kind: string,
  id: string,
  name: string,
  language: string,
): string {
  const base = [
    '---',
    `id: ${id}`,
    `kind: ${kind}`,
    `title: TODO — ${name}`,
    `description: TODO — one-line description used in catalog listings.`,
    `tags: []`,
  ];

  switch (kind) {
    case 'skill':
      return [
        ...base,
        `name: ${name}`,
        `language: ${language}`,
        `appliesTo:`,
        `  - "**/*"`,
        `uses:`,
        `  rules: []`,
        `  agents: []`,
        '---',
        '',
        '# TODO — Skill title',
        '',
        'Describe what the AI should do when this skill is invoked.',
      ].join('\n') + '\n';

    case 'rule':
      return [
        ...base,
        `language: ${language === 'shared' ? '# omit for cross-language rules' : language}`,
        `appliesTo:`,
        `  - "**/*"`,
        `severity: recommended`,
        `extends: []  # reference parent rule IDs for DRY inheritance`,
        '---',
        '',
        '- TODO — Add rule bullets here.',
      ].join('\n') + '\n';

    case 'agent':
      return [
        ...base,
        `name: ${name}`,
        ...(language !== 'shared' ? [`language: ${language}`] : []),
        `claude:`,
        `  model: sonnet`,
        `  effort: medium`,
        `  maxTurns: 10`,
        '---',
        '',
        'You are TODO. When invoked:',
        '',
        '1. TODO',
      ].join('\n') + '\n';

    case 'prompt':
      return [
        ...base,
        `args: []`,
        '---',
        '',
        'TODO — prompt body.',
      ].join('\n') + '\n';

    default:
      return [...base, '---', '', 'TODO'].join('\n') + '\n';
  }
}

// ─── Shell completion scripts ──────────────────────────────────────────────────

function buildBashCompletion(binPath: string): string {
  return `# maku-catalog bash completion
# Add to ~/.bashrc: eval "$(maku-catalog completion)"
_maku_catalog_completions() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local IFS=$'\\n'
  COMPREPLY=( $(node "${binPath}" __complete "$cur" --prev "$prev" 2>/dev/null) )
  return 0
}
complete -F _maku_catalog_completions maku-catalog`;
}

function buildZshCompletion(binPath: string): string {
  return `# maku-catalog zsh completion
# Add to ~/.zshrc: eval "$(maku-catalog completion zsh)"
_maku_catalog() {
  local -a completions
  completions=( "\${(@f)$(node "${binPath}" __complete "\${words[-1]}" --prev "\${words[-2]}" 2>/dev/null)}" )
  compadd -a completions
}
compdef _maku_catalog maku-catalog`;
}

function buildFishCompletion(binPath: string): string {
  return `# maku-catalog fish completion
# Usage: maku-catalog completion fish | source
complete -c maku-catalog -f
complete -c maku-catalog -n '__fish_seen_subcommand_from add' -a "(node ${binPath} __complete (commandline -ct) --prev (commandline -ct | string split ' ' | tail -n2 | head -n1) 2>/dev/null)"`;
}

program.parse(process.argv);
