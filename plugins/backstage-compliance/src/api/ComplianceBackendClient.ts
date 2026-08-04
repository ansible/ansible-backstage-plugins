/**
 * Frontend API client that talks to the compliance backend REST API.
 *
 * Implements the ComplianceApi interface so it can be registered as a
 * Backstage API factory and consumed via useApi(complianceApiRef).
 *
 * All data flows through the backend -- the frontend never decides
 * mock vs live. The backend's ComplianceService handles the toggle.
 *
 * Follows the upstream RHDH pattern (e.g., AnsibleApiClient in
 * @ansible/plugin-backstage-self-service): discoveryApi + fetchApi
 * are injected via constructor, discoveryApi resolves the backend
 * URL from app-config.yaml, and fetchApi auto-attaches Backstage
 * identity tokens.
 */
import type {
  ComplianceProfile,
  MultiHostFinding,
  DashboardStats,
  ContributingScan,
  LaunchScanRequest,
  LaunchScanResponse,
  LaunchRemediationRequest,
  LaunchRemediationResponse,
  PostureSnapshot,
  ComplianceScan,
  RemediationProfile,
  RemediationExecution,
  RemediationProfileStatus,
  SaveRemediationProfileRequest,
  WorkflowJobStatus,
  WorkflowNode,
  JobEvent,
  SaveProfileRequest,
  PlatformValidationResult,
  AuthoritativeScanResponse,
  BaselineTarget,
} from '@ansible/backstage-compliance-common/types';

import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type { ComplianceApi } from './complianceApiRef';

// ─── AAP Auth API interface ─────────────────────────────────────────
//
// Minimal interface matching what rhAapAuthApiRef provides in the
// downstream self-service plugin. Defined here to avoid a hard
// dependency on @ansible/plugin-backstage-self-service.

/** @public */
export interface AapAuthApi {
  getAccessToken(): Promise<string>;
}

// ─── ComplianceBackendClient ─────────────────────────────────────────

/**
 * Default implementation of ComplianceApi.
 *
 * Uses Backstage's discoveryApi to resolve the backend URL and
 * fetchApi to make requests with automatic identity token injection.
 *
 * AAP token flow (Option C):
 *   - When running inside the Ansible Portal (RHDH), the aapAuthApi
 *     is injected via constructor and provides the user's AAP OAuth2
 *     access token. This token is passed to every mutating request
 *     via the x-aap-token header, enabling per-user AAP RBAC.
 *   - When running standalone (dev mode), aapAuthApi is undefined
 *     and the backend falls back to the service token from app-config.
 */
export class ComplianceBackendClient implements ComplianceApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly aapAuthApi?: AapAuthApi;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    aapAuthApi?: AapAuthApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.aapAuthApi = options.aapAuthApi;
  }

  /**
   * Obtain the user's AAP OAuth2 access token.
   *
   * When aapAuthApi is provided (Portal context), delegates to it.
   * When not provided (standalone dev), returns undefined and the
   * backend falls back to the service token from app-config.yaml.
   */
  private async getAapToken(): Promise<string | undefined> {
    if (this.aapAuthApi) {
      try {
        return await this.aapAuthApi.getAccessToken();
      } catch (_err) {
        // AAP auth provider unavailable — fall back to service token.
        // This is expected in standalone dev mode where the Portal's
        // auth-backend-module-rhaap-provider is not registered.
        return undefined;
      }
    }
    return undefined;
  }

  private async request<T>(
    path: string,
    options?: { method?: string; body?: unknown; aapToken?: string },
  ): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('compliance');
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // When an AAP token is available, pass it to the backend so that
    // Controller API calls are made as the logged-in user (AAP RBAC).
    // The backend reads this from the x-aap-token header.
    if (options?.aapToken) {
      headers['x-aap-token'] = options.aapToken;
    }

    const resp = await this.fetchApi.fetch(url, {
      method: options?.method ?? 'GET',
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`${resp.status} ${resp.statusText}: ${errBody}`);
    }

    // 204 No Content -- return undefined (cast to T for void responses)
    if (resp.status === 204) {
      return undefined as T;
    }

    return (await resp.json()) as T;
  }

  getHealth() {
    return this.request<{
      status: string;
      dataSource: string;
      retentionDays?: number;
    }>('/health');
  }

  updateSettings(settings: { retentionDays: number }) {
    return this.request<{ retentionDays: number }>('/settings', {
      method: 'POST',
      body: settings,
    });
  }

  runCleanup() {
    return this.request<{ deleted: number; retentionDays: number }>(
      '/cleanup',
      {
        method: 'POST',
      },
    );
  }

  getProfiles() {
    return this.request<ComplianceProfile[]>('/profiles');
  }

  getScans() {
    return this.request<ComplianceScan[]>('/scans');
  }

  async getScan(scanId: string): Promise<ComplianceScan | null> {
    try {
      return await this.request<ComplianceScan>(
        `/scans/${encodeURIComponent(scanId)}`,
      );
    } catch {
      return null;
    }
  }

  getInventories() {
    return this.request<Array<{ id: number; name: string; hostCount: number }>>(
      '/inventories',
    );
  }

  getWorkflowTemplates(nameFilter?: string) {
    const q = nameFilter ? `?name=${encodeURIComponent(nameFilter)}` : '';
    return this.request<
      Array<{ id: number; name: string; description: string }>
    >(`/workflow-templates${q}`);
  }

  async launchScan(body: LaunchScanRequest) {
    const aapToken = await this.getAapToken();
    return this.request<LaunchScanResponse>('/scan', {
      method: 'POST',
      body,
      aapToken,
    });
  }

  getFindings(scanId?: string, profileId?: string) {
    const params = new URLSearchParams();
    if (scanId) params.set('scanId', scanId);
    if (profileId) params.set('profileId', profileId);
    const q = params.toString() ? `?${params.toString()}` : '';
    return this.request<MultiHostFinding[]>(`/findings${q}`);
  }

  getFindingsPaginated(
    scanId: string,
    opts: { limit: number; offset: number; severity?: string; status?: string },
  ) {
    const params = new URLSearchParams();
    params.set('scanId', scanId);
    params.set('limit', String(opts.limit));
    params.set('offset', String(opts.offset));
    if (opts.severity) params.set('severity', opts.severity);
    if (opts.status) params.set('status', opts.status);
    return this.request<
      import('@ansible/backstage-compliance-common').PaginatedFindings
    >(`/findings?${params.toString()}`);
  }

  getPreviousFindings(scanId: string) {
    return this.request<MultiHostFinding[]>(
      `/previous-findings?scanId=${encodeURIComponent(scanId)}`,
    );
  }

  getWorkflowStatus(jobId: number) {
    return this.request<WorkflowJobStatus>(`/workflow-status/${jobId}`);
  }

  getJobStatus(jobId: number) {
    return this.request<WorkflowJobStatus>(`/job-status/${jobId}`);
  }

  getWorkflowNodes(jobId: number) {
    return this.request<WorkflowNode[]>(`/workflow-nodes/${jobId}`);
  }

  getJobEvents(jobId: number) {
    return this.request<JobEvent[]>(`/job-events/${jobId}`);
  }

  async launchRemediation(body: LaunchRemediationRequest) {
    const aapToken = await this.getAapToken();
    return this.request<LaunchRemediationResponse>('/remediate', {
      method: 'POST',
      body,
      aapToken,
    });
  }

  getDashboardStats() {
    return this.request<DashboardStats>('/dashboard');
  }

  getContributingScans(profileId: string) {
    return this.request<ContributingScan[]>(
      `/dashboard/scans-for-profile/${encodeURIComponent(profileId)}`,
    );
  }

  getPostureHistory(profileId?: string, days?: number, inventoryId?: number) {
    const params = new URLSearchParams();
    if (profileId) params.set('profileId', profileId);
    if (days) params.set('days', String(days));
    if (inventoryId !== undefined)
      params.set('inventoryId', String(inventoryId));
    const q = params.toString() ? `?${params}` : '';
    return this.request<PostureSnapshot[]>(`/posture${q}`);
  }

  getRemediationEventsForTrend(days?: number, inventoryId?: number) {
    const params = new URLSearchParams();
    if (days) params.set('days', String(days));
    if (inventoryId !== undefined)
      params.set('inventoryId', String(inventoryId));
    const q = params.toString() ? `?${params}` : '';
    return this.request<
      import('@ansible/backstage-compliance-common').RemediationEvent[]
    >(`/posture/events${q}`);
  }

  getHostPosture(
    inventoryId: number,
    profileId: string,
    options?: { baselineView?: boolean },
  ) {
    const params = new URLSearchParams({ profileId });
    if (options?.baselineView) params.set('baselineView', 'true');
    return this.request<
      import('@ansible/backstage-compliance-common').HostPostureResponse
    >(`/inventory/${inventoryId}/host-posture?${params.toString()}`);
  }

  getHostFindings(
    inventoryId: number,
    hostname: string,
    profileId: string,
    limit?: number,
  ) {
    const params = new URLSearchParams({ profileId });
    if (limit) params.set('limit', String(limit));
    return this.request<
      import('@ansible/backstage-compliance-common').HostFindingsResponse
    >(
      `/inventory/${inventoryId}/host/${encodeURIComponent(
        hostname,
      )}/findings?${params}`,
    );
  }

  getRemediationProfiles(statusFilter?: RemediationProfileStatus | 'all') {
    const q = statusFilter ? `?status=${statusFilter}` : '';
    return this.request<RemediationProfile[]>(`/remediation-profiles${q}`);
  }

  async getRemediationProfile(id: string) {
    try {
      return await this.request<RemediationProfile>(
        `/remediation-profiles/${encodeURIComponent(id)}`,
      );
    } catch (_err) {
      // 404 is expected when a profile has been deleted or does not exist.
      // The caller handles null gracefully (displays "not found" UI).
      return null;
    }
  }

  saveRemediationProfile(body: SaveRemediationProfileRequest) {
    return this.request<RemediationProfile>('/remediation-profiles', {
      method: 'POST',
      body,
    });
  }

  deleteRemediationProfile(id: string) {
    return this.request<void>(
      `/remediation-profiles/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
    );
  }

  updateRemediationProfileStatus(id: string, status: RemediationProfileStatus) {
    return this.request<RemediationProfile>(
      `/remediation-profiles/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: { status } },
    );
  }

  // ─── Remediation executions (ADR-014) ───────────────────────────────

  getRemediationExecutions(profileId: string, limit?: number) {
    const params = new URLSearchParams({ profileId });
    if (limit) params.set('limit', String(limit));
    return this.request<RemediationExecution[]>(
      `/remediation-executions?${params}`,
    );
  }

  getBatchScanStats(scanIds: string[]) {
    return this.request<
      Record<
        string,
        {
          pass: number;
          fail: number;
          rules: number;
          hosts: number;
          naCount: number;
          stateNew?: number;
          stateFixed?: number;
          stateResurfaced?: number;
          totalPackages?: number;
          totalVulnerabilities?: number;
          totalScannedPackages?: number;
          totalVulnerablePackages?: number;
        }
      >
    >(`/scans/stats?ids=${scanIds.map(encodeURIComponent).join(',')}`);
  }

  getNotApplicableRules(scanId: string) {
    return this.request<
      Array<{ ruleId: string; ruleTitle: string; severity: string }>
    >(`/scans/${encodeURIComponent(scanId)}/findings/na`);
  }

  getAllRecentExecutions(limit?: number) {
    const params = limit ? `?limit=${limit}` : '';
    return this.request<RemediationExecution[]>(
      `/remediation-executions${params}`,
    );
  }

  async getRemediationExecution(id: string) {
    try {
      return await this.request<RemediationExecution>(
        `/remediation-executions/${encodeURIComponent(id)}`,
      );
    } catch (_err) {
      return null;
    }
  }

  updateRemediationExecution(
    id: string,
    update: Partial<RemediationExecution>,
  ) {
    return this.request<RemediationExecution>(
      `/remediation-executions/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: update },
    );
  }

  async getRemediationErrorDetails(jobIds: number[]): Promise<string | null> {
    try {
      const result = await this.request<{ errorDetails: string | null }>(
        `/remediation-error-details?jobIds=${jobIds.join(',')}`,
      );
      return result.errorDetails;
    } catch {
      return null;
    }
  }

  async getBaselineScores(remediationProfileId: string): Promise<
    Array<{
      inventoryId: number;
      passRate: number;
      passCount: number;
      failCount: number;
    }>
  > {
    try {
      return await this.request<
        Array<{
          inventoryId: number;
          passRate: number;
          passCount: number;
          failCount: number;
        }>
      >(
        `/baseline-scores?remediationProfileId=${encodeURIComponent(
          remediationProfileId,
        )}`,
      );
    } catch {
      return [];
    }
  }

  async getAuthoritativeScan(profileId: string, inventoryId: number) {
    try {
      return await this.request<AuthoritativeScanResponse>(
        `/scans/authoritative?profileId=${encodeURIComponent(
          profileId,
        )}&inventoryId=${inventoryId}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('Not Found')) return null;
      // eslint-disable-next-line no-console
      console.error('Authoritative scan check failed:', msg);
      return null;
    }
  }

  validateScan(body: { profileId: string; inventoryId: number }) {
    return this.request<PlatformValidationResult>('/scan/validate', {
      method: 'POST',
      body,
    });
  }

  getRegisteredProfiles(opts?: { includeDisconnected?: boolean }) {
    const params = opts?.includeDisconnected ? '?includeDisconnected=true' : '';
    return this.request<ComplianceProfile[]>(`/compliance-profiles${params}`);
  }

  async getRegisteredProfile(id: string): Promise<ComplianceProfile | null> {
    try {
      return await this.request<ComplianceProfile>(
        `/compliance-profiles/${encodeURIComponent(id)}`,
      );
    } catch {
      return null;
    }
  }

  async saveRegisteredProfile(body: SaveProfileRequest) {
    const aapToken = await this.getAapToken();
    return this.request<ComplianceProfile>('/compliance-profiles', {
      method: 'POST',
      body,
      aapToken,
    });
  }

  async deleteRegisteredProfile(id: string) {
    const aapToken = await this.getAapToken();
    return this.request<void>(
      `/compliance-profiles/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        aapToken,
      },
    );
  }

  async disconnectProfile(profileId: string) {
    const aapToken = await this.getAapToken();
    return this.request<void>('/compliance-profiles/disconnect', {
      method: 'POST',
      body: { profileId },
      aapToken,
    });
  }

  async getProfileTabData(profileId: string) {
    const aapToken = await this.getAapToken();
    return this.request<
      import('@ansible/backstage-compliance-common').ProfileTabDataResponse
    >(`/profile-tab-data/${encodeURIComponent(profileId)}`, { aapToken });
  }

  async getJobTemplateDetail(id: number): Promise<{
    id: number;
    name: string;
    description: string;
    extra_vars: string;
    execution_environment: number | null;
  }> {
    return this.request(`/job-templates/${id}`);
  }

  getControllerJobTemplates() {
    return this.request<
      Array<{ id: number; name: string; description: string }>
    >('/controller/job-templates');
  }

  getControllerWorkflowTemplates() {
    return this.request<
      Array<{ id: number; name: string; description: string }>
    >('/controller/workflow-job-templates');
  }

  getControllerExecutionEnvironments() {
    return this.request<Array<{ id: number; name: string; image: string }>>(
      '/controller/execution-environments',
    );
  }

  getBaselineTargets(complianceProfileId?: string) {
    const q = complianceProfileId
      ? `?complianceProfileId=${encodeURIComponent(complianceProfileId)}`
      : '';
    return this.request<BaselineTarget[]>(`/baseline-targets${q}`);
  }

  pinBaselineTarget(body: {
    remediationProfileId: string;
    complianceProfileId: string;
    inventoryId: number;
  }) {
    return this.request<BaselineTarget>('/baseline-targets', {
      method: 'POST',
      body,
    });
  }

  unpinBaselineTarget(id: string) {
    return this.request<void>(`/baseline-targets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  getChain(executionId: string) {
    return this.request<
      import('@ansible/backstage-compliance-common').ChainResponse
    >(`/chain/${encodeURIComponent(executionId)}`);
  }

  getArtifacts(scanId: string) {
    return this.request<
      import('@ansible/backstage-compliance-common').ScanArtifact[]
    >(`/scans/${encodeURIComponent(scanId)}/artifacts`);
  }

  async downloadArtifact(
    scanId: string,
    artifactKey: string,
    filename: string,
  ): Promise<void> {
    const baseUrl = await this.discoveryApi.getBaseUrl('compliance');
    const url = `${baseUrl}/scans/${encodeURIComponent(
      scanId,
    )}/artifacts/${encodeURIComponent(artifactKey)}/download`;
    const resp = await this.fetchApi.fetch(url);
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objUrl);
  }
}
