/**
 * Produces a JSON-serializable clone of form data safe for sessionStorage.
 * Large `data:` and `blob:` URL strings (e.g. uploaded files encoded as data URLs)
 * are replaced with empty strings so other fields can still be persisted for OAuth
 * reload without exceeding browser storage quota.
 */
export function sanitizeFormDataForSessionStorage(value: unknown): unknown {
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
    return value.map(sanitizeFormDataForSessionStorage);
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeFormDataForSessionStorage(v);
    }
    return out;
  }
  return value;
}
