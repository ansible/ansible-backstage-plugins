import { render } from '@testing-library/react';
import {
  appTreeApiRef,
  coreExtensionData,
  useApi,
} from '@backstage/frontend-plugin-api';
import { GlobalHeader } from './GlobalHeader';
import { NativeGlobalHeader } from './NativeGlobalHeader';

jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useApi: jest.fn(),
}));
jest.mock('@backstage/core-compat-api', () => ({
  compatWrapper: (element: JSX.Element) => element,
}));
jest.mock('./GlobalHeader', () => ({
  GlobalHeader: jest.fn(() => <div>Global header</div>),
}));

describe('NativeGlobalHeader Templates destination metadata', () => {
  const getData = jest.fn();
  const loader = jest.fn();
  const getTree = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getData.mockReturnValue('/self-service');
    jest.mocked(useApi).mockReturnValue({ getTree });
  });

  function setPage({
    disabled = false,
    parent = 'app/routes',
    input = 'routes',
    detached = false,
    mounted = true,
  } = {}) {
    getTree.mockReturnValue({
      tree: {
        nodes: new Map([
          [
            'page:portal-scaffolder',
            {
              spec: { id: 'page:portal-scaffolder', disabled, loader },
              edges: {
                attachedTo: detached
                  ? undefined
                  : { node: { spec: { id: parent } }, input },
              },
              instance: mounted ? { getData } : undefined,
            },
          ],
        ]),
      },
    });
  }

  function expectCreatePath(path: string | undefined) {
    render(<NativeGlobalHeader />);
    expect(useApi).toHaveBeenCalledWith(appTreeApiRef);
    expect(GlobalHeader).toHaveBeenCalledWith(
      { createPath: path },
      expect.anything(),
    );
    expect(loader).not.toHaveBeenCalled();
  }

  it('omits Create when the Templates page is absent', () => {
    getTree.mockReturnValue({ tree: { nodes: new Map() } });
    expectCreatePath(undefined);
    expect(getData).not.toHaveBeenCalled();
  });

  it.each([
    ['disabled', { disabled: true }],
    ['detached', { detached: true }],
    ['attached to another parent', { parent: 'app' }],
    ['attached to another input', { input: 'elements' }],
    ['not instantiated', { mounted: false }],
  ])('omits Create when Templates is %s', (_name, options) => {
    setPage(options);
    expectCreatePath(undefined);
    expect(getData).not.toHaveBeenCalled();
  });

  it('uses the mounted Templates route without evaluating its loader', () => {
    setPage();
    expectCreatePath('/self-service');
    expect(getData).toHaveBeenCalledWith(coreExtensionData.routePath);
  });

  it('uses an overridden Templates route rather than a hardcoded destination', () => {
    setPage();
    getData.mockReturnValue('/renamed-templates');
    expectCreatePath('/renamed-templates');
    expect(getData).toHaveBeenCalledWith(coreExtensionData.routePath);
  });

  it('omits Create when an instantiated page has no route metadata', () => {
    setPage();
    getData.mockReturnValue(undefined);
    expectCreatePath(undefined);
    expect(getData).toHaveBeenCalledWith(coreExtensionData.routePath);
  });
});
