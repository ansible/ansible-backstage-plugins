import { jest } from '@jest/globals';

describe('AAPService', () => {
  let createServiceRefMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    createServiceRefMock = jest.fn((opts: any) => {
      return { __isRef: true, ...opts };
    });

    jest.doMock('@backstage/backend-plugin-api', () => ({
      createServiceRef: createServiceRefMock,
    }));
  });

  it('exports a service ref with expected id and scope and no defaultFactory', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./AAPService');
    const { ansibleServiceRef } = mod as any;

    expect(ansibleServiceRef).toBeDefined();
    expect(ansibleServiceRef.id).toBe('rhaap.client.service');
    expect(ansibleServiceRef.scope).toBe('plugin');
    expect(ansibleServiceRef.defaultFactory).toBeUndefined();

    expect(createServiceRefMock).toHaveBeenCalledTimes(1);
    expect(createServiceRefMock).toHaveBeenCalledWith({
      id: 'rhaap.client.service',
      scope: 'plugin',
    });
  });
});
