export function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

export function isPositiveInteger(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val > 0;
}

export function isBoolean(val: unknown): val is boolean {
  return typeof val === 'boolean';
}

export function isArray(val: unknown): val is unknown[] {
  return Array.isArray(val);
}

export function isValidScanId(scanId: string): boolean {
  return (
    typeof scanId === 'string' &&
    scanId.length > 0 &&
    scanId.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(scanId)
  );
}

export function isValidProfileId(profileId: string): boolean {
  return (
    typeof profileId === 'string' &&
    profileId.length > 0 &&
    profileId.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(profileId)
  );
}

export function parseInventoryId(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (isNaN(n) || !Number.isInteger(n) || n < 1) return undefined;
  return n;
}
