import type { ScmSelectorData } from './ScmSelectorExtension';

/** Validate the public selection fields while OAuth credentials remain secret. */
export function validateScmSelector(
  value: ScmSelectorData | undefined,
  credentialsRequested: boolean,
): string[] {
  if (!credentialsRequested || !value?.provider) return [];
  if (value.authenticationPending) {
    return ['Wait for authentication to finish.'];
  }
  if (!value.org?.trim()) {
    return ['Select a namespace after authenticating.'];
  }
  if (!value.repoName?.trim()) {
    return ['Enter a repository name.'];
  }
  return [];
}
