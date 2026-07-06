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
  OperationState,
  RemediationBundle,
  PushBranchResult,
  CreatePullRequestResult,
  ApmePortalSettings,
  ApmeAiStatus,
  ProjectDependencies,
} from '@ansible/backstage-apme-common/types';
import {
  normalizeGatewayRules,
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
  triggerScan(projectId: string): Promise<ScanResult>;
  createProject(request: CreateProjectRequest): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;
  getActivity(projectId: string): Promise<Activity[]>;
  getOperationState(projectId: string): Promise<OperationState | null>;
  triggerRemediate(
    projectId: string,
    violationIds?: number[],
  ): Promise<ScanResult>;
  approveProposals(projectId: string, proposalIds: string[]): Promise<void>;
  getRemediationBundle(activityId: string): Promise<RemediationBundle>;
  pushRemediationBranch(
    activityId: string,
    options?: ApmeScmRequestOptions,
  ): Promise<PushBranchResult>;
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
      if (response.status === 409) {
        throw new Error('A scan is already in progress for this project');
      }
      const errorText = await response.text();
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
      headers['X-Github-Token'] = token;
      headers['X-Gitlab-Token'] = token;
    }
    return headers;
  }

  async getRemediationBundle(activityId: string): Promise<RemediationBundle> {
    return this.fetch<RemediationBundle>(
      `/activity/${activityId}/remediation-bundle`,
    );
  }

  async pushRemediationBranch(
    activityId: string,
    options?: ApmeScmRequestOptions,
  ): Promise<PushBranchResult> {
    return this.fetch<PushBranchResult>(`/activity/${activityId}/push-branch`, {
      method: 'POST',
      headers: this.scmHeaders(options),
      body: JSON.stringify({
        branch_name: options?.branchName,
      }),
    });
  }

  async createPullRequest(
    projectId: string,
    activityId: string,
    options?: ApmeScmRequestOptions,
  ): Promise<CreatePullRequestResult> {
    return this.fetch<CreatePullRequestResult>(
      `/activity/${activityId}/pull-request`,
      {
        method: 'POST',
        headers: this.scmHeaders(options),
        body: JSON.stringify({
          projectId,
          scm_token: options?.scmToken,
          branch_name: options?.branchName,
        }),
      },
    );
  }
}
