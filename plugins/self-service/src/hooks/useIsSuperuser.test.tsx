import { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { identityApiRef } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useIsSuperuser, clearSuperuserCache } from './useIsSuperuser';

const mockIdentityApi = {
  getBackstageIdentity: jest.fn(),
};

const mockCatalogApi = {
  getEntityByRef: jest.fn(),
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <TestApiProvider
    apis={[
      [identityApiRef, mockIdentityApi],
      [catalogApiRef, mockCatalogApi],
    ]}
  >
    {children}
  </TestApiProvider>
);

describe('useIsSuperuser', () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    clearSuperuserCache();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    consoleWarnSpy.mockRestore();
  });

  it('returns isSuperuser true when user has superuser annotation', async () => {
    mockIdentityApi.getBackstageIdentity.mockResolvedValue({
      userEntityRef: 'user:default/testuser',
    });
    mockCatalogApi.getEntityByRef.mockResolvedValue({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'User',
      metadata: {
        name: 'testuser',
        annotations: {
          'aap.platform/is_superuser': 'true',
        },
      },
    });

    const { result } = renderHook(() => useIsSuperuser(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isSuperuser).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('returns isSuperuser false when user does not have superuser annotation', async () => {
    mockIdentityApi.getBackstageIdentity.mockResolvedValue({
      userEntityRef: 'user:default/testuser',
    });
    mockCatalogApi.getEntityByRef.mockResolvedValue({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'User',
      metadata: {
        name: 'testuser',
        annotations: {
          'aap.platform/is_superuser': 'false',
        },
      },
    });

    const { result } = renderHook(() => useIsSuperuser(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns isSuperuser false when annotation is missing', async () => {
    mockIdentityApi.getBackstageIdentity.mockResolvedValue({
      userEntityRef: 'user:default/testuser',
    });
    mockCatalogApi.getEntityByRef.mockResolvedValue({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'User',
      metadata: {
        name: 'testuser',
        annotations: {},
      },
    });

    const { result } = renderHook(() => useIsSuperuser(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns isSuperuser false when user entity is not found', async () => {
    mockIdentityApi.getBackstageIdentity.mockResolvedValue({
      userEntityRef: 'user:default/testuser',
    });
    mockCatalogApi.getEntityByRef.mockResolvedValue(undefined);

    const { result } = renderHook(() => useIsSuperuser(), { wrapper });

    jest.advanceTimersByTime(0);

    await waitFor(() => {
      expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledTimes(1);
    });

    jest.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledTimes(2);
    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns isSuperuser false when no userEntityRef', async () => {
    mockIdentityApi.getBackstageIdentity.mockResolvedValue({
      userEntityRef: undefined,
    });

    const { result } = renderHook(() => useIsSuperuser(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns error when identity fetch fails', async () => {
    mockIdentityApi.getBackstageIdentity.mockRejectedValue(
      new Error('Identity fetch failed'),
    );

    const { result } = renderHook(() => useIsSuperuser(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.error).toEqual(new Error('Identity fetch failed'));
  });

  it('returns error when catalog fetch fails after retry', async () => {
    mockIdentityApi.getBackstageIdentity.mockResolvedValue({
      userEntityRef: 'user:default/testuser',
    });
    mockCatalogApi.getEntityByRef.mockRejectedValue(
      new Error('Catalog fetch failed'),
    );

    const { result } = renderHook(() => useIsSuperuser(), { wrapper });

    // First attempt fails, triggers retry timer
    await waitFor(() => {
      expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledTimes(1);
    });

    // Advance past the retry delay
    jest.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.error).toEqual(new Error('Catalog fetch failed'));
    expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledTimes(2);
  });

  it('logs a warning when catalog fetch fails', async () => {
    mockIdentityApi.getBackstageIdentity.mockResolvedValue({
      userEntityRef: 'user:default/testuser',
    });
    mockCatalogApi.getEntityByRef.mockRejectedValue(
      new Error('Catalog fetch failed'),
    );

    renderHook(() => useIsSuperuser(), { wrapper });

    // First attempt
    await waitFor(() => {
      expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledTimes(1);
    });

    // Retry warning after first attempt
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Attempt 1 failed, retrying'),
      'Catalog fetch failed',
    );

    jest.advanceTimersByTime(3000);

    // Final failure warning after retry
    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to check superuser status'),
        'Catalog fetch failed',
      );
    });
  });

  it('logs a warning when user entity is not found in catalog', async () => {
    mockIdentityApi.getBackstageIdentity.mockResolvedValue({
      userEntityRef: 'user:default/testuser',
    });
    mockCatalogApi.getEntityByRef.mockResolvedValue(undefined);

    const { result } = renderHook(() => useIsSuperuser(), { wrapper });

    jest.advanceTimersByTime(0);

    await waitFor(() => {
      expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledTimes(1);
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not found, retrying'),
      'Entity not found',
    );

    jest.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isSuperuser).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('User entity not found in catalog'),
    );
  });

  it('succeeds on retry when first attempt fails', async () => {
    mockIdentityApi.getBackstageIdentity.mockResolvedValue({
      userEntityRef: 'user:default/testuser',
    });
    mockCatalogApi.getEntityByRef
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: 'testuser',
          annotations: {
            'aap.platform/is_superuser': 'true',
          },
        },
      });

    const { result } = renderHook(() => useIsSuperuser(), { wrapper });

    // First attempt fails
    await waitFor(() => {
      expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledTimes(1);
    });

    // Advance past the retry delay
    jest.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isSuperuser).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledTimes(2);
  });

  it('starts with loading true', () => {
    mockIdentityApi.getBackstageIdentity.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useIsSuperuser(), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('uses cached value on subsequent renders for same user', async () => {
    mockIdentityApi.getBackstageIdentity.mockResolvedValue({
      userEntityRef: 'user:default/testuser',
    });
    mockCatalogApi.getEntityByRef.mockResolvedValue({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'User',
      metadata: {
        name: 'testuser',
        annotations: {
          'aap.platform/is_superuser': 'true',
        },
      },
    });

    // First render - populates cache
    const { result: result1, unmount } = renderHook(() => useIsSuperuser(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result1.current.loading).toBe(false);
    });

    expect(result1.current.isSuperuser).toBe(true);
    expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledTimes(1);

    unmount();

    // Second render - should use cached value
    const { result: result2 } = renderHook(() => useIsSuperuser(), { wrapper });

    await waitFor(() => {
      expect(result2.current.loading).toBe(false);
    });

    expect(result2.current.isSuperuser).toBe(true);
    // Should not make additional API calls - cache is used
    expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledTimes(1);
  });
});
