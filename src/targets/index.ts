/**
 * Target adapter registry.
 *
 * Adding a new platform:
 *   1. Create src/targets/<platform>/index.ts implementing the Target interface.
 *   2. Import it here and call registerTarget().
 *   3. The CLI --target flag and dist/<name>/ output directory work automatically.
 *
 * No other code needs to change.
 */
import type { RetiredConfigDestination, Target } from '../types';

// Import and register all built-in adapters
import { ClaudeCodeTarget } from './claude-code';
import { CopilotTarget } from './copilot';

const registry = new Map<string, Target>();

registerTarget(new ClaudeCodeTarget());
registerTarget(new CopilotTarget());

export function registerTarget(target: Target): void {
  if (registry.has(target.name)) {
    throw new Error(`Target '${target.name}' is already registered`);
  }
  registry.set(target.name, target);
}

/** Returns a registered target by name. Throws a helpful error on unknown names. */
export function getTarget(name: string): Target {
  const t = registry.get(name);
  if (!t) {
    const available = [...registry.keys()].join(', ');
    throw new Error(`Unknown target '${name}'. Available targets: ${available}`);
  }
  return t;
}

/** Returns all registered targets. */
/**
 * The config files a registered target retired (Target.retiredConfigDestinations), or none for an
 * unknown name. Passed to computeStatus as `retiredFor` so every status view reports moved config.
 */
export function retiredConfigDestinationsOf(name: string): readonly RetiredConfigDestination[] {
  return registry.get(name)?.retiredConfigDestinations ?? [];
}

export function getAllTargets(): Target[] {
  return [...registry.values()];
}

/** The default target: the first registered. Throws if the registry is somehow empty. */
export function defaultTargetName(): string {
  const first = registry.values().next().value as Target | undefined;
  if (!first) throw new Error('No platform targets are registered.');
  return first.name;
}

export { ClaudeCodeTarget, CopilotTarget };
