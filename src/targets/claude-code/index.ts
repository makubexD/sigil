/**
 * Claude Code target adapter.
 *
 * Full build (compile): generates a git-based marketplace layout under dist/claude/.
 *   dist/claude/
 *     .claude-plugin/marketplace.json     ← /plugin marketplace add ./dist/claude
 *     plugins/
 *       <pack-name>/
 *         .claude-plugin/plugin.json
 *         skills/<skill-name>/SKILL.md    ← rule bodies inlined as "## Applied Rules"
 *         agents/<agent-name>.md          ← claude: frontmatter applied
 *
 * Scaffold (add): writes into the consumer's .claude/ directory using Claude Code's
 *   native project-scope layout, where rules are first-class (.claude/rules/*.md).
 *   .claude/
 *     skills/<skill-name>/SKILL.md
 *     rules/<rule-name>.md
 *     agents/<agent-name>.md
 *
 * NOTE on rules in plugin build vs. scaffold:
 *   Claude Code plugins cannot ship loose rules — they only load context via skills/agents/hooks.
 *   So in the plugin build we fold rule bodies into the skill's SKILL.md.
 *   In the scaffold build we write rules to .claude/rules/*.md, which Claude Code loads natively.
 *
 * Sub-modules:
 *   config       — ConfigDestination, resolveClaudeConfigDestination
 *   plugin-build — getPackArtifacts, buildPlugin, buildPluginSkillMd, buildAgentMd, buildWorkflowMd
 *   scaffold     — scaffoldSkill, scaffoldRule, scaffoldAgent, scaffoldPrompt, scaffoldWorkflow
 */
import type {
  Target,
  ResolvedCatalog,
  FileMap,
  CompileOptions,
  ScaffoldOptions,
  ConfigMergeOp,
  ConfigScope,
  ConfigKind,
  ConfigScopeInfo,
  ArtifactKind,
  KindVocabulary,
  ContractEntry,
  MergeStrategy,
} from '../../types';
import path from 'path';
import { resolveConfigRoot } from '../../config-utils';
import { resolveClaudeConfigDestination, CLAUDE_MCP_SERVERS_KEY } from './config';
import { getPackArtifacts, buildPlugin } from './plugin-build';
import {
  scaffoldSkill,
  scaffoldRule,
  scaffoldAgent,
  scaffoldPrompt,
  scaffoldWorkflow,
} from './scaffold';

export { ConfigDestination, resolveClaudeConfigDestination } from './config';

export class ClaudeCodeTarget implements Target {
  readonly name = 'claude';

  readonly supportedKinds: ArtifactKind[] = [
    'skill',
    'agent',
    'rule',
    'prompt',
    'workflow',
    'hook',
    'settings',
    'mcp',
  ];

  /** Directories created by `sigil init --target claude`. */
  readonly initDirs: string[] = [
    '.claude/skills',
    '.claude/rules',
    '.claude/agents',
    '.claude/commands',
  ];

  /** Presence of .claude/ signals this target is installed in the project. */
  readonly projectMarkers: string[] = ['.claude'];

  /**
   * Claude Code's native artifact vocabulary (verified June 2026).
   * A catalog `prompt` maps to a *custom command* on Claude Code — "prompt" is not a
   * Claude Code artifact type. Custom commands are single-file skills; both `.claude/commands/`
   * and `.claude/skills/` are permanently supported (docs.claude.com/en/skills).
   */
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = {
    skill: { noun: 'skill', plural: 'Skills', hint: 'procedural how-to guides for the AI' },
    agent: { noun: 'agent', plural: 'Agents', hint: 'specialised AI personas (subagents)' },
    rule: { noun: 'rule', plural: 'Rules', hint: 'coding style guidelines loaded as memory' },
    prompt: {
      noun: 'command',
      plural: 'Commands',
      hint: 'custom commands invoked with /name in Claude Code',
    },
    workflow: { noun: 'workflow', plural: 'Workflows', hint: 'multi-step automated workflows' },
    hook: { noun: 'hook', plural: 'Hooks', hint: 'event hooks (pre/post-tool, stop, etc.)' },
    settings: { noun: 'setting', plural: 'Settings', hint: 'settings.json fragments' },
    mcp: { noun: 'MCP server', plural: 'MCPs', hint: 'external MCP servers' },
  };

  /**
   * Claude Code config scopes, ordered by documented precedence (highest → lowest).
   * Ref: https://code.claude.com/docs/en/settings
   *   Local (highest overrides) → Project (team-shared) → User (lowest priority)
   *
   * Each destination's fullPath is pre-resolved so the wizard can display it without
   * any provider-specific branching. The mcp 'local' scope writes into ~/.claude.json
   * under a per-project key, NOT into the repo — surfaced here so users understand why
   * nothing appears in their project directory.
   */
  configScopes(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[] {
    const SCOPES = [
      {
        value: 'local' as ConfigScope,
        precedence: 1,
        shared: false,
        blastRadius: 'project' as const,
        description: 'gitignored, personal — this repo only',
      },
      {
        value: 'project' as ConfigScope,
        precedence: 2,
        shared: true,
        blastRadius: 'project' as const,
        description: 'git-committed, shared with your team',
      },
      {
        value: 'user' as ConfigScope,
        precedence: 3,
        shared: false,
        blastRadius: 'all-projects' as const,
        description: 'global — affects ALL your projects',
      },
    ];
    return SCOPES.map(sc => ({
      ...sc,
      label: sc.value,
      destinations: kinds.map(kind => {
        const d = resolveClaudeConfigDestination(kind, sc.value, projectDir);
        // For mcp, derive the in-file JSON key-path so same-file scopes (local vs user both
        // write ~/.claude.json) are displayed as visibly distinct in the scope menu.
        //   local → 'projects › <abs-project-path> › mcpServers'  (wrapPath nests it)
        //   user  → 'mcpServers'                                    (top-level key)
        const section =
          kind === 'mcp' ? [...(d.wrapPath ?? []), CLAUDE_MCP_SERVERS_KEY].join(' › ') : undefined;
        return {
          kind,
          file: d.file,
          root: d.root,
          fullPath: path.join(resolveConfigRoot(d.root, projectDir), d.file),
          section,
        };
      }),
    }));
  }

  /**
   * Output-conformance contracts for Claude Code scaffold output.
   * Checked by `build` and `add` after emit to catch cross-contamination
   * (e.g. Copilot placeholder syntax in a command, or skill frontmatter in a rule).
   *
   * Note: these contracts match scaffold paths (.claude/…); plugin build paths
   * (plugins/<pack>/…) have no entries here and are checked by compile tests instead.
   */
  readonly outputContracts: ContractEntry[] = [
    {
      // Custom command: only description frontmatter; body must not have foreign placeholders.
      match: /\.claude\/commands\/.*\.md$/,
      label: 'Claude custom command',
      contract: {
        requiredKeys: ['description'],
        forbiddenKeys: ['name', 'paths', 'applyTo', 'agent', 'tools'],
        bodyForbids: [
          {
            pattern: /\{\{/,
            reason: 'unresolved {{…}} placeholder (should be translated to $name)',
          },
          {
            pattern: /\$\{input:/,
            reason: 'Copilot ${input:…} placeholder found in Claude command body',
          },
        ],
      },
    },
    {
      // Skill: name + description required; Claude uses paths: (not applyTo), no prompt fields.
      // NOTE: argument-hint IS valid in SKILL.md (it shows autocomplete hint in the Claude UI).
      //       Only `arguments:` (declarative arg list for Claude commands) is prompt-only here.
      match: /\.claude\/skills\/.*\/SKILL\.md$/,
      label: 'Claude skill',
      contract: {
        requiredKeys: ['name', 'description'],
        forbiddenKeys: ['applyTo', 'agent', 'arguments'],
      },
    },
    {
      // Rule: no prompt/agent/Copilot frontmatter allowed; shared rules have no frontmatter at all.
      match: /\.claude\/rules\/.*\.md$/,
      label: 'Claude rule',
      contract: {
        forbiddenKeys: ['name', 'agent', 'applyTo', 'argument-hint', 'arguments', 'tools'],
      },
    },
    {
      // Agent: name + description required; no prompt or Copilot fields.
      match: /\.claude\/agents\/.*\.md$/,
      label: 'Claude agent',
      contract: {
        requiredKeys: ['name', 'description'],
        forbiddenKeys: ['applyTo', 'argument-hint', 'arguments'],
      },
    },
  ];

  // ── Full build ───────────────────────────────────────────────────────────────

  async compile(catalog: ResolvedCatalog, options: CompileOptions): Promise<FileMap> {
    const files: FileMap = {};

    const pluginEntries: Array<{
      name: string;
      displayName: string;
      description: string;
      source: string;
    }> = [];

    for (const pack of options.packs) {
      const packArtifacts = getPackArtifacts(pack, catalog);
      const pluginFiles = buildPlugin(
        pack,
        packArtifacts,
        catalog,
        options.version,
        options.homepage,
      );
      Object.assign(files, pluginFiles);

      pluginEntries.push({
        name: pack.name,
        displayName: pack.displayName,
        description: pack.description,
        source: `./plugins/${pack.name}`,
      });
    }

    // marketplace.json — flat top-level schema (name / owner / plugins[])
    // See: code.claude.com/docs/en/plugin-marketplaces
    const marketplaceUrl = options.homepage ?? 'https://github.com/makubexD/sigil#readme';
    files['.claude-plugin/marketplace.json'] =
      JSON.stringify(
        {
          name: 'sigil',
          owner: { name: 'Sigil', url: marketplaceUrl },
          description: 'Vendor-neutral AI skills, agents, and rules for multiple languages.',
          plugins: pluginEntries,
        },
        null,
        2,
      ) + '\n';

    return files;
  }

  // ── Scaffold (add command) ───────────────────────────────────────────────────

  async scaffold(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<FileMap> {
    const artifact = catalog.byId.get(artifactId);
    if (!artifact) {
      throw new Error(`Artifact '${artifactId}' not found in the catalog`);
    }

    const files: FileMap = {};

    switch (artifact.kind) {
      case 'skill':
        scaffoldSkill(artifact, catalog, files, options);
        break;
      case 'agent':
        scaffoldAgent(artifact, files, catalog, options.coInstallSet);
        break;
      case 'rule':
        scaffoldRule(artifact, files);
        break;
      case 'prompt':
        scaffoldPrompt(artifact, files);
        break;
      case 'workflow':
        scaffoldWorkflow(artifact, files);
        break;
      default:
        throw new Error(`Scaffolding not supported for kind '${artifact.kind}'`);
    }

    return files;
  }

  // ── Config scaffold (hook / settings / mcp) ──────────────────────────────────

  /**
   * Produce merge ops for config-kind artifacts.
   * Called by `sigil add` when the artifact is a hook, settings, or mcp kind.
   * Returns ConfigMergeOp[] describing how to merge into the user's JSON config files.
   *
   * The install scope is resolved in order: options.scope → fm.defaultScope → 'project'.
   * The resulting op carries `root` so the CLI knows which root directory to resolve.
   */
  async scaffoldConfig(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<ConfigMergeOp[]> {
    const artifact = catalog.byId.get(artifactId);
    if (!artifact) {
      throw new Error(`Artifact '${artifactId}' not found in the catalog`);
    }

    const fm = artifact.frontmatter;
    const scope: ConfigScope =
      options.scope ?? (fm.defaultScope as ConfigScope | undefined) ?? 'project';
    const dest = resolveClaudeConfigDestination(
      artifact.kind as 'hook' | 'settings' | 'mcp',
      scope,
      options.projectDir,
    );

    switch (artifact.kind) {
      case 'hook': {
        const event = fm.event as string;
        const matcher = (fm.matcher as string | undefined) ?? '*';
        const command = fm.command as string;
        const timeout = fm.timeout as number | undefined;
        const hookEntry: Record<string, unknown> = { type: 'command', command };
        if (timeout !== undefined) hookEntry.timeout = timeout;

        // Claude Code hooks format:
        // { hooks: { [event]: [{ matcher: "...", hooks: [{type: "command", command: "..."}] }] } }
        const fragment: Record<string, unknown> = {
          hooks: {
            [event]: [{ matcher, hooks: [hookEntry] }],
          },
        };
        return [
          {
            file: dest.file,
            root: dest.root,
            fragment,
            // hooks key uses array-append so multiple hooks can coexist for the same event
            strategy: { hooks: 'array-append' },
          },
        ];
      }

      case 'settings': {
        const fragment: Record<string, unknown> = {};
        const strategy: Record<string, MergeStrategy> = {};

        const permissions = fm.permissions as
          | { allow?: string[]; deny?: string[]; ask?: string[] }
          | undefined;
        if (permissions) {
          fragment.permissions = permissions;
          strategy.permissions = 'array-union';
        }

        const env = fm.env as Record<string, string> | undefined;
        if (env && Object.keys(env).length > 0) {
          fragment.env = env;
          strategy.env = 'object-spread';
        }

        const model = fm.model as string | undefined;
        if (model) {
          fragment.model = model;
          strategy.model = 'object-spread';
        }

        const statusLine = fm.statusLine;
        if (statusLine !== undefined) {
          fragment.statusLine = statusLine;
          strategy.statusLine = 'object-spread';
        }

        if (Object.keys(fragment).length === 0) return [];

        return [{ file: dest.file, root: dest.root, fragment, strategy }];
      }

      case 'mcp': {
        const server = fm.server as Record<string, unknown>;
        const serverName = (fm.name as string | undefined) ?? artifact.id.replace(/^.*\//, '');
        // Strip any catalog-only fields before storing
        const { description: _d, ...serverConfig } = server as Record<string, unknown>;
        void _d;

        if (dest.wrapPath) {
          // mcp-local scope: wrap fragment under projects.<absProjectDir>.mcpServers
          // so deep-merge leaves other project entries intact.
          const [topKey, ...nested] = dest.wrapPath;
          let inner: Record<string, unknown> = {
            [CLAUDE_MCP_SERVERS_KEY]: { [serverName]: serverConfig },
          };
          for (const k of [...nested].reverse()) {
            inner = { [k]: inner };
          }
          return [
            {
              file: dest.file,
              root: dest.root,
              fragment: { [topKey]: inner },
              strategy: { [topKey]: 'object-spread' },
            },
          ];
        }

        return [
          {
            file: dest.file,
            root: dest.root,
            fragment: { [CLAUDE_MCP_SERVERS_KEY]: { [serverName]: serverConfig } },
            strategy: { [CLAUDE_MCP_SERVERS_KEY]: 'object-spread' },
          },
        ];
      }

      default:
        throw new Error(`scaffoldConfig not supported for kind '${artifact.kind}'`);
    }
  }
}
