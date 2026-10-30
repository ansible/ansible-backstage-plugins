import { collectionSourceHref } from './collectionHelpers';

describe('collectionSourceHref', () => {
  it('only links actual web repositories', () => {
    expect(collectionSourceHref('https://example.com/team/content')).toBe(
      'https://example.com/team/content',
    );
    expect(collectionSourceHref('registry/namespace')).toBeUndefined();
    expect(
      collectionSourceHref(['java', 'script:alert(1)'].join('')),
    ).toBeUndefined();
    expect(collectionSourceHref()).toBeUndefined();
  });
});
