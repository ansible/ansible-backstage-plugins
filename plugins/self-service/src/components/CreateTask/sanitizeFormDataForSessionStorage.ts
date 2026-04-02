/**
 * JSON Schema property shape for scaffolder / template steps (partial).
 */
type SchemaProperty = Record<string, unknown>;

const SECRET_UI_FIELDS = new Set(['Secret', 'AAPTokenField']);

function isSensitiveTemplateProperty(key: string, p: SchemaProperty): boolean {
  if (key === 'token') {
    return true;
  }
  const uiField = p['ui:field'];
  if (typeof uiField === 'string' && SECRET_UI_FIELDS.has(uiField)) {
    return true;
  }
  if (p.format === 'password' || p.writeOnly === true) {
    return true;
  }
  return false;
}

/**
 * Collects template parameter keys that must not be written to sessionStorage
 * (OAuth reload persistence). Uses schema hints used by Backstage and Ansible templates.
 */
export function collectSensitiveTemplateKeysFromSteps(
  steps: Array<{ schema?: Record<string, unknown> }>,
): Set<string> {
  const keys = new Set<string>();
  for (const step of steps) {
    const properties = step.schema?.properties;
    if (
      !properties ||
      typeof properties !== 'object' ||
      Array.isArray(properties)
    ) {
      continue;
    }
    for (const [key, prop] of Object.entries(properties)) {
      if (isSensitiveTemplateProperty(key, prop as SchemaProperty)) {
        keys.add(key);
      }
    }
  }
  return keys;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    if (/^data:/i.test(value) || /^blob:/i.test(value)) {
      return '';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeValue(v);
    }
    return out;
  }
  return value;
}

export interface SanitizeFormDataForSessionStorageOptions {
  /** Top-level keys to strip after sanitization (secrets / tokens). */
  omitKeys?: ReadonlySet<string>;
}

/**
 * Produces a JSON-serializable clone of form data safe for sessionStorage.
 * Large `data:` and `blob:` URL strings (e.g. uploaded files encoded as data URLs)
 * are replaced with empty strings so other fields can still be persisted for OAuth
 * reload without exceeding browser storage quota.
 *
 * Use {@link collectSensitiveTemplateKeysFromSteps} with `omitKeys` to avoid storing
 * passwords and tokens in web storage.
 */
export function sanitizeFormDataForSessionStorage(
  value: unknown,
  options?: SanitizeFormDataForSessionStorageOptions,
): unknown {
  const sanitized = sanitizeValue(value);
  const omitKeys = options?.omitKeys;
  if (
    omitKeys &&
    omitKeys.size > 0 &&
    sanitized &&
    typeof sanitized === 'object' &&
    !Array.isArray(sanitized)
  ) {
    const out = { ...(sanitized as Record<string, unknown>) };
    for (const key of omitKeys) {
      delete out[key];
    }
    return out;
  }
  return sanitized;
}
