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

export const aapApiRecordOutputSchema = z.record(z.string(), z.unknown());

const organizationSchema = z.object({
  id: z.number(),
  name: z.string(),
  namespace: z.string().optional(),
});

const inventorySchema = z.object({
  id: z.number(),
  name: z.string(),
});

const credentialSchema = z.object({
  id: z.number(),
  name: z.string(),
  kind: z.string(),
  inputs: z.object({ username: z.string() }).optional(),
});

export const projectInputSchema = z.object({
  id: z.number().optional(),
  projectName: z.string(),
  projectDescription: z.string().optional(),
  organization: organizationSchema,
  scmUrl: z.string(),
  scmBranch: z.string().optional(),
  scmUpdateOnLaunch: z.boolean().optional(),
  status: z.string().optional(),
  url: z.string().optional(),
  credentials: credentialSchema.optional(),
  related: z.object({ last_job: z.string() }).optional(),
});

export const executionEnvironmentInputSchema = z.object({
  id: z.number().optional(),
  environmentName: z.string(),
  environmentDescription: z.string().optional(),
  organization: organizationSchema,
  image: z.string(),
  pull: z.string(),
  url: z.string().optional(),
});

export const jobTemplateInputSchema = z.object({
  id: z.number().optional(),
  templateName: z.string(),
  templateDescription: z.string().optional(),
  scmType: z.string().optional(),
  project: projectInputSchema,
  organization: organizationSchema,
  jobInventory: inventorySchema,
  playbook: z.string(),
  executionEnvironment: executionEnvironmentInputSchema.optional(),
  extraVariables: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .optional(),
  status: z.string().optional(),
  url: z.string().optional(),
  credentials: credentialSchema.optional(),
});

const launchCredentialSchema = z.object({
  id: z.number(),
  type: z.string(),
  credential_type: z.number(),
  name: z.string(),
  summary_fields: z.record(
    z.string(),
    z.object({ id: z.number(), name: z.string() }),
  ),
});

const verbositySchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const launchJobTemplateInputSchema = z.object({
  template: z.string().min(1),
  jobType: z.enum(['run', 'check']).optional(),
  inventory: inventorySchema.optional(),
  executionEnvironment: executionEnvironmentInputSchema.optional(),
  credentials: z.array(launchCredentialSchema).optional(),
  forks: z.number().optional(),
  limit: z.string().optional(),
  verbosity: verbositySchema.optional(),
  jobSliceCount: z.number().optional(),
  timeout: z.number().optional(),
  diffMode: z.boolean().optional(),
  extraVariables: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .optional(),
  jobTags: z.string().optional(),
  skipTags: z.string().optional(),
});

export const cleanUpInputSchema = z.object({
  project: projectInputSchema.partial().optional(),
  executionEnvironment: executionEnvironmentInputSchema.partial().optional(),
  template: jobTemplateInputSchema.partial().optional(),
});

const collectionSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  source: z.string().optional(),
  type: z.string().optional(),
});

const additionalBuildStepSchema = z.object({
  stepType: z.enum([
    'prepend_base',
    'append_base',
    'prepend_galaxy',
    'append_galaxy',
    'prepend_builder',
    'append_builder',
    'prepend_final',
    'append_final',
  ]),
  commands: z.array(z.string()),
});

export const eeDefinitionInputSchema = z
  .object({
    eeFileName: z.string().min(1),
    eeDescription: z.string().min(1),
    publishToSCM: z.boolean(),
    customBaseImage: z.string().optional(),
    tags: z.array(z.string()).optional(),
    baseImage: z.string().optional(),
    collections: z.array(collectionSchema).optional(),
    pythonRequirements: z.array(z.string()).optional(),
    pythonRequirementsFile: z.any().optional(),
    systemPackages: z.array(z.string()).optional(),
    systemPackagesFile: z.any().optional(),
    additionalBuildSteps: z.array(additionalBuildStepSchema).optional(),
    buildRegistry: z.string().optional(),
    buildImageName: z.string().optional(),
    buildImageTag: z.string().optional(),
    registryTlsVerify: z.boolean().optional(),
    owner: z.string().optional(),
  })
  .catchall(z.unknown())
  .superRefine((data, ctx) => {
    const base = String(data.baseImage ?? '').trim();
    const custom = String(data.customBaseImage ?? '').trim();
    if (!base && !custom) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Provide a non empty baseImage or customBaseImage for the execution environment',
        path: ['baseImage'],
      });
    }
  });
