/**
 * Trust scan rule definitions.
 *
 * 11 rules across two namespaces:
 *   secret/*    — credentials, tokens, API keys
 *   injection/* — jailbreak overrides, role-switch, data-exfil URLs
 *
 * Each rule specifies either a per-line `pattern` or a whole-file `globalPattern`.
 * `frontmatterOnly` restricts matching to the YAML block (content before the second ---).
 */

interface ScanRule {
  id: string;
  severity: 'warn' | 'error';
  description: string;
  /** Applied to each line of the raw file content (frontmatter + body). */
  pattern?: RegExp;
  /** Applied to the whole file content (for multi-line patterns). */
  globalPattern?: RegExp;
  /** When true, apply only to the YAML frontmatter block (content before the second ---). */
  frontmatterOnly?: boolean;
}

export const RULES: ScanRule[] = [
  // ── Secrets / credentials ─────────────────────────────────────────────────
  {
    id: 'secret/aws-access-key',
    severity: 'error',
    description: 'AWS access key ID',
    pattern:
      /(?<![A-Z0-9])(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])/,
  },
  {
    id: 'secret/private-key-block',
    severity: 'error',
    description: 'PEM private key block',
    pattern: /-----BEGIN\s+(RSA|EC|OPENSSH|DSA|PGP)\s+PRIVATE\s+KEY/i,
  },
  {
    id: 'secret/generic-api-key',
    severity: 'warn',
    description: 'Generic API key assignment',
    pattern: /\bapi[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}['"]?/i,
  },
  {
    id: 'secret/bearer-token',
    severity: 'warn',
    description: 'Hardcoded bearer token',
    pattern: /bearer\s+[A-Za-z0-9._~+/-]+=*/i,
  },
  {
    id: 'secret/password-field',
    severity: 'warn',
    description: 'Password/secret field assignment',
    pattern: /\b(?:password|passwd|secret)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/i,
  },
  {
    id: 'secret/github-token',
    severity: 'error',
    description: 'GitHub personal access token',
    pattern: /ghp_[A-Za-z0-9]{36,}/,
  },
  {
    id: 'secret/anthropic-key',
    severity: 'error',
    description: 'Anthropic API key',
    pattern: /sk-ant-[A-Za-z0-9\-_]{20,}/,
  },
  {
    id: 'secret/openai-key',
    severity: 'error',
    description: 'OpenAI API key',
    pattern: /sk-(?:proj-)?[A-Za-z0-9]{20,}/,
  },

  // ── Config artifact security (hooks / MCP execute shell commands) ─────────
  {
    id: 'config/dangerous-command',
    severity: 'error',
    description: 'Hook or MCP command with dangerous shell pattern',
    // Catches common destructive/exfil patterns: rm -rf, pipe-to-sh, reverse shells, eval, etc.
    pattern:
      /(?:rm\s+-[rf]{1,2}f?\s+\/|curl[^'"]*\|\s*(?:bash|sh)|wget[^'"]*\|\s*(?:bash|sh)|eval\s*["`(]|nc\s+[-\w]*\s+\d+\s+-e|python[23]?\s+-c\s*['"`]import\s+socket|bash\s+-i\s*>&?\s*\/dev\/tcp)/i,
  },
  {
    id: 'config/exfil-in-command',
    severity: 'warn',
    description: 'Hook command that may exfiltrate data (curl/wget to external URL with data)',
    pattern:
      /(?:curl|wget)\s+[^'"]*(?:https?:\/\/)[^'" ]+\s+(?:-d\s*['"`]?\$|--data\s*['"`]?\$|--upload-file)/i,
  },

  // ── Prompt injection heuristics ────────────────────────────────────────────
  {
    id: 'injection/ignore-previous',
    severity: 'error',
    description: 'Prompt override phrase',
    pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  },
  {
    id: 'injection/disregard-system',
    severity: 'error',
    description: 'System-prompt disregard phrase',
    pattern: /disregard\s+(the\s+)?(system\s+prompt|previous\s+instructions?)/i,
  },
  {
    id: 'injection/jailbreak-override',
    severity: 'error',
    description: 'Jailbreak override phrase',
    pattern: /\byou\s+(?:must|shall|will)\s+(?:now\s+)?(?:act|pretend|behave|forget|ignore)/i,
  },
  {
    id: 'injection/data-exfil-url',
    severity: 'warn',
    description: 'Potential data exfiltration URL pattern',
    // Looks for "fetch/curl/request <external-url>" with suspicious query params
    pattern:
      /(?:fetch|curl|request|wget|http\.get)\s*\(\s*['"`]https?:\/\/[^'"` ]+\?[^'"` ]+\b(?:data|token|key|secret|content|output)\b/i,
  },
  {
    id: 'injection/role-switch',
    severity: 'warn',
    description: 'Suspicious role-switch instruction',
    pattern: /from\s+now\s+on[,\s]+(?:you\s+are|act\s+as|pretend\s+to\s+be)/i,
  },
];

/** Rule descriptions exported for documentation/help output. */
export const RULE_DESCRIPTIONS: Array<{ id: string; severity: string; description: string }> =
  RULES.map(r => ({ id: r.id, severity: r.severity, description: r.description }));
