/**
 * Pure helpers for the `sigil release` command.
 * No side effects — fully unit-testable without file I/O.
 */

// ─── Version bumping ──────────────────────────────────────────────────────────

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Compute the next semver string.
 *
 * @param current - current version, e.g. "0.1.0"
 * @param level   - "patch" | "minor" | "major" | explicit "x.y.z"
 * @returns the bumped version string
 *
 * @throws if `current` is not valid semver, or if `level` is unrecognised
 */
export function bumpVersion(current: string, level: string): string {
  // Explicit semver passed as level — validate and return as-is
  const explicitMatch = SEMVER_RE.exec(level);
  if (explicitMatch) return level;

  const match = SEMVER_RE.exec(current);
  if (!match) {
    throw new Error(`Current version '${current}' is not valid semver (expected x.y.z).`);
  }

  const [, maMajor, miMinor, paPatch] = match.map(Number);

  switch (level) {
    case 'major':
      return `${maMajor + 1}.0.0`;
    case 'minor':
      return `${maMajor}.${miMinor + 1}.0`;
    case 'patch':
      return `${maMajor}.${miMinor}.${paPatch + 1}`;
    default:
      throw new Error(
        `Unknown release level '${level}'. Use patch, minor, major, or an explicit x.y.z version.`,
      );
  }
}

// ─── Changelog promotion ──────────────────────────────────────────────────────

/**
 * Promote the [Unreleased] section in a Keep-a-Changelog formatted document.
 *
 * Input:
 * ```
 * ## [Unreleased]
 *
 * ### Added
 * - something
 * ```
 *
 * Output:
 * ```
 * ## [Unreleased]
 *
 * ## [0.2.0] - 2026-06-22
 *
 * ### Added
 * - something
 * ```
 *
 * @param text    - full CHANGELOG.md content
 * @param version - new version string, e.g. "0.2.0"
 * @param date    - ISO date string, e.g. "2026-06-22"
 * @throws if `## [Unreleased]` is not found in `text`
 */
export function promoteChangelog(text: string, version: string, date: string): string {
  const UNRELEASED = '## [Unreleased]';

  if (!text.includes(UNRELEASED)) {
    throw new Error(
      'CHANGELOG.md has no ## [Unreleased] section. Add one above the most recent release.',
    );
  }

  const versionHeading = `## [${version}] - ${date}`;

  // Replace the first occurrence: insert a fresh [Unreleased] above the new release heading
  return text.replace(UNRELEASED, `${UNRELEASED}\n\n${versionHeading}`);
}
