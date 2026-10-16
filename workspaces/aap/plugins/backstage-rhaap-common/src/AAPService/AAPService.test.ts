import { jest } from '@jest/globals';

describe('AAPService', () => {
  let createServiceRefMock: jest.Mock;
  let createServiceFactoryMock: jest.Mock;
  let coreServicesMock: any;
  let AAPClientMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Create mocks
    createServiceRefMock = jest.fn((opts: any) => {
      // return an object representing the ref so we can assert it later
      return { __isRef: true, ...opts };
    });

    // createServiceFactory should accept an object { service, deps, factory }
    // and return a representation containing those items. We'll call the factory
    // with mocked deps when building the return value, so tests can verify the AAPClient was created.
    createServiceFactoryMock = jest.fn(
      async ({ service, deps, factory }: any) => {
        // call the provided factory function with fake deps to produce the concrete service
        const produced = await factory({
          rootConfig: 'fake-root-config',
          logger: { info: jest.fn() },
        });
        return { created: true, service, deps, produced };
      },
    );

    // coreServices stub used in defaultFactory
    coreServicesMock = {
      rootConfig: 'core-root-config',
      logger: 'core-logger',
    };

    // Mock the AAPClient class to capture constructor args and return a sentinel object
    AAPClientMock = jest.fn(function mockAAPClient(this: any, opts: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).opts = opts;
      return { __isAAPClient: true, ...opts };
    });

    // Now mock the backend-plugin-api module BEFORE requiring the module under test
    jest.doMock('@backstage/backend-plugin-api', () => ({
      createServiceRef: createServiceRefMock,
      createServiceFactory: createServiceFactoryMock,
      coreServices: coreServicesMock,
      // export other items if code imports them elsewhere — not needed here
    }));

    // And mock the AAPClient module path used by the module under test
    jest.doMock('../AAPClient/AAPClient', () => ({
      AAPClient: AAPClientMock,
    }));
  });

  it('exports a service ref with expected id and scope and wires defaultFactory through createServiceFactory', async () => {
    // Require the module after mocks are set up
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./AAPService'); // adjust path if file name differs
    const { ansibleServiceRef } = mod as any;

    // Basic shape asserted from our createServiceRefMock return value
    expect(ansibleServiceRef).toBeDefined();
    expect(ansibleServiceRef.id).toBe('rhaap.client.service');
    expect(ansibleServiceRef.scope).toBe('plugin');

    // defaultFactory should be a function (as defined in the original module)
    expect(typeof ansibleServiceRef.defaultFactory).toBe('function');

    // Call defaultFactory with a fake 'service' object; it should call createServiceFactoryMock
    const fakeService = { some: 'service' };
    const result = await ansibleServiceRef.defaultFactory(fakeService);
    // our createServiceFactoryMock returns an object { created, service, deps, produced }
    expect(createServiceFactoryMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('created', true);
    expect(result.service).toBe(fakeService);

    // deps passed into createServiceFactory should reference coreServices rootConfig & logger
    expect(result.deps).toHaveProperty(
      'rootConfig',
      coreServicesMock.rootConfig,
    );
    expect(result.deps).toHaveProperty('logger', coreServicesMock.logger);

    // produced should be the object returned by the AAPClientMock constructor
    expect(result.produced).toBeDefined();
    expect(result.produced.__isAAPClient).toBe(true);
    // Verify AAPClient received the rootConfig and logger passed from factory
    expect(AAPClientMock).toHaveBeenCalledTimes(1);
    const ctorArg = (AAPClientMock as jest.Mock).mock.calls[0][0];
    expect(ctorArg).toHaveProperty('rootConfig', 'fake-root-config');
    expect(ctorArg).toHaveProperty('logger');
  });

  it('calls the inner factory and returns the produced service even when factory is async', async () => {
    const mod = require('./AAPService'); // ensure fresh require
    const { ansibleServiceRef } = mod as any;

    // override createServiceFactoryMock implementation to simulate async behavior
    createServiceFactoryMock.mockImplementationOnce(
      async ({ factory }: any) => {
        // simulate some async work then call factory
        await Promise.resolve();
        const produced = await factory({
          rootConfig: 'async-root',
          logger: { info: jest.fn() },
        });
        return { created: true, produced };
      },
    );

    const res = await ansibleServiceRef.defaultFactory({ name: 'svc' });
    expect(res.created).toBe(true);
    expect(res.produced.__isAAPClient).toBe(true);
    // AAPClient constructed with our async rootConfig
    const ctorArg = (AAPClientMock as jest.Mock).mock.calls.slice(-1)[0][0] as {
      rootConfig: string;
      logger: any;
    };
    expect(ctorArg.rootConfig).toBe('async-root');
  });
});
