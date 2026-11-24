import {
  isValidEntityName,
  isValidTag,
  type ScmSelectorData,
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

/** Credentials stay in Scaffolder secrets; validation only inspects public selections. */
export function validateScmSelector(
  value: ScmSelectorData | undefined,
  credentialsRequested: boolean,
): string[] {
  if (!credentialsRequested) return [];
  // An untouched optional selector is allowed. Once a provider is selected,
  // the native wizard must require the OAuth-backed namespace selection too.
  if (!value?.provider) return [];
  if (value.authenticationPending)
    return ['Wait for authentication to finish.'];
  if (!value.org?.trim()) {
    return ['Select a namespace after authenticating.'];
  }
  if (!value.repoName?.trim()) {
    return ['Enter a repository name.'];
  }
  return [];
}
