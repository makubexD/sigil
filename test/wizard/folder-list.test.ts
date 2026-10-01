/**
 * The folder picker lists the folders around the user so they choose one instead of typing a path
 * from memory. These tests cover the pure parts: what is listed and in which order, where the
 * browser starts, and how a typed path is cleaned up and checked.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  browseStart,
  checkFolderInput,
  folderOptions,
  listSubfolders,
  resolveFolderInput,
  FOLDER_CHOICE,
} from '../../dist-cli/wizard/folder-list';
import { withTempDir } from '../helpers/temp-dir';

const mk = (...parts: string[]): string => {
  const dir = path.join(...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

describe('listSubfolders', () => {
  it('should list project folders first, then the rest alphabetically', () => {
    withTempDir(dir => {
      mk(dir, 'zeta');
      mk(dir, 'alpha');
      fs.writeFileSync(path.join(mk(dir, 'shop'), 'package.json'), '{}');
      const names = listSubfolders(dir).map(f => f.name);
      assert.deepEqual(names, ['shop', 'alpha', 'zeta']);
    });
  });

  it('should hide dot-folders, node_modules and plain files', () => {
    withTempDir(dir => {
      mk(dir, '.hidden');
      mk(dir, 'node_modules');
      mk(dir, 'visible');
      fs.writeFileSync(path.join(dir, 'file.txt'), '');
      assert.deepEqual(
        listSubfolders(dir).map(f => f.name),
        ['visible'],
      );
    });
  });

  it('should name the targets a folder is already set up for', () => {
    withTempDir(dir => {
      mk(dir, 'app', '.claude');
      const [app] = listSubfolders(dir);
      assert.deepEqual(app?.targets, ['claude']);
    });
  });
});

describe('folderOptions', () => {
  it('should offer use, up, type and back before the folders', () => {
    withTempDir(dir => {
      const sub = mk(dir, 'child');
      const values = folderOptions(sub, listSubfolders(sub)).map(o => o.value);
      assert.deepEqual(values, [
        FOLDER_CHOICE.use,
        FOLDER_CHOICE.up,
        FOLDER_CHOICE.type,
        FOLDER_CHOICE.back,
      ]);
    });
  });

  it('should not offer "up" at the top of a drive', () => {
    const root = path.parse(process.cwd()).root;
    const values = folderOptions(root, []).map(o => o.value);
    assert.ok(!values.includes(FOLDER_CHOICE.up));
  });

  it('should label a project folder as a project and give folders their path as the value', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(mk(dir, 'shop'), 'package.json'), '{}');
      const option = folderOptions(dir, listSubfolders(dir)).find(o => o.label.startsWith('shop'));
      assert.equal(option?.value, path.join(dir, 'shop'));
      assert.match(option?.hint ?? '', /project/);
    });
  });
});

describe('browseStart', () => {
  it('should start at the parent, where sibling projects are', () => {
    withTempDir(dir => {
      const child = mk(dir, 'app');
      assert.equal(browseStart(child, '/nowhere/home'), dir);
    });
  });

  it('should start in place at the home folder', () => {
    withTempDir(dir => assert.equal(browseStart(dir, dir), dir));
  });

  it('should start in place at the top of a drive', () => {
    const root = path.parse(process.cwd()).root;
    assert.equal(browseStart(root, '/nowhere/home'), root);
  });
});

describe('resolveFolderInput', () => {
  it('should resolve a relative path against the folder being browsed', () => {
    assert.equal(
      resolveFolderInput('sub', path.resolve('/base'), '/home'),
      path.resolve('/base', 'sub'),
    );
  });

  it('should strip the quotes a pasted path often has', () => {
    const base = path.resolve('/base');
    assert.equal(resolveFolderInput('"sub"', base, '/home'), path.join(base, 'sub'));
    assert.equal(resolveFolderInput("'sub'", base, '/home'), path.join(base, 'sub'));
  });

  it('should expand ~ to the home folder', () => {
    const home = path.resolve('/home/me');
    assert.equal(resolveFolderInput('~', '/base', home), home);
    assert.equal(resolveFolderInput('~/work', '/base', home), path.join(home, 'work'));
  });
});

describe('checkFolderInput', () => {
  it('should accept an existing folder', () => {
    withTempDir(dir => assert.equal(checkFolderInput(dir, dir, '/home'), undefined));
  });

  it('should say when there is no folder at the path', () => {
    withTempDir(dir =>
      assert.match(checkFolderInput('missing', dir, '/home') ?? '', /No folder at .*missing/),
    );
  });

  it('should say when the path is a file', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, 'a.txt'), '');
      assert.match(checkFolderInput('a.txt', dir, '/home') ?? '', /file, not a folder/);
    });
  });

  it('should ask for a path when the input is empty', () => {
    withTempDir(dir => assert.match(checkFolderInput('  ', dir, '/home') ?? '', /Enter a folder/));
  });
});
