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

/**
 * Per-field cap for `data:` URLs when persisting to sessionStorage. Above this, the value is
 * dropped so the overall JSON stays under typical ~5MB origin limits (other fields + overhead).
 * `blob:` URLs are never persisted — they are invalid after a full page reload.
 */
export const MAX_SESSION_STORAGE_DATA_URL_LENGTH = 2_097_152;

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    if (/^blob:/i.test(value)) {
      return '';
    }
    if (/^data:/i.test(value)) {
      return value.length > MAX_SESSION_STORAGE_DATA_URL_LENGTH ? '' : value;
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
 * `blob:` URL strings are cleared (they cannot be restored after a full reload).
 * Very large `data:` URL strings (e.g. huge uploads) may be cleared to stay under
 * sessionStorage quota; typical file uploads as `data:` URLs are kept so OAuth reload
 * can restore them.
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
