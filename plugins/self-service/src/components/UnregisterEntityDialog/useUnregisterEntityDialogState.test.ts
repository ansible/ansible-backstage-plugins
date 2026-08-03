import { renderHook } from '@testing-library/react';
import { Entity } from '@backstage/catalog-model';

const mockUseAsync = jest.fn();
jest.mock('react-use/esm/useAsync', () => ({
  __esModule: true,
  default: (...args: any[]) => mockUseAsync(...args),
}));

const mockCatalogApi = {
  getLocationByRef: jest.fn(),
  getEntities: jest.fn(),
  removeLocationById: jest.fn(),
  removeEntityByUid: jest.fn(),
};

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: () => mockCatalogApi,
}));

import { useUnregisterEntityDialogState } from './useUnregisterEntityDialogState';

const makeEntity = (
  name: string,
  overrides: Partial<Entity['metadata']> = {},
): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name,
    namespace: 'default',
    uid: `uid-${name}`,
    ...overrides,
  },
});

describe('useUnregisterEntityDialogState', () => {
  beforeEach(() => {
    mockCatalogApi.getLocationByRef.mockReset();
    mockCatalogApi.getEntities.mockReset();
    mockCatalogApi.removeLocationById.mockReset();
    mockCatalogApi.removeEntityByUid.mockReset();
    mockUseAsync.mockReturnValue({ loading: true, value: undefined });
  });

  it('returns bootstrap state and deleteEntity works', async () => {
    const entity = makeEntity('bs', {
      annotations: {
        'backstage.io/managed-by-origin-location': 'bootstrap:bootstrap',
      },
    });

    const { result } = renderHook(() => useUnregisterEntityDialogState(entity));

    expect(result.current.type).toBe('bootstrap');
    if (result.current.type === 'bootstrap') {
      expect(result.current.location).toBe('bootstrap:bootstrap');
      await result.current.deleteEntity();
      expect(mockCatalogApi.removeEntityByUid).toHaveBeenCalledWith('uid-bs');
    }
  });

  it('returns loading state when prerequisites are loading', () => {
    const entity = makeEntity('test', {
      annotations: {
        'backstage.io/managed-by-origin-location':
          'url:https://example.com/catalog.yaml',
      },
    });

    const { result } = renderHook(() => useUnregisterEntityDialogState(entity));

    expect(result.current.type).toBe('loading');
  });

  it('returns error state when prerequisites fail', () => {
    const apiError = new Error('API failure');
    mockUseAsync.mockReturnValue({
      loading: false,
      error: apiError,
      value: undefined,
    });

    const entity = makeEntity('test', {
      annotations: {
        'backstage.io/managed-by-origin-location':
          'url:https://example.com/catalog.yaml',
      },
    });

    const { result } = renderHook(() => useUnregisterEntityDialogState(entity));

    expect(result.current.type).toBe('error');
    if (result.current.type === 'error') {
      expect(result.current.error).toBe(apiError);
    }
  });

  it('returns unregister state with colocated entities and callbacks', async () => {
    mockUseAsync.mockReturnValue({
      loading: false,
      value: {
        location: { id: 'loc-1', type: 'url', target: 'https://example.com' },
        colocatedEntities: [makeEntity('colocated')],
      },
    });

    const entity = makeEntity('test', {
      annotations: {
        'backstage.io/managed-by-origin-location':
          'url:https://example.com/catalog.yaml',
      },
    });

    const { result } = renderHook(() => useUnregisterEntityDialogState(entity));

    expect(result.current.type).toBe('unregister');
    if (result.current.type === 'unregister') {
      expect(result.current.location).toBe(
        'url:https://example.com/catalog.yaml',
      );
      expect(result.current.colocatedEntities).toHaveLength(1);
      await result.current.unregisterLocation();
      expect(mockCatalogApi.removeLocationById).toHaveBeenCalledWith('loc-1');
    }
  });

  it('returns only-delete state when no location is found', () => {
    mockUseAsync.mockReturnValue({
      loading: false,
      value: { location: undefined, colocatedEntities: [] },
    });

    const entity = makeEntity('test', {
      annotations: {
        'backstage.io/managed-by-origin-location':
          'url:https://example.com/catalog.yaml',
      },
    });

    const { result } = renderHook(() => useUnregisterEntityDialogState(entity));

    expect(result.current.type).toBe('only-delete');
  });

  it('resolves empty colocated entities when entity has no locationRef', async () => {
    let capturedFn: (() => Promise<any>) | null = null;
    mockUseAsync.mockImplementation((fn: () => Promise<any>) => {
      capturedFn = fn;
      return {
        loading: false,
        value: { location: undefined, colocatedEntities: [] },
      };
    });

    const entity = makeEntity('no-loc', { annotations: {} });
    renderHook(() => useUnregisterEntityDialogState(entity));

    expect(capturedFn).toBeTruthy();
    const asyncResult = await capturedFn!();
    expect(asyncResult.location).toBeUndefined();
    expect(asyncResult.colocatedEntities).toEqual([]);
  });

  it('returns only-delete when entity has no location annotation', () => {
    mockUseAsync.mockReturnValue({
      loading: false,
      value: { location: undefined, colocatedEntities: [] },
    });

    const entity = makeEntity('test', { annotations: {} });

    const { result } = renderHook(() => useUnregisterEntityDialogState(entity));

    expect(result.current.type).toBe('only-delete');
  });
});
