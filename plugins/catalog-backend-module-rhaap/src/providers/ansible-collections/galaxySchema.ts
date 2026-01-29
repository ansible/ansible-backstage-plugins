import { z } from 'zod';
import type { GalaxyMetadata } from './types';

const namespaceNameRegex = /^[a-zA-Z][a-zA-Z0-9]*([_.][a-zA-Z0-9]+)*$/;

export const galaxySchema = z.object({
  // required fields with non nullish values
  namespace: z
    .string()
    .min(1, 'namespace is required')
    .regex(
      namespaceNameRegex,
      'namespace must start with a letter, contain only alphanumeric characters, underscores, and dots, and cannot have consecutive underscores or dots',
    ),
  name: z
    .string()
    .min(1, 'name is required')
    .regex(
      namespaceNameRegex,
      'name must start with a letter, contain only alphanumeric characters, underscores, and dots, and cannot have consecutive underscores or dots',
    ),
  // required field which can contain null value
  version: z
    .string()
    .nullable()
    .transform(val => val ?? 'N/A'),
  readme: z
    .string()
    .nullish()
    .transform(val => val ?? 'Not Available.'),
  authors: z
    .union([z.array(z.string()), z.string()])
    .nullish()
    .transform(val => {
      if (val === null || val === undefined) return ['N/A'];
      if (typeof val === 'string') return [val];
      return val;
    }),
  // optional fields which can have nullish value if key is found
  description: z
    .string()
    .nullish()
    .transform(val => val ?? undefined),
  license: z
    .union([z.string(), z.array(z.string())])
    .nullish()
    .transform(val => val ?? undefined),
  license_file: z
    .string()
    .nullish()
    .transform(val => val ?? undefined),
  tags: z
    .array(z.string())
    .nullish()
    .transform(val => val ?? undefined),
  dependencies: z
    .record(z.string(), z.string())
    .nullish()
    .transform(val => val ?? undefined),
  repository: z
    .string()
    .nullish()
    .transform(val => val ?? undefined),
  documentation: z
    .string()
    .nullish()
    .transform(val => val ?? undefined),
  homepage: z
    .string()
    .nullish()
    .transform(val => val ?? undefined),
  issues: z
    .string()
    .nullish()
    .transform(val => val ?? undefined),
  build_ignore: z
    .array(z.string())
    .nullish()
    .transform(val => val ?? undefined),
});

export type GalaxySchemaType = z.infer<typeof galaxySchema>;

export interface GalaxyValidationResult {
  success: boolean;
  data?: GalaxyMetadata;
  errors?: string[];
}

export function validateGalaxyContent(
  content: unknown,
): GalaxyValidationResult {
  if (!content || typeof content !== 'object') {
    return {
      success: false,
      errors: ['galaxy.yml content is empty or not a valid object'],
    };
  }

  if (Object.keys(content).length === 0) {
    return {
      success: false,
      errors: ['galaxy.yml content is empty'],
    };
  }

  const result = galaxySchema.safeParse(content);

  if (result.success) {
    return {
      success: true,
      data: result.data as GalaxyMetadata,
    };
  }

  const errors = result.error.issues.map(issue => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });

  return {
    success: false,
    errors,
  };
}

export function hasRequiredFields(content: unknown): boolean {
  if (!content || typeof content !== 'object') {
    return false;
  }

  const obj = content as Record<string, unknown>;
  return (
    typeof obj.namespace === 'string' &&
    obj.namespace.length > 0 &&
    typeof obj.name === 'string' &&
    obj.name.length > 0 &&
    'version' in obj &&
    'authors' in obj &&
    'readme' in obj
  );
}
