import {
  collectSensitiveTemplateKeysFromSteps,
  MAX_SESSION_STORAGE_DATA_URL_LENGTH,
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
  it('preserves typical data: URL strings (OAuth reload file restore)', () => {
    const small = 'data:text/plain;base64,SGVsbG8=';
    expect(
      sanitizeFormDataForSessionStorage({
        name: 'ee',
        requirementsFile: small,
      }),
    ).toEqual({
      name: 'ee',
      requirementsFile: small,
    });
  });

  it('clears data: URLs that exceed the sessionStorage size cap', () => {
    const prefix = 'data:application/octet-stream;base64,';
    const huge =
      prefix +
      'A'.repeat(MAX_SESSION_STORAGE_DATA_URL_LENGTH - prefix.length + 1);
    expect(huge.length).toBeGreaterThan(MAX_SESSION_STORAGE_DATA_URL_LENGTH);
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

  it('preserves normal strings and nested structures; keeps small data: in arrays', () => {
    const dataUrl = 'data:image/png;base64,QQ==';
    expect(
      sanitizeFormDataForSessionStorage({
        a: 'plain',
        nested: { b: 1, c: ['x', dataUrl] },
      }),
    ).toEqual({
      a: 'plain',
      nested: { b: 1, c: ['x', dataUrl] },
    });
  });

  it('is case-insensitive for data: prefix and preserves small values', () => {
    expect(sanitizeFormDataForSessionStorage('DATA:text/plain,hi')).toBe(
      'DATA:text/plain,hi',
    );
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
