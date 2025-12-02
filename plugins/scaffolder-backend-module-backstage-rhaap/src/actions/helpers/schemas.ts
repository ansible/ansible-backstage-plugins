/*
Various schema definitions for validating the input data
*/

import { z } from 'zod';

export const CollectionSchema = z
  .object({
    name: z.string(),
    version: z.string().optional(),
    signatures: z.array(z.string()).optional(),
    source: z.string().optional(),
    type: z.enum(['file', 'galaxy', 'git', 'url', 'dir', 'subdirs']).optional(),
  })
  .strict();

export const CollectionRequirementsSchema = z
  .object({
    collections: z.array(CollectionSchema),
  })
  .strict();

export const GalaxyDependenciesSchema = z
  .object({
    collections: z.array(CollectionSchema),
  })
  .strict();

export const PythonInterpreterSchema = z
  .object({
    python_path: z.string(),
  })
  .strict();

export const DependenciesSchema = z
  .object({
    python: z.array(z.string()).optional(),
    system: z.array(z.string()).optional(),
    galaxy: GalaxyDependenciesSchema.optional(),
    python_interpreter: PythonInterpreterSchema.optional(),
  })
  .strict();

export const ImagesSchema = z
  .object({
    base_image: z
      .object({
        name: z.string(),
      })
      .strict(),
  })
  .strict();

export const AdditionalBuildFilesSchema = z
  .array(
    z
      .object({
        src: z.string(),
        dest: z.string(),
      })
      .strict(),
  )
  .optional();

export const AdditionalBuildStepsSchema = z
  .object({
    prepend_base: z.array(z.string()).optional(),
    append_base: z.array(z.string()).optional(),
    prepend_galaxy: z.array(z.string()).optional(),
    append_galaxy: z.array(z.string()).optional(),
    prepend_builder: z.array(z.string()).optional(),
    append_builder: z.array(z.string()).optional(),
    prepend_final: z.array(z.string()).optional(),
    append_final: z.array(z.string()).optional(),
  })
  .strict();

export const OptionsSchema = z
  .object({
    package_manager_path: z.string().optional(),
  })
  .strict();

// final schema for the entire EE definition YAML file
export const EEDefinitionSchema = z
  .object({
    version: z.number(),
    images: ImagesSchema,
    dependencies: DependenciesSchema.optional(),
    additional_build_files: AdditionalBuildFilesSchema.optional(),
    additional_build_steps: AdditionalBuildStepsSchema.optional(),
    options: OptionsSchema.optional(),
  })
  .strict();
