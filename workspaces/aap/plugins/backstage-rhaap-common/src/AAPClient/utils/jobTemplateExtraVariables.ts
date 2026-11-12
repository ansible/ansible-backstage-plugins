import * as YAML from 'yaml';

/**
 * Parses and validates job-template extra variables using YAML 1.1 semantics.
 * Rejects unsafe JavaScript integers so callers can provide precise values as
 * YAML text instead.
 */
export function normalizeJobTemplateExtraVariables(
  input: string | object,
): Record<string, unknown> {
  const rejectUnsafeNumbers = (
    value: unknown,
    seen = new WeakSet<object>(),
  ): void => {
    if (typeof value === 'number') {
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
        throw new RangeError(
          'Job template extraVariables contains an unsafe integer; provide it as YAML text to preserve its precision.',
        );
      }
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const nested of Object.values(value)) {
      rejectUnsafeNumbers(nested, seen);
    }
  };

  if (typeof input !== 'string') {
    rejectUnsafeNumbers(input);
  }

  const parsed =
    typeof input === 'string'
      ? YAML.parse(input, { version: '1.1', intAsBigInt: true })
      : YAML.parse(YAML.stringify(input, { version: '1.1' }), {
          version: '1.1',
          intAsBigInt: true,
        });

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Job template extraVariables must be a mapping.');
  }

  return parsed as Record<string, unknown>;
}
