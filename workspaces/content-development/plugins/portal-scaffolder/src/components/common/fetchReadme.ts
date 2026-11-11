import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { SCM_INTEGRATION_AUTH_FAILED_CODE } from '@ansible/backstage-rhaap-common/constants';

export interface FetchReadmeParams {
  scmProvider: string;
  scmHost: string;
  scmOrg: string;
  scmRepo: string;
  filePath: string;
  gitRef: string;
}

export type FetchGitFileOutcome =
  | { ok: true; data: string }
  | { ok: false; reason: 'integration_auth' }
  | { ok: false; reason: 'other' };

async function parseGitFileContentResponse(
  response: Response,
): Promise<FetchGitFileOutcome> {
  if (response.ok) {
    return { ok: true, data: await response.text() };
  }

  const text = await response.text();
  try {
    const body = JSON.parse(text) as { code?: string };
    if (body?.code === SCM_INTEGRATION_AUTH_FAILED_CODE) {
      return { ok: false, reason: 'integration_auth' };
    }
  } catch {
    // Response body was not JSON
  }
  return { ok: false, reason: 'other' };
}

/**
 * Fetches a file via the catalog `/ansible/git/file-content` proxy using
 * app-config SCM integrations. Surfaces integration token failures separately.
 */
export async function fetchGitFileContentFromBackend(
  discoveryApi: DiscoveryApi,
  fetchApi: FetchApi,
  params: FetchReadmeParams,
): Promise<FetchGitFileOutcome> {
  const baseUrl = await discoveryApi.getBaseUrl('catalog');
  const urlParams = new URLSearchParams({
    scmProvider: params.scmProvider,
    host: params.scmHost,
    owner: params.scmOrg,
    repo: params.scmRepo,
    filePath: params.filePath,
    ref: params.gitRef,
  });

  const response = await fetchApi.fetch(
    `${baseUrl}/ansible/git/file-content?${urlParams}`,
  );
  return parseGitFileContentResponse(response);
}

/** Returns readme text, or empty string on any failure (legacy behavior). */
export async function fetchReadmeFromBackend(
  discoveryApi: DiscoveryApi,
  fetchApi: FetchApi,
  params: FetchReadmeParams,
): Promise<string> {
  try {
    const outcome = await fetchGitFileContentFromBackend(
      discoveryApi,
      fetchApi,
      params,
    );
    return outcome.ok ? outcome.data : '';
  } catch {
    return '';
  }
}
