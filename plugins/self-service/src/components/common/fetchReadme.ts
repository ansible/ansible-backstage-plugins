import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

export interface FetchReadmeParams {
  scmProvider: string;
  scmHost: string;
  scmOrg: string;
  scmRepo: string;
  filePath: string;
  gitRef: string;
}

export async function fetchReadmeFromBackend(
  discoveryApi: DiscoveryApi,
  fetchApi: FetchApi,
  params: FetchReadmeParams,
): Promise<string> {
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
    `${baseUrl}/git_file_content?${urlParams}`,
  );
  if (response.ok) {
    return response.text();
  }
  return '';
}
