import type { ApiFactory } from '@backstage/core-plugin-api';

const mockAAPApis = { api: 'AAPApis' } as unknown as ApiFactory<any, any, any>;
const mockAapAuthApi = { api: 'AapAuthApi' } as unknown as ApiFactory<
  any,
  any,
  any
>;
const mockEEBuildApis = { api: 'EEBuildApis' } as unknown as ApiFactory<
  any,
  any,
  any
>;
const mockRootRouteRef = { id: 'root-route-ref' };
const mockEeRouteRef = { id: 'ee-route-ref' };
const mockCollectionsRouteRef = { id: 'collections-route-ref' };
const mockGitRepositoriesRouteRef = { id: 'git-repositories-route-ref' };
const mockTemplatesRouteRef = { id: 'templates-route-ref' };
const mockHistoryRouteRef = { id: 'history-route-ref' };

// Mocks for local files (applied before module import)
jest.mock('./apis', () => ({
  AAPApis: mockAAPApis,
  AapAuthApi: mockAapAuthApi,
  EEBuildApis: mockEEBuildApis,
}));
jest.mock('./routes', () => ({
  rootRouteRef: mockRootRouteRef,
  eeRouteRef: mockEeRouteRef,
  collectionsRouteRef: mockCollectionsRouteRef,
  gitRepositoriesRouteRef: mockGitRepositoriesRouteRef,
  templatesRouteRef: mockTemplatesRouteRef,
  historyRouteRef: mockHistoryRouteRef,
}));

describe('self-service plugin module', () => {
  let createPluginMock: jest.Mock;
  let createRoutableExtensionMock: jest.Mock;
  let createComponentExtensionMock: jest.Mock;
  let SelfServicePage: any;
  let LocationListener: any;
  let AAPLogoutButton: any;
  let EEPage: any;
  let EEBuilderSidebarItem: any;
  let CollectionsPage: any;
  let CollectionsSidebarItem: any;
  let TemplatesPage: any;
  let HistoryPage: any;
  let GitRepositoriesPage: any;
  let GitRepositoriesSidebarItem: any;
  let TemplatesSidebarItem: any;
  let HistorySidebarItem: any;

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
      EEPage = mod.EEPage;
      EEBuilderSidebarItem = mod.EEBuilderSidebarItem;
      CollectionsPage = mod.CollectionsPage;
      TemplatesPage = mod.TemplatesPage;
      HistoryPage = mod.HistoryPage;
      CollectionsSidebarItem = mod.CollectionsSidebarItem;
      GitRepositoriesPage = mod.GitRepositoriesPage;
      GitRepositoriesSidebarItem = mod.GitRepositoriesSidebarItem;
      TemplatesSidebarItem = mod.TemplatesSidebarItem;
      HistorySidebarItem = mod.HistorySidebarItem;
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
    expect(callArg.apis).toContain(mockEEBuildApis);
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
    expect(callArg.routes).toHaveProperty('templates', mockTemplatesRouteRef);
    expect(callArg.routes).toHaveProperty('history', mockHistoryRouteRef);
  });

  it('exports SelfServicePage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(6);
    const created = createRoutableExtensionMock.mock.results[0].value;
    expect(SelfServicePage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[0][0];
    expect(calledWith).toHaveProperty('name', 'SelfServicePage');
    expect(calledWith).toHaveProperty('mountPoint', mockRootRouteRef);
  });

  it('exports EEPage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(6);
    const created = createRoutableExtensionMock.mock.results[1].value;
    expect(EEPage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[1][0];
    expect(calledWith).toHaveProperty('name', 'EEPage');
    expect(calledWith).toHaveProperty('mountPoint', mockEeRouteRef);
  });

  it('exports CollectionsPage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(6);
    const created = createRoutableExtensionMock.mock.results[2].value;
    expect(CollectionsPage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[2][0];
    expect(calledWith).toHaveProperty('name', 'CollectionsPage');
    expect(calledWith).toHaveProperty('mountPoint', mockCollectionsRouteRef);
  });

  it('exports TemplatesPage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(6);
    const created = createRoutableExtensionMock.mock.results[3].value;
    expect(TemplatesPage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[3][0];
    expect(calledWith).toHaveProperty('name', 'TemplatesPage');
    expect(calledWith).toHaveProperty('mountPoint', mockTemplatesRouteRef);
  });

  it('exports HistoryPage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(6);
    const created = createRoutableExtensionMock.mock.results[4].value;
    expect(HistoryPage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[4][0];
    expect(calledWith).toHaveProperty('name', 'HistoryPage');
    expect(calledWith).toHaveProperty('mountPoint', mockHistoryRouteRef);
  });

  it('exports GitRepositoriesPage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(6);
    const created = createRoutableExtensionMock.mock.results[5].value;
    expect(GitRepositoriesPage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[5][0];
    expect(calledWith).toHaveProperty('name', 'GitRepositoriesPage');
    expect(calledWith).toHaveProperty(
      'mountPoint',
      mockGitRepositoriesRouteRef,
    );
  });

  it('exports LocationListener as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(7);
    const created = createComponentExtensionMock.mock.results[0].value;
    expect(LocationListener).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[0][0];
    expect(calledWith).toHaveProperty('name', 'LocationListener');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('exports AAPLogoutButton as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(7);
    const created = createComponentExtensionMock.mock.results[1].value;
    expect(AAPLogoutButton).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[1][0];
    expect(calledWith).toHaveProperty('name', 'AAPLogoutButton');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('exports EEBuilderSidebarItem as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(7);
    const created = createComponentExtensionMock.mock.results[2].value;
    expect(EEBuilderSidebarItem).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[2][0];
    expect(calledWith).toHaveProperty('name', 'EEBuilderSidebarItem');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('exports CollectionsSidebarItem as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(7);
    const created = createComponentExtensionMock.mock.results[3].value;
    expect(CollectionsSidebarItem).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[3][0];
    expect(calledWith).toHaveProperty('name', 'CollectionsSidebarItem');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('exports GitRepositoriesSidebarItem as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(7);
    const created = createComponentExtensionMock.mock.results[4].value;
    expect(GitRepositoriesSidebarItem).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[4][0];
    expect(calledWith).toHaveProperty('name', 'GitRepositoriesSidebarItem');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('exports TemplatesSidebarItem as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(7);
    const created = createComponentExtensionMock.mock.results[5].value;
    expect(TemplatesSidebarItem).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[5][0];
    expect(calledWith).toHaveProperty('name', 'TemplatesSidebarItem');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('exports HistorySidebarItem as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(7);
    const created = createComponentExtensionMock.mock.results[6].value;
    expect(HistorySidebarItem).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[6][0];
    expect(calledWith).toHaveProperty('name', 'HistorySidebarItem');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });
});
