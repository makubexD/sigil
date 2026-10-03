/**
 * The request `sync --apply --editorial` sends and how it reads the reply. No network: the request is
 * inspected as built, and replies are fake `Response` objects.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnthropicRequest,
  parseAnthropicResponse,
  responseSchema,
} from '../../dist-cli/commands/sync/conformance/editorial-model-client';
import type { EditorialTask } from '../../dist-cli/commands/sync/conformance/types';

function task(ownedFields: string[]): EditorialTask {
  return {
    artifactId: 'shared/probe',
    filePath: 'catalog/shared/probe.md',
    kind: 'skill',
    instruction: 'probe',
    ownedFields,
  };
}

function reply(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

describe('editorial model client — response schema', () => {
  it('should allow body only when the task owns it', () => {
    const owned = responseSchema(task(['body'])) as { properties: Record<string, unknown> };
    const notOwned = responseSchema(task(['whenToUse'])) as { properties: Record<string, unknown> };
    assert.deepEqual(owned.properties.body, { type: 'string' });
    assert.equal(notOwned.properties.body, undefined);
  });

  it('should list exactly the owned frontmatter fields, closed to any other key', () => {
    const schema = responseSchema(task(['description', 'whenToUse'])) as {
      properties: { frontmatterPatch: { properties: object; additionalProperties: boolean } };
    };
    const patch = schema.properties.frontmatterPatch;
    assert.deepEqual(Object.keys(patch.properties), ['description', 'whenToUse']);
    assert.equal(patch.additionalProperties, false);
  });

  it('should describe relatedArtifacts as an array of id/relation/reason', () => {
    const schema = responseSchema(task(['relatedArtifacts'])) as {
      properties: { frontmatterPatch: { properties: Record<string, any> } };
    };
    const field = schema.properties.frontmatterPatch.properties.relatedArtifacts;
    assert.equal(field.type, 'array');
    assert.deepEqual(field.items.required, ['id', 'relation', 'reason']);
    assert.deepEqual(field.items.properties.relation.enum, [
      'escalates-to',
      'complements',
      'see-also',
    ]);
  });
});

describe('editorial model client — request', () => {
  it('should send the schema as structured output with room for thinking', () => {
    const schema = responseSchema(task(['body']));
    const body = JSON.parse(String(buildAnthropicRequest('prompt', schema, 'key').body));
    assert.deepEqual(body.output_config, { format: { type: 'json_schema', schema } });
    assert.equal(body.max_tokens, 16_000);
  });
});

describe('editorial model client — reply', () => {
  it('should return the proposal from a finished reply', async () => {
    const text = JSON.stringify({ body: 'new' });
    const res = reply({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });
    assert.deepEqual(await parseAnthropicResponse(task(['body']), res), { body: 'new' });
  });

  for (const stopReason of ['max_tokens', 'refusal']) {
    it(`should name the stop reason when the reply ends with ${stopReason}`, async () => {
      const res = reply({ stop_reason: stopReason, content: [{ type: 'text', text: '{"bo' }] });
      await assert.rejects(parseAnthropicResponse(task(['body']), res), new RegExp(stopReason));
    });
  }
});
