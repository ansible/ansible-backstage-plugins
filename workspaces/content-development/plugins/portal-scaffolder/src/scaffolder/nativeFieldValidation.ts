import {
  isValidEntityName,
  isValidTag,
} from '@ansible/portal-scaffolder-react';

export function validateEEFileName(value: unknown): string[] {
  if (typeof value !== 'string' || value === '') return [];
  const result = isValidEntityName(value);
  return result.valid ? [] : [result.error ?? 'Invalid name'];
}
export function validateEETags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tag, index) => {
    if (typeof tag !== 'string' || tag === '') return [];
    const result = isValidTag(tag);
    return result.valid
      ? []
      : [`Tag ${index + 1}: ${result.error ?? 'Invalid tag'}`];
  });
}
