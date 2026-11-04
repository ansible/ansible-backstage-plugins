import { isHttpUrl } from './url';

describe('isHttpUrl', () => {
  it.each([
    ['http://example.com/source', true],
    ['https://example.com/source', true],
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
