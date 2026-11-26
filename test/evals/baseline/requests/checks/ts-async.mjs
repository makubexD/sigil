// Hidden behaviour tests for requests/ts-async.json (README, Grading).
//
//   node ts-async.mjs <case>     (cwd: the project a run left behind)
//
// Each case imports the module the request asked for and exits 0 when the behaviour holds.
/* global process, console, setTimeout */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const load = file => import(pathToFileURL(join(process.cwd(), 'src', file)).href);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const CALL_MS = 150;
const N = 8;
// Eight 150 ms calls take 1200 ms one after another and about 150 ms together.
const TOGETHER_MS = 700;
const ids = Array.from({ length: N }, (_, i) => `u${i}`);
const users = ids.map(id => ({ id, email: `${id}@example.test` }));
const fetchProfile = async id => {
  await sleep(CALL_MS);
  return { id, name: `Name ${id}` };
};
const send = async user => {
  await sleep(CALL_MS);
  if (user.id === 'u2' || user.id === 'u5') throw new Error(`mailbox full: ${user.id}`);
};
const timed = async call => {
  const start = Date.now();
  await call();
  return Date.now() - start;
};

const CASES = {
  async 'profiles-works'() {
    const { loadProfiles } = await load('profiles.ts');
    const profiles = await loadProfiles(ids, fetchProfile);
    assert.deepEqual(
      profiles.map(profile => profile.id),
      ids,
    );
  },
  async 'profiles-together'() {
    const { loadProfiles } = await load('profiles.ts');
    const ms = await timed(() => loadProfiles(ids, fetchProfile));
    assert.ok(ms < TOGETHER_MS, `took ${ms} ms: one lookup at a time`);
  },
  async 'config-works'() {
    const { loadConfig, ConfigError } = await load('config.ts');
    mkdirSync('tmp-check', { recursive: true });
    writeFileSync('tmp-check/ok.json', '{"region":"eu-west-1","retries":2}');
    assert.deepEqual(await loadConfig('tmp-check/ok.json'), { region: 'eu-west-1', retries: 2 });
    await assert.rejects(loadConfig('tmp-check/missing.json'), ConfigError);
    writeFileSync('tmp-check/bad.json', '{"region":');
    await assert.rejects(loadConfig('tmp-check/bad.json'), error => {
      assert.ok(error instanceof ConfigError);
      assert.match(error.message, /bad\.json/);
      return true;
    });
  },
  async 'config-keeps-cause'() {
    const { loadConfig } = await load('config.ts');
    mkdirSync('tmp-check', { recursive: true });
    writeFileSync('tmp-check/bad.json', '{"region":');
    for (const file of ['tmp-check/missing.json', 'tmp-check/bad.json']) {
      const error = await loadConfig(file).then(
        () => undefined,
        e => e,
      );
      assert.ok(error?.cause instanceof Error, `${file}: the original error is lost`);
    }
  },
  async 'visit-works'() {
    const { recordVisit, saved } = await load('visits.ts');
    assert.equal(recordVisit('ada'), 1);
    assert.equal(recordVisit('ada'), 2);
    await sleep(200);
    assert.equal(saved.get('ada'), 2);
  },
  async 'visit-failure-handled'() {
    const { recordVisit, store } = await load('visits.ts');
    let unhandled = false;
    process.on('unhandledRejection', () => {
      unhandled = true;
    });
    store.save = async () => {
      throw new Error('database is down');
    };
    recordVisit('ada');
    await sleep(200);
    assert.equal(unhandled, false, 'a failed save crashes the process');
  },
  async 'logs-works'() {
    const { countErrors } = await load('logs.ts');
    mkdirSync('tmp-check', { recursive: true });
    const lines = Array.from({ length: 5000 }, (_, i) =>
      i % 50 === 0 ? `2026-01-01 ERROR job ${i} failed` : `2026-01-01 INFO job ${i} ok`,
    );
    writeFileSync('tmp-check/app.log', lines.join('\n'));
    assert.equal(await countErrors('tmp-check/app.log'), 100);
  },
  async 'notify-works'() {
    const { notifyAll } = await load('notify.ts');
    const sent = [];
    const failed = await notifyAll(users, async user => {
      sent.push(user.id);
      await send(user);
    });
    assert.deepEqual([...sent].sort(), ids);
    assert.deepEqual([...failed].sort(), ['u2', 'u5']);
  },
  async 'notify-together'() {
    const { notifyAll } = await load('notify.ts');
    const ms = await timed(() => notifyAll(users, send));
    assert.ok(ms < TOGETHER_MS, `took ${ms} ms: one send at a time`);
  },
  async 'initials-works'() {
    const { initials } = await load('names.ts');
    assert.equal(initials('ada lovelace'), 'AL');
    assert.equal(initials('Grace'), 'G');
  },
};

const run = CASES[process.argv[2]];
if (!run) {
  console.error(`unknown case ${process.argv[2]}`);
  process.exit(2);
}
try {
  await run();
  process.exit(0);
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exit(1);
}
