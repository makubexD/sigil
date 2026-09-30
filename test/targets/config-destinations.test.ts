/**
 * Tests for scope-aware config destination resolution.
 * Covers Claude Code and Copilot target config scope → file path tables.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import {
  resolveClaudeConfigDestination,
  ClaudeCodeTarget,
} from '../../dist-cli/targets/claude-code';
import { resolveCopilotConfigDestination } from '../../dist-cli/targets/copilot';
import { resolveConfigRoot } from '../../dist-cli/config-utils';
import { applyMerge, reverseMerge } from '../../dist-cli/config-merge';
import type { ConfigMergeOp } from '../../dist-cli/types';

const PROJECT_DIR = '/abs/myproject';

describe('N — Scope-aware config destinations', () => {
  // ── Claude Code scope → destination table ──────────────────────────────────

  it('Claude settings/hook: project scope → .claude/settings.json (root: project)', () => {
    const d = resolveClaudeConfigDestination('settings', 'project', PROJECT_DIR);
    assert.equal(d.file, '.claude/settings.json');
    assert.equal(d.root, 'project');
    assert.equal(d.wrapPath, undefined);
  });

  it('Claude settings/hook: local scope → .claude/settings.local.json (root: project)', () => {
    const dH = resolveClaudeConfigDestination('hook', 'local', PROJECT_DIR);
    assert.equal(dH.file, '.claude/settings.local.json');
    assert.equal(dH.root, 'project');

    const dS = resolveClaudeConfigDestination('settings', 'local', PROJECT_DIR);
    assert.equal(dS.file, '.claude/settings.local.json');
    assert.equal(dS.root, 'project');
  });

  it('Claude settings/hook: user scope → .claude/settings.json (root: home)', () => {
    const d = resolveClaudeConfigDestination('hook', 'user', PROJECT_DIR);
    assert.equal(d.file, '.claude/settings.json');
    assert.equal(d.root, 'home');
  });

  it('Claude mcp: project scope → .mcp.json (root: project)', () => {
    const d = resolveClaudeConfigDestination('mcp', 'project', PROJECT_DIR);
    assert.equal(d.file, '.mcp.json');
    assert.equal(d.root, 'project');
    assert.equal(d.wrapPath, undefined);
  });

  it('Claude mcp: user scope → .claude.json (root: home)', () => {
    const d = resolveClaudeConfigDestination('mcp', 'user', PROJECT_DIR);
    assert.equal(d.file, '.claude.json');
    assert.equal(d.root, 'home');
    assert.equal(d.wrapPath, undefined);
  });

  it('Claude mcp: local scope → .claude.json (root: home) with wrapPath=[projects,<absProjectDir>]', () => {
    const d = resolveClaudeConfigDestination('mcp', 'local', PROJECT_DIR);
    assert.equal(d.file, '.claude.json');
    assert.equal(d.root, 'home');
    assert.deepEqual(d.wrapPath, ['projects', PROJECT_DIR]);
  });

  // ── Copilot scope → destination table ─────────────────────────────────────

  it('Copilot mcp: project scope → .vscode/mcp.json (root: project)', () => {
    const d = resolveCopilotConfigDestination('mcp', 'project');
    assert.equal(d.file, '.vscode/mcp.json');
    assert.equal(d.root, 'project');
  });

  it('Copilot mcp: local scope → .vscode/mcp.json (aliased, no distinct local scope)', () => {
    const d = resolveCopilotConfigDestination('mcp', 'local');
    assert.equal(d.file, '.vscode/mcp.json');
    assert.equal(d.root, 'project');
  });

  it('Copilot mcp: user scope → mcp.json (root: vscode-user)', () => {
    const d = resolveCopilotConfigDestination('mcp', 'user');
    assert.equal(d.file, 'mcp.json');
    assert.equal(d.root, 'vscode-user');
  });

  // ── CLI resolveConfigRoot ─────────────────────────────────────────────────

  it('resolveConfigRoot: project → projectDir', () => {
    assert.equal(resolveConfigRoot('project', '/abs/project'), '/abs/project');
    assert.equal(resolveConfigRoot(undefined, '/abs/project'), '/abs/project');
  });

  it('resolveConfigRoot: home → os.homedir()', () => {
    assert.equal(resolveConfigRoot('home', '/abs/project'), os.homedir());
  });

  it('resolveConfigRoot: vscode-user → a non-empty path string', () => {
    const result = resolveConfigRoot('vscode-user', '/abs/project');
    assert.ok(typeof result === 'string' && result.length > 0, 'should return a path');
    // Should contain "Code" and "User" somewhere
    assert.ok(result.includes('Code'), `expected "Code" in VS Code user path: ${result}`);
  });

  // ── mcp-local wrap path → applyMerge round-trip ──────────────────────────

  it('Claude mcp-local wrapPath produces isolated per-project merge', () => {
    // Simulate two projects already in ~/.claude.json
    const existingClaudeJson: Record<string, unknown> = {
      authed: true,
      projects: {
        '/other/project': { mcpServers: { 'other-server': { command: 'other' } } },
      },
    };

    const serverConfig = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-fs'] };
    const absProjectDir = '/abs/myproject';

    // Build the op as the target would
    const dest = resolveClaudeConfigDestination('mcp', 'local', absProjectDir);
    assert.deepEqual(dest.wrapPath, ['projects', absProjectDir]);

    const [topKey, ...nested] = dest.wrapPath!;
    let inner: Record<string, unknown> = { mcpServers: { filesystem: serverConfig } };
    for (const k of [...nested].reverse()) {
      inner = { [k]: inner };
    }
    const op: ConfigMergeOp = {
      file: dest.file,
      root: dest.root,
      fragment: { [topKey]: inner },
      strategy: { [topKey]: 'object-spread' },
    };

    const merged = applyMerge(existingClaudeJson, op) as Record<string, unknown>;
    const projects = merged.projects as Record<string, unknown>;

    // New project entry added
    assert.ok(projects[absProjectDir] !== undefined, 'new project entry added');
    // Existing /other/project preserved
    assert.ok(projects['/other/project'] !== undefined, 'other project preserved');
    // Top-level keys preserved
    assert.equal(merged.authed, true);

    // reverseMerge removes only the new project entry, leaving /other/project intact
    const cleaned = reverseMerge(merged, op) as Record<string, unknown>;
    const cleanedProjects = cleaned.projects as Record<string, unknown>;
    assert.ok(
      cleanedProjects['/other/project'] !== undefined,
      'other project still present after reverse',
    );
    // The new project entry should be pruned (empty after removal)
    assert.equal(
      cleanedProjects[absProjectDir],
      undefined,
      'new project entry removed after reverse',
    );
  });

  // ── defaultScope on frontmatter is respected ──────────────────────────────

  it('Claude scaffoldConfig respects defaultScope from frontmatter when options.scope is absent', async () => {
    const target = new ClaudeCodeTarget();

    // Build a minimal catalog with a hook that has defaultScope: local
    const hookArtifact = {
      id: 'shared/test-hook',
      kind: 'hook' as const,
      filePath: '/fake/hook.md',
      frontmatter: {
        kind: 'hook',
        title: 'Test Hook',
        description: 'Test',
        event: 'PreToolUse',
        matcher: '*',
        command: 'echo hi',
        defaultScope: 'local',
      },
      body: '',
    };
    const fakeResolvedCatalog = {
      artifacts: [hookArtifact],
      byId: new Map([['shared/test-hook', hookArtifact]]),
      languages: new Map(),
    } as unknown as import('../../dist-cli/types').ResolvedCatalog;

    const ops = await target.scaffoldConfig('shared/test-hook', fakeResolvedCatalog, {
      projectDir: '/abs/project',
      // no scope override — should fall back to frontmatter defaultScope: 'local'
    });

    assert.equal(ops.length, 1);
    assert.equal(
      ops[0].file,
      '.claude/settings.local.json',
      'defaultScope:local → settings.local.json',
    );
    assert.equal(ops[0].root, 'project');
  });
});
