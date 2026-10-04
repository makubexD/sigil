/**
 * `sigil sync --apply --editorial` — the model-backed half of the conformance engine. Handles
 * findings from `editorial` rules (prose rewrites, trigger-phrase rewording, cross-references)
 * that `mechanical` fixes can't safely automate because the right answer requires judgment.
 *
 * Every proposed edit must clear four rails (editorial-rails.ts) before it is written:
 *   1. Re-parses as valid frontmatter + body.
 *   2. Passes the artifact's zod schema.
 *   3. Passes checkOutputContract() for every provider spec matching this kind.
 *   4. Only touches the fields the task declared ownership of — identity fields
 *      (id/kind/name/language/uses/extends/platforms/deprecated) are never touched by any task.
 * A failed rail drops the edit and reports why; it never writes a partial result. The model call
 * itself lives in editorial-model-client.ts, injected here as `modelClient` so tests use a fake
 * client instead of making real network calls (ts-testing rule: mock only at the I/O boundary).
 *
 * @module
 */
import fs from 'fs';
import { parseFrontmatter } from '../../../frontmatter-parse';
import {
  defaultEditorialModelClient,
  type EditorialModelClient,
  type EditorialProposal,
} from './editorial-model-client';
import {
  passesOwnershipRail,
  passesOutputContractRail,
  passesSchemaRail,
  tryParseCandidate,
} from './editorial-rails';
import { CONFORMANCE_RULES } from './registry';
import type { ConformanceContext, ConformanceFinding, EditorialTask } from './types';

export type { EditorialModelClient, EditorialProposal } from './editorial-model-client';

export interface EditorialResult {
  readonly ruleId: string;
  readonly artifactId: string;
  readonly filePath: string;
  readonly status: 'written' | 'rejected';
  readonly reason?: string;
}

function rejected(ruleId: string, task: EditorialTask, reason: string): EditorialResult {
  return {
    ruleId,
    artifactId: task.artifactId,
    filePath: task.filePath,
    status: 'rejected',
    reason,
  };
}

interface RailsInput {
  readonly task: EditorialTask;
  readonly raw: string;
  readonly before: Record<string, unknown>;
  readonly proposal: EditorialProposal;
  readonly originalBody: string;
}

/** Runs one proposal through all four rails, returning the write-ready content or a rejection reason. */
function checkRails(
  input: RailsInput,
): { ok: true; content: string } | { ok: false; reason: string } {
  const { task, raw, before, proposal, originalBody } = input;
  const after = { ...before, ...proposal.frontmatterPatch };
  const bodyAfter = proposal.body ?? originalBody;
  const bodyChanged = proposal.body !== undefined && proposal.body !== originalBody;

  const ownershipFailure = passesOwnershipRail(task, before, after, bodyChanged);
  if (ownershipFailure) return { ok: false, reason: ownershipFailure };

  const parseResult = tryParseCandidate(raw, proposal.frontmatterPatch, bodyAfter);
  if (!parseResult.ok) return { ok: false, reason: parseResult.reason };

  const schemaFailure = passesSchemaRail(task, after);
  if (schemaFailure) return { ok: false, reason: schemaFailure };

  const contractFailure = passesOutputContractRail(task, after, bodyAfter);
  if (contractFailure) return { ok: false, reason: contractFailure };

  return { ok: true, content: parseResult.content };
}

/**
 * Runs one editorial task through the model and all four rails, writing on success. Reads the
 * file fresh at call time — critical when multiple tasks target the same file (see
 * runFileChain's header): each task in a chain must see the previous task's write, not a stale
 * snapshot taken before it.
 */
async function runOneEditorialTask(
  ruleId: string,
  task: EditorialTask,
  modelClient: EditorialModelClient,
): Promise<EditorialResult> {
  const raw = fs.readFileSync(task.filePath, 'utf-8');
  const parsed = parseFrontmatter(raw);
  const before = { ...parsed.data };

  let proposal: EditorialProposal;
  try {
    proposal = await modelClient(task, { frontmatter: before, body: parsed.content });
  } catch (e) {
    return rejected(ruleId, task, (e as Error).message);
  }

  const result = checkRails({ task, raw, before, proposal, originalBody: parsed.content });
  if (!result.ok) return rejected(ruleId, task, result.reason);

  fs.writeFileSync(task.filePath, result.content, 'utf-8');
  return { ruleId, artifactId: task.artifactId, filePath: task.filePath, status: 'written' };
}

/** Builds the (ruleId, task) pairs for every editorial-rule finding — mechanical findings are skipped. */
function buildEditorialTasks(
  findings: readonly ConformanceFinding[],
  ctx: ConformanceContext,
): { ruleId: string; task: EditorialTask }[] {
  const rulesById = new Map(CONFORMANCE_RULES.map(rule => [rule.id, rule]));
  return findings
    .map(finding => {
      const rule = rulesById.get(finding.ruleId);
      if (!rule || rule.class !== 'editorial' || !rule.editorialTask) return undefined;
      const task = rule.editorialTask(finding, ctx);
      return task ? { ruleId: rule.id, task } : undefined;
    })
    .filter((t): t is { ruleId: string; task: EditorialTask } => t !== undefined);
}

/** Groups tasks by the file they write to — an artifact can have more than one editorial finding. */
function groupByFilePath(
  tasks: readonly { ruleId: string; task: EditorialTask }[],
): Map<string, { ruleId: string; task: EditorialTask }[]> {
  const groups = new Map<string, { ruleId: string; task: EditorialTask }[]>();
  for (const item of tasks) {
    const group = groups.get(item.task.filePath) ?? [];
    group.push(item);
    groups.set(item.task.filePath, group);
  }
  return groups;
}

/**
 * Runs every task targeting ONE file in sequence — required because each task reads the file
 * fresh and writes the whole thing back. Two tasks for the same file (e.g. when-to-use-quality
 * and body-density both firing on one skill) running concurrently would race: the second task's
 * "before" snapshot is taken before the first task's write lands, so its write clobbers the
 * first task's change instead of building on it. Different files have no such dependency and run
 * in parallel via Promise.all below.
 */
async function runFileChain(
  items: readonly { ruleId: string; task: EditorialTask }[],
  modelClient: EditorialModelClient,
): Promise<EditorialResult[]> {
  const results: EditorialResult[] = [];
  for (const { ruleId, task } of items) {
    // Intentional sequential await — same file, must serialize (see this function's header).
    results.push(await runOneEditorialTask(ruleId, task, modelClient));
  }
  return results;
}

/**
 * Runs every editorial-rule finding through the model and its rails. Tasks for different files
 * run concurrently; tasks that share a file are chained (see runFileChain) so they can't race.
 */
export async function runEditorialFindings(
  findings: readonly ConformanceFinding[],
  ctx: ConformanceContext,
  modelClient: EditorialModelClient = defaultEditorialModelClient,
): Promise<EditorialResult[]> {
  const tasks = buildEditorialTasks(findings, ctx);
  const chains = await Promise.all(
    [...groupByFilePath(tasks).values()].map(items => runFileChain(items, modelClient)),
  );
  return chains.flat();
}
