/**
 * Language display-name resolution and `--create-language` scaffolding for
 * `sigil import`. Split out of import.ts to keep that file under the
 * repo's own module-size threshold.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// Known language display names and glob patterns for built-in languages.
// Used by --create-language to scaffold a language.yaml when one is absent.
export const LANGUAGE_DEFAULTS: Record<
  string,
  { displayName: string; prefix: string; stack: string; globs: string[]; icon: string }
> = {
  typescript: {
    displayName: 'TypeScript',
    prefix: 'ts',
    stack: 'node-ts',
    globs: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    icon: '🔷',
  },
  angular: {
    displayName: 'Angular',
    prefix: 'ng',
    stack: 'node-ts',
    globs: ['**/*.ts', '**/*.html', '**/*.component.ts', '**/*.directive.ts'],
    icon: '🅰️',
  },
  csharp: {
    displayName: '.NET / C#',
    prefix: 'cs',
    stack: 'dotnet',
    globs: ['**/*.cs', '**/*.csproj', '**/*.sln', '**/*.razor', '**/*.cshtml'],
    icon: '⚙️',
  },
  python: {
    displayName: 'Python',
    prefix: 'py',
    stack: 'python',
    globs: ['**/*.py', '**/*.pyi'],
    icon: '🐍',
  },
  react: {
    displayName: 'React',
    prefix: 'react',
    stack: 'node-ts',
    globs: ['**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],
    icon: '⚛️',
  },
};

/** Resolve display name: flag → language.yaml → built-in defaults → capitalised lang. */
export function resolveDisplayName(
  lang: string,
  explicitDisplayName: string | undefined,
  yamlPath: string,
): string {
  if (explicitDisplayName) return explicitDisplayName;

  if (fs.existsSync(yamlPath)) {
    try {
      const yamlContent = yaml.load(fs.readFileSync(yamlPath, 'utf-8'), {
        schema: yaml.JSON_SCHEMA,
      }) as Record<string, unknown>;
      return (yamlContent.displayName as string | undefined) ?? lang;
    } catch {
      return lang;
    }
  }

  const defaults = LANGUAGE_DEFAULTS[lang];
  if (defaults) return defaults.displayName;

  return lang.charAt(0).toUpperCase() + lang.slice(1);
}

/**
 * Renders the language.yaml body text for `maybeCreateLanguageYaml`. Every language names its
 * artifact `prefix` and its `stack` (catalog/standard.yaml); a language sigil doesn't know uses its
 * own id for both, and `sync --check` says so if that stack is not declared yet.
 */
function renderLanguageYaml(lang: string, displayName: string): string {
  const defaults = LANGUAGE_DEFAULTS[lang];
  const globs = defaults?.globs ?? ['**/*'];
  const icon = defaults?.icon ?? '📁';
  return [
    `displayName: ${JSON.stringify(displayName)}`,
    `prefix: ${defaults?.prefix ?? lang}`,
    `stack: ${defaults?.stack ?? lang}`,
    `globs:`,
    ...globs.map(g => `  - "${g}"`),
    `icon: "${icon}"`,
    '',
  ].join('\n');
}

/** Scaffold a language.yaml when `--create-language` was passed and none exists yet. */
export function maybeCreateLanguageYaml(
  lang: string,
  yamlPath: string,
  explicitDisplayName: string | undefined,
  resolvedDisplayName: string,
): void {
  if (fs.existsSync(yamlPath)) return;

  fs.mkdirSync(path.dirname(yamlPath), { recursive: true });
  const content = renderLanguageYaml(lang, explicitDisplayName ?? resolvedDisplayName);
  fs.writeFileSync(yamlPath, content, 'utf-8');
  console.log(`✓ Created: ${yamlPath}`);
}
