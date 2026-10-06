#!/usr/bin/env node
/* eslint-disable max-lines -- one flat sequence of .command() registrations by design
   (see docs/decisions — "slim cli.ts to pure Commander wiring"); splitting it into
   per-command files would reintroduce the indirection that refactor deliberately removed. */
/** sigil CLI — Commander wiring only. Business logic lives in src/commands/<name>.ts. @module */
import { Command, Help } from 'commander';
import { getAllTargets } from './targets';
import { resolveDefault, describePathDefaults, pkg } from './cli-helpers';
import { ALL_KINDS } from './kinds';
import { handleFatal } from './cli-error';
import type { AddOpts } from './commands/add';
import type { InitOptions } from './commands/init';

/**
 * Wraps a command so its module loads the first time the command runs. Loading all of them up front
 * cost about 95 ms on every start, including `sigil --version` and `sigil <command> --help`.
 */
function lazy<A extends unknown[]>(load: () => Promise<(...args: A) => unknown>) {
  return async (...args: A): Promise<void> => {
    const run = await load();
    await run(...args);
  };
}

const program = new Command();
program
  .name('sigil')
  .description(
    'Vendor-neutral AI skills, agents, and rules — compile to Claude Code, Copilot, and more.',
  )
  .version(pkg.version)
  // Must precede every .command(): subcommands copy this setting when they are created.
  .exitOverride();

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
  .action(lazy(async () => (await import('./commands/build')).runBuild));
// ─── validate ─────────────────────────────────────────────────────────────────
program
  .command('validate')
  .description(
    'Validate all catalog artifacts (schema + reference integrity). Exits non-zero on errors.',
  )
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .action(lazy(async () => (await import('./commands/validate')).runValidate));
// ─── index ────────────────────────────────────────────────────────────────────
program
  .command('index')
  .description('Emit dist/registry.json — flat per-artifact index with sha256 + facets.')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--out-dir <dir>', 'Output root', resolveDefault('dist'))
  .option('--json', 'Print the registry to stdout instead of writing a file')
  .action(lazy(async () => (await import('./commands/index')).runIndex));
// ─── list ─────────────────────────────────────────────────────────────────────
program
  .command('list')
  .description('List catalog artifacts, optionally filtered by language and/or kind.')
  .option('--language <lang>', 'Filter by language (e.g. csharp, python)')
  .option('--kind <kind>', `Filter by kind (${ALL_KINDS.join(', ')})`)
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .action(lazy(async () => (await import('./commands/list')).runList));
// ─── get ──────────────────────────────────────────────────────────────────────
program
  .command('get <id>')
  .alias('show')
  .description('Show full detail for a single catalog artifact (closure, targets, dest paths).')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--json', 'Output as JSON', false)
  .action(lazy(async () => (await import('./commands/get')).runGet));
// ─── search ───────────────────────────────────────────────────────────────────
program
  .command('search <query>')
  .description('Free-text search the catalog (id, title, description, tags). Ranked results.')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--kind <kind>', 'Filter to this kind')
  .option('--language <lang>', 'Filter to this language')
  .option('--tag <tag>', 'Filter to artifacts with this tag (substring match)')
  .option('--json', 'Output as JSON', false)
  .action(lazy(async () => (await import('./commands/search')).runSearch));
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
  .action(async (selectors: string[], opts: AddOpts) => {
    await (await import('./commands/add')).runAdd(selectors, opts);
  });
// ─── init ─────────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Prepare a consumer project for a target platform. Asks which one in a terminal.')
  .option('--target <name>', 'Target platform: claude or copilot (asked in a terminal if omitted)')
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .action(async (opts: InitOptions) => {
    await (await import('./commands/init')).runInit(opts);
  });
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
  .action(lazy(async () => (await import('./commands/new')).runNew));
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
  .action(lazy(async () => (await import('./commands/check')).runCheck));
// ─── sync ─────────────────────────────────────────────────────────────────────
program
  .command('sync [template-id]')
  .description(
    'Report (default) / --check (CI gate) / --apply (write) drift between catalog artifacts ' +
      'and the template they declare via template:, PLUS conformance against the current ' +
      'provider standard (src/targets/doc-refs.ts + KindEmitSpecs) and the catalog standard ' +
      '(catalog/standard.yaml: families, stacks). Scope template drift to one ' +
      'template id, or omit for all; scope conformance with --rule/--kind/--language/--provider.',
  )
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--check', 'Exit non-zero if any drift or conformance error is found (CI gate)', false)
  .option('--apply', 'Write the mechanical fixes; refuses on a dirty working tree', false)
  .option(
    '--editorial',
    'With --apply, also run the model-backed conformance pass (requires ANTHROPIC_API_KEY)',
    false,
  )
  .option('--changed-since <ref>', 'Scope to templates touched since this git ref')
  .option(
    '--stale <months>',
    'Flag template + provider-spec docs[] not verified within N months',
    '6',
  )
  .option('--rule <id>', 'Scope conformance to one rule id')
  .option('--kind <kind>', 'Scope conformance to one artifact kind')
  .option('--language <lang>', 'Scope conformance to one language')
  .option('--provider <name>', 'Scope conformance to one target/provider name')
  .option('--json', 'Output as JSON', false)
  .action(async (templateId: string | undefined, options) =>
    (await import('./commands/sync')).runSync(templateId, {
      catalogDir: options.catalogDir,
      packsFile: options.packs,
      changedSince: options.changedSince,
      staleMonths: Number(options.stale),
      json: options.json,
      check: options.check,
      apply: options.apply,
      editorial: options.editorial,
      ruleId: options.rule,
      kind: options.kind,
      language: options.language,
      provider: options.provider,
    }),
  );
// ─── import ───────────────────────────────────────────────────────────────────
program
  .command('import <source-dir>')
  .description(
    'Import a portable Claude template directory into the catalog as first-class artifacts.',
  )
  .option('--language <lang>', 'Target language key (e.g. csharp, typescript)')
  .option('--shared', 'Import into catalog/shared/ (no language); use instead of --language', false)
  .option('--display-name <name>', 'Override the language display name in generated titles')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--dry-run', 'Preview only — print coverage report without writing', false)
  .option('--yes', 'Non-interactive mode', false)
  .option('--overwrite', 'Overwrite existing catalog files', false)
  .option('--create-language', 'Create language.yaml when it does not exist', false)
  .action(lazy(async () => (await import('./commands/import')).runImport));
// ─── status ───────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show health status of artifacts installed in a consumer project.')
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .option('--target <name>', 'Target platform (auto-detected if omitted)')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--json', 'Output as JSON', false)
  .action(lazy(async () => (await import('./commands/status')).runStatus));
// ─── update ───────────────────────────────────────────────────────────────────
program
  .command('update [ids...]')
  .description(
    'Refresh installed artifacts to the current bundled catalog version, including hook/settings/mcp fragments the catalog changed. Skips drifted files and edited config values unless --force. In a terminal it previews and asks before writing.',
  )
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .option('--target <name>', 'Target platform (auto-detected if omitted)')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--force', 'Overwrite drifted (user-modified) files', false)
  .option('--dry-run', 'Preview what would change without writing', false)
  .option('--yes', 'Apply without previewing and asking first (a terminal asks by default)', false)
  .action(lazy(async () => (await import('./commands/update')).runUpdate));
// ─── prune ────────────────────────────────────────────────────────────────────
program
  .command('prune')
  .description(
    "Report (default) / --apply (write) cleanup of a project's manifest: removes orphaned " +
      'artifacts (no longer in the bundled catalog) and reports deprecated-but-installed ones.',
  )
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .option('--target <name>', 'Target platform (auto-detected if omitted)')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .option('--apply', 'Remove orphaned artifacts (preview-only without this flag)', false)
  .option('--yes', 'Skip confirmation prompt', false)
  .option('--force', 'Remove even drifted (user-modified) orphaned files', false)
  .option('--json', 'Output as JSON', false)
  .action(lazy(async () => (await import('./commands/prune')).runPrune));
// ─── uninstall ────────────────────────────────────────────────────────────────
program
  .command('uninstall [ids...]')
  .description(
    'Remove installed artifacts from a consumer project. Refcount-aware: shared deps only removed when no dependents remain.',
  )
  .option('--project-dir <dir>', 'Consumer project root', process.cwd())
  .option('--target <name>', 'Target platform (auto-detected if omitted)')
  .option('--yes', 'Skip confirmation prompt', false)
  .option('--force', 'Remove even drifted (user-modified) files', false)
  .option('--dry-run', 'Preview without removing', false)
  .action(lazy(async () => (await import('./commands/uninstall')).runUninstall));
// ─── patch ────────────────────────────────────────────────────────────────────
const patchCmd = program
  .command('patch <id>')
  .description(
    'Update any field(s) of an existing catalog artifact. Transactional: rolls back on validation failure.',
  )
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--yes', 'Non-interactive: apply without prompting', false)
  .option('--title <title>', 'New title')
  .option('--description <desc>', 'New description')
  .option('--add-tag <tag>', 'Add a tag')
  .option('--remove-tag <tag>', 'Remove a tag')
  .option('--set-tags <list>', 'Replace all tags (comma-separated)')
  .option('--add-applies-to <glob>', 'Add a file glob to appliesTo')
  .option('--remove-applies-to <glob>', 'Remove a file glob from appliesTo')
  .option('--set-applies-to <list>', 'Replace appliesTo (comma-separated globs)')
  .option(
    '--set-applies-to-rationale <text>',
    'Justify a deliberately unscoped appliesTo: ["**/*"] (rule only; empty string clears it)',
  )
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
  .option('--set-disallowed-tools <list>', 'Replace disallowedTools (comma-separated, agent only)');
// Platform-namespaced authoring fields (e.g. --claude-model) are declared by each target
// adapter's `authoringFields`, not hardcoded here — adding a target with its own authoring
// surface requires no cli.ts changes.
for (const t of getAllTargets()) {
  for (const f of t.authoringFields ?? []) {
    const flags = `--${t.name}-${f.key} <value>`;
    if (f.type === 'int') {
      patchCmd.option(flags, f.description, parseInt);
    } else {
      patchCmd.option(flags, f.description);
    }
  }
}
patchCmd
  .option('--add-platform <name>', 'Add a platform to platforms:')
  .option('--remove-platform <name>', 'Remove a platform from platforms:')
  .option(
    '--to-platforms <list>',
    'Set platforms: to exactly these (comma-separated, or "all" to reset)',
  )
  .action(lazy(async () => (await import('./commands/patch')).runPatch));
// ─── move ─────────────────────────────────────────────────────────────────────
program
  .command('move <id> <new-id>')
  .alias('rename')
  .description(
    'Rename/relocate a catalog artifact and rewrite its extends/uses referrers. Transactional: rolls back on failure.',
  )
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--dry-run', 'Preview the move without executing', false)
  .option('--yes', 'Skip confirmation prompt', false)
  .action(lazy(async () => (await import('./commands/move')).runMove));
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
  .action(lazy(async () => (await import('./commands/retarget')).runRetarget));
// ─── edit ─────────────────────────────────────────────────────────────────────
program
  .command('edit <id>')
  .description('Update title, description, and tags. Use `sigil patch` for all other fields.')
  .option('--title <title>', 'New title (replaces existing)')
  .option('--description <desc>', 'New description (replaces existing)')
  .option('--tags <list>', 'Comma-separated tags (replaces existing)')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--yes', 'Non-interactive: apply flags without prompting')
  .action(lazy(async () => (await import('./commands/edit')).runEdit));
// ─── delete ───────────────────────────────────────────────────────────────────
program
  .command('delete <id>')
  .alias('remove')
  .description('Remove a catalog artifact from the source. Prompts for confirmation unless --yes.')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--yes', 'Skip confirmation prompt')
  .option('--dry-run', 'Preview what would be deleted without deleting')
  .action(lazy(async () => (await import('./commands/delete')).runDelete));
// ─── completion ───────────────────────────────────────────────────────────────
program
  .command('completion [shell]')
  .description('Print a shell tab-completion script (bash, zsh, or fish).')
  .action(lazy(async () => (await import('./commands/completion')).runCompletion));
// ─── __complete (hidden — called by completion scripts) ───────────────────────
program
  .command('__complete', { hidden: true })
  .argument('[word]', 'Current word being completed', '')
  .option('--prev <value>', 'Previous word/flag on the command line', '')
  .option('--catalog-dir <dir>', 'Path to catalog/', resolveDefault('catalog'))
  .option('--packs <file>', 'Path to packs.yaml', resolveDefault('packs.yaml'))
  .action(lazy(async () => (await import('./commands/complete')).runComplete));
// ─── release ──────────────────────────────────────────────────────────────────
program
  .command('release [level]')
  .description(
    'Bump version (patch|minor|major|x.y.z), rebuild, update CHANGELOG, commit + tag. Does NOT push.',
  )
  .option('--dry-run', 'Print every step and computed version; write nothing')
  .option('--no-verify', 'Skip the release gate, npm run ci:local (escape hatch)')
  .option('--yes', 'Non-interactive; skip the confirmation prompt (required when not a TTY)')
  .action(lazy(async () => (await import('./commands/release')).runRelease));

// ─── root help layout ─────────────────────────────────────────────────────────
// Root help is a menu, so each command gets a task group and a summary short enough to stay on one
// line in an 80-column terminal. `<command> --help` still prints the full description.
const START = 'Start here:';
const BROWSE = 'Browse the catalog:';
const AUTHOR = 'Author the catalog:';
const BUILD = 'Build & release:';
const HELP_LAYOUT: Readonly<Record<string, { group: string; summary: string }>> = {
  add: { group: START, summary: 'Install artifacts (guided with no id)' },
  init: { group: START, summary: 'Prepare a project for a target' },
  status: { group: START, summary: 'Show health of installed artifacts' },
  update: { group: START, summary: 'Refresh installed artifacts' },
  uninstall: { group: START, summary: 'Remove installed artifacts' },
  prune: { group: START, summary: 'Clean up orphaned manifest entries' },
  list: { group: BROWSE, summary: 'List catalog artifacts' },
  search: { group: BROWSE, summary: 'Search the catalog by keyword' },
  get: { group: BROWSE, summary: 'Show one artifact in detail' },
  new: { group: AUTHOR, summary: 'Create a new catalog artifact' },
  edit: { group: AUTHOR, summary: 'Edit title, description, tags' },
  patch: { group: AUTHOR, summary: 'Change fields of a catalog artifact' },
  move: { group: AUTHOR, summary: 'Rename or relocate an artifact' },
  retarget: { group: AUTHOR, summary: "Change an artifact's platforms" },
  delete: { group: AUTHOR, summary: 'Remove an artifact from the catalog' },
  check: { group: AUTHOR, summary: 'Validate catalog source files' },
  import: { group: AUTHOR, summary: 'Import a Claude template directory' },
  sync: { group: AUTHOR, summary: 'Check catalog vs templates/standards' },
  validate: { group: AUTHOR, summary: 'Check the catalog (schema + references)' },
  build: { group: BUILD, summary: 'Compile the catalog to dist/<target>/' },
  index: { group: BUILD, summary: 'Write dist/registry.json' },
  release: { group: BUILD, summary: 'Bump version, tag (does not push)' },
  completion: { group: BUILD, summary: 'Print a shell completion script' },
};
for (const command of program.commands) {
  const layout = HELP_LAYOUT[command.name()];
  if (layout) command.helpGroup(layout.group).summary(layout.summary);
}
// Commander lists groups in registration order; list them in HELP_LAYOUT order instead.
const helpOrder = Object.keys(HELP_LAYOUT);
const orderOf = (name: string): number => {
  const index = helpOrder.indexOf(name);
  return index === -1 ? helpOrder.length : index;
};
const groupOrder = [START, BROWSE, AUTHOR, BUILD];
const groupRank = (heading: string): number => {
  const index = groupOrder.indexOf(heading);
  return index === -1 ? groupOrder.length : index;
};
program.configureHelp({
  visibleCommands: cmd =>
    new Help().visibleCommands(cmd).sort((a, b) => orderOf(a.name()) - orderOf(b.name())),
  groupItems: (unsortedItems, visibleItems, getGroup) =>
    new Map(
      [...new Help().groupItems(unsortedItems, visibleItems, getGroup)].sort(
        ([a], [b]) => groupRank(a) - groupRank(b),
      ),
    ),
});
program.addHelpText(
  'after',
  `
Getting started:
  Run \`sigil\` with no command for a guided menu that checks this folder.
  Use \`sigil <command> --help\` for a command's options and defaults.
  From a clone, use \`npm run sigil -- <command>\`. The \`--\` is required.
  Without it, npm keeps flags such as --help for itself.`,
);

/** Bare `sigil`: the guided menu in a terminal, help on stdout everywhere else. */
async function runBare(): Promise<void> {
  const { isInteractiveTTY } = await import('./wizard');
  if (!isInteractiveTTY()) {
    program.outputHelp();
    return;
  }
  const [{ runHome }, { defaultHomeDeps }] = await Promise.all([
    import('./wizard/home'),
    import('./wizard/home-actions'),
  ]);
  await runHome(
    process.cwd(),
    defaultHomeDeps(() => program.outputHelp()),
  );
}

describePathDefaults(program);
const NODE_AND_SCRIPT_ARGS = 2; // argv[0] = node, argv[1] = this script
if (process.argv.length <= NODE_AND_SCRIPT_ARGS) {
  // Bare `sigil`. Handled before parsing: a root .action() would swallow mistyped commands.
  // In a terminal that is the guided menu; elsewhere help goes to stdout with exit 0 (Commander's
  // default is stderr + exit 1, which reads as a failure).
  runBare().catch(handleFatal);
} else {
  program.parseAsync(process.argv).catch(handleFatal);
}
