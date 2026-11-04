/**
 * The OpenCode agent tool dialect and its `permission` block: each neutral tool expands to the
 * OpenCode permission keys from the D3 table, `read` keeps OpenCode's four default rules in the
 * object form (P4), and a provider pattern goes through `yamlScalar`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { renderTools } from '../../dist-cli/targets/tool-dialect';
import { NEUTRAL_TOOLS } from '../../dist-cli/tool-vocabulary';
import {
  OPENCODE_AGENT_TOOL_DIALECT,
  opencodePermissionBlock,
} from '../../dist-cli/targets/opencode/tool-dialect';

/** OpenCode's default `read` rules, in the order the object writes them. */
const READ_RULES = [
  "    '*': allow",
  "    '*.env': ask",
  "    '*.env.*': ask",
  "    '*.env.example': allow",
].join('\n');

/** The whole block for `read`, `search`, `shell`, from the plan. */
const CASE_1 = [
  'permission:',
  "  '*': deny",
  '  read:',
  READ_RULES,
  '  list: allow',
  '  grep: allow',
  '  glob: allow',
  '  bash: allow',
].join('\n');

describe('OPENCODE_AGENT_TOOL_DIALECT', () => {
  it('maps each neutral tool to its OpenCode permission keys', () => {
    assert.deepStrictEqual(renderTools(OPENCODE_AGENT_TOOL_DIALECT, [...NEUTRAL_TOOLS]), {
      kind: 'names',
      names: [
        'read',
        'list',
        'grep',
        'glob',
        'edit',
        'bash',
        'webfetch',
        'websearch',
        'task',
        'todowrite',
      ],
      exact: true,
      missing: [],
    });
  });
});

describe('opencodePermissionBlock', () => {
  it('writes deny, the read object and the allowed names, in dialect order', () => {
    assert.equal(opencodePermissionBlock(['read', 'search', 'shell']), CASE_1);
  });

  it('writes no read line when read is not authored', () => {
    const block = opencodePermissionBlock(['search']);
    assert.ok(block.includes("  '*': deny"));
    assert.match(block, /^ {2}grep: allow$/m);
    assert.match(block, /^ {2}glob: allow$/m);
    assert.doesNotMatch(block, /^ {2}read:/m);
  });

  it('writes each neutral tool alone', () => {
    const expected = new Map<string, string>([
      ['read', `${READ_RULES}\n  list: allow`],
      ['search', '  grep: allow\n  glob: allow'],
      ['edit', '  edit: allow'],
      ['shell', '  bash: allow'],
      ['web', '  webfetch: allow\n  websearch: allow'],
      ['agent', '  task: allow'],
      ['todo', '  todowrite: allow'],
    ]);
    for (const [authored, lines] of expected) {
      assert.equal(
        opencodePermissionBlock([authored]),
        `permission:\n  '*': deny\n${authored === 'read' ? '  read:\n' : ''}${lines}`,
        authored,
      );
    }
  });

  it('treats legacy names as their neutral tool', () => {
    assert.equal(
      opencodePermissionBlock(['Read', 'Bash']),
      ['permission:', "  '*': deny", '  read:', READ_RULES, '  list: allow', '  bash: allow'].join(
        '\n',
      ),
    );
  });

  it('quotes a provider pattern through yamlScalar', () => {
    assert.equal(
      opencodePermissionBlock(['Bash(git log:*)']),
      'permission:\n  \'*\': deny\n  "Bash(git log:*)": allow',
    );
  });

  it('parses back to an ask rule for .env, with * then read first', () => {
    const parsed = yaml.load(CASE_1) as { permission: Record<string, unknown> };
    const permission = parsed.permission;
    assert.deepStrictEqual(Object.keys(permission).slice(0, 2), ['*', 'read']);
    const read = permission.read as Record<string, unknown>;
    assert.equal(read['*.env'], 'ask');
  });
});
