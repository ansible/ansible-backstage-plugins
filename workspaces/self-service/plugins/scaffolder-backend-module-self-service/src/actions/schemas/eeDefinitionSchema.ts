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
    eeFileName: z
      .string()
      .min(1)
      .max(
        63,
        'EE file name must not exceed 63 characters (Backstage catalog entity name limit)',
      )
      .regex(
        /^[a-zA-Z0-9]([a-zA-Z0-9\-_.]*[a-zA-Z0-9])?$/,
        'EE file name must consist of alphanumeric characters (a-z, A-Z, 0-9) optionally separated by hyphens, underscores, or dots, and must not start or end with a separator',
      )
      .refine(
        val => !/\.ya?ml$/i.test(val),
        'EE file name must not include a .yml or .yaml extension; provide the base name only',
      ),
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
    scmProvider: z.enum(['github', 'gitlab']).optional(),
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
