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

import { createApiRef } from '@backstage/core-plugin-api';
import {
  Project,
  Violation,
  Rule,
  ScanResult,
  HealthStatus,
  CreateProjectRequest,
  Activity,
  OperationState,
  CreatePullRequestResult,
  RemediationBundle,
  PushBranchResult,
} from './types';

export interface ApmeScmRequestOptions {
  scmToken?: string;
  branchName?: string;
}

export interface ApmeViolationsOptions {
  limit?: number;
}

export interface ApmeApi {
  getHealth(): Promise<HealthStatus>;
  getProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project>;
  getProjectByRepoUrl(repoUrl: string): Promise<Project | null>;
  getViolations(
    projectId: string,
    options?: ApmeViolationsOptions,
  ): Promise<Violation[]>;
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

export const apmeApiRef = createApiRef<ApmeApi>({
  id: 'plugin.apme.api',
});
