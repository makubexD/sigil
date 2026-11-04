/**
 * Tests for src/mcp-vars.ts — the install-time variable token and its value rule.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  VAR_VALUE_RULE,
  declaredVarNames,
  isVarValue,
  missingVars,
  parseVarFlags,
  substituteVars,
  usableVars,
  varTokenNames,
} from '../dist-cli/mcp-vars';
import { SigilError } from '../dist-cli/errors';
import type { Artifact } from '../dist-cli/types';

function artifactWithVars(vars: Record<string, unknown>): Pick<Artifact, 'frontmatter'> {
  return { frontmatter: { vars } };
}

describe('isVarValue', () => {
  it('accepts an org name and other well-formed values', () => {
    for (const value of ['contoso', 'a.b_c-d', '0org', 'a'.repeat(128)]) {
      assert.equal(isVarValue(value), true, value);
    }
  });

  it('rejects unsafe or over-long values', () => {
    for (const value of ['', '-x', '--help', 'a b', 'a/b', '${X}', '{x}', 'a"b', 'a'.repeat(129)]) {
      assert.equal(isVarValue(value), false, value);
    }
  });
});

describe('varTokenNames', () => {
  it('returns each name once in first-seen order at any depth', () => {
    const value = {
      args: ['{sigil:var:A}', ['{sigil:var:B}', '{sigil:var:A}']],
      env: { X: 'x{sigil:var:C}' },
    };
    assert.deepEqual(varTokenNames(value), ['A', 'B', 'C']);
  });
});

describe('substituteVars', () => {
  it('replaces tokens and keeps the array and object shape', () => {
    const lookup = (name: string): string => (name === 'A' ? 'contoso' : 'fabrikam');
    assert.deepEqual(substituteVars(['-y', 'x{sigil:var:A}y', { k: '{sigil:var:B}' }], lookup), [
      '-y',
      'xcontosoy',
      { k: 'fabrikam' },
    ]);
  });

  it('leaves an env token unchanged', () => {
    assert.equal(
      substituteVars('{sigil:env:A}', () => 'contoso'),
      '{sigil:env:A}',
    );
  });

  it('refuses a malformed variable name, naming the token', () => {
    assert.throws(
      () => substituteVars('{sigil:var:1BAD}', () => 'contoso'),
      (err: unknown) => err instanceof SigilError && err.message.includes('{sigil:var:1BAD}'),
    );
  });
});

describe('missingVars', () => {
  it('names the declared variable with no value', () => {
    assert.deepEqual(missingVars(artifactWithVars({ A: 'one', B: 'two' }), { A: 'contoso' }), [
      'B',
    ]);
  });

  it('returns [] when the artifact declares no vars', () => {
    assert.deepEqual(missingVars({ frontmatter: {} }, {}), []);
  });
});

describe('usableVars', () => {
  it('drops a recorded value that fails the rule', () => {
    assert.deepEqual(usableVars({ A: 'ok', B: '-x' }), { A: 'ok' });
  });

  it('returns {} for undefined', () => {
    assert.deepEqual(usableVars(undefined), {});
  });
});

describe('parseVarFlags', () => {
  it('parses repeated NAME=value flags', () => {
    assert.deepEqual(parseVarFlags(['A=x', 'B=y']), { A: 'x', B: 'y' });
  });

  it('refuses a malformed flag, showing the --var NAME=value form', () => {
    for (const raw of [['A'], ['=x'], ['1A=x']]) {
      assert.throws(
        () => parseVarFlags(raw),
        (err: unknown) => err instanceof SigilError && err.message.includes('--var NAME=value'),
      );
    }
  });

  it('refuses a value that fails the rule', () => {
    assert.throws(
      () => parseVarFlags(['A=-x']),
      (err: unknown) => err instanceof SigilError && err.message.includes(VAR_VALUE_RULE),
    );
  });

  it('refuses a repeated name, naming it', () => {
    assert.throws(
      () => parseVarFlags(['A=x', 'A=y']),
      (err: unknown) => err instanceof SigilError && err.message.includes('A'),
    );
  });

  it('splits at the first = so a value with another = is refused by the rule', () => {
    assert.throws(
      () => parseVarFlags(['A=b=c']),
      (err: unknown) => err instanceof SigilError && err.message.includes(VAR_VALUE_RULE),
    );
  });

  it('does not let a __proto__ name change the prototype', () => {
    const parsed = parseVarFlags(['__proto__=contoso']);
    assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
    assert.equal(parsed['__proto__'], 'contoso');
  });
});

describe('declaredVarNames', () => {
  it('returns the frontmatter vars keys in declared order', () => {
    assert.deepEqual(declaredVarNames(artifactWithVars({ ORG: {}, NUM: {} })), ['ORG', 'NUM']);
  });
});
