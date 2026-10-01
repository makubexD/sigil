/**
 * Pretends the process has a terminal so code gated on `isInteractiveTTY()` takes its guided path.
 * Always call the returned `restore()` in a `finally` block.
 */
export function fakeTTY(): () => void {
  const streams = [process.stdin, process.stdout] as unknown as Array<{ isTTY?: boolean }>;
  const originals = streams.map(stream => Object.getOwnPropertyDescriptor(stream, 'isTTY'));
  for (const stream of streams) {
    Object.defineProperty(stream, 'isTTY', { value: true, configurable: true });
  }
  return () => {
    streams.forEach((stream, index) => {
      const original = originals[index];
      if (original) Object.defineProperty(stream, 'isTTY', original);
      else delete stream.isTTY;
    });
  };
}
