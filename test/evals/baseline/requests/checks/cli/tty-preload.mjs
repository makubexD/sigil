// Loaded with `node --import` in front of the program under test: makes stdin, stdout and stderr look
// like a terminal while they are still the pipes the grader reads and writes (cli/kit.mjs).
/* global process */
import tty from 'node:tty';

for (const stream of [process.stdin, process.stdout, process.stderr])
  Object.defineProperty(stream, 'isTTY', { value: true, configurable: true });

process.stdin.setRawMode ??= function setRawMode() {
  return this;
};

for (const stream of [process.stdout, process.stderr]) {
  stream.columns ??= 80;
  stream.rows ??= 24;
  // The real rule, so NO_COLOR, FORCE_COLOR and TERM still decide.
  stream.getColorDepth ??= env =>
    tty.WriteStream.prototype.getColorDepth.call(stream, env ?? process.env);
  stream.hasColors ??= (count, env) =>
    2 ** stream.getColorDepth(typeof count === 'object' ? count : env) >=
    (typeof count === 'number' ? count : 16);
}

tty.isatty = () => true;
