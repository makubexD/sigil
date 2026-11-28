// What the command-line graders share: a stock file in a temp folder, one run of the project's
// `bin/depot.mjs`, and a conversation with it when it asks questions.
/* global process, setTimeout, clearTimeout, URL */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PRELOAD = new URL('./tty-preload.mjs', import.meta.url).href;

export const STOCK = {
  store: { name: 'Corner Shop', currency: 'EUR' },
  warehouses: [{ name: 'main' }, { name: 'annex' }],
  items: [
    { id: 'i1', name: 'Kettle', qty: 3, warehouse: 'main' },
    { id: 'i2', name: 'Toaster', qty: 0, warehouse: 'main' },
    { id: 'i3', name: 'Lamp', qty: 12, warehouse: 'annex' },
    { id: 'i4', name: 'Fuse', qty: 0, warehouse: 'annex' },
  ],
};

/** Escape sequences out, so a prompt reads as the text a person sees. */
// eslint-disable-next-line no-control-regex
export const plain = text => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');

/** A fresh folder with a stock file (when `db` is given) and nowhere a token was saved yet. */
export function workspace(db) {
  const dir = mkdtempSync(path.join(tmpdir(), 'depot-check-'));
  const file = path.join(dir, 'depot.json');
  if (db) writeFileSync(file, JSON.stringify(db, null, 2));
  return { dir, file, credentials: path.join(dir, 'credentials') };
}

/** The stock file as data, or null when there is none. */
export const read = file => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);

/** A saved token, or null. */
export const token = place =>
  existsSync(place.credentials) ? readFileSync(place.credentials, 'utf8').trim() : null;

function start(args, { place, tty, env }) {
  const clean = { ...process.env };
  for (const name of ['NO_COLOR', 'FORCE_COLOR', 'CI', 'DEPOT_SYNC_TOKEN', 'NODE_OPTIONS'])
    delete clean[name];
  return spawn(
    process.execPath,
    [...(tty ? ['--import', PRELOAD] : []), 'bin/depot.mjs', ...args],
    {
      cwd: process.cwd(),
      env: {
        ...clean,
        TERM: 'xterm-256color',
        DEPOT_DB: place.file,
        DEPOT_CREDENTIALS: place.credentials,
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
}

/**
 * One run. `input` is typed and the input closed; `input: null` leaves it open and silent, as a CI
 * runner with no terminal does. A run still going after `timeout` is stopped and marked `hung`.
 */
export function run(
  args,
  { db, place = workspace(db), tty = false, env = {}, input = '', timeout = 6000 } = {},
) {
  return new Promise(resolve => {
    const child = start(args, { place, tty, env });
    const result = { stdout: '', stderr: '', hung: false, place, file: place.file };
    child.stdout.on('data', chunk => (result.stdout += chunk));
    child.stderr.on('data', chunk => (result.stderr += chunk));
    child.stdin.on('error', () => {});
    if (input !== null) child.stdin.end(input);
    const watchdog = setTimeout(() => {
      result.hung = true;
      child.kill();
    }, timeout);
    child.on('close', code => {
      clearTimeout(watchdog);
      resolve({ ...result, code });
    });
  });
}

const QUESTIONS = [
  ['confirm', /\[y\/n\]|\(y\/n\)|\by\/n\b|yes\/no/i],
  ['token', /token/i],
  ['low', /low|threshold/i],
  ['currency', /currency/i],
  ['name', /name/i],
  ['confirm', /create|proceed|confirm|continue|go ahead|look(s)? (right|good|ok)/i],
];

/** Which question the program is waiting on: its last line decides, then everything since the last answer. */
function question(pending) {
  const lines = plain(pending)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  for (const text of [lines.at(-1) ?? '', lines.join('\n')])
    for (const [kind, pattern] of QUESTIONS) if (pattern.test(text)) return kind;
  return 'other';
}

/**
 * A run on a terminal that answers what it is asked. `answers` maps a kind of question (name,
 * currency, low, token, confirm) to what is typed, or to a list typed in order, the last repeated.
 * Anything else gets Enter. `quitAfter` closes the input after that many answers.
 */
export function converse(
  args,
  { db, place = workspace(db), answers = {}, quitAfter, env = {}, timeout = 12000 } = {},
) {
  const typed = {
    name: 'Corner Shop',
    currency: 'EUR',
    low: '7',
    token: '',
    confirm: 'y',
    other: '',
    ...answers,
  };
  return new Promise(resolve => {
    const child = start(args, { place, tty: true, env });
    const result = {
      stdout: '',
      stderr: '',
      out: '',
      asked: [],
      hung: false,
      place,
      file: place.file,
    };
    let pending = '';
    let idle;
    let open = true;
    const answer = () => {
      if (!open || !pending.trim()) return;
      const kind = question(pending);
      const given = result.asked.filter(asked => asked === kind).length;
      const list = [typed[kind]].flat();
      let text = list[Math.min(given, list.length - 1)];
      // A numbered menu: pick the number in front of the wanted choice.
      const option = new RegExp(`(\\d+)\\s*[).:\\]]\\s*${text}\\b`).exec(plain(pending));
      if (kind === 'currency' && option) text = option[1];
      result.asked.push(kind);
      pending = '';
      if (result.asked.length > 14) return child.kill();
      const quit = quitAfter !== undefined && result.asked.length >= quitAfter;
      if (quit) open = false;
      // Typed as a keyboard does it, a key at a time and Return last: code that reads raw keys
      // must see what a terminal would send.
      const keys = [...text, '\r'];
      const type = () => {
        if (child.exitCode !== null) return;
        child.stdin.write(keys.shift());
        if (keys.length) setTimeout(type, 3);
        else if (quit) child.stdin.end();
      };
      type();
    };
    const heard = stream => chunk => {
      result[stream] += chunk;
      result.out += chunk;
      pending += chunk;
      clearTimeout(idle);
      idle = setTimeout(answer, 300);
    };
    child.stdout.on('data', heard('stdout'));
    child.stderr.on('data', heard('stderr'));
    child.stdin.on('error', () => {});
    const watchdog = setTimeout(() => {
      result.hung = true;
      child.kill();
    }, timeout);
    child.on('close', code => {
      open = false;
      clearTimeout(idle);
      clearTimeout(watchdog);
      resolve({ ...result, out: plain(result.out), code });
    });
  });
}
