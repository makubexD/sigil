/**
 * TemplateSchema — split out of index.ts to keep that file under the max-lines cap. Imports
 * BaseFields/DocRefSchema from shared.ts rather than index.ts to avoid a cycle (index.ts's
 * SCHEMAS map assembles this schema).
 */
import { z } from 'zod';
import { BaseFields, DocRefSchema } from './shared';

const TemplateSlotSchema = z.object({
  /** Marker name matched against `<!-- slot: <key> -->` in both the template and artifact bodies. */
  key: z.string().min(1),
  required: z.boolean(),
  /** Shown as the scaffolded hint comment when `sigil new` fills in this slot. */
  description: z.string().min(1),
  /** Previous key this slot was renamed from — lets `sigil sync --apply` rewrite markers. */
  renamedFrom: z.string().optional(),
});

export const TemplateSchema = z.object({
  ...BaseFields,
  kind: z.literal('template'),
  /** Artifact kinds this template may be attached to via their `template:` field. */
  appliesToKind: z.array(z.string()).min(1),
  /**
   * Bumped by the template's author on any structural or shared-prose change. `sigil sync`
   * doesn't need this to DETECT drift — that's done live by comparing an artifact's filled slots
   * against this template's current `slots:`/prose (src/commands/sync/analyze.ts). `revision:`
   * exists to DESCRIBE the change to consumers: it's stamped onto `ManifestEntry.template` at
   * install time, so `sigil status` can report `outdated — template <id> rev <old>→<new>` instead
   * of a bare label (src/manifest/status.ts).
   */
  revision: z.number().int().positive(),
  /** Named insertion points an artifact using this template must (or may) fill. Keys unique. */
  slots: z
    .array(TemplateSlotSchema)
    .min(1)
    .refine(
      slots => new Set(slots.map(s => s.key)).size === slots.length,
      'slot keys must be unique',
    ),
  /**
   * Official documentation this template's structure follows. Required — a template with no
   * authoritative reference has nothing for `sigil sync --stale` to track staleness against,
   * and no anchor for a future author to check "did the provider change this?" against.
   */
  docs: z.array(DocRefSchema).min(1),
});

export type TemplateFrontmatter = z.infer<typeof TemplateSchema>;
