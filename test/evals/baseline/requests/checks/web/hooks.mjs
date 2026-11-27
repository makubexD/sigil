// Module hooks that let node import the project a run left behind as a bundler would:
// - `.ts`, `.tsx` and `.jsx` under the project are transpiled (JSX, decorators) with this repo's
//   TypeScript; types are not checked;
// - a relative import may leave its extension out;
// - a bare import (`react`) that the project cannot resolve, having no `node_modules`, resolves in
//   the grader's own package folder, as does every bare import of the grader itself;
// - a project file imported with a `?query` is a fresh copy of the module, as after a page reload;
// - an Angular `templateUrl` is inlined, and constructor parameter types are emitted as metadata;
// - `import.meta.env` (Vite) reads `globalThis.__ENV__`; a style or image import is an empty module.
/* global URL */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
const ASSET = /\.(css|scss|svg|png|jpg|gif|woff2?)(\?.*)?$/;
const MEMBER = String.raw`^([ \t]*)((?:(?:public|protected|private|readonly|override)\s+)*)([A-Za-z_$][\w$]*)\s*=\s*`;
/**
 * Angular reads `x = input()`, `model()` and `output()` at build time. Without the build, the same
 * members get the decorator the Angular CLI would add, so a parent or a test can bind them.
 */
function bindSignalMembers(source) {
  if (!/@(Component|Directive)\s*\(/.test(source)) return source;
  let found = false;
  const mark = (decorators, indent, modifiers, name) => {
    found = true;
    return `${decorators.map(text => `${indent}${text}\n`).join('')}${indent}${modifiers}${name} = `;
  };
  const out = source
    .replace(
      new RegExp(`${MEMBER}(?=input(\\.required)?\\s*[<(])`, 'gm'),
      (whole, indent, modifiers, name, required) =>
        mark(
          [`@__ngIn({ isSignal: true, alias: '${name}', required: ${Boolean(required)} })`],
          indent,
          modifiers,
          name,
        ),
    )
    .replace(
      new RegExp(`${MEMBER}(?=model(\\.required)?\\s*[<(])`, 'gm'),
      (whole, indent, modifiers, name, required) =>
        mark(
          [
            `@__ngIn({ isSignal: true, alias: '${name}', required: ${Boolean(required)} })`,
            `@__ngOut('${name}Change')`,
          ],
          indent,
          modifiers,
          name,
        ),
    )
    .replace(new RegExp(`${MEMBER}(?=output\\s*[<(])`, 'gm'), (whole, indent, modifiers, name) =>
      mark([`@__ngOut('${name}')`], indent, modifiers, name),
    );
  return found
    ? `import { Input as __ngIn, Output as __ngOut } from '@angular/core';\n${out}`
    : source;
}
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
      const source = readFileSync(fileName, 'utf8')
        .replaceAll('import.meta.env', 'globalThis.__ENV__')
        // Angular: a component's template file becomes an inline template, and its style files go.
        .replace(/\btemplateUrl\s*:\s*(['"`])([^'"`]+)\1/g, (whole, quote, file) => {
          const template = new URL(file, url.replace(/\?.*$/, ''));
          return isFile(template.href)
            ? `template: ${JSON.stringify(readFileSync(fileURLToPath(template), 'utf8'))}`
            : whole;
        })
        .replace(/\bstyleUrls?\s*:\s*(\[[^\]]*\]|(['"`])[^'"`]+\2)\s*,?/g, '');
      const { outputText } = ts.transpileModule(bindSignalMembers(source), {
        fileName,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
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
