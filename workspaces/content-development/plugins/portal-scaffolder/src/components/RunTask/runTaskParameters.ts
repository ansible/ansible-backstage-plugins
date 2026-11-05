/*
 * Resolves Software Template parameters that may be grouped under nested objects
 * (e.g. publishAndBuild.publishToSCM) while keeping backward compatibility with
 * flat parameters at the root of task.spec.parameters.
 *
 * Path is not fixed: any nesting depth (within MAX_DEPTH) is searched. Only the
 * property *names* matter. To support additional synonyms for the same meaning,
 * extend the *_KEYS arrays below.
 */

const MAX_DEPTH = 8;

/** Property names that mean “publish to SCM” for Run Task / download UX. Add aliases here. */
const PUBLISH_TO_SCM_KEYS = ['publishToSCM'] as const;

/** Property names that identify the EE definition file base name for catalog lookup. */
const EE_FILE_NAME_KEYS = ['eeFileName'] as const;

function walkBooleanTrue(
  node: unknown,
  fieldName: string,
  depth: number,
): boolean {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some(item => walkBooleanTrue(item, fieldName, depth + 1));
  }
  const record = node as Record<string, unknown>;
  if (record[fieldName] === true) {
    return true;
  }
  return Object.values(record).some(v =>
    walkBooleanTrue(v, fieldName, depth + 1),
  );
}

function walkNonEmptyString(
  node: unknown,
  fieldName: string,
  depth: number,
): string | undefined {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = walkNonEmptyString(item, fieldName, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const record = node as Record<string, unknown>;
  const direct = record[fieldName];
  if (typeof direct === 'string' && direct.trim()) {
    return direct;
  }
  for (const v of Object.values(record)) {
    const found = walkNonEmptyString(v, fieldName, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * True if `fieldName` is strictly `true` on any object anywhere under `params`.
 * Use this when you add new template fields and need the same “nested or flat” behavior.
 */
export function findNestedBooleanTrue(
  params: Record<string, unknown> | undefined | null,
  fieldName: string,
): boolean {
  if (!params) return false;
  return walkBooleanTrue(params, fieldName, 0);
}

/**
 * First non-empty string value for `fieldName` found anywhere under `params`.
 */
export function findNestedNonEmptyString(
  params: Record<string, unknown> | undefined | null,
  fieldName: string,
): string | undefined {
  if (!params) return undefined;
  return walkNonEmptyString(params, fieldName, 0);
}

/**
 * True if the user chose to publish to SCM. Checks every name in
 * {@link PUBLISH_TO_SCM_KEYS} anywhere in the parameter tree.
 */
export function resolvePublishToScmFromParameters(
  params: Record<string, unknown> | undefined | null,
): boolean {
  return PUBLISH_TO_SCM_KEYS.some(key => findNestedBooleanTrue(params, key));
}

/**
 * EE file name for catalog lookup. Uses the first match among {@link EE_FILE_NAME_KEYS}.
 */
export function resolveEeFileNameFromParameters(
  params: Record<string, unknown> | undefined | null,
): string | undefined {
  for (const key of EE_FILE_NAME_KEYS) {
    const v = findNestedNonEmptyString(params, key);
    if (v) return v;
  }
  return undefined;
}
