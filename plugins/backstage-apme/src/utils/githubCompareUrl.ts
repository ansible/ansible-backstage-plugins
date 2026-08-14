/*
 * Copyright Red Hat
 */

import { parseScmRepoUrl } from '@ansible/backstage-rhaap-common/devSpaces';

/** GitHub/GitLab compare URL for default branch … remediation branch. */
export function buildGithubCompareUrl(
  repoUrl: string | null | undefined,
  baseBranch: string | null | undefined,
  headBranch: string | null | undefined,
): string | null {
  if (!repoUrl?.trim() || !baseBranch?.trim() || !headBranch?.trim()) {
    return null;
  }
  const parts = parseScmRepoUrl(repoUrl);
  if (!parts) {
    return null;
  }
  return `https://${parts.sourceControl}/${parts.repoOwner}/${
    parts.repoName
  }/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(
    headBranch,
  )}`;
}

/** GitHub/GitLab branch tree URL. */
export function buildGithubBranchUrl(
  repoUrl: string | null | undefined,
  branchName: string | null | undefined,
): string | null {
  if (!repoUrl?.trim() || !branchName?.trim()) {
    return null;
  }
  const parts = parseScmRepoUrl(repoUrl);
  if (!parts) {
    return null;
  }
  const branchPath = branchName
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  return `https://${parts.sourceControl}/${parts.repoOwner}/${parts.repoName}/tree/${branchPath}`;
}

/** PR files tab URL, or null when prUrl is missing. */
export function prFilesUrl(prUrl: string): string {
  const trimmed = prUrl.replace(/\/$/, '');
  if (/\/files\/?$/.test(trimmed) || /\/commits\/?$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/files`;
}
