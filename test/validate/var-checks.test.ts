/**
 * `checkVarDeclarations`: an `mcp` artifact's `{sigil:var:NAME}` tokens and `vars:` declarations
 * must name the same set. The "real catalog" row of the plan's table is proved by
 * `npm run validate`, not here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkVarDeclarations } from '../../dist-cli/validate/var-checks';
import { McpSchema } from '../../dist-cli/schema/index';
import type { ValidateCtx } from '../../dist-cli/validate/types';
import { makeCatalog, makeSkill } from '../helpers/fixtures';

interface FakeMcp {
  [key: string]: unknown;
  id: string;
  kind: 'mcp';
  filePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/** A minimal `mcp` artifact; `fm` is shallow-merged over its frontmatter. */
function makeMcp(fm: Record<string, unknown> = {}): FakeMcp {
  return {
    id: 'shared/ado',
    kind: 'mcp',
    filePath: '/catalog/shared/mcps/ado.mcp.md',
    frontmatter: {
      id: 'shared/ado',
      kind: 'mcp',
      title: 'Azure DevOps',
      description: 'desc',
      server: { command: 'npx' },
      ...fm,
    },
    body: '',
  };
}

function errorsFor(artifact: FakeMcp | ReturnType<typeof makeSkill>) {
  const ctx = {
    catalog: makeCatalog([artifact]),
    knownTargets: undefined,
    errors: [],
    warnings: [],
  } as unknown as ValidateCtx;
  checkVarDeclarations(ctx, artifact as never);
  return ctx.errors;
}

const VAR_X = { X: { title: 'Organization', description: 'The contoso org' } };

describe('checkVarDeclarations', () => {
  it('passes when every token is declared and used in args', () => {
    const artifact = makeMcp({ vars: VAR_X, server: { command: 'npx', args: ['{sigil:var:X}'] } });
    assert.deepEqual(errorsFor(artifact), []);
  });

  it('errors on a token with no vars: declaration, naming the token and the artifact id', () => {
    const artifact = makeMcp({ server: { command: 'npx', args: ['{sigil:var:X}'] } });
    const errors = errorsFor(artifact);
    assert.equal(errors.length, 1);
    assert.equal(errors[0]!.artifactId, 'shared/ado');
    assert.match(errors[0]!.error, /X/);
    assert.match(errors[0]!.error, /shared\/ado/);
  });

  it('errors on a declaration with no token in server', () => {
    const errors = errorsFor(makeMcp({ vars: VAR_X }));
    assert.equal(errors.length, 1);
    assert.match(errors[0]!.error, /'X'/);
  });

  it('reports one error for the unused declaration when another is used', () => {
    const artifact = makeMcp({
      vars: { ...VAR_X, Y: { title: 'Other', description: 'Unused' } },
      server: { command: 'npx', args: ['{sigil:var:X}'] },
    });
    const errors = errorsFor(artifact);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!.error, /'Y'/);
    assert.doesNotMatch(errors[0]!.error, /'X'/);
  });

  it('rejects a declaration without title', () => {
    const frontmatter = makeMcp({
      vars: { X: { description: 'No title' } },
    }).frontmatter;
    assert.equal(McpSchema.safeParse(frontmatter).success, false);
  });

  it('rejects a declaration with an unknown key', () => {
    const frontmatter = makeMcp({
      vars: { X: { title: 'T', description: 'D', extra: 'nope' } },
    }).frontmatter;
    assert.equal(McpSchema.safeParse(frontmatter).success, false);
  });

  it('rejects a vars key that is not an env-name shape', () => {
    const frontmatter = makeMcp({
      vars: { '1X': { title: 'T', description: 'D' } },
    }).frontmatter;
    assert.equal(McpSchema.safeParse(frontmatter).success, false);
  });

  it('does not run on a non-mcp artifact', () => {
    const skill = makeSkill();
    const artifact = { ...skill, frontmatter: { ...skill.frontmatter, server: { command: 'x' } } };
    assert.deepEqual(errorsFor(artifact), []);
  });
});
