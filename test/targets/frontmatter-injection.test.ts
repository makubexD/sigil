/**
 * No authored value can add, end or change a frontmatter key in emitted output — checked once for
 * every provider's spec of every whole-file kind rather than field by field. Each free-text field
 * gets a value carrying a quote, a backslash, a newline and a would-be key; the rendered frontmatter
 * must parse as YAML and hold only keys that spec emits.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { allProviderSpecs } from '../../dist-cli/targets/all-emit-specs';
import { renderArtifact } from '../../dist-cli/targets/emit';
import { PromptSchema } from '../../dist-cli/schema';
import type { ResolvedArtifact } from '../../dist-cli/types';

const HOSTILE = 'x\\"\ninjected: 1\n# "y';
const WHOLE_FILE_KINDS = new Set(['skill', 'agent', 'rule', 'prompt', 'workflow']);

/** One artifact of `kind` whose every free-text field holds HOSTILE. */
function hostileArtifact(kind: string): ResolvedArtifact {
  const frontmatter: Record<string, unknown> = {
    id: 'shared/probe',
    kind,
    name: 'probe',
    title: HOSTILE,
    description: HOSTILE,
    whenToUse: HOSTILE,
    argumentHint: HOSTILE,
    appliesTo: [HOSTILE, '**/*.ts'],
    args: [{ name: 'diff', description: HOSTILE }],
    tools: ['Read'],
    allowedTools: ['Read'],
    steps: [{ ref: 'shared/other', description: HOSTILE }],
  };
  return { id: 'shared/probe', kind, filePath: '/c/x.md', frontmatter, body: 'body' } as never;
}

function frontmatterKeys(rendered: string): string[] {
  const block = /^---\n([\s\S]*?)\n---/.exec(rendered)?.[1];
  return block === undefined ? [] : Object.keys(yaml.load(block) as object);
}

describe('frontmatter injection — every provider spec', () => {
  for (const { source, spec } of allProviderSpecs().filter(s =>
    WHOLE_FILE_KINDS.has(s.spec.kind),
  )) {
    it(`should keep ${source} frontmatter to its own keys`, () => {
      const rendered = renderArtifact(spec, hostileArtifact(spec.kind), { packName: 'pack' });
      const allowed = new Set(spec.frontmatter.map(m => m.to));
      const extra = frontmatterKeys(rendered).filter(key => !allowed.has(key));
      assert.deepEqual(extra, [], `${source} emitted keys it does not declare`);
    });
  }
});

describe('frontmatter injection — prompt argument names', () => {
  it('should accept placeholder-style names only', () => {
    const prompt = (name: string) => ({
      id: 'shared/p',
      kind: 'prompt',
      title: 't',
      description: 'd',
      args: [{ name }],
    });
    assert.ok(PromptSchema.safeParse(prompt('diff_base-2')).success);
    assert.equal(PromptSchema.safeParse(prompt('a\nallowed-tools: Bash')).success, false);
  });
});
