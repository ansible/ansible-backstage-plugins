/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export type Severity =
  'blocker' | 'critical' | 'high' | 'medium' | 'low' | 'info';

export type RemediationClass = 1 | 2 | 3 | 9; // 1=auto, 2=assisted, 3=manual, 9=none

export interface Violation {
  id: number;
  rule_id: string;
  level: string; // 'blocker', 'critical', 'high', 'medium', 'low', 'info'
  message: string;
  file: string;
  line: number;
  path?: string;
  remediation_class: RemediationClass;
  remediation_resolution?: number;
  scope?: string; // 'task', 'playbook', 'inventory', 'collection'
  category?: string; // 'lint', 'modernize', 'risk', 'secrets', 'dependencies'
  validator_source: string; // 'native', 'opa', 'ansible', 'gitleaks', 'dep_audit', 'collection_health'
  original_yaml?: string;
  fixed_yaml?: string;
  co_fixes?: string[];
  node_line_start?: number;
  ai_reason?: string;
  ai_suggestion?: string;
  /** True when an active suppression matches this violation (ADR-055). */
  suppressed?: boolean;
}

export interface ActiveOperationSummary {
  operation_id: string;
  status: string;
  scan_type?: string;
  started_at?: string;
}

/** Latest scan summary from gateway ProjectDetail.latest_scan. */
export interface LatestScanSummary {
  scan_id: string;
  scan_type: 'check' | 'remediate';
  total_violations: number;
  fixable: number;
  ai_candidate: number;
  ai_proposed?: number;
  ai_declined?: number;
  manual_review: number;
  remediated_count: number;
}

export interface Project {
  id: string;
  name: string;
  repo_url: string;
  branch: string;
  created_at: string;
  health_score: number;
  total_violations: number;
  violation_trend?: string;
  scan_count: number;
  last_scanned_at?: string;
  scm_provider?: string;
  has_scm_token: boolean;
  last_scanned_commit?: string;
  has_new_commits: boolean;
  active_operation?: ActiveOperationSummary | string | null;
  latest_scan?: LatestScanSummary | null;
  /** Raw severity counts from gateway ProjectDetail / list API. */
  severity_breakdown?: Record<string, number>;
  // Computed on frontend for display (mock / legacy)
  violationCounts?: {
    critical: number;
    error: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  /** Catalog default severity before overrides. */
  defaultSeverity?: Severity;
  category: string;
  remediationClass: RemediationClass;
  enabled: boolean;
  /** Validator source from gateway (native, opa, ansible, gitleaks). */
  source?: string;
  /** Override: enforce despite inline ignores. */
  enforced?: boolean;
  /** True when any portal override is active for this rule. */
  hasOverride?: boolean;
}

/** Payload for PUT /rules/{rule_id}/config (partial update). */
export interface RuleConfigUpdate {
  severity_override?: number | null;
  enabled_override?: boolean | null;
  enforced?: boolean | null;
}

/** Request body for POST /suppressions (ADR-055). */
export interface CreateSuppressionRequest {
  fingerprint_hash?: string;
  fingerprint_mode?: 'full' | 'rule_only';
  rule_id: string;
  original_yaml?: string;
  module_fqcn?: string;
  scope: string;
  reason?: string;
}

/** Suppression record from gateway. */
export interface Suppression {
  id: number;
  fingerprint_hash: string;
  fingerprint_mode: string;
  rule_id: string;
  scope: string;
  reason: string;
  created_by: string;
  created_at: string;
}

export interface ScanResult {
  projectId: string;
  scanId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  violations?: Violation[];
  healthScore?: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: string;
  components: Array<{
    name: string;
    status: string;
    address: string;
  }>;
}

export interface ApmeConfig {
  enabled: boolean;
  baseUrl: string;
  checkSSL: boolean;
  enableAi: boolean;
  /** When true, portal proxies PR creation to the APME gateway (standalone path). */
  publishViaGateway: boolean;
  /**
   * Client timeout for remediation submit/push/PR (ms).
   * Default 300000 (5 minutes). Large remedia pushes often need longer than 30s.
   */
  submitTimeoutMs: number;
  /** Default ansible-core version shown in UI and sent when scans omit a version. */
  targetAnsibleCoreVersion?: string;
  /** Optional path for persisted portal scan-target settings JSON. */
  portalSettingsPath?: string;
}

/** Portal-side APME settings (backend app-config source of truth). */
export interface ApmePortalSettings {
  enableAi: boolean;
  publishViaGateway: boolean;
  targetAnsibleCoreVersion?: string;
}

export type ScanTargetSource = 'project' | 'global' | 'config' | 'default';

/** Effective scan target for a project (portal API). */
export interface ProjectScanTarget {
  effective: string;
  source: ScanTargetSource;
  globalDefault: string;
  projectOverride?: string;
}

export interface UpdatePortalSettingsRequest {
  targetAnsibleCoreVersion?: string;
}

export interface UpdateProjectScanTargetRequest {
  targetAnsibleCoreVersion: string | null;
}

export interface ScanTriggerOptions {
  ansibleVersion?: string;
  userIdentity?: { userEntityRef: string; orgEntityRef?: string };
  /** One-time SCM token for private-repo clone (portal integration / user). */
  scmToken?: string;
}

/** Gateway AI service reachability (Abbenay via Primary). */
export interface ApmeAiStatus {
  /** Portal ansible.apme.enableAi — scans/remediate send enable_ai when true. */
  enableAi: boolean;
  /** True when Abbenay is reachable or at least one model is listed. */
  connected: boolean;
  modelCount: number;
}

export interface CreatePullRequestResult {
  pr_url: string;
  branch_name?: string;
  provider?: string;
  commit_sha?: string;
}

/** Request body for gateway SCM submit (ADR-050). */
export interface SubmitRemediationRequest {
  activity_id: string;
  branch_name?: string;
  create_pr?: boolean;
  title?: string;
  body?: string;
  scm_token?: string;
}

/** Response from gateway SCM submit (ADR-050). */
export interface SubmitRemediationResult {
  branch_name: string;
  commit_sha: string;
  pr_url: string | null;
  provider: string;
}

export interface RemediationBundleFile {
  path: string;
  content_base64: string;
}

export interface RemediationBundle {
  activity_id: string;
  project_id: string;
  repo_url: string;
  base_branch: string;
  scm_provider: string;
  branch_name: string;
  title: string;
  body: string;
  files: RemediationBundleFile[];
  pr_url?: string | null;
  fixed_count: number;
  total_violations: number;
}

export interface PushBranchResult {
  branch_name: string;
  provider: string;
  repo_url: string;
}

export interface CreateProjectRequest {
  name: string;
  repo_url: string;
  branch?: string;
  scm_token?: string;
}

export interface Activity {
  scan_id: string;
  session_id: string;
  project_path: string;
  source: string;
  created_at: string;
  scan_type: 'check' | 'remediate';
  total_violations: number;
  fixable: number;
  ai_candidate: number;
  ai_proposed: number;
  ai_declined: number;
  ai_accepted: number;
  manual_review: number;
  remediated_count: number;
  pr_url?: string | null;
  branch_name?: string | null;
}

/** Summary row persisted for an AI proposal on a scan (gateway activity detail). */
export interface ActivityProposalSummary {
  id: number;
  proposal_id: string;
  rule_id: string;
  file: string;
  tier: number;
  confidence: number;
  status: string;
}

/** Full scan run detail from gateway GET /activity/{scan_id}. */
export interface ActivityDetail extends Activity {
  project_id?: string;
  violations: Violation[];
  proposals: ActivityProposalSummary[];
}

export interface CollectionRef {
  fqcn: string;
  version: string;
  source: string;
  license?: string;
  supplier?: string;
}

export interface PythonPackageRef {
  name: string;
  version: string;
  license?: string;
  supplier?: string;
}

/** Project dependency manifest from gateway GET /projects/{id}/dependencies (ADR-040). */
export interface ProjectDependencies {
  ansible_core_version: string;
  collections: CollectionRef[];
  python_packages: PythonPackageRef[];
  requirements_files: string[];
  dependency_tree: string;
}

export interface Proposal {
  id: string;
  violation_id: number;
  rule_id: string;
  file: string;
  line: number;
  original_yaml: string;
  fixed_yaml: string;
  status: 'pending' | 'accepted' | 'declined';
  /** Portal / mock field; gateway sends `explanation` (mapped on ingest). */
  ai_reason?: string;
  /** Gateway remediation tier: 1 = deterministic, 2+ = AI-assisted. */
  tier?: number;
  confidence?: number;
  explanation?: string;
  diff_hunk?: string;
  suggestion?: string;
}

export interface OperationProgressEntry {
  phase: string;
  message: string;
  timestamp: string;
  progress?: number | null;
  level?: number | null;
}

export interface OperationState {
  operation_id: string;
  project_id: string;
  scan_id?: string;
  status: string;
  scan_type?: string;
  started_at?: string;
  phase?: string;
  progress_pct?: number;
  latest_message?: string;
  progress?: OperationProgressEntry[];
  proposals?: Proposal[];
  error?: string;
  result?: {
    total_violations: number;
    fixable: number;
    remediated: number;
    remediated_count?: number;
    fixed_violations?: Array<{
      rule_id: string;
      file: string;
      line?: number | null;
      message?: string;
      path?: string;
      severity?: string;
    }>;
    patches?: Array<{ file: string; diff: string }>;
  };
}
