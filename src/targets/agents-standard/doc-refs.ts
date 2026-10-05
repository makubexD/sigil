/**
 * Citations specific to the open-standard target. The shared ones (Agent Skills spec, AGENTS.md
 * standard, GitHub Copilot's skills page, which names `.agents/skills`) live in ../doc-refs.ts.
 *
 * @module
 */
import type { DocRef } from '../spec-types';

/** Cursor reads project skills from `.agents/skills/` as well as its own folder. */
export const CURSOR_SKILLS_DOC: DocRef = {
  url: 'https://cursor.com/docs/context/skills',
  title: 'Cursor — Agent Skills',
  verifiedOn: '2026-10-03',
  covers:
    'Cursor loads project skills from .agents/skills/ (and .cursor/skills/), each a folder with ' +
    'a SKILL.md and optional references/ — the layout the open-standard target writes.',
};
