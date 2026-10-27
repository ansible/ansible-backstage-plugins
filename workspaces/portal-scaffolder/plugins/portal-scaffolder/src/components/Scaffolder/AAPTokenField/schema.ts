/*
 * Copyright 2024 The Backstage Authors
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

import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

/**
 * Field schema for the AAPTokenField.
 * @public
 */
export const AAPTokenFieldSchema = makeFieldSchema({
  output: z => z.string(),
  uiOptions: z =>
    z.object({
      title: z.string().optional().describe('Custom title for the token field'),
      helperText: z
        .string()
        .optional()
        .describe(
          'Custom helper text to display when token is successfully retrieved',
        ),
    }),
});

/**
 * UI options for the AAPTokenField.
 * @public
 */
export type AAPTokenFieldUiOptions = NonNullable<
  (typeof AAPTokenFieldSchema.TProps.uiSchema)['ui:options']
>;

/**
 * Props for the AAPTokenField.
 * @public
 */
export type AAPTokenFieldProps = typeof AAPTokenFieldSchema.TProps;

/**
 * Schema for the AAPTokenField.
 * @public
 */
export const AAPTokenFieldFieldSchema = AAPTokenFieldSchema.schema;
