/**
 * Everything that spans providers, derived from the registered targets (`registerTarget()`, the
 * only provider list): every spec, every doc citation, and the literals one provider's output must
 * never carry from another. A new provider is picked up here with no edit. These are functions,
 * not constants, so a target registered after import (a test fixture) is included too.
 *
 * Consumers: `sigil sync --stale` and `--check` (analyze.ts and the conformance rules), and the
 * output-contract checks in `build` and `add` (contractsFor).
 *
 * @module
 */
import type { ContractEntry, Target } from '../types';
import type { KindEmitSpec, SourcedDocRef } from './spec-types';
import { CHANNELS, type TargetCapabilities } from './capability-types';
import { ALL_KINDS } from '../kinds';
import { getAllTargets } from './index';

export type { SourcedDocRef } from './spec-types';

/** A body literal one provider's output must not contain, with why. */
export interface BodyForbid {
  readonly pattern: RegExp;
  readonly reason: string;
}

function specLabel(provider: string, spec: KindEmitSpec): string {
  return spec.variant ? `${provider}/${spec.kind} (${spec.variant})` : `${provider}/${spec.kind}`;
}

function specDocs(provider: string, specs: readonly KindEmitSpec[]): SourcedDocRef[] {
  return specs.flatMap(spec => spec.docs.map(doc => ({ source: specLabel(provider, spec), doc })));
}

/**
 * Citations carried by capability rows (`via` rows, and `none` rows that name a platform limit) —
 * see capability-types.ts. `native` rows cite through their KindEmitSpec instead.
 */
function capabilityDocs(provider: string, capabilities: TargetCapabilities): SourcedDocRef[] {
  return CHANNELS.flatMap(channel => {
    const table = capabilities[channel];
    if (!table) return [];
    return ALL_KINDS.flatMap(kind => {
      const support = table[kind];
      const docs = support.mode === 'native' ? [] : (support.docs ?? []);
      return docs.map(doc => ({ source: `${provider} capability ${channel}/${kind}`, doc }));
    });
  });
}

/** Every citation of every registered target: its specs, its aggregates, its capability rows. */
export function allProviderDocRefs(): SourcedDocRef[] {
  return getAllTargets().flatMap(target => [
    ...specDocs(target.name, target.emitSpecs ?? []),
    ...(target.aggregateDocs ?? []),
    ...capabilityDocs(target.name, target.capabilities),
  ]);
}

/** One spec paired with its provider and a provider-qualified label. */
export interface SourcedSpec {
  /** The provider (a registered target's name) whose spec this is; match on this, not `source`. */
  readonly provider: string;
  readonly source: string;
  readonly spec: KindEmitSpec;
}

/** Every registered target's specs, labeled. */
export function allProviderSpecs(): SourcedSpec[] {
  return getAllTargets().flatMap(target =>
    (target.emitSpecs ?? []).map(spec => ({
      provider: target.name,
      source: specLabel(target.name, spec),
      spec,
    })),
  );
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The literals other providers flag `forbidElsewhere` in their lexicon (`CLAUDE.md` on Claude):
 * a body rendered for `provider` that contains one was hard-coded for another provider.
 */
export function foreignLiteralForbids(provider: string): BodyForbid[] {
  return getAllTargets()
    .filter(target => target.name !== provider && target.lexicon)
    .flatMap(target =>
      Object.values(target.lexicon!)
        .filter(entry => entry.forbidElsewhere)
        .map(entry => ({
          pattern: new RegExp(escapeRegExp(entry.value)),
          reason: `hardcoded ${target.name} literal ${entry.value} in a body rendered for ${provider}`,
        })),
    );
}

/** `target`'s output contracts, each also forbidding the other providers' flagged literals. */
export function contractsFor(target: Target): ContractEntry[] {
  return withForeignForbids(target.outputContracts ?? [], target.name);
}

/** `contracts` with `provider`'s foreign-literal forbids added to every entry. */
export function withForeignForbids(
  contracts: readonly ContractEntry[],
  provider: string,
): ContractEntry[] {
  const foreign = foreignLiteralForbids(provider);
  if (foreign.length === 0) return [...contracts];
  return contracts.map(entry => ({
    ...entry,
    contract: {
      ...entry.contract,
      bodyForbids: [...(entry.contract.bodyForbids ?? []), ...foreign],
    },
  }));
}
