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
