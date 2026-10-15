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

      it.each([
        ['-invalid', 'starting with a separator'],
        ['invalid-', 'ending with a separator'],
        ['my-ee.yml', 'ending with .yml'],
        ['my-ee.yaml', 'ending with .yaml'],
        ['my-ee.YML', 'ending with .YML (case-insensitive)'],
      ])('rejects eeFileName %s (%s)', eeFileName => {
        const result = eeDefinitionInputSchema.safeParse({
          ...base,
          eeFileName,
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

    describe('scmProvider validation', () => {
      const base = {
        eeFileName: 'my-ee',
        eeDescription: 'desc',
        publishToSCM: false,
        baseImage: 'img:latest',
      };

      it('accepts scmProvider "github"', () => {
        const result = eeDefinitionInputSchema.safeParse({
          ...base,
          scmProvider: 'github',
        });
        expect(result.success).toBe(true);
      });

      it('accepts scmProvider "gitlab"', () => {
        const result = eeDefinitionInputSchema.safeParse({
          ...base,
          scmProvider: 'gitlab',
        });
        expect(result.success).toBe(true);
      });

      it('rejects invalid scmProvider value', () => {
        const result = eeDefinitionInputSchema.safeParse({
          ...base,
          scmProvider: 'bitbucket',
        });
        expect(result.success).toBe(false);
      });

      it('accepts missing scmProvider (optional)', () => {
        const result = eeDefinitionInputSchema.safeParse(base);
        expect(result.success).toBe(true);
      });
    });
  });
});
