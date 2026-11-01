/**
 * Tests for the TOML config-file format (src/config-merge/toml-file.ts), the writer that lets
 * sigil merge MCP servers into Codex's `config.toml` without dropping the user's comments and
 * hand-kept ordering. It parses with smol-toml and splices text: it owns whole
 * `[mcp_servers.<key>]` tables and leaves every other line byte-for-byte.
 *
 * Every case in docs/plan-codex-target-e.md step 1's table is here, in order.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderToml } from '../../dist-cli/config-merge/toml-file';
import {
  parseConfig,
  renderConfig,
  isEmptiedConfig,
} from '../../dist-cli/config-merge/file-format';

const TOML = 'config.toml';

describe('config-merge TOML file format', () => {
  it('adds a server to a file with comments and model, keeping every original line', () => {
    const before = ['# keep this comment', 'model = "gpt-5"', ''].join('\n');
    const merged = { model: 'gpt-5', mcp_servers: { a: { command: 'node', args: ['serve'] } } };

    const out = renderToml(before, merged);

    assert.ok(out.startsWith('# keep this comment\nmodel = "gpt-5"\n'), 'original lines kept');
    assert.equal(
      out,
      [
        '# keep this comment',
        'model = "gpt-5"',
        '',
        '[mcp_servers.a]',
        'command = "node"',
        'args = [ "serve" ]',
        '',
      ].join('\n'),
    );
  });

  it('adds a server to a missing file, emitting only the table', () => {
    assert.equal(
      renderToml('', { mcp_servers: { a: { command: 'node' } } }),
      '[mcp_servers.a]\ncommand = "node"\n',
    );
  });

  it('replaces a server with an env sub-table, leaving others untouched', () => {
    const before = [
      '[mcp_servers.a]',
      'command = "old"',
      '',
      '[mcp_servers.a.env]',
      'FOO = "bar"',
      '',
      '[mcp_servers.b]',
      'command = "keep"',
      '',
    ].join('\n');
    const merged = { mcp_servers: { a: { command: 'new' }, b: { command: 'keep' } } };

    assert.equal(
      renderToml(before, merged),
      ['[mcp_servers.b]', 'command = "keep"', '', '[mcp_servers.a]', 'command = "new"', ''].join(
        '\n',
      ),
    );
  });

  it('removes one of two servers, keeping the other server and its comment', () => {
    const before = [
      '[mcp_servers.a]',
      'command = "a"',
      '# keep: comment for b',
      '[mcp_servers.b]',
      'command = "b"',
      '',
    ].join('\n');

    assert.equal(
      renderToml(before, { mcp_servers: { b: { command: 'b' } } }),
      ['# keep: comment for b', '[mcp_servers.b]', 'command = "b"', ''].join('\n'),
    );
  });

  it('removes the only server from a sigil-only file, leaving it blank', () => {
    const before = ['[mcp_servers.a]', 'command = "x"', ''].join('\n');
    const out = renderToml(before, {});

    assert.equal(out, '');
    assert.equal(isEmptiedConfig(TOML, {}, out), true);
  });

  it('removes the only server but keeps a user comment', () => {
    const before = ['# user comment', '[mcp_servers.a]', 'command = "x"', ''].join('\n');
    const out = renderToml(before, {});

    assert.equal(out, '# user comment\n');
    assert.equal(isEmptiedConfig(TOML, {}, out), false);
  });

  it('finds and replaces a quoted [mcp_servers."a"] header', () => {
    const before = ['[mcp_servers."a"]', 'command = "old"', ''].join('\n');

    assert.equal(
      renderToml(before, { mcp_servers: { a: { command: 'new' } } }),
      '[mcp_servers.a]\ncommand = "new"\n',
    );
  });

  it('throws when the server was written as an inline table', () => {
    const before = 'mcp_servers = { a = { command = "x" } }\n';
    assert.throws(
      () => renderToml(before, { mcp_servers: { a: { command: 'y' } } }),
      /couldn't be edited safely/,
    );
  });

  it('throws when merged changes a key outside mcp_servers', () => {
    assert.throws(
      () => renderToml('model = "gpt-5"\n', { model: 'gpt-6' }),
      /couldn't be edited safely/,
    );
  });

  it('parseConfig throws on invalid TOML', () => {
    assert.throws(() => parseConfig(TOML, 'a = = 1'));
  });

  it('parseConfig parses TOML by path', () => {
    // smol-toml's tables have a null prototype, so compare their JSON form.
    const parsed = parseConfig(TOML, '[mcp_servers.a]\ncommand = "x"\n');
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)), {
      mcp_servers: { a: { command: 'x' } },
    });
  });

  it('renderConfig dispatches a .toml path to the TOML writer', () => {
    const before = ['[mcp_servers.a]', 'command = "old"', ''].join('\n');
    const merged = { mcp_servers: { a: { command: 'new' } } };
    assert.equal(renderConfig(TOML, merged, before), renderToml(before, merged));
    assert.equal(renderConfig('a.json', merged), JSON.stringify(merged, null, 2) + '\n');
  });

  it('drops a bare [mcp_servers] header left with nothing under it', () => {
    const before = ['[mcp_servers]', '', '[mcp_servers.a]', 'command = "x"', ''].join('\n');
    assert.equal(renderToml(before, {}), '');
  });
});
