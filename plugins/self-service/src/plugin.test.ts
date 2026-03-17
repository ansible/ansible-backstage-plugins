import type { ApiFactory } from '@backstage/core-plugin-api';

const mockAAPApis = { api: 'AAPApis' } as unknown as ApiFactory<any, any, any>;
const mockAapAuthApi = { api: 'AapAuthApi' } as unknown as ApiFactory<
  any,
  any,
  any
>;
const mockRootRouteRef = { id: 'root-route-ref' };
const mockEeRouteRef = { id: 'ee-route-ref' };
const mockCollectionsRouteRef = { id: 'collections-route-ref' };
const mockGitRepositoriesRouteRef = { id: 'git-repositories-route-ref' };

// Mocks for local files (applied before module import)
jest.mock('./apis', () => ({
  AAPApis: mockAAPApis,
  AapAuthApi: mockAapAuthApi,
}));
jest.mock('./routes', () => ({
  rootRouteRef: mockRootRouteRef,
  eeRouteRef: mockEeRouteRef,
  collectionsRouteRef: mockCollectionsRouteRef,
  gitRepositoriesRouteRef: mockGitRepositoriesRouteRef,
}));

describe('self-service plugin module', () => {
  let createPluginMock: jest.Mock;
  let createRoutableExtensionMock: jest.Mock;
  let createComponentExtensionMock: jest.Mock;
  let SelfServicePage: any;
  let LocationListener: any;
  let EEPage: any;
  let EEBuilderSidebarItem: any;
  let CollectionsPage: any;
  let CollectionsSidebarItem: any;
  let GitRepositoriesPage: any;
  let GitRepositoriesSidebarItem: any;

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
      EEPage = mod.EEPage;
      EEBuilderSidebarItem = mod.EEBuilderSidebarItem;
      CollectionsPage = mod.CollectionsPage;
      CollectionsSidebarItem = mod.CollectionsSidebarItem;
      GitRepositoriesPage = mod.GitRepositoriesPage;
      GitRepositoriesSidebarItem = mod.GitRepositoriesSidebarItem;
    });
  });
  afterEach(() => {
    // clear the doMock we installed
    jest.dontMock('@backstage/core-plugin-api');
    jest.clearAllMocks();
  });

  it('calls createPlugin with expected id and apis', () => {
    expect(createPluginMock).toHaveBeenCalledTimes(1);
    const callArg = createPluginMock.mock.calls[0][0];
    expect(callArg).toHaveProperty('id', 'self-service');
    expect(callArg).toHaveProperty('apis');
    expect(Array.isArray(callArg.apis)).toBe(true);
    expect(callArg.apis).toContain(mockAAPApis);
    expect(callArg.apis).toContain(mockAapAuthApi);
    expect(callArg).toHaveProperty('routes');
    expect(callArg.routes).toHaveProperty('root', mockRootRouteRef);
    expect(callArg.routes).toHaveProperty('ee', mockEeRouteRef);
    expect(callArg.routes).toHaveProperty(
      'collections',
      mockCollectionsRouteRef,
    );
    expect(callArg.routes).toHaveProperty(
      'gitRepositories',
      mockGitRepositoriesRouteRef,
    );
  });

  it('exports SelfServicePage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(4);
    const created = createRoutableExtensionMock.mock.results[0].value;
    expect(SelfServicePage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[0][0];
    expect(calledWith).toHaveProperty('name', 'SelfServicePage');
    expect(calledWith).toHaveProperty('mountPoint', mockRootRouteRef);
  });

  it('exports EEPage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(4);
    const created = createRoutableExtensionMock.mock.results[1].value;
    expect(EEPage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[1][0];
    expect(calledWith).toHaveProperty('name', 'EEPage');
    expect(calledWith).toHaveProperty('mountPoint', mockEeRouteRef);
  });

  it('exports CollectionsPage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(4);
    const created = createRoutableExtensionMock.mock.results[2].value;
    expect(CollectionsPage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[2][0];
    expect(calledWith).toHaveProperty('name', 'CollectionsPage');
    expect(calledWith).toHaveProperty('mountPoint', mockCollectionsRouteRef);
  });

  it('exports GitRepositoriesPage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(4);
    const created = createRoutableExtensionMock.mock.results[3].value;
    expect(GitRepositoriesPage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[3][0];
    expect(calledWith).toHaveProperty('name', 'GitRepositoriesPage');
    expect(calledWith).toHaveProperty(
      'mountPoint',
      mockGitRepositoriesRouteRef,
    );
  });

  it('exports LocationListener as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(4);
    const created = createComponentExtensionMock.mock.results[0].value;
    expect(LocationListener).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[0][0];
    expect(calledWith).toHaveProperty('name', 'LocationListener');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('exports EEBuilderSidebarItem as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(4);
    const created = createComponentExtensionMock.mock.results[1].value;
    expect(EEBuilderSidebarItem).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[1][0];
    expect(calledWith).toHaveProperty('name', 'EEBuilderSidebarItem');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('exports CollectionsSidebarItem as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(4);
    const created = createComponentExtensionMock.mock.results[2].value;
    expect(CollectionsSidebarItem).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[2][0];
    expect(calledWith).toHaveProperty('name', 'CollectionsSidebarItem');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('exports GitRepositoriesSidebarItem as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(4);
    const created = createComponentExtensionMock.mock.results[3].value;
    expect(GitRepositoriesSidebarItem).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[3][0];
    expect(calledWith).toHaveProperty('name', 'GitRepositoriesSidebarItem');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });
});
