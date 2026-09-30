/**
 * Input resolution for `sigil new` — wizard vs. flags dispatch, kind/platforms
 * validation. Split out of new.ts to keep that file under the repo's own
 * module-size threshold.
 *
 * @module
 */
import { resolveCatalog } from '../resolve';
import { getAllTargets } from '../targets';
import { isArtifactKind } from '../kinds';
import { runNewWizard } from '../wizard';
import { SigilError } from '../errors';
import { requireValidCatalog } from '../cli-helpers';
import { setPlatforms } from '../authoring/platforms';
import type { NewWizardResult } from '../wizard/types';

export interface NewOptions {
  language?: string | undefined;
  name?: string | undefined;
  catalogDir: string;
  platforms?: string | undefined;
  yes?: boolean;
  interactive?: boolean;
}

export interface EffectiveNewInputs {
  kind: string;
  name?: string | undefined;
  language?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  platforms?: string[] | undefined;
}

/** Throws the "no kind, no TTY" error with the standard hint. */
function throwNoWizardAvailable(validKinds: readonly string[]): never {
  throw new SigilError('No kind provided and stdin/stdout is not an interactive terminal.', {
    hint:
      `  Provide a kind: sigil new <kind> --name <name> --yes\n` +
      `  Valid kinds: ${validKinds.join(', ')}\n\n` +
      '  Or run in an interactive terminal to use the guided wizard.',
  });
}

/** Maps a NewWizardResult onto the shared effective-inputs shape. */
function mapWizardResult(wizardResult: NewWizardResult): EffectiveNewInputs {
  return {
    kind: wizardResult.kind,
    name: wizardResult.name,
    language: wizardResult.language,
    title: wizardResult.title,
    description: wizardResult.description,
    platforms: wizardResult.platforms,
  };
}

/** Runs the interactive wizard and maps its result onto the effective-inputs shape. */
export async function resolveWizardInputs(
  opts: NewOptions,
  isTTY: boolean,
  validKinds: readonly string[],
): Promise<EffectiveNewInputs | undefined> {
  if (!isTTY) throwNoWizardAvailable(validKinds);

  // Load catalog for the wizard (language list + reference data)
  const rawCatalog = await requireValidCatalog(opts.catalogDir);
  const resolved = resolveCatalog(rawCatalog);
  const targets = getAllTargets();
  const wizardResult = await runNewWizard(resolved, targets);
  return wizardResult ? mapWizardResult(wizardResult) : undefined;
}

/** Validates --kind against ALL_KINDS and returns it narrowed, or throws. */
function validateKindFlag(kind: string | undefined, validKinds: readonly string[]): string {
  const effectiveKind = kind ?? '';
  if (!effectiveKind) {
    throw new SigilError('No kind specified and --yes skips the wizard.', {
      hint:
        `  Provide a kind: sigil new <kind> --name <name> --yes\n` +
        `  Valid kinds: ${validKinds.join(', ')}`,
    });
  }
  if (!isArtifactKind(effectiveKind)) {
    throw new SigilError(`Unknown kind '${effectiveKind}'. Valid kinds: ${validKinds.join(', ')}`);
  }
  return effectiveKind;
}

/** Parses + validates --platforms for the flags path, or undefined when not passed. */
function resolveRestrictedPlatformsFlag(
  effectiveKind: string,
  opts: NewOptions,
): string[] | undefined {
  if (!opts.platforms) return undefined;

  const requested = opts.platforms
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  const { platforms: normalized, errors } = setPlatforms(effectiveKind, requested, getAllTargets());
  if (errors.length > 0) {
    throw new SigilError('Invalid --platforms.', { hint: errors.map(e => `  ✗  ${e}`).join('\n') });
  }
  return normalized;
}

/** Validates flags-path inputs (kind + --platforms) and returns the effective-inputs shape. */
export function resolveFlagsInputs(
  kind: string | undefined,
  opts: NewOptions,
  validKinds: readonly string[],
): EffectiveNewInputs {
  const effectiveKind = validateKindFlag(kind, validKinds);
  const restrictedPlatforms = resolveRestrictedPlatformsFlag(effectiveKind, opts);

  return {
    kind: effectiveKind,
    name: opts.name,
    language: opts.language,
    platforms: restrictedPlatforms,
  };
}
