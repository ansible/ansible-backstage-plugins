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
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import type {
  Project,
  Violation,
  Rule,
  ScanResult,
  HealthStatus,
  CreateProjectRequest,
  Activity,
  ActivityDetail,
  OperationState,
  CreatePullRequestResult,
  SubmitRemediationResult,
  ApmePortalSettings,
  ApmeAiStatus,
  ProjectDependencies,
  RuleConfigUpdate,
  CreateSuppressionRequest,
  Suppression,
} from '@ansible/backstage-apme-common/types';
import {
  normalizeGatewayRules,
  normalizeGatewayRule,
  type GatewayRuleRow,
} from '../utils/gatewayRules';

export interface ApmeScmRequestOptions {
  scmToken?: string;
  branchName?: string;
}

export interface ApmeViolationsOptions {
  limit?: number;
}

export interface ApmeApi {
  getHealth(): Promise<HealthStatus>;
  getPortalSettings(): Promise<ApmePortalSettings>;
  getAiStatus(): Promise<ApmeAiStatus>;
  getProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project>;
  getProjectByRepoUrl(
    repoUrl: string,
    branch?: string,
  ): Promise<Project | null>;
  getViolations(
    projectId: string,
    options?: ApmeViolationsOptions,
  ): Promise<Violation[]>;
  getProjectDependencies(projectId: string): Promise<ProjectDependencies>;
  getRules(): Promise<Rule[]>;
  updateRuleConfig(ruleId: string, body: RuleConfigUpdate): Promise<Rule>;
  deleteRuleConfig(ruleId: string): Promise<void>;
  createSuppression(body: CreateSuppressionRequest): Promise<Suppression>;
  deleteSuppression(suppressionId: number): Promise<void>;
  getSuppressions(scope?: string): Promise<Suppression[]>;
  triggerScan(projectId: string): Promise<ScanResult>;
  createProject(request: CreateProjectRequest): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;
  getActivity(projectId: string): Promise<Activity[]>;
  getActivityDetail(activityId: string): Promise<ActivityDetail>;
  getOperationState(projectId: string): Promise<OperationState | null>;
  triggerRemediate(
    projectId: string,
    violationIds?: number[],
  ): Promise<ScanResult>;
  approveProposals(projectId: string, proposalIds: string[]): Promise<void>;
  submitRemediation(
    projectId: string,
    activityId: string,
    options?: ApmeScmRequestOptions & { createPr?: boolean },
  ): Promise<SubmitRemediationResult>;
  pushRemediationBranch(
    projectId: string,
    activityId: string,
    options?: ApmeScmRequestOptions,
  ): Promise<SubmitRemediationResult>;
  createPullRequest(
    projectId: string,
    activityId: string,
    options?: ApmeScmRequestOptions,
  ): Promise<CreatePullRequestResult>;
}

export const apmeApiRef = createApiRef<ApmeApi>({ id: 'plugin.apme.api' });

export interface ApmeApiClientOptions {
  discoveryApi: DiscoveryApi;
  fetchApi: FetchApi;
}

export class ApmeApiClient implements ApmeApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: ApmeApiClientOptions) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async getBaseUrl(): Promise<string> {
    return `${await this.discoveryApi.getBaseUrl('catalog')}/apme`;
  }

  private async fetch<T>(
    endpoint: string,
    options?: RequestInit,
    fetchOptions?: { notFoundReturnsNull?: boolean },
  ): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const response = await this.fetchApi.fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (response.status === 404 && fetchOptions?.notFoundReturnsNull) {
      return null as T;
    }

    if (!response.ok) {
      const errorText = await response.text();
      const method = (options?.method ?? 'GET').toUpperCase();
      const isStartOperation =
        method === 'POST' && /\/operation$/.test(endpoint);
      if (response.status === 409 && isStartOperation) {
        throw new Error('A scan is already in progress for this project');
      }
      if (response.status === 409) {
        throw new Error(
          errorText
            ? `APME API conflict: ${errorText}`
            : 'APME API conflict: request could not be completed',
        );
      }
      throw new Error(
        `APME API error: ${response.status} - ${errorText || response.statusText}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  async getHealth(): Promise<HealthStatus> {
    return this.fetch<HealthStatus>('/health');
  }

  async getPortalSettings(): Promise<ApmePortalSettings> {
    return this.fetch<ApmePortalSettings>('/settings');
  }

  async getAiStatus(): Promise<ApmeAiStatus> {
    return this.fetch<ApmeAiStatus>('/ai/status');
  }

  async getProjects(): Promise<Project[]> {
    const response = await this.fetch<{ items: Project[] }>('/projects');
    return response.items || [];
  }

  async getProject(projectId: string): Promise<Project> {
    return this.fetch<Project>(`/projects/${projectId}`);
  }

  async getProjectByRepoUrl(
    repoUrl: string,
    branch?: string,
  ): Promise<Project | null> {
    const branchQuery =
      branch !== undefined && branch !== ''
        ? `&branch=${encodeURIComponent(branch)}`
        : '';
    return this.fetch<Project | null>(
      `/lookup?repo_url=${encodeURIComponent(repoUrl)}${branchQuery}`,
      undefined,
      { notFoundReturnsNull: true },
    );
  }

  async getViolations(
    projectId: string,
    options?: ApmeViolationsOptions,
  ): Promise<Violation[]> {
    const limitQuery =
      options?.limit !== undefined ? `?limit=${options.limit}` : '';
    const response = await this.fetch<Violation[]>(
      `/projects/${projectId}/violations${limitQuery}`,
    );
    return response || [];
  }

  async getProjectDependencies(
    projectId: string,
  ): Promise<ProjectDependencies> {
    return this.fetch<ProjectDependencies>(
      `/projects/${projectId}/dependencies`,
    );
  }

  async getRules(): Promise<Rule[]> {
    const response = await this.fetch<{ items: GatewayRuleRow[] }>('/rules');
    return normalizeGatewayRules(response.items || []);
  }

  async updateRuleConfig(
    ruleId: string,
    body: RuleConfigUpdate,
  ): Promise<Rule> {
    const response = await this.fetch<GatewayRuleRow>(
      `/rules/${encodeURIComponent(ruleId)}/config`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );
    return normalizeGatewayRule(response);
  }

  async deleteRuleConfig(ruleId: string): Promise<void> {
    await this.fetch<void>(`/rules/${encodeURIComponent(ruleId)}/config`, {
      method: 'DELETE',
    });
  }

  async createSuppression(
    body: CreateSuppressionRequest,
  ): Promise<Suppression> {
    return this.fetch<Suppression>('/suppressions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async deleteSuppression(suppressionId: number): Promise<void> {
    await this.fetch<void>(`/suppressions/${suppressionId}`, {
      method: 'DELETE',
    });
  }

  async getSuppressions(scope?: string): Promise<Suppression[]> {
    const query =
      scope !== undefined && scope !== ''
        ? `?scope=${encodeURIComponent(scope)}`
        : '';
    return this.fetch<Suppression[]>(`/suppressions${query}`);
  }

  async triggerScan(projectId: string): Promise<ScanResult> {
    const response = await this.fetch<{ operation_id: string }>(
      `/projects/${projectId}/operation`,
      {
        method: 'POST',
        body: JSON.stringify({ action: 'check', options: {} }),
      },
    );
    return { scanId: response.operation_id, projectId, status: 'running' };
  }

  async createProject(request: CreateProjectRequest): Promise<Project> {
    return this.fetch<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.fetch<void>(`/projects/${projectId}`, { method: 'DELETE' });
  }

  async getActivity(projectId: string): Promise<Activity[]> {
    return this.fetch<Activity[]>(`/projects/${projectId}/activity`);
  }

  async getActivityDetail(activityId: string): Promise<ActivityDetail> {
    return this.fetch<ActivityDetail>(`/activity/${activityId}`);
  }

  async getOperationState(projectId: string): Promise<OperationState | null> {
    return this.fetch<OperationState | null>(
      `/projects/${projectId}/operation/state`,
      undefined,
      { notFoundReturnsNull: true },
    );
  }

  async triggerRemediate(
    projectId: string,
    violationIds?: number[],
  ): Promise<ScanResult> {
    const body: Record<string, unknown> = {};
    if (violationIds && violationIds.length > 0) {
      body.violation_ids = violationIds;
    }
    const response = await this.fetch<{ operation_id: string }>(
      `/projects/${projectId}/remediate`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
    return { scanId: response.operation_id, projectId, status: 'running' };
  }

  async approveProposals(
    projectId: string,
    proposalIds: string[],
  ): Promise<void> {
    await this.fetch<void>(`/projects/${projectId}/operation/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved_ids: proposalIds }),
    });
  }

  private scmHeaders(options?: ApmeScmRequestOptions): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = options?.scmToken?.trim();
    if (token) {
      headers['X-SCM-Token'] = token;
    }
    return headers;
  }

  async submitRemediation(
    projectId: string,
    activityId: string,
    options?: ApmeScmRequestOptions & { createPr?: boolean },
  ): Promise<SubmitRemediationResult> {
    return this.fetch<SubmitRemediationResult>(
      `/projects/${projectId}/submit`,
      {
        method: 'POST',
        headers: this.scmHeaders(options),
        body: JSON.stringify({
          activity_id: activityId,
          branch_name: options?.branchName,
          create_pr: options?.createPr,
        }),
      },
    );
  }

  async pushRemediationBranch(
    projectId: string,
    activityId: string,
    options?: ApmeScmRequestOptions,
  ): Promise<SubmitRemediationResult> {
    return this.submitRemediation(projectId, activityId, {
      ...options,
      createPr: false,
    });
  }

  async createPullRequest(
    projectId: string,
    activityId: string,
    options?: ApmeScmRequestOptions,
  ): Promise<CreatePullRequestResult> {
    const result = await this.submitRemediation(projectId, activityId, {
      ...options,
      createPr: true,
    });
    if (!result.pr_url) {
      throw new Error('Gateway submit completed without a PR URL');
    }
    return {
      pr_url: result.pr_url,
      branch_name: result.branch_name,
      provider: result.provider,
      commit_sha: result.commit_sha,
    };
  }
}
