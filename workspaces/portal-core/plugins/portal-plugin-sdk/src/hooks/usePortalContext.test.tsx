import { renderHook, waitFor } from '@testing-library/react';
import { usePortalContext } from './usePortalContext';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import type { ReactNode } from 'react';

describe('host-resolved Portal context', () => {
  const fetch = jest.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider
      apis={[
        [discoveryApiRef, { getBaseUrl: async () => '/api/portal-operations' }],
        [fetchApiRef, { fetch }],
      ]}
    >
      {children}
    </TestApiProvider>
  );
  beforeEach(() => {
    jest.resetAllMocks();
  });
  it('does not interpret default namespace as an AAP organization', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        userEntityRef: 'user:default/aap-user-42',
        organizationIds: ['engineering', 'finance'],
      }),
    });
    const { result } = renderHook(() => usePortalContext(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.organizationIds).toEqual(['engineering', 'finance']);
    expect(result.current.organizationId).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith('/api/portal-operations/context');
  });
  it('preserves a single unambiguous organization', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        userEntityRef: 'user:default/alice',
        organizationId: 'engineering',
      }),
    });
    const { result } = renderHook(() => usePortalContext(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.organizationIds).toEqual(['engineering']);
    expect(result.current.organizationId).toBe('engineering');
  });
  it('fails closed instead of falling back to default on auth errors', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401 });
    const { result } = renderHook(() => usePortalContext(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.organizationIds).toEqual([]);
    expect(result.current.organizationId).toBeUndefined();
    expect(result.current.error).toBeInstanceOf(Error);
  });
  it('rejects malformed membership data', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        userEntityRef: 'user:default/alice',
        organizationIds: [42],
      }),
    });
    const { result } = renderHook(() => usePortalContext(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe(
      'Invalid Portal organization context',
    );
    expect(result.current.organizationIds).toEqual([]);
  });
});
