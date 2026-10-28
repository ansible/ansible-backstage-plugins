import {
  ApiFactory,
  createApiFactory,
  createApiRef,
  DiscoveryApi,
  FetchApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';

/** Target registry for pushing a built execution environment image. */
export type EEBuildRegistryType = 'pah' | 'custom';

/** Inputs keep registry selection explicit so builds target the intended registry. */
export interface EEBuildRequest {
  entityRef: string;
  registryType: EEBuildRegistryType;
  /**
   * Registry URL sent for every build: PAH uses `ansible.rhaap.baseUrl` from app-config;
   * custom uses the user-entered URL.
   */
  customRegistryUrl: string;
  imageName: string;
  imageTag: string;
  verifyTls: boolean;
}

/** Build acceptance is separate from completion because workflows run asynchronously. */
export interface EEBuildResult {
  accepted: boolean;
  /** CI/workflow run id when returned by the catalog build API (JSON `workflowId` or `workflow_id`). */
  workflowId?: string;
  /** Link to the workflow run when returned */
  workflowUrl?: string;
  /** GitLab pipeline ID when returned */
  pipelineId?: string;
  /** Link to the GitLab pipeline when returned */
  pipelineUrl?: string;
  message?: string;
}

/** SCM credentials are sent only for the provider selected by the user. */
export interface EEBuildTriggerOptions {
  scmToken: string;
  scmProvider: 'github' | 'gitlab';
}

function workflowIdFromJsonValue(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t.length > 0 ? t : undefined;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === 'boolean') {
    return raw ? 'true' : 'false';
  }
  return undefined;
}

function workflowUrlFromJsonValue(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const t = raw.trim();
  return t.length > 0 ? t : undefined;
}

function userTextFromBuildJson(
  data: Record<string, unknown>,
): string | undefined {
  const fromMessage =
    typeof data.message === 'string' ? data.message.trim() : '';
  if (fromMessage.length > 0) {
    return fromMessage;
  }
  const fromError = typeof data.error === 'string' ? data.error.trim() : '';
  return fromError.length > 0 ? fromError : undefined;
}

function parseExecutionEnvironmentBuildResponse(text: string): {
  workflowId?: string;
  workflowUrl?: string;
  pipelineId?: string;
  pipelineUrl?: string;
  message?: string;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;
    const workflowId = workflowIdFromJsonValue(
      data.workflowId ?? data.workflow_id,
    );
    const workflowUrl = workflowUrlFromJsonValue(
      data.workflowUrl ?? data.workflow_url,
    );
    const pipelineId = workflowIdFromJsonValue(
      data.pipelineId ?? data.pipeline_id,
    );
    const pipelineUrl = workflowUrlFromJsonValue(
      data.pipelineUrl ?? data.pipeline_url,
    );
    const message = userTextFromBuildJson(data);
    return { workflowId, workflowUrl, pipelineId, pipelineUrl, message };
  } catch {
    return { message: trimmed };
  }
}

/** Catalog pages trigger builds through the backend rather than contacting SCM directly. */
export interface EEBuildApi {
  triggerBuild(
    request: EEBuildRequest,
    options: EEBuildTriggerOptions,
  ): Promise<EEBuildResult>;
}

/** A content-owned reference avoids coupling catalog pages to the scaffolder plugin. */
export const eeBuildApiRef = createApiRef<EEBuildApi>({
  id: 'plugin.automation-content.ee-build',
});

/** Use authenticated Backstage fetch and discovery so deployments need no hard-coded backend URL. */
export class EEBuildApiClient implements EEBuildApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  async triggerBuild(
    request: EEBuildRequest,
    options: EEBuildTriggerOptions,
  ): Promise<EEBuildResult> {
    const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.scmProvider === 'gitlab') {
      headers['X-Gitlab-Token'] = options.scmToken;
    } else {
      headers['X-Github-Token'] = options.scmToken;
    }
    try {
      const response = await this.fetchApi.fetch(
        `${baseUrl}/ansible/ee/build`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
        },
      );
      const text = await response.text();
      if (response.ok) {
        const parsed = parseExecutionEnvironmentBuildResponse(text);
        return {
          accepted: true,
          workflowId: parsed.workflowId,
          workflowUrl: parsed.workflowUrl,
          pipelineId: parsed.pipelineId,
          pipelineUrl: parsed.pipelineUrl,
          message: parsed.message,
        };
      }
      const parsed = parseExecutionEnvironmentBuildResponse(text);
      return {
        accepted: false,
        message:
          parsed.message || text || `Request failed (${response.status})`,
      };
    } catch (e) {
      return { accepted: false, message: String(e) };
    }
  }
}

/** Register discovery and authenticated fetch for both legacy and native frontend hosts. */
export const EEBuildApis: ApiFactory<
  EEBuildApi,
  EEBuildApiClient,
  { discoveryApi: DiscoveryApi; fetchApi: FetchApi }
> = createApiFactory({
  api: eeBuildApiRef,
  deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
  factory: ({ discoveryApi, fetchApi }) =>
    new EEBuildApiClient({ discoveryApi, fetchApi }),
});
