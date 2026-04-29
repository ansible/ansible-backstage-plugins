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

/**
 * A registered platform operations task that triggers an AAP Job Template
 */
export type PlatformTask = {
  id: string;
  name: string;
  description: string;
  taskType?: 'certificate-check' | 'compliance-scan' | 'custom';
  templateId?: number;
  jobTemplateId?: number;
  parserType: 'certificate' | 'generic';
  enabled: boolean;
  defaultExtraVars?: Record<string, unknown>;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
};

/**
 * Status of a task execution
 */
export type TaskExecutionStatus =
  | 'pending'
  | 'running'
  | 'successful'
  | 'failed'
  | 'canceled';

/**
 * A record of a platform task execution
 */
export type TaskExecution = {
  id: string;
  taskId: string;
  taskName?: string;
  jobId?: number;
  status: TaskExecutionStatus | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  triggeredBy?: string;
  extraVarsUsed?: Record<string, unknown>;
  errorMessage?: string;
  error?: string;
  output?: unknown;
};

/**
 * Certificate status classification
 */
export type CertificateStatus =
  | 'ok'
  | 'warning'
  | 'critical'
  | 'expired'
  | 'missing'
  | 'error';

/**
 * Certificate threshold configuration
 */
export type CertificateThresholds = {
  highWaterMark: number;
  criticalWaterMark: number;
};

/**
 * Information about a single certificate
 */
export type CertificateInfo = {
  name: string;
  status: CertificateStatus;
  expiryDate: string;
  daysRemaining: number;
  source?: string;
  platform?: 'containerized' | 'openshift' | 'kubernetes' | 'unknown';
  keyAlgorithm?: string;
  keySize?: string;
  sigAlgorithm?: string;
  path?: string;
  host?: string;
};

/**
 * Summary of certificate check results
 */
export type CertificateSummary = {
  total: number;
  ok: number;
  warning: number;
  critical: number;
  expired: number;
  missing: number;
  error: number;
};

/**
 * Full certificate check report
 */
export type CertificateReport = {
  host?: string;
  platform?: string;
  checkDate?: string;
  thresholds?: CertificateThresholds;
  summary: CertificateSummary;
  certificates: CertificateInfo[];
  parseErrors?: string[];
};

/**
 * Result of executing a platform task
 */
export type TaskExecutionResult<T = unknown> = {
  executionId: string;
  resultType: string;
  resultData: T;
  summaryData?: Record<string, unknown>;
  rawStdout?: string;
  createdAt: string;
};

/**
 * AAP Job status from Controller API
 */
export type AAPJobStatus = {
  id: number;
  status:
    | 'pending'
    | 'waiting'
    | 'running'
    | 'successful'
    | 'failed'
    | 'error'
    | 'canceled';
  started?: string;
  finished?: string;
  elapsed?: number;
  failed: boolean;
};

/**
 * Response from launching a job template
 */
export type JobLaunchResponse = {
  job: number;
  ignored_fields: Record<string, unknown>;
  id: number;
  type: string;
  url: string;
  created: string;
  modified: string;
  name: string;
  status: string;
};
