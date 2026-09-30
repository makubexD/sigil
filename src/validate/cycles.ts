/**
 * §3: DFS-based cycle detector for the `extends` graph. Adds an error for each cycle found.
 */
import type { LoadedCatalog, ValidationError } from '../types';

/** Shared context for the extends-cycle DFS below. */
interface CycleCtx {
  readonly catalog: LoadedCatalog;
  readonly color: Map<string, 'white' | 'grey' | 'black'>;
  readonly errors: ValidationError[];
}

/** Reports a found cycle: the artifact that re-enters the DFS stack. */
function reportCycle(ctx: CycleCtx, id: string, stack: string[]): void {
  const artifact = ctx.catalog.byId.get(id);
  const cycleStr = [...stack.slice(stack.indexOf(id)), id].join(' → ');
  ctx.errors.push({
    artifactId: id,
    filePath: artifact?.filePath ?? '',
    error: `Cycle in extends graph: ${cycleStr}`,
  });
}

function visitForCycle(ctx: CycleCtx, id: string, stack: string[]): void {
  const c = ctx.color.get(id);
  if (c === 'black') return;
  if (c === 'grey') return reportCycle(ctx, id, stack);

  ctx.color.set(id, 'grey');
  const artifact = ctx.catalog.byId.get(id);
  const parents = (artifact?.frontmatter.extends as string[] | undefined) ?? [];
  for (const parentId of parents) {
    visitForCycle(ctx, parentId, [...stack, id]);
  }
  ctx.color.set(id, 'black');
}

export function detectExtendsCycles(catalog: LoadedCatalog, errors: ValidationError[]): void {
  // 'white' = unvisited, 'grey' = in current DFS stack, 'black' = done
  const color = new Map<string, 'white' | 'grey' | 'black'>();
  for (const a of catalog.artifacts) color.set(a.id, 'white');
  const ctx: CycleCtx = { catalog, color, errors };

  for (const artifact of catalog.artifacts) {
    if (color.get(artifact.id) === 'white') {
      visitForCycle(ctx, artifact.id, []);
    }
  }
}
