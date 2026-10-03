/**
 * The install summary: config merges are listed with the written files (never above the summary),
 * and the "repeat" command is printed only when the wizard chose the picks, without the picks that
 * install nothing because another pick already carries them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { renderOutcome } from '../../dist-cli/commands/add/render';
import type { AddPlan } from '../../dist-cli/commands/add/plan';
import { withTempDirAsync } from '../helpers/temp-dir';

const CATALOG = path.resolve(__dirname, '../../catalog');
const PACKS = path.resolve(__dirname, '../../packs.yaml');
const MCP_PICK = 'mcp:shared/context-mode';
const REPEAT_HEADING = 'Repeat non-interactively';
const SUMMARY_MARK = '✓';
const MERGE_MARK = '(merged: shared/context-mode)';
const INLINED_RULE = 'rule:shared/clean-code';
const CARRIER_SKILL = 'skill:typescript/ts-code-quality';

function capture(run: () => unknown): Promise<string> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.join(' '));
  return Promise.resolve(run())
    .finally(() => (console.log = original))
    .then(() => lines.join('\n'));
}

function install(dir: string, selector: string): Promise<string> {
  return capture(() =>
    runAdd([selector], {
      projectDir: dir,
      catalogDir: CATALOG,
      packs: PACKS,
      target: 'claude',
      deps: false,
      dryRun: false,
      interactive: false,
      yes: true,
      overwrite: false,
      settingsLocal: false,
    }),
  );
}

function wizardPlan(selectors: string[]): AddPlan {
  return {
    opts: { projectDir: '/tmp/project' },
    target: {},
    targetName: 'claude',
    effectiveSelectors: selectors,
    effectiveIncludeDeps: true,
    effectiveOverwrite: false,
    effectiveScope: 'project',
    fromWizard: true,
    skipped: [{ id: 'shared/clean-code', kind: 'rule', reason: 'inlined', cause: 'inlined' }],
    upToDateIds: [],
    configIds: [],
    toWrite: {},
    conflicting: {},
    primaryPaths: new Set<string>(),
  } as unknown as AddPlan;
}

describe('sigil add — summary', () => {
  it('should list a JSON merge after the summary line, not before it', async () => {
    await withTempDirAsync(async dir => {
      const out = await install(dir, MCP_PICK);

      assert.ok(out.includes(MERGE_MARK), out);
      assert.ok(out.indexOf(SUMMARY_MARK) < out.indexOf(MERGE_MARK), out);
    });
  });

  it('should not echo a repeat command after a command the user typed', async () => {
    await withTempDirAsync(async dir => {
      const out = await install(dir, MCP_PICK);

      assert.ok(!out.includes(REPEAT_HEADING), out);
    });
  });

  it('should drop a pick another pick already carries from the repeat command', async () => {
    const out = await capture(() =>
      renderOutcome(wizardPlan([CARRIER_SKILL, INLINED_RULE]), {
        overwrittenCount: 0,
        configWrittenCount: 0,
        merged: [],
      }),
    );

    assert.ok(out.includes(REPEAT_HEADING), out);
    assert.ok(out.includes(CARRIER_SKILL), out);
    assert.ok(!out.includes(INLINED_RULE), out);
  });
});
