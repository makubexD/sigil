type Json = { [key: string]: unknown };

const DEFAULTS: Json = { retries: 3, cache: { ttlSeconds: 60, enabled: true } };

function merge(target: Json, source: Json): Json {
  for (const key in source) {
    const value = source[key];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      target[key] = merge((target[key] as Json) ?? {}, value as Json);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/** The effective settings for a tenant: the defaults, overridden by the JSON the tenant saved. */
export function tenantConfig(savedJson: string): Json {
  const overrides = JSON.parse(savedJson) as Json;
  return merge(DEFAULTS, overrides);
}
