import { jest } from '@jest/globals';

describe('AAPService', () => {
  let createServiceFactoryMock: jest.Mock;
  let coreServicesMock: any;
  let AAPClientMock: jest.Mock;
  let ansibleServiceRefMock: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    ansibleServiceRefMock = {
      __isRef: true,
      id: 'rhaap.client.service',
      scope: 'plugin',
    };

    createServiceFactoryMock = jest.fn(({ service, deps, factory }: any) => {
      return { created: true, service, deps, factory };
    });

    coreServicesMock = {
      rootConfig: 'core-root-config',
      logger: 'core-logger',
    };

    AAPClientMock = jest.fn(function mockAAPClient(this: any, opts: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).opts = opts;
      return { __isAAPClient: true, ...opts };
    });

    jest.doMock('@backstage/backend-plugin-api', () => ({
      createServiceFactory: createServiceFactoryMock,
      coreServices: coreServicesMock,
    }));

    jest.doMock('@ansible/aap-node', () => ({
      ansibleServiceRef: ansibleServiceRefMock,
    }));

    jest.doMock('../AAPClient/AAPClient', () => ({
      AAPClient: AAPClientMock,
    }));
  });

  it('re-exports ansibleServiceRef without defaultFactory and exports ansibleServiceFactory', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./AAPService');
    const { ansibleServiceRef, ansibleServiceFactory } = mod as any;

    expect(ansibleServiceRef).toBe(ansibleServiceRefMock);
    expect(ansibleServiceRef.id).toBe('rhaap.client.service');
    expect(ansibleServiceRef.scope).toBe('plugin');
    expect(ansibleServiceRef.defaultFactory).toBeUndefined();

    expect(createServiceFactoryMock).toHaveBeenCalledTimes(1);
    expect(ansibleServiceFactory).toHaveProperty('created', true);
    expect(ansibleServiceFactory.service).toBe(ansibleServiceRefMock);
    expect(ansibleServiceFactory.deps).toHaveProperty(
      'rootConfig',
      coreServicesMock.rootConfig,
    );
    expect(ansibleServiceFactory.deps).toHaveProperty(
      'logger',
      coreServicesMock.logger,
    );

    const produced = await ansibleServiceFactory.factory({
      rootConfig: 'fake-root-config',
      logger: { info: jest.fn() },
    });
    expect(produced.__isAAPClient).toBe(true);
    expect(AAPClientMock).toHaveBeenCalledTimes(1);
    const ctorArg = (AAPClientMock as jest.Mock).mock.calls[0][0];
    expect(ctorArg).toHaveProperty('rootConfig', 'fake-root-config');
    expect(ctorArg).toHaveProperty('logger');
  });
});
