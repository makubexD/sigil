/**
 * query — pure helpers for the `get` and `search` commands.
 *
 * Sub-modules:
 *   detail — ArtifactDetail, getArtifactDetail, formatDetailText
 *   search — SearchResult, SearchFilters, searchArtifacts, formatSearchResults
 */
export type { ArtifactDetail } from './detail';
export { getArtifactDetail } from './detail';
export { formatDetailText } from './detail-format';

export type { SearchResult, SearchFilters } from './search';
export { searchArtifacts, formatSearchResults } from './search';
