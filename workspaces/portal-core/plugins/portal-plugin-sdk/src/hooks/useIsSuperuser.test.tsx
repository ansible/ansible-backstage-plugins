import { act, renderHook } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { identityApiRef } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import type { ReactNode } from 'react';
import { clearSuperuserCache, useIsSuperuser } from './useIsSuperuser';

describe('SDK superuser status', () => {
  const identity = { getBackstageIdentity: jest.fn() };
  const catalog = { getEntityByRef: jest.fn() };
  const entity = (annotation?: string) => ({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      name: 'alice',
      annotations:
        annotation === undefined
          ? {}
          : { 'aap.platform/is_superuser': annotation },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider
      apis={[
        [identityApiRef, identity],
        [catalogApiRef, catalog],
      ]}
    >
      {children}
    </TestApiProvider>
  );
  const flush = async (ms = 0) => {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  };

  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    jest.clearAllMocks();
    clearSuperuserCache();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    identity.getBackstageIdentity.mockResolvedValue({
      userEntityRef: 'user:default/alice',
    });
    catalog.getEntityByRef.mockResolvedValue(entity('true'));
  });
  afterEach(() => {
    clearSuperuserCache();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each(['true', 'false', undefined, 'True'])(
    'grants superuser only for the exact true annotation (%s)',
    async annotation => {
      catalog.getEntityByRef.mockResolvedValue(entity(annotation));
      const { result } = renderHook(() => useIsSuperuser(), { wrapper });
      expect(result.current.loading).toBe(true);
      await flush();
      expect(result.current).toEqual({
        isSuperuser: annotation === 'true',
        loading: false,
        error: null,
      });
      expect(catalog.getEntityByRef).toHaveBeenCalledWith({
        kind: 'user',
        namespace: 'default',
        name: 'alice',
      });
    },
  );

  it('reuses the current user cache but never shares it with another user', async () => {
    const first = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    first.unmount();
    const second = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    expect(second.result.current.isSuperuser).toBe(true);
    expect(catalog.getEntityByRef).toHaveBeenCalledTimes(1);
    second.unmount();
    identity.getBackstageIdentity.mockResolvedValue({
      userEntityRef: 'user:default/bob',
    });
    catalog.getEntityByRef.mockResolvedValue(entity('false'));
    const third = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    expect(third.result.current.isSuperuser).toBe(false);
    expect(catalog.getEntityByRef).toHaveBeenCalledTimes(2);
  });

  it('refreshes an expired cache', async () => {
    const first = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    first.unmount();
    jest.setSystemTime(new Date('2026-01-01T12:06:00Z'));
    catalog.getEntityByRef.mockResolvedValue(entity('false'));
    const next = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    expect(next.result.current.isSuperuser).toBe(false);
    expect(catalog.getEntityByRef).toHaveBeenCalledTimes(2);
  });

  it('fails closed without querying catalog when identity has no user reference', async () => {
    identity.getBackstageIdentity.mockResolvedValue({ userEntityRef: '' });
    const { result } = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    expect(result.current).toEqual({
      isSuperuser: false,
      loading: false,
      error: null,
    });
    expect(catalog.getEntityByRef).not.toHaveBeenCalled();
  });

  it('retries a temporarily missing catalog user', async () => {
    catalog.getEntityByRef
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(entity('true'));
    const { result } = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    expect(result.current.loading).toBe(true);
    await flush(3000);
    expect(result.current.isSuperuser).toBe(true);
    expect(catalog.getEntityByRef).toHaveBeenCalledTimes(2);
  });

  it('returns non-superuser when catalog sync has not produced the user after retry', async () => {
    catalog.getEntityByRef.mockResolvedValue(undefined);
    const { result } = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    await flush(3000);
    expect(result.current).toEqual({
      isSuperuser: false,
      loading: false,
      error: null,
    });
  });

  it('reports permanent catalog failures and redacts URLs from diagnostics', async () => {
    catalog.getEntityByRef.mockRejectedValue(
      new Error('Unavailable https://private.test/api?token=sample'),
    );
    const { result } = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    await flush(3000);
    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(
      'https://private.test',
    );
  });

  it('fails closed and finishes retrying an invalid catalog user reference', async () => {
    identity.getBackstageIdentity.mockResolvedValue({
      userEntityRef: 'user:default/',
    });
    const { result } = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    expect(result.current.loading).toBe(true);
    await flush(3000);
    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(catalog.getEntityByRef).not.toHaveBeenCalled();
  });

  it('handles a synchronous catalog adapter failure through the normal retry path', async () => {
    const error = new Error('Catalog adapter unavailable');
    catalog.getEntityByRef.mockImplementation(() => {
      throw error;
    });
    const { result } = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    await flush(3000);
    expect(catalog.getEntityByRef).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({
      isSuperuser: false,
      loading: false,
      error,
    });
  });

  it('normalizes non-Error identity failures', async () => {
    identity.getBackstageIdentity.mockRejectedValue('Unavailable');
    const { result } = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    expect(result.current.error?.message).toBe(
      'Failed to check superuser status',
    );
    expect(result.current.loading).toBe(false);
  });

  it('does not retry or update state after unmounting', async () => {
    catalog.getEntityByRef.mockRejectedValue(new Error('Temporary failure'));
    const { unmount } = renderHook(() => useIsSuperuser(), { wrapper });
    await flush();
    unmount();
    await flush(3000);
    expect(catalog.getEntityByRef).toHaveBeenCalledTimes(1);
  });
});
