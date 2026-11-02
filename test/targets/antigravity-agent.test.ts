/**
 * The Antigravity agent tool dialect: each neutral tool expands to the Antigravity names probe D1
 * saw load and work, one name per tool, with `todo` unmapped (there is no task-list tool) and a
 * provider pattern passed through verbatim. `ANTIGRAVITY_ALL_TOOL_NAMES` is the full list an agent
 * with no authored `tools` gets, and `ANTIGRAVITY_MODEL_TIERS` is the closed model table.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderTools } from '../../dist-cli/targets/tool-dialect';
import { NEUTRAL_TOOLS } from '../../dist-cli/tool-vocabulary';
import {
  ANTIGRAVITY_AGENT_TOOL_DIALECT,
  ANTIGRAVITY_ALL_TOOL_NAMES,
  ANTIGRAVITY_MODEL_TIERS,
  antigravityAgentToolNames,
} from '../../dist-cli/targets/antigravity/tool-dialect';

describe('antigravityAgentToolNames', () => {
  it('expands read then search in table order', () => {
    assert.deepStrictEqual(antigravityAgentToolNames(['read', 'search']), [
      'view_file',
      'grep_search',
      'find_by_name',
      'list_dir',
    ]);
  });

  it('writes four authored groups in authored order with no duplicates', () => {
    assert.deepStrictEqual(antigravityAgentToolNames(['read', 'search', 'shell', 'edit']), [
      'view_file',
      'grep_search',
      'find_by_name',
      'list_dir',
      'run_command',
      'write_to_file',
      'replace_file_content',
    ]);
  });

  it('treats legacy names as their neutral tool', () => {
    assert.deepStrictEqual(antigravityAgentToolNames(['Read', 'Grep', 'Bash']), [
      'view_file',
      'grep_search',
      'find_by_name',
      'list_dir',
      'run_command',
    ]);
  });

  it('passes a provider pattern through verbatim after the mapped names', () => {
    assert.deepStrictEqual(antigravityAgentToolNames(['read', 'mcp:github/*']), [
      'view_file',
      'mcp:github/*',
    ]);
  });
});

describe('antigravity agent tool dialect', () => {
  it('is inexact and missing todo, which has no Antigravity tool', () => {
    assert.deepStrictEqual(renderTools(ANTIGRAVITY_AGENT_TOOL_DIALECT, ['todo']), {
      kind: 'names',
      names: [],
      exact: false,
      missing: ['todo'],
    });
  });

  it('is exact for read, search, shell and edit', () => {
    assert.deepStrictEqual(
      renderTools(ANTIGRAVITY_AGENT_TOOL_DIALECT, ['read', 'search', 'shell', 'edit']),
      {
        kind: 'names',
        names: [
          'view_file',
          'grep_search',
          'find_by_name',
          'list_dir',
          'run_command',
          'write_to_file',
          'replace_file_content',
        ],
        exact: true,
        missing: [],
      },
    );
  });

  it('writes every defined entry in NEUTRAL_TOOLS order, deduped, with no todo', () => {
    assert.deepStrictEqual(
      ANTIGRAVITY_ALL_TOOL_NAMES,
      antigravityAgentToolNames([...NEUTRAL_TOOLS]),
    );
    assert.deepStrictEqual(ANTIGRAVITY_ALL_TOOL_NAMES, [
      'view_file',
      'grep_search',
      'find_by_name',
      'list_dir',
      'write_to_file',
      'replace_file_content',
      'run_command',
      'search_web',
      'read_url_content',
      'invoke_subagent',
    ]);
    assert.ok(!ANTIGRAVITY_ALL_TOOL_NAMES.includes('todo'));
    assert.equal(new Set(ANTIGRAVITY_ALL_TOOL_NAMES).size, ANTIGRAVITY_ALL_TOOL_NAMES.length);
  });

  it('maps the three neutral model tiers to the closed Antigravity table', () => {
    assert.deepStrictEqual(ANTIGRAVITY_MODEL_TIERS, {
      fast: 'flash_lite',
      balanced: 'flash',
      deep: 'pro',
    });
  });
});
