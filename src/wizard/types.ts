/**
 * Wizard shared types, constants, and TTY check.
 */
import type { Target } from '../types';

export interface WizardResult {
  /** Platform target (claude or copilot). */
  target: string;
  /**
   * Resolved selector strings ready to pass to resolveSelection().
   * E.g. ['skill:csharp/xunit-testing', 'agent:shared/code-reviewer'] or ['all'].
   */
  selectors: string[];
  /** Whether to install dependency closure (rules/agents referenced by uses). */
  includeDeps: boolean;
  /** Whether to overwrite existing files. */
  overwrite: boolean;
  /**
   * Optional language filter (e.g. 'csharp', 'python'). When set, only artifacts for
   * this language (plus shared/cross-language artifacts) are installed.
   * Undefined means all languages.
   */
  language?: string | undefined;
  /**
   * Install scope for config-kind artifacts (hook, settings, mcp).
   * Only present when the resolved pick set contains at least one config-kind artifact.
   * Maps to --scope on the CLI. Undefined means 'project' (the default).
   */
  configScope?: string | undefined;
}

/** Return value of `runNewWizard` — maps 1:1 to `sigil new` CLI flags. */
export interface NewWizardResult {
  kind: string;
  name: string;
  title: string;
  description: string;
  language?: string | undefined;
  platforms?: string[] | undefined;
}

/** Fields that `edit` can update interactively (metadata only). */
export interface EditWizardResult {
  title: string;
  description: string;
  tags: string[];
}

/** Returns true when stdin and stdout are both interactive terminals. */
export function isInteractiveTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

// Re-export Target type for consumers of this module
export type { Target };
