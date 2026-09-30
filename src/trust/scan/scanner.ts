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

// ─── Binary extension guard ────────────────────────────────────────────────────

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.svg', '.pdf', '.zip', '.tar', '.gz',
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
    allowed.add(m[1]);
  }
  return allowed;
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

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

  const inlineAllowed = extractInlineAllowlist(rawContent);
  const allAllowed = new Set([...allowedRules, ...inlineAllowed]);

  const lines = rawContent.split('\n');

  // Extract frontmatter block (between first and second ---)
  let frontmatterEnd = -1;
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        frontmatterEnd = i;
        break;
      }
    }
  }

  const findings: ScanFinding[] = [];

  for (const rule of RULES) {
    if (allAllowed.has(rule.id)) continue;

    if (rule.pattern) {
      for (let i = 0; i < lines.length; i++) {
        if (rule.frontmatterOnly && frontmatterEnd >= 0 && i > frontmatterEnd) continue;

        const match = rule.pattern.exec(lines[i]);
        if (match) {
          const snippet = lines[i].slice(
            Math.max(0, match.index - 20),
            Math.min(lines[i].length, match.index + match[0].length + 20),
          );
          const redacted = snippet.replace(
            match[0],
            match[0].slice(0, SECRET_MASK_PREFIX_LEN) + '***' + match[0].slice(-SECRET_MASK_SUFFIX_LEN),
          );
          findings.push({
            rule: rule.id,
            severity: rule.severity,
            file: filePath,
            line: i + 1,
            snippet: redacted.trim(),
          });
          break; // one finding per rule per file is enough
        }
      }
    }

    if (rule.globalPattern) {
      const source = rule.frontmatterOnly
        ? lines.slice(0, frontmatterEnd).join('\n')
        : rawContent;
      const match = rule.globalPattern.exec(source);
      if (match) {
        const lineNum = rawContent.slice(0, match.index).split('\n').length;
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          file: filePath,
          line: lineNum,
          snippet: match[0].slice(0, SNIPPET_MAX_LEN).trim(),
        });
      }
    }
  }

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
