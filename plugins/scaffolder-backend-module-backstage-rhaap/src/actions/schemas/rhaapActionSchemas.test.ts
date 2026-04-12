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
  });
});
