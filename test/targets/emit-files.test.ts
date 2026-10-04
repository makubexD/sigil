/**
 * src/targets/emit-files.ts is the one writer for whole-file kinds: every path comes from a spec's
 * `outputPath`. These tests pin that contract for every registered target, and fail when a target
 * builds a whole-file path by hand again.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { emitFile, scaffoldArtifact, specFor } from '../../dist-cli/targets/emit-files';
import { getAllTargets } from '../../dist-cli/targets/index';
import { loadResolvedCatalog } from '../helpers/catalog';

const TARGETS_SRC = path.resolve(__dirname, '../../src/targets');
const WRITER = path.join(TARGETS_SRC, 'emit-files.ts');
// A FileMap key built by hand for a whole-file kind's folder.
const HAND_BUILT_PATH = /files\[`[^`]*\/(skills|agents|rules|instructions|prompts)\//;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('emit-files', () => {
  it('should leave no hand-built whole-file path anywhere under src/targets', () => {
    const offenders = sourceFiles(TARGETS_SRC)
      .filter(file => file !== WRITER)
      .filter(file => HAND_BUILT_PATH.test(fs.readFileSync(file, 'utf8')));
    assert.deepEqual(offenders, []);
  });

  it('should pick the channel-specific spec, falling back to a channel-less one', () => {
    const claude = getAllTargets().find(t => t.name === 'claude')!;
    assert.equal(specFor(claude.emitSpecs!, 'skill', 'plugin')?.variant, 'plugin');
    assert.equal(specFor(claude.emitSpecs!, 'skill', 'scaffold')?.variant, 'scaffold');
    assert.equal(specFor(claude.emitSpecs!, 'agent', 'plugin')?.variant, undefined);
    assert.equal(specFor(claude.emitSpecs!, 'mcp', 'scaffold'), undefined);
  });

  it("should write a skill at its spec's path with its references beside it", async () => {
    const catalog = await loadResolvedCatalog();
    const skill = catalog.artifacts.find(
      a => a.kind === 'skill' && (a.references ?? []).length > 0,
    )!;
    for (const target of getAllTargets().filter(t => t.emitSpecs)) {
      const spec = specFor(target.emitSpecs!, 'skill', 'scaffold')!;
      const files: Record<string, string> = {};
      emitFile(spec, skill, { catalog }, files);
      const skillPath = spec.outputPath(skill, {});
      const dir = path.posix.dirname(skillPath);
      const expected = [skillPath, ...skill.references!.map(r => `${dir}/references/${r.name}`)];
      assert.deepEqual(Object.keys(files).sort(), expected.sort(), target.name);
    }
  });

  it('should scaffold every file of every target at a path its own specs declare', async () => {
    const catalog = await loadResolvedCatalog();
    for (const target of getAllTargets().filter(t => t.emitSpecs)) {
      for (const artifact of catalog.artifacts.filter(a =>
        specFor(target.emitSpecs!, a.kind, 'scaffold'),
      )) {
        const files = scaffoldArtifact({
          specs: target.emitSpecs!,
          artifact,
          catalog,
          options: { projectDir: '.' },
        });
        for (const file of Object.keys(files).filter(f => !f.includes('/references/'))) {
          assert.ok(
            target.emitSpecs!.some(s => s.pathPattern.test(file)),
            `${target.name}: ${file} matches no spec's pathPattern`,
          );
        }
      }
    }
  });
});
