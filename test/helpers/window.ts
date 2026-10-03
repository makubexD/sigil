/**
 * A fake terminal window size, so width-sensitive output can be tested at any size and zoom level.
 * `process.stdout.columns` / `rows` are undefined when output is not a terminal, which is what turns
 * all fitting off; this sets them for the length of `fn` and puts them back, even when it throws.
 */

export interface WindowSize {
  columns: number;
  rows?: number;
}

type Dimension = 'columns' | 'rows';

function setDimension(name: Dimension, value: number | undefined): () => void {
  const had = Object.getOwnPropertyDescriptor(process.stdout, name);
  Object.defineProperty(process.stdout, name, { value, configurable: true, writable: true });
  return () => {
    if (had) Object.defineProperty(process.stdout, name, had);
    else delete (process.stdout as { columns?: number; rows?: number })[name];
  };
}

/**
 * A real terminal's `_refreshSize` would put the real size back over the fake one, so the fake window
 * also silences it (a pipe has none, which is the common case in CI).
 */
function silenceRefresh(): () => void {
  const had = Object.getOwnPropertyDescriptor(process.stdout, '_refreshSize');
  Object.defineProperty(process.stdout, '_refreshSize', {
    value: () => {},
    configurable: true,
    writable: true,
  });
  return () => {
    if (had) Object.defineProperty(process.stdout, '_refreshSize', had);
    else delete (process.stdout as unknown as Record<string, unknown>)['_refreshSize'];
  };
}

/** Runs `fn` with the window set to `size`. */
export async function withWindow<T>(size: WindowSize, fn: () => Promise<T> | T): Promise<T> {
  const restoreRefresh = silenceRefresh();
  const restoreColumns = setDimension('columns', size.columns);
  const restoreRows = setDimension('rows', size.rows);
  try {
    return await fn();
  } finally {
    restoreRows();
    restoreColumns();
    restoreRefresh();
  }
}
