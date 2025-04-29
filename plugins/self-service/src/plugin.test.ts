import { selfServicePlugin } from './plugin';

describe('self-service', () => {
  it('should export plugin', () => {
    expect(selfServicePlugin).toBeDefined();
  });
});
