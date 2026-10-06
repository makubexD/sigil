/**
 * `provider-limits` renders each artifact through every spec it ships with and measures the emitted
 * file against the limits that spec declares (KindEmitSpec.limits): a skill's name (64 characters)
 * and description (1024) per the Agent Skills spec, a SKILL.md body over 500 lines (Claude's
 * guidance, a warning), and a Copilot agent body over 30,000 characters.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../../dist-cli/load';
import { runConformance } from '../../dist-cli/commands/sync/conformance/detect';
import { getAllTargets } from '../../dist-cli/targets/index';
import { allProviderSpecs } from '../../dist-cli/targets/all-emit-specs';
import { loadBundledCatalog } from '../helpers/catalog';
import { withTempDirAsync } from '../helpers/temp-dir';

const RULE = 'provider-limits';

const skill = (name: string, description: string, body = 'Body.') =>
  `---\nid: shared/${name}\nkind: skill\nname: ${name}\ntitle: P\ndescription: "${description}"\n---\n\n${body}\n`;
const agent = (body: string) =>
  `---\nid: shared/probe\nkind: agent\nname: probe\ntitle: P\ndescription: A probe agent.\ntools: [Read]\n---\n\n${body}\n`;

/** provider-limits findings as "severity provider detail", for one artifact file. */
async function findings(rel: string, content: string): Promise<string[]> {
  let out: string[] = [];
  await withTempDirAsync(async root => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    const catalog = await loadCatalog(root);
    out = runConformance(catalog, getAllTargets(), { ruleId: RULE }).map(
      f => `${f.severity} ${f.provider} ${f.detail}`,
    );
  });
  return out;
}

const skillAt = (name: string, description: string, body?: string) =>
  findings(`shared/skills/${name}/SKILL.md`, skill(name, description, body));
const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n');

/** "severity provider" for every provider whose `kind` spec declares a limit on `field`. */
function declaring(kind: string, field: string): string[] {
  const found = new Set<string>();
  for (const { provider, spec } of allProviderSpecs()) {
    const limit = spec.kind === kind ? spec.limits?.find(l => l.field === field) : undefined;
    if (limit) found.add(`${limit.severity} ${provider}`);
  }
  return [...found].sort();
}

/**
 * The derived list, checked against a floor of providers known to declare it, so removing a limit
 * from every spec can't make a test pass vacuously.
 */
function declaringAtLeast(kind: string, field: string, floor: string[]): string[] {
  const found = declaring(kind, field);
  for (const required of floor)
    assert.ok(found.includes(required), `${kind}.${field}: ${required}`);
  return found;
}
const head = (finding: string) => finding.split(' ').slice(0, 2).join(' ');

describe('provider-limits', () => {
  it('should find no error in the bundled catalog', async () => {
    const catalog = await loadBundledCatalog();
    const errors = runConformance(catalog, getAllTargets(), { ruleId: RULE }).filter(
      f => f.severity === 'error',
    );
    assert.deepEqual(errors, []);
  });

  it('should accept a skill name of 64 characters and flag 65 on every provider', async () => {
    assert.deepEqual(await skillAt('a'.repeat(64), 'Probe. Use when probing.'), []);
    const over = await skillAt('a'.repeat(65), 'Probe. Use when probing.');
    assert.deepEqual(
      over.map(head).sort(),
      declaringAtLeast('skill', 'name', ['error claude', 'error copilot']),
    );
    assert.ok(over.every(f => /name/.test(f)));
  });

  it('should accept a description of 1024 characters and flag 1025', async () => {
    assert.deepEqual(await skillAt('probe', 'd'.repeat(1024)), []);
    const over = await skillAt('probe', 'd'.repeat(1025));
    assert.deepEqual(
      over.map(head).sort(),
      declaringAtLeast('skill', 'description', ['error claude', 'error copilot']),
    );
    assert.ok(over.every(f => /^error .* description/.test(f)));
  });

  it('should warn when a SKILL.md body runs past 500 lines', async () => {
    assert.deepEqual(await skillAt('probe', 'Probe. Use when probing.', lines(400)), []);
    const over = await skillAt('probe', 'Probe. Use when probing.', lines(600));
    assert.deepEqual(over.map(head).sort(), declaringAtLeast('skill', 'body', ['warning claude']));
    assert.ok(
      over.every(f => /^warning .*body/.test(f)),
      over.join('\n'),
    );
  });

  it("should flag a Copilot agent body over Copilot's 30,000 characters", async () => {
    assert.deepEqual(await findings('shared/agents/probe.agent.md', agent('x'.repeat(29_000))), []);
    const over = await findings('shared/agents/probe.agent.md', agent('x'.repeat(31_000)));
    assert.deepEqual(over.map(head).sort(), declaringAtLeast('agent', 'body', ['error copilot']));
  });
});
