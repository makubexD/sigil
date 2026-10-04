/**
 * Limits from the open Agent Skills specification (agentskills.io), which every provider that
 * reads SKILL.md follows: a skill's `name` is at most 64 characters and its `description` at most
 * 1024. Declared once here and reused by each provider's skill spec (KindEmitSpec.limits), the
 * first piece of the open-standard base the catalog layout standard describes.
 *
 * @module
 */
import type { SpecLimit } from './spec-types';
import { AGENT_SKILLS_SPEC_DOC } from './doc-refs';

const MAX_SKILL_NAME_CHARS = 64;
const MAX_SKILL_DESCRIPTION_CHARS = 1024;

export const AGENT_SKILLS_LIMITS: readonly SpecLimit[] = [
  {
    field: 'name',
    max: MAX_SKILL_NAME_CHARS,
    unit: 'chars',
    severity: 'error',
    doc: AGENT_SKILLS_SPEC_DOC,
  },
  {
    field: 'description',
    max: MAX_SKILL_DESCRIPTION_CHARS,
    unit: 'chars',
    severity: 'error',
    doc: AGENT_SKILLS_SPEC_DOC,
  },
];
