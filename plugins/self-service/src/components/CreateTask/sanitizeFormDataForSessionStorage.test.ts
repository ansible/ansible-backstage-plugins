import { sanitizeFormDataForSessionStorage } from './sanitizeFormDataForSessionStorage';

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
});
