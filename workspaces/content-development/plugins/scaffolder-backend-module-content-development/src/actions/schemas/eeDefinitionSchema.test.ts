import { eeDefinitionInputSchema } from './eeDefinitionSchema';

describe('eeDefinitionInputSchema', () => {
  const validInput = {
    eeFileName: 'my-ee',
    eeDescription: 'desc',
    publishToSCM: false,
    baseImage: 'img:latest',
  };

  it('requires a non-empty base image or custom base image', () => {
    expect(
      eeDefinitionInputSchema.safeParse({
        eeFileName: 'my-ee',
        eeDescription: 'desc',
        publishToSCM: false,
      }).success,
    ).toBe(false);
    expect(
      eeDefinitionInputSchema.safeParse({
        ...validInput,
        baseImage: '  ',
        customBaseImage: '\t',
      }).success,
    ).toBe(false);
    expect(eeDefinitionInputSchema.safeParse(validInput).success).toBe(true);
    expect(
      eeDefinitionInputSchema.safeParse({
        ...validInput,
        baseImage: undefined,
        customBaseImage: 'quay.io/custom/ee:1',
      }).success,
    ).toBe(true);
  });

  it.each([
    ['a'.repeat(64), false],
    ['-invalid', false],
    ['invalid-', false],
    ['my-ee.yml', false],
    ['my-ee.yaml', false],
    ['my-ee.YML', false],
    ['my-ee.1', true],
    ['a'.repeat(63), true],
  ])('validates EE name %s', (eeFileName, expected) => {
    expect(
      eeDefinitionInputSchema.safeParse({ ...validInput, eeFileName }).success,
    ).toBe(expected);
  });

  it.each(['github', 'gitlab'])(
    'accepts SCM provider %s and leaves it optional',
    scmProvider => {
      expect(
        eeDefinitionInputSchema.safeParse({ ...validInput, scmProvider })
          .success,
      ).toBe(true);
      expect(eeDefinitionInputSchema.safeParse(validInput).success).toBe(true);
    },
  );

  it('rejects unsupported SCM providers', () => {
    expect(
      eeDefinitionInputSchema.safeParse({
        ...validInput,
        scmProvider: 'bitbucket',
      }).success,
    ).toBe(false);
  });
});
