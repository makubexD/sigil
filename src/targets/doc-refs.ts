/**
 * Canonical DocRef constants — one per official provider document, referenced by the per-kind
 * spec files in src/targets/<provider>/spec/ so a URL is never retyped across specs. Every entry
 * carries `verifiedOn`; `sigil sync --stale` reports how stale each one is by walking
 * src/targets/all-emit-specs.ts, which flattens every spec's `docs` plus the aggregate outputs
 * (copilot-instructions.md, AGENTS.md, and — as of the 2026-08-07 catalog-conformance audit —
 * .mcp.json, .claude/settings.json (hooks and settings both), plugin.json, marketplace.json, and
 * .vscode/mcp.json) that have no spec of their own because they're JSON merges/manifests, not
 * markdown renders.
 *
 * VERIFICATION STANDARD (2026-08-06 audit — read this before "fixing" a citation):
 *
 * A DocRef must name the provider's CANONICAL HOME for the artifact — the page that provider's
 * own navigation or file-reference table points to — not merely a page that happens to mention
 * the format. Two concrete failures the prior (2026-08-05) audit missed by only checking "does
 * this URL return 200 and contain the expected substrings":
 *   - CLAUDE_RULES_DOC pointed at /docs/en/memory with no anchor and a title that read as if
 *     `.claude/rules/` were filed under the memory feature. It IS the right page — Anthropic's own
 *     claude-directory.md "File reference" table maps `rules/*.md` to exactly this URL — but the
 *     citation needs the `#organize-rules-with-claude/rules/` anchor and a title that says "Rules"
 *     to actually communicate that.
 *   - CLAUDE_SLASH_COMMANDS_DOC pointed at /docs/en/slash-commands, which serves byte-identical
 *     content to /docs/en/skills and is absent from the docs index (llms.txt) — a dead alias, not
 *     a live page with drifted content. It has been removed; prompt/workflow now cite
 *     CLAUDE_SKILLS_DOC directly (see spec/prompt.ts's header for why: custom commands were
 *     merged into skills, and sigil's Claude prompt/workflow output followed that migration).
 *
 * Cite the section anchor when the artifact is a subsection of a broader page. When two products
 * read the same emitted file — GitHub Copilot's cloud agent and VS Code's local agent both read
 * every `.github/*` file sigil emits, and their docs genuinely diverge (see COPILOT_RULE_SPEC's
 * citation for a concrete divergence) — cite BOTH; `docs` is a `readonly DocRef[]` for exactly
 * this. Re-verification means re-reading the page against the spec that cites it and checking it
 * is still the canonical home, not re-checking the HTTP status.
 *
 * `CLAUDE_DIRECTORY_DOC` below is the provenance for the whole Claude mapping — Anthropic's own
 * artifact-to-doc table — cited once as a Claude-side aggregate in all-emit-specs.ts so the next
 * audit is a diff against that table rather than a re-derivation from scratch.
 */
import type { DocRef } from './spec-types';

export const CLAUDE_SKILLS_DOC: DocRef = {
  url: 'https://code.claude.com/docs/en/skills',
  title: 'Claude Code — Agent Skills',
  verifiedOn: '2026-08-06',
  covers:
    'SKILL.md frontmatter (name, description, when_to_use, allowed-tools, argument-hint, ' +
    'disable-model-invocation, user-invocable, context) and progressive-disclosure layout. Also ' +
    'covers custom-command frontmatter (description, argument-hint, arguments) and $name ' +
    'substitution — commands were merged into skills here (see spec/prompt.ts).',
};

export const COPILOT_AGENT_SKILLS_DOC: DocRef = {
  url: 'https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills',
  title: 'GitHub Copilot — Add skills to the coding agent',
  verifiedOn: '2026-08-06',
  covers: '.github/skills/<name>/SKILL.md, name/description frontmatter, GitHub cloud agent side',
};

export const VSCODE_AGENT_SKILLS_DOC: DocRef = {
  url: 'https://code.visualstudio.com/docs/agent-customization/agent-skills',
  title: 'VS Code — Agent Skills',
  verifiedOn: '2026-08-06',
  covers:
    "SKILL.md for VS Code's local agent — same shared Agent Skills open standard, VS Code side",
};

export const CLAUDE_RULES_DOC: DocRef = {
  url: 'https://code.claude.com/docs/en/memory#organize-rules-with-claude/rules/',
  title: 'Claude Code — Memory: Organize rules with .claude/rules/',
  verifiedOn: '2026-08-06',
  covers:
    '.claude/rules/*.md paths: frontmatter and path-scoped loading. Filed on the Memory page — ' +
    'Anthropic\'s own claude-directory.md "File reference" table maps rules/*.md to this exact ' +
    'anchor, one level under the CLAUDE.md story — not a memory-feature page mistakenly reused.',
};

export const COPILOT_INSTRUCTIONS_DOC: DocRef = {
  url: 'https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions',
  title: 'GitHub Copilot — Add repository custom instructions',
  verifiedOn: '2026-08-06',
  covers:
    '.instructions.md applyTo: frontmatter and copilot-instructions.md. Path-specific ' +
    'instructions are documented here as supported ONLY for Copilot cloud agent and code review ' +
    "on github.com — narrower than VS Code's local-agent support (see VSCODE_INSTRUCTIONS_DOC). " +
    'Also documents AGENTS.md as valid anywhere in the repo, nearest-in-tree wins.',
};

export const VSCODE_INSTRUCTIONS_DOC: DocRef = {
  url: 'https://code.visualstudio.com/docs/agent-customization/custom-instructions',
  title: 'VS Code — Custom instructions',
  verifiedOn: '2026-08-06',
  covers:
    '.instructions.md applyTo: frontmatter, copilot-instructions.md, and AGENTS.md — VS Code ' +
    'applies path-specific instructions generally (not restricted to cloud agent/code review the ' +
    "way GitHub's own docs restrict it). AGENTS.md subfolder support is marked experimental here.",
};

export const CLAUDE_AGENTS_DOC: DocRef = {
  url: 'https://code.claude.com/docs/en/sub-agents',
  title: 'Claude Code — Subagents',
  verifiedOn: '2026-08-06',
  covers:
    'agent .md frontmatter: name, description, model/effort/maxTurns/isolation, disallowedTools',
};

export const COPILOT_AGENTS_DOC: DocRef = {
  url: 'https://docs.github.com/en/copilot/reference/custom-agents-configuration',
  title: 'GitHub Copilot — Custom agents configuration reference',
  verifiedOn: '2026-08-06',
  covers:
    '.agent.md YAML frontmatter table: name (optional), description (required), target, tools, ' +
    'model, disable-model-invocation. Does NOT state the .github/agents/ file location — see ' +
    'COPILOT_CREATE_AGENTS_DOC for that half.',
};

export const COPILOT_CREATE_AGENTS_DOC: DocRef = {
  url: 'https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents',
  title: 'GitHub Copilot — Create custom agents',
  verifiedOn: '2026-08-06',
  covers: "the .github/agents/<name>.agent.md file location on GitHub's cloud agent side",
};

export const VSCODE_CUSTOM_AGENTS_DOC: DocRef = {
  url: 'https://code.visualstudio.com/docs/agent-customization/custom-agents',
  title: 'VS Code — Custom agents',
  verifiedOn: '2026-08-06',
  covers: "the .github/agents/ (and .claude/agents/) file locations on VS Code's local-agent side",
};

export const COPILOT_PROMPT_FILES_DOC: DocRef = {
  url: 'https://code.visualstudio.com/docs/agent-customization/prompt-files',
  title: 'VS Code — Prompt files',
  verifiedOn: '2026-08-06',
  covers:
    '.github/prompts/*.prompt.md, workspace-scoped by default. Frontmatter table: description, ' +
    'name, argument-hint, agent, model, tools — ALL documented "Required: No". ' +
    '${input:name} / ${input:name:placeholder} substitution. Also states: "Agents running on the ' +
    'Agent Host don\'t use prompt files… convert it to an agent skill" — VS Code is actively ' +
    'steering this format toward agent skills (see COPILOT_PROMPT_SPEC.supersededBy).',
};

/** Backs the AGENTS.md open-standard aggregate — cited directly since it has no per-kind spec. */
export const AGENTS_MD_STANDARD_DOC: DocRef = {
  url: 'https://agents.md/',
  title: 'AGENTS.md — the open standard',
  verifiedOn: '2026-08-06',
  covers:
    'the AGENTS.md convention itself: a prose "README for agents". Specifies no frontmatter and ' +
    "no per-agent sections — the ## <name> sectioning buildAgentsMd() renders is sigil's own " +
    'layout choice, not part of this standard. See COPILOT_INSTRUCTIONS_DOC / VSCODE_INSTRUCTIONS_DOC ' +
    'for where each consumer documents actually reading AGENTS.md.',
};

/** Provenance for the whole Claude Code artifact-to-doc mapping this file follows — Anthropic's
 * own "File reference" table (claude-directory.md), which maps every `.claude/` file to its
 * canonical doc. Cited once as a Claude-side aggregate (all-emit-specs.ts) so re-auditing this
 * file is a diff against that table, not a re-derivation from scratch. */
export const CLAUDE_DIRECTORY_DOC: DocRef = {
  url: 'https://code.claude.com/docs/en/claude-directory',
  title: 'Claude Code — Explore the .claude directory',
  verifiedOn: '2026-08-06',
  covers:
    'the "File reference" table mapping every .claude/ file (rules/*.md, skills/, agents/, ' +
    "commands/, workflows/*.js, …) to its canonical doc page — the source this file's Claude " +
    'citations are verified against.',
};

/**
 * 2026-08-07 audit — closing the citation gap for JSON-merge/manifest outputs, which have no
 * KindEmitSpec (they aren't markdown renders) and so were emitted with zero doc citation. Cited
 * as AGGREGATE_DOC_REFS entries (all-emit-specs.ts), same mechanism as copilot-instructions.md /
 * AGENTS.md above. Each was verified against claude-directory.md's own "File reference" table
 * where that table has a row for the file; verified live 2026-08-07.
 */

/** `.mcp.json` — claude-directory.md's own table maps this file to this exact page. */
export const CLAUDE_MCP_DOC: DocRef = {
  url: 'https://code.claude.com/docs/en/mcp',
  title: 'Claude Code — Connect Claude Code to tools via MCP',
  verifiedOn: '2026-08-07',
  covers:
    '.mcp.json server configuration shape (mcpServers: { name: { command/args/env, or ' +
    'url/type for remote transports } }) that catalog/shared/mcps/*.mcp.md frontmatter mirrors ' +
    "and src/targets/claude-code/config.ts merges into. claude-directory.md's file-reference " +
    'table maps .mcp.json to this page (anchored at #mcp-installation-scopes for scope rules); ' +
    'cited here at the page root since the JSON shape itself spans the whole page, not just scopes.',
};

/**
 * Hooks configuration shape — distinct citation from CLAUDE_SETTINGS_DOC below even though both
 * write into the same settings.json file: the hooks page's own "Configuration" section is where
 * Anthropic documents the JSON schema (event/matcher/hooks[]/type/command) that catalog `hook`
 * artifacts (catalog/shared/hooks/*.hook.md) actually author, per that section's own text —
 * "Configuration section below documents the full schema."
 */
export const CLAUDE_HOOKS_DOC: DocRef = {
  url: 'https://code.claude.com/docs/en/hooks#configuration',
  title: 'Claude Code — Hooks reference: Configuration',
  verifiedOn: '2026-08-07',
  covers:
    'the hooks JSON schema (event → matcher → hooks[] → {type, command}) that catalog `hook` ' +
    'artifacts author and src/targets/claude-code/config-scaffold.ts merges into the `hooks` ' +
    'key of .claude/settings.json (array-append strategy for coexisting hooks on one event).',
};

/**
 * `.claude/settings.json` itself (permissions/env/model, excluding hooks — see CLAUDE_HOOKS_DOC).
 * claude-directory.md's own table maps settings.json to exactly this page.
 */
export const CLAUDE_SETTINGS_DOC: DocRef = {
  url: 'https://code.claude.com/docs/en/settings',
  title: 'Claude Code — Settings',
  verifiedOn: '2026-08-07',
  covers:
    'settings.json fields (permissions, env vars, model defaults, statusLine) that catalog ' +
    '`settings` artifacts (catalog/shared/settings/*.settings.md) author and ' +
    'src/targets/claude-code/config-scaffold.ts merges project- and user-scoped.',
};

/**
 * `plugin.json` manifest — distinct page from marketplace.json (CLAUDE_PLUGIN_MARKETPLACES_DOC
 * below): Anthropic splits plugin-authoring reference from marketplace-distribution reference.
 */
export const CLAUDE_PLUGIN_MANIFEST_DOC: DocRef = {
  url: 'https://code.claude.com/docs/en/plugins-reference',
  title: 'Claude Code — Plugins reference',
  verifiedOn: '2026-08-07',
  covers:
    '.claude-plugin/plugin.json manifest fields (name, description, version, mcpServers, hooks, ' +
    'skills/commands/agents path overrides) that src/targets/claude-code/plugin-assemble.ts ' +
    'buildPluginJson() emits, including the version-resolution precedence sigil relies on ' +
    '(explicit plugin.json version > marketplace entry version > git SHA > "unknown").',
};

/** `marketplace.json` — the distribution catalog listing plugins, a distinct file and page from plugin.json. */
export const CLAUDE_PLUGIN_MARKETPLACES_DOC: DocRef = {
  url: 'https://code.claude.com/docs/en/plugin-marketplaces',
  title: 'Claude Code — Create and distribute a plugin marketplace',
  verifiedOn: '2026-08-07',
  covers:
    'marketplace.json top-level shape (name/owner/plugins[]) that ' +
    'src/targets/claude-code/target-helpers.ts buildMarketplaceJson() emits.',
};

/** `.vscode/mcp.json` — VS Code's own MCP servers doc, the workspace-scope configuration file. */
export const VSCODE_MCP_DOC: DocRef = {
  url: 'https://code.visualstudio.com/docs/copilot/customization/mcp-servers',
  title: 'VS Code — Add and manage MCP servers',
  verifiedOn: '2026-08-07',
  covers:
    '.vscode/mcp.json workspace-scope server configuration that ' +
    'src/targets/copilot/config.ts merges into. Documents the same mcpServers shape as ' +
    "CLAUDE_MCP_DOC on VS Code's side, plus the Agent Host forwarding caveat.",
};
