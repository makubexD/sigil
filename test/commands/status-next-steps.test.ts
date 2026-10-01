/**
 * `sigil status` ends with the command that fixes what it found. A deleted whole-file artifact is
 * NOT restored by `sigil update` (it reports "already up-to-date"); `sigil add` restores it. The
 * hint used to say "Run `sigil update`" for every problem, which sent users to a no-op.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { statusNextSteps } from '../../dist-cli/commands/status';
import type { ArtifactStatus, StatusResult } from '../../dist-cli/manifest/types';

function result(id: string, kind: string, status: ArtifactStatus): StatusResult {
  return {
    entry: { id, kind, target: 'claude', dependentOf: [] } as unknown as StatusResult['entry'],
    status,
    driftedFiles: [],
    missingFiles: [],
  };
}

describe('statusNextSteps', () => {
  it('should say nothing when everything is up to date', () => {
    assert.deepEqual(statusNextSteps([result('shared/git', 'rule', 'up-to-date')]), []);
  });

  it('should restore a missing whole-file artifact with `sigil add`, not `sigil update`', () => {
    const steps = statusNextSteps([result('shared/git', 'rule', 'missing')]).join('\n');
    assert.match(steps, /sigil add rule:shared\/git --target claude --yes/);
    assert.doesNotMatch(steps, /sigil update/);
  });

  it('should restore a missing config fragment with `sigil update <id>`', () => {
    const steps = statusNextSteps([result('shared/ado', 'mcp', 'missing')]).join('\n');
    assert.match(steps, /sigil update shared\/ado/);
    assert.doesNotMatch(steps, /sigil add/);
  });

  it('should refresh outdated artifacts with `sigil update`', () => {
    const steps = statusNextSteps([result('shared/git', 'rule', 'outdated')]).join('\n');
    assert.match(steps, /sigil update\b/);
  });

  it('should say that drifted files keep the user edits unless --force is given', () => {
    const steps = statusNextSteps([result('shared/git', 'rule', 'drifted')]).join('\n');
    assert.match(steps, /sigil update --force/);
    assert.match(steps, /edit/i);
  });

  it('should send orphaned entries to `sigil prune`', () => {
    const steps = statusNextSteps([result('old/thing', 'skill', 'orphaned')]).join('\n');
    assert.match(steps, /sigil prune/);
  });
});
