/**
 * recover-skills.mjs
 *
 * Recovers 20 corrupted (empty) skill SKILL.md files from their compiled
 * counterparts in dist/claude/plugins/. Applies the planned `uses` wiring
 * for each skill.
 *
 * Run: node scripts/recover-skills.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// Map: slugId → { srcPlugin, lang, langLabel, title, tags, rules, agents }
const SKILLS = [
  // ── CSHARP ──────────────────────────────────────────────────────────────
  {
    slug: 'cs-sync-tests',
    plugin: 'dotnet-tooling',
    lang: 'csharp',
    langLabel: '.NET / C#',
    tags: ['csharp', 'sync', 'tests'],
    rules: ['csharp/cs-testing'],
    agents: ['csharp/cs-code-reviewer'],
  },
  {
    slug: 'cs-document',
    plugin: 'dotnet-tooling',
    lang: 'csharp',
    langLabel: '.NET / C#',
    tags: ['csharp', 'document', 'documentation'],
    rules: ['csharp/cs-documentation'],
    agents: ['csharp/cs-code-reviewer'],
  },
  {
    slug: 'cs-scaffold-project',
    plugin: 'dotnet-tooling',
    lang: 'csharp',
    langLabel: '.NET / C#',
    tags: ['csharp', 'scaffold', 'project'],
    rules: ['csharp/cs-project-layout', 'csharp/cs-conventions'],
    agents: ['csharp/cs-architecture-reviewer'],
  },
  {
    slug: 'cs-audit-deps',
    plugin: 'dotnet-tooling',
    lang: 'csharp',
    langLabel: '.NET / C#',
    tags: ['csharp', 'audit', 'dependencies', 'security'],
    rules: ['csharp/cs-dependencies', 'csharp/cs-security'],
    agents: ['csharp/cs-security-auditor'],
  },
  {
    slug: 'cs-add-package',
    plugin: 'dotnet-tooling',
    lang: 'csharp',
    langLabel: '.NET / C#',
    tags: ['csharp', 'add', 'package', 'nuget'],
    rules: ['csharp/cs-dependencies', 'csharp/cs-nuget'],
    agents: [],
  },
  {
    slug: 'cs-release',
    plugin: 'dotnet-tooling',
    lang: 'csharp',
    langLabel: '.NET / C#',
    tags: ['csharp', 'release', 'publish'],
    rules: ['csharp/cs-conventions'],
    agents: [],
  },

  // ── TYPESCRIPT ───────────────────────────────────────────────────────────
  {
    slug: 'ts-generate-tests',
    plugin: 'typescript-tooling',
    lang: 'typescript',
    langLabel: 'TypeScript',
    tags: ['typescript', 'generate', 'tests'],
    rules: ['typescript/ts-testing'],
    agents: ['typescript/ts-code-reviewer'],
  },
  {
    slug: 'ts-sync-tests',
    plugin: 'typescript-tooling',
    lang: 'typescript',
    langLabel: 'TypeScript',
    tags: ['typescript', 'sync', 'tests'],
    rules: ['typescript/ts-testing'],
    agents: ['typescript/ts-code-reviewer'],
  },
  {
    slug: 'ts-document',
    plugin: 'typescript-tooling',
    lang: 'typescript',
    langLabel: 'TypeScript',
    tags: ['typescript', 'document', 'documentation'],
    rules: ['typescript/ts-documentation'],
    agents: ['typescript/ts-code-reviewer'],
  },
  {
    slug: 'ts-scaffold-project',
    plugin: 'typescript-tooling',
    lang: 'typescript',
    langLabel: 'TypeScript',
    tags: ['typescript', 'scaffold', 'project'],
    rules: ['typescript/ts-project-layout', 'typescript/ts-conventions'],
    agents: ['typescript/ts-architecture-reviewer'],
  },
  {
    slug: 'ts-audit-deps',
    plugin: 'typescript-tooling',
    lang: 'typescript',
    langLabel: 'TypeScript',
    tags: ['typescript', 'audit', 'dependencies', 'security'],
    rules: ['typescript/ts-dependencies', 'typescript/ts-security'],
    agents: ['typescript/ts-security-auditor'],
  },
  {
    slug: 'ts-add-package',
    plugin: 'typescript-tooling',
    lang: 'typescript',
    langLabel: 'TypeScript',
    tags: ['typescript', 'add', 'package', 'npm'],
    rules: ['typescript/ts-dependencies', 'typescript/ts-npm'],
    agents: [],
  },
  {
    slug: 'ts-release',
    plugin: 'typescript-tooling',
    lang: 'typescript',
    langLabel: 'TypeScript',
    tags: ['typescript', 'release', 'publish'],
    rules: ['typescript/ts-conventions'],
    agents: [],
  },

  // ── ANGULAR ───────────────────────────────────────────────────────────────
  {
    slug: 'ng-generate-tests',
    plugin: 'angular-tooling',
    lang: 'angular',
    langLabel: 'Angular',
    tags: ['angular', 'generate', 'tests'],
    rules: ['angular/ng-testing'],
    agents: ['angular/ng-code-reviewer'],
  },
  {
    slug: 'ng-sync-tests',
    plugin: 'angular-tooling',
    lang: 'angular',
    langLabel: 'Angular',
    tags: ['angular', 'sync', 'tests'],
    rules: ['angular/ng-testing'],
    agents: ['angular/ng-code-reviewer'],
  },
  {
    slug: 'ng-document',
    plugin: 'angular-tooling',
    lang: 'angular',
    langLabel: 'Angular',
    tags: ['angular', 'document', 'documentation'],
    rules: ['angular/ng-documentation'],
    agents: ['angular/ng-code-reviewer'],
  },
  {
    slug: 'ng-generate-component',
    plugin: 'angular-tooling',
    lang: 'angular',
    langLabel: 'Angular',
    tags: ['angular', 'generate', 'component'],
    rules: ['angular/ng-components', 'angular/ng-templates'],
    agents: ['angular/ng-architecture-reviewer'],
  },
  {
    slug: 'ng-audit-deps',
    plugin: 'angular-tooling',
    lang: 'angular',
    langLabel: 'Angular',
    tags: ['angular', 'audit', 'dependencies', 'security'],
    rules: ['angular/ng-dependencies', 'angular/ng-security'],
    agents: ['angular/ng-security-auditor'],
  },
  {
    slug: 'ng-add-package',
    plugin: 'angular-tooling',
    lang: 'angular',
    langLabel: 'Angular',
    tags: ['angular', 'add', 'package', 'npm'],
    rules: ['angular/ng-dependencies'],
    agents: [],
  },
  {
    slug: 'ng-release',
    plugin: 'angular-tooling',
    lang: 'angular',
    langLabel: 'Angular',
    tags: ['angular', 'release', 'publish'],
    rules: ['angular/ng-conventions'],
    agents: [],
  },
];

/** Strip `## Applied Rules` section and everything after it from the body. */
function stripAppliedRules(body) {
  const marker = /\n## Applied Rules\b/;
  const idx = body.search(marker);
  if (idx !== -1) return body.slice(0, idx).trimEnd();
  return body.trimEnd();
}

/** Extract title from compiled frontmatter or first # heading in body. */
function deriveTitle(compiledData, body, langLabel) {
  // compiled `name` is the slug; build a human-readable title
  // Look for the first `# Heading` line in body
  const m = body.match(/^#\s+(.+)$/m);
  if (m) return `${m[1].trim()} (${langLabel})`;
  // Fall back to slug-based title
  return `${compiledData.name ?? 'Unknown'} (${langLabel})`;
}

/** Escape a string for use inside YAML double-quoted scalars. */
function yamlEscape(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Render a YAML sequence field. Uses block style when non-empty, inline [] when empty. */
function yamlSeq(indent, items) {
  if (!items || items.length === 0) return `${indent}[]`;
  return items.map(i => `${indent}  - ${i}`).join('\n');
}

/**
 * Build catalog source SKILL.md from compiled file + wiring plan.
 */
function buildCatalogFile(skill, compiledData, body) {
  const id = `${skill.lang}/${skill.slug}`;
  const title = deriveTitle(compiledData, body, skill.langLabel);
  const desc = compiledData.description ?? '';

  // Translate compiled field names → catalog field names
  const appliesTo = compiledData.paths ?? ['**/*'];
  const appliesToYaml = appliesTo.map(p => `  - "${p}"`).join('\n');

  const allowedToolsRaw = compiledData['allowed-tools'];
  const allowedTools = allowedToolsRaw
    ? allowedToolsRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : [];
  const allowedToolsYaml = allowedTools.map(t => `  - ${t}`).join('\n');

  const argumentHint = compiledData['argument-hint'];
  const disableModelInvocation = compiledData['disable-model-invocation'];

  // rules / agents wiring — inline [] when empty, block when non-empty
  const rulesLine =
    skill.rules.length > 0 ? `\n${skill.rules.map(r => `    - ${r}`).join('\n')}` : ' []';
  const agentsLine =
    skill.agents.length > 0 ? `\n${skill.agents.map(a => `    - ${a}`).join('\n')}` : ' []';

  const tagsYaml = skill.tags.map(t => `  - ${t}`).join('\n');

  let fm = `---
id: ${id}
kind: skill
title: "${yamlEscape(title)}"
description: "${yamlEscape(desc)}"
name: ${skill.slug}
language: ${skill.lang}
appliesTo:
${appliesToYaml}
allowedTools:
${allowedToolsYaml}`;

  if (argumentHint) {
    fm += `\nargumentHint: "${yamlEscape(argumentHint.trim())}"`;
  }
  if (disableModelInvocation) {
    fm += `\ndisableModelInvocation: true`;
  }

  fm += `
uses:
  rules:${rulesLine}
  agents:${agentsLine}
tags:
${tagsYaml}
---`;

  return `${fm}\n${body}\n`;
}

let recovered = 0;
let skipped = 0;
const errors = [];

for (const skill of SKILLS) {
  const srcPath = join(
    ROOT,
    'dist',
    'claude',
    'plugins',
    skill.plugin,
    'skills',
    skill.slug,
    'SKILL.md',
  );
  const destPath = join(ROOT, 'catalog', 'languages', skill.lang, 'skills', skill.slug, 'SKILL.md');

  if (!existsSync(srcPath)) {
    errors.push(`MISSING compiled source: ${srcPath}`);
    continue;
  }

  const srcRaw = readFileSync(srcPath, 'utf8');
  const { data: compiledData, content: rawBody } = matter(srcRaw);

  const body = stripAppliedRules(rawBody);
  const catalogContent = buildCatalogFile(skill, compiledData, body);

  // Sanity check: the file should exist (even if empty)
  writeFileSync(destPath, catalogContent, 'utf8');
  console.log(`  OK    ${skill.lang}/${skill.slug}  (${catalogContent.length} bytes written)`);
  recovered++;
}

console.log(`\nDone: ${recovered} recovered, ${skipped} skipped, ${errors.length} errors`);
if (errors.length) {
  errors.forEach(e => console.error('  ERROR:', e));
  process.exit(1);
}
