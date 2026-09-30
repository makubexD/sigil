#!/usr/bin/env node
/**
 * sigil CLI
 * Commands:
 *   build      — compile the catalog to dist/<target>/
 *   validate   — schema + reference-graph checks (CI gate)
 *   list       — query the catalog
 *   get <id>   — show full detail for a single artifact (alias: show)
 *   search     — free-text search over id/title/description/tags
 *   add        — scaffold artifact(s) + their dependency closure into a consumer project
 *                Supports: individual IDs, `all`, `pack:<name>`, `kind:<kind>` selectors,
 *                --kind/--exclude/--language filters, --no-deps, --dry-run, --overwrite.
 *                Interactive guided installer when run with no selector in a TTY.
 *   status     — show status of artifacts installed in a consumer project
 *   update [ids...] — refresh installed artifacts to the current bundled catalog version
 *   uninstall <ids...> — remove installed artifacts from a consumer project
 *   init       — prepare a consumer project for a target platform
 *   new        — scaffold an authoring template for catalog contributors
 *   import <dir> — import a portable Claude template dir into the catalog as first-class artifacts
 *   patch <id> — update any field(s) of a catalog artifact (supersedes `edit`/`retarget`)
 *   edit       — update artifact title, description, and tags (alias for patch)
 *   retarget   — change artifact platforms: targeting (alias for patch --add/remove/to-platform)
 *   move <id> <new-id> — rename/relocate an artifact and rewrite all referrers (alias: rename)
 *   delete     — remove an artifact from the catalog (alias: remove)
 *   release    — bump version, rebuild, update CHANGELOG, commit + tag for publishing
 *   completion [bash|zsh|fish] — print shell tab-completion script
 */
import { Command } from 'commander';
import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadCatalog } from './load';
import { validateCatalog } from './validate';
import { resolveCatalog } from './resolve';
import { getAllTargets, getTarget } from './targets';
import { resolveSelection, CONFIG_KINDS } from './select';
import { ALL_KINDS, isArtifactKind } from './kinds';
import {
  isInteractiveTTY,
  runNewWizard,
  runEditWizard,
  buildEquivalentNewCommand,
  printEquivalentCommand,
} from './wizard';
import { confirm, isCancel, cancel, note } from '@clack/prompts';
import { checkOutputContract } from './targets/output-contract';
import { checkSourceArtifact } from './authoring/check-source';
import { headerFor } from './authoring/header';
import { writeArtifactFrontmatter } from './authoring/frontmatter';
import { bumpVersion, promoteChangelog } from './release';
import { addPlatforms, removePlatforms, setPlatforms } from './authoring/platforms';
import { artifactTargetsPlatform } from './select';
import { getArtifactDetail, formatDetailText, searchArtifacts, formatSearchResults } from './query';
// authoring/update exports are now consumed by commands/patch.ts
import { planMove, executeMove, summarizePlan } from './authoring/move';
import {
  loadManifest,
  saveManifest,
  computeStatus,
  removeEntries,
  sha256,
} from './manifest';
import { scanContent, formatScanFindings } from './trust/scan';
import { reverseMerge, serialize } from './config-merge';
import { resolveConfigRoot } from './config-utils';
import { discoverFiles, buildImportPlan, renderArtifactFile, languageYamlPath, executeImport } from './authoring/import';
import { stripLanguagePrefix } from './authoring/import/translate';
import { buildRegistry } from './registry';
import type { PacksConfig, ConfigMergeOp, ConfigRoot } from './types';
import { runAdd } from './commands/add';
import { runPatch } from './commands/patch';
import {
  pkg,
  PKG_ROOT,
  resolveDefault,
  loadAndValidate,
  writeFilesSync,
  detectProjectTarget,
} from './cli-helpers';

// CONFIG_KINDS is imported from ./select — single source of truth for hook/settings/mcp.

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

      writeFilesSync(files, path.join(opts.outDir, target.name));
      const count = Object.keys(files).length;
      console.log(`  ✓ ${count} file(s) written to dist/${target.name}/`);
    }

    // Emit registry.json alongside the per-target dist directories
    const registry = buildRegistry(resolved, pkg.version, new Date().toISOString());
    const registryPath = path.join(opts.outDir, 'registry.json');
    fs.mkdirSync(opts.outDir, { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
    console.log(`  ✓ registry.json  (${registry.artifacts.length} artifacts)`);

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

// ─── index ────────────────────────────────────────────────────────────────────

program
  .command('index')
  .description('Emit dist/registry.json — a flat per-artifact index with sha256 + facets.')
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--out-dir <dir>', 'Output root directory', resolveDefault('dist'))
  .option('--json', 'Print the registry to stdout instead of writing a file')
  .action(
    async (opts: { catalogDir: string; packs: string; outDir: string; json: boolean }) => {
      const { catalog } = await loadAndValidate(opts.catalogDir, opts.packs);
      const resolved = resolveCatalog(catalog);
      const registry = buildRegistry(resolved, pkg.version, new Date().toISOString());

      if (opts.json) {
        console.log(JSON.stringify(registry, null, 2));
        return;
      }

      const registryPath = path.join(opts.outDir, 'registry.json');
      fs.mkdirSync(opts.outDir, { recursive: true });
      fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
      console.log(
        `✓ ${registryPath}  (${registry.artifacts.length} artifacts, ${registry.facets.kinds.length} kinds, ${registry.facets.languages.length} languages)`,
      );
    },
  );

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

// ─── get (alias: show) ────────────────────────────────────────────────────────

program
  .command('get <id>')
  .alias('show')
  .description(
    'Show full detail for a single catalog artifact.\n\n' +
      'Displays: frontmatter, resolved dependency closure, reverse dependents,\n' +
      'which targets will emit it, and the destination path per target.\n\n' +
      'Examples:\n' +
      '  sigil get csharp/cs-generate-tests\n' +
      '  sigil get shared/code-reviewer --json',
  )
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--json', 'Output as JSON', false)
  .action(async (id: string, opts: { catalogDir: string; json: boolean }) => {
    const rawCatalog = await loadCatalog(opts.catalogDir);
    const resolved = resolveCatalog(rawCatalog);
    const targets = getAllTargets();

    const artifact = resolved.byId.get(id);
    if (!artifact) {
      const available = rawCatalog.artifacts.map(a => a.id).join(', ');
      console.error(`✗ Artifact '${id}' not found. Available: ${available || '(none)'}`);
      process.exit(1);
    }

    const detail = getArtifactDetail(artifact, rawCatalog, targets);

    if (opts.json) {
      console.log(JSON.stringify(detail, null, 2));
      return;
    }

    console.log(formatDetailText(detail).join('\n'));
  });

// ─── search ───────────────────────────────────────────────────────────────────

program
  .command('search <query>')
  .description(
    'Search the catalog by free text (id, title, description, tags).\n\n' +
      'Results are ranked: exact-id > title > tag > description.\n\n' +
      'Examples:\n' +
      '  sigil search testing\n' +
      '  sigil search --kind rule --language csharp style\n' +
      '  sigil search --tag ci --json',
  )
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--kind <kind>', 'Filter results to this kind (skill, agent, rule, prompt, workflow)')
  .option('--language <lang>', 'Filter results to this language')
  .option('--tag <tag>', 'Filter results to artifacts with this tag (substring match)')
  .option('--json', 'Output as JSON', false)
  .action(
    async (
      query: string,
      opts: { catalogDir: string; kind?: string; language?: string; tag?: string; json: boolean },
    ) => {
      const catalog = await loadCatalog(opts.catalogDir);
      const resolved = resolveCatalog(catalog);

      const results = searchArtifacts(resolved, query, {
        kind: opts.kind,
        language: opts.language,
        tag: opts.tag,
      });

      if (opts.json) {
        console.log(
          JSON.stringify(
            results.map(r => ({
              id: r.artifact.id,
              kind: r.artifact.kind,
              title: r.artifact.frontmatter.title,
              description: r.artifact.frontmatter.description,
              score: r.score,
              matchedFields: r.matchedFields,
            })),
            null,
            2,
          ),
        );
        return;
      }

      console.log(formatSearchResults(results, query).join('\n'));
    },
  );

// ─── add ──────────────────────────────────────────────────────────────────────

program
  .command('add [selectors...]')
  .description(
    'Scaffold one or more artifacts (+ their dependency closure) into a project.\n\n' +
      'Selector forms:\n' +
      '  skill:csharp/cs-generate-tests   — explicit artifact (kind-prefixed ID)\n' +
      '  csharp/cs-generate-tests         — bare artifact ID\n' +
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
  .option(
    '--scope <scope>',
    'Install scope for config-kind artifacts (hook/settings/mcp): project | local | user (default: project)',
  )
  .option('--settings-local', '(deprecated) Alias for --scope local', false)
  .action(runAdd)

// ─── init ─────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Prepare a consumer project for a target platform.')
  .requiredOption('--target <name>', 'Target platform: claude or copilot')
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .action((opts: { target: string; projectDir: string }) => {
    // Directory list and display name come from the target adapter — no hardcoded names here.
    let target;
    try {
      target = getTarget(opts.target);
    } catch {
      const names = getAllTargets().map(t => t.name).join(', ');
      console.error(`✗ Unknown target '${opts.target}'. Valid options: ${names}`);
      process.exit(1);
    }
    for (const dir of target.initDirs ?? []) {
      const full = path.join(opts.projectDir, dir);
      fs.mkdirSync(full, { recursive: true });
      console.log(`  created ${dir}/`);
    }
    console.log(`\n✓ ${target.name} project structure initialised.`);
    console.log(`  Next: sigil add --target ${target.name}  (interactive) or  sigil add skill:<language>/<name> --target ${target.name}`);
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
      // ALL_KINDS from kinds.ts — single source of truth for the full kind list.
      const validKinds = ALL_KINDS;

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
              `  Valid kinds: ${validKinds.join(', ')}\n\n` +
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
              `  Valid kinds: ${validKinds.join(', ')}`,
          );
          process.exit(1);
        }
        if (!isArtifactKind(effectiveKind)) {
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
      'With --trust: also runs the lightweight security scanner (secret detection,\n' +
      'prompt-injection heuristics). Use --strict to exit non-zero on trust warnings.\n\n' +
      'Exits non-zero when any violation is found.\n\n' +
      'Examples:\n' +
      '  sigil check catalog/languages/csharp/skills/cs-generate-tests/SKILL.md\n' +
      '  sigil check catalog/shared/rules/clean-code.rule.md\n' +
      '  sigil check catalog/  # check all artifacts in a directory\n' +
      '  sigil check catalog/ --trust --strict',
  )
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--schema-only', 'Only run zod schema validation (skip path/id/reference checks)', false)
  .option(
    '--trust',
    'Run the trust/security scanner (secret detection + injection heuristics)',
    false,
  )
  .option('--strict', 'Exit non-zero on trust warnings (requires --trust)', false)
  .action(
    async (
      files: string[],
      opts: { catalogDir: string; schemaOnly: boolean; trust: boolean; strict: boolean },
    ) => {
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
          '  Example: sigil check catalog/languages/csharp/skills/cs-generate-tests/SKILL.md',
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

        // Trust scan (opt-in via --trust)
        if (opts.trust) {
          const rawContent = require('fs').readFileSync(filePath, 'utf-8');
          const scanResult = scanContent(filePath, rawContent);
          if (scanResult.findings.length > 0) {
            const trustLines = formatScanFindings(scanResult);
            for (const line of trustLines) {
              if (scanResult.level === 'error') {
                console.error(line);
              } else {
                console.warn(line);
              }
            }
            if (opts.strict || scanResult.level === 'error') {
              totalViolations += scanResult.findings.length;
            }
          }
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
    },
  );

// ─── import ───────────────────────────────────────────────────────────────────

/**
 * Known language display names and glob patterns for built-in languages.
 * Used by --create-language to scaffold a language.yaml when one is absent.
 */
const LANGUAGE_DEFAULTS: Record<string, { displayName: string; globs: string[]; icon: string }> = {
  typescript: {
    displayName: 'TypeScript',
    globs: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    icon: '🔷',
  },
  angular: {
    displayName: 'Angular',
    globs: ['**/*.ts', '**/*.html', '**/*.component.ts', '**/*.directive.ts'],
    icon: '🅰️',
  },
  csharp: {
    displayName: '.NET / C#',
    globs: ['**/*.cs', '**/*.csproj', '**/*.sln', '**/*.razor', '**/*.cshtml'],
    icon: '⚙️',
  },
  python: {
    displayName: 'Python',
    globs: ['**/*.py', '**/*.pyi'],
    icon: '🐍',
  },
  react: {
    displayName: 'React',
    globs: ['**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],
    icon: '⚛️',
  },
};

program
  .command('import <source-dir>')
  .description(
    'Import a portable Claude template directory into the catalog as first-class artifacts.\n\n' +
      'Detects rules/, agents/, and skills/ subdirectories, translates their frontmatter\n' +
      'to the catalog schema, assigns IDs and paths, and writes catalog-style artifact files.\n\n' +
      'Use --dry-run to preview every source→dest mapping and the translated frontmatter\n' +
      'without writing anything — check the coverage report before committing.\n\n' +
      'Examples:\n' +
      '  sigil import _Others/.ClaudeDotNet --language csharp --dry-run\n' +
      '  sigil import _Others/.ClaudeDotNet --language csharp --yes\n' +
      '  sigil import _Others/.ClaudeTypescript --language typescript --create-language --yes\n' +
      '  sigil import _Others/.ClaudeAngular --language angular --create-language --yes',
  )
  .requiredOption(
    '--language <lang>',
    'Target language key in the catalog (e.g. csharp, typescript, angular)',
  )
  .option('--display-name <name>', 'Override the language display name used in titles and language.yaml')
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--dry-run', 'Preview only — print the coverage report and exit without writing', false)
  .option('--yes', 'Non-interactive mode — skip confirmation prompts', false)
  .option('--overwrite', 'Overwrite existing catalog files (default: skip conflicts)', false)
  .option(
    '--create-language',
    'Create catalog/languages/<lang>/language.yaml when it does not exist',
    false,
  )
  .action(
    async (
      sourceDir: string,
      opts: {
        language: string;
        displayName?: string;
        catalogDir: string;
        dryRun: boolean;
        yes: boolean;
        overwrite: boolean;
        createLanguage: boolean;
      },
    ) => {
      const absSourceDir = path.resolve(sourceDir);
      if (!fs.existsSync(absSourceDir)) {
        console.error(`✗ Source directory not found: ${absSourceDir}`);
        process.exit(1);
      }

      const lang = opts.language;

      // Resolve display name: flag → language.yaml → built-in defaults → capitalised lang
      let displayName: string;
      const langYamlPath = languageYamlPath(lang, opts.catalogDir);
      if (opts.displayName) {
        displayName = opts.displayName;
      } else if (fs.existsSync(langYamlPath)) {
        try {
          const yamlContent = yaml.load(fs.readFileSync(langYamlPath, 'utf-8'), { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>;
          displayName = (yamlContent.displayName as string | undefined) ?? lang;
        } catch {
          displayName = lang;
        }
      } else if (LANGUAGE_DEFAULTS[lang]) {
        displayName = LANGUAGE_DEFAULTS[lang].displayName;
      } else {
        displayName = lang.charAt(0).toUpperCase() + lang.slice(1);
      }

      // ── Create language.yaml if requested ───────────────────────────────────
      if (opts.createLanguage && !fs.existsSync(langYamlPath)) {
        const defaults = LANGUAGE_DEFAULTS[lang];
        const langDir = path.dirname(langYamlPath);
        fs.mkdirSync(langDir, { recursive: true });

        const globs = defaults?.globs ?? ['**/*'];
        const icon = defaults?.icon ?? '📁';
        const langYamlContent = [
          `displayName: ${JSON.stringify(opts.displayName ?? displayName)}`,
          `globs:`,
          ...globs.map(g => `  - "${g}"`),
          `icon: "${icon}"`,
          '',
        ].join('\n');
        fs.writeFileSync(langYamlPath, langYamlContent, 'utf-8');
        console.log(`✓ Created: ${langYamlPath}`);
      }

      // ── Discover files ───────────────────────────────────────────────────────
      console.log(`\nDiscovering artifacts in: ${absSourceDir}`);
      const { discovered, unrecognised } = discoverFiles(absSourceDir);
      console.log(`  Found ${discovered.length} artifact(s)  (${unrecognised.length} unrecognised)`);

      if (unrecognised.length > 0) {
        console.log('\n  ⚠  Unrecognised files (not imported):');
        for (const u of unrecognised) {
          console.log(`     ${u.relativePath}  — ${u.reason}`);
        }
      }

      if (discovered.length === 0) {
        console.log('\nNothing to import.');
        return;
      }

      // ── Build import plan ────────────────────────────────────────────────────
      const plan = buildImportPlan(discovered, {
        language: lang,
        displayName,
        catalogDir: opts.catalogDir,
      });

      // ── Load catalog early (needed for overlap report + dry-run validation) ──
      const catalog = await loadCatalog(opts.catalogDir);
      const targets = getAllTargets();

      // ── Cross-language overlap report ────────────────────────────────────────
      // For each incoming artifact, strip the language prefix from its slug and
      // check for same-topic artifacts in other languages in the existing catalog.
      const overlapLines: string[] = [];
      for (const item of plan.items) {
        const slug = item.frontmatter.id.split('/').pop()!;
        const topic = stripLanguagePrefix(slug, lang);
        const matches = catalog.artifacts.filter(a => {
          if ((a.frontmatter.language as string | undefined) === lang) return false;
          const aTopic = stripLanguagePrefix(String(a.frontmatter.name ?? a.id.split('/').pop()), String(a.frontmatter.language ?? ''));
          return aTopic === topic;
        });
        if (matches.length > 0) {
          overlapLines.push(
            `  ${item.frontmatter.id}  ←→  ${matches.map(m => m.id).join(', ')}`,
          );
        }
      }

      // ── Coverage report ──────────────────────────────────────────────────────
      const conflicts = plan.items.filter(i => i.conflicts);
      const newItems = plan.items.filter(i => !i.conflicts);
      const synthesized = plan.items.filter(i => i.descriptionSynthesized);

      console.log('\n── Coverage report ─────────────────────────────────────────────────────');
      for (const item of plan.items) {
        const flag = item.conflicts ? '⚠ conflict' : '＋ new';
        const relDest = path.relative(opts.catalogDir, item.destPath).replace(/\\/g, '/');
        const descWarn = item.descriptionSynthesized ? '  ⚠ generic description' : '';
        console.log(`  ${flag.padEnd(12)} ${item.relativePath}  →  catalog/${relDest}${descWarn}`);
        if (opts.dryRun) {
          // Print the translated frontmatter preview in dry-run mode
          const rendered = renderArtifactFile(item.frontmatter, item.body);
          const frontmatterMatch = rendered.match(/^---\n([\s\S]*?)\n---/);
          if (frontmatterMatch) {
            for (const line of frontmatterMatch[1].split('\n')) {
              console.log(`    ${line}`);
            }
          }
          // Validate rendered YAML in dry-run (same logic as validate-before-write in execute.ts)
          const matter = await import('gray-matter');
          const parsed = matter.default(rendered);
          const fm = parsed.data as Record<string, unknown>;
          const virtArtifact = {
            id: fm.id as string,
            kind: fm.kind as import('./types').ArtifactKind,
            filePath: item.destPath,
            frontmatter: fm,
            body: parsed.content.trim(),
          };
          const violations = checkSourceArtifact(virtArtifact, catalog, targets);
          if (violations.length > 0) {
            for (const v of violations) {
              console.log(`    ✗ validation: ${v.problem}`);
            }
          }
        }
        if (item.droppedFields.length > 0) {
          console.log(`    dropped source fields: ${item.droppedFields.join(', ')}`);
        }
      }

      if (plan.droppedFieldsSummary.length > 0) {
        console.log('\n  ℹ  Some source frontmatter fields had no catalog mapping (see above).');
        console.log('     These fields are intentionally not carried over to the catalog format.');
      }

      if (synthesized.length > 0) {
        console.log(`\n  ⚠  ${synthesized.length} artifact(s) have synthesized descriptions — refine with \`sigil patch <id> --description "…"\``);
      }

      if (overlapLines.length > 0) {
        console.log('\n── Cross-language overlaps ──────────────────────────────────────────────');
        console.log('  Same-topic artifacts already exist in other languages:');
        for (const l of overlapLines) console.log(l);
      }

      console.log(`\n  Summary: ${discovered.length} discovered · ${newItems.length} new · ${conflicts.length} conflict(s)`);

      if (opts.dryRun) {
        console.log('\n[dry-run] No files written.');
        return;
      }

      // ── Confirm before writing (unless --yes) ────────────────────────────────
      if (!opts.yes && conflicts.length > 0 && !opts.overwrite) {
        console.log(`\n  ⚠  ${conflicts.length} file(s) already exist. Use --overwrite to replace, or --yes to skip them.`);
        console.log('  Proceeding will skip conflicts and write only new files.');
      }

      const result = executeImport(plan.items, catalog, targets, { overwrite: opts.overwrite });

      // ── Results ──────────────────────────────────────────────────────────────
      console.log('\n── Import results ──────────────────────────────────────────────────────');
      for (const r of result.fileResults) {
        if (r.status === 'written') {
          const relDest = path.relative(opts.catalogDir, r.destPath).replace(/\\/g, '/');
          console.log(`  ✓ catalog/${relDest}`);
        } else if (r.status === 'skipped-conflict') {
          console.log(`  = ${r.relativePath}  (skipped — already exists; use --overwrite to replace)`);
        } else {
          console.error(`  ✗ ${r.relativePath}  — ${r.violations.join('; ')}`);
        }
      }

      const ok = result.errors === 0;
      console.log(
        `\n${ok ? '✓' : '✗'} ${result.written} written · ${result.skipped} skipped · ${result.errors} error(s)`,
      );

      if (!ok) {
        console.error('\nFix the errors above and re-run. Use sigil check <file> for details.');
        process.exit(1);
      }

      console.log('\nNext steps:');
      console.log('  npm run validate   — check the full catalog reference graph');
      console.log('  npm run catalog:build — rebuild dist/');
      console.log('  sigil patch <id>   — wire uses.rules/agents deps (content refinement)');
    },
  );

// ─── status ───────────────────────────────────────────────────────────────────

program
  .command('status')
  .description(
    'Show the health status of artifacts installed in a consumer project.\n\n' +
      'Status values:\n' +
      '  up-to-date — installed files match the current catalog\n' +
      '  outdated   — catalog has changed since install (run `sigil update` to refresh)\n' +
      '  drifted    — a file was modified after install (sigil update will skip without --force)\n' +
      '  orphaned   — artifact no longer exists in the bundled catalog\n' +
      '  missing    — a recorded file was deleted from disk\n\n' +
      'Examples:\n' +
      '  sigil status\n' +
      '  sigil status --json\n' +
      '  sigil status --project-dir /my/project',
  )
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .option('--target <name>', 'Target platform (auto-detected from project structure if omitted)')
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--json', 'Output as JSON', false)
  .action(
    async (opts: {
      projectDir: string;
      target?: string;
      catalogDir: string;
      packs: string;
      json: boolean;
    }) => {
      const { catalog: rawCatalog } = await loadAndValidate(opts.catalogDir, opts.packs);
      const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });

      let manifest;
      try {
        manifest = loadManifest(opts.projectDir);
      } catch (err) {
        console.error(`✗ ${(err as Error).message}`);
        process.exit(1);
      }

      if (manifest.entries.length === 0) {
        console.log(
          '\n  No sigil artifacts recorded for this project.\n' +
            '  Run `sigil add` to install artifacts.',
        );
        return;
      }

      const catalogIds = new Set(rawCatalog.artifacts.map(a => a.id));
      const target = getTarget(targetName);

      // Build scaffold-hash function for 'outdated' detection
      const scaffoldHashFn = (id: string, t: string): Map<string, string> | null => {
        if (t !== targetName || !target.scaffold) return null;
        try {
          // Synchronous stub — target.scaffold is async but we approximate
          // by returning null here; deep outdated detection happens in update
          return null;
        } catch {
          return null;
        }
      };

      const statuses = computeStatus(manifest, opts.projectDir, catalogIds, scaffoldHashFn);

      if (opts.json) {
        console.log(
          JSON.stringify(
            statuses.map(s => ({
              id: s.entry.id,
              kind: s.entry.kind,
              target: s.entry.target,
              status: s.status,
              installedAt: s.entry.installedAt,
              sigilVersion: s.entry.sigilVersion,
              driftedFiles: s.driftedFiles,
              missingFiles: s.missingFiles,
            })),
            null,
            2,
          ),
        );
        return;
      }

      const icons: Record<string, string> = {
        'up-to-date': '✓',
        outdated: '↑',
        drifted: '~',
        orphaned: '✗',
        missing: '!',
      };

      console.log('');
      for (const s of statuses) {
        const icon = icons[s.status] ?? '?';
        const depTag = s.entry.dependentOf.length
          ? `  (dep of ${s.entry.dependentOf.join(', ')})`
          : '';
        console.log(`  ${icon}  ${s.entry.id}  [${s.status}]${depTag}`);
        for (const f of s.driftedFiles) console.log(`     ~ ${f}`);
        for (const f of s.missingFiles) console.log(`     ! ${f} (missing)`);
      }

      const counts: Record<string, number> = {};
      for (const s of statuses) counts[s.status] = (counts[s.status] ?? 0) + 1;
      const summary = Object.entries(counts)
        .map(([k, n]) => `${n} ${k}`)
        .join(', ');
      console.log(`\n  ${statuses.length} artifact(s): ${summary}`);

      if (counts['outdated'] || counts['drifted'] || counts['missing']) {
        console.log('\n  Run `sigil update` to refresh outdated artifacts.');
      }
      console.log('');
    },
  );

// ─── update (consumer: re-scaffold installed artifacts) ───────────────────────

program
  .command('update [ids...]')
  .description(
    'Refresh installed artifacts to the current bundled catalog version.\n\n' +
      'For each artifact recorded in .sigil/manifest.json, re-runs scaffold and\n' +
      'writes files whose content has changed. Skips drifted files (user-edited)\n' +
      'unless --force is passed.\n\n' +
      'Distinct from `sigil patch` (which edits the catalog SOURCE). This command\n' +
      'operates on artifacts already installed into a consumer project.\n\n' +
      'Examples:\n' +
      '  sigil update                               # refresh all installed\n' +
      '  sigil update csharp/cs-generate-tests          # refresh one artifact\n' +
      '  sigil update --force                       # also overwrite drifted files\n' +
      '  sigil update --dry-run                     # preview changes',
  )
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .option('--target <name>', 'Target platform (auto-detected if omitted)')
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--force', 'Overwrite drifted (user-modified) files', false)
  .option('--dry-run', 'Preview what would change without writing', false)
  .action(
    async (
      ids: string[],
      opts: {
        projectDir: string;
        target?: string;
        catalogDir: string;
        packs: string;
        force: boolean;
        dryRun: boolean;
      },
    ) => {
      const { catalog: rawCatalog } = await loadAndValidate(opts.catalogDir, opts.packs);
      const resolved = resolveCatalog(rawCatalog);
      const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });
      const target = getTarget(targetName);

      if (!target.scaffold) {
        console.error(`✗ Target '${targetName}' does not support the update command.`);
        process.exit(1);
      }

      let manifest;
      try {
        manifest = loadManifest(opts.projectDir);
      } catch (err) {
        console.error(`✗ ${(err as Error).message}`);
        process.exit(1);
      }

      // Filter entries by target (and by explicit ids if provided)
      const idFilter = new Set(ids);
      const entries = manifest.entries.filter(
        e => e.target === targetName && (idFilter.size === 0 || idFilter.has(e.id)),
      );

      if (entries.length === 0) {
        const msg =
          idFilter.size > 0
            ? `No installed artifacts match: ${[...idFilter].join(', ')}`
            : `No artifacts installed for target '${targetName}'.`;
        console.log(`\n  ${msg}\n`);
        return;
      }

      const catalogIds = new Set(rawCatalog.artifacts.map(a => a.id));
      let updatedCount = 0;
      let skippedDrift = 0;
      let orphanedCount = 0;

      console.log('');
      for (const entry of entries) {
        if (!catalogIds.has(entry.id)) {
          console.log(`  ✗  ${entry.id}  (orphaned — no longer in catalog, run sigil uninstall)`);
          orphanedCount++;
          continue;
        }

        // Re-scaffold to get fresh file content
        let freshFiles: Record<string, string>;
        try {
          freshFiles = await target.scaffold!(entry.id, resolved, {
            projectDir: opts.projectDir,
            overwrite: true,
            includeDeps: false,
          });
        } catch (err) {
          console.error(`  ✗  ${entry.id}: scaffold failed — ${(err as Error).message}`);
          continue;
        }

        const recordedByPath = new Map(entry.files.map(f => [f.path, f.sha256]));
        const toWrite: Record<string, string> = {};
        const skipped: string[] = [];

        for (const [relPath, content] of Object.entries(freshFiles)) {
          const freshHash = sha256(content);
          const recordedHash = recordedByPath.get(relPath);

          if (recordedHash && freshHash === recordedHash) {
            // File is up-to-date on disk (assuming disk matches manifest)
            continue;
          }

          // Check if file was drifted (user edited it)
          const fullPath = require('path').join(opts.projectDir, relPath);
          if (require('fs').existsSync(fullPath)) {
            const diskHash = sha256(require('fs').readFileSync(fullPath, 'utf-8'));
            if (recordedHash && diskHash !== recordedHash) {
              if (!opts.force) {
                skipped.push(relPath);
                skippedDrift++;
                continue;
              }
            }
          }

          toWrite[relPath] = content;
        }

        if (opts.dryRun) {
          if (Object.keys(toWrite).length === 0 && skipped.length === 0) {
            console.log(`  =  ${entry.id}  (up-to-date)`);
          } else {
            console.log(`  ↑  ${entry.id}`);
            for (const p of Object.keys(toWrite)) console.log(`     ~ ${p}`);
            for (const p of skipped)
              console.log(`     ⊘ ${p}  (drifted — would skip without --force)`);
          }
          continue;
        }

        if (Object.keys(toWrite).length > 0) {
          writeFilesSync(toWrite, opts.projectDir);
          console.log(`  ✓  ${entry.id}  (${Object.keys(toWrite).length} file(s) updated)`);
          for (const p of skipped) console.log(`     ⊘ ${p}  (drifted — skipped)`);
          updatedCount++;

          // Update manifest hashes
          for (const mf of entry.files) {
            const fullPath = require('path').join(opts.projectDir, mf.path);
            if (require('fs').existsSync(fullPath)) {
              mf.sha256 = sha256(require('fs').readFileSync(fullPath, 'utf-8'));
            }
          }
        } else {
          if (skipped.length > 0) {
            console.log(`  ~  ${entry.id}  (drifted — run with --force to overwrite)`);
            for (const p of skipped) console.log(`     ~ ${p}`);
          } else {
            console.log(`  =  ${entry.id}  (already up-to-date)`);
          }
        }
      }

      if (!opts.dryRun) {
        saveManifest(opts.projectDir, manifest);
      }

      if (!opts.dryRun) {
        console.log(
          `\n✓ ${updatedCount} artifact(s) updated` +
            (skippedDrift > 0 ? `, ${skippedDrift} file(s) skipped (drifted)` : '') +
            (orphanedCount > 0 ? `, ${orphanedCount} orphaned (run sigil uninstall)` : '') +
            '.',
        );
      } else {
        console.log('\nDry run complete. No files were written.');
      }
      console.log('');
    },
  );

// ─── uninstall ────────────────────────────────────────────────────────────────

program
  .command('uninstall <ids...>')
  .description(
    'Remove installed artifacts from a consumer project.\n\n' +
      'Deletes the files recorded in .sigil/manifest.json for each artifact.\n' +
      'Shared dependency files (rules/agents) are only deleted when no other\n' +
      'installed artifact depends on them (refcount-aware).\n\n' +
      'Distinct from `sigil delete` (which removes from the catalog SOURCE).\n\n' +
      'Examples:\n' +
      '  sigil uninstall csharp/cs-generate-tests\n' +
      '  sigil uninstall csharp/cs-generate-tests csharp/cs-conventions --yes\n' +
      '  sigil uninstall csharp/cs-generate-tests --dry-run',
  )
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .option('--target <name>', 'Target platform (auto-detected if omitted)')
  .option('--yes', 'Skip confirmation prompt', false)
  .option('--force', 'Remove even drifted (user-modified) files', false)
  .option('--dry-run', 'Preview what would be removed without removing', false)
  .action(
    async (
      ids: string[],
      opts: {
        projectDir: string;
        target?: string;
        yes: boolean;
        force: boolean;
        dryRun: boolean;
      },
    ) => {
      const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });

      let manifest;
      try {
        manifest = loadManifest(opts.projectDir);
      } catch (err) {
        console.error(`✗ ${(err as Error).message}`);
        process.exit(1);
      }

      // Validate all ids exist in the manifest for this target
      const notFound = ids.filter(
        id => !manifest.entries.some(e => e.id === id && e.target === targetName),
      );
      if (notFound.length > 0) {
        console.error(`✗ Not installed (target '${targetName}'): ${notFound.join(', ')}`);
        console.error(`  Run \`sigil status\` to see installed artifacts.`);
        process.exit(1);
      }

      const { pathsToDelete, removedEntries } = removeEntries(manifest, ids, targetName);

      // Separate config entries (need reverseMerge) from whole-file entries
      const configEntriesToRemove = removedEntries.filter(
        e => CONFIG_KINDS.has(e.kind) && e.configFiles && e.configFiles.length > 0,
      );

      // Check for drifted files (whole-file entries only)
      const driftedPaths: string[] = [];
      for (const p of pathsToDelete) {
        const fullPath = path.join(opts.projectDir, p);
        if (!fs.existsSync(fullPath)) continue;
        // Find the recorded hash for this file
        const recorded = removedEntries.flatMap(e => e.files).find(f => f.path === p);
        if (recorded) {
          const diskHash = sha256(fs.readFileSync(fullPath, 'utf-8'));
          if (diskHash !== recorded.sha256) driftedPaths.push(p);
        }
      }

      if (opts.dryRun) {
        console.log(
          `\nDry run — would remove ${pathsToDelete.length} file(s) and reverse ${configEntriesToRemove.length} JSON merge(s):`,
        );
        for (const p of pathsToDelete) {
          const drifted = driftedPaths.includes(p);
          console.log(`  - ${p}${drifted ? '  (drifted)' : ''}`);
        }
        for (const e of configEntriesToRemove) {
          for (const cf of e.configFiles ?? []) {
            console.log(`  ~ ${cf.file}  (JSON reverse-merge for ${e.id})`);
          }
        }
        console.log('\nNo files were removed (--dry-run).');
        return;
      }

      // Prompt if there are drifted files and not --force
      if (driftedPaths.length > 0 && !opts.force) {
        note(
          `${driftedPaths.length} file(s) were modified after install:\n` +
            driftedPaths.map(p => `  ${p}`).join('\n') +
            '\n\nThey will NOT be deleted. Use --force to remove them anyway.',
          '⚠  Drifted files',
        );
      }

      // Confirm
      const isTTY = isInteractiveTTY();
      if (!opts.yes && !isTTY) {
        console.error('✗ stdin/stdout is not interactive. Re-run with --yes to confirm.');
        process.exit(1);
      }
      if (!opts.yes) {
        const ok = await confirm({
          message: `Remove ${ids.join(', ')} from '${targetName}'?`,
          initialValue: false,
        });
        if (isCancel(ok) || !ok) {
          cancel('Uninstall cancelled.');
          return;
        }
      }

      // Delete whole-file kind files
      for (const p of pathsToDelete) {
        if (driftedPaths.includes(p) && !opts.force) continue;
        const fullPath = path.join(opts.projectDir, p);
        try {
          fs.unlinkSync(fullPath);
          // Remove empty parent directories (best-effort)
          const dir = path.dirname(fullPath);
          if (fs.readdirSync(dir).length === 0) {
            fs.rmdirSync(dir);
          }
        } catch {
          // If file was already missing, that's fine
        }
      }

      // Reverse-merge config entries
      let configRemovedCount = 0;
      for (const entry of configEntriesToRemove) {
        for (const cf of entry.configFiles ?? []) {
          const rootDir = resolveConfigRoot(
            (cf.root as ConfigRoot | undefined) ?? 'project',
            opts.projectDir,
          );
          const fullPath = path.join(rootDir, cf.file);
          const isHomeWrite = cf.root === 'home' || cf.root === 'vscode-user';
          const displayPath = isHomeWrite ? fullPath : cf.file;
          if (!fs.existsSync(fullPath)) continue;
          try {
            const live = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
            const op: ConfigMergeOp = {
              file: cf.file,
              root: cf.root as ConfigRoot | undefined,
              fragment: cf.fragment,
              strategy: cf.strategy as Record<string, import('./types').MergeStrategy>,
            };
            const cleaned = reverseMerge(live, op);
            if (Object.keys(cleaned).length === 0) {
              fs.unlinkSync(fullPath);
              console.log(`  - ${displayPath}  (emptied, deleted)`);
            } else {
              fs.writeFileSync(fullPath, serialize(cleaned), 'utf-8');
              console.log(`  ~ ${displayPath}  (JSON reverse-merge applied)`);
            }
            configRemovedCount++;
          } catch (err) {
            console.warn(`  ⚠  Could not reverse-merge ${displayPath}: ${(err as Error).message}`);
          }
        }
      }

      saveManifest(opts.projectDir, manifest);

      const keptCount = opts.force ? 0 : driftedPaths.length;
      console.log(
        `\n✓ Uninstalled: ${ids.join(', ')}` +
          `  (${pathsToDelete.length - keptCount} file(s) removed` +
          (configRemovedCount > 0 ? `, ${configRemovedCount} JSON merge(s) reversed` : '') +
          (driftedPaths.length > 0 && !opts.force
            ? `, ${driftedPaths.length} drifted file(s) kept`
            : '') +
          ')',
      );
      console.log('');
    },
  );

// ─── patch (unified authoring field update, supersedes edit + retarget) ───────

program
  .command('patch <id>')
  .description(
    'Update any field(s) of an existing catalog artifact.\n\n' +
      'Supersedes `edit` (title/description/tags) and `retarget` (platforms:) by\n' +
      'exposing ALL kind-editable fields via a single transactional command.\n\n' +
      'The write is transactional: if the resulting file fails schema or reference\n' +
      'validation, the original is restored automatically.\n\n' +
      'Kind-specific fields:\n' +
      '  skill:    --add-applies-to, --uses-rules, --uses-agents\n' +
      '  rule:     --add-applies-to, --severity, --add-extends\n' +
      '  agent:    --add-tool, --claude-model, --claude-effort, ...\n' +
      '  prompt:   --add-applies-to\n\n' +
      'Examples:\n' +
      '  sigil patch csharp/cs-generate-tests --title "xUnit Testing" --add-tag ci\n' +
      '  sigil patch shared/clean-code --severity required\n' +
      '  sigil patch shared/code-reviewer --claude-model sonnet --claude-effort high\n' +
      '  sigil patch csharp/cs-generate-tests --add-uses-rule shared/clean-code\n' +
      '  sigil patch csharp/cs-conventions --add-platform copilot',
  )
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--yes', 'Non-interactive: apply without prompting', false)
  // ── Scalar fields (all kinds) ────────────────────────────────────────────
  .option('--title <title>', 'New title')
  .option('--description <desc>', 'New description')
  .option('--version <ver>', 'New version string (semver)')
  // ── Tags ─────────────────────────────────────────────────────────────────
  .option('--add-tag <tag>', 'Add a tag')
  .option('--remove-tag <tag>', 'Remove a tag')
  .option('--set-tags <list>', 'Replace all tags (comma-separated)')
  // ── appliesTo (skill, rule, prompt) ──────────────────────────────────────
  .option('--add-applies-to <glob>', 'Add a file glob to appliesTo')
  .option('--remove-applies-to <glob>', 'Remove a file glob from appliesTo')
  .option('--set-applies-to <list>', 'Replace appliesTo (comma-separated globs)')
  // ── Rule fields ───────────────────────────────────────────────────────────
  .option('--severity <level>', 'Set severity: required | recommended | optional (rule only)')
  .option('--add-extends <id>', 'Add a rule id to extends: (rule only)')
  .option('--remove-extends <id>', 'Remove a rule id from extends: (rule only)')
  .option('--set-extends <list>', 'Replace extends: (comma-separated rule ids)')
  // ── Skill fields ──────────────────────────────────────────────────────────
  .option('--add-uses-rule <id>', 'Add a rule id to uses.rules (skill only)')
  .option('--remove-uses-rule <id>', 'Remove a rule id from uses.rules (skill only)')
  .option('--set-uses-rules <list>', 'Replace uses.rules (comma-separated ids)')
  .option('--add-uses-agent <id>', 'Add an agent id to uses.agents (skill only)')
  .option('--remove-uses-agent <id>', 'Remove an agent id from uses.agents (skill only)')
  .option('--set-uses-agents <list>', 'Replace uses.agents (comma-separated ids)')
  // ── Agent fields ──────────────────────────────────────────────────────────
  .option('--add-tool <tool>', 'Add a tool to tools (agent only)')
  .option('--remove-tool <tool>', 'Remove a tool from tools (agent only)')
  .option('--set-tools <list>', 'Replace tools (comma-separated)')
  .option('--add-disallowed-tool <tool>', 'Add to disallowedTools (agent only)')
  .option('--remove-disallowed-tool <tool>', 'Remove from disallowedTools (agent only)')
  .option('--set-disallowed-tools <list>', 'Replace disallowedTools (comma-separated)')
  .option('--claude-model <m>', 'Set claude.model: haiku | sonnet | opus (agent only)')
  .option('--claude-effort <e>', 'Set claude.effort: low | medium | high (agent only)')
  .option('--claude-max-turns <n>', 'Set claude.maxTurns (agent only)', parseInt)
  .option('--claude-isolation <i>', 'Set claude.isolation: worktree (agent only)')
  // ── Platforms (all kinds) — mirrors retarget flags ────────────────────────
  .option('--add-platform <name>', 'Add a platform to platforms:')
  .option('--remove-platform <name>', 'Remove a platform from platforms:')
  .option(
    '--to-platforms <list>',
    'Set platforms: to exactly these (comma-separated, or "all" to reset)',
  )
  .action(runPatch)

// ─── move (alias: rename) ─────────────────────────────────────────────────────

program
  .command('move <id> <new-id>')
  .alias('rename')
  .description(
    'Rename/relocate a catalog artifact and rewrite all referrers.\n\n' +
      'The artifact file (or skill directory) is moved to the canonical path for\n' +
      "the new id, the artifact's `id:` frontmatter is updated, and every other\n" +
      'artifact that references the old id via `extends:`, `uses.rules:`, or\n' +
      '`uses.agents:` has its frontmatter rewritten automatically.\n\n' +
      'The operation is transactional: if post-move validation fails, all changes\n' +
      'are rolled back.\n\n' +
      'Examples:\n' +
      '  sigil move csharp/cs-generate-tests csharp/xunit-test-suite\n' +
      '  sigil move shared/clean-code shared/coding-style --dry-run',
  )
  .option('--catalog-dir <dir>', 'Path to the catalog/ directory', resolveDefault('catalog'))
  .option('--dry-run', 'Preview the move without executing it', false)
  .option('--yes', 'Skip confirmation prompt', false)
  .action(
    async (
      oldId: string,
      newId: string,
      opts: { catalogDir: string; dryRun: boolean; yes: boolean },
    ) => {
      const catalog = await loadCatalog(opts.catalogDir);

      let plan;
      try {
        plan = planMove(oldId, newId, catalog, opts.catalogDir);
      } catch (err) {
        console.error(`✗ ${(err as Error).message}`);
        process.exit(1);
      }

      const summary = summarizePlan(plan);

      if (opts.dryRun) {
        console.log('\nDry run — move plan:');
        for (const m of summary.moves) {
          console.log(`  rename: ${m.from}`);
          console.log(`       → ${m.to}`);
        }
        if (summary.referrerRewrites.length > 0) {
          console.log('\n  Referrers to rewrite:');
          for (const r of summary.referrerRewrites) {
            console.log(`  ~ ${r.file}  (${r.fields.join(', ')})`);
          }
        }
        console.log('\nNo files were changed (--dry-run).');
        return;
      }

      // Confirm
      const isTTY = isInteractiveTTY();
      if (!opts.yes && !isTTY) {
        console.error(`✗ stdin/stdout is not interactive. Re-run with --yes to confirm.`);
        process.exit(1);
      }
      if (!opts.yes) {
        const ok = await confirm({
          message:
            `Move '${oldId}' → '${newId}'?` +
            (plan.referrers.length > 0
              ? ` (${plan.referrers.length} referrer(s) will be rewritten)`
              : ''),
          initialValue: false,
        });
        if (isCancel(ok) || !ok) {
          cancel('Move cancelled.');
          return;
        }
      }

      const result = executeMove(
        plan,
        catalog,
        getAllTargets(),
        (dir: string) => {
          // Synchronous catalog load for post-move validation
          // We construct a minimal interface that checkSourceArtifact needs
          const matter = require('gray-matter');
          const glob = require('fast-glob');
          const absDir = path.resolve(dir);
          const mdFiles: string[] = glob.sync('**/*.md', { cwd: absDir, absolute: true });
          const artifacts: typeof catalog.artifacts = [];
          const byId = new Map<string, (typeof artifacts)[0]>();
          for (const f of mdFiles) {
            try {
              const raw = require('fs').readFileSync(f, 'utf-8');
              const parsed = matter(raw);
              const { id: fmId, kind } = parsed.data as { id?: string; kind?: string };
              if (!fmId || !kind) continue;
              const a = {
                id: fmId,
                kind: kind as never,
                filePath: f,
                frontmatter: parsed.data,
                body: parsed.content,
              };
              artifacts.push(a);
              byId.set(fmId, a);
            } catch {
              // Skip unparseable files during post-move validation
            }
          }
          return { artifacts, byId, languages: new Map() } as typeof catalog;
        },
        opts.catalogDir,
      );

      if (!result.ok) {
        console.error('✗ Move failed (rolled back):');
        for (const e of result.errors) console.error(`  ${e}`);
        process.exit(1);
      }

      console.log(`\n✓ Moved '${oldId}' → '${newId}'`);
      for (const f of result.changed) console.log(`  ✓ ${f}`);
      console.log('\n  Next: npm run validate  (to confirm catalog integrity)');
    },
  );

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
      '  sigil retarget csharp/cs-generate-tests --add copilot\n' +
      '  sigil retarget shared/explain-diff --remove claude\n' +
      '  sigil retarget csharp/cs-conventions --to all      # reset to all AIs\n' +
      '  sigil retarget csharp/cs-conventions --to claude   # restrict to Claude only',
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
      'This command is a focused alias for `sigil patch` — it edits only the three\n' +
      'common metadata fields. Use `sigil patch <id>` to update any other field.\n\n' +
      '  • To change platforms: use `sigil patch <id> --add-platform / --to-platforms`\n' +
      '  • To edit the body:    open the file directly, then run `sigil check <id>`\n\n' +
      'When run in an interactive terminal the wizard pre-fills each prompt with\n' +
      "the current value so you only need to change what's wrong.\n\n" +
      'Examples:\n' +
      '  sigil edit csharp/cs-generate-tests                              # guided\n' +
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
      '  sigil delete csharp/cs-generate-tests           # prompts for confirmation\n' +
      '  sigil delete shared/explain-diff --yes      # non-interactive\n' +
      '  sigil delete csharp/cs-conventions --dry-run  # preview only',
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

    // Flag-value completions — derived from the registry so new targets appear automatically.
    if (prev === '--target') {
      process.stdout.write(getAllTargets().map(t => t.name).join('\n') + '\n');
      return;
    }
    if (prev === '--kind' || prev === '--exclude') {
      process.stdout.write('skill\nagent\nrule\nprompt\nworkflow\n');
      return;
    }

    const catalog = await loadCatalog(opts.catalogDir).catch(() => null);
    const packsConfig = fs.existsSync(opts.packs)
      ? (yaml.load(fs.readFileSync(opts.packs, 'utf-8'), { schema: yaml.JSON_SCHEMA }) as PacksConfig)
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
        const ISO_DATE_LEN = 10; // 'YYYY-MM-DD'
        const today = new Date().toISOString().slice(0, ISO_DATE_LEN);
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
        // Use execFileSync + arg arrays (not execSync with a shell string) to prevent
        // shell-injection if filesToAdd paths or nextVersion contain special characters.
        execFileSync('git', ['add', ...filesToAdd], { cwd: PKG_ROOT, stdio: 'pipe' });
        execFileSync('git', ['commit', '-m', `release: v${nextVersion}`], { cwd: PKG_ROOT, stdio: 'pipe' });
        execFileSync('git', ['tag', `v${nextVersion}`], { cwd: PKG_ROOT, stdio: 'pipe' });
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
