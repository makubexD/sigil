/**
 * The Antigravity plugin manifest: `plugin.json` at a plugin's root.
 *
 * It carries the pack's identity (`$schema`, `name`, `displayName`, `description`), the version
 * sigil's package ships, the author, homepage and license, and the pack's languages as
 * `keywords`. Antigravity's schema is closed (`additionalProperties: false`), so any other key
 * fails `agy plugin validate --strict`; this module writes exactly the keys decision 7 lists.
 *
 * `logo` and `suggestedPrompts` are deliberately absent: Antigravity reads them only on the
 * Marketplace, and a plugin installed from a folder or a GitHub URL never reaches it.
 *
 * @module
 */
import type { MarketplaceIdentity, Pack } from '../../types';
import { JSON_INDENT } from '../../json-util';
import { SigilError } from '../../errors';

const PLUGIN_MANIFEST_SCHEMA = 'https://antigravity.google/schemas/v1/plugin.json';

/** Sigil's own homepage, used for the author URL when no project homepage is set. */
const DEFAULT_HOMEPAGE = 'https://github.com/makubexD/sigil#readme';

/**
 * Names Antigravity's pre-publish checklist reserves: a plugin whose name starts with one of
 * these (followed by `-` or the end) is rejected before it can be published.
 */
const RESERVED_NAME_RE = /^(antigravity|gemini|claude|cursor)(-|$)/;

/** Inputs to {@link antigravityPluginJson} that do not come from the pack itself. */
export interface AntigravityPluginOptions {
  /** npm package version, written to the manifest's `version` field. */
  version: string;
  /** Project homepage URL (from package.json `homepage`); defaults to sigil's own. */
  homepage?: string | undefined;
  /** Configured marketplace/plugin identity; absent keeps sigil's own values. */
  marketplace?: MarketplaceIdentity | undefined;
}

/**
 * A person/org entry in a configured marketplace identity, with `url` defaulting to the
 * identity's `homepage` when the contact sets none. Keys that would hold `undefined` are
 * omitted rather than written (the closed schema rejects a null).
 */
function resolveIdentityContact(
  contact: MarketplaceIdentity['owner'],
  homepage: string | undefined,
): MarketplaceIdentity['owner'] {
  const url = contact.url ?? homepage;
  return {
    name: contact.name,
    ...(url !== undefined ? { url } : {}),
    ...(contact.email !== undefined ? { email: contact.email } : {}),
  };
}

/** Sigil's own manifest, used when `packs.yaml` has no `marketplace:` block. */
function sigilManifest(pack: Pack, version: string, homepageOverride: string | undefined) {
  const homepage = homepageOverride ?? DEFAULT_HOMEPAGE;
  return {
    $schema: PLUGIN_MANIFEST_SCHEMA,
    name: pack.name,
    displayName: pack.displayName,
    version,
    description: pack.description,
    author: { name: 'Sigil', url: homepage },
    homepage,
    license: 'MIT',
    keywords: pack.languages ?? [],
  };
}

/** The manifest for a configured marketplace identity; unset fields are omitted. */
function configuredManifest(pack: Pack, version: string, identity: MarketplaceIdentity) {
  const contact = identity.author ?? identity.owner;
  return {
    $schema: PLUGIN_MANIFEST_SCHEMA,
    name: pack.name,
    displayName: pack.displayName,
    version,
    description: pack.description,
    author: resolveIdentityContact(contact, identity.homepage),
    ...(identity.homepage !== undefined ? { homepage: identity.homepage } : {}),
    ...(identity.license !== undefined ? { license: identity.license } : {}),
    keywords: pack.languages ?? [],
  };
}

/**
 * Build the `plugin.json` content for a pack, with keys in the schema's useful order and a
 * trailing newline. Throws when the pack name collides with an Antigravity-reserved prefix.
 */
export function antigravityPluginJson(pack: Pack, opts: AntigravityPluginOptions): string {
  if (RESERVED_NAME_RE.test(pack.name)) {
    throw new SigilError(
      `Pack name "${pack.name}" is reserved: Antigravity reserves plugin names starting with ` +
        `antigravity, gemini, claude or cursor (pre-publish checklist). Rename the pack.`,
    );
  }
  const manifest = opts.marketplace
    ? configuredManifest(pack, opts.version, opts.marketplace)
    : sigilManifest(pack, opts.version, opts.homepage);
  return JSON.stringify(manifest, null, JSON_INDENT) + '\n';
}
