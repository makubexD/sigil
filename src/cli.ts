#!/usr/bin/env node
/** sigil CLI — Commander wiring only. Business logic lives in src/commands/<name>.ts. @module */
import { Command } from 'commander';
import { getAllTargets } from './targets';
import { resolveDefault, pkg } from './cli-helpers';
import { runBuild } from './commands/build';
import { runValidate } from './commands/validate';
import { runIndex } from './commands/index';
import { runList } from './commands/list';
import { runGet } from './commands/get';
import { runSearch } from './commands/search';
import { runAdd } from './commands/add';
import { runInit } from './commands/init';
import { runNew } from './commands/new';
import { runCheck } from './commands/check';
import { runImport } from './commands/import';
import { runStatus } from './commands/status';
import { runUpdate } from './commands/update';
import { runUninstall } from './commands/uninstall';
import { runPatch } from './commands/patch';
import { runMove } from './commands/move';
import { runRetarget } from './commands/retarget';
import { runEdit } from './commands/edit';
import { runDelete } from './commands/delete';
import { runCompletion } from './commands/completion';
import { runComplete } from './commands/complete';
import { runRelease } from './commands/release';

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
    `Platform to emit (${getAllTargets()
      .map(t => t.name)
      .join(', ')}, all)`,
    'all',
  )
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--out-dir <dir>', 'Output root', resolveDefault('dist'))
  .action(runBuild);
// ─── validate ─────────────────────────────────────────────────────────────────
program
  .command('validate')
  .description(
    'Validate all catalog artifacts (schema + reference integrity). Exits non-zero on errors.',
  )
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .action(runValidate);
// ─── index ────────────────────────────────────────────────────────────────────
program
  .command('index')
  .description('Emit dist/registry.json — flat per-artifact index with sha256 + facets.')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--out-dir <dir>', 'Output root', resolveDefault('dist'))
  .option('--json', 'Print the registry to stdout instead of writing a file')
  .action(runIndex);
// ─── list ─────────────────────────────────────────────────────────────────────
program
  .command('list')
  .description('List catalog artifacts, optionally filtered by language and/or kind.')
  .option('--language <lang>', 'Filter by language (e.g. csharp, python)')
  .option('--kind <kind>', 'Filter by kind (skill, agent, rule, prompt, workflow)')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .action(runList);
// ─── get ──────────────────────────────────────────────────────────────────────
program
  .command('get <id>')
  .alias('show')
  .description('Show full detail for a single catalog artifact (closure, targets, dest paths).')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--json', 'Output as JSON', false)
  .action(runGet);
// ─── search ───────────────────────────────────────────────────────────────────
program
  .command('search <query>')
  .description('Free-text search the catalog (id, title, description, tags). Ranked results.')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--kind <kind>', 'Filter to this kind')
  .option('--language <lang>', 'Filter to this language')
  .option('--tag <tag>', 'Filter to artifacts with this tag (substring match)')
  .option('--json', 'Output as JSON', false)
  .action(runSearch);
// ─── add ──────────────────────────────────────────────────────────────────────
program
  .command('add [selectors...]')
  .description(
    'Scaffold artifact(s) + their dependency closure into a consumer project. Runs a guided wizard when called with no selector in a TTY.',
  )
  .option('--target <name>', 'Target platform (auto-detected if omitted)')
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--kind <list>', 'Comma-separated kinds to include after selector expansion')
  .option('--exclude <list>', 'Comma-separated kinds to exclude after selector expansion')
  .option('--language <lang>', 'Restrict to a specific language')
  .option('--no-deps', 'Skip the uses closure (skill only, no rule/agent deps)')
  .option('--dry-run', 'Preview what would be written without writing any files', false)
  .option('-i, --interactive', 'Force the interactive guided installer', false)
  .option('--yes', 'Non-interactive mode; skip the wizard. Safe for CI.', false)
  .option('--overwrite', 'Replace existing files (default: warn and skip conflicts)', false)
  .option('--scope <scope>', 'Install scope for config-kind artifacts: project | local | user')
  .option('--settings-local', '(deprecated) Alias for --scope local', false)
  .action(runAdd);
// ─── init ─────────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Prepare a consumer project for a target platform.')
  .requiredOption('--target <name>', 'Target platform: claude or copilot')
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .action(runInit);
// ─── new ──────────────────────────────────────────────────────────────────────
program
  .command('new [kind]')
  .description(
    'Scaffold an authoring template for a new catalog artifact. Runs a guided wizard when called with no args in a TTY.',
  )
  .option('--language <lang>', 'Language (e.g. csharp). Omit for shared.')
  .option('--name <name>', 'Artifact name (kebab-case)')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--platforms <list>', 'Comma-separated platforms to restrict to.')
  .option('--yes', 'Non-interactive: skip wizard. Requires explicit kind and --name.')
  .option('-i, --interactive', 'Force the guided wizard even when kind is provided.')
  .action(runNew);
// ─── check ────────────────────────────────────────────────────────────────────
program
  .command('check [files...]')
  .description(
    'Validate catalog source artifact files (schema, id/path/language, references, platforms). Exits non-zero on violations.',
  )
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--schema-only', 'Only run zod schema validation', false)
  .option(
    '--trust',
    'Run the trust/security scanner (secret detection + injection heuristics)',
    false,
  )
  .option('--strict', 'Exit non-zero on trust warnings (requires --trust)', false)
  .action(runCheck);
// ─── import ───────────────────────────────────────────────────────────────────
program
  .command('import <source-dir>')
  .description(
    'Import a portable Claude template directory into the catalog as first-class artifacts.',
  )
  .requiredOption('--language <lang>', 'Target language key (e.g. csharp, typescript)')
  .option('--display-name <name>', 'Override the language display name in generated titles')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--dry-run', 'Preview only — print coverage report without writing', false)
  .option('--yes', 'Non-interactive mode', false)
  .option('--overwrite', 'Overwrite existing catalog files', false)
  .option('--create-language', 'Create language.yaml when it does not exist', false)
  .action(runImport);
// ─── status ───────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show health status of artifacts installed in a consumer project.')
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .option('--target <name>', 'Target platform (auto-detected if omitted)')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--json', 'Output as JSON', false)
  .action(runStatus);
// ─── update ───────────────────────────────────────────────────────────────────
program
  .command('update [ids...]')
  .description(
    'Refresh installed artifacts to the current bundled catalog version. Skips drifted files unless --force.',
  )
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .option('--target <name>', 'Target platform (auto-detected if omitted)')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--force', 'Overwrite drifted (user-modified) files', false)
  .option('--dry-run', 'Preview what would change without writing', false)
  .action(runUpdate);
// ─── uninstall ────────────────────────────────────────────────────────────────
program
  .command('uninstall <ids...>')
  .description(
    'Remove installed artifacts from a consumer project. Refcount-aware: shared deps only removed when no dependents remain.',
  )
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .option('--target <name>', 'Target platform (auto-detected if omitted)')
  .option('--yes', 'Skip confirmation prompt', false)
  .option('--force', 'Remove even drifted (user-modified) files', false)
  .option('--dry-run', 'Preview without removing', false)
  .action(runUninstall);
// ─── patch ────────────────────────────────────────────────────────────────────
program
  .command('patch <id>')
  .description(
    'Update any field(s) of an existing catalog artifact. Transactional: rolls back on validation failure.',
  )
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--yes', 'Non-interactive: apply without prompting', false)
  .option('--title <title>', 'New title')
  .option('--description <desc>', 'New description')
  .option('--version <ver>', 'New version string (semver)')
  .option('--add-tag <tag>', 'Add a tag')
  .option('--remove-tag <tag>', 'Remove a tag')
  .option('--set-tags <list>', 'Replace all tags (comma-separated)')
  .option('--add-applies-to <glob>', 'Add a file glob to appliesTo')
  .option('--remove-applies-to <glob>', 'Remove a file glob from appliesTo')
  .option('--set-applies-to <list>', 'Replace appliesTo (comma-separated globs)')
  .option('--severity <level>', 'Set severity: required | recommended | optional (rule only)')
  .option('--add-extends <id>', 'Add a rule id to extends: (rule only)')
  .option('--remove-extends <id>', 'Remove a rule id from extends: (rule only)')
  .option('--set-extends <list>', 'Replace extends: (comma-separated rule ids, rule only)')
  .option('--add-uses-rule <id>', 'Add a rule id to uses.rules (skill only)')
  .option('--remove-uses-rule <id>', 'Remove a rule id from uses.rules (skill only)')
  .option('--set-uses-rules <list>', 'Replace uses.rules (comma-separated ids, skill only)')
  .option('--add-uses-agent <id>', 'Add an agent id to uses.agents (skill only)')
  .option('--remove-uses-agent <id>', 'Remove an agent id from uses.agents (skill only)')
  .option('--set-uses-agents <list>', 'Replace uses.agents (comma-separated ids, skill only)')
  .option('--add-tool <tool>', 'Add a tool to tools (agent only)')
  .option('--remove-tool <tool>', 'Remove a tool from tools (agent only)')
  .option('--set-tools <list>', 'Replace tools (comma-separated, agent only)')
  .option('--add-disallowed-tool <tool>', 'Add to disallowedTools (agent only)')
  .option('--remove-disallowed-tool <tool>', 'Remove from disallowedTools (agent only)')
  .option('--set-disallowed-tools <list>', 'Replace disallowedTools (comma-separated, agent only)')
  .option('--claude-model <m>', 'Set claude.model: haiku | sonnet | opus (agent only)')
  .option('--claude-effort <e>', 'Set claude.effort: low | medium | high (agent only)')
  .option('--claude-max-turns <n>', 'Set claude.maxTurns (agent only)', parseInt)
  .option('--claude-isolation <i>', 'Set claude.isolation: worktree (agent only)')
  .option('--add-platform <name>', 'Add a platform to platforms:')
  .option('--remove-platform <name>', 'Remove a platform from platforms:')
  .option(
    '--to-platforms <list>',
    'Set platforms: to exactly these (comma-separated, or "all" to reset)',
  )
  .action(runPatch);
// ─── move ─────────────────────────────────────────────────────────────────────
program
  .command('move <id> <new-id>')
  .alias('rename')
  .description(
    'Rename/relocate a catalog artifact and rewrite all referrers. Transactional: rolls back on failure.',
  )
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--dry-run', 'Preview the move without executing', false)
  .option('--yes', 'Skip confirmation prompt', false)
  .action(runMove);
// ─── retarget ─────────────────────────────────────────────────────────────────
program
  .command('retarget <id>')
  .description('Change platform targeting of a catalog artifact without touching its body.')
  .option('--add <platforms>', 'Comma-separated platforms to add')
  .option('--remove <platforms>', 'Comma-separated platforms to remove')
  .option('--to <platforms>', 'Set targeting to exactly these (comma-separated, or "all" to reset)')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--yes', 'Skip confirmation prompt', false)
  .option('--with-deps', "Also apply the targeting change to the artifact's uses: closure", false)
  .action(runRetarget);
// ─── edit ─────────────────────────────────────────────────────────────────────
program
  .command('edit <id>')
  .description('Update title, description, and tags. Use `sigil patch` for all other fields.')
  .option('--title <title>', 'New title (replaces existing)')
  .option('--description <desc>', 'New description (replaces existing)')
  .option('--tags <list>', 'Comma-separated tags (replaces existing)')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--yes', 'Non-interactive: apply flags without prompting')
  .action(runEdit);
// ─── delete ───────────────────────────────────────────────────────────────────
program
  .command('delete <id>')
  .alias('remove')
  .description('Remove a catalog artifact from the source. Prompts for confirmation unless --yes.')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--yes', 'Skip confirmation prompt')
  .option('--dry-run', 'Preview what would be deleted without deleting')
  .action(runDelete);
// ─── completion ───────────────────────────────────────────────────────────────
program
  .command('completion [shell]')
  .description('Print a shell tab-completion script (bash, zsh, or fish).')
  .action(runCompletion);
// ─── __complete (hidden — called by completion scripts) ───────────────────────
program
  .command('__complete', { hidden: true })
  .argument('[word]', 'Current word being completed', '')
  .option('--prev <value>', 'Previous word/flag on the command line', '')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .action(runComplete);
// ─── release ──────────────────────────────────────────────────────────────────
program
  .command('release [level]')
  .description(
    'Bump version (patch|minor|major|x.y.z), rebuild, update CHANGELOG, commit + tag. Does NOT push.',
  )
  .option('--dry-run', 'Print every step and computed version; write nothing')
  .option('--no-verify', 'Skip the build/validate/test gate (escape hatch)')
  .option('--yes', 'Non-interactive; skip the confirmation prompt (required when not a TTY)')
  .action(runRelease);

program.parse(process.argv);
