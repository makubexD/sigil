/**
 * The home menu over every folder state the registered tools can produce: folder kind × tools set
 * up × installs × damaged record. The rules live in `checkCell`; this file feeds it the grid.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAllTargets } from '../../dist-cli/targets';
import { toolList } from '../../dist-cli/tool-names';
import { cells, checkCell } from '../helpers/menu-matrix';

describe('home menu state matrix', () => {
  const tools = getAllTargets().map(t => t.name);

  it('should satisfy every menu rule in every folder state', () => {
    const grid = cells(tools);
    assert.ok(grid.length >= 160, `expected a real grid, got ${grid.length} cells`);
    for (const cell of grid) checkCell(cell, tools);
  });
});

describe('toolList', () => {
  it('should read naturally for one, two and three names', () => {
    assert.equal(toolList(['claude']), 'Claude Code');
    assert.equal(toolList(['claude', 'copilot']), 'Claude Code and GitHub Copilot');
    assert.equal(toolList(['claude', 'copilot'], 'or'), 'Claude Code or GitHub Copilot');
  });

  it('should be empty for no names', () => {
    assert.equal(toolList([]), '');
  });

  it('should stay one short line however many tools there are', () => {
    const many = ['claude', 'copilot', 'x1', 'x2', 'x3'];
    assert.equal(toolList(many, 'or'), 'Claude Code, GitHub Copilot, x1 or 2 more');
  });
});
