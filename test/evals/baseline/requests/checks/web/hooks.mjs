// Module hooks that let node import the project a run left behind as a bundler would:
// - `.ts`, `.tsx` and `.jsx` under the project are transpiled (JSX, decorators) with this repo's
//   TypeScript; types are not checked;
// - a relative import may leave its extension out;
// - a bare import (`react`) that the project cannot resolve, having no `node_modules`, resolves in
//   the grader's own package folder, as does every bare import of the grader itself;
// - a project file imported with a `?query` is a fresh copy of the module, as after a page reload;
// - `import.meta.env` (Vite) reads `globalThis.__ENV__`; a style or image import is an empty module.
/* global URL */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
const ASSET = /\.(css|scss|svg|png|jpg|gif|woff2?)(\?.*)?$/;
const isFile = url => {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
};

export function installHooks({ project, deps }) {
  const projectUrl = pathToFileURL(project).href;
  const anchor = pathToFileURL(join(deps, 'anchor.mjs')).href;
  const own = url => url.startsWith(projectUrl) && !url.includes('/node_modules/');
  globalThis.__ENV__ ??= { MODE: 'production', PROD: true, DEV: false, BASE_URL: '/' };

  registerHooks({
    resolve(specifier, context, next) {
      const parent = context.parentURL ?? '';
      if (ASSET.test(specifier))
        return { url: 'data:text/javascript,export default ""', shortCircuit: true };
      if (own(parent) && /^\.{1,2}\//.test(specifier)) {
        const target = new URL(specifier, parent).href;
        const swapped = target.replace(/\.js$/, '.ts');
        for (const candidate of [...EXTENSIONS.map(ext => target + ext), swapped, `${swapped}x`]) {
          if (isFile(candidate)) return { url: candidate, shortCircuit: true };
        }
      }
      if (own(parent) && specifier.startsWith('@/')) {
        const target = pathToFileURL(join(project, 'src', specifier.slice(2))).href;
        for (const ext of EXTENSIONS) {
          if (isFile(target + ext)) return { url: target + ext, shortCircuit: true };
        }
      }
      try {
        return next(specifier, context);
      } catch (error) {
        if (/^[a-z@]/i.test(specifier) && !specifier.startsWith('node:'))
          return next(specifier, { ...context, parentURL: anchor });
        throw error;
      }
    },
    load(url, context, next) {
      if (!own(url) || !/\.(tsx?|jsx)(\?.*)?$/.test(url)) return next(url, context);
      const fileName = fileURLToPath(url.replace(/\?.*$/, ''));
      const source = readFileSync(fileName, 'utf8').replaceAll(
        'import.meta.env',
        'globalThis.__ENV__',
      );
      const { outputText } = ts.transpileModule(source, {
        fileName,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          experimentalDecorators: true,
          useDefineForClassFields: false,
          verbatimModuleSyntax: false,
        },
      });
      return { format: 'module', source: outputText, shortCircuit: true };
    },
  });
}

/** Whether `file` (relative to the project) exists. */
export const has = (project, file) => existsSync(join(project, file));
