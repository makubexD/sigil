/**
 * Structured option shape for the custom `pickArtifacts` picker (src/wizard/picker/).
 *
 * Replaces the old `label`/`hint` string-concatenation shape (`PickerOption` in
 * `../steps/add/options.ts`) — the renderer needs the fields separately to lay out aligned
 * columns and a fixed-height detail pane, instead of baking a variable-length string into the row.
 *
 * @module
 */

/** The synthetic `← Back` row every picker prepends. */
export interface BackRow {
  readonly kind: 'back';
  readonly value: string;
}

/** One selectable artifact row. */
export interface ItemRow {
  readonly kind: 'item';
  readonly value: string;
  readonly id: string;
  readonly kindNoun: string;
  /** Plain-text state label, e.g. "new", "installed", "update available". Colored at render time. */
  readonly stateLabel: string;
  /** Single-character/glyph state marker, e.g. "＋", "✓". Colored at render time. */
  readonly stateGlyph: string;
  readonly description: string;
}

export type PickerRow = BackRow | ItemRow;

/** Input shape: one array of rows per group. An ungrouped/flat picker uses a single `''` key. */
export type PickerGroups = Record<string, PickerRow[]>;
