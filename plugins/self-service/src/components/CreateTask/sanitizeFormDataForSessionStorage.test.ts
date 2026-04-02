import {
  collectSensitiveTemplateKeysFromSteps,
  sanitizeFormDataForSessionStorage,
} from './sanitizeFormDataForSessionStorage';

describe('collectSensitiveTemplateKeysFromSteps', () => {
  it('collects token, Secret, AAPTokenField, password, and writeOnly keys', () => {
    const keys = collectSensitiveTemplateKeysFromSteps([
      {
        schema: {
          properties: {
            name: { type: 'string' },
            token: { type: 'string' },
            apiPassword: { type: 'string', format: 'password' },
            scmSecret: { 'ui:field': 'Secret' },
            aapTok: { 'ui:field': 'AAPTokenField' },
            legacy: { type: 'string', writeOnly: true },
          },
        },
      },
    ]);
    expect(keys).toEqual(
      new Set(['token', 'apiPassword', 'scmSecret', 'aapTok', 'legacy']),
    );
  });
});

describe('sanitizeFormDataForSessionStorage', () => {
  it('replaces data: URL strings with empty string', () => {
    const huge = `data:application/octet-stream;base64,${'A'.repeat(500_000)}`;
    expect(
      sanitizeFormDataForSessionStorage({
        name: 'ee',
        requirementsFile: huge,
      }),
    ).toEqual({
      name: 'ee',
      requirementsFile: '',
    });
  });

  it('replaces blob: URL strings with empty string', () => {
    expect(
      sanitizeFormDataForSessionStorage({
        file: 'blob:http://localhost/abc-123',
      }),
    ).toEqual({ file: '' });
  });

  it('preserves normal strings and nested structures', () => {
    expect(
      sanitizeFormDataForSessionStorage({
        a: 'plain',
        nested: { b: 1, c: ['x', 'data:image/png;base64,QQ=='] },
      }),
    ).toEqual({
      a: 'plain',
      nested: { b: 1, c: ['x', ''] },
    });
  });

  it('is case-insensitive for data: prefix', () => {
    expect(sanitizeFormDataForSessionStorage('DATA:text/plain,hi')).toBe('');
  });

  it('omits top-level keys when omitKeys is provided', () => {
    expect(
      sanitizeFormDataForSessionStorage(
        { name: 'x', token: 'secret', nested: { a: 1 } },
        { omitKeys: new Set(['token']) },
      ),
    ).toEqual({ name: 'x', nested: { a: 1 } });
  });
});
