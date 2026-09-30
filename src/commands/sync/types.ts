/**
 * Shared types for `sigil sync` — threaded through analyze.ts → apply.ts → render.ts.
 *
 * @module
 */
import type { ArtifactKind } from '../../types';

/** `mechanical` drifts are safe for `--apply` to rewrite unattended; `review` needs a human. */
export type SyncClass = 'mechanical' | 'review';

export type SyncDriftKind =
  | 'missing-required-slot'
  | 'slot-renamed'
  | 'slot-removed'
  | 'slot-reordered'
  | 'duplicated-prose'
  | 'structural-error';

/** One concrete deviation between an artifact's body and its template, ready to act on. */
export interface SyncDrift {
  readonly kind: SyncDriftKind;
  readonly class: SyncClass;
  /** The slot key this drift concerns, when applicable. */
  readonly slotKey?: string;
  /** For `slot-renamed`: the new key `--apply` should rewrite the marker to. */
  readonly renameTo?: string;
  /** For `duplicated-prose`: the exact (untruncated) line `--apply` should strip. */
  readonly line?: string;
  /** Human-readable explanation, shown in the report and used as the commit-worthy detail line. */
  readonly detail: string;
}

/** All drift found for one artifact against the one template it declares via `template:`. */
export interface SyncFinding {
  readonly artifactId: string;
  readonly filePath: string;
  readonly templateId: string;
  readonly drifts: SyncDrift[];
}

export interface SyncOptions {
  readonly catalogDir: string;
  readonly packsFile?: string | undefined;
  readonly templateFilter?: string | undefined;
  readonly changedSince?: string | undefined;
  readonly staleMonths: number;
  readonly json: boolean;
  /**
   * Conformance-engine scoping (src/commands/sync/conformance/) — mass-change review controls:
   * bring one language up to standard, or one rule across the whole catalog.
   */
  readonly ruleId?: string | undefined;
  readonly kind?: ArtifactKind | undefined;
  readonly language?: string | undefined;
  readonly provider?: string | undefined;
  /** Runs the model-backed editorial pass in addition to mechanical fixes. `--apply` only. */
  readonly editorial?: boolean | undefined;
}
