/**
 * A seeded random walk through the home menu with the real handlers. Each seed picks a starting
 * folder (kind, tools set up, installs, damaged record) and a way of answering (Enter every time,
 * the recommended entry every time, or anything the screen offers), then takes a dozen steps.
 *
 * It checks the properties that were each fixed by hand before, so the next loop is found by a
 * failing seed instead of by a user. A failure prints the seed and the steps; set
 * SIGIL_WALK_SEED=<n> to replay just that one. SIGIL_WALK_SEEDS sets how many seeds run.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { detectedTargetsIn } from '../../dist-cli/project-context';
import { ENTER, createRecorder, mockClack } from '../helpers/clack-mock';
import type { MockAnswer, MockDriver, PromptRecord, Recorder } from '../helpers/clack-mock';
import { fakeTTY } from '../helpers/tty';
import { withTempDirAsync } from '../helpers/temp-dir';
import {
  CANCEL,
  CATALOG_DIR,
  GUARD,
  INIT_QUESTION,
  PACKS_FILE,
  PICKER,
  TOOL_QUESTION,
  assertGuttered,
  assertOneFrame,
  assertSingleLine,
  isMenu,
  isNext,
  makeCheckout,
  makeProject,
  makeTools,
  shownFolder,
  snapshot,
} from '../helpers/home-flow';
import { runHome } from '../../dist-cli/wizard/home';
import { defaultHomeDeps } from '../../dist-cli/wizard/home-actions';

const STEPS = 12;
const SEEDS = Number(process.env['SIGIL_WALK_SEEDS'] ?? 60);
const ONLY_SEED = process.env['SIGIL_WALK_SEED'];

type Folder = 'project' | 'empty' | 'catalog' | 'home';
type Installs = 'none' | 'healthy' | 'missing';
type Policy = 'enter' | 'recommended' | 'random';

interface Start {
  folder: Folder;
  tools: string[];
  installs: Installs;
  damaged: boolean;
  policy: Policy;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const pick = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;

function randomStart(rand: Rand): Start {
  const installs = pick(rand, ['none', 'none', 'healthy', 'missing'] as const);
  const tools = pick(rand, [[], ['claude'], ['copilot'], ['claude', 'copilot']]);
  return {
    folder: pick(rand, ['project', 'empty', 'catalog', 'home'] as const),
    tools: installs !== 'none' && !tools.includes('claude') ? ['claude', ...tools] : tools,
    installs,
    damaged: rand() < 0.15,
    policy: pick(rand, ['enter', 'recommended', 'random'] as const),
  };
}

/** Builds the starting folder; returns it. */
async function build(root: string, start: Start): Promise<string> {
  const dir = path.join(root, 'work');
  if (start.folder === 'empty') makeTools(dir, start.tools);
  else makeProject(dir, start.tools);
  if (start.folder === 'catalog') makeCheckout(dir);
  makeProject(path.join(root, 'other'));
  if (start.damaged) {
    fs.mkdirSync(path.join(dir, '.sigil'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.sigil/manifest.json'), '{ not json');
  } else if (start.installs !== 'none') {
    await runAdd(['rule:shared/git'], {
      projectDir: dir,
      catalogDir: CATALOG_DIR,
      packs: PACKS_FILE,
      target: 'claude',
      deps: false,
      dryRun: false,
      interactive: false,
      yes: true,
      overwrite: false,
      settingsLocal: false,
    });
    if (start.installs === 'missing') fs.rmSync(path.join(dir, '.claude/rules/shared-git.md'));
  }
  return dir;
}

/** What one menu looked like: the header and every entry, marks included. */
const signature = (prompt: PromptRecord, rec: Recorder): string =>
  `${rec.notes.filter(n => n.title === 'This folder').pop()?.body}||${prompt.options.map(o => o.label).join('|')}`;

interface Step {
  picked: string;
  recommended: boolean;
  before: string;
  /** The action did not run to the end (cancelled, declined, or the folder question intervened). */
  incomplete: boolean;
  /** The risky-folder question was shown, so the action may legitimately not have run. */
  guarded: boolean;
}

/** Answers prompts and keeps the evidence the properties are checked against. */
class Walker {
  readonly trace: string[] = [];
  readonly violations: string[] = [];
  private menus = 0;
  private step: Step | undefined;
  guardedGo = false;
  /** The folder the user was warned about and went ahead in; it must not be nagged about again. */
  private wentAheadIn: string | undefined;
  /** The folder picked from the risky-folder question during this step, if any. */
  private movedTo: string | undefined;

  constructor(
    private readonly start: Start,
    private readonly rand: Rand,
    private readonly root: string,
    private readonly rec: Recorder,
    private readonly dir: string,
    private readonly before: string[],
  ) {}

  readonly driver: MockDriver = prompt => {
    const answer = this.answerFor(prompt);
    this.trace.push(`${prompt.message.slice(0, 48)} -> ${String(answer).slice(0, 40)}`);
    return answer;
  };

  private answerFor(prompt: PromptRecord): MockAnswer {
    if (isMenu(prompt)) return this.menu(prompt);
    return isNext(prompt) ? this.next(prompt) : this.other(prompt);
  }

  /** Called when the run is over, to judge the last step too. */
  finish(): void {
    this.judge(undefined);
  }

  private menu(prompt: PromptRecord): MockAnswer {
    const now = signature(prompt, this.rec);
    this.checkAfterInit(prompt);
    this.judge(now);
    this.movedTo = undefined;
    this.checkNoNag(prompt);
    this.menus += 1;
    if (this.menus > STEPS || this.violations.length > 0) return 'quit';
    const answer = this.chooseEntry(prompt);
    const entry = prompt.options.find(o => o.value === answer);
    this.step = {
      picked: String(answer),
      recommended: /\(recommended\)/.test(entry?.label ?? ''),
      before: now,
      incomplete: false,
      guarded: false,
    };
    return answer;
  }

  /** The short "What next?" menu: Enter takes its first row; a random user may take any other. */
  private next(prompt: PromptRecord): MockAnswer {
    this.checkAfterInit(prompt);
    this.judge(signature(prompt, this.rec));
    this.movedTo = undefined;
    this.menus += 1;
    if (this.menus > STEPS || this.violations.length > 0) return 'quit';
    const first = prompt.options[0]?.value ?? 'quit';
    const usable = prompt.options.filter(o => o.value !== 'quit');
    const answer =
      this.start.policy === 'random' && this.rand() < 0.7 ? pick(this.rand, usable).value : first;
    this.step = {
      picked: answer,
      recommended: false,
      before: '',
      incomplete: false,
      guarded: false,
    };
    return answer;
  }

  /** After a set up that ran to the end, the short menu follows unless something more urgent is advised. */
  private checkAfterInit(prompt: PromptRecord): void {
    const step = this.step;
    if (!step || step.picked !== 'init' || step.incomplete) return;
    if (isNext(prompt)) return;
    const top = prompt.options[0];
    const urgent = top !== undefined && /(recommended)/.test(top.label) && top.value !== 'install';
    if (!urgent) this.violations.push('a finished set up was not followed by the short menu');
  }

  private checkNoNag(prompt: PromptRecord): void {
    const nag = prompt.options.some(
      o => o.value === 'change-folder' && /(recommended)/.test(o.label),
    );
    if (nag && this.wentAheadIn !== undefined && shownFolder(this.rec) === this.wentAheadIn) {
      this.violations.push('change-folder is recommended again in a folder the user chose to keep');
    }
  }

  private chooseEntry(prompt: PromptRecord): MockAnswer {
    const first = prompt.options[0]?.value ?? 'quit';
    if (this.start.policy === 'enter') return first;
    const recommended = prompt.options.find(o => /\(recommended\)/.test(o.label));
    if (this.start.policy === 'recommended' || this.rand() < 0.4)
      return recommended?.value ?? first;
    const usable = prompt.options.filter(
      o => !['quit', 'help', 'browse', 'search', 'new', 'edit', 'validate'].includes(o.value),
    );
    return pick(this.rand, usable).value;
  }

  private other(prompt: PromptRecord): MockAnswer {
    if (this.step) this.step.incomplete ||= true;
    if (GUARD.test(prompt.message)) return this.guard();
    if (PICKER.test(prompt.message)) return this.picker(prompt);
    if (prompt.message === INIT_QUESTION) return this.initQuestion(prompt);
    if (prompt.message.startsWith('Set the damaged install record')) return this.repair();
    if (TOOL_QUESTION.test(prompt.message)) this.checkToolQuestion();
    return CANCEL;
  }

  private guard(): MockAnswer {
    if (this.step) this.step.guarded = true;
    const folder = this.movedTo ?? shownFolder(this.rec);
    if (this.wentAheadIn !== undefined && folder === this.wentAheadIn) {
      this.violations.push('the risky-folder question was asked again in a folder the user kept');
    }
    if (this.start.policy !== 'random') return ENTER;
    const answer = pick(this.rand, ['move', 'move', 'go', 'back']);
    if (answer === 'go') {
      this.guardedGo = true;
      this.wentAheadIn = folder;
    }
    return answer;
  }

  /** Stays inside the scenario's own folders, so the walk can never write somewhere real. */
  private picker(prompt: PromptRecord): MockAnswer {
    const shown = prompt.message.split(' — ')[1] ?? '';
    const inside = path
      .resolve(shown)
      .toLowerCase()
      .startsWith(path.resolve(this.root).toLowerCase());
    const allowed = prompt.options.filter(
      o =>
        o.value === '::back' ||
        (inside &&
          (o.value === '::use' || (!o.value.startsWith('::') && !sameDir(o.value, this.dir)))),
    );
    if (!inside || sameDir(shown, this.dir)) return '::back';
    const value =
      this.start.policy === 'random'
        ? pick(this.rand, allowed).value
        : (prompt.options[0]?.value ?? '::back');
    if (value === '::use') {
      this.movedTo = shown; // the action now runs in this folder
      this.wentAheadIn = undefined; // a new folder gets its own warning
    }
    return value;
  }

  private initQuestion(prompt: PromptRecord): MockAnswer {
    if (this.start.policy !== 'random') {
      this.completedAnyway();
      return ENTER;
    }
    if (this.rand() < 0.2) return CANCEL;
    this.completedAnyway();
    return pick(this.rand, prompt.options).value;
  }

  private repair(): MockAnswer {
    if (this.start.policy !== 'random' || this.rand() < 0.7) {
      this.completedAnyway();
      return true;
    }
    return false;
  }

  /** A question that was answered and let the action finish does not make the step incomplete. */
  private completedAnyway(): void {
    if (this.step) this.step.incomplete = false;
  }

  private checkToolQuestion(): void {
    const folder = this.movedTo ?? shownFolder(this.rec);
    const tools = folder ? detectedTargetsIn(folder).length : 0;
    if (tools === 1)
      this.violations.push(`the tool question was asked in ${folder}, which has one tool`);
  }

  /** Checks the step that just ended against what the menu shows now (`undefined` at the end). */
  private judge(now: string | undefined): void {
    const step = this.step;
    this.step = undefined;
    const riskyUntouched =
      this.start.installs === 'none' &&
      !this.start.damaged &&
      ['catalog', 'home'].includes(this.start.folder);
    if (riskyUntouched && !this.guardedGo && !sameFiles(this.dir, this.before)) {
      this.violations.push(
        `files were written into the ${this.start.folder} folder without going ahead`,
      );
    }
    if (!step || now === undefined || !step.recommended || step.picked === 'change-folder') return;
    if (!step.incomplete && !step.guarded && now === step.before) {
      this.violations.push(
        `"${step.picked}" was recommended, ran, and the menu came back unchanged`,
      );
    }
  }
}

/** The walk may visit the scenario's other folders, never the starting one: that would hide writes. */
const sameDir = (a: string, b: string): boolean =>
  path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

const sameFiles = (dir: string, before: string[]): boolean =>
  snapshot(dir).join('\n') === before.join('\n');

async function walk(seed: number): Promise<void> {
  const rand = mulberry32(seed);
  const start = randomStart(rand);
  await withTempDirAsync(async root => {
    const dir = await build(root, start);
    const rec = createRecorder();
    const walker = new Walker(start, rand, root, rec, dir, snapshot(dir));
    const homeDir = start.folder === 'home' ? dir : '/nowhere/home';
    const restoreTTY = fakeTTY();
    const restore = mockClack(walker.driver, rec);
    const originals = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    };
    const capture = (...args: unknown[]): void => void rec.console.push(args.map(String).join(' '));
    Object.assign(console, { log: capture, info: capture, warn: capture, error: capture });
    try {
      await runHome(dir, { ...defaultHomeDeps(() => {}), homeDir });
      walker.finish();
      assertSingleLine(rec);
      assertOneFrame(rec);
      assertGuttered(rec);
    } catch (error) {
      walker.violations.push(`threw: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      Object.assign(console, originals);
      restore();
      restoreTTY();
    }
    assert.deepEqual(
      walker.violations,
      [],
      `seed ${seed}, ${JSON.stringify(start)}\n${walker.trace.join('\n')}`,
    );
  }, 'sigil-walk-');
}

describe('home menu random walk', () => {
  it(`should never loop, re-ask, or write into a risky folder (${ONLY_SEED ?? SEEDS} seeds)`, async () => {
    const seeds =
      ONLY_SEED === undefined
        ? Array.from({ length: SEEDS }, (_, i) => i + 1)
        : [Number(ONLY_SEED)];
    for (const seed of seeds) await walk(seed);
  });
});
