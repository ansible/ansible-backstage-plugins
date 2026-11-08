import { isHttpUrl } from './url';

describe('isHttpUrl', () => {
  it.each([
    ['http://example.com/source', true],
    ['https://example.com/source', true],
    ['https://user:password@example.com/source', false],
    ['http://user@example.com/source', false],
    ['https://:password@example.com/source', false],
    ['https://us%65r:p%40ss@example.com/source', false],
    // eslint-disable-next-line no-script-url -- regression fixture for semi-trusted URLs
    ['javascript:alert(1)', false],
    ['data:text/html,hello', false],
    ['', false],
    ['garbage', false],
    ['/relative/path', false],
    ['//example.com/source', false],
    [undefined, false],
  ])('validates %s as %s', (value, expected) => {
    expect(isHttpUrl(value)).toBe(expected);
  });
});
