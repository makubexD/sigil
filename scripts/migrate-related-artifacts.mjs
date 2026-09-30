/**
 * Phase 3 migration: move ## Boundary sections to relatedArtifacts frontmatter.
 *
 * For each agent:
 *   1. Strip the `## Boundary` section from the body.
 *   2. Add `relatedArtifacts` to the YAML frontmatter.
 *   3. Clean the description (remove hard-coded catalog ID escalation tails).
 *
 * Run: node scripts/migrate-related-artifacts.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.resolve(__dirname, '..', 'catalog');

// ─── Relationship graph ────────────────────────────────────────────────────────

const RELATIONS = {
  'csharp/cs-code-reviewer': {
    cleanDescription:
      "Use to review a diff, file, or scope for correctness, security, and quality against the project's documented conventions. Fast per-change generalist gate — read-only; returns a severity-ranked report. Use proactively after non-trivial changes.",
    relatedArtifacts: [
      {
        id: 'csharp/cs-security-auditor',
        relation: 'escalates-to',
        reason: 'codebase-wide security audit — goes beyond per-diff smell detection',
      },
      {
        id: 'csharp/cs-architecture-reviewer',
        relation: 'escalates-to',
        reason: 'solution-graph and SOLID-adherence analysis at project scale',
      },
      {
        id: 'csharp/cs-performance-profiler',
        relation: 'escalates-to',
        reason: 'runtime profiling and systemic hot-path investigation',
      },
      {
        id: 'csharp/cs-api-compat-reviewer',
        relation: 'escalates-to',
        reason: 'public/binary API compatibility classification before releases',
      },
    ],
  },
  'csharp/cs-security-auditor': {
    cleanDescription:
      'Use to conduct a deep, codebase-wide security audit and produce a prioritized remediation report. Read-only; never modifies files. Sweeps the entire codebase for threat-surface issues: hardcoded secrets, injection, unsafe deserialization, broken authn/authz, and NuGet CVEs. Use proactively before releases, when adding authentication or external I/O, or when handling sensitive data.',
    relatedArtifacts: [
      {
        id: 'csharp/cs-code-reviewer',
        relation: 'complements',
        reason: 'cs-code-reviewer gates per-change diffs; this agent sweeps the full codebase',
      },
      {
        id: 'csharp/cs-audit-deps',
        relation: 'see-also',
        reason:
          'cs-audit-deps handles NuGet/dependency CVE scanning; this agent handles code-level vulnerabilities',
      },
    ],
  },
  'csharp/cs-architecture-reviewer': {
    cleanDescription:
      'Use to review the structural and design-level health of a .NET solution — project coupling, cohesion, layering, circular project references, namespace dependency direction, and SOLID adherence at solution scale. Read-only; returns a prioritized findings report. Use proactively when adding new projects, refactoring boundaries, or when the solution feels tangled.',
    relatedArtifacts: [
      {
        id: 'csharp/cs-code-reviewer',
        relation: 'complements',
        reason:
          'cs-code-reviewer flags line-level issues on diffs; this agent analyzes the full solution graph',
      },
      {
        id: 'csharp/cs-refactor-specialist',
        relation: 'escalates-to',
        reason: 'implements the structural changes identified by this agent',
      },
      {
        id: 'csharp/cs-api-compat-reviewer',
        relation: 'complements',
        reason:
          'cs-api-compat-reviewer covers the public API surface; this agent covers internal structure',
      },
    ],
  },
  'csharp/cs-debugger': {
    cleanDescription:
      'Use to investigate a failing test, exception, or unexpected runtime behaviour in isolation and return the root cause plus a verified minimal fix. Makes behavior-changing fixes; does not do behavior-preserving restructuring. Use proactively when tests fail or an error is reported.',
    relatedArtifacts: [
      {
        id: 'csharp/cs-refactor-specialist',
        relation: 'complements',
        reason:
          'cs-refactor-specialist makes behavior-preserving changes; this agent makes behavior-changing fixes',
      },
    ],
  },
  'csharp/cs-performance-profiler': {
    cleanDescription:
      'Use to analyze algorithmic complexity, identify hot paths, and surface .NET performance anti-patterns — async deadlocks, LINQ multiple enumeration, EF N+1, boxing, Span<T> opportunities, O(n²) loops. Can run profiling tools if available. Measures and reasons about runtime behavior. Use proactively when adding data-processing loops, external I/O, or after a performance regression is reported.',
    relatedArtifacts: [
      {
        id: 'csharp/cs-code-reviewer',
        relation: 'complements',
        reason:
          'cs-code-reviewer surfaces obvious inline smells; this agent profiles runtime behavior and systemic patterns',
      },
      {
        id: 'csharp/cs-refactor-specialist',
        relation: 'escalates-to',
        reason: 'implements the structural optimizations identified by this agent',
      },
    ],
  },
  'csharp/cs-refactor-specialist': {
    cleanDescription:
      'Use to perform behavior-preserving refactors — extract method/class, rename symbols, decompose large projects, eliminate duplication, break circular project references. Applies changes and verifies the test suite stays green. Never changes observable behavior. Use proactively after a feature is working and tests pass, when code quality needs improvement without risk.',
    relatedArtifacts: [
      {
        id: 'csharp/cs-debugger',
        relation: 'complements',
        reason:
          'cs-debugger makes behavior-changing fixes; this agent makes behavior-preserving structural changes',
      },
      {
        id: 'csharp/cs-architecture-reviewer',
        relation: 'complements',
        reason:
          'cs-architecture-reviewer identifies structural problems; this agent implements the fixes',
      },
      {
        id: 'csharp/cs-performance-profiler',
        relation: 'complements',
        reason:
          'cs-performance-profiler identifies hot paths; this agent applies the restructuring',
      },
    ],
  },
  'csharp/cs-api-compat-reviewer': {
    cleanDescription:
      'Use to gate public/binary API compatibility before merging a branch or cutting a release. Read-only; classifies changes as source-breaking, binary-breaking, or compatible, and emits a SemVer recommendation. Reviews the public surface contract. Use proactively when changing method signatures, removing members, adding abstract members, or sealing types.',
    relatedArtifacts: [
      {
        id: 'csharp/cs-code-reviewer',
        relation: 'complements',
        reason:
          'cs-code-reviewer reviews per-change correctness and style; this agent reviews public API compatibility',
      },
      {
        id: 'csharp/cs-architecture-reviewer',
        relation: 'complements',
        reason:
          'cs-architecture-reviewer analyzes module graph; this agent analyzes the public surface',
      },
    ],
  },

  'typescript/ts-code-reviewer': {
    cleanDescription:
      "Use to review a diff, file, or scope for correctness, security, and quality against the project's documented conventions. Fast per-change generalist gate — read-only; returns a severity-ranked report. Use proactively after non-trivial changes.",
    relatedArtifacts: [
      {
        id: 'typescript/ts-security-auditor',
        relation: 'escalates-to',
        reason: 'codebase-wide security audit — goes beyond per-diff smell detection',
      },
      {
        id: 'typescript/ts-architecture-reviewer',
        relation: 'escalates-to',
        reason: 'module coupling, layering, and circular-import analysis at package scale',
      },
      {
        id: 'typescript/ts-performance-profiler',
        relation: 'escalates-to',
        reason: 'runtime profiling and systemic hot-path investigation',
      },
      {
        id: 'typescript/ts-api-compat-reviewer',
        relation: 'escalates-to',
        reason: 'public API and type-surface compatibility for published npm packages',
      },
    ],
  },
  'typescript/ts-security-auditor': {
    cleanDescription:
      'Use to conduct a deep, codebase-wide security audit and produce a prioritized remediation report. Read-only; never modifies files. Sweeps the entire codebase for threat-surface issues: hardcoded secrets, injection, prototype pollution, unsafe deserialization, and dependency CVEs. Use proactively before releases, when adding authentication or external I/O, or when handling sensitive data.',
    relatedArtifacts: [
      {
        id: 'typescript/ts-code-reviewer',
        relation: 'complements',
        reason: 'ts-code-reviewer gates per-change diffs; this agent sweeps the full codebase',
      },
      {
        id: 'typescript/ts-audit-deps',
        relation: 'see-also',
        reason:
          'ts-audit-deps handles dependency inventory and CVE scanning; this agent handles code-level vulnerabilities',
      },
    ],
  },
  'typescript/ts-architecture-reviewer': {
    cleanDescription:
      'Use to review the structural and design-level health of a TypeScript codebase — module coupling, cohesion, layering, circular imports, and SOLID adherence at package scale. Read-only; returns a prioritized findings report. Analyzes the module graph and design boundaries. Use proactively when adding new modules, refactoring module boundaries, or when the codebase feels tangled.',
    relatedArtifacts: [
      {
        id: 'typescript/ts-code-reviewer',
        relation: 'complements',
        reason:
          'ts-code-reviewer flags line-level issues on diffs; this agent analyzes the full module graph',
      },
      {
        id: 'typescript/ts-refactor-specialist',
        relation: 'escalates-to',
        reason: 'implements the structural changes identified by this agent',
      },
      {
        id: 'typescript/ts-api-compat-reviewer',
        relation: 'complements',
        reason:
          'ts-api-compat-reviewer covers the published surface; this agent covers internal structure',
      },
    ],
  },
  'typescript/ts-debugger': {
    cleanDescription:
      'Use to investigate a failing test, traceback, or unexpected runtime behaviour in isolation and return the root cause plus a verified minimal fix. Makes behavior-changing fixes; does not do behavior-preserving restructuring. Use proactively when tests fail or an error is reported.',
    relatedArtifacts: [
      {
        id: 'typescript/ts-refactor-specialist',
        relation: 'complements',
        reason:
          'ts-refactor-specialist makes behavior-preserving changes; this agent makes behavior-changing fixes',
      },
    ],
  },
  'typescript/ts-performance-profiler': {
    cleanDescription:
      'Use to analyze algorithmic complexity, identify hot paths, and surface performance anti-patterns — N+1 queries, blocking the event loop, needless allocations, O(n²) loops, repeated computation. Can run profiling tools if available. Measures and reasons about runtime behavior. Use proactively when adding data-processing loops, external I/O, or after a performance regression is reported.',
    relatedArtifacts: [
      {
        id: 'typescript/ts-code-reviewer',
        relation: 'complements',
        reason:
          'ts-code-reviewer surfaces obvious inline smells; this agent profiles runtime behavior and systemic patterns',
      },
      {
        id: 'typescript/ts-refactor-specialist',
        relation: 'escalates-to',
        reason: 'implements the structural optimizations identified by this agent',
      },
    ],
  },
  'typescript/ts-refactor-specialist': {
    cleanDescription:
      'Use to perform behavior-preserving refactors — extract function/module, rename symbols, decompose large modules, eliminate duplication, break circular dependencies. Applies changes and verifies the test suite stays green. Never changes observable behavior. Use proactively after a feature is working and tests pass, when code quality needs improvement without risk.',
    relatedArtifacts: [
      {
        id: 'typescript/ts-debugger',
        relation: 'complements',
        reason:
          'ts-debugger makes behavior-changing fixes; this agent makes behavior-preserving structural changes',
      },
      {
        id: 'typescript/ts-architecture-reviewer',
        relation: 'complements',
        reason:
          'ts-architecture-reviewer identifies structural problems; this agent implements the fixes',
      },
      {
        id: 'typescript/ts-performance-profiler',
        relation: 'complements',
        reason:
          'ts-performance-profiler identifies hot paths; this agent applies the restructuring',
      },
    ],
  },
  'typescript/ts-api-compat-reviewer': {
    cleanDescription:
      'Use to review public API and type-surface compatibility for published npm packages before a release. Read-only; returns a Breaking/Behavioral/Compatible tiered report with a SemVer recommendation. Specializes in what callers see: exported types, the exports map, and runtime-behavioral contracts. Use before any release that could affect downstream consumers.',
    relatedArtifacts: [
      {
        id: 'typescript/ts-code-reviewer',
        relation: 'complements',
        reason:
          'ts-code-reviewer reviews per-change diffs; this agent reviews the published API surface',
      },
      {
        id: 'typescript/ts-architecture-reviewer',
        relation: 'complements',
        reason:
          'ts-architecture-reviewer analyzes internal module coupling; this agent analyzes the published surface',
      },
    ],
  },

  'angular/ng-code-reviewer': {
    cleanDescription:
      "Use to review a diff, file, or scope for correctness, security, and quality against the project's documented conventions. Fast per-change generalist gate — read-only; returns a severity-ranked report. Use proactively after non-trivial changes.",
    relatedArtifacts: [
      {
        id: 'angular/ng-security-auditor',
        relation: 'escalates-to',
        reason: 'codebase-wide security audit — goes beyond per-diff smell detection',
      },
      {
        id: 'angular/ng-architecture-reviewer',
        relation: 'escalates-to',
        reason: 'module/design/coupling analysis at feature and module scale',
      },
      {
        id: 'angular/ng-performance-profiler',
        relation: 'escalates-to',
        reason: 'change-detection cost and runtime performance analysis',
      },
      {
        id: 'angular/ng-template-reviewer',
        relation: 'escalates-to',
        reason: 'component and template layer — OnPush, control-flow, async-pipe, and a11y',
      },
      {
        id: 'angular/ng-api-compat-reviewer',
        relation: 'escalates-to',
        reason: 'published library API surface compatibility before releases',
      },
    ],
  },
  'angular/ng-security-auditor': {
    cleanDescription:
      'Use to conduct a deep, codebase-wide security audit and produce a prioritized remediation report. Read-only; never modifies files. Sweeps the entire codebase for threat-surface issues: secrets in the bundle, XSS/sanitizer bypasses, injection, unsafe deserialization, broken authz, and dependency CVEs. Use proactively before releases, when adding authentication or external I/O, or when handling sensitive data.',
    relatedArtifacts: [
      {
        id: 'angular/ng-code-reviewer',
        relation: 'complements',
        reason: 'ng-code-reviewer gates per-change diffs; this agent sweeps the full codebase',
      },
      {
        id: 'angular/ng-audit-deps',
        relation: 'see-also',
        reason:
          'ng-audit-deps handles dependency inventory and CVE scanning; this agent handles code-level vulnerabilities',
      },
    ],
  },
  'angular/ng-architecture-reviewer': {
    cleanDescription:
      'Use to review the structural and design-level health of a codebase — module/standalone boundaries, feature coupling, layering, dependency direction, circular imports/DI, and SOLID adherence at package scale. Read-only; returns a prioritized findings report. Analyzes the module graph and design boundaries. Use proactively when adding new feature areas, refactoring module boundaries, or when the codebase feels tangled.',
    relatedArtifacts: [
      {
        id: 'angular/ng-code-reviewer',
        relation: 'complements',
        reason:
          'ng-code-reviewer flags line-level issues on diffs; this agent analyzes the full module graph',
      },
      {
        id: 'angular/ng-refactor-specialist',
        relation: 'escalates-to',
        reason: 'implements the structural changes identified by this agent',
      },
    ],
  },
  'angular/ng-debugger': {
    cleanDescription:
      'Use to investigate a failing test, traceback, or unexpected runtime behaviour in isolation and return the root cause plus a verified minimal fix. Makes behavior-changing fixes; does not do behavior-preserving restructuring. Use proactively when tests fail or an error is reported.',
    relatedArtifacts: [
      {
        id: 'angular/ng-refactor-specialist',
        relation: 'complements',
        reason:
          'ng-refactor-specialist makes behavior-preserving changes; this agent makes behavior-changing fixes',
      },
    ],
  },
  'angular/ng-performance-profiler': {
    cleanDescription:
      'Use to analyze change-detection cost, bundle size, algorithmic complexity, and runtime anti-patterns — function calls in templates, missing track/trackBy, N+1 I/O, needless allocations, zone thrash. Can run build/profiling tools if available. Measures and reasons about runtime behavior. Use proactively when adding data-heavy views, external I/O, or after a performance regression is reported.',
    relatedArtifacts: [
      {
        id: 'angular/ng-code-reviewer',
        relation: 'complements',
        reason:
          'ng-code-reviewer surfaces obvious inline smells; this agent profiles runtime behavior and systemic patterns',
      },
      {
        id: 'angular/ng-refactor-specialist',
        relation: 'escalates-to',
        reason: 'implements the structural optimizations identified by this agent',
      },
      {
        id: 'angular/ng-template-reviewer',
        relation: 'complements',
        reason:
          'ng-template-reviewer owns correctness of the template layer; this agent owns its runtime cost',
      },
    ],
  },
  'angular/ng-refactor-specialist': {
    cleanDescription:
      'Use to perform behavior-preserving refactors — extract component/service, rename symbols, decompose large modules, eliminate duplication, break circular dependencies/DI. Applies changes and verifies the test suite stays green. Never changes observable behavior. Use proactively after a feature is working and tests pass, when code quality needs improvement without risk.',
    relatedArtifacts: [
      {
        id: 'angular/ng-debugger',
        relation: 'complements',
        reason:
          'ng-debugger makes behavior-changing fixes; this agent makes behavior-preserving structural changes',
      },
      {
        id: 'angular/ng-architecture-reviewer',
        relation: 'complements',
        reason:
          'ng-architecture-reviewer identifies structural problems; this agent implements the fixes',
      },
      {
        id: 'angular/ng-performance-profiler',
        relation: 'complements',
        reason:
          'ng-performance-profiler identifies hot paths; this agent applies the restructuring',
      },
    ],
  },
  'angular/ng-template-reviewer': {
    cleanDescription:
      'Use to review the component + template layer — OnPush/change-detection correctness, control-flow track correctness, async-pipe vs leak-prone manual subscribe, template binding cost, and accessibility. Read-only; returns a severity-ranked report. Reviews the view layer specifically. Use proactively after building or changing components and templates.',
    relatedArtifacts: [
      {
        id: 'angular/ng-code-reviewer',
        relation: 'complements',
        reason:
          'ng-code-reviewer is the TS diff-level generalist gate; this agent specializes in the component/template layer',
      },
      {
        id: 'angular/ng-architecture-reviewer',
        relation: 'complements',
        reason: 'ng-architecture-reviewer analyzes the module graph and feature boundaries',
      },
      {
        id: 'angular/ng-performance-profiler',
        relation: 'escalates-to',
        reason: 'for findings primarily about measured runtime cost (bundle, profiling)',
      },
      {
        id: 'angular/ng-security-auditor',
        relation: 'escalates-to',
        reason: 'for findings primarily about XSS or secret exposure in the template layer',
      },
    ],
  },
  'angular/ng-api-compat-reviewer': {
    cleanDescription:
      'Use to review the public API surface of an Angular library package for backward compatibility and recommend a SemVer bump. Read-only; never modifies files. Classifies breaking vs behavioral vs additive changes for a publishable library. Use proactively before publishing a library release.',
    relatedArtifacts: [
      {
        id: 'angular/ng-code-reviewer',
        relation: 'complements',
        reason:
          'ng-code-reviewer gates internal diffs for correctness/quality; this agent reviews the published library surface',
      },
      {
        id: 'angular/ng-architecture-reviewer',
        relation: 'complements',
        reason:
          'ng-architecture-reviewer analyzes the module graph; this agent analyzes the public API surface',
      },
    ],
  },
};

// ─── YAML serialization helpers ───────────────────────────────────────────────

function needsQuoting(str) {
  // Quote strings that start with special YAML chars or contain ':' or newlines
  return (
    /^["{[|>&*!%@`#~]/.test(str) || str.includes(':') || str.includes('\n') || str.includes('"')
  );
}

function yamlStr(str) {
  if (needsQuoting(str)) {
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return str;
}

function serializeRelatedArtifacts(entries) {
  const lines = ['relatedArtifacts:'];
  for (const entry of entries) {
    lines.push(`  - id: ${entry.id}`);
    lines.push(`    relation: ${entry.relation}`);
    lines.push(`    reason: ${yamlStr(entry.reason)}`);
  }
  return lines.join('\n');
}

// ─── Body processing ──────────────────────────────────────────────────────────

/**
 * Strip the `## Boundary` section from the agent body.
 * The section runs from `## Boundary` up to (but not including) the next `##` heading,
 * or the end of the file if no following heading exists.
 */
function stripBoundarySection(body) {
  const lines = body.split('\n');
  const startIdx = lines.findIndex(l => /^##\s+Boundary\s*$/.test(l.trim()));
  if (startIdx === -1) return body; // no Boundary section

  // Find next ## heading after the Boundary section
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  // Remove from startIdx to endIdx, trimming blank lines around the cut
  const before = lines.slice(0, startIdx).join('\n').trimEnd();
  const after = lines.slice(endIdx).join('\n').trimStart();

  if (before && after) return before + '\n\n' + after;
  if (before) return before;
  return after;
}

// ─── Frontmatter reconstruction ───────────────────────────────────────────────

/**
 * Rebuild YAML frontmatter, injecting relatedArtifacts and updating description.
 * We reconstruct manually to preserve field order and quoting style.
 */
function rebuildFrontmatter(fm, cleanDescription, relatedArtifacts) {
  // Read the existing YAML, replace description, inject relatedArtifacts before body ends
  // We do this by modifying the parsed data and re-stringifying with gray-matter's stringify.
  // But gray-matter's stringify can change formatting. Instead, do surgical string replacement.

  // We'll return the modified data object and let gray-matter stringify it.
  const newFm = { ...fm };
  newFm.description = cleanDescription;
  if (relatedArtifacts && relatedArtifacts.length > 0) {
    newFm.relatedArtifacts = relatedArtifacts;
  }
  return newFm;
}

// ─── Main migration ───────────────────────────────────────────────────────────

let updated = 0;
let skipped = 0;

for (const [artifactId, config] of Object.entries(RELATIONS)) {
  const [lang, name] = artifactId.split('/');
  const agentPath = path.join(CATALOG, 'languages', lang, 'agents', `${name}.agent.md`);

  if (!fs.existsSync(agentPath)) {
    console.warn(`  ⚠ SKIP ${artifactId} — file not found: ${agentPath}`);
    skipped++;
    continue;
  }

  const raw = fs.readFileSync(agentPath, 'utf-8');
  const parsed = matter(raw);

  // Strip ## Boundary from body
  const cleanBody = stripBoundarySection(parsed.content);

  // Build new frontmatter data
  const newData = {
    ...parsed.data,
    description: config.cleanDescription,
  };
  if (config.relatedArtifacts && config.relatedArtifacts.length > 0) {
    newData.relatedArtifacts = config.relatedArtifacts;
  }

  // Reconstruct file using gray-matter stringify
  // gray-matter.stringify(content, data) produces --- YAML --- \n content
  const reconstructed = matter.stringify(cleanBody, newData);

  fs.writeFileSync(agentPath, reconstructed, 'utf-8');
  console.log(`  ✓ Migrated ${artifactId}`);
  updated++;
}

console.log(`\nMigration complete: ${updated} updated, ${skipped} skipped.`);
