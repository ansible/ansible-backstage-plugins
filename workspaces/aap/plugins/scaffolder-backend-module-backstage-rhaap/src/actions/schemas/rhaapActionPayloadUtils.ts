/*
 * Copyright 2024 The Ansible plugin Authors
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

import { z } from 'zod';

import { launchJobTemplateFieldsSchema } from './rhaapActionSchemas';

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

export function pickOrganization(org: unknown): unknown {
  if (org === undefined || org === null) {
    return org;
  }
  if (typeof org !== 'object' || Array.isArray(org)) {
    return org;
  }
  const o = org as Record<string, unknown>;
  if (typeof o.id !== 'number') {
    return org;
  }
  const out: Record<string, unknown> = {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : '',
  };
  if (typeof o.namespace === 'string') {
    out.namespace = o.namespace;
  }
  return out;
}

function pickCredentialInputsObject(
  o: Record<string, unknown>,
): { username: string } | undefined {
  if (!isPlainObject(o.inputs)) {
    return undefined;
  }
  const username = o.inputs.username;
  return typeof username === 'string' ? { username } : undefined;
}

export function pickCredentialForProject(cred: unknown): unknown {
  if (cred === undefined || cred === null) {
    return cred;
  }
  if (!isPlainObject(cred)) {
    return cred;
  }
  if (typeof cred.id !== 'number') {
    return cred;
  }

  const kind = typeof cred.kind === 'string' ? cred.kind : 'scm';
  const name = typeof cred.name === 'string' ? cred.name : '';
  const inputs = pickCredentialInputsObject(cred);

  return inputs
    ? { id: cred.id, name, kind, inputs }
    : { id: cred.id, name, kind };
}

const PROJECT_INPUT_FIELD_KEYS = [
  'id',
  'projectName',
  'projectDescription',
  'organization',
  'scmUrl',
  'scmBranch',
  'scmUpdateOnLaunch',
  'status',
  'url',
  'credentials',
  'related',
] as const;

export function pickProjectInputRecord(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }
  const o = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PROJECT_INPUT_FIELD_KEYS) {
    if (!Object.hasOwn(o, k)) {
      continue;
    }
    let v = o[k];
    if (k === 'organization') {
      v = pickOrganization(v);
    } else if (k === 'credentials') {
      v = pickCredentialForProject(v);
    } else if (k === 'related') {
      if (
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        typeof (v as Record<string, unknown>).last_job === 'string'
      ) {
        v = { last_job: (v as Record<string, unknown>).last_job as string };
      } else {
        continue;
      }
    }
    out[k] = v;
  }
  return out;
}

export const normalizeProjectInputValues = pickProjectInputRecord;

function pickLaunchInventory(inv: unknown): unknown {
  if (inv === undefined) {
    return undefined;
  }
  if (typeof inv === 'number' && Number.isFinite(inv)) {
    return { id: inv, name: '' };
  }
  if (typeof inv !== 'object' || inv === null || Array.isArray(inv)) {
    return inv;
  }
  const o = inv as Record<string, unknown>;
  if (typeof o.id !== 'number') {
    return inv;
  }
  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : '',
  };
}

function pickLaunchVerbosity(verb: unknown): unknown {
  if (verb === undefined) {
    return undefined;
  }
  if (typeof verb === 'number' && Number.isFinite(verb)) {
    return { id: verb, name: String(verb) };
  }
  if (typeof verb !== 'object' || verb === null || Array.isArray(verb)) {
    return verb;
  }
  const o = verb as Record<string, unknown>;
  if (typeof o.id !== 'number') {
    return verb;
  }
  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : String(o.id),
  };
}

function pickLaunchSummaryFields(
  sf: unknown,
): Record<string, { id: number; name: string }> {
  if (!sf || typeof sf !== 'object' || Array.isArray(sf)) {
    return {};
  }
  const out: Record<string, { id: number; name: string }> = {};
  for (const [key, val] of Object.entries(sf as Record<string, unknown>)) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const v = val as Record<string, unknown>;
      out[key] = {
        id: typeof v.id === 'number' ? v.id : 0,
        name: typeof v.name === 'string' ? v.name : '',
      };
    }
  }
  return out;
}

function pickLaunchCredential(c: unknown): unknown {
  if (!c || typeof c !== 'object' || Array.isArray(c)) {
    return c;
  }
  const o = c as Record<string, unknown>;
  if (typeof o.id !== 'number') {
    return c;
  }

  let credential_type: number | undefined;
  if (typeof o.credential_type === 'number') {
    credential_type = o.credential_type;
  } else if (
    o.summary_fields &&
    typeof o.summary_fields === 'object' &&
    !Array.isArray(o.summary_fields)
  ) {
    const ct = (o.summary_fields as Record<string, unknown>).credential_type;
    if (ct && typeof ct === 'object' && !Array.isArray(ct)) {
      const cid = (ct as { id?: unknown }).id;
      if (typeof cid === 'number') {
        credential_type = cid;
      }
    }
  }

  const base = {
    id: o.id,
    type: typeof o.type === 'string' ? o.type : 'credential',
    name: typeof o.name === 'string' ? o.name : '',
    summary_fields: pickLaunchSummaryFields(o.summary_fields),
  };

  if (credential_type === undefined) {
    return base;
  }
  return { ...base, credential_type };
}

function pickLaunchCredentials(creds: unknown): unknown {
  if (creds === undefined) {
    return undefined;
  }
  if (!Array.isArray(creds)) {
    return creds;
  }
  return creds.map(entry => pickLaunchCredential(entry));
}

function readLaunchEEEnvironmentName(o: Record<string, unknown>): string {
  if (typeof o.environmentName === 'string') {
    return o.environmentName;
  }
  return typeof o.name === 'string' ? o.name : '';
}

function readLaunchEEEnvironmentDescription(
  o: Record<string, unknown>,
): string | undefined {
  if (typeof o.environmentDescription === 'string') {
    return o.environmentDescription;
  }
  return typeof o.description === 'string' ? o.description : undefined;
}

function organizationFromLaunchEESummaryFields(summaryFields: unknown): {
  id: number;
  name: string;
} {
  if (!isPlainObject(summaryFields)) {
    return { id: 0, name: '' };
  }
  const rawOrg = summaryFields.organization;
  if (!isPlainObject(rawOrg) || typeof rawOrg.id !== 'number') {
    return { id: 0, name: '' };
  }
  return {
    id: rawOrg.id,
    name: typeof rawOrg.name === 'string' ? rawOrg.name : '',
  };
}

function organizationFromLaunchEEPayload(o: Record<string, unknown>): {
  id: number;
  name: string;
} {
  const fromSummary = organizationFromLaunchEESummaryFields(o.summary_fields);
  if (fromSummary.id !== 0 || fromSummary.name !== '') {
    return fromSummary;
  }
  const fallback = pickOrganization(o.organization);
  if (isPlainObject(fallback) && typeof fallback.id === 'number') {
    return {
      id: fallback.id,
      name: typeof fallback.name === 'string' ? fallback.name : '',
    };
  }
  return { id: 0, name: '' };
}

export function pickLaunchExecutionEnvironment(ee: unknown): unknown {
  if (ee === undefined) {
    return undefined;
  }
  if (!isPlainObject(ee)) {
    return ee;
  }
  if (typeof ee.id !== 'number') {
    return ee;
  }

  return {
    id: ee.id,
    environmentName: readLaunchEEEnvironmentName(ee),
    environmentDescription: readLaunchEEEnvironmentDescription(ee),
    organization: organizationFromLaunchEEPayload(ee),
    image: typeof ee.image === 'string' ? ee.image : '',
    pull: typeof ee.pull === 'string' ? ee.pull : '',
    url: typeof ee.url === 'string' ? ee.url : undefined,
  };
}

export function normalizeExecutionEnvironmentInputValues(
  input: unknown,
): unknown {
  if (!isPlainObject(input)) {
    return input;
  }
  const o = input;
  if (typeof o.id === 'number') {
    return pickLaunchExecutionEnvironment(input);
  }

  const organization = pickOrganization(o.organization);
  const environmentName = readLaunchEEEnvironmentName(o);
  const environmentDescription = readLaunchEEEnvironmentDescription(o);
  const image = typeof o.image === 'string' ? o.image : '';
  const pull = typeof o.pull === 'string' ? o.pull : '';

  const out: Record<string, unknown> = {
    environmentName,
    organization,
    image,
    pull,
  };
  if (environmentDescription !== undefined) {
    out.environmentDescription = environmentDescription;
  }
  if (typeof o.url === 'string') {
    out.url = o.url;
  }
  return out;
}

const JOB_TEMPLATE_INPUT_FIELD_KEYS = [
  'id',
  'templateName',
  'templateDescription',
  'scmType',
  'project',
  'organization',
  'jobInventory',
  'playbook',
  'executionEnvironment',
  'extraVariables',
  'status',
  'url',
  'credentials',
] as const;

export function normalizeJobTemplateInputValues(input: unknown): unknown {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }
  const o = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of JOB_TEMPLATE_INPUT_FIELD_KEYS) {
    if (!Object.hasOwn(o, k)) {
      continue;
    }
    let v = o[k];
    if (k === 'organization') {
      v = pickOrganization(v);
    } else if (k === 'jobInventory') {
      v = pickLaunchInventory(v);
    } else if (k === 'executionEnvironment') {
      if (
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        typeof (v as Record<string, unknown>).id === 'number'
      ) {
        v = pickLaunchExecutionEnvironment(v);
      } else {
        v = normalizeExecutionEnvironmentInputValues(v);
      }
    } else if (k === 'credentials') {
      v = pickCredentialForProject(v);
    } else if (k === 'project') {
      v = pickProjectInputRecord(v);
    }
    out[k] = v;
  }
  return out;
}

export function normalizeCleanUpValues(input: unknown): unknown {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }
  const o = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (o.project !== undefined) {
    out.project = pickProjectInputRecord(o.project);
  }
  if (o.executionEnvironment !== undefined) {
    out.executionEnvironment = normalizeExecutionEnvironmentInputValues(
      o.executionEnvironment,
    );
  }
  if (o.template !== undefined) {
    out.template = normalizeJobTemplateInputValues(o.template);
  }
  return out;
}

function launchTagSegmentToString(v: unknown): string {
  if (typeof v === 'string') {
    return v;
  }
  if (
    typeof v === 'number' ||
    typeof v === 'boolean' ||
    typeof v === 'bigint' ||
    typeof v === 'symbol'
  ) {
    return String(v);
  }
  return '';
}

export function formatLaunchTagsString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map(launchTagSegmentToString)
      .filter(s => s.length > 0)
      .join(',');
  }
  const scalar = launchTagSegmentToString(value);
  return scalar.length > 0 ? scalar : undefined;
}

export function normalizeTemplateLaunchValues(input: unknown): unknown {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }
  const result = { ...(input as Record<string, unknown>) };

  const alias = (camel: string, snake: string) => {
    if (result[camel] === undefined && result[snake] !== undefined) {
      result[camel] = result[snake];
    }
    if (Object.hasOwn(result, snake)) {
      delete result[snake];
    }
  };

  alias('jobType', 'job_type');
  alias('executionEnvironment', 'execution_environment');
  alias('extraVariables', 'extra_vars');
  alias('jobSliceCount', 'job_slice_count');
  alias('diffMode', 'diff_mode');
  alias('jobTags', 'job_tags');
  alias('skipTags', 'skip_tags');
  alias('scmBranch', 'scm_branch');
  alias('instanceGroups', 'instance_groups');
  alias('startAtTask', 'start_at_task');
  alias('forceHandlers', 'force_handlers');
  alias('useFactCache', 'use_fact_cache');

  if (result.jobTags === undefined && result.tags !== undefined) {
    result.jobTags = result.tags;
  }
  if (Object.hasOwn(result, 'tags')) {
    delete result.tags;
  }

  if (result.jobTags !== undefined) {
    result.jobTags = formatLaunchTagsString(result.jobTags);
  }
  if (result.skipTags !== undefined) {
    result.skipTags = formatLaunchTagsString(result.skipTags);
  }

  result.inventory = pickLaunchInventory(result.inventory);
  result.verbosity = pickLaunchVerbosity(result.verbosity);
  result.credentials = pickLaunchCredentials(result.credentials);
  result.executionEnvironment = pickLaunchExecutionEnvironment(
    result.executionEnvironment,
  );

  return result;
}

export const launchJobTemplateInputSchema = z.preprocess(
  normalizeTemplateLaunchValues,
  launchJobTemplateFieldsSchema.passthrough(),
);
