/*
 * Copyright 2024 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { ZodError } from 'zod';
import { eeDefinitionInputSchema } from './rhaapActionSchemas';

describe('rhaapActionSchemas', () => {
  describe('eeDefinitionInputSchema', () => {
    it('rejects when baseImage and customBaseImage are both absent', () => {
      const result = eeDefinitionInputSchema.safeParse({
        eeFileName: 'my-ee',
        eeDescription: 'desc',
        publishToSCM: false,
      });
      expect(result.success).toBe(false);
      const { error } = result as { success: false; error: ZodError };
      expect(error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'custom',
            path: ['baseImage'],
            message:
              'Provide a non empty baseImage or customBaseImage for the execution environment',
          }),
        ]),
      );
    });

    it('rejects when both base images are only whitespace', () => {
      const result = eeDefinitionInputSchema.safeParse({
        eeFileName: 'my-ee',
        eeDescription: 'desc',
        publishToSCM: true,
        baseImage: '   ',
        customBaseImage: '\t',
      });
      expect(result.success).toBe(false);
    });

    it('accepts when baseImage is non-empty', () => {
      const result = eeDefinitionInputSchema.safeParse({
        eeFileName: 'my-ee',
        eeDescription: 'desc',
        publishToSCM: false,
        baseImage: 'quay.io/ansible/ee-base:latest',
      });
      expect(result.success).toBe(true);
    });

    it('accepts when only customBaseImage is non-empty', () => {
      const result = eeDefinitionInputSchema.safeParse({
        eeFileName: 'my-ee',
        eeDescription: 'desc',
        publishToSCM: true,
        customBaseImage: 'quay.io/custom/ee:1',
      });
      expect(result.success).toBe(true);
    });

    describe('eeFileName validation', () => {
      const base = {
        eeDescription: 'desc',
        publishToSCM: false,
        baseImage: 'img:latest',
      };

      it('rejects eeFileName longer than 63 characters', () => {
        const result = eeDefinitionInputSchema.safeParse({
          ...base,
          eeFileName: 'a'.repeat(64),
        });
        expect(result.success).toBe(false);
      });

      it('rejects eeFileName starting with a separator', () => {
        const result = eeDefinitionInputSchema.safeParse({
          ...base,
          eeFileName: '-invalid',
        });
        expect(result.success).toBe(false);
      });

      it('rejects eeFileName ending with a separator', () => {
        const result = eeDefinitionInputSchema.safeParse({
          ...base,
          eeFileName: 'invalid-',
        });
        expect(result.success).toBe(false);
      });

      it('rejects eeFileName ending with .yml', () => {
        const result = eeDefinitionInputSchema.safeParse({
          ...base,
          eeFileName: 'my-ee.yml',
        });
        expect(result.success).toBe(false);
      });

      it('rejects eeFileName ending with .yaml', () => {
        const result = eeDefinitionInputSchema.safeParse({
          ...base,
          eeFileName: 'my-ee.yaml',
        });
        expect(result.success).toBe(false);
      });

      it('rejects eeFileName ending with .YML (case-insensitive)', () => {
        const result = eeDefinitionInputSchema.safeParse({
          ...base,
          eeFileName: 'my-ee.YML',
        });
        expect(result.success).toBe(false);
      });

      it('accepts eeFileName with an internal dot', () => {
        const result = eeDefinitionInputSchema.safeParse({
          ...base,
          eeFileName: 'my-ee.1',
        });
        expect(result.success).toBe(true);
      });

      it('accepts eeFileName of exactly 63 characters', () => {
        const result = eeDefinitionInputSchema.safeParse({
          ...base,
          eeFileName: 'a'.repeat(63),
        });
        expect(result.success).toBe(true);
      });
    });
  });
});
