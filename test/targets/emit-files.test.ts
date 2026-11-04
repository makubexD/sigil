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
import { renderArtifact } from '../../dist-cli/targets/emit';
import { getAllTargets } from '../../dist-cli/targets/index';
import { wholeFileSkipReason } from '../../dist-cli/targets/tool-restriction';
import { COPILOT_LEXICON } from '../../dist-cli/targets/copilot/lexicon';
import type { KindEmitSpec } from '../../dist-cli/targets/spec-types';
import type { ResolvedArtifact } from '../../dist-cli/types';
import { loadResolvedCatalog } from '../helpers/catalog';

const TARGETS_SRC = path.resolve(__dirname, '../../src/targets');
const WRITER = path.join(TARGETS_SRC, 'emit-files.ts');
// A FileMap key built by hand for a whole-file kind's folder.
const HAND_BUILT_PATH = /files\[[`'"][^`'"]*\/(skills|agents|rules|instructions|prompts)\//;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** The smallest KindEmitSpec renderArtifact accepts: one skill, no frontmatter, no sections. */
function minimalSpec(
  bodyTransform?: (body: string, artifact: ResolvedArtifact) => string,
): KindEmitSpec {
  return {
    kind: 'skill',
    outputPath: () => 'SKILL.md',
    pathPattern: /^SKILL\.md$/,
    ...(bodyTransform ? { bodyTransform } : {}),
    frontmatter: [],
    emitEmptyFrontmatter: false,
    body: [],
    lexicon: COPILOT_LEXICON,
    forbiddenKeys: [],
    bodyForbids: [],
    docs: [],
  };
}

/** The smallest ResolvedArtifact to feed renderArtifact; callers override body/resolvedBody. */
function minimalArtifact(overrides: Partial<ResolvedArtifact> = {}): ResolvedArtifact {
  return {
    id: 'test/body-transform',
    kind: 'skill',
    filePath: '/tmp/skill.md',
    frontmatter: {},
    body: 'original body',
    ...overrides,
  };
}

describe('renderArtifact bodyTransform', () => {
  it('should pass the artifact to the transform as its second argument', () => {
    const artifact = minimalArtifact();
    const spec = minimalSpec((body, a) => `${body}\n${a.id}`);
    const out = renderArtifact(spec, artifact, {});
    assert.ok(out.includes(artifact.id));
  });

  it('should leave the body unchanged when the spec has no bodyTransform', () => {
    const artifact = minimalArtifact();
    const out = renderArtifact(minimalSpec(), artifact, {});
    assert.ok(out.includes(artifact.body));
  });

  it('should receive resolvedBody, not body, when both are set', () => {
    const artifact = minimalArtifact({ body: 'original body', resolvedBody: 'resolved body' });
    let received: string | undefined;
    const spec = minimalSpec(body => {
      received = body;
      return body;
    });
    renderArtifact(spec, artifact, {});
    assert.equal(received, 'resolved body');
  });
});

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
    assert.equal(specFor(claude.emitSpecs!, 'workflow', 'plugin')?.variant, undefined);
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

  it("should place every plugin-channel file at a path its own spec's pattern matches", async () => {
    const catalog = await loadResolvedCatalog();
    for (const target of getAllTargets().filter(t => t.emitSpecs)) {
      for (const artifact of catalog.artifacts) {
        const spec = specFor(target.emitSpecs!, artifact.kind, 'plugin');
        if (!spec) continue;
        const file = spec.outputPath(artifact, { packName: 'pack' });
        assert.ok(spec.pathPattern.test(file), `${target.name}: ${file} vs ${spec.pathPattern}`);
      }
    }
  });

  it('should scaffold every file of every target at a path its own specs declare', async () => {
    const catalog = await loadResolvedCatalog();
    for (const target of getAllTargets().filter(t => t.emitSpecs)) {
      // An artifact the target skips (add reports it, build leaves it out) is never scaffolded.
      for (const artifact of catalog.artifacts.filter(
        a =>
          specFor(target.emitSpecs!, a.kind, 'scaffold') &&
          wholeFileSkipReason(target, a) === undefined,
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
