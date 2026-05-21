import { createApiRef } from '@backstage/core-plugin-api';
import type {
  ActiveOperation,
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
  StartOperationOptions,
  TopViolation,
  TrendPoint,
  UpdateGalaxyServerRequest,
  UpdateProjectRequest,
  ViolationDetail,
} from '../types/api';

export interface ApmeApi {
  getHealth(): Promise<HealthStatus>;

  // Sessions
  listSessions(
    limit?: number,
    offset?: number,
  ): Promise<PaginatedResponse<SessionSummary>>;
  getSession(sessionId: string): Promise<SessionDetail>;
  getSessionTrend(sessionId: string): Promise<TrendPoint[]>;

  // Activity
  listActivity(
    limit?: number,
    offset?: number,
    sessionId?: string,
  ): Promise<PaginatedResponse<ActivitySummary>>;
  getActivity(scanId: string): Promise<ActivityDetail>;
  deleteActivity(scanId: string): Promise<void>;
  createPullRequest(
    scanId: string,
    body: CreatePullRequestRequest,
  ): Promise<CreatePullRequestResponse>;

  // Stats
  getTopViolations(limit?: number): Promise<TopViolation[]>;
  getRemediationRates(limit?: number): Promise<RemediationRateEntry[]>;
  getAiAcceptance(): Promise<AiAcceptanceEntry[]>;
  listAiModels(): Promise<AiModelInfo[]>;

  // Projects
  listProjects(
    limit?: number,
    offset?: number,
    sortBy?: string,
    order?: string,
  ): Promise<PaginatedResponse<ProjectSummary>>;
  getProject(id: string): Promise<ProjectDetail>;
  createProject(body: CreateProjectRequest): Promise<ProjectDetail>;
  updateProject(id: string, body: UpdateProjectRequest): Promise<ProjectDetail>;
  deleteProject(id: string): Promise<void>;
  getProjectActivity(id: string): Promise<ActivitySummary[]>;
  getProjectViolations(id: string): Promise<ViolationDetail[]>;
  getProjectTrend(id: string): Promise<TrendPoint[]>;
  getProjectDependencies(id: string): Promise<ProjectDependencies>;
  getProjectDepHealth(id: string): Promise<DepHealthSummary>;
  getProjectGraph(id: string): Promise<GraphData>;
  getProjectSbom(id: string): Promise<Blob>;
  getProjectOperation(id: string): Promise<unknown>;
  createPR(projectId: string): Promise<{ pr_url: string }>;

  // Dashboard
  getDashboardSummary(): Promise<DashboardSummary>;
  getDashboardRankings(
    sortBy?: string,
    order?: string,
    limit?: number,
  ): Promise<ProjectRanking[]>;
  getActiveOperations(): Promise<ActiveOperation[]>;

  // Collections
  listCollections(): Promise<CollectionSummary[]>;
  getCollection(fqcn: string): Promise<CollectionDetail>;

  // Python packages
  listPythonPackages(): Promise<PythonPackageSummary[]>;
  getPythonPackage(name: string): Promise<PythonPackageDetail>;

  // Dep health
  getDepHealth(): Promise<DepHealthSummary>;
  getDepHealthSummary(): Promise<DepHealthSummary>;

  // Rules
  listRules(params?: {
    category?: string;
    source?: string;
    enabled_only?: boolean;
  }): Promise<RuleDetail[]>;
  getRule(ruleId: string): Promise<RuleDetail>;
  getRuleStats(): Promise<RuleStats>;
  updateRuleConfig(
    ruleId: string,
    body: RuleOverrideRequest,
  ): Promise<RuleDetail>;
  deleteRuleConfig(ruleId: string): Promise<void>;

  // Galaxy servers (settings)
  listGalaxyServers(): Promise<GalaxyServer[]>;
  createGalaxyServer(body: CreateGalaxyServerRequest): Promise<GalaxyServer>;
  updateGalaxyServer(
    id: number,
    body: UpdateGalaxyServerRequest,
  ): Promise<GalaxyServer>;
  deleteGalaxyServer(id: number): Promise<void>;

  // Notifications
  listNotifications(): Promise<NotificationItem[]>;
  markNotificationRead(id: number): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  deleteNotification(id: number): Promise<void>;

  // Operations (project-scoped check/remediate)
  startOperation(
    projectId: string,
    body: { action: 'check' | 'remediate'; options?: StartOperationOptions },
  ): Promise<unknown>;
  cancelOperation(projectId: string): Promise<void>;
  approveOperation(projectId: string, approvedIds: string[]): Promise<void>;

  // Feedback
  getFeedbackEnabled(): Promise<{ enabled: boolean }>;
  submitFeedback(body: Record<string, unknown>): Promise<void>;

  /** Resolves the proxy base URL for EventSource / WebSocket connections. */
  getProxyBaseUrl(): Promise<string>;
}

export const apmeApiRef = createApiRef<ApmeApi>({
  id: 'plugin.apme.api',
});
