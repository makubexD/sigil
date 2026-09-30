/**
 * Barrel export for the sigil import subsystem.
 */
export { discoverFiles } from './discover';
export type { DiscoveredFile, UnrecognisedFile, DiscoverResult } from './discover';

export { translateFrontmatter, slugToTitle } from './translate';
export type { TranslateOptions, CatalogFrontmatter, TranslateResult } from './translate';

export { buildImportPlan, renderArtifactFile, languageYamlPath } from './plan';
export type { ImportItem, ImportPlan, PlanOptions } from './plan';

export { executeImport } from './execute';
export type { ImportFileResult, ExecuteResult, ExecuteOptions } from './execute';
