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

import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import { ConflictError, InputError, NotFoundError } from '@backstage/errors';
import { getApmeConfig } from '../config';
import { normalizeRemediationClass } from '../severity';
import {
  Project,
  Violation,
  Rule,
  ScanResult,
  HealthStatus,
  CreateProjectRequest,
  Activity,
  OperationState,
  RemediationBundle,
  CreatePullRequestResult,
  RemediationClass,
} from '../types';

export interface ApmeClientOptions {
  rootConfig: Config;
  logger: LoggerService;
}

export { getApmeConfig } from '../config';

export class ApmeClient {
  private readonly baseUrl: string;
  private readonly enableAi: boolean;
  private readonly logger: LoggerService;

  constructor(options: ApmeClientOptions) {
    const config = getApmeConfig(options.rootConfig);
    this.baseUrl = config.baseUrl;
    this.enableAi = config.enableAi;
    // Note: checkSSL config is available but not used yet (for future TLS verification)
    this.logger = options.logger.child({ service: 'ApmeClient' });
    this.logger.info(`APME client initialized with baseUrl: ${this.baseUrl}`);
  }

  private scanOperationOptions(): Record<string, boolean> {
    return { enable_ai: this.enableAi };
  }

  private buildUrl(endpoint: string): string {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${this.baseUrl}${path}`;
  }

  private async executeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = this.buildUrl(endpoint);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (response.status === 404) {
        throw new NotFoundError(`Resource not found: ${endpoint}`);
      }

      if (response.status === 409) {
        throw new ConflictError(
          'A scan is already in progress for this project',
        );
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new InputError(
          `APME request failed: ${response.status} ${response.statusText} - ${errorBody}`,
        );
      }

      // Handle 204 No Content responses
      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof InputError ||
        error instanceof ConflictError
      ) {
        throw error;
      }
      this.logger.error(`APME request failed: ${endpoint}`, error as Error);
      throw new InputError(
        `Failed to connect to APME: ${(error as Error).message}`,
      );
    }
  }

  async getHealth(): Promise<HealthStatus> {
    return this.executeRequest<HealthStatus>('/api/v1/health');
  }

  async getAiModels(): Promise<
    Array<{ id: string; provider: string; name: string }>
  > {
    try {
      return await this.executeRequest<
        Array<{ id: string; provider: string; name: string }>
      >('/api/v1/ai/models');
    } catch {
      return [];
    }
  }

  async getProjects(): Promise<Project[]> {
    const response = await this.executeRequest<{ items: Project[] }>(
      '/api/v1/projects',
    );
    return response.items || [];
  }

  async getProject(projectId: string): Promise<Project> {
    return this.executeRequest<Project>(`/api/v1/projects/${projectId}`);
  }

  async getProjectByRepoUrl(
    repoUrl: string,
    branch?: string,
  ): Promise<Project | null> {
    try {
      const branchQuery =
        branch !== undefined && branch !== ''
          ? `&branch=${encodeURIComponent(branch)}`
          : '';
      const project = await this.executeRequest<Project>(
        `/api/v1/projects/lookup?repo_url=${encodeURIComponent(repoUrl)}${branchQuery}`,
      );
      return project;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return null;
      }
      throw error;
    }
  }

  async getViolations(
    projectId: string,
    options?: { limit?: number },
  ): Promise<Violation[]> {
    const limitQuery =
      options?.limit !== undefined ? `?limit=${options.limit}` : '';
    // APME returns violations as a direct array, not wrapped in {items: []}
    const response = await this.executeRequest<Violation[]>(
      `/api/v1/projects/${projectId}/violations${limitQuery}`,
    );
    return (response || []).map(v => ({
      ...v,
      remediation_class: normalizeRemediationClass(
        v.remediation_class,
      ) as RemediationClass,
    }));
  }

  async getRules(): Promise<Rule[]> {
    const response = await this.executeRequest<{ items: Rule[] }>(
      '/api/v1/rules',
    );
    return response.items || [];
  }

  async triggerScan(
    projectId: string,
    userIdentity?: { userEntityRef: string; orgEntityRef?: string },
  ): Promise<ScanResult> {
    const headers: Record<string, string> = {};
    if (userIdentity) {
      headers['X-User'] = userIdentity.userEntityRef;
      if (userIdentity.orgEntityRef) {
        headers['X-Org'] = userIdentity.orgEntityRef;
      }
    }

    // Use the operation endpoint (ADR-052) to trigger a check
    const response = await this.executeRequest<{ operation_id: string }>(
      `/api/v1/projects/${projectId}/operation`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'check',
          options: this.scanOperationOptions(),
        }),
      },
    );

    return {
      scanId: response.operation_id,
      projectId,
      status: 'running',
    };
  }

  async getScanStatus(projectId: string, scanId: string): Promise<ScanResult> {
    return this.executeRequest<ScanResult>(
      `/api/v1/projects/${projectId}/scans/${scanId}`,
    );
  }

  async createProject(request: CreateProjectRequest): Promise<Project> {
    return this.executeRequest<Project>('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.executeRequest<void>(`/api/v1/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  async getActivity(projectId: string): Promise<Activity[]> {
    const response = await this.executeRequest<{ items: Activity[] }>(
      `/api/v1/projects/${projectId}/activity`,
    );
    return response.items || [];
  }

  async getOperationState(projectId: string): Promise<OperationState | null> {
    try {
      return await this.executeRequest<OperationState>(
        `/api/v1/projects/${projectId}/operation`,
      );
    } catch (error) {
      if (error instanceof NotFoundError) {
        return null;
      }
      throw error;
    }
  }

  async triggerRemediate(
    projectId: string,
    violationIds?: number[],
  ): Promise<ScanResult> {
    const options: Record<string, unknown> = { ...this.scanOperationOptions() };
    if (violationIds && violationIds.length > 0) {
      options.violation_ids = violationIds;
    }
    const response = await this.executeRequest<{ operation_id: string }>(
      `/api/v1/projects/${projectId}/operation`,
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'remediate',
          options,
        }),
      },
    );
    return {
      scanId: response.operation_id,
      projectId,
      status: 'running',
    };
  }

  async approveProposals(
    projectId: string,
    proposalIds: string[],
  ): Promise<void> {
    await this.executeRequest<void>(
      `/api/v1/projects/${projectId}/operation/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ approved_ids: proposalIds }),
      },
    );
  }

  async createPullRequest(
    projectId: string,
    activityId: string,
    scmToken?: string,
  ): Promise<CreatePullRequestResult> {
    const body: Record<string, string> = { projectId };
    if (scmToken) {
      body.scm_token = scmToken;
    }
    return this.executeRequest<CreatePullRequestResult>(
      `/api/v1/activity/${activityId}/pull-request`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  async getRemediationBundle(activityId: string): Promise<RemediationBundle> {
    return this.executeRequest<RemediationBundle>(
      `/api/v1/activity/${activityId}/remediation-bundle`,
    );
  }

  async recordPullRequest(
    activityId: string,
    result: CreatePullRequestResult,
  ): Promise<CreatePullRequestResult> {
    return this.executeRequest<CreatePullRequestResult>(
      `/api/v1/activity/${activityId}/pull-request/record`,
      {
        method: 'POST',
        body: JSON.stringify({
          pr_url: result.pr_url,
          branch_name: result.branch_name ?? '',
          provider: result.provider ?? 'github',
        }),
      },
    );
  }
}

export type IApmeService = Pick<
  ApmeClient,
  | 'getHealth'
  | 'getAiModels'
  | 'getProjects'
  | 'getProject'
  | 'getProjectByRepoUrl'
  | 'getViolations'
  | 'getRules'
  | 'triggerScan'
  | 'getScanStatus'
  | 'createProject'
  | 'deleteProject'
  | 'getActivity'
  | 'getOperationState'
  | 'triggerRemediate'
  | 'approveProposals'
  | 'createPullRequest'
  | 'getRemediationBundle'
  | 'recordPullRequest'
>;
