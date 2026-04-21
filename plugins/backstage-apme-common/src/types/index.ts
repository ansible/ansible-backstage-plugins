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

export type Severity = 'blocker' | 'critical' | 'high' | 'medium' | 'low' | 'info';

export type RemediationClass = 1 | 2 | 3 | 9; // 1=auto, 2=assisted, 3=manual, 9=none

export interface Violation {
  id: number;
  rule_id: string;
  level: string;  // 'blocker', 'critical', 'high', 'medium', 'low', 'info'
  message: string;
  file: string;
  line: number;
  path?: string;
  remediation_class: RemediationClass;
  remediation_resolution?: number;
  scope?: number;
  validator_source: string;  // 'native', 'opa', 'ansible', 'gitleaks'
  original_yaml?: string;
  fixed_yaml?: string;
  co_fixes?: string[];
  node_line_start?: number;
  ai_reason?: string;
  ai_suggestion?: string;
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
  active_operation?: string | null;
  // Computed on frontend for display
  violationCounts?: {
    blocker: number;
    critical: number;
    major: number;
    minor: number;
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
  baseUrl: string;
  checkSSL: boolean;
}
