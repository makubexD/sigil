/**
 * `resolveAddVars` picks each install variable's value: flag, recorded, dry-run preview, or prompt.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveAddVars } from '../../dist-cli/commands/add/resolve-vars';
import { SigilError } from '../../dist-cli/errors';
import { VAR_VALUE_RULE } from '../../dist-cli/mcp-vars';
import type { ResolvedArtifact } from '../../dist-cli/types';
import { mockClack } from '../helpers/clack-mock';

const ADO_VARS = {
  ADO_ORG: { title: 'Azure DevOps organization', description: 'Your org, e.g. contoso' },
};

function mcpArtifact(
  id: string,
  vars?: Record<string, { title: string; description: string }>,
): ResolvedArtifact {
  return {
    id,
    kind: 'mcp',
    filePath: `/catalog/${id}.md`,
    frontmatter: vars === undefined ? {} : { vars },
    body: '',
  };
}

interface AskCall {
  name: string;
  title: string;
  description: string;
}

function fakeAsk(answer: string | symbol = 'contoso'): {
  ask: (spec: AskCall) => Promise<string | symbol>;
  calls: AskCall[];
} {
  const calls: AskCall[] = [];
  const ask = async (spec: AskCall): Promise<string | symbol> => {
    calls.push(spec);
    return answer;
  };
  return { ask, calls };
}

type Input = Parameters<typeof resolveAddVars>[0];

function input(overrides: Partial<Input> = {}): Input {
  return {
    artifacts: [mcpArtifact('mcp/ado', ADO_VARS)],
    flags: {},
    recorded: () => ({}),
    dryRun: false,
    yes: false,
    interactive: false,
    ask: async () => 'contoso',
    ...overrides,
  };
}

describe('resolveAddVars', () => {
  it('uses a flag without asking', async () => {
    const ask = fakeAsk();
    const values = await resolveAddVars(input({ flags: { ADO_ORG: 'contoso' }, ask: ask.ask }));

    assert.deepEqual(values, { ADO_ORG: 'contoso' });
    assert.equal(ask.calls.length, 0);
  });

  it('prefers a flag over a different recorded value', async () => {
    const ask = fakeAsk();
    const values = await resolveAddVars(
      input({
        flags: { ADO_ORG: 'contoso' },
        recorded: () => ({ ADO_ORG: 'fabrikam' }),
        interactive: true,
        ask: ask.ask,
      }),
    );

    assert.deepEqual(values, { ADO_ORG: 'contoso' });
    assert.equal(ask.calls.length, 0);
  });

  it('uses a recorded value without asking', async () => {
    const ask = fakeAsk();
    const values = await resolveAddVars(
      input({ recorded: () => ({ ADO_ORG: 'contoso' }), ask: ask.ask }),
    );

    assert.deepEqual(values, { ADO_ORG: 'contoso' });
    assert.equal(ask.calls.length, 0);
  });

  it('asks once interactively and uses the answer', async () => {
    const ask = fakeAsk('contoso');
    const values = await resolveAddVars(input({ interactive: true, ask: ask.ask }));

    assert.deepEqual(values, { ADO_ORG: 'contoso' });
    assert.deepEqual(ask.calls, [
      {
        name: 'ADO_ORG',
        title: 'Azure DevOps organization',
        description: 'Your org, e.g. contoso',
      },
    ]);
  });

  it('throws with the --var hint under --yes and never asks', async () => {
    const ask = fakeAsk();

    await assert.rejects(
      resolveAddVars(input({ yes: true, interactive: true, ask: ask.ask })),
      (err: unknown) =>
        err instanceof SigilError && err.hint?.includes('--var ADO_ORG=<value>') === true,
    );
    assert.equal(ask.calls.length, 0);
  });

  it('throws with the --var hint when not interactive and never asks', async () => {
    const ask = fakeAsk();

    await assert.rejects(
      resolveAddVars(input({ interactive: false, ask: ask.ask })),
      (err: unknown) =>
        err instanceof SigilError && err.hint?.includes('--var ADO_ORG=<value>') === true,
    );
    assert.equal(ask.calls.length, 0);
  });

  it('previews a missing value as <NAME> under --dry-run without asking', async () => {
    const ask = fakeAsk();
    const values = await resolveAddVars(input({ dryRun: true, interactive: true, ask: ask.ask }));

    assert.deepEqual(values, { ADO_ORG: '<ADO_ORG>' });
    assert.equal(ask.calls.length, 0);
  });

  it('asks once for two artifacts that share a name', async () => {
    const first = mcpArtifact('mcp/ado-claude', {
      ADO_ORG: { title: 'First title', description: 'first description' },
    });
    const second = mcpArtifact('mcp/ado-copilot', {
      ADO_ORG: { title: 'Second title', description: 'second description' },
    });
    const ask = fakeAsk('contoso');
    const values = await resolveAddVars(
      input({ artifacts: [first, second], interactive: true, ask: ask.ask }),
    );

    assert.deepEqual(values, { ADO_ORG: 'contoso' });
    assert.equal(ask.calls.length, 1);
    assert.equal(ask.calls[0]?.title, 'First title');
  });

  it('returns cancelled when the prompt is cancelled', async () => {
    const restore = mockClack([]);
    try {
      const values = await resolveAddVars(
        input({ interactive: true, ask: async () => Symbol('cancel') }),
      );

      assert.equal(values, 'cancelled');
    } finally {
      restore();
    }
  });

  it('throws for a flag that names no selected variable', async () => {
    const ask = fakeAsk();

    await assert.rejects(
      resolveAddVars(input({ flags: { TYPO: 'x' }, ask: ask.ask })),
      (err: unknown) => err instanceof SigilError && err.message.includes('TYPO'),
    );
    assert.equal(ask.calls.length, 0);
  });

  it('returns an empty object when no artifact declares vars', async () => {
    const ask = fakeAsk();
    const values = await resolveAddVars(
      input({ artifacts: [mcpArtifact('mcp/plain')], ask: ask.ask }),
    );

    assert.deepEqual(values, {});
    assert.equal(ask.calls.length, 0);
  });

  it('takes the literal value cancelled from a flag', async () => {
    const values = await resolveAddVars(input({ flags: { ADO_ORG: 'cancelled' } }));

    assert.deepEqual(values, { ADO_ORG: 'cancelled' });
  });

  it('takes the literal value cancelled from a prompt', async () => {
    const ask = fakeAsk('cancelled');
    const values = await resolveAddVars(input({ interactive: true, ask: ask.ask }));

    assert.deepEqual(values, { ADO_ORG: 'cancelled' });
  });

  it('does not read a declared name from what an object inherits', async () => {
    const vars = { constructor: { title: 'T', description: 'D' } };

    await assert.rejects(
      resolveAddVars(input({ artifacts: [mcpArtifact('mcp/odd', vars)] })),
      (err: unknown) => err instanceof SigilError && err.message.includes('constructor'),
    );
  });

  it('accepts a flag for a name only an up-to-date artifact declares', async () => {
    const values = await resolveAddVars(
      input({
        artifacts: [],
        upToDate: [mcpArtifact('mcp/ado', ADO_VARS)],
        flags: { ADO_ORG: 'contoso' },
      }),
    );

    assert.deepEqual(values, {});
  });

  it('throws when a custom ask returns an invalid value', async () => {
    const ask = fakeAsk('a b');

    await assert.rejects(
      resolveAddVars(input({ interactive: true, ask: ask.ask })),
      (err: unknown) => err instanceof SigilError && err.message.includes(VAR_VALUE_RULE),
    );
    assert.equal(ask.calls.length, 1);
  });
});
