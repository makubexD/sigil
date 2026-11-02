/**
 * ConfigKindTable: the helpers that derive a target's configScopes, scaffoldConfig,
 * configSkipReason and destination lookup from one table. The fixture is Cursor-shaped — `hook`
 * and `mcp`, each at project + user — because Cursor and Codex are the first tables; `local` is
 * absent on both writers so the refusal path is exercised.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {
  configScopesFrom,
  configSkipReasonFrom,
  destinationFor,
  scaffoldConfigFrom,
} from '../../dist-cli/targets/config-kind-table';
import { SigilError } from '../../dist-cli/errors';
import type { ConfigKindTable, ConfigKindWriter } from '../../dist-cli/targets/config-kind-table';
import type {
  Artifact,
  ArtifactKind,
  ConfigMergeOp,
  ConfigScope,
  ConfigScopeInfo,
} from '../../dist-cli/types';

const PROJECT_DIR = '/abs/project';

/** One recognizable op so a test can tell which writer ran and at which scope. */
function fakeOp(kind: string, scope: ConfigScope): ConfigMergeOp {
  return { file: `${kind}.json`, fragment: { kind, scope }, strategy: {}, section: kind };
}

const HOOK_WRITER: ConfigKindWriter = {
  section: 'hooks',
  destinations: {
    project: {
      file: '.cursor/hooks.json',
      root: 'project',
      display: '.cursor/hooks.json, git-committed',
    },
    user: {
      file: '.cursor/hooks.json',
      root: 'home',
      display: '~/.cursor/hooks.json, all projects',
    },
  },
  buildOps: (_artifact, scope) => [fakeOp('hook', scope)],
  skipReason: artifact =>
    artifact.frontmatter.event === 'NoCursorEvent' ? 'no Cursor equivalent' : undefined,
};

const MCP_WRITER: ConfigKindWriter = {
  section: 'mcpServers',
  destinations: {
    project: {
      file: '.cursor/mcp.json',
      root: 'project',
      display: '.cursor/mcp.json, git-committed',
    },
    user: {
      file: '.cursor/mcp.json',
      root: 'home',
      display: '~/.cursor/mcp.json, all projects',
    },
  },
  buildOps: (_artifact, scope) => [fakeOp('mcp', scope)],
};

/** The two-kind fixture: hook and mcp, both at project and user. */
function twoKindTable(): ConfigKindTable {
  return { hook: HOOK_WRITER, mcp: MCP_WRITER };
}

/** The one-kind fixture, for the singular unsupported-kind message. */
function hookOnlyTable(): ConfigKindTable {
  return { hook: HOOK_WRITER };
}

function makeArtifact(kind: ArtifactKind, defaultScope?: ConfigScope): Artifact {
  return {
    id: `shared/test-${kind}`,
    kind,
    filePath: '/fake/test.md',
    frontmatter: defaultScope ? { defaultScope } : {},
    body: '',
  };
}

const SCOPE_INFOS: readonly Omit<ConfigScopeInfo, 'label' | 'destinations'>[] = [
  {
    value: 'project',
    precedence: 1,
    shared: true,
    blastRadius: 'project',
    description: 'project — .cursor files, git-committed',
  },
  {
    value: 'user',
    precedence: 2,
    shared: false,
    blastRadius: 'all-projects',
    description: 'user — ~/.cursor files, all projects',
  },
];

describe('configScopesFrom', () => {
  it('lists both kinds per scope, each with its section and resolved path', () => {
    const scopes = configScopesFrom(twoKindTable(), SCOPE_INFOS, ['hook', 'mcp'], PROJECT_DIR);

    assert.equal(scopes.length, 2);
    assert.equal(scopes[0]?.label, 'project');
    assert.deepEqual(scopes[0]?.destinations, [
      {
        kind: 'hook',
        file: '.cursor/hooks.json',
        root: 'project',
        fullPath: path.join(PROJECT_DIR, '.cursor/hooks.json'),
        section: 'hooks',
      },
      {
        kind: 'mcp',
        file: '.cursor/mcp.json',
        root: 'project',
        fullPath: path.join(PROJECT_DIR, '.cursor/mcp.json'),
        section: 'mcpServers',
      },
    ]);
    assert.equal(scopes[1]?.label, 'user');
    assert.deepEqual(scopes[1]?.destinations, [
      {
        kind: 'hook',
        file: '.cursor/hooks.json',
        root: 'home',
        fullPath: path.join(os.homedir(), '.cursor/hooks.json'),
        section: 'hooks',
      },
      {
        kind: 'mcp',
        file: '.cursor/mcp.json',
        root: 'home',
        fullPath: path.join(os.homedir(), '.cursor/mcp.json'),
        section: 'mcpServers',
      },
    ]);
  });

  it('gives every scope no destinations for a kind the table lacks', () => {
    const scopes = configScopesFrom(twoKindTable(), SCOPE_INFOS, ['settings'], PROJECT_DIR);
    assert.deepEqual(
      scopes.map(scope => scope.destinations),
      [[], []],
    );
  });
});

describe('destinationFor', () => {
  it('returns the scope destination', () => {
    assert.deepEqual(destinationFor(twoKindTable(), 'mcp', 'user', 'Cursor'), {
      file: '.cursor/mcp.json',
      root: 'home',
      display: '~/.cursor/mcp.json, all projects',
    });
  });

  it('unsupported kind on a one-kind table names the singular kind', () => {
    assert.throws(
      () => destinationFor(hookOnlyTable(), 'settings', 'project', 'Cursor'),
      (err: Error) => {
        assert.ok(err instanceof SigilError);
        assert.equal(err.message, "Cursor supports only the 'hook' config kind, not 'settings'.");
        return true;
      },
    );
  });

  it('unsupported kind on a two-kind table joins both kinds', () => {
    assert.throws(
      () => destinationFor(twoKindTable(), 'settings', 'project', 'Codex'),
      (err: Error) => {
        assert.ok(err instanceof SigilError);
        assert.equal(
          err.message,
          "Codex supports only the 'hook' and 'mcp' config kinds, not 'settings'.",
        );
        return true;
      },
    );
  });

  it('a missing scope names every scope the writer has, with its display', () => {
    assert.throws(
      () => destinationFor(twoKindTable(), 'hook', 'local', 'Cursor'),
      (err: Error) => {
        assert.ok(err instanceof SigilError);
        assert.equal(
          err.message,
          'Cursor has no personal per-project hook file — install at ' +
            "'project' scope (.cursor/hooks.json, git-committed) or " +
            "'user' scope (~/.cursor/hooks.json, all projects).",
        );
        return true;
      },
    );
  });

  it('a missing user scope says user-level, naming the project scope it has', () => {
    const projectOnlyHook: ConfigKindWriter = {
      ...HOOK_WRITER,
      destinations: {
        project: {
          file: '.cursor/hooks.json',
          root: 'project',
          display: '.cursor/hooks.json, git-committed',
        },
      },
    };
    assert.throws(
      () => destinationFor({ hook: projectOnlyHook }, 'hook', 'user', 'Cursor'),
      (err: Error) => {
        assert.ok(err instanceof SigilError);
        assert.ok(
          err.message.startsWith(
            "Cursor has no user-level hook file — install at 'project' scope (",
          ),
          err.message,
        );
        return true;
      },
    );
  });

  it('a missing project scope says project, naming the user scope it has', () => {
    const userOnlyHook: ConfigKindWriter = {
      ...HOOK_WRITER,
      destinations: {
        user: {
          file: 'hooks.json',
          root: 'codex-home',
          display: '$CODEX_HOME/hooks.json, default ~/.codex/hooks.json',
        },
      },
    };
    assert.throws(
      () => destinationFor({ hook: userOnlyHook }, 'hook', 'project', 'Codex'),
      (err: Error) => {
        assert.ok(err instanceof SigilError);
        assert.ok(
          err.message.startsWith("Codex has no project hook file — install at 'user' scope ("),
          err.message,
        );
        return true;
      },
    );
  });
});

describe('scaffoldConfigFrom', () => {
  it('uses frontmatter defaultScope when no scope is given', () => {
    const ops = scaffoldConfigFrom(
      twoKindTable(),
      makeArtifact('hook', 'user'),
      { projectDir: PROJECT_DIR },
      'Cursor',
    );
    assert.deepEqual(ops, [fakeOp('hook', 'user')]);
  });

  it('prefers options.scope over frontmatter defaultScope', () => {
    const ops = scaffoldConfigFrom(
      twoKindTable(),
      makeArtifact('hook', 'user'),
      { projectDir: PROJECT_DIR, scope: 'project' },
      'Cursor',
    );
    assert.deepEqual(ops, [fakeOp('hook', 'project')]);
  });

  it('defaults to project when neither is set', () => {
    const ops = scaffoldConfigFrom(
      twoKindTable(),
      makeArtifact('mcp'),
      { projectDir: PROJECT_DIR },
      'Cursor',
    );
    assert.deepEqual(ops, [fakeOp('mcp', 'project')]);
  });
});

describe('configSkipReasonFrom', () => {
  it('returns undefined for a kind whose writer has no skipReason', () => {
    assert.equal(configSkipReasonFrom(twoKindTable(), makeArtifact('mcp')), undefined);
  });

  it('delegates to the writer when it has one', () => {
    const artifact = makeArtifact('hook');
    artifact.frontmatter.event = 'NoCursorEvent';
    assert.equal(configSkipReasonFrom(twoKindTable(), artifact), 'no Cursor equivalent');
  });
});
