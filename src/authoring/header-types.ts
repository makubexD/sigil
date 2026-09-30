/**
 * HeaderValues split out from header.ts so header-builders.ts can import it without creating a
 * cycle (header.ts imports the builders; the builders must not import back from header.ts).
 */
export interface HeaderValues {
  /** Artifact identifier. Convention: "<language>/<name>" or "shared/<name>". */
  id: string;
  /** Artifact kind: skill | agent | rule | prompt | workflow. */
  kind: string;
  /** Short human-readable title. */
  title: string;
  /** One-line description. */
  description: string;

  // Skill + Agent required
  /** Kebab-case invocation name (required for skill/agent). */
  name?: string | undefined;
  /** Language — optional for every kind; omitted = shared (catalog/shared/). */
  language?: string | undefined;

  // Platforms restriction (absent = DRY default: all supporting targets)
  platforms?: string[] | undefined;

  // Skill kind extras (optional, surfaced as comments when absent)
  usesRules?: string[];
  usesAgents?: string[];

  // Rule kind extras
  extendsRules?: string[];
  severity?: 'required' | 'recommended' | 'optional';

  // Agent kind extras
  claudeModel?: 'haiku' | 'sonnet' | 'opus';
  claudeEffort?: 'low' | 'medium' | 'high';
  claudeMaxTurns?: number;

  // Prompt kind extras
  args?: Array<{ name: string; description?: string; required?: boolean }>;
}
