import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type { ApmeApi } from './ApmeApi';
import type {
  ActivityDetail,
  ActivitySummary,
  AiAcceptanceEntry,
  AiModelInfo,
  CollectionDetail,
  CollectionSummary,
  CreateGalaxyServerRequest,
  CreateProjectRequest,
  CreatePullRequestRequest,
  CreatePullRequestResponse,
  DashboardSummary,
  DepHealthSummary,
  GalaxyServer,
  GraphData,
  HealthStatus,
  NotificationItem,
  PaginatedResponse,
  ProjectDependencies,
  ProjectDetail,
  ProjectRanking,
  ProjectSummary,
  PythonPackageDetail,
  PythonPackageSummary,
  RemediationRateEntry,
  RuleDetail,
  RuleOverrideRequest,
  RuleStats,
  SessionDetail,
  SessionSummary,
  TopViolation,
  TrendPoint,
  UpdateGalaxyServerRequest,
  UpdateProjectRequest,
  ViolationDetail,
} from '../types/api';

export class ApmeApiClient implements ApmeApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async baseUrl(): Promise<string> {
    return await this.discoveryApi.getBaseUrl('apme');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const base = await this.baseUrl();
    const res = await this.fetchApi.fetch(`${base}/api/v1${path}`, {
      headers: { Accept: 'application/json' },
      ...init,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`APME API ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }

  private async requestVoid(path: string, init?: RequestInit): Promise<void> {
    const base = await this.baseUrl();
    const res = await this.fetchApi.fetch(`${base}/api/v1${path}`, init);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`APME API ${res.status}: ${text}`);
    }
  }

  private jsonBody(body: unknown): RequestInit {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  }

  // Health
  async getHealth(): Promise<HealthStatus> {
    return this.request('/health');
  }

  // Sessions
  async listSessions(limit = 50, offset = 0): Promise<PaginatedResponse<SessionSummary>> {
    return this.request(`/sessions?limit=${limit}&offset=${offset}`);
  }
  async getSession(sessionId: string): Promise<SessionDetail> {
    return this.request(`/sessions/${sessionId}`);
  }
  async getSessionTrend(sessionId: string): Promise<TrendPoint[]> {
    return this.request(`/sessions/${sessionId}/trend`);
  }

  // Activity
  async listActivity(limit = 50, offset = 0, sessionId?: string): Promise<PaginatedResponse<ActivitySummary>> {
    let url = `/activity?limit=${limit}&offset=${offset}`;
    if (sessionId) url += `&session_id=${sessionId}`;
    return this.request(url);
  }
  async getActivity(scanId: string): Promise<ActivityDetail> {
    return this.request(`/activity/${scanId}`);
  }
  async deleteActivity(scanId: string): Promise<void> {
    return this.requestVoid(`/activity/${scanId}`, { method: 'DELETE' });
  }
  async createPullRequest(scanId: string, body: CreatePullRequestRequest): Promise<CreatePullRequestResponse> {
    return this.request(`/activity/${scanId}/pull-request`, this.jsonBody(body));
  }

  // Stats
  async getTopViolations(): Promise<TopViolation[]> {
    return this.request('/violations/top');
  }
  async getRemediationRates(): Promise<RemediationRateEntry[]> {
    return this.request('/stats/remediation-rates');
  }
  async getAiAcceptance(): Promise<AiAcceptanceEntry[]> {
    return this.request('/stats/ai-acceptance');
  }
  async listAiModels(): Promise<AiModelInfo[]> {
    return this.request('/ai/models');
  }

  // Projects
  async listProjects(): Promise<ProjectSummary[]> {
    return this.request('/projects');
  }
  async getProject(id: string): Promise<ProjectDetail> {
    return this.request(`/projects/${id}`);
  }
  async createProject(body: CreateProjectRequest): Promise<ProjectDetail> {
    return this.request('/projects', this.jsonBody(body));
  }
  async updateProject(id: string, body: UpdateProjectRequest): Promise<ProjectDetail> {
    return this.request(`/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  async deleteProject(id: string): Promise<void> {
    return this.requestVoid(`/projects/${id}`, { method: 'DELETE' });
  }
  async getProjectActivity(id: string): Promise<ActivitySummary[]> {
    return this.request(`/projects/${id}/activity`);
  }
  async getProjectViolations(id: string): Promise<ViolationDetail[]> {
    return this.request(`/projects/${id}/violations`);
  }
  async getProjectTrend(id: string): Promise<TrendPoint[]> {
    return this.request(`/projects/${id}/trend`);
  }
  async getProjectDependencies(id: string): Promise<ProjectDependencies> {
    return this.request(`/projects/${id}/dependencies`);
  }
  async getProjectDepHealth(id: string): Promise<DepHealthSummary> {
    return this.request(`/projects/${id}/dep-health`);
  }
  async getProjectGraph(id: string): Promise<GraphData> {
    return this.request(`/projects/${id}/graph`);
  }
  async getProjectSbom(id: string): Promise<Blob> {
    const base = await this.baseUrl();
    const res = await this.fetchApi.fetch(`${base}/api/v1/projects/${id}/sbom`, {
      headers: { Accept: 'application/vnd.cyclonedx+json' },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`APME API ${res.status}: ${text}`);
    }
    return res.blob();
  }
  async getProjectOperation(id: string): Promise<unknown> {
    return this.request(`/projects/${id}/operation`);
  }
  async createPR(projectId: string): Promise<{ pr_url: string }> {
    return this.request(`/projects/${projectId}/operation/create-pr`, { method: 'POST' });
  }

  // Dashboard
  async getDashboardSummary(): Promise<DashboardSummary> {
    return this.request('/dashboard/summary');
  }
  async getDashboardRankings(): Promise<ProjectRanking[]> {
    return this.request('/dashboard/rankings');
  }

  // Collections
  async listCollections(): Promise<CollectionSummary[]> {
    return this.request('/collections');
  }
  async getCollection(fqcn: string): Promise<CollectionDetail> {
    return this.request(`/collections/${fqcn}`);
  }

  // Python packages
  async listPythonPackages(): Promise<PythonPackageSummary[]> {
    return this.request('/python-packages');
  }
  async getPythonPackage(name: string): Promise<PythonPackageDetail> {
    return this.request(`/python-packages/${name}`);
  }

  // Dep health
  async getDepHealth(): Promise<DepHealthSummary> {
    return this.request('/dep-health');
  }

  // Rules
  async listRules(params?: { category?: string; source?: string; enabled_only?: boolean }): Promise<RuleDetail[]> {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.source) qs.set('source', params.source);
    if (params?.enabled_only) qs.set('enabled_only', 'true');
    const q = qs.toString();
    return this.request(`/rules${q ? `?${q}` : ''}`);
  }
  async getRule(ruleId: string): Promise<RuleDetail> {
    return this.request(`/rules/${ruleId}`);
  }
  async getRuleStats(): Promise<RuleStats> {
    return this.request('/rules/stats');
  }
  async updateRuleConfig(ruleId: string, body: RuleOverrideRequest): Promise<RuleDetail> {
    return this.request(`/rules/${ruleId}/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  async deleteRuleConfig(ruleId: string): Promise<void> {
    return this.requestVoid(`/rules/${ruleId}/config`, { method: 'DELETE' });
  }

  // Galaxy servers
  async listGalaxyServers(): Promise<GalaxyServer[]> {
    return this.request('/settings/galaxy-servers');
  }
  async createGalaxyServer(body: CreateGalaxyServerRequest): Promise<GalaxyServer> {
    return this.request('/settings/galaxy-servers', this.jsonBody(body));
  }
  async updateGalaxyServer(id: number, body: UpdateGalaxyServerRequest): Promise<GalaxyServer> {
    return this.request(`/settings/galaxy-servers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  async deleteGalaxyServer(id: number): Promise<void> {
    return this.requestVoid(`/settings/galaxy-servers/${id}`, { method: 'DELETE' });
  }

  // Notifications
  async listNotifications(): Promise<NotificationItem[]> {
    return this.request('/notifications');
  }
  async markNotificationRead(id: number): Promise<void> {
    return this.requestVoid(`/notifications/${id}/read`, { method: 'PATCH' });
  }
  async markAllNotificationsRead(): Promise<void> {
    return this.requestVoid('/notifications/read-all', { method: 'POST' });
  }
  async deleteNotification(id: number): Promise<void> {
    return this.requestVoid(`/notifications/${id}`, { method: 'DELETE' });
  }

  // Operations
  async startOperation(projectId: string, body: { scan_type: string; options?: Record<string, unknown> }): Promise<unknown> {
    return this.request(`/projects/${projectId}/operation`, this.jsonBody(body));
  }
  async cancelOperation(projectId: string): Promise<void> {
    return this.requestVoid(`/projects/${projectId}/operation/cancel`, { method: 'POST' });
  }
  async approveOperation(projectId: string): Promise<void> {
    return this.requestVoid(`/projects/${projectId}/operation/approve`, { method: 'POST' });
  }

  // Feedback
  async getFeedbackEnabled(): Promise<{ enabled: boolean }> {
    return this.request('/feedback/enabled');
  }
  async submitFeedback(body: Record<string, unknown>): Promise<void> {
    return this.requestVoid('/feedback', this.jsonBody(body));
  }

  async getProxyBaseUrl(): Promise<string> {
    return `${await this.baseUrl()}/api/v1`;
  }
}
