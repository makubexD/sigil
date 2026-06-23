#!/usr/bin/env node
/**
 * sigil CLI
 * Commands:
 *   build      — compile the catalog to dist/<target>/
 *   validate   — schema + reference-graph checks (CI gate)
 *   list       — query the catalog
 *   add        — scaffold artifact(s) + their dependency closure into a consumer project
 *                Supports: individual IDs, `all`, `pack:<name>`, `kind:<kind>` selectors,
 *                --kind/--exclude/--language filters, --no-deps, --dry-run, --overwrite.
 *                Interactive guided installer when run with no selector in a TTY.
 *   init       — prepare a consumer project for a target platform
 *   new        — scaffold an authoring template for catalog contributors
 *   edit       — update artifact title, description, and tags
 *   delete     — remove an artifact from the catalog (alias: remove)
 *   release    — bump version, rebuild, update CHANGELOG, commit + tag for publishing
 *   completion [bash|zsh|fish] — print shell tab-completion script
 */
import { Command } from 'commander';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadCatalog } from './load';
import { validateCatalog } from './validate';
import { resolveCatalog } from './resolve';
import { getAllTargets, getTarget } from './targets';
import { resolveSelection } from './select';
import {
  isInteractiveTTY,
  runWizard,
  runNewWizard,
  runEditWizard,
  buildEquivalentCommand,
  buildEquivalentNewCommand,
  printEquivalentCommand,
  printConflictAdvice,
  printSkippedAdvice,
} from './wizard';
import { confirm, isCancel, cancel, note, log as clackLog } from '@clack/prompts';
import { checkOutputContract } from './targets/output-contract';
import { checkSourceArtifact } from './authoring/check-source';
import { headerFor } from './authoring/header';
import { writeArtifactFrontmatter } from './authoring/frontmatter';
import { bumpVersion, promoteChangelog } from './release';
import { addPlatforms, removePlatforms, setPlatforms } from './authoring/platforms';
import { artifactTargetsPlatform } from './select';
import type { FileMap, PacksConfig } from './types';

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')) as {
  version: string;
  homepage?: string;
};

/**
 * The package root — the directory that contains catalog/, packs.yaml, schema/, etc.
 * All catalog-source defaults anchor here so the CLI works from any directory.
 * Consumer-project destinations (--project-dir) stay on process.cwd() separately.
 */
const PKG_ROOT = path.resolve(__dirname, '..');

const program = new Command();

program
  .name('sigil')
  .description(
    'Vendor-neutral AI skills, agents, and rules — compile to Claude Code, Copilot, and more.',
  )
  .version(pkg.version);

// ─── build ────────────────────────────────────────────────────────────────────

program
  .command('build')
  .description('Compile the catalog to dist/<target>/.')
  .option(
    '--target <name>',
    `Which platform to emit. Options: ${getAllTargets()
      .map(t => t.name)
      .join(', ')}, all`,
    'all',
  )
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--out-dir <dir>', 'Output root directory', resolveDefault('dist'))
  .action(async (opts: { target: string; catalogDir: string; packs: string; outDir: string }) => {
    const { catalog, packsConfig } = await loadAndValidate(opts.catalogDir, opts.packs);
    const resolved = resolveCatalog(catalog);

    const targets = opts.target === 'all' ? getAllTargets() : [getTarget(opts.target)];

    /** Filter a resolved catalog to only artifacts targeting a given platform. */
    const filterForTarget = (name: string) => {
      const filtered = resolved.artifacts.filter(a => artifactTargetsPlatform(a, name));
      return { ...resolved, artifacts: filtered, byId: new Map(filtered.map(a => [a.id, a])) };
    };

    const compileOpts = { version: pkg.version, packs: packsConfig.packs, homepage: pkg.homepage };

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
        console.error(
          `\n✗ ${violations.length} output-conformance error(s) in target '${target.name}'. Fix the catalog source or adapter before shipping.`,
        );
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
  .description(
    'Validate all catalog artifacts (schema + reference integrity). Exits non-zero on errors.',
  )
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
        const lang = a.frontmatter.language as string | undefined;
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
  .option('--target <name>', 'Target platform (auto-detected from project structure if omitted)')
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
  .action(
    async (
      selectors: string[],
      opts: {
        target?: string;
        projectDir: string;
        catalogDir: string;
        packs: string;
        kind?: string;
        exclude?: string;
        language?: string;
        deps: boolean; // commander flips --no-deps to opts.deps = false
        dryRun: boolean;
        interactive: boolean;
        yes: boolean;
        overwrite: boolean;
      },
    ) => {
      const { catalog, packsConfig } = await loadAndValidate(opts.catalogDir, opts.packs);
      const resolved = resolveCatalog(catalog);

      // ── Wizard vs flags dispatch ───────────────────────────────────────────
      const needsWizard = (selectors.length === 0 || opts.interactive) && !opts.yes;
      const isTTY = isInteractiveTTY();

      let effectiveSelectors = selectors;
      let effectiveTarget = opts.target;
      let effectiveIncludeDeps = opts.deps !== false; // --no-deps sets opts.deps=false
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
              '  Run `sigil list` to browse available artifacts.',
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
      const effectiveKinds = opts.kind
        ?.split(',')
        .map(k => k.trim())
        .filter(Boolean);
      const effectiveExclude = opts.exclude
        ?.split(',')
        .map(k => k.trim())
        .filter(Boolean);

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
          } catch {
            /* ignore — the main loop below will surface real errors */
          }
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
        console.error(
          `\n✗ ${violations.length} output-conformance error(s). Install aborted — no files were written.`,
        );
        process.exit(1);
      }

      // ── Conflict detection ─────────────────────────────────────────────────
      const { toWrite, conflicting } = partitionFiles(allFiles, opts.projectDir);

      if (opts.dryRun) {
        console.log('\nDry run — files that would be written:');
        const toWritePaths = Object.keys(toWrite);
        const conflictPaths = Object.keys(conflicting);
        for (const f of toWritePaths) console.log(`  + ${f}`);
        for (const f of conflictPaths)
          console.log(`  ~ ${f}  (exists — would be overwritten with --overwrite)`);
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
          (skipped.length > 0
            ? `, ${skipped.length} artifact(s) not supported by '${targetName}'`
            : ''),
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
    },
  );

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
        console.log('  Next: sigil add  (interactive) or  sigil add skill:<language>/<name>');
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
        console.log(
          '  Next: sigil add --target copilot  (interactive) or  sigil add skill:<language>/<name> --target copilot',
        );
        break;
      }
      default:
        console.error(`✗ Unknown target '${opts.target}'. Valid options: claude, copilot`);
        process.exit(1);
    }
  });

// ─── new ──────────────────────────────────────────────────────────────────────

program
  .command('new [kind]')
  .description(
    'Scaffold an authoring template for a new catalog artifact.\n\n' +
      'When run with no arguments in an interactive terminal, launches a guided\n' +
      'wizard (kind → platforms → language → name/title/description → confirm).\n\n' +
      'Valid kinds: skill, agent, rule, prompt\n\n' +
      'Examples:\n' +
      '  sigil new                                  # guided wizard\n' +
      '  sigil new skill --name ef-core --language csharp --yes\n' +
      '  sigil new rule --name my-rule --platforms claude --yes',
  )
  .option(
    '--language <lang>',
    'Language (e.g. csharp, python, react). Omit for shared/cross-language.',
  )
  .option('--name <name>', 'Artifact name (kebab-case)')
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option(
    '--platforms <list>',
    'Comma-separated platforms to restrict to (e.g. claude,copilot). Omit for all (DRY default).',
  )
  .option('--yes', 'Non-interactive: skip wizard. Requires explicit kind and --name.')
  .option('-i, --interactive', 'Force the guided wizard even when kind is provided.')
  .action(
    async (
      kind: string | undefined,
      opts: {
        language?: string;
        name?: string;
        catalogDir: string;
        platforms?: string;
        yes?: boolean;
        interactive?: boolean;
      },
    ) => {
      const validKinds = ['skill', 'agent', 'rule', 'prompt', 'workflow'];
      const scaffoldableKinds = validKinds.filter(k => k !== 'workflow');

      // ── Wizard vs flags dispatch ────────────────────────────────────────────
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
          console.error(
            '✗ No kind provided and stdin/stdout is not an interactive terminal.\n' +
              `  Provide a kind: sigil new <kind> --name <name> --yes\n` +
              `  Valid kinds: ${scaffoldableKinds.join(', ')}\n\n` +
              '  Or run in an interactive terminal to use the guided wizard.',
          );
          process.exit(1);
        }
        // Load catalog for the wizard (language list + reference data)
        const rawCatalog = await loadCatalog(opts.catalogDir);
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
          console.error(
            '✗ No kind specified and --yes skips the wizard.\n' +
              `  Provide a kind: sigil new <kind> --name <name> --yes\n` +
              `  Valid kinds: ${scaffoldableKinds.join(', ')}`,
          );
          process.exit(1);
        }
        if (!validKinds.includes(effectiveKind)) {
          console.error(`✗ Unknown kind '${effectiveKind}'. Valid kinds: ${validKinds.join(', ')}`);
          process.exit(1);
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
            for (const e of errors) console.error(`  ✗  ${e}`);
            process.exit(1);
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
        description:
          effectiveDescription ?? 'TODO — one-line description used in catalog listings.',
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
        console.error(`✗ File already exists: ${outPath}`);
        console.error('  Use a different --name, or delete the existing file first.');
        process.exit(1);
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

      // ── Auto-validate the newly created file ──────────────────────────────
      try {
        const catalog = await loadCatalog(opts.catalogDir);
        const targets = getAllTargets();
        const normPath = (p: string) => p.replace(/\\/g, '/');
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

      // ── Print equivalent non-interactive command (wizard path only) ────────
      if (needsWizard) {
        const cmd = buildEquivalentNewCommand({
          kind: effectiveKind,
          name,
          language: effectiveLanguage,
          platforms: restrictedPlatforms,
        });
        printEquivalentCommand(cmd, isTTY);
      }
    },
  );

// ─── check ────────────────────────────────────────────────────────────────────

program
  .command('check [files...]')
  .description(
    'Validate one or more catalog source artifact files against schema + source conventions.\n\n' +
      'Checks: zod schema, id↔path↔language consistency, kebab-case names,\n' +
      'duplicate ids, reference integrity, valid platforms: values, and dependency coverage drift.\n\n' +
      'Exits non-zero when any violation is found.\n\n' +
      'Examples:\n' +
      '  sigil check catalog/languages/csharp/skills/xunit-testing/SKILL.md\n' +
      '  sigil check catalog/shared/rules/clean-code.rule.md\n' +
      '  sigil check catalog/  # check all artifacts in a directory',
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
    const filesToCheck: string[] = files;
    if (filesToCheck.length === 0) {
      console.error('✗ No files specified. Pass file path(s) as arguments.');
      console.error(
        '  Example: sigil check catalog/languages/csharp/skills/xunit-testing/SKILL.md',
      );
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

      const violations = checkSourceArtifact(artifact, catalog, targets, {
        schemaOnly: opts.schemaOnly,
      });
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

    console.log(
      `\n${totalViolations === 0 ? '✓' : '✗'} ${checkedCount} artifact(s) checked, ${totalViolations} violation(s) found.`,
    );
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
      '  sigil retarget csharp/xunit-testing --add copilot\n' +
      '  sigil retarget shared/explain-diff --remove claude\n' +
      '  sigil retarget csharp/dotnet-style --to all      # reset to all AIs\n' +
      '  sigil retarget csharp/dotnet-style --to claude   # restrict to Claude only',
  )
  .option('--add <platforms>', 'Comma-separated platforms to add to the targeting set')
  .option('--remove <platforms>', 'Comma-separated platforms to remove from the targeting set')
  .option(
    '--to <platforms>',
    'Set the targeting to exactly these platforms (comma-separated), or "all" to reset',
  )
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--yes', 'Skip confirmation prompt', false)
  .option(
    '--with-deps',
    "Also apply the same targeting change to the artifact's uses: closure (rules/agents)",
    false,
  )
  .action(
    async (
      id: string,
      opts: {
        add?: string;
        remove?: string;
        to?: string;
        catalogDir: string;
        yes: boolean;
        withDeps: boolean;
      },
    ) => {
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
      let mutResult: {
        platforms: string[] | undefined;
        noOp: boolean;
        errors: string[];
        warnings: string[];
      };

      if (opts.to) {
        const toVal =
          opts.to === 'all'
            ? undefined
            : opts.to
                .split(',')
                .map(p => p.trim())
                .filter(Boolean);
        mutResult = setPlatforms(kind, toVal, targets);
      } else if (opts.add) {
        const toAdd = opts.add
          .split(',')
          .map(p => p.trim())
          .filter(Boolean);
        mutResult = addPlatforms(kind, currentPlatforms, toAdd, targets);
      } else {
        const toRemove = opts
          .remove!.split(',')
          .map(p => p.trim())
          .filter(Boolean);
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

      // Write updated platforms field back to the source file (body preserved verbatim)
      writeArtifactFrontmatter(artifact.filePath, { platforms: mutResult.platforms });

      const newLabel =
        mutResult.platforms === undefined
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
        console.log(`\n  → Next: sigil build  (will now emit to all supporting platforms)`);
      } else {
        console.log(`\n  → Next: sigil build  (or: sigil retarget ${id} --to all to widen back)`);
      }

      console.log(
        "  ℹ  Consumers who already ran 'add' must re-run it to pick up the changed targeting.",
      );
    },
  );

// ─── edit ─────────────────────────────────────────────────────────────────────

program
  .command('edit <id>')
  .description(
    'Update the metadata (title, description, tags) of an existing catalog artifact.\n\n' +
      'The artifact body and platforms: field are NOT changed by this command.\n' +
      '  • To change platforms: use `sigil retarget <id> --to <platforms>`\n' +
      '  • To edit the body:    open the file directly, then run `sigil check <id>`\n\n' +
      'When run in an interactive terminal the wizard pre-fills each prompt with\n' +
      "the current value so you only need to change what's wrong.\n\n" +
      'Examples:\n' +
      '  sigil edit csharp/xunit-testing                              # guided\n' +
      '  sigil edit shared/explain-diff --title "Explain a Diff" --yes',
  )
  .option('--title <title>', 'New title (replaces existing)')
  .option('--description <desc>', 'New description (replaces existing)')
  .option('--tags <list>', 'Comma-separated tags (replaces existing)')
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--yes', 'Non-interactive: apply flags without prompting')
  .action(
    async (
      id: string,
      opts: {
        title?: string;
        description?: string;
        tags?: string;
        catalogDir: string;
        yes?: boolean;
      },
    ) => {
      const catalog = await loadCatalog(opts.catalogDir);
      const targets = getAllTargets();

      const artifact = catalog.byId.get(id);
      if (!artifact) {
        const available = catalog.artifacts.map(a => a.id).join(', ');
        console.error(`✗ Artifact '${id}' not found. Available: ${available || '(none)'}`);
        process.exit(1);
      }

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
          console.error('✗ --title is required in non-interactive mode when no title is set.');
          process.exit(1);
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
    },
  );

// ─── delete ───────────────────────────────────────────────────────────────────

program
  .command('delete <id>')
  .alias('remove')
  .description(
    'Remove a catalog artifact from the source. Prompts for confirmation unless --yes.\n\n' +
      'Skills: the entire skill directory (SKILL.md + references/) is removed.\n' +
      'Other kinds: the single .md file is removed.\n\n' +
      'Dependents: skills whose `uses:` closure references the deleted artifact are\n' +
      'listed as a warning. Their `uses:` declarations become dangling references —\n' +
      'update them before running `sigil validate`.\n\n' +
      'Examples:\n' +
      '  sigil delete csharp/xunit-testing           # prompts for confirmation\n' +
      '  sigil delete shared/explain-diff --yes      # non-interactive\n' +
      '  sigil delete csharp/dotnet-style --dry-run  # preview only',
  )
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--yes', 'Skip confirmation prompt')
  .option('--dry-run', 'Preview what would be deleted without deleting')
  .action(
    async (
      id: string,
      opts: {
        catalogDir: string;
        yes?: boolean;
        dryRun?: boolean;
      },
    ) => {
      const rawCatalog = await loadCatalog(opts.catalogDir);
      const resolvedCatalog = resolveCatalog(rawCatalog);

      const artifact = rawCatalog.byId.get(id);
      if (!artifact) {
        const available = rawCatalog.artifacts.map(a => a.id).join(', ');
        console.error(`✗ Artifact '${id}' not found. Available: ${available || '(none)'}`);
        process.exit(1);
      }

      // ── Reverse-dependency scan ───────────────────────────────────────────────
      // Find skills whose resolved rules or agent IDs include this artifact.
      const dependents: string[] = [];
      for (const a of resolvedCatalog.artifacts) {
        if (a.kind !== 'skill') continue;
        const usesRule = (a.resolvedRules ?? []).some(r => r.id === id);
        const usesAgent = (a.resolvedAgentIds ?? []).includes(id);
        if (usesRule || usesAgent) {
          dependents.push(a.id);
        }
      }

      // Determine what will be removed
      const isSkill = artifact.kind === 'skill';
      const targetPath = isSkill
        ? path.dirname(artifact.filePath) // remove the whole skill directory
        : artifact.filePath; // remove the single file

      if (opts.dryRun) {
        console.log(`\nDry run — would delete:`);
        console.log(`  ${isSkill ? '(directory) ' : ''}${targetPath}`);
        if (dependents.length > 0) {
          console.warn(
            `\n  ⚠  ${dependents.length} skill(s) reference this artifact via \`uses:\`:`,
          );
          for (const dep of dependents) console.warn(`     ${dep}`);
          console.warn(`  Update their uses: declarations after deleting.`);
        }
        console.log('\nNo files were deleted (--dry-run).');
        return;
      }

      // ── Confirmation ─────────────────────────────────────────────────────────
      const isTTY = isInteractiveTTY();

      if (!opts.yes && !isTTY) {
        console.error(
          '✗ stdin/stdout is not an interactive terminal.\n' +
            `  Re-run with --yes to confirm deletion: sigil delete ${id} --yes`,
        );
        process.exit(1);
      }

      if (dependents.length > 0) {
        note(
          `${dependents.length} skill(s) reference '${id}' via their uses: declarations:\n` +
            dependents.map(dep => `  ${dep}`).join('\n') +
            '\n' +
            '\nThose skills will have dangling references after deletion.\n' +
            'Update their uses: frontmatter before running `sigil validate`.',
          '⚠  Dependent artifacts',
        );
      }

      if (!opts.yes) {
        const confirmed = await confirm({
          message: `Delete ${isSkill ? 'skill directory' : 'file'}: ${targetPath}?`,
          initialValue: false,
        });
        if (isCancel(confirmed) || !confirmed) {
          cancel('Delete cancelled.');
          return;
        }
      }

      // ── Delete ────────────────────────────────────────────────────────────────
      if (isSkill) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }

      console.log(`✓ Deleted: ${targetPath}`);
      if (dependents.length > 0) {
        console.warn(`  ⚠  Update uses: in: ${dependents.join(', ')}`);
      }
      console.log(`  Next: npm run validate  (to confirm catalog integrity)`);
    },
  );

// ─── completion ───────────────────────────────────────────────────────────────

program
  .command('completion [shell]')
  .description(
    'Print a shell tab-completion script. Source it to enable `add <Tab>` completions.\n' +
      '  Shells: bash (default), zsh, fish\n\n' +
      '  Usage:\n' +
      '    eval "$(sigil completion)"            # bash (add to ~/.bashrc)\n' +
      '    eval "$(sigil completion zsh)"        # zsh  (add to ~/.zshrc)\n' +
      '    sigil completion fish | source        # fish',
  )
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
    if (prev === '--target') {
      process.stdout.write('claude\ncopilot\n');
      return;
    }
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
  const hasClaude = fs.existsSync(path.join(projectDir, '.claude'));
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
function buildTemplate(kind: string, id: string, name: string, language: string): string {
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
      return (
        [
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
        ].join('\n') + '\n'
      );

    case 'rule':
      return (
        [
          ...base,
          `language: ${language === 'shared' ? '# omit for cross-language rules' : language}`,
          `appliesTo:`,
          `  - "**/*"`,
          `severity: recommended`,
          `extends: []  # reference parent rule IDs for DRY inheritance`,
          '---',
          '',
          '- TODO — Add rule bullets here.',
        ].join('\n') + '\n'
      );

    case 'agent':
      return (
        [
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
        ].join('\n') + '\n'
      );

    case 'prompt':
      return [...base, `args: []`, '---', '', 'TODO — prompt body.'].join('\n') + '\n';

    default:
      return [...base, '---', '', 'TODO'].join('\n') + '\n';
  }
}

// ─── release ──────────────────────────────────────────────────────────────────

program
  .command('release [level]')
  .description(
    'Bump the package version, rebuild, update CHANGELOG, commit, and tag for publishing.\n\n' +
      '  level: patch | minor | major | <explicit x.y.z>  (default: patch)\n\n' +
      '  Steps performed:\n' +
      '    1. Preflight — clean git working tree + branch check\n' +
      '    2. Compute next version via the given level\n' +
      '    3. Write package.json + package-lock.json\n' +
      '    4. Verify gate — npm run build / validate / test / catalog:build\n' +
      '    5. Promote CHANGELOG.md [Unreleased] → [x.y.z] - YYYY-MM-DD\n' +
      '    6. Commit + tag  (does NOT push)\n\n' +
      '  After the command succeeds: git push && git push --tags\n' +
      '  That triggers release.yml → npm publish via OIDC Trusted Publishing.',
  )
  .option('--dry-run', 'print every step and computed version; write nothing')
  .option('--no-verify', 'skip the build/validate/test gate (escape hatch)')
  .option('--yes', 'non-interactive; skip the confirmation prompt (required when not a TTY)')
  .action(
    async (level: string | undefined, opts: { dryRun: boolean; verify: boolean; yes: boolean }) => {
      const releaseLevel = level ?? 'patch';
      const dry = !!opts.dryRun;
      const doVerify = !!opts.verify;
      const yes = !!opts.yes;
      const interactive = isInteractiveTTY() && !yes;

      // ── 1. Compute next version ────────────────────────────────────────────────
      let nextVersion: string;
      try {
        nextVersion = bumpVersion(pkg.version, releaseLevel);
      } catch (e: unknown) {
        console.error(`  ✗  ${(e as Error).message}`);
        process.exit(1);
      }

      console.log(`\nRelease: ${pkg.version} → ${nextVersion}`);

      // ── 2. Preflight (skip in dry-run) ─────────────────────────────────────────
      if (!dry) {
        let status: string;
        try {
          status = execSync('git status --porcelain', { encoding: 'utf-8' });
        } catch {
          console.error('  ✗  git status failed — is this a git repo?');
          process.exit(1);
        }
        if (status.trim()) {
          console.error('  ✗  Working tree is not clean. Commit or stash changes first.');
          console.error(status);
          process.exit(1);
        }

        let branch: string;
        try {
          branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
        } catch {
          branch = '(unknown)';
        }
        if (branch !== 'master' && branch !== 'main') {
          console.warn(`  ⚠  Current branch is '${branch}', not master/main — are you sure?`);
        }
      }

      // ── 3. Confirm (interactive mode) ──────────────────────────────────────────
      if (dry) {
        console.log('\n  [dry-run] Would perform:');
        console.log(`    • Write package.json version: ${nextVersion}`);
        console.log(`    • Write package-lock.json version: ${nextVersion}`);
        if (doVerify) {
          console.log(
            '    • Run: npm run build && npm run validate && npm test && npm run catalog:build',
          );
        }
        console.log('    • Promote CHANGELOG.md [Unreleased] → ' + `[${nextVersion}] - <today>`);
        console.log(`    • git commit -m "release: v${nextVersion}"`);
        console.log(`    • git tag v${nextVersion}`);
        console.log('\n  Dry run complete. No files were written.');
        return;
      }

      if (interactive) {
        const { confirm: clackConfirm, isCancel: clackIsCancel } = await import('@clack/prompts');
        const ok = await clackConfirm({ message: `Proceed with release v${nextVersion}?` });
        if (clackIsCancel(ok) || !ok) {
          console.log('  Release cancelled.');
          return;
        }
      }

      // ── 4. Write new version to package.json + package-lock.json ───────────────
      const pkgPath = path.resolve(PKG_ROOT, 'package.json');
      const lockPath = path.resolve(PKG_ROOT, 'package-lock.json');

      const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      pkgJson['version'] = nextVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
      console.log(`  ✓ package.json → ${nextVersion}`);

      if (fs.existsSync(lockPath)) {
        const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as Record<string, unknown>;
        lockJson['version'] = nextVersion;
        // Also update the root packages[""].version entry if present
        const packages = lockJson['packages'] as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (packages && packages['']) {
          packages['']['version'] = nextVersion;
        }
        fs.writeFileSync(lockPath, JSON.stringify(lockJson, null, 2) + '\n', 'utf-8');
        console.log(`  ✓ package-lock.json → ${nextVersion}`);
      }

      // ── 5. Verify gate ─────────────────────────────────────────────────────────
      if (doVerify) {
        const gate = ['npm run build', 'npm run validate', 'npm test', 'npm run catalog:build'];
        for (const cmd of gate) {
          process.stdout.write(`  running: ${cmd} … `);
          try {
            execSync(cmd, { stdio: 'pipe', cwd: PKG_ROOT });
            process.stdout.write('✓\n');
          } catch (e: unknown) {
            process.stdout.write('✗\n');
            console.error(
              (e as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ?? String(e),
            );
            console.error(`\n  ✗  Gate failed at: ${cmd}`);
            console.error('  Restore: git checkout package.json package-lock.json');
            process.exit(1);
          }
        }
      }

      // ── 6. Promote CHANGELOG ───────────────────────────────────────────────────
      const changelogPath = path.resolve(PKG_ROOT, 'CHANGELOG.md');
      if (fs.existsSync(changelogPath)) {
        const changelogText = fs.readFileSync(changelogPath, 'utf-8');
        const today = new Date().toISOString().slice(0, 10);
        try {
          const promoted = promoteChangelog(changelogText, nextVersion, today);
          fs.writeFileSync(changelogPath, promoted, 'utf-8');
          console.log(`  ✓ CHANGELOG.md → [${nextVersion}] - ${today}`);
        } catch (e: unknown) {
          console.warn(`  ⚠  CHANGELOG.md update skipped: ${(e as Error).message}`);
        }
      } else {
        console.warn('  ⚠  CHANGELOG.md not found — skipping changelog promotion.');
      }

      // ── 7. Commit + tag ────────────────────────────────────────────────────────
      const filesToAdd = ['package.json'];
      if (fs.existsSync(lockPath)) filesToAdd.push('package-lock.json');
      if (fs.existsSync(changelogPath)) filesToAdd.push('CHANGELOG.md');

      try {
        execSync(`git add ${filesToAdd.join(' ')}`, { cwd: PKG_ROOT, stdio: 'pipe' });
        execSync(`git commit -m "release: v${nextVersion}"`, { cwd: PKG_ROOT, stdio: 'pipe' });
        execSync(`git tag v${nextVersion}`, { cwd: PKG_ROOT, stdio: 'pipe' });
        console.log(`  ✓ git commit + tag v${nextVersion}`);
      } catch (e: unknown) {
        console.error('  ✗  git commit/tag failed:');
        console.error((e as { stderr?: Buffer }).stderr?.toString() ?? String(e));
        process.exit(1);
      }

      // ── 8. Summary ─────────────────────────────────────────────────────────────
      console.log(`\n✓ Release v${nextVersion} is ready locally.\n`);
      console.log('Next: push the commit and the tag to trigger CI publish:');
      console.log(`\n  git push && git push --tags\n`);
      console.log(
        'This triggers release.yml → npm publish --provenance via OIDC Trusted Publishing.',
      );
    },
  );

// ─── Shell completion scripts ──────────────────────────────────────────────────

function buildBashCompletion(binPath: string): string {
  return `# sigil bash completion
# Add to ~/.bashrc: eval "$(sigil completion)"
_sigil_completions() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local IFS=$'\\n'
  COMPREPLY=( $(node "${binPath}" __complete "$cur" --prev "$prev" 2>/dev/null) )
  return 0
}
complete -F _sigil_completions sigil`;
}

function buildZshCompletion(binPath: string): string {
  return `# sigil zsh completion
# Add to ~/.zshrc: eval "$(sigil completion zsh)"
_sigil() {
  local -a completions
  completions=( "\${(@f)$(node "${binPath}" __complete "\${words[-1]}" --prev "\${words[-2]}" 2>/dev/null)}" )
  compadd -a completions
}
compdef _sigil sigil`;
}

function buildFishCompletion(binPath: string): string {
  return `# sigil fish completion
# Usage: sigil completion fish | source
complete -c sigil -f
complete -c sigil -n '__fish_seen_subcommand_from add' -a "(node ${binPath} __complete (commandline -ct) --prev (commandline -ct | string split ' ' | tail -n2 | head -n1) 2>/dev/null)"`;
}

program.parse(process.argv);
