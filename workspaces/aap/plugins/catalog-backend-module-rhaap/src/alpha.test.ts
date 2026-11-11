import alphaFeatureLoader from './alpha';
import defaultFeatureLoader from './index';

describe('catalog alpha entry point', () => {
  it('re-exports the default catalog feature loader', () => {
    expect(alphaFeatureLoader).toBe(defaultFeatureLoader);
  });
});
