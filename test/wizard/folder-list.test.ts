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
  checkNewFolderName,
  classifyFolderInput,
  folderInputError,
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
        FOLDER_CHOICE.create,
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

describe('classifyFolderInput', () => {
  it('should accept an existing folder', () => {
    withTempDir(dir => assert.equal(classifyFolderInput(dir, dir, '/home').status, 'ok'));
  });

  it('should call a folder that does not exist yet "missing" and resolve it', () => {
    withTempDir(dir => {
      const found = classifyFolderInput('new-app', dir, '/home');
      assert.equal(found.status, 'missing');
      assert.equal(found.target, path.join(dir, 'new-app'));
    });
  });

  it('should call a path that is a file "file"', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, 'a.txt'), '');
      assert.equal(classifyFolderInput('a.txt', dir, '/home').status, 'file');
    });
  });

  it('should call a path under a file "blocked", because it can never be created', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, 'a.txt'), '');
      assert.equal(classifyFolderInput('a.txt/inner', dir, '/home').status, 'blocked');
    });
  });

  it('should call blank input "empty"', () => {
    withTempDir(dir => assert.equal(classifyFolderInput('  ', dir, '/home').status, 'empty'));
  });
});

describe('folderInputError', () => {
  it('should let an existing or creatable folder through', () => {
    withTempDir(dir => {
      assert.equal(folderInputError(classifyFolderInput(dir, dir, '/home')), undefined);
      assert.equal(folderInputError(classifyFolderInput('new-app', dir, '/home')), undefined);
    });
  });

  it('should explain empty input, a file, and a blocked path', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, 'a.txt'), '');
      const message = (input: string): string =>
        folderInputError(classifyFolderInput(input, dir, '/home')) ?? '';
      assert.match(message(' '), /Enter a folder/);
      assert.match(message('a.txt'), /file, not a folder/);
      assert.match(message('a.txt/inner'), /part of that path is a file/);
    });
  });
});

describe('checkNewFolderName', () => {
  it('should accept a plain name', () => {
    withTempDir(dir => assert.equal(checkNewFolderName('my-app', dir), undefined));
  });

  it('should reject blank names, paths, dots and characters Windows forbids', () => {
    withTempDir(dir => {
      assert.match(checkNewFolderName('  ', dir) ?? '', /Enter a name/);
      for (const bad of ['a/b', 'a\\b', '..', '.', 'a:b', 'a*b', 'a?b', 'a|b']) {
        assert.match(checkNewFolderName(bad, dir) ?? '', /name, not a path/, bad);
      }
    });
  });

  it('should reject a name that already exists', () => {
    withTempDir(dir => {
      mk(dir, 'taken');
      assert.match(checkNewFolderName('taken', dir) ?? '', /already exists/);
    });
  });
});

describe('listSubfolders in a huge folder', () => {
  it('should check the first 200 folders for project markers and list the rest unchecked', () => {
    withTempDir(dir => {
      for (let i = 0; i < 205; i++) mk(dir, `d${String(i).padStart(3, '0')}`);
      fs.writeFileSync(path.join(dir, 'd000', 'package.json'), '{}');
      fs.writeFileSync(path.join(dir, 'd204', 'package.json'), '{}');
      const found = listSubfolders(dir);
      assert.equal(found.length, 205);
      assert.equal(found[0]?.name, 'd000'); // a project, sorted first
      assert.equal(found.find(f => f.name === 'd204')?.isProject, false); // past the cap
    });
  });
});

describe('listSubfolders and links', () => {
  it('should list a link that points at a folder', () => {
    withTempDir(dir => {
      const real = mk(dir, 'real');
      try {
        fs.symlinkSync(real, path.join(dir, 'linked'), 'junction');
      } catch {
        return; // links need privileges on some machines
      }
      assert.ok(listSubfolders(dir).some(f => f.name === 'linked'));
    });
  });
});

describe('resolveFolderInput on Windows drives', { skip: process.platform !== 'win32' }, () => {
  it('should treat a bare drive letter as the root of that drive', () => {
    assert.equal(resolveFolderInput('D:', 'C:\\base', 'C:\\home'), 'D:\\');
  });
});
