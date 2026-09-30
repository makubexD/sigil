/**
 * Small JSON-formatting constant shared across every file that writes or prints
 * pretty-printed JSON (manifest, registry, schema emission, config-merge serializers,
 * `sigil get --json`, package.json/package-lock.json rewrites on release).
 *
 * Previously the bare literal `2` at 8+ call sites — one indentation policy, one name.
 *
 * @module
 */

/** Indentation width for all pretty-printed JSON output in this project. */
export const JSON_INDENT = 2;
