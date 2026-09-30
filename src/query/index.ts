/**
 * query — pure helpers for the `get` and `search` commands.
 *
 * Sub-modules:
 *   detail — ArtifactDetail, getArtifactDetail, formatDetailText
 *   search — SearchResult, SearchFilters, searchArtifacts, formatSearchResults
 */
export type { ArtifactDetail } from './detail';
export { getArtifactDetail, formatDetailText } from './detail';

export type { SearchResult, SearchFilters } from './search';
export { searchArtifacts, formatSearchResults } from './search';
