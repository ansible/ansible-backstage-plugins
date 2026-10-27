import {
  ApiFactory,
  createApiFactory,
  DiscoveryApi,
  FetchApi,
  discoveryApiRef,
  createApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { rhAapAuthApiRef, type AapAuthApiType } from '@ansible/aap-app-auth';
import type {
  AnsibleApi,
  EEBuildApi,
  EEBuildRequest,
  EEBuildResult,
  EEBuildTriggerOptions,
  UserJobTemplate,
} from '@ansible/portal-scaffolder-common';
export type {
  AnsibleApi,
  EEBuildApi,
  EEBuildRegistryType,
  EEBuildRequest,
  EEBuildResult,
  EEBuildTriggerOptions,
  UserJobTemplate,
} from '@ansible/portal-scaffolder-common';

export const ansibleApiRef = createApiRef<AnsibleApi>({
  id: 'ansible',
});

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

export const eeBuildApiRef = createApiRef<EEBuildApi>({
  id: 'plugin.self-service.ee-build',
});

export class AnsibleApiClient implements AnsibleApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly rhaapAuthApi: AapAuthApiType;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    rhaapAuthApi: AapAuthApiType;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.rhaapAuthApi = options.rhaapAuthApi;
  }

  private async triggerSync(endpoint: string): Promise<boolean> {
    const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
    try {
      const response = await this.fetchApi.fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      return (
        data.status === 'sync_started' || data.status === 'already_syncing'
      );
    } catch {
      return false;
    }
  }

  async syncTemplates(): Promise<boolean> {
    return this.triggerSync('/ansible/sync/from-aap/job_templates');
  }

  async syncOrgsUsersTeam(): Promise<boolean> {
    return this.triggerSync('/ansible/sync/from-aap/orgs_users_teams');
  }

  async getUserJobTemplates(): Promise<{ items: UserJobTemplate[] }> {
    const baseUrl = await this.discoveryApi.getBaseUrl('auth');
    const accessToken = (await this.rhaapAuthApi.getAccessToken())?.trim();
    if (!accessToken) {
      throw new Error(
        'Your AAP sign-in session expired. Sign out and sign in again.',
      );
    }

    const response = await this.fetchApi.fetch(
      `${baseUrl}/rhaap/user-job-templates`,
      {
        credentials: 'include',
        headers: { 'X-RHAAP-Access-Token': accessToken },
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const rawMessage =
        typeof data.error === 'string'
          ? data.error
          : `Request failed (${response.status})`;
      const message = rawMessage.includes('invalid_grant')
        ? 'Your AAP sign-in session expired. Sign out and sign in again.'
        : rawMessage;
      throw new Error(message);
    }
    return data as { items: UserJobTemplate[] };
  }

  async getSyncStatus(): Promise<{
    aap: {
      orgsUsersTeams: {
        lastSync: string | null;
        syncInProgress: boolean;
      };
      jobTemplates: {
        lastSync: string | null;
        syncInProgress: boolean;
      };
    };
  }> {
    const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
    try {
      const response = await this.fetchApi.fetch(
        `${baseUrl}/ansible/sync/status?aap_entities=true`,
      );
      const data = await response.json();
      return data;
    } catch {
      return {
        aap: {
          orgsUsersTeams: { lastSync: null, syncInProgress: false },
          jobTemplates: { lastSync: null, syncInProgress: false },
        },
      };
    }
  }
}

export const AAPApis: ApiFactory<
  AnsibleApi,
  AnsibleApiClient,
  {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    rhaapAuthApi: AapAuthApiType;
  }
> = createApiFactory({
  api: ansibleApiRef,
  deps: {
    discoveryApi: discoveryApiRef,
    fetchApi: fetchApiRef,
    rhaapAuthApi: rhAapAuthApiRef,
  },
  factory: ({ discoveryApi, fetchApi, rhaapAuthApi }) =>
    new AnsibleApiClient({ discoveryApi, fetchApi, rhaapAuthApi }),
});

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
