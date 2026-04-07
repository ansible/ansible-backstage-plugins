import {
  ApiFactory,
  createApiFactory,
  DiscoveryApi,
  FetchApi,
  OAuthRequestApi,
  configApiRef,
  discoveryApiRef,
  oauthRequestApiRef,
  createApiRef,
  type ApiRef,
  type BackstageIdentityApi,
  type OAuthApi,
  type OpenIdConnectApi,
  type ProfileInfoApi,
  type SessionApi,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { OAuth2 } from '@backstage/core-app-api';
import { Config } from '@backstage/config';

type CustomAuthApiRefType = OAuthApi &
  OpenIdConnectApi &
  ProfileInfoApi &
  BackstageIdentityApi &
  SessionApi;

export interface AnsibleApi {
  syncTemplates(): Promise<boolean>;
  syncOrgsUsersTeam(): Promise<boolean>;
  getSyncStatus(): Promise<{
    aap: {
      orgsUsersTeams: { lastSync: string | null };
      jobTemplates: { lastSync: string | null };
    };
  }>;
}

export const ansibleApiRef = createApiRef<AnsibleApi>({
  id: 'ansible',
});

/** Target registry for pushing a built execution environment image. */
export type EEBuildRegistryType = 'pah' | 'custom';

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

export interface EEBuildResult {
  accepted: boolean;
  /** CI/workflow run id when returned by the catalog build API (JSON `workflowId` or `workflow_id`). */
  workflowId?: string;
  message?: string;
}

/** Sent as `X-Github-Token` so the catalog backend can call GitHub `workflow_dispatch`. */
export interface EEBuildTriggerOptions {
  githubToken: string;
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
    const message = userTextFromBuildJson(data);
    return { workflowId, message };
  } catch {
    return { message: trimmed };
  }
}

/**
 * Placeholder client for catalog POST `/execution_environment/build` (backend TBD).
 */
export interface EEBuildApi {
  triggerBuild(
    request: EEBuildRequest,
    options: EEBuildTriggerOptions,
  ): Promise<EEBuildResult>;
}

export const eeBuildApiRef = createApiRef<EEBuildApi>({
  id: 'plugin.self-service.ee-build',
});

export const rhAapAuthApiRef: ApiRef<CustomAuthApiRefType> = createApiRef({
  id: 'ansible.auth.rhaap',
});

type AAPAuthApiFactoryType = ApiFactory<
  CustomAuthApiRefType,
  OAuth2,
  {
    discoveryApi: DiscoveryApi;
    oauthRequestApi: OAuthRequestApi;
    configApi: Config;
  }
>;

export class AnsibleApiClient implements AnsibleApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  async syncTemplates(): Promise<boolean> {
    const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
    try {
      const response = await this.fetchApi.fetch(
        `${baseUrl}/aap/sync_job_templates`,
      );
      const data = await response.json();
      return data;
    } catch {
      return false;
    }
  }

  async syncOrgsUsersTeam(): Promise<boolean> {
    const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
    try {
      const response = await this.fetchApi.fetch(
        `${baseUrl}/aap/sync_orgs_users_teams`,
      );
      const data = await response.json();
      return data;
    } catch {
      return false;
    }
  }

  async getSyncStatus(): Promise<{
    aap: {
      orgsUsersTeams: { lastSync: string | null };
      jobTemplates: { lastSync: string | null };
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
          orgsUsersTeams: { lastSync: null },
          jobTemplates: { lastSync: null },
        },
      };
    }
  }
}

export const AAPApis: ApiFactory<
  AnsibleApi,
  AnsibleApiClient,
  { discoveryApi: DiscoveryApi; fetchApi: FetchApi }
> = createApiFactory({
  api: ansibleApiRef,
  deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
  factory: ({ discoveryApi, fetchApi }) =>
    new AnsibleApiClient({ discoveryApi, fetchApi }),
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
    try {
      const response = await this.fetchApi.fetch(
        `${baseUrl}/ansible/ee/build`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Github-Token': options.githubToken,
          },
          body: JSON.stringify(request),
        },
      );
      const text = await response.text();
      if (response.ok) {
        const parsed = parseExecutionEnvironmentBuildResponse(text);
        return {
          accepted: true,
          workflowId: parsed.workflowId,
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

export const AapAuthApi: AAPAuthApiFactoryType = createApiFactory({
  api: rhAapAuthApiRef,
  deps: {
    discoveryApi: discoveryApiRef,
    oauthRequestApi: oauthRequestApiRef,
    configApi: configApiRef,
  },
  factory: ({ discoveryApi, oauthRequestApi, configApi }) =>
    OAuth2.create({
      configApi,
      discoveryApi,
      oauthRequestApi,
      provider: {
        id: 'rhaap',
        title: 'RH AAP',
        icon: () => null,
      },
      environment: configApi.getOptionalString('auth.environment'),
      defaultScopes: ['read', 'write'],
    }),
});
