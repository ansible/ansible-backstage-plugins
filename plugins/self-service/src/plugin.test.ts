import type { ApiFactory } from '@backstage/core-plugin-api';

const mockAAPApis = { api: 'AAPApis' } as unknown as ApiFactory<any, any, any>;
const mockAapAuthApi = { api: 'AapAuthApi' } as unknown as ApiFactory<
  any,
  any,
  any
>;
const mockRootRouteRef = { id: 'root-route-ref' };

// Mocks for local files (applied before module import)
jest.mock('./apis', () => ({
  AAPApis: mockAAPApis,
  AapAuthApi: mockAapAuthApi,
}));
jest.mock('./routes', () => ({
  rootRouteRef: mockRootRouteRef,
}));

describe('self-service plugin module', () => {
  let createPluginMock: jest.Mock;
  let createRoutableExtensionMock: jest.Mock;
  let createComponentExtensionMock: jest.Mock;
  let SelfServicePage: any;
  let LocationListener: any;
  let AAPLogoutButton: any;

  beforeEach(() => {
    jest.resetModules();

    createPluginMock = jest.fn((opts: any) => ({
      ...opts,
      provide: (ext: any) => ext,
    }));
    createRoutableExtensionMock = jest.fn((opts: any) => ({
      __routableExt: true,
      ...opts,
    }));
    createComponentExtensionMock = jest.fn((opts: any) => ({
      __componentExt: true,
      ...opts,
    }));

    jest.doMock('@backstage/core-plugin-api', () => ({
      createPlugin: createPluginMock,
      createRoutableExtension: createRoutableExtensionMock,
      createComponentExtension: createComponentExtensionMock,
      createApiFactory: (x: any) => x,
    }));

    jest.isolateModules(() => {
      const mod = require('./plugin');
      SelfServicePage = mod.SelfServicePage;
      LocationListener = mod.LocationListener;
      AAPLogoutButton = mod.AAPLogoutButton;
    });
  });
  afterEach(() => {
    // clear the doMock we installed
    jest.dontMock('@backstage/core-plugin-api');
    jest.clearAllMocks();
  });

  it('calls createPlugin with expected id and apis', () => {
    // createPlugin should have been called once with the plugin options
    expect(createPluginMock).toHaveBeenCalledTimes(1);
    const callArg = createPluginMock.mock.calls[0][0];
    expect(callArg).toHaveProperty('id', 'self-service');
    expect(callArg).toHaveProperty('apis');
    expect(Array.isArray(callArg.apis)).toBe(true);
    expect(callArg.apis).toContain(mockAAPApis);
    expect(callArg.apis).toContain(mockAapAuthApi);
    expect(callArg).toHaveProperty('routes');
    expect(callArg.routes).toHaveProperty('root', mockRootRouteRef);
  });

  it('exports SelfServicePage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(1);
    const created = createRoutableExtensionMock.mock.results[0].value;
    expect(SelfServicePage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[0][0];
    expect(calledWith).toHaveProperty('name', 'SelfServicePage');
    expect(calledWith).toHaveProperty('mountPoint', mockRootRouteRef);
  });

  it('exports LocationListener as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(2);
    const created = createComponentExtensionMock.mock.results[0].value;
    expect(LocationListener).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[0][0];
    expect(calledWith).toHaveProperty('name', 'LocationListener');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('exports AAPLogoutButton as the value returned by createComponentExtension', () => {
    const created = createComponentExtensionMock.mock.results[1].value;
    expect(AAPLogoutButton).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[1][0];
    expect(calledWith).toHaveProperty('name', 'AAPLogoutButton');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });
});
