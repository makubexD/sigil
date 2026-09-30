/**
 * Tests for src/wizard/add.ts — runWizard config-scope flow (block O)
 * and back-navigation fix (block R).
 *
 * runWizard uses @clack/prompts which requires a real TTY. Since tests run in a
 * non-TTY environment we mock @clack/prompts by mutating the already-loaded module
 * object in require.cache. The compiled wizard.js accesses prompts via
 * `prompts_1.<fn>(...)`, so mutating the cached exports object's properties is
 * sufficient — no module reload needed.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import { loadCatalog } from '../../dist-cli/load';
import { resolveCatalog } from '../../dist-cli/resolve';
import { CONFIG_KINDS } from '../../dist-cli/select';
import type { ResolvedCatalog } from '../../dist-cli/types';
import { CATALOG_DIR } from '../helpers/catalog';
// Ensure @clack/prompts is loaded into require.cache before beforeEach accesses it.
import '../../dist-cli/wizard';

const PACKS_MINIMAL = [
  {
    name: 'dotnet-pack',
    displayName: '.NET / C# Pack',
    description: 'C# skills and agents',
    languages: ['csharp'],
  },
];

const PACKS_CURATED = [
  {
    name: 'essentials',
    displayName: 'Essentials (any language)',
    description: 'Core productivity tools',
    artifacts: [
      'shared/filesystem',
      'shared/protect-config',
      'shared/allow-dev-tools',
      'shared/explain-diff',
      'shared/author-artifact',
    ],
  },
  {
    name: 'react-starter',
    displayName: 'React Starter',
    description: 'React development setup',
    artifacts: [
      'react/component-testing',
      'shared/filesystem',
      'shared/protect-config',
      'shared/allow-dev-tools',
    ],
  },
];

describe('O — Wizard: config-scope for mcp', () => {
  // Load the real catalog so runWizard gets real artifact IDs
  let resolvedCatalog: ResolvedCatalog;
  let clackMod: { exports: Record<string, unknown> };

  beforeEach(async () => {
    const cat = await loadCatalog(CATALOG_DIR);
    resolvedCatalog = resolveCatalog(cat) as ResolvedCatalog;
    const clackKey = require.resolve('@clack/prompts');
    clackMod = require.cache[clackKey] as { exports: Record<string, unknown> };
  });

  /**
   * Helper: set up clack mocks that draw answers from a sequential queue.
   * `select` and `groupMultiselect` return the next value off the queue.
   * `multiselect` returns the next value as an array (or the value itself if already an array).
   * `isCancel` always returns false.
   * All others (intro, outro, note, log, cancel) are no-ops.
   * Returns a restore() function that puts the originals back.
   */
  function mockClack(queue: Array<string | string[]>): () => void {
    const ex = clackMod.exports;
    const orig = { ...ex };

    const pop = () => {
      if (queue.length === 0) throw new Error('clack mock: answer queue exhausted');
      return queue.shift()!;
    };

    ex['intro'] = () => {};
    ex['outro'] = () => {};
    ex['note'] = () => {};
    ex['cancel'] = () => {};
    ex['log'] = { info: () => {}, warn: () => {}, error: () => {} };
    ex['isCancel'] = () => false;
    ex['select'] = async (_opts: unknown) => pop();
    ex['multiselect'] = async (_opts: unknown) => {
      const v = pop();
      return Array.isArray(v) ? v : [v];
    };
    ex['groupMultiselect'] = async (_opts: unknown) => {
      const v = pop();
      return Array.isArray(v) ? v : [v];
    };
    ex['text'] = async (_opts: unknown) => pop();
    ex['confirm'] = async (_opts: unknown) => pop();

    return () => {
      for (const k of Object.keys(orig)) ex[k] = orig[k];
    };
  }

  it('runWizard — mcp selection yields configScope:user for claude target', async () => {
    const { runWizard } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    // Wizard steps (in order for this path):
    //   target → scope:browse → kind sub-menu:__all__ (All types) → language:'' (all) →
    //   groupMultiselect picks → deps:no → overwrite:no → configScope:user → proceed:proceed
    const restore = mockClack([
      'claude', // step: target
      'browse', // step: scope → Browse & pick
      '__all__', // step: kind sub-menu → All types (mix anything)
      '', // step: crossKindPicker language pre-filter ('' = all languages)
      ['mcp:shared/ado', 'mcp:shared/maku-jam'], // step: groupMultiselect artifact picker
      'no', // step: deps → No
      'no', // step: overwrite → No
      'user', // step: configScope → user
      'proceed', // step: proceed → Proceed with install
    ]);
    try {
      const result = await runWizard(resolvedCatalog, PACKS_MINIMAL, 'claude', os.tmpdir());
      assert.ok(result, 'runWizard should not return null');
      assert.equal(result.target, 'claude');
      assert.deepEqual(result.selectors, ['mcp:shared/ado', 'mcp:shared/maku-jam']);
      assert.equal(result.includeDeps, false);
      assert.equal(result.overwrite, false);
      assert.equal(result.configScope, 'user', 'configScope step should yield user scope');
    } finally {
      restore();
    }
  });

  it('runWizard — copilot target shows copilot scope hints and captures project scope', async () => {
    const { runWizard } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const restore = mockClack([
      'copilot', // step: target
      'browse', // step: scope → Browse & pick
      '__all__', // step: kind sub-menu → All types (mix anything)
      '', // step: language pre-filter
      ['mcp:shared/context-mode'], // step: picker
      'no', // step: deps
      'no', // step: overwrite
      'project', // step: configScope → project
      'proceed', // step: proceed
    ]);
    try {
      const result = await runWizard(resolvedCatalog, PACKS_MINIMAL, 'copilot', os.tmpdir());
      assert.ok(result, 'runWizard should not return null');
      assert.equal(result.target, 'copilot');
      assert.deepEqual(result.selectors, ['mcp:shared/context-mode']);
      assert.equal(result.configScope, 'project');
    } finally {
      restore();
    }
  });

  it('runWizard — non-config selection auto-skips configScope step (returns undefined)', async () => {
    const { runWizard } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    // Pick a skill (non-config kind) → configScope step should be skipped entirely
    const restore = mockClack([
      'claude', // target
      'browse', // scope → Browse & pick
      '__all__', // kind sub-menu → All types (mix anything)
      'csharp', // language pre-filter
      ['skill:csharp/cs-generate-tests'], // picker: a skill artifact
      'yes', // deps: yes
      'no', // overwrite: no
      // no configScope answer — step auto-skipped
      'proceed', // proceed
    ]);
    try {
      const result = await runWizard(resolvedCatalog, PACKS_MINIMAL, 'claude', os.tmpdir());
      assert.ok(result, 'runWizard should not return null');
      assert.equal(result.target, 'claude');
      assert.equal(
        result.configScope,
        undefined,
        'configScope should be undefined when no config-kind artifact is selected',
      );
    } finally {
      restore();
    }
  });

  it('buildEquivalentCommand — appends --scope when configScope is non-project', () => {
    const { buildEquivalentCommand } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const cmd = buildEquivalentCommand({
      selectors: ['mcp:shared/ado', 'mcp:shared/maku-jam'],
      target: 'claude',
      includeDeps: false,
      overwrite: false,
      configScope: 'user',
    });
    assert.ok(cmd.includes('--scope user'), `Expected --scope user in: ${cmd}`);
    assert.ok(cmd.includes('--yes'), 'Expected --yes in command');
  });

  it('buildEquivalentCommand — omits --scope when configScope is project and no config kinds (non-config install)', () => {
    const { buildEquivalentCommand } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const cmd = buildEquivalentCommand({
      selectors: ['mcp:shared/ado'],
      target: 'claude',
      includeDeps: true,
      overwrite: false,
      configScope: 'project',
      // hasConfigKinds not passed — simulates a caller that doesn't set the flag
    });
    assert.ok(!cmd.includes('--scope'), `Expected no --scope flag in: ${cmd}`);
  });

  it('buildEquivalentCommand — omits --scope when configScope is undefined and no config kinds', () => {
    const { buildEquivalentCommand } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const cmd = buildEquivalentCommand({
      selectors: ['skill:csharp/cs-generate-tests'],
      target: 'claude',
      includeDeps: true,
      overwrite: false,
      configScope: undefined,
    });
    assert.ok(!cmd.includes('--scope'), `Expected no --scope flag in: ${cmd}`);
  });

  it('buildEquivalentCommand — always emits --scope when hasConfigKinds is true, even for project default', () => {
    // Core invariant: config-kind installs always pin the scope so the destination is documented.
    const { buildEquivalentCommand } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const cmd = buildEquivalentCommand({
      selectors: ['mcp:shared/ado'],
      target: 'claude',
      includeDeps: true,
      overwrite: false,
      configScope: 'project',
      hasConfigKinds: true,
    });
    assert.ok(cmd.includes('--scope project'), `Expected --scope project in: ${cmd}`);
    assert.ok(cmd.includes('--yes'), 'Expected --yes in command');
  });

  it('buildEquivalentCommand — defaults scope to project when hasConfigKinds is true and configScope is undefined', () => {
    const { buildEquivalentCommand } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const cmd = buildEquivalentCommand({
      selectors: ['mcp:shared/ado'],
      target: 'claude',
      includeDeps: true,
      overwrite: false,
      configScope: undefined,
      hasConfigKinds: true,
    });
    assert.ok(cmd.includes('--scope project'), `Expected --scope project in: ${cmd}`);
  });

  it('individual picker — "Config — agnostic" group contains mcp artifacts, shared group excludes them', async () => {
    // This test captures the options object passed to groupMultiselect and inspects the group layout.
    const { runWizard } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');

    let capturedOptions: Record<string, unknown[]> | undefined;
    const ex = clackMod.exports;
    const origGroupMultiselect = ex['groupMultiselect'];

    // Replace groupMultiselect to capture options, then return our picks
    ex['groupMultiselect'] = async (opts: { options: Record<string, unknown[]> }) => {
      capturedOptions = opts.options;
      // Return just the two mcp artifacts
      return ['mcp:shared/ado', 'mcp:shared/maku-jam'];
    };
    ex['intro'] = () => {};
    ex['outro'] = () => {};
    ex['note'] = () => {};
    ex['cancel'] = () => {};
    ex['log'] = { info: () => {}, warn: () => {}, error: () => {} };
    ex['isCancel'] = () => false;
    // select answers: target, scope, kind-sub-menu (__all__), language-filter (empty = all),
    //                 deps, overwrite, configScope, proceed
    const queue = ['claude', 'browse', '__all__', '', 'no', 'no', 'project', 'proceed'];
    const pop = () => queue.shift()!;
    ex['select'] = async () => pop();
    ex['multiselect'] = async () => [pop()];

    try {
      await runWizard(resolvedCatalog, PACKS_MINIMAL, 'claude', os.tmpdir());

      assert.ok(capturedOptions !== undefined, 'groupMultiselect was called');

      // Must have a "Config — agnostic" group
      assert.ok(
        'Config — agnostic' in capturedOptions,
        'picker must contain a "Config — agnostic" group',
      );

      // The agnostic group must contain mcp artifacts
      const agnosticValues = (capturedOptions['Config — agnostic'] as Array<{ value: string }>).map(
        o => o.value,
      );
      assert.ok(
        agnosticValues.some(v => v.startsWith('mcp:')),
        `"Config — agnostic" group must contain mcp artifacts; got: ${agnosticValues.join(', ')}`,
      );

      // No group other than "Config — agnostic" and navigation/back groups should contain config kinds
      for (const [groupKey, items] of Object.entries(capturedOptions)) {
        if (groupKey === 'Config — agnostic' || groupKey === '⬆ Navigation') continue;
        for (const item of items as Array<{ value: string }>) {
          const kind = item.value.split(':')[0];
          assert.ok(
            !CONFIG_KINDS.has(kind),
            `Group "${groupKey}" must not contain config artifact "${item.value}"`,
          );
        }
      }

      // The "shared" group (if present) must not contain config kinds
      if ('shared' in capturedOptions) {
        for (const item of capturedOptions['shared'] as Array<{ value: string }>) {
          const kind = item.value.split(':')[0];
          assert.ok(
            !CONFIG_KINDS.has(kind),
            `"shared" language group must not contain config artifact "${item.value}"`,
          );
        }
      }
    } finally {
      // Restore clack
      ex['groupMultiselect'] = origGroupMultiselect;
      // Re-install safe no-ops (the next test's beforeEach will restore properly)
    }
  });

  // ── Two-axis menu tests ────────────────────────────────────────────────────

  it('scope menu includes browse entry (merged) and a pack entry when packs exist, no "individual"', async () => {
    // Capture the options passed to the first `select` call after target selection
    // (that is the scope/what-to-install prompt).
    // After the IA overhaul, the scope menu has three entries:
    //   Everything · Recommended · Pick specific items
    // Language is no longer a top-level concept; packs are curated bundles.
    // Cross-kind picking is reachable via Pick specific items → All types (mix anything).
    const { runWizard } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');

    let capturedScopeOpts: Array<{ value: string; label: string }> | undefined;
    const ex = clackMod.exports;
    const origSelect = ex['select'];

    let scopeSelectCallIdx = 0;
    ex['select'] = async (opts: { options: Array<{ value: string; label: string }> }) => {
      scopeSelectCallIdx++;
      if (scopeSelectCallIdx === 2) {
        // 1st call = target, 2nd call = scope
        capturedScopeOpts = opts.options;
        // Cancel to short-circuit the wizard after capturing scope options
        return '__back__'; // Back from scope → pops to target, then we cancel
      }
      if (scopeSelectCallIdx === 1) return 'claude'; // target
      // Any subsequent call — cancel wizard
      return { [Symbol.for('clack.cancel')]: true };
    };
    ex['isCancel'] = (v: unknown) => {
      const sym = Symbol.for('clack.cancel');
      return v !== null && typeof v === 'object' && sym in (v as object);
    };

    try {
      await runWizard(resolvedCatalog, PACKS_MINIMAL, 'claude', os.tmpdir());
    } finally {
      ex['select'] = origSelect;
      ex['isCancel'] = () => false;
    }

    assert.ok(capturedScopeOpts !== undefined, 'scope select was called');
    const values = capturedScopeOpts!.map(o => o.value);
    assert.ok(values.includes('all'), 'scope menu must include "all" (Everything)');
    assert.ok(values.includes('browse'), 'scope menu must include "browse" (Browse & pick)');
    assert.ok(values.includes('pack'), 'scope menu must include "pack" when packs exist');
    // "Pick individually (advanced)" is merged into Browse — no longer a top-level entry.
    assert.ok(
      !values.includes('individual'),
      'scope menu must NOT have a separate "individual" entry after the merge',
    );
    // The "browse" option (Pick specific items) must have an appropriate label.
    const browseOpt = capturedScopeOpts!.find(o => o.value === 'browse');
    assert.ok(
      browseOpt?.label.toLowerCase().includes('pick'),
      `browse option label should contain "pick"; got: ${browseOpt?.label}`,
    );
  });

  it('vocabulary — kindPlural for mcp returns "MCPs", not "Mcps"', () => {
    // After the vocabulary entries were added, kindPlural(claudeTarget, 'mcp') must
    // return 'MCPs' (not the generic fallback 'Mcps').
    const { kindPlural } =
      require('../../dist-cli/select') as typeof import('../../dist-cli/select');
    const { getAllTargets } =
      require('../../dist-cli/targets') as typeof import('../../dist-cli/targets');
    const claudeTarget = getAllTargets().find(t => t.name === 'claude');
    assert.ok(claudeTarget, 'claude target must be registered');
    assert.equal(
      kindPlural(claudeTarget, 'mcp'),
      'MCPs',
      'kindPlural(claudeTarget, "mcp") should return "MCPs"',
    );
    assert.equal(kindPlural(claudeTarget, 'hook'), 'Hooks');
    assert.equal(kindPlural(claudeTarget, 'settings'), 'Settings');
  });

  it('runWizard — browse → mcp installs config agnostically (skips language + deps)', async () => {
    // browse scope → kind:mcp → multiselect two MCPs → overwrite:no → configScope:project → proceed
    // This flow must NOT consume a language answer or a deps answer (both are skipped for config kinds).
    const { runWizard } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const restore = mockClack([
      'claude', // target
      'browse', // scope → Browse by type
      'mcp', // kind sub-menu → MCPs
      ['mcp:shared/ado', 'mcp:shared/maku-jam'], // per-kind config multiselect
      // NOTE: no language answer, no deps answer — both skipped for config kinds
      'no', // overwrite
      'project', // configScope
      'proceed', // proceed
    ]);
    try {
      const result = await runWizard(resolvedCatalog, PACKS_MINIMAL, 'claude', os.tmpdir());
      assert.ok(result, 'runWizard should not return null');
      assert.equal(result.target, 'claude');
      assert.deepEqual(
        result.selectors.sort(),
        ['mcp:shared/ado', 'mcp:shared/maku-jam'].sort(),
        'browse → mcp should select the two mcp artifacts',
      );
      assert.equal(result.includeDeps, true, 'includeDeps should be true (no-op for config kinds)');
      assert.equal(result.overwrite, false);
      assert.equal(result.configScope, 'project');
    } finally {
      restore();
    }
  });

  it('runWizard — browse → skill shows language filter and goes through deps', async () => {
    // browse scope → kind:skill → language '' (all) → groupMultiselect a skill → deps:yes → overwrite:no → proceed
    // Manually mock clack so we can intercept groupMultiselect AFTER setting up the base mock.
    const { runWizard } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');

    let capturedOptions: Record<string, unknown[]> | undefined;
    const ex = clackMod.exports;
    const orig = { ...ex };

    // Queue-based select (populates per call)
    const queue = [
      'claude', // target
      'browse', // scope → Browse by type
      'skill', // kind sub-menu → Skills
      '', // language pre-filter ('' = all)
      'yes', // deps → yes
      'no', // overwrite → no
      // configScope auto-skipped (skill is not a config kind)
      'proceed', // proceed
    ];
    const pop = () => {
      if (queue.length === 0) throw new Error('clack mock: queue exhausted');
      return queue.shift()!;
    };

    ex['intro'] = () => {};
    ex['outro'] = () => {};
    ex['note'] = () => {};
    ex['cancel'] = () => {};
    ex['log'] = { info: () => {}, warn: () => {}, error: () => {} };
    ex['isCancel'] = () => false;
    ex['select'] = async (_opts: unknown) => pop();
    ex['multiselect'] = async (_opts: unknown) => {
      const v = pop();
      return Array.isArray(v) ? v : [v];
    };
    // groupMultiselect: capture options then return our pick
    ex['groupMultiselect'] = async (opts: { options: Record<string, unknown[]> }) => {
      capturedOptions = opts.options;
      return ['skill:csharp/cs-generate-tests'];
    };

    try {
      const result = await runWizard(resolvedCatalog, PACKS_MINIMAL, 'claude', os.tmpdir());
      assert.ok(result, 'runWizard should not return null');
      assert.deepEqual(result.selectors, ['skill:csharp/cs-generate-tests']);
      assert.equal(result.includeDeps, true, 'includeDeps should reflect the deps:yes answer');
      assert.equal(
        result.configScope,
        undefined,
        'configScope should be undefined for a skill (non-config kind)',
      );
      // The grouped picker must have been called — confirms language groups were built
      assert.ok(capturedOptions !== undefined, 'groupMultiselect was called for skill picker');
      // No config kinds should appear in the skill picker groups
      for (const [groupKey, items] of Object.entries(capturedOptions!)) {
        if (groupKey === '⬆ Navigation') continue;
        for (const item of items as Array<{ value: string }>) {
          const kind = item.value.split(':')[0];
          assert.ok(
            !CONFIG_KINDS.has(kind),
            `Skill picker group "${groupKey}" must not contain config artifact "${item.value}"`,
          );
        }
      }
    } finally {
      for (const k of Object.keys(orig)) ex[k] = orig[k];
    }
  });

  // ── configScopes unit tests ───────────────────────────────────────────────

  it('configScopes — Claude returns 3 scopes ordered by precedence with absolute paths', () => {
    const { ClaudeCodeTarget } =
      require('../../dist-cli/targets/claude-code') as typeof import('../../dist-cli/targets/claude-code');
    const claude = new ClaudeCodeTarget();
    const proj = path.join(os.tmpdir(), 'sigil-test-proj');
    const scopes = claude.configScopes(['settings', 'mcp'], proj);

    assert.ok(scopes.length === 3, 'Claude should offer 3 scopes');
    // Ordered highest-precedence first
    assert.equal(scopes[0].value, 'local');
    assert.equal(scopes[1].value, 'project');
    assert.equal(scopes[2].value, 'user');

    // Precedence numbers are strictly ascending (1 = highest)
    assert.ok(scopes[0].precedence < scopes[1].precedence);
    assert.ok(scopes[1].precedence < scopes[2].precedence);

    // project scope settings → .claude/settings.json inside projectDir
    const projectSettingsDest = scopes[1].destinations.find(d => d.kind === 'settings');
    assert.ok(projectSettingsDest, 'project scope must include settings destination');
    assert.ok(
      projectSettingsDest.fullPath.includes('settings.json') &&
        !projectSettingsDest.fullPath.includes('local'),
      `project settings fullPath should point to settings.json, got: ${projectSettingsDest.fullPath}`,
    );
    assert.ok(path.isAbsolute(projectSettingsDest.fullPath), 'fullPath must be absolute');

    // local scope settings → .claude/settings.local.json inside projectDir
    const localSettingsDest = scopes[0].destinations.find(d => d.kind === 'settings');
    assert.ok(localSettingsDest, 'local scope must include settings destination');
    assert.ok(
      localSettingsDest.fullPath.includes('settings.local.json'),
      `local settings fullPath should point to settings.local.json, got: ${localSettingsDest.fullPath}`,
    );

    // local scope mcp → ~/.claude.json (home dir, NOT inside projectDir)
    const localMcpDest = scopes[0].destinations.find(d => d.kind === 'mcp');
    assert.ok(localMcpDest, 'local scope must include mcp destination');
    assert.ok(
      localMcpDest.fullPath.includes('.claude.json') &&
        localMcpDest.fullPath.startsWith(os.homedir()),
      `local mcp fullPath must be inside homedir and end with .claude.json, got: ${localMcpDest.fullPath}`,
    );
    // local mcp section must include 'projects', the project dir, and end with 'mcpServers'
    assert.ok(
      localMcpDest.section?.startsWith('projects ›') &&
        localMcpDest.section.includes(proj) &&
        localMcpDest.section.endsWith('› mcpServers'),
      `local mcp section should be 'projects › <dir> › mcpServers', got: ${localMcpDest.section}`,
    );

    // project scope mcp → .mcp.json inside projectDir
    const projectMcpDest = scopes[1].destinations.find(d => d.kind === 'mcp');
    assert.ok(projectMcpDest, 'project scope must include mcp destination');
    assert.ok(
      projectMcpDest.fullPath.endsWith('.mcp.json'),
      `project mcp fullPath should end with .mcp.json, got: ${projectMcpDest.fullPath}`,
    );
    // project and user mcp sections are top-level 'mcpServers'
    assert.equal(
      projectMcpDest.section,
      'mcpServers',
      `project mcp section must be 'mcpServers', got: ${projectMcpDest.section}`,
    );

    // user scope mcp section is also top-level 'mcpServers'
    const userMcpDest = scopes[2].destinations.find(d => d.kind === 'mcp');
    assert.ok(userMcpDest, 'user scope must include mcp destination');
    assert.equal(
      userMcpDest.section,
      'mcpServers',
      `user mcp section must be 'mcpServers', got: ${userMcpDest.section}`,
    );

    // settings destinations have no section (they merge at the file root)
    assert.equal(
      localSettingsDest.section,
      undefined,
      'settings destinations must not have a section',
    );

    // user scope has blastRadius 'all-projects'
    assert.equal(scopes[2].blastRadius, 'all-projects');
    // local and project scopes have blastRadius 'project'
    assert.equal(scopes[0].blastRadius, 'project');
    assert.equal(scopes[1].blastRadius, 'project');
  });

  it('configScopes — Copilot returns 2 scopes (project + user) mcp-only', () => {
    const { CopilotTarget } =
      require('../../dist-cli/targets/copilot') as typeof import('../../dist-cli/targets/copilot');
    const copilot = new CopilotTarget();
    const proj = path.join(os.tmpdir(), 'sigil-test-proj');
    const scopes = copilot.configScopes(['mcp'], proj);

    assert.ok(scopes.length === 2, 'Copilot should offer 2 scopes (no local MCP scope in VS Code)');
    assert.equal(scopes[0].value, 'project');
    assert.equal(scopes[1].value, 'user');

    // project scope mcp → .vscode/mcp.json inside projectDir
    const projectMcpDest = scopes[0].destinations.find(d => d.kind === 'mcp');
    assert.ok(projectMcpDest, 'project scope must have mcp destination');
    assert.ok(
      projectMcpDest.fullPath.includes('mcp.json'),
      `Copilot project mcp fullPath should include mcp.json, got: ${projectMcpDest.fullPath}`,
    );
    assert.ok(path.isAbsolute(projectMcpDest.fullPath), 'fullPath must be absolute');

    // user scope → vscode-user root (not homedir), blastRadius all-projects
    assert.equal(scopes[1].blastRadius, 'all-projects');
    const userMcpDest = scopes[1].destinations.find(d => d.kind === 'mcp');
    assert.ok(userMcpDest, 'user scope must have mcp destination');
    assert.equal(userMcpDest.root, 'vscode-user');
    // Copilot mcp section is 'servers' (VS Code uses servers key, not mcpServers)
    assert.equal(
      userMcpDest.section,
      'servers',
      `Copilot mcp section must be 'servers', got: ${userMcpDest.section}`,
    );
    assert.equal(
      scopes[0].destinations.find(d => d.kind === 'mcp')?.section,
      'servers',
      'Copilot project mcp section must also be servers',
    );
  });

  it('configScope wizard step — scope option hints contain absolute paths and descriptions', async () => {
    // Drive the wizard to the configScope select and capture its options.
    // Verifies that hints show full absolute paths (path.isAbsolute) and a description.
    const { runWizard } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const ex = clackMod.exports;
    const orig = { ...ex };

    let capturedScopeOptions: Array<{ value: string; label: string; hint: string }> | undefined;
    let selectCallIdx = 0;
    // Steps: target(1) → scope(2) → kind=mcp(3) → kindPicker-multiselect → overwrite(4) → configScope(5) → proceed(6)
    // We capture on call 5 (configScope select).
    const answers = [
      'claude', // 1: target
      'browse', // 2: scope
      'mcp', // 3: kind sub-menu
      // multiselect for config kinds — handled separately
      'no', // 4: overwrite
      // 5: configScope — captured here, then we return 'project'
      'proceed', // 6: proceed
    ];
    ex['intro'] = () => {};
    ex['outro'] = () => {};
    ex['note'] = () => {};
    ex['cancel'] = () => {};
    ex['log'] = { info: () => {}, warn: () => {}, error: () => {} };
    ex['isCancel'] = () => false;
    const selectQueue = [...answers];
    ex['select'] = async (opts: {
      options: Array<{ value: string; label: string; hint: string }>;
    }) => {
      selectCallIdx++;
      if (selectCallIdx === 5) {
        // This is the configScope step
        capturedScopeOptions = opts.options.filter(o => o.value !== '__back__');
        return 'project'; // pick project to continue
      }
      return selectQueue.shift()!;
    };
    ex['multiselect'] = async () => ['mcp:shared/ado']; // pick one MCP in kindPicker

    try {
      await runWizard(resolvedCatalog, PACKS_MINIMAL, 'claude', os.tmpdir());
    } finally {
      for (const k of Object.keys(orig)) ex[k] = orig[k];
    }

    assert.ok(capturedScopeOptions !== undefined, 'configScope select must have been called');
    assert.ok(capturedScopeOptions!.length >= 2, 'must have at least 2 scope options');

    for (const opt of capturedScopeOptions!) {
      // Extract the path segment (before the ' — ' description separator).
      // Each path segment may now include a JSON section suffix: 'fullPath  › section'.
      // Split on '  › ' (two spaces) to isolate the file path before checking isAbsolute.
      const pathSegment = opt.hint.split(' — ')[0].trim();
      const pathsInHint = pathSegment.split('  ·  ').map(p => p.split('  › ')[0].trim()); // strip '  › section' suffix
      for (const p of pathsInHint) {
        assert.ok(
          path.isAbsolute(p),
          `Scope "${opt.value}" hint path "${p}" must be absolute (full hint: ${opt.hint})`,
        );
      }
      // Every option must have a description after the ' — ' separator
      assert.ok(
        opt.hint.includes(' — '),
        `Scope "${opt.value}" hint must contain description after ' — ': ${opt.hint}`,
      );
      // Every label must contain 'precedence'
      assert.ok(
        opt.label.includes('precedence'),
        `Scope "${opt.value}" label must include 'precedence': ${opt.label}`,
      );
    }

    // local and user scope hints must be visibly distinct even though they share ~/.claude.json —
    // they differ in their JSON section suffix (local → projects › <dir> › mcpServers vs user → mcpServers).
    const localOpt = capturedScopeOptions!.find(o => o.value === 'local');
    const userOpt = capturedScopeOptions!.find(o => o.value === 'user');
    if (localOpt && userOpt) {
      assert.notEqual(
        localOpt.hint,
        userOpt.hint,
        `local and user scope hints must differ (they share ~/.claude.json but write to different JSON sections).\nlocal: ${localOpt.hint}\nuser:  ${userOpt.hint}`,
      );
    }
  });
});

// ─── R back-navigation fix ────────────────────────────────────────────────────

describe('R — back-navigation fix', () => {
  let resolvedCatalog: ResolvedCatalog;
  let clackMod: { exports: Record<string, unknown> };

  beforeEach(async () => {
    const cat = await loadCatalog(CATALOG_DIR);
    resolvedCatalog = resolveCatalog(cat) as ResolvedCatalog;
    const clackKey = require.resolve('@clack/prompts');
    clackMod = require.cache[clackKey] as { exports: Record<string, unknown> };
  });

  function mockClack(queue: Array<string | string[]>): () => void {
    const ex = clackMod.exports;
    const orig = { ...ex };
    const pop = () => {
      if (queue.length === 0) throw new Error('clack mock: answer queue exhausted');
      return queue.shift()!;
    };
    ex['intro'] = () => {};
    ex['outro'] = () => {};
    ex['note'] = () => {};
    ex['cancel'] = () => {};
    ex['log'] = { info: () => {}, warn: () => {}, error: () => {} };
    ex['isCancel'] = () => false;
    ex['select'] = async (_opts: unknown) => pop();
    ex['multiselect'] = async (_opts: unknown) => {
      const v = pop();
      return Array.isArray(v) ? v : [v];
    };
    ex['groupMultiselect'] = async (_opts: unknown) => {
      const v = pop();
      return Array.isArray(v) ? v : [v];
    };
    ex['text'] = async (_opts: unknown) => pop();
    ex['confirm'] = async (_opts: unknown) => pop();
    return () => {
      for (const k of Object.keys(orig)) ex[k] = orig[k];
    };
  }

  it('back from language step (Everything path) returns to scope menu, not an infinite loop', async () => {
    // Bug: the `all` branch of `narrow` used to push 'narrow' onto history even though
    // it rendered no prompt. Back from `language` would pop 'narrow', which immediately
    // auto-forwarded back to `language` — an unescapable loop.
    //
    // Fix: pass-through steps must never push a history frame. After the fix, back from
    // `language` pops 'scope' and the user sees the top-level menu again.
    //
    // Queue for the fixed flow:
    //   target:'claude' → scope:'all' → [narrow auto-advances] → language:'__back__'
    //   → scope shown again → scope:'all' → language:'' (all) → deps:'yes'
    //   → overwrite:'no' → configScope:'project' (all includes MCPs) → proceed:'proceed'
    const { runWizard } =
      require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const restore = mockClack([
      'claude', // target
      'all', // scope → Everything (narrow is a silent pass-through)
      '__back__', // language → Back (must return to scope, not loop)
      'all', // scope → Everything again
      '', // language → all languages
      'yes', // deps
      'no', // overwrite
      'project', // configScope (all scope includes MCPs / hooks / settings)
      'proceed', // proceed
    ]);
    try {
      const result = await runWizard(resolvedCatalog, PACKS_CURATED, 'claude', os.tmpdir());
      assert.ok(
        result,
        'runWizard must not return null — if the bug is present the queue exhausts',
      );
      assert.deepEqual(result.selectors, ['all'], 'selector should be "all"');
      assert.equal(result.language, undefined, 'no language filter applied');
      assert.equal(result.includeDeps, true);
    } finally {
      restore();
    }
  });
});
