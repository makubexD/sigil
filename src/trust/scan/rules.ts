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
    // Covers the legacy classic-PAT prefix (ghp_) and the newer fine-grained/scoped prefixes:
    // gho_ (OAuth), ghu_ (user-to-server), ghs_ (server-to-server), ghr_ (refresh), and the
    // long-form fine-grained PAT (github_pat_...).
    pattern: /gh[oprsu]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,}/,
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
  // Round-4 (2026-08-23) audit F36: the rule set previously covered only AWS/PEM/GitHub/
  // Anthropic/OpenAI — a dogfooded ts-security-auditor run flagged the gap against Slack, Stripe,
  // Google, npm, and JWT formats, all common enough to be worth a dedicated pattern rather than
  // relying on the generic api-key/bearer-token/password catch-alls above.
  {
    id: 'secret/slack-token',
    severity: 'error',
    description: 'Slack API token',
    pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/,
  },
  {
    id: 'secret/stripe-key',
    severity: 'error',
    description: 'Stripe API key',
    pattern: /\b(?:sk|pk)_live_[A-Za-z0-9]{16,}/,
  },
  {
    id: 'secret/google-api-key',
    severity: 'error',
    description: 'Google API key',
    pattern: /AIza[A-Za-z0-9_-]{35}/,
  },
  {
    id: 'secret/npm-token',
    severity: 'error',
    description: 'npm access token',
    pattern: /npm_[A-Za-z0-9]{36}/,
  },
  {
    id: 'secret/jwt',
    severity: 'warn',
    description: 'JSON Web Token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
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
  // `globalPattern`, not `pattern`: these run against the whole joined content instead of one
  // line at a time, so a payload split across a newline (`"ignore all\nprevious instructions"`)
  // can't evade detection just because no single line contains the full phrase — `\s+` inside
  // each pattern already matches a literal newline, it's the per-line scan that was the gap
  // (2026-08-22 audit F26).
  {
    id: 'injection/ignore-previous',
    severity: 'error',
    description: 'Prompt override phrase',
    globalPattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  },
  {
    id: 'injection/disregard-system',
    severity: 'error',
    description: 'System-prompt disregard phrase',
    globalPattern: /disregard\s+(the\s+)?(system\s+prompt|previous\s+instructions?)/i,
  },
  {
    id: 'injection/jailbreak-override',
    severity: 'error',
    description: 'Jailbreak override phrase',
    globalPattern: /\byou\s+(?:must|shall|will)\s+(?:now\s+)?(?:act|pretend|behave|forget|ignore)/i,
  },
  {
    id: 'injection/data-exfil-url',
    severity: 'warn',
    description: 'Potential data exfiltration URL pattern',
    // Looks for "fetch/curl/request <external-url>" with suspicious query params
    globalPattern:
      /(?:fetch|curl|request|wget|http\.get)\s*\(\s*['"`]https?:\/\/[^'"` ]+\?[^'"` ]+\b(?:data|token|key|secret|content|output)\b/i,
  },
  {
    id: 'injection/role-switch',
    severity: 'warn',
    description: 'Suspicious role-switch instruction',
    globalPattern: /from\s+now\s+on[,\s]+(?:you\s+are|act\s+as|pretend\s+to\s+be)/i,
  },
];

/** Rule descriptions exported for documentation/help output. */
export const RULE_DESCRIPTIONS: Array<{ id: string; severity: string; description: string }> =
  RULES.map(r => ({ id: r.id, severity: r.severity, description: r.description }));
