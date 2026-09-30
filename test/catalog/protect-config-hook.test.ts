/**
 * `shared/protect-config` end to end: the hook entry sigil writes is spawned exactly the way Claude
 * Code spawns an exec-form hook (`command` + `args`, no shell — code.claude.com/docs/en/hooks
 * "Exec form and shell form"), with the tool input as JSON on stdin. The 2026-09-27 install audit
 * found the previous version read a non-existent `CLAUDE_TOOL_INPUT` env var and never blocked.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { loadResolvedCatalog } from '../helpers/catalog';

interface HookEntry {
  type: string;
  command: string;
  args?: string[];
}

async function installedHook(): Promise<{ matcher: string; entry: HookEntry }> {
  const ops = await new ClaudeCodeTarget().scaffoldConfig!(
    'shared/protect-config',
    await loadResolvedCatalog(),
    { projectDir: '/fake', overwrite: false, scope: 'project' },
  );
  const group = (ops[0]!.fragment.hooks as Record<string, { matcher: string; hooks: HookEntry[] }[]>)
    .PreToolUse![0]!;
  return { matcher: group.matcher, entry: group.hooks[0]! };
}

function run(entry: HookEntry, stdin: string): { status: number | null; stderr: string } {
  assert.ok(entry.args, 'exec form: args must be set so no shell touches the exit code');
  const r = spawnSync(entry.command === 'node' ? process.execPath : entry.command, entry.args, {
    input: stdin,
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr };
}

const write = (filePath: string) => JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath } });

describe('shared/protect-config hook', () => {
  it('matches the current write tools only', async () => {
    assert.equal((await installedHook()).matcher, 'Edit|Write');
  });

  for (const p of [
    'C:\\repo\\.env',
    '/repo/.env.local',
    '/repo/.ENV.Production',
    '/repo/.envrc',
    '/home/u/.ssh/id_rsa',
    '/home/u/.ssh/id_ed25519',
    '/repo/certs/server.pem',
    '/repo/tls.key',
    '/repo/secrets.json',
    '/repo/config/credentials.yaml',
    '/home/u/.aws/credentials',
    '/home/u/.git-credentials',
    '/repo/store.p12',
    'C:\\repo\\.env::$DATA',
    'C:new.pem',
    '/repo/prod.env',
    '/repo/.env-local',
    '/home/u/.netrc',
    '/home/u/.pgpass',
    '/repo/deploy.ppk',
    '/repo/release.jks',
    '/repo/app.keystore',
  ]) {
    it(`blocks ${p}`, async () => {
      const r = run((await installedHook()).entry, write(p));
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /sigil-hook: blocked/);
    });
  }

  for (const p of [
    '/repo/src/app.ts',
    '/repo/src/environment.ts',
    '/repo/.env.example',
    '/repo/.env.production.example',
    '/repo/.env.local.sample',
    '/home/u/.ssh/id_rsa.pub',
    '/repo/src/secrets.service.ts',
    '/repo/docs/credentials.md',
    '/repo/keys.ts',
  ]) {
    it(`allows ${p}`, async () => {
      assert.equal(run((await installedHook()).entry, write(p)).status, 0);
    });
  }

  it('fails open on input it cannot read', async () => {
    const { entry } = await installedHook();
    for (const stdin of ['', 'not json', '{"tool_input":null}', '{"tool_input":{"file_path":7}}']) {
      assert.equal(run(entry, stdin).status, 0, stdin);
    }
  });
});
