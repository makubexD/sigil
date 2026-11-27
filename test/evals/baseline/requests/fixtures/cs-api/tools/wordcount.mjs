// Prints how many words the file given as the only argument holds.
import { readFileSync } from 'node:fs';

const [file, ...rest] = process.argv.slice(2);
if (file === undefined || rest.length > 0) {
  console.error('usage: node wordcount.mjs <file>');
  process.exit(2);
}
console.log(readFileSync(file, 'utf8').split(/\s+/).filter(Boolean).length);
