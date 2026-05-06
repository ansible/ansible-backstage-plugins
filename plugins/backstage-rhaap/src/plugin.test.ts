/*
 * Copyright 2024 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const mockRootRouteRef = { id: 'root-route-ref' };

jest.mock('./routes', () => ({
  rootRouteRef: mockRootRouteRef,
}));

describe('ansible plugin module', () => {
  let createPluginMock: jest.Mock;
  let createRoutableExtensionMock: jest.Mock;
  let createComponentExtensionMock: jest.Mock;
  let ansiblePlugin: any;
  let AnsiblePage: any;
  let AppThemeFixer: any;

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
    }));

    jest.isolateModules(() => {
      const mod = require('./plugin');
      ansiblePlugin = mod.ansiblePlugin;
      AnsiblePage = mod.AnsiblePage;
      AppThemeFixer = mod.AppThemeFixer;
    });
  });

  afterEach(() => {
    jest.dontMock('@backstage/core-plugin-api');
    jest.clearAllMocks();
  });

  it('calls createPlugin with expected id and routes', () => {
    expect(createPluginMock).toHaveBeenCalledTimes(1);
    const callArg = createPluginMock.mock.calls[0][0];
    expect(callArg).toHaveProperty('id', 'ansible');
    expect(callArg).toHaveProperty('routes');
    expect(callArg.routes).toHaveProperty('root', mockRootRouteRef);
  });

  it('exports ansiblePlugin', () => {
    expect(ansiblePlugin).toBeDefined();
  });

  it('exports AnsiblePage as the value returned by createRoutableExtension', () => {
    expect(createRoutableExtensionMock).toHaveBeenCalledTimes(1);
    const created = createRoutableExtensionMock.mock.results[0].value;
    expect(AnsiblePage).toBe(created);
    const calledWith = createRoutableExtensionMock.mock.calls[0][0];
    expect(calledWith).toHaveProperty('name', 'AnsiblePage');
    expect(calledWith).toHaveProperty('mountPoint', mockRootRouteRef);
  });

  it('exports AppThemeFixer as the value returned by createComponentExtension', () => {
    expect(createComponentExtensionMock).toHaveBeenCalledTimes(1);
    const created = createComponentExtensionMock.mock.results[0].value;
    expect(AppThemeFixer).toBe(created);
    const calledWith = createComponentExtensionMock.mock.calls[0][0];
    expect(calledWith).toHaveProperty('name', 'AppThemeFixer');
    expect(calledWith.component).toHaveProperty('lazy');
    expect(typeof calledWith.component.lazy).toBe('function');
  });
});
