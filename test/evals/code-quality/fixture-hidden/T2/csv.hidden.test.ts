import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.ts';

test('splits plain records on LF and CRLF', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,2,3'), [
    ['a', 'b', 'c'],
    ['1', '2', '3'],
  ]);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('returns [] for empty input and drops only the final line break', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a\n'), [['a']]);
});

test('keeps empty fields', () => {
  assert.deepEqual(parseCsv(',a,,\n'), [['', 'a', '', '']]);
});

test('reads quoted fields with commas, escaped quotes and line breaks', () => {
  assert.deepEqual(parseCsv('"x, y","say ""hi""","line1\nline2"\r\nz'), [
    ['x, y', 'say "hi"', 'line1\nline2'],
    ['z'],
  ]);
});

test('reads an empty quoted field', () => {
  assert.deepEqual(parseCsv('"",a'), [['', 'a']]);
});

test('throws SyntaxError on an unterminated quote', () => {
  assert.throws(() => parseCsv('a,"b\n1,2'), SyntaxError);
});

test('parses 100k records quickly', () => {
  const text = Array.from({ length: 100_000 }, (_, i) => `${i},"name ${i}",x`).join('\n');
  const started = performance.now();
  assert.equal(parseCsv(text).length, 100_000);
  assert.ok(performance.now() - started < 3000, 'took longer than 3 s');
});
