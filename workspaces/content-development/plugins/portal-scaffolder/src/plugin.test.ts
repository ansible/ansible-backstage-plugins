import type { ApiFactory } from '@backstage/core-plugin-api';

const mockAAPApis = { api: 'AAPApis' } as unknown as ApiFactory<any, any, any>;
const mockEEBuildApis = { api: 'EEBuildApis' } as unknown as ApiFactory<
  any,
  any,
  any
>;
const mockRootRouteRef = { id: 'root-route-ref' };
const mockEeRouteRef = { id: 'ee-route-ref' };
const mockTemplatesRouteRef = { id: 'templates-route-ref' };
const mockHistoryRouteRef = { id: 'history-route-ref' };

// Mocks for local files (applied before module import)
jest.mock('./apis', () => ({
  AAPApis: mockAAPApis,
  EEBuildApis: mockEEBuildApis,
}));
jest.mock('./routes', () => ({
  rootRouteRef: mockRootRouteRef,
  eeRouteRef: mockEeRouteRef,
  templatesRouteRef: mockTemplatesRouteRef,
  historyRouteRef: mockHistoryRouteRef,
}));

describe('self-service plugin module', () => {
  let createPluginMock: jest.Mock;
  let createRoutableExtensionMock: jest.Mock;
  let createComponentExtensionMock: jest.Mock;
  let SelfServicePage: any;
  let AppThemeFixer: any;
  let LocationListener: any;
  let EEPage: any;
  let EEBuilderSidebarItem: any;
  let TemplatesPage: any;
  let TemplatesSidebarItem: any;
  let HistoryPage: any;
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
      AppThemeFixer = mod.AppThemeFixer;
      LocationListener = mod.LocationListener;
      EEPage = mod.EEPage;
      EEBuilderSidebarItem = mod.EEBuilderSidebarItem;
      TemplatesPage = mod.TemplatesPage;
      TemplatesSidebarItem = mod.TemplatesSidebarItem;
      HistoryPage = mod.HistoryPage;
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
    expect(callArg).toHaveProperty('id', 'portal-scaffolder');
    expect(callArg).toHaveProperty('apis');
    expect(Array.isArray(callArg.apis)).toBe(true);
    expect(callArg.apis).toContain(mockAAPApis);
    expect(callArg.apis).toHaveLength(2);
    expect(callArg.apis).toContain(mockEEBuildApis);
    expect(callArg).toHaveProperty('routes');
    expect(callArg.routes).toHaveProperty('root', mockRootRouteRef);
    expect(callArg.routes).toHaveProperty('ee', mockEeRouteRef);
    expect(callArg.routes).toHaveProperty('templates', mockTemplatesRouteRef);
    expect(callArg.routes).toHaveProperty('history', mockHistoryRouteRef);
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

  it('exports TemplatesPage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(4);
    const created = createRoutableExtensionMock.mock.results[2].value;
    expect(TemplatesPage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[2][0];
    expect(calledWith).toHaveProperty('name', 'TemplatesPage');
    expect(calledWith).toHaveProperty('mountPoint', mockTemplatesRouteRef);
  });

  it('retains HistoryPage as a compatibility export', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(4);
    const extensionIndex = createRoutableExtensionMock.mock.calls.findIndex(
      ([options]) => options.name === 'HistoryPage',
    );
    const created =
      createRoutableExtensionMock.mock.results[extensionIndex].value;
    expect(HistoryPage).toBe(created);
    const calledWith =
      createRoutableExtensionMock.mock.calls[extensionIndex][0];
    expect(calledWith).toHaveProperty('name', 'HistoryPage');
    expect(calledWith).toHaveProperty('mountPoint', mockHistoryRouteRef);
  });

  it('exports LocationListener as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(5);
    const created = createComponentExtensionMock.mock.results[0].value;
    expect(LocationListener).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[0][0];
    expect(calledWith).toHaveProperty('name', 'LocationListener');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('exports EEBuilderSidebarItem as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(5);
    const created = createComponentExtensionMock.mock.results[2].value;
    expect(EEBuilderSidebarItem).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[2][0];
    expect(calledWith).toHaveProperty('name', 'EEBuilderSidebarItem');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('exports AppThemeFixer as the value returned by createComponentExtension', async () => {
    const MockAppThemeFixerComponent = () => null;
    jest.doMock('./components/AppThemeFixer', () => ({
      AppThemeFixer: MockAppThemeFixerComponent,
    }));

    expect(createComponentExtensionMock).toHaveBeenCalledTimes(5);
    const created = createComponentExtensionMock.mock.results[1].value;
    expect(AppThemeFixer).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[1][0];
    expect(calledWith).toHaveProperty('name', 'AppThemeFixer');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
    const component = await calledWith.component.lazy();
    expect(component).toBe(MockAppThemeFixerComponent);
  });

  it('exports TemplatesSidebarItem as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(5);
    const created = createComponentExtensionMock.mock.results[3].value;
    expect(TemplatesSidebarItem).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[3][0];
    expect(calledWith).toHaveProperty('name', 'TemplatesSidebarItem');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });

  it('retains HistorySidebarItem as a compatibility export', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(5);
    const created = createComponentExtensionMock.mock.results[4].value;
    expect(HistorySidebarItem).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[4][0];
    expect(calledWith).toHaveProperty('name', 'HistorySidebarItem');
    expect(calledWith.component).toHaveProperty('lazy');
  });
});
