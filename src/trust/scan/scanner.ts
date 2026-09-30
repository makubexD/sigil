/**
 * Core trust scanner: scanContent + formatScanFindings.
 *
 * A pure function — no filesystem access. Binary paths are skipped.
 * Allowlists are merged from the caller-supplied set and inline comments.
 */
import type { ScanSeverity, ScanFinding, ScanResult } from './types';
import { RULES } from './rules';

// ─── Display constants ─────────────────────────────────────────────────────────

/** Characters of a matched secret to show before the mask (e.g. "ghp_" in "ghp_***ab"). */
const SECRET_MASK_PREFIX_LEN = 4;

/** Characters of a matched secret to show after the mask (e.g. "ab" in "ghp_***ab"). */
const SECRET_MASK_SUFFIX_LEN = 2;

/** Maximum length of a raw-match snippet surfaced in a finding. Keeps output scannable. */
const SNIPPET_MAX_LEN = 80;

/** Characters of surrounding line context shown on each side of a match in a finding's snippet. */
const SNIPPET_CONTEXT_CHARS = 20;

// ─── Binary extension guard ────────────────────────────────────────────────────

// .svg deliberately excluded — it's plain-text/XML, not binary, and can carry an embedded
// injection payload or an inline-allowlist bypass comment; skipping it entirely would scan
// nothing (2026-08-22 audit F26).
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
]);

function isBinaryPath(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

// ─── Inline allowlist ──────────────────────────────────────────────────────────

/**
 * Extract inline allowlist entries from the raw file content.
 * Accepts: `<!-- sigil-allow: rule/id -->` anywhere in the file.
 */
function extractInlineAllowlist(content: string): Set<string> {
  const allowed = new Set<string>();
  const re = /<!--\s*sigil-allow:\s*([^\s>]+)\s*-->/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    // m[1] is the first capture group — always present when the pattern matches
    allowed.add(m[1] ?? '');
  }
  return allowed;
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

/** Finds the 0-based index of the closing `---` for a leading frontmatter block, or -1. */
function findFrontmatterEnd(lines: string[]): number {
  if (lines[0] !== '---') return -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') return i;
  }
  return -1;
}

/** Builds the redacted, context-trimmed snippet for one line match. */
function buildRedactedSnippet(line: string, match: RegExpExecArray): string {
  const snippet = line.slice(
    Math.max(0, match.index - SNIPPET_CONTEXT_CHARS),
    Math.min(line.length, match.index + match[0].length + SNIPPET_CONTEXT_CHARS),
  );
  return snippet
    .replace(
      match[0],
      match[0].slice(0, SECRET_MASK_PREFIX_LEN) + '***' + match[0].slice(-SECRET_MASK_SUFFIX_LEN),
    )
    .trim();
}

/** Finds the first line matching `pattern` within the frontmatter-only bound, if applicable. */
function findFirstLineMatch(
  pattern: RegExp,
  lines: string[],
  frontmatterOnly: boolean | undefined,
  frontmatterEnd: number,
): { lineIndex: number; line: string; match: RegExpExecArray } | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (frontmatterOnly && frontmatterEnd >= 0 && i > frontmatterEnd) continue;
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) return { lineIndex: i, line, match };
  }
  return undefined;
}

/** Shared per-scan context threaded through the per-rule scan helpers. */
interface ScanCtx {
  lines: string[];
  frontmatterEnd: number;
  rawContent: string;
  filePath: string;
}

/** Runs one rule's per-line `pattern` scan, returning the first finding (or none). */
function scanLinePattern(rule: (typeof RULES)[number], ctx: ScanCtx): ScanFinding | undefined {
  if (!rule.pattern) return undefined;
  const found = findFirstLineMatch(
    rule.pattern,
    ctx.lines,
    rule.frontmatterOnly,
    ctx.frontmatterEnd,
  );
  if (!found) return undefined;

  return {
    rule: rule.id,
    severity: rule.severity,
    file: ctx.filePath,
    line: found.lineIndex + 1,
    snippet: buildRedactedSnippet(found.line, found.match),
  };
}

/** Runs one rule's whole-content `globalPattern` scan, returning the finding (or none). */
function scanGlobalPattern(rule: (typeof RULES)[number], ctx: ScanCtx): ScanFinding | undefined {
  if (!rule.globalPattern) return undefined;
  const source = rule.frontmatterOnly
    ? ctx.lines.slice(0, ctx.frontmatterEnd).join('\n')
    : ctx.rawContent;
  const match = rule.globalPattern.exec(source);
  if (!match) return undefined;
  const lineNum = ctx.rawContent.slice(0, match.index).split('\n').length;
  return {
    rule: rule.id,
    severity: rule.severity,
    file: ctx.filePath,
    line: lineNum,
    snippet: match[0].slice(0, SNIPPET_MAX_LEN).trim(),
  };
}

/**
 * True when `rule` is allowlisted for this scan. Inline `<!-- sigil-allow: … -->` comments (found
 * inside the very content being scanned) only ever suppress `warn`-severity rules — an `error`
 * rule can only be silenced via `.sigil/allow.json`'s out-of-band, curator-controlled entries.
 * Otherwise a malicious artifact could simply append the comment naming the rule that would have
 * flagged it and neutralize the scanner for exactly the actor it's meant to catch (2026-08-22
 * audit F26).
 */
function isAllowed(
  rule: (typeof RULES)[number],
  externalAllowed: Set<string>,
  inlineAllowed: Set<string>,
): boolean {
  if (externalAllowed.has(rule.id)) return true;
  return rule.severity === 'warn' && inlineAllowed.has(rule.id);
}

/** Runs every non-allowlisted rule against the content, collecting one finding per matching rule. */
function runRules(
  ctx: ScanCtx,
  externalAllowed: Set<string>,
  inlineAllowed: Set<string>,
): ScanFinding[] {
  const findings: ScanFinding[] = [];
  for (const rule of RULES) {
    if (isAllowed(rule, externalAllowed, inlineAllowed)) continue;
    const lineFinding = scanLinePattern(rule, ctx);
    if (lineFinding) findings.push(lineFinding);
    const globalFinding = scanGlobalPattern(rule, ctx);
    if (globalFinding) findings.push(globalFinding);
  }
  return findings;
}

/** Builds the ScanCtx and runs every rule; the pure core of {@link scanContent}. */
function scanFindings(
  filePath: string,
  rawContent: string,
  allowedRules: Set<string>,
): ScanFinding[] {
  const inlineAllowed = extractInlineAllowlist(rawContent);
  const lines = rawContent.split('\n');
  const frontmatterEnd = findFrontmatterEnd(lines);
  return runRules({ lines, frontmatterEnd, rawContent, filePath }, allowedRules, inlineAllowed);
}

/**
 * Scan an artifact's raw content for security findings.
 *
 * @param filePath      Path for display in findings (doesn't need to exist on disk).
 * @param rawContent    Full raw file content (frontmatter + body).
 * @param allowedRules  Rule IDs suppressed globally (from .sigil/allow.json).
 */
export function scanContent(
  filePath: string,
  rawContent: string,
  allowedRules: Set<string> = new Set(),
): ScanResult {
  if (isBinaryPath(filePath)) {
    return { level: 'ok', findings: [] };
  }

  const findings = scanFindings(filePath, rawContent, allowedRules);

  const level: ScanSeverity = findings.some(f => f.severity === 'error')
    ? 'error'
    : findings.length > 0
      ? 'warn'
      : 'ok';

  return { level, findings };
}

/**
 * Format scan findings for terminal display.
 */
export function formatScanFindings(result: ScanResult): string[] {
  if (result.findings.length === 0) return [];
  const lines: string[] = [];
  for (const f of result.findings) {
    const icon = f.severity === 'error' ? '✗' : '⚠';
    lines.push(`  ${icon}  [trust/${f.severity}] ${f.rule}`);
    if (f.line > 0) lines.push(`       ${f.file}:${f.line}`);
    if (f.snippet) lines.push(`       ${f.snippet}`);
  }
  return lines;
}
