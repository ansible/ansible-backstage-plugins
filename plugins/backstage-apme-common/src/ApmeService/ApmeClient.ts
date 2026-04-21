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
import {
  Project,
  Violation,
  Rule,
  ScanResult,
  HealthStatus,
  ApmeConfig,
  CreateProjectRequest,
  Activity,
  OperationState,
} from '../types';

export interface ApmeClientOptions {
  rootConfig: Config;
  logger: LoggerService;
}

export function getApmeConfig(config: Config): ApmeConfig {
  const apmeConfig = config.getOptionalConfig('ansible.apme');
  if (!apmeConfig) {
    return {
      baseUrl: 'http://localhost:8080',
      checkSSL: true,
    };
  }
  return {
    baseUrl: apmeConfig.getString('baseUrl'),
    checkSSL: apmeConfig.getOptionalBoolean('checkSSL') ?? true,
  };
}

export class ApmeClient {
  private readonly baseUrl: string;
  private readonly logger: LoggerService;

  constructor(options: ApmeClientOptions) {
    const config = getApmeConfig(options.rootConfig);
    this.baseUrl = config.baseUrl;
    // Note: checkSSL config is available but not used yet (for future TLS verification)
    this.logger = options.logger.child({ service: 'ApmeClient' });
    this.logger.info(`APME client initialized with baseUrl: ${this.baseUrl}`);
  }

  private async executeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
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
        throw new ConflictError('A scan is already in progress for this project');
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
      if (error instanceof NotFoundError || error instanceof InputError || error instanceof ConflictError) {
        throw error;
      }
      this.logger.error(`APME request failed: ${endpoint}`, error as Error);
      throw new InputError(`Failed to connect to APME: ${(error as Error).message}`);
    }
  }

  async getHealth(): Promise<HealthStatus> {
    return this.executeRequest<HealthStatus>('/api/v1/health');
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

  async getProjectByRepoUrl(repoUrl: string): Promise<Project | null> {
    try {
      const response = await this.executeRequest<{ items: Project[] }>(
        `/api/v1/projects?repo_url=${encodeURIComponent(repoUrl)}`,
      );
      return response.items?.[0] || null;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return null;
      }
      throw error;
    }
  }

  async getViolations(projectId: string): Promise<Violation[]> {
    // APME returns violations as a direct array, not wrapped in {items: []}
    const response = await this.executeRequest<Violation[]>(
      `/api/v1/projects/${projectId}/violations`,
    );
    return response || [];
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
        body: JSON.stringify({ action: 'check', options: {} }),
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

  async triggerRemediate(projectId: string): Promise<ScanResult> {
    const response = await this.executeRequest<{ operation_id: string }>(
      `/api/v1/projects/${projectId}/operation`,
      {
        method: 'POST',
        body: JSON.stringify({ action: 'remediate', options: {} }),
      },
    );
    return {
      scanId: response.operation_id,
      projectId,
      status: 'running',
    };
  }

  async approveProposals(projectId: string, proposalIds: string[]): Promise<void> {
    await this.executeRequest<void>(
      `/api/v1/projects/${projectId}/operation/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ approved_ids: proposalIds }),
      },
    );
  }

  async createPullRequest(projectId: string, activityId: string): Promise<{ pr_url: string }> {
    return this.executeRequest<{ pr_url: string }>(
      `/api/v1/activity/${activityId}/pull-request`,
      {
        method: 'POST',
      },
    );
  }
}

export type IApmeService = Pick<
  ApmeClient,
  | 'getHealth'
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
>;
