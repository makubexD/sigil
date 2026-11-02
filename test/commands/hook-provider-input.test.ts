/**
 * Tests for `hook-provider-input` (src/commands/sync/conformance/rules/hook-provider-input.ts) —
 * the rule that flags a catalog hook reading a provider's own stdin field instead of the neutral
 * `input` argument. detect() is called directly against small in-memory catalogs, in the fixture
 * style of legacy-tool-name.test.ts.
 *
 * Antigravity's `toolCall.name` / `toolCall.args` dialect ships only in Phase E (it does not
 * register `hookInput` yet), so the `toolCall` cases pass the same fixture dialect
 * test/targets/hook-input.test.ts already uses for that shape.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hookInputLiterals,
  hookProviderInputRule,
} from '../../dist-cli/commands/sync/conformance/rules/hook-provider-input';
import { runConformance } from '../../dist-cli/commands/sync/conformance/detect';
import type { ConformanceContext } from '../../dist-cli/commands/sync/conformance/types';
import type { LoadedCatalog, Target } from '../../dist-cli/types';
import type { HookInputDialect } from '../../dist-cli/targets/hook-input';
import { getAllTargets } from '../../dist-cli/targets/index';
import { makeCatalog, makeSkill } from '../helpers/fixtures';
import { loadBundledCatalog } from '../helpers/catalog';

/** A dialect shaped like Antigravity's (`toolCall.name` / `toolCall.args`). */
const antigravityFixture: HookInputDialect = {
  toolField: 'toolCall.name',
  inputField: 'toolCall.args',
  pathFields: ['Path', 'TargetFile'],
  commandField: 'CommandLine',
  toolNames: {},
};

const antigravityTarget = { hookInput: antigravityFixture } as unknown as Target;

function contextFor(
  artifact: unknown,
  targets: readonly Target[] = getAllTargets(),
): ConformanceContext {
  return {
    catalog: makeCatalog([artifact as Record<string, unknown>]) as unknown as LoadedCatalog,
    targets,
  };
}

/** A minimal fake hook artifact, matching the fixture style above. */
function makeHook(fmOverrides: Record<string, unknown> = {}) {
  return {
    id: 'shared/test-hook',
    kind: 'hook',
    filePath: '/catalog/shared/hooks/test-hook.hook.md',
    frontmatter: {
      id: 'shared/test-hook',
      kind: 'hook',
      event: 'before-tool',
      script: 'return 0;',
      ...fmOverrides,
    },
    body: '',
  };
}

describe('hook-provider-input — detect', () => {
  it('does not flag a script that reads the neutral input contract', () => {
    const ctx = contextFor(
      makeHook({
        script: 'if (!input) return; if (input.files.length === 0 && input.command) return;',
      }),
    );
    assert.deepEqual(hookProviderInputRule.detect(ctx), []);
  });

  it('flags a script that parses stdin and reads tool_input', () => {
    const ctx = contextFor(
      makeHook({ script: 'const ti = JSON.parse(stdin).tool_input; return ti.file_path;' }),
    );
    const findings = hookProviderInputRule.detect(ctx);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ruleId, 'hook-provider-input');
    assert.match(findings[0]?.detail ?? '', /script 'tool_input'/);
  });

  it('flags a command args entry that reads toolCall', () => {
    const ctx = contextFor(
      makeHook({ script: undefined, command: 'node', args: ['-e', 'x.toolCall.args'] }),
      [...getAllTargets(), antigravityTarget],
    );
    const findings = hookProviderInputRule.detect(ctx);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.detail ?? '', /args 'toolCall'/);
  });

  it('flags a command that names a provider tool field', () => {
    const ctx = contextFor(makeHook({ script: undefined, command: 'echo tool_name' }));
    const findings = hookProviderInputRule.detect(ctx);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.detail ?? '', /command 'tool_name'/);
  });

  it('does not flag a non-hook artifact whose body names a provider field', () => {
    const skill = { ...makeSkill(), body: 'Read tool_input before you start.' };
    assert.deepEqual(hookProviderInputRule.detect(contextFor(skill)), []);
  });
});

describe('hook-provider-input — derived literals', () => {
  it('derives tool_input and a dotted path segment, and drops literals of 4 characters or fewer', () => {
    const registered = hookInputLiterals();
    assert.ok(registered.includes('tool_input'), registered.join(', '));

    const withAntigravity = hookInputLiterals([...getAllTargets(), antigravityTarget]);
    assert.ok(withAntigravity.includes('toolCall'), withAntigravity.join(', '));
    assert.deepEqual(
      withAntigravity.filter(literal => literal.length <= 4),
      [],
      withAntigravity.join(', '),
    );
  });
});

describe('hook-provider-input — the real catalog', () => {
  it('reports exactly the three catalog hooks that read provider stdin', async () => {
    const catalog = await loadBundledCatalog();
    const findings = runConformance(catalog, getAllTargets(), {
      ruleId: 'hook-provider-input',
    });
    assert.deepEqual(
      findings.map(finding => finding.artifactId).sort(),
      ['shared/protect-config', 'shared/reviewer-bash-guard', 'shared/worker-mode-guard'],
      findings.map(finding => `${finding.artifactId}: ${finding.detail}`).join('\n'),
    );
  });
});
