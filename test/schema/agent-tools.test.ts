/**
 * The neutral tool vocabulary in the schema: a neutral name, a legacy provider alias or a
 * provider-specific permission pattern is accepted; an unknown bare name is rejected because no
 * target could map it. Model, effort and tool policy are the three neutral hints on an agent.
 * See docs/plan-cursor-target-n.md step 3.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentSchema, SkillSchema } from '../../dist-cli/schema';
import { makeAgent, makeSkill } from '../helpers/fixtures';

const agentValid = (fm: Record<string, unknown>): boolean =>
  AgentSchema.safeParse(makeAgent(fm).frontmatter).success;
const skillValid = (fm: Record<string, unknown>): boolean =>
  SkillSchema.safeParse(makeSkill(fm).frontmatter).success;

describe('agent and skill tool fields — neutral vocabulary', () => {
  it('should accept neutral agent tools', () => {
    assert.ok(agentValid({ tools: ['read', 'search'] }));
  });

  it('should accept legacy agent tool aliases', () => {
    assert.ok(agentValid({ tools: ['Read', 'Grep'] }));
  });

  it('should reject an unknown agent tool name', () => {
    assert.equal(agentValid({ tools: ['frobnicate'] }), false);
  });

  it('should reject an unknown agent disallowedTools name', () => {
    assert.equal(agentValid({ disallowedTools: ['frobnicate'] }), false);
  });

  it('should accept toolPolicy nearest', () => {
    assert.ok(agentValid({ toolPolicy: 'nearest' }));
  });

  it('should reject an unknown toolPolicy', () => {
    assert.equal(agentValid({ toolPolicy: 'loose' }), false);
  });

  it('should accept a neutral model tier', () => {
    assert.ok(agentValid({ model: 'balanced' }));
  });

  it('should reject a provider model name as the neutral model', () => {
    assert.equal(agentValid({ model: 'sonnet' }), false);
  });

  it('should accept a neutral effort level', () => {
    assert.ok(agentValid({ effort: 'high' }));
  });

  it('should accept neutral and legacy skill allowedTools together', () => {
    assert.ok(skillValid({ allowedTools: ['shell', 'Read'] }));
  });

  it('should reject an unknown skill allowedTools name', () => {
    assert.equal(skillValid({ allowedTools: ['frobnicate'] }), false);
  });

  it('should accept provider-specific tool patterns', () => {
    assert.ok(
      agentValid({ tools: ['Bash(git log:*)', 'mcp__github__get_issue', 'Read(./src/**)'] }),
    );
  });
});
