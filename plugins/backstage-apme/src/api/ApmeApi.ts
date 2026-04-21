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

import { createApiRef, DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import {
  Project,
  Violation,
  Rule,
  ScanResult,
  HealthStatus,
  CreateProjectRequest,
  Activity,
  OperationState,
} from '@ansible/backstage-apme-common';

export interface ApmeApi {
  getHealth(): Promise<HealthStatus>;
  getProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project>;
  getProjectByRepoUrl(repoUrl: string): Promise<Project | null>;
  getViolations(projectId: string): Promise<Violation[]>;
  getRules(): Promise<Rule[]>;
  triggerScan(projectId: string): Promise<ScanResult>;
  createProject(request: CreateProjectRequest): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;
  getActivity(projectId: string): Promise<Activity[]>;
  getOperationState(projectId: string): Promise<OperationState | null>;
  triggerRemediate(projectId: string): Promise<ScanResult>;
  approveProposals(projectId: string, proposalIds: string[]): Promise<void>;
  createPullRequest(projectId: string, activityId: string): Promise<{ pr_url: string }>;
}

export const apmeApiRef = createApiRef<ApmeApi>({
  id: 'plugin.apme.api',
});

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

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const response = await this.fetchApi.fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 409) {
        throw new Error('A scan is already in progress for this project');
      }
      const error = await response.text();
      throw new Error(`APME API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getHealth(): Promise<HealthStatus> {
    return this.fetch<HealthStatus>('/health');
  }

  async getProjects(): Promise<Project[]> {
    const response = await this.fetch<{ items: Project[] }>('/projects');
    return response.items || [];
  }

  async getProject(projectId: string): Promise<Project> {
    return this.fetch<Project>(`/projects/${projectId}`);
  }

  async getProjectByRepoUrl(repoUrl: string): Promise<Project | null> {
    try {
      return await this.fetch<Project>(
        `/lookup?repo_url=${encodeURIComponent(repoUrl)}`,
      );
    } catch {
      return null;
    }
  }

  async getViolations(projectId: string): Promise<Violation[]> {
    const response = await this.fetch<Violation[]>(
      `/projects/${projectId}/violations`,
    );
    return response || [];
  }

  async getRules(): Promise<Rule[]> {
    const response = await this.fetch<{ items: Rule[] }>('/rules');
    return response.items || [];
  }

  async triggerScan(projectId: string): Promise<ScanResult> {
    const response = await this.fetch<{ operation_id: string }>(
      `/projects/${projectId}/operation`,
      {
        method: 'POST',
        body: JSON.stringify({ action: 'check', options: {} }),
      },
    );
    return {
      scanId: response.operation_id,
      projectId,
      status: 'running',
    };
  }

  async createProject(request: CreateProjectRequest): Promise<Project> {
    return this.fetch<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.fetch<void>(`/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  async getActivity(projectId: string): Promise<Activity[]> {
    return this.fetch<Activity[]>(`/projects/${projectId}/activity`);
  }

  async getOperationState(projectId: string): Promise<OperationState | null> {
    try {
      return await this.fetch<OperationState>(`/projects/${projectId}/operation/state`);
    } catch {
      return null;
    }
  }

  async triggerRemediate(projectId: string): Promise<ScanResult> {
    const response = await this.fetch<{ operation_id: string }>(
      `/projects/${projectId}/remediate`,
      { method: 'POST' },
    );
    return {
      scanId: response.operation_id,
      projectId,
      status: 'running',
    };
  }

  async approveProposals(projectId: string, proposalIds: string[]): Promise<void> {
    await this.fetch<void>(`/projects/${projectId}/operation/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved_ids: proposalIds }),
    });
  }

  async createPullRequest(projectId: string, activityId: string): Promise<{ pr_url: string }> {
    return this.fetch<{ pr_url: string }>(`/activity/${activityId}/pull-request`, {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
  }
}
