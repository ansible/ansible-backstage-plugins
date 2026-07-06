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

import {
  Project,
  Violation,
  Rule,
  ScanResult,
  HealthStatus,
  CreateProjectRequest,
  Activity,
  OperationState,
  Proposal,
  ProjectDependencies,
} from '@ansible/backstage-apme-common/types';
import { ApmeApi } from '../ApmeApi';
import {
  MOCK_HEALTH,
  MOCK_PROJECTS,
  MOCK_VIOLATIONS,
  MOCK_RULES,
  MOCK_ACTIVITY,
} from './fixtures';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

interface ScanState {
  operationId: string;
  startedAt: number;
  durationMs: number;
  proposals?: Proposal[];
  completed: boolean;
  projectId: string;
}

interface RemediateState {
  operationId: string;
  startedAt: number;
  durationMs: number;
  projectId: string;
  violationIds: number[];
  completed: boolean;
}

export class MockApmeApiClient implements ApmeApi {
  private projects: Project[] = MOCK_PROJECTS.map(p => ({ ...p }));
  private violations: Record<string, Violation[]> = { ...MOCK_VIOLATIONS };
  private activeScans: Map<string, ScanState> = new Map();
  private activeRemediations: Map<string, RemediateState> = new Map();
  private nextProjectId = 100;
  private nextPrNumber = 142;

  async getHealth(): Promise<HealthStatus> {
    await delay(100);
    return { ...MOCK_HEALTH };
  }

  async getPortalSettings() {
    await delay(50);
    return { enableAi: true, publishViaGateway: false };
  }

  async getAiStatus() {
    await delay(50);
    return { enableAi: true, connected: true, modelCount: 1 };
  }

  async getProjects(): Promise<Project[]> {
    await delay(200);
    return this.projects.map(p => {
      const violations = this.violations[p.id] ?? [];
      const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      for (const v of violations) {
        const level = v.level as keyof typeof counts;
        if (level in counts) counts[level]++;
        else if (v.level === 'blocker' || v.level === 'error')
          counts.critical++;
      }
      return { ...p, violationCounts: counts };
    });
  }

  async getProject(projectId: string): Promise<Project> {
    await delay(100);
    const project = this.projects.find(p => p.id === projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    return { ...project };
  }

  async getProjectByRepoUrl(
    repoUrl: string,
    branch?: string,
  ): Promise<Project | null> {
    await delay(150);
    const normalised = repoUrl.replace(/^url:/, '').replace(/\.git$/, '');
    const project = this.projects.find(p => {
      const projUrl = p.repo_url.replace(/\.git$/, '');
      const urlMatch =
        projUrl === normalised ||
        projUrl.endsWith(normalised.split('/').slice(-2).join('/'));
      if (!urlMatch) {
        return false;
      }
      if (branch !== undefined && branch !== '') {
        return p.branch === branch;
      }
      return true;
    });
    return project ? { ...project } : null;
  }

  async getViolations(
    projectId: string,
    options?: { limit?: number },
  ): Promise<Violation[]> {
    await delay(200);
    const rows = (this.violations[projectId] ?? []).map(v => ({ ...v }));
    if (options?.limit !== undefined) {
      return rows.slice(0, options.limit);
    }
    return rows;
  }

  async getProjectDependencies(
    projectId: string,
  ): Promise<ProjectDependencies> {
    await delay(200);
    const violations = this.violations[projectId] ?? [];
    const depViolations = violations.filter(v => v.category === 'dependencies');
    const pythonNames = new Set<string>();
    for (const v of depViolations) {
      if (v.validator_source === 'dep_audit') {
        const name = v.message.split(/\s+/)[0];
        if (name) pythonNames.add(name);
      }
    }
    return {
      ansible_core_version: '2.16.0',
      collections: [
        {
          fqcn: 'ansible.posix',
          version: '1.5.4',
          source: 'specified',
        },
      ],
      python_packages: [...pythonNames].map(name => ({
        name,
        version: '0.0.0',
      })),
      requirements_files: ['requirements.txt'],
      dependency_tree: '',
    };
  }

  async getRules(): Promise<Rule[]> {
    await delay(300);
    return MOCK_RULES.map(r => ({ ...r }));
  }

  async triggerScan(projectId: string): Promise<ScanResult> {
    await delay(300);
    const operationId = `op-scan-${Date.now()}`;
    this.activeScans.set(projectId, {
      operationId,
      startedAt: Date.now(),
      durationMs: 10000, // 10s simulated scan
      completed: false,
      projectId,
    });
    const proj = this.projects.find(p => p.id === projectId);
    if (proj) proj.active_operation = operationId;
    return { scanId: operationId, projectId, status: 'running' };
  }

  async createProject(request: CreateProjectRequest): Promise<Project> {
    await delay(400);
    const newProject: Project = {
      id: `proj-${this.nextProjectId++}`,
      name: request.name,
      repo_url: request.repo_url,
      branch: request.branch ?? 'main',
      created_at: new Date().toISOString(),
      health_score: 0,
      total_violations: 0,
      scan_count: 0,
      last_scanned_at: undefined,
      scm_provider: 'github',
      has_scm_token: !!request.scm_token,
      last_scanned_commit: undefined,
      has_new_commits: false,
      active_operation: null,
    };
    this.projects.push(newProject);
    this.violations[newProject.id] = [];
    return { ...newProject };
  }

  async deleteProject(projectId: string): Promise<void> {
    await delay(200);
    this.projects = this.projects.filter(p => p.id !== projectId);
    delete this.violations[projectId];
  }

  async getActivity(projectId: string): Promise<Activity[]> {
    await delay(200);
    return (MOCK_ACTIVITY[projectId] ?? []).map(a => ({ ...a }));
  }

  async getOperationState(projectId: string): Promise<OperationState | null> {
    await delay(150);

    const scan = this.activeScans.get(projectId);
    if (scan) {
      const elapsed = Date.now() - scan.startedAt;
      const progress = Math.min(
        100,
        Math.floor((elapsed / scan.durationMs) * 100),
      );

      if (progress >= 100 && !scan.completed) {
        scan.completed = true;
        const proj = this.projects.find(p => p.id === projectId);
        if (proj) {
          proj.active_operation = null;
          proj.last_scanned_at = new Date().toISOString();
          proj.total_violations = (this.violations[projectId] ?? []).length;
          proj.scan_count += 1;
          proj.health_score = Math.max(0, 100 - proj.total_violations * 4);
        }
        this.activeScans.delete(projectId);
        return null;
      }

      let phase: string;
      let phaseLabel: string;
      if (progress < 20) {
        phase = 'cloning';
        phaseLabel = 'Cloning repository';
      } else if (progress < 60) {
        phase = 'scanning';
        phaseLabel = 'Running validators';
      } else {
        phase = 'analyzing';
        phaseLabel = 'Analyzing results';
      }
      return {
        operation_id: scan.operationId,
        project_id: projectId,
        status: 'running',
        phase,
        progress_pct: progress,
        latest_message: `${phaseLabel}… ${progress}%`,
      };
    }

    const remediation = this.activeRemediations.get(projectId);
    if (remediation) {
      const elapsed = Date.now() - remediation.startedAt;
      const progress = Math.min(
        100,
        Math.floor((elapsed / remediation.durationMs) * 100),
      );
      const processed = Math.floor(
        (progress / 100) * remediation.violationIds.length,
      );

      if (progress >= 100 && !remediation.completed) {
        remediation.completed = true;
        const proj = this.projects.find(p => p.id === projectId);
        if (proj) proj.active_operation = null;
        this.activeRemediations.delete(projectId);
        return null;
      }

      const proposals: Proposal[] = remediation.violationIds
        .slice(0, processed)
        .map(vid => {
          const violation = (this.violations[projectId] ?? []).find(
            v => v.id === vid,
          );
          const isAi = violation?.remediation_class === 2;
          return {
            id: `prop-${vid}`,
            violation_id: vid,
            rule_id: violation?.rule_id ?? 'UNKNOWN',
            file: violation?.file ?? '',
            line: violation?.line ?? 0,
            original_yaml: violation?.original_yaml ?? '',
            fixed_yaml:
              violation?.fixed_yaml ??
              (isAi ? (violation?.ai_suggestion ?? '') : ''),
            status: 'pending' as const,
            ai_reason: isAi ? violation?.ai_reason : undefined,
          };
        });

      return {
        operation_id: remediation.operationId,
        project_id: projectId,
        status: 'running',
        phase: 'generating',
        progress_pct: progress,
        latest_message: `Generating fixes… ${processed} of ${remediation.violationIds.length} processed`,
        proposals,
      };
    }

    return null;
  }

  async triggerRemediate(
    projectId: string,
    _violationIds?: number[],
  ): Promise<ScanResult> {
    await delay(300);
    const operationId = `op-rem-${Date.now()}`;
    const fixableViolations = (this.violations[projectId] ?? [])
      .filter(v => v.remediation_class === 1 || v.remediation_class === 2)
      .map(v => v.id);

    this.activeRemediations.set(projectId, {
      operationId,
      startedAt: Date.now(),
      durationMs: 8000,
      projectId,
      violationIds: fixableViolations,
      completed: false,
    });
    const proj = this.projects.find(p => p.id === projectId);
    if (proj) proj.active_operation = operationId;
    return { scanId: operationId, projectId, status: 'running' };
  }

  async approveProposals(
    projectId: string,
    proposalIds: string[],
  ): Promise<void> {
    await delay(200);
    const approvedViolationIds = proposalIds.map(pid => {
      const parts = pid.split('-');
      return parseInt(parts[parts.length - 1], 10);
    });
    this.violations[projectId] = (this.violations[projectId] ?? []).filter(
      v => !approvedViolationIds.includes(v.id),
    );
    const proj = this.projects.find(p => p.id === projectId);
    if (proj) {
      proj.total_violations = this.violations[projectId].length;
      proj.health_score = Math.max(0, 100 - proj.total_violations * 4);
    }
  }

  async createPullRequest(
    _projectId: string,
    _activityId: string,
    _options?: { scmToken?: string; branchName?: string },
  ): Promise<{ pr_url: string; branch_name?: string; provider?: string }> {
    await delay(1500);
    const prNumber = this.nextPrNumber++;
    const proj = this.projects.find(p => p.id === _projectId);
    const repoName = proj?.name ?? 'rhel-patching';
    return {
      pr_url: `https://github.com/ansible-demo/${repoName}/pull/${prNumber}`,
      branch_name: _options?.branchName ?? `apme/remediate-mock-${prNumber}`,
      provider: 'github',
    };
  }

  async getRemediationBundle(activityId: string) {
    await delay(100);
    return {
      activity_id: activityId,
      project_id: 'mock-project',
      repo_url: 'https://github.com/ansible-demo/rhel-patching.git',
      base_branch: 'main',
      scm_provider: 'github',
      branch_name: `apme/remediate-${activityId.slice(0, 8)}`,
      title: 'fix: APME remediation — mock',
      body: 'Mock remediation bundle',
      files: [],
      fixed_count: 1,
      total_violations: 1,
    };
  }

  async pushRemediationBranch(
    activityId: string,
    options?: { scmToken?: string; branchName?: string },
  ) {
    await delay(500);
    return {
      branch_name:
        options?.branchName ?? `apme/remediate-${activityId.slice(0, 8)}`,
      provider: 'github',
      repo_url: 'https://github.com/ansible-demo/rhel-patching.git',
    };
  }
}
