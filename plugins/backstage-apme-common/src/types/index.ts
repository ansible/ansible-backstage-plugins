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
  // Computed on frontend for display
  violationCounts?: {
    critical: number;
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
  category: string;
  remediationClass: RemediationClass;
  enabled: boolean;
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
}

/** Portal-side APME settings (backend app-config source of truth). */
export interface ApmePortalSettings {
  enableAi: boolean;
  publishViaGateway: boolean;
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
  ai_reason?: string;
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
